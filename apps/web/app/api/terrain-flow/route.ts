import { NextResponse } from "next/server";
import proj4 from "proj4";

export const runtime = "nodejs";

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];
type Geometry = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };

const HEIGHT_SERVICE = "https://services.gugik.gov.pl/nmt/";
const OVERPASS_SERVICE = "https://overpass-api.de/api/interpreter";
const BUFFER_M = 50;
const WATERWAY_SEARCH_M = 1000;
const WATERWAY_MATCH_M = 150;
const TARGET_MAX_SAMPLES = 6000;
const MIN_SAMPLE_SPACING_M = 2;
const GRID_CACHE_VERSION = "grid-6000-2m-waterway-v1";
const LIST_BATCH_SIZE = 200;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>();

proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs",
);

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2
    && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && value[0] >= 14 && value[0] <= 24.5 && value[1] >= 49 && value[1] <= 55;
}

function parseGeometry(value: unknown): Geometry | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) return null;
  let vertexCount = 0;
  const parsed: Polygon[] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    const rings: Ring[] = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      const points: Ring = [];
      for (const point of ring) {
        if (!isPosition(point)) return null;
        points.push([point[0], point[1]]);
      }
      vertexCount += points.length;
      rings.push(points);
    }
    parsed.push(rings);
  }
  if (vertexCount > 100_000) return null;
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: parsed[0] }
    : { type: "MultiPolygon", coordinates: parsed };
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x: number, y: number, polygon: Polygon): boolean {
  return pointInRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(x, y, hole));
}

function pointInGeometry(x: number, y: number, geometry: Polygon[]): boolean {
  return geometry.some((polygon) => pointInPolygon(x, y, polygon));
}

type HeightPoint = { x: number; y: number; value: number | null };

async function fetchHeights(points: Array<{ x: number; y: number }>): Promise<number[]> {
  const chunks: Array<Array<{ x: number; y: number }>> = [];
  for (let i = 0; i < points.length; i += LIST_BATCH_SIZE) chunks.push(points.slice(i, i + LIST_BATCH_SIZE));
  const output = Array<number>(points.length).fill(Number.NaN);
  let nextChunk = 0;
  async function worker() {
    while (nextChunk < chunks.length) {
      const chunkIndex = nextChunk++;
      const chunk = chunks[chunkIndex];
      const url = new URL(HEIGHT_SERVICE);
      url.searchParams.set("request", "GetHByPointList");
      url.searchParams.set("list", chunk.map(({ x, y }) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(","));
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const text = (await response.text()).trim();
      if (!response.ok) throw new Error(`Usługa NMT zwróciła HTTP ${response.status}.`);
      const returned = text.split(",");
      const requestedIndexes = new Map(chunk.map((point, index) => [`${point.x.toFixed(2)}:${point.y.toFixed(2)}`, index]));
      for (const tuple of returned) {
        const match = /^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/.exec(tuple);
        if (!match) continue;
        const x = Number(match[1]);
        const y = Number(match[2]);
        const localIndex = requestedIndexes.get(`${x.toFixed(2)}:${y.toFixed(2)}`);
        const elevation = Number(match[3]);
        if (localIndex !== undefined && elevation >= -100 && elevation <= 3000) {
          output[chunkIndex * LIST_BATCH_SIZE + localIndex] = elevation;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker));
  return output;
}

type HeapEntry = { index: number; height: number; order: number };
type Waterway = { id: number; name: string | null; type: string; coordinates: Position[] };

function pointSegmentDistance(point: Position, start: Position, end: Position): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function orientation(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const epsilon = 1e-8;
  const onSegment = (start: Position, end: Position, point: Position) =>
    point[0] >= Math.min(start[0], end[0]) - epsilon && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon && point[1] <= Math.max(start[1], end[1]) + epsilon;
  if (Math.abs(abC) <= epsilon && onSegment(a, b, c)) return true;
  if (Math.abs(abD) <= epsilon && onSegment(a, b, d)) return true;
  if (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) return true;
  if (Math.abs(cdB) <= epsilon && onSegment(c, d, b)) return true;
  return ((abC < 0 && abD > 0) || (abC > 0 && abD < 0))
    && ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0));
}

function segmentDistance(a: Position, b: Position, c: Position, d: Position): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b),
  );
}

function distanceToNetwork(point: Position, waterways: Waterway[]): { distanceM: number; waterway: Waterway } | null {
  let nearest: { distanceM: number; waterway: Waterway } | null = null;
  for (const waterway of waterways) for (let i = 1; i < waterway.coordinates.length; i += 1) {
    const distanceM = pointSegmentDistance(point, waterway.coordinates[i - 1], waterway.coordinates[i]);
    if (!nearest || distanceM < nearest.distanceM) nearest = { distanceM, waterway };
  }
  return nearest;
}

async function fetchWaterways(bounds: { minX: number; minY: number; maxX: number; maxY: number }): Promise<Waterway[]> {
  const corners: Position[] = [
    [bounds.minX - WATERWAY_SEARCH_M, bounds.minY - WATERWAY_SEARCH_M],
    [bounds.minX - WATERWAY_SEARCH_M, bounds.maxY + WATERWAY_SEARCH_M],
    [bounds.maxX + WATERWAY_SEARCH_M, bounds.minY - WATERWAY_SEARCH_M],
    [bounds.maxX + WATERWAY_SEARCH_M, bounds.maxY + WATERWAY_SEARCH_M],
  ].map(([x, y]) => proj4("EPSG:2180", "EPSG:4326", [x, y]) as Position);
  const south = Math.min(...corners.map(([, lat]) => lat));
  const north = Math.max(...corners.map(([, lat]) => lat));
  const west = Math.min(...corners.map(([lng]) => lng));
  const east = Math.max(...corners.map(([lng]) => lng));
  const query = `[out:json][timeout:12];way["waterway"~"^(river|stream|canal|ditch|drain)$"](${south},${west},${north},${east});out geom;`;
  const response = await fetch(OVERPASS_SERVICE, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
      "User-Agent": "Ziemowit/1.0 (+https://github.com/mateusz-kurowski/HackNation-2026-proj2)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenStreetMap zwrócił HTTP ${response.status}.`);
  const payload = await response.json() as { elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lon?: number; lat?: number }> }> };
  return (payload.elements ?? []).flatMap((element) => {
    if (element.type !== "way" || !Number.isFinite(element.id) || !Array.isArray(element.geometry)) return [];
    const coordinates = element.geometry.flatMap(({ lon, lat }) => typeof lon === "number" && Number.isFinite(lon) && typeof lat === "number" && Number.isFinite(lat)
      ? [proj4("EPSG:4326", "EPSG:2180", [lon, lat]) as Position]
      : []);
    if (coordinates.length < 2) return [];
    return [{
      id: element.id!,
      name: element.tags?.name ?? null,
      type: element.tags?.waterway ?? "unknown",
      coordinates,
    }];
  });
}

function analyzeWaterways(
  waterways: Waterway[],
  polygons: Polygon[],
  outflowPoints: Array<{ lat: number; lng: number; direction: string; estimatedContributingAreaM2: number }>,
) {
  const rings = polygons.flatMap((polygon) => polygon);
  const nearestToParcel = waterways.map((waterway) => {
    let distanceM = Number.POSITIVE_INFINITY;
    for (const linePoint of waterway.coordinates) {
      if (pointInGeometry(linePoint[0], linePoint[1], polygons)) distanceM = 0;
    }
    for (let i = 1; i < waterway.coordinates.length && distanceM > 0; i += 1) {
      for (const ring of rings) {
        for (let j = 1; j < ring.length; j += 1) {
          distanceM = Math.min(distanceM, segmentDistance(waterway.coordinates[i - 1], waterway.coordinates[i], ring[j - 1], ring[j]));
          if (distanceM === 0) break;
        }
        if (distanceM === 0) break;
      }
    }
    return { waterway, distanceM };
  }).filter(({ distanceM }) => distanceM <= WATERWAY_SEARCH_M)
    .sort((a, b) => a.distanceM - b.distanceM);
  const connections = outflowPoints.map((exit) => {
    const point = proj4("EPSG:4326", "EPSG:2180", [exit.lng, exit.lat]) as Position;
    const nearest = distanceToNetwork(point, waterways);
    return nearest ? {
      direction: exit.direction,
      estimatedContributingAreaM2: exit.estimatedContributingAreaM2,
      distanceM: Math.round(nearest.distanceM),
      waterway: { name: nearest.waterway.name, type: nearest.waterway.type },
      withinMatchDistance: nearest.distanceM <= WATERWAY_MATCH_M,
    } : null;
  }).filter((connection): connection is NonNullable<typeof connection> => connection !== null);
  return {
    status: "available" as const,
    source: { name: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
    searchRadiusM: WATERWAY_SEARCH_M,
    nearbyCount: nearestToParcel.length,
    nearest: nearestToParcel[0] ? {
      name: nearestToParcel[0].waterway.name,
      type: nearestToParcel[0].waterway.type,
      distanceM: Math.round(nearestToParcel[0].distanceM),
    } : null,
    outflowConnections: connections,
    limitations: [
      "Sieć wodna pochodzi z OpenStreetMap; brak obiektu w danych nie potwierdza braku cieku w terenie.",
      "Bliskość cieku lub kierunek spływu nie potwierdzają hydraulicznego połączenia ani ryzyka zalania.",
      "Analiza obejmuje rzeki, strumienie, kanały i oznaczone rowy w zasięgu 1 km; obiekty mogą być niekompletne lub nieaktualne.",
    ],
  };
}

function heapPush(heap: HeapEntry[], entry: HeapEntry) {
  let i = heap.length;
  heap.push(entry);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].height <= entry.height) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = entry;
}

function heapPop(heap: HeapEntry[]): HeapEntry | undefined {
  if (heap.length === 0) return undefined;
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    let i = 0;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      if (left >= heap.length) break;
      const child = right < heap.length && heap[right].height < heap[left].height ? right : left;
      if (heap[child].height >= last.height) break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
  }
  return first;
}

function quantile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function compassDirection(dx: number, dy: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const azimuth = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return directions[Math.round(azimuth / 45) % 8];
}

function summarizeFlow(
  heights: number[],
  inside: boolean[],
  width: number,
  height: number,
  step: number,
  originX: number,
  originY: number,
  polygons: Polygon[],
) {
  const count = width * height;
  const valid = heights.map(Number.isFinite);
  const filled = heights.slice();
  const parent = Array<number>(count).fill(-1);
  const order = Array<number>(count).fill(-1);
  const visited = Array<boolean>(count).fill(false);
  const heap: HeapEntry[] = [];
  let visitOrder = 0;
  const rowOf = (index: number) => Math.floor(index / width);
  const colOf = (index: number) => index % width;
  const neighbors = (index: number) => {
    const row = rowOf(index);
    const col = colOf(index);
    const list: Array<{ index: number; dx: number; dy: number }> = [];
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      list.push({ index: nr * width + nc, dx: dc * step, dy: -dr * step });
    }
    return list;
  };
  const isEdge = (index: number) => {
    const row = rowOf(index);
    const col = colOf(index);
    return row === 0 || col === 0 || row === height - 1 || col === width - 1
      || neighbors(index).some(({ index: other }) => !valid[other]);
  };
  function seed(index: number) {
    if (visited[index] || !valid[index]) return;
    visited[index] = true;
    order[index] = visitOrder++;
    heapPush(heap, { index, height: filled[index], order: order[index] });
  }
  for (let i = 0; i < count; i += 1) if (isEdge(i)) seed(i);

  while (true) {
    let current = heapPop(heap);
    if (!current) {
      const next = valid.findIndex((isValid, index) => isValid && !visited[index]);
      if (next < 0) break;
      seed(next);
      current = heapPop(heap);
      if (!current) break;
    }
    for (const neighbor of neighbors(current.index)) {
      const next = neighbor.index;
      if (visited[next] || !valid[next]) continue;
      visited[next] = true;
      parent[next] = current.index;
      filled[next] = Math.max(heights[next], filled[current.index]);
      order[next] = visitOrder++;
      heapPush(heap, { index: next, height: filled[next], order: order[next] });
    }
  }

  const downstream = Array<number>(count).fill(-1);
  for (let index = 0; index < count; index += 1) {
    if (!valid[index]) continue;
    let best = -1;
    let bestSlope = 0;
    for (const neighbor of neighbors(index)) {
      if (!valid[neighbor.index]) continue;
      const drop = filled[index] - filled[neighbor.index];
      const slope = drop / Math.hypot(neighbor.dx, neighbor.dy);
      if (slope > bestSlope + 1e-12) {
        best = neighbor.index;
        bestSlope = slope;
      }
    }
    downstream[index] = best >= 0 ? best : parent[index];
  }

  const accumulation = Array<number>(count).fill(0);
  for (let i = 0; i < count; i += 1) if (valid[i]) accumulation[i] = 1;
  const flowOrder = Array.from({ length: count }, (_, index) => index).filter((index) => valid[index]);
  flowOrder.sort((a, b) => filled[b] - filled[a] || order[b] - order[a]);
  for (const index of flowOrder) {
    const next = downstream[index];
    if (next >= 0) accumulation[next] += accumulation[index];
  }

  const slopes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!inside[index] || !valid[index]) continue;
    const row = rowOf(index);
    const col = colOf(index);
    const west = col > 0 && valid[index - 1] ? heights[index - 1] : null;
    const east = col + 1 < width && valid[index + 1] ? heights[index + 1] : null;
    const northIndex = row > 0 ? index - width : -1;
    const southIndex = row + 1 < height ? index + width : -1;
    const north = northIndex >= 0 && valid[northIndex] ? heights[northIndex] : null;
    const south = southIndex >= 0 && valid[southIndex] ? heights[southIndex] : null;
    if (west === null && east === null && north === null && south === null) continue;
    const dzdx = west !== null && east !== null ? (east - west) / (2 * step)
      : east !== null ? (east - heights[index]) / step
        : west !== null ? (heights[index] - west) / step : 0;
    const dzdy = south !== null && north !== null ? (north - south) / (2 * step)
      : north !== null ? (north - heights[index]) / step
        : south !== null ? (heights[index] - south) / step : 0;
    slopes.push(Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI);
  }
  slopes.sort((a, b) => a - b);

  const outflows = new Map<string, number>();
  const outflowPoints: Array<{ lat: number; lng: number; direction: string; estimatedContributingAreaM2: number }> = [];
  const inflows = new Map<string, number>();
  const insideCount = inside.reduce((sum, value, index) => sum + (value && valid[index] ? 1 : 0), 0);
  const threshold = Math.max(4, Math.ceil(insideCount * 0.03));
  const accumulationPeaks: Array<{ index: number; cells: number }> = [];
  for (let index = 0; index < count; index += 1) {
    if (!valid[index]) continue;
    const next = downstream[index];
    if (next >= 0 && inside[index] && !inside[next]) {
      const fromX = originX + colOf(index) * step;
      const fromY = originY - rowOf(index) * step;
      const toX = originX + colOf(next) * step;
      const toY = originY - rowOf(next) * step;
      const direction = compassDirection(toX - fromX, toY - fromY);
      outflows.set(direction, (outflows.get(direction) ?? 0) + accumulation[index]);
      const [lng, lat] = proj4("EPSG:2180", "EPSG:4326", [fromX, fromY]) as number[];
      outflowPoints.push({ lat, lng, direction, estimatedContributingAreaM2: Math.round(accumulation[index] * step * step) });
    } else if (next >= 0 && !inside[index] && inside[next]) {
      const fromX = originX + colOf(index) * step;
      const fromY = originY - rowOf(index) * step;
      const toX = originX + colOf(next) * step;
      const toY = originY - rowOf(next) * step;
      const direction = compassDirection(toX - fromX, toY - fromY);
      inflows.set(direction, (inflows.get(direction) ?? 0) + accumulation[index]);
    }
    if (!inside[index] || accumulation[index] < threshold) continue;
    const isPeak = neighbors(index).every(({ index: other }) => !valid[other] || accumulation[index] >= accumulation[other]);
    if (isPeak) accumulationPeaks.push({ index, cells: accumulation[index] });
  }

  const coordinate = (index: number) => {
    const x = originX + colOf(index) * step;
    const y = originY - rowOf(index) * step;
    return proj4("EPSG:2180", "EPSG:4326", [x, y]) as number[];
  };
  const topPeaks = accumulationPeaks.sort((a, b) => b.cells - a.cells).slice(0, 3).map(({ index, cells }) => {
    const [lng, lat] = coordinate(index);
    return { lat, lng, estimatedContributingAreaM2: Math.round(cells * step * step) };
  });

  const depressionCells = new Set<number>();
  for (let i = 0; i < count; i += 1) if (inside[i] && valid[i] && filled[i] - heights[i] >= 0.25) depressionCells.add(i);
  const depressions: Array<{ lat: number; lng: number; areaM2: number; maxFillDepthM: number }> = [];
  while (depressionCells.size) {
    const first = depressionCells.values().next().value as number;
    depressionCells.delete(first);
    const group = [first];
    for (let q = 0; q < group.length; q += 1) {
      for (const { index: other } of neighbors(group[q])) {
        if (depressionCells.delete(other)) group.push(other);
      }
    }
    const x = group.reduce((sum, i) => sum + originX + colOf(i) * step, 0) / group.length;
    const y = group.reduce((sum, i) => sum + originY - rowOf(i) * step, 0) / group.length;
    const [lng, lat] = proj4("EPSG:2180", "EPSG:4326", [x, y]) as number[];
    depressions.push({
      lat,
      lng,
      areaM2: Math.round(group.length * step * step),
      maxFillDepthM: Math.round(Math.max(...group.map((i) => filled[i] - heights[i])) * 100) / 100,
    });
  }
  depressions.sort((a, b) => b.areaM2 * b.maxFillDepthM - a.areaM2 * a.maxFillDepthM);

  const sortedExits = (map: Map<string, number>) => [...map.entries()]
    .map(([direction, cells]) => ({ direction, estimatedContributingAreaM2: Math.round(cells * step * step) }))
    .sort((a, b) => b.estimatedContributingAreaM2 - a.estimatedContributingAreaM2)
    .slice(0, 3);
  return {
    validSampleCount: slopes.length,
    slope: {
      meanDeg: slopes.length ? Number((slopes.reduce((sum, value) => sum + value, 0) / slopes.length).toFixed(1)) : null,
      medianDeg: quantile(slopes, 0.5) === null ? null : Number(quantile(slopes, 0.5)!.toFixed(1)),
      p90Deg: quantile(slopes, 0.9) === null ? null : Number(quantile(slopes, 0.9)!.toFixed(1)),
      maxDeg: slopes.length ? Number(slopes[slopes.length - 1].toFixed(1)) : null,
    },
    flow: {
      outflowExits: sortedExits(outflows),
      outflowPoints: outflowPoints.sort((a, b) => b.estimatedContributingAreaM2 - a.estimatedContributingAreaM2).slice(0, 3),
      inflowExits: sortedExits(inflows),
      concentrationZones: topPeaks,
      depressions: depressions.slice(0, 3),
    },
  };
}

export async function POST(request: Request) {
  let body: { lat?: unknown; lng?: unknown; id?: unknown; geometry?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Niepoprawne dane działki." }, { status: 400 }); }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const geometry = parseGeometry(body.geometry);
  const id = typeof body.id === "string" ? body.id.trim().slice(0, 100) : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 55 || lng < 14 || lng > 24.5) {
    return NextResponse.json({ error: "Wskaż działkę w granicach Polski." }, { status: 400 });
  }
  if (!geometry || !id) return NextResponse.json({ error: "Brakuje granic działki do analizy spływu." }, { status: 400 });
  const cacheKey = `${GRID_CACHE_VERSION}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  try {
    const polygons4326 = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const polygons2180 = polygons4326.map((polygon) => polygon.map((ring) => ring.map(([x, y]) =>
      proj4("EPSG:4326", "EPSG:2180", [x, y]) as Position,
    )));
    const vertices = polygons2180.flatMap((polygon) => polygon[0]);
    const minVertexX = Math.min(...vertices.map(([x]) => x));
    const maxVertexX = Math.max(...vertices.map(([x]) => x));
    const minVertexY = Math.min(...vertices.map(([, y]) => y));
    const maxVertexY = Math.max(...vertices.map(([, y]) => y));
    const widthM = maxVertexX - minVertexX + 2 * BUFFER_M;
    const heightM = maxVertexY - minVertexY + 2 * BUFFER_M;
    const rawStep = Math.sqrt((widthM * heightM) / TARGET_MAX_SAMPLES);
    const step = Math.max(MIN_SAMPLE_SPACING_M, Math.ceil(rawStep / MIN_SAMPLE_SPACING_M) * MIN_SAMPLE_SPACING_M);
    const minX = Math.floor((minVertexX - BUFFER_M) / step) * step;
    const maxX = Math.ceil((maxVertexX + BUFFER_M) / step) * step;
    const minY = Math.floor((minVertexY - BUFFER_M) / step) * step;
    const maxY = Math.ceil((maxVertexY + BUFFER_M) / step) * step;
    const width = Math.round((maxX - minX) / step) + 1;
    const height = Math.round((maxY - minY) / step) + 1;
    if (width * height > TARGET_MAX_SAMPLES * 1.5) {
      return NextResponse.json({ error: "Działka jest zbyt rozległa do tej analizy lokalnej." }, { status: 413 });
    }

    const points: Array<{ x: number; y: number }> = [];
    const inside = Array<boolean>(width * height).fill(false);
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const x = minX + col * step;
      const y = maxY - row * step;
      points.push({ x, y });
      inside[row * width + col] = pointInGeometry(x, y, polygons2180);
    }
    const heights = await fetchHeights(points);
    const summary = summarizeFlow(heights, inside, width, height, step, minX, maxY, polygons2180);
    if (summary.validSampleCount < 4) {
      const available = heights.filter(Number.isFinite).length;
      return NextResponse.json({ error: `NMT zwrócił tylko ${available} z ${heights.length} wysokości; to za mało do wyznaczenia spływu.` }, { status: 502 });
    }
    const incomplete = heights.filter(Number.isFinite).length < heights.length;
    let waterways: ReturnType<typeof analyzeWaterways> | { status: "unavailable"; source: { name: string; url: string }; error: string; limitations: string[] };
    try {
      const features = await fetchWaterways({ minX: minVertexX, minY: minVertexY, maxX: maxVertexX, maxY: maxVertexY });
      waterways = analyzeWaterways(features, polygons2180, summary.flow.outflowPoints);
    } catch (error) {
      waterways = {
        status: "unavailable",
        source: { name: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" },
        error: error instanceof Error ? error.message : "Nie udało się pobrać sieci wodnej.",
        limitations: ["Dane cieków nie były dostępne; analiza rzeźby terenu została wykonana niezależnie."],
      };
    }
    const result = {
      status: incomplete ? "partial" : "available",
      sampleSpacingM: step,
      bufferM: BUFFER_M,
      elevationDatum: "PL-KRON86-NH",
      source: { name: "GUGiK NMT", url: "https://services.gugik.gov.pl/nmt/", nativeResolutionM: 1 },
      waterways,
      ...summary,
      limitations: [
        "Analiza wykorzystuje siatkę próbkowania o podanym odstępie, a nie każdą komórkę źródłowego NMT.",
        "D8 wyznacza potencjalne drogi spływu z rzeźby terenu; nie uwzględnia rowów, przepustów, upraw, infiltracji ani ilości opadu.",
        "Wysokości spoza 50 m bufora nie są wliczone, więc powierzchnie zasilające poza tym obszarem mogą być niepełne.",
        "Zagłębienia są wskazaniami topograficznymi przy progu wypełnienia 0,25 m, a nie prognozą objętości stojącej wody.",
      ],
    };
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    if (cache.size > 500) {
      for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
    }
    return NextResponse.json(result);
  } catch (error) {
    const isTimeout = error instanceof Error && /timeout|timed out/i.test(error.message);
    return NextResponse.json({ error: isTimeout
      ? "Usługa NMT odpowiada zbyt długo. Spróbuj ponownie za chwilę."
      : error instanceof Error ? `Nie udało się obliczyć spływu z NMT: ${error.message}` : "Nie udało się obliczyć spływu z NMT." }, { status: 502 });
  }
}

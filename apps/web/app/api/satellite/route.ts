import { NextResponse } from "next/server";
import { fromUrl } from "geotiff";
import proj4 from "proj4";
import sharp from "sharp";

export const runtime = "nodejs";

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type StacFeature = {
  id: string;
  bbox?: number[];
  properties: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    "proj:epsg"?: number;
  };
  assets: Record<string, {
    href: string;
    gsd?: number;
  }>;
};

type SatelliteResult = {
  status: "available" | "partial" | "unavailable";
  provider: "Earth Search";
  satellite: "Sentinel-2";
  level: "L2A";
  currentImageUrl: string | null;
  historicalImageUrl: string | null;
  imageBounds: [number, number, number, number] | null;
  imageWidth: number | null;
  imageHeight: number | null;
  geometry: Geometry | null;
  date: string | null;
  cloudCoverPercent: number | null;
  resolutionMeters: number | null;
  ndvi: number | null;
  historicalNdvi: number | null;
  ndviDifference: number | null;
  validPixelPercent: number | null;
  crop: string;
  interpretation: string;
  limitations: string[];
};

const cache = new Map<string, { expiresAt: number; value: SatelliteResult }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function geometryBbox(geometry: Geometry | null, lat: number, lng: number): [number, number, number, number] {
  const coordinatePairs: number[][] = [];
  if (geometry?.type === "Polygon") {
    (geometry.coordinates as number[][][]).forEach((ring) => ring.forEach((pair) => coordinatePairs.push(pair)));
  } else if (geometry?.type === "MultiPolygon") {
    (geometry.coordinates as number[][][][]).forEach((polygon) => polygon.forEach((ring) => ring.forEach((pair) => coordinatePairs.push(pair))));
  }
  if (coordinatePairs.length === 0) return [lng - 0.002, lat - 0.002, lng + 0.002, lat + 0.002];

  const xs = coordinatePairs.map((pair) => pair[0]);
  const ys = coordinatePairs.map((pair) => pair[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function paddedBbox(bbox: [number, number, number, number]): [number, number, number, number] {
  const longitudePadding = (bbox[2] - bbox[0]) * 0.12;
  const latitudePadding = (bbox[3] - bbox[1]) * 0.12;
  const padded: [number, number, number, number] = [
    bbox[0] - longitudePadding,
    bbox[1] - latitudePadding,
    bbox[2] + longitudePadding,
    bbox[3] + latitudePadding,
  ];

  const west = padded[0];
  const south = padded[1];
  const east = padded[2];
  const north = padded[3];
  const centerLatitude = (south + north) / 2;
  const widthMeters = (east - west) * 111320 * Math.cos(centerLatitude * Math.PI / 180);
  const heightMeters = (north - south) * 111320;
  const targetRatio = 16 / 11;
  let [frameWest, frameSouth, frameEast, frameNorth] = padded;

  if (widthMeters / heightMeters < targetRatio) {
    const requiredWidthMeters = heightMeters * targetRatio;
    const requiredWidthDegrees = requiredWidthMeters / (111320 * Math.cos(centerLatitude * Math.PI / 180));
    frameWest = (west + east - requiredWidthDegrees) / 2;
    frameEast = (west + east + requiredWidthDegrees) / 2;
  } else if (widthMeters / heightMeters > targetRatio) {
    const requiredHeightMeters = widthMeters / targetRatio;
    const requiredHeightDegrees = requiredHeightMeters / 111320;
    frameSouth = (south + north - requiredHeightDegrees) / 2;
    frameNorth = (south + north + requiredHeightDegrees) / 2;
  }

  return [frameWest, frameSouth, frameEast, frameNorth];
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(x: number, y: number, geometry: Geometry | null): boolean {
  if (!geometry) return true;
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates as number[][][];
    return pointInRing(x, y, coordinates[0]);
  }
  const coordinates = geometry.coordinates as number[][][][];
  return coordinates.some((polygon) => pointInRing(x, y, polygon[0]));
}


async function searchScenes(bbox: [number, number, number, number], start: string, end: string): Promise<StacFeature[]> {
  const response = await fetch("https://earth-search.aws.element84.com/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/geo+json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      bbox,
      datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
      query: { "eo:cloud_cover": { "lt": 20 } },
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      limit: 10,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Katalog Sentinel-2 nie odpowiada.");
  const payload = await response.json() as { features?: StacFeature[] };
  return (payload.features ?? []).sort((left, right) => {
    const leftCloud = left.properties["eo:cloud_cover"] ?? 100;
    const rightCloud = right.properties["eo:cloud_cover"] ?? 100;
    if (leftCloud !== rightCloud) return leftCloud - rightCloud;
    return (right.properties.datetime ?? "").localeCompare(left.properties.datetime ?? "");
  });
}

async function calculateNdvi(
  item: StacFeature,
  geometry: Geometry | null,
  bbox: [number, number, number, number],
): Promise<{ ndvi: number | null; validPixelPercent: number | null; resolutionMeters: number | null }> {
  const redAsset = item.assets.red ?? item.assets.B04;
  const nirAsset = item.assets.nir ?? item.assets.B08;
  if (!redAsset?.href || !nirAsset?.href) {
    return { ndvi: null, validPixelPercent: null, resolutionMeters: redAsset?.gsd ?? nirAsset?.gsd ?? null };
  }

  const epsg = item.properties["proj:epsg"];
  if (!epsg) return { ndvi: null, validPixelPercent: null, resolutionMeters: redAsset.gsd ?? null };

  const redTiff = await fromUrl(redAsset.href);
  const nirTiff = await fromUrl(nirAsset.href);
  const redImage = await redTiff.getImage();
  const nirImage = await nirTiff.getImage();
  const origin = redImage.getOrigin();
  const resolution = redImage.getResolution();
  const transformer = proj4(
    "EPSG:4326",
    epsg === 32734 || epsg === 32735
      ? `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`
      : `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`,
  );
  const [minXNative, minYNatY] = transformer.forward([bbox[0], bbox[1]]) as number[];
  const [maxXNative, maxYNatY] = transformer.forward([bbox[2], bbox[3]]) as number[];
  const sclAsset = item.assets.scl;
  let sclValues: ArrayLike<number> | null = null;
  let sclOrigin: number[] | null = null;
  let sclResolution: number[] | null = null;
  let sclLeft = 0;
  let sclTop = 0;
  let sclWidth = 0;
  if (sclAsset?.href) {
    try {
      const sclTiff = await fromUrl(sclAsset.href);
      const sclImage = await sclTiff.getImage();
      sclOrigin = sclImage.getOrigin();
      sclResolution = sclImage.getResolution();
      const sclNativeLeft = Math.max(0, Math.floor((Math.min(minXNative, maxXNative) - sclOrigin[0]) / sclResolution[0]));
      const sclNativeRight = Math.min(sclImage.getWidth(), Math.ceil((Math.max(minXNative, maxXNative) - sclOrigin[0]) / sclResolution[0]));
      const sclNativeTop = Math.max(0, Math.floor((sclOrigin[1] - Math.max(minYNatY, maxYNatY)) / -sclResolution[1]));
      const sclNativeBottom = Math.min(sclImage.getHeight(), Math.ceil((sclOrigin[1] - Math.min(minYNatY, maxYNatY)) / -sclResolution[1]));
      sclLeft = sclNativeLeft;
      sclTop = sclNativeTop;
      sclWidth = sclNativeRight - sclNativeLeft;
      const raster = await sclImage.readRasters({
        window: [sclNativeLeft, sclNativeTop, sclNativeRight, sclNativeBottom],
        samples: [0],
        interleave: false,
      }) as unknown as Array<ArrayLike<number>>;
      sclValues = raster[0];
    } catch {
      sclValues = null;
    }
  }

  const pixelXSize = resolution[0];
  const pixelYSize = resolution[1];
  const left = Math.max(0, Math.floor((Math.min(minXNative, maxXNative) - origin[0]) / pixelXSize));
  const right = Math.min(redImage.getWidth(), Math.ceil((Math.max(minXNative, maxXNative) - origin[0]) / pixelXSize));
  const top = Math.max(0, Math.floor((origin[1] - Math.max(minYNatY, maxYNatY)) / -pixelYSize));
  const bottom = Math.min(redImage.getHeight(), Math.ceil((origin[1] - Math.min(minYNatY, maxYNatY)) / -pixelYSize));

  if (right <= left || bottom <= top) {
    return { ndvi: null, validPixelPercent: null, resolutionMeters: redAsset.gsd ?? null };
  }

  const window: [number, number, number, number] = [left, top, right, bottom];
  const [redRaster, nirRaster] = await Promise.all([
    redImage.readRasters({ window, samples: [0], interleave: false }) as unknown as Promise<Array<ArrayLike<number>>>,
    nirImage.readRasters({ window, samples: [0], interleave: false }) as unknown as Promise<Array<ArrayLike<number>>>,
  ]);
  const redValues = redRaster[0];
  const nirValues = nirRaster[0];
  let sum = 0;
  let valid = 0;
  let parcelPixels = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const nativeX = origin[0] + (x + 0.5) * pixelXSize;
      const nativeY = origin[1] + (y + 0.5) * pixelYSize;
      const [lng, lat] = transformer.inverse([nativeX, nativeY]) as number[];
      if (!pointInGeometry(lng, lat, geometry)) continue;

      parcelPixels += 1;
      if (sclValues && sclOrigin && sclResolution) {
        const sclX = Math.floor((nativeX - sclOrigin[0]) / sclResolution[0]);
        const sclY = Math.floor((sclOrigin[1] - nativeY) / -sclResolution[1]);
        const sclIndex = (sclY - sclTop) * sclWidth + (sclX - sclLeft);
        const sclClass = sclValues[sclIndex];
        if (sclClass === 3 || sclClass === 8 || sclClass === 9 || sclClass === 10) continue;
      }
      const index = (y - top) * (right - left) + (x - left);
      const redRaw = redValues[index];
      const nirRaw = nirValues[index];
      if (redRaw <= 0 || nirRaw <= 0) continue;
      const red = redRaw * 0.0001 - 0.1;
      const nir = nirRaw * 0.0001 - 0.1;
      if (red <= 0 || nir <= 0) continue;
      const denominator = nir + red;
      if (denominator <= 0) continue;
      const ndvi = (nir - red) / denominator;
      if (Number.isFinite(ndvi)) {
        sum += ndvi;
        valid += 1;
      }
    }
  }

  if (valid === 0) {
    return { ndvi: null, validPixelPercent: 0, resolutionMeters: redAsset.gsd ?? null };
  }
  return {
    ndvi: Number((sum / valid).toFixed(3)),
    validPixelPercent: parcelPixels > 0 ? Number(((valid / parcelPixels) * 100).toFixed(1)) : 0,
    resolutionMeters: redAsset.gsd ?? null,
  };
}

async function createParcelImage(
  item: StacFeature,
  geometry: Geometry | null,
  bbox: [number, number, number, number],
): Promise<{ url: string; width: number; height: number } | null> {
  const visualAsset = item.assets.visual;
  const epsg = item.properties["proj:epsg"];
  if (!visualAsset?.href || !epsg) return null;

  try {
    const tiff = await fromUrl(visualAsset.href);
    const image = await tiff.getImage();
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    const transformer = proj4(
      "EPSG:4326",
      epsg === 32734 || epsg === 32735
        ? `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`
        : `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`,
    );

    const imageBounds = paddedBbox(bbox);
    const [minXNative, minYNative] = transformer.forward([imageBounds[0], imageBounds[1]]) as number[];
    const [maxXNative, maxYNative] = transformer.forward([imageBounds[2], imageBounds[3]]) as number[];
    const pixelXSize = resolution[0];
    const pixelYSize = resolution[1];
    const left = Math.max(0, Math.floor((Math.min(minXNative, maxXNative) - origin[0]) / pixelXSize));
    const right = Math.min(image.getWidth(), Math.ceil((Math.max(minXNative, maxXNative) - origin[0]) / pixelXSize));
    const top = Math.max(0, Math.floor((origin[1] - Math.max(minYNative, maxYNative)) / -pixelYSize));
    const bottom = Math.min(image.getHeight(), Math.ceil((origin[1] - Math.min(minYNative, maxYNative)) / -pixelYSize));
    if (right <= left || bottom <= top) return null;

    const width = right - left;
    const height = bottom - top;
    const raster = await image.readRasters({
      window: [left, top, right, bottom],
      interleave: true,
      samples: [0, 1, 2],
    });
    const pixels = raster as unknown as Uint8Array | Uint16Array;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = (y * width + x) * 3;
        const targetIndex = (y * width + x) * 4;
        const nativeX = origin[0] + (left + x + 0.5) * pixelXSize;
        const nativeY = origin[1] + (top + y + 0.5) * pixelYSize;
        rgba[targetIndex] = pixels[sourceIndex] > 255 ? Math.round(pixels[sourceIndex] / 256) : pixels[sourceIndex];
        rgba[targetIndex + 1] = pixels[sourceIndex + 1] > 255 ? Math.round(pixels[sourceIndex + 1] / 256) : pixels[sourceIndex + 1];
        rgba[targetIndex + 2] = pixels[sourceIndex + 2] > 255 ? Math.round(pixels[sourceIndex + 2] / 256) : pixels[sourceIndex + 2];
        rgba[targetIndex + 3] = 255;
      }
    }

    const resized = await sharp(Buffer.from(rgba), {
      raw: { width, height, channels: 4 },
    }).resize({
      width: 640,
      height: 440,
      fit: "fill",
      kernel: "lanczos3",
      withoutEnlargement: false,
    }).png().toBuffer({ resolveWithObject: true });
    return {
      url: `data:image/png;base64,${resized.data.toString("base64")}`,
      width: resized.info.width,
      height: resized.info.height,
    };
  } catch {
    return null;
  }
}

function interpret(ndvi: number | null, difference: number | null, crop: string, weatherAvailable: boolean): string {
  if (ndvi === null) return "Nie udało się odczytać wartości roślinności z dostępnej obserwacji.";
  const cropNames: Record<string, string> = {
    zboza: "zbóż",
    rzepak: "rzepaku",
    ziemniaki: "ziemniaków",
    buraki: "buraków",
    kukorydza: "kukurydzy",
    owoce: "sadów i owoców",
    warzywa: "warzyw",
    inna: "tej uprawy",
  };
  const cropName = `uprawy ${cropNames[crop] ?? "tej uprawy"}`;
  let vegetation = "Stan roślinności jest umiarkowany.";
  if (ndvi >= 0.6) vegetation = "Roślinność jest silnie rozwinięta.";
  else if (ndvi < 0.3) vegetation = "Roślinność ma słabą lub rozproszoną zieloną biomase.";

  let comparison = "";
  if (difference !== null) {
    if (difference < -0.08) comparison = " W porównaniu z analogicznym okresem ubiegłego roku wartość jest wyraźnie niższa.";
    else if (difference > 0.08) comparison = " W porównaniu z analogicznym okresem ubiegłego roku wartość jest wyraźnie wyższa.";
    else comparison = " W porównaniu z analogicznym okresem ubiegłego roku wartość jest zbliżona.";
  }
  const uncertainty = weatherAvailable
    ? " Interpretację łączymy z danymi pogodowymi; brak danych glebowych jest ograniczeniem."
    : " Interpretacja jest orientacyjna — potrzebne są dane pogodowe i glebowe.";
  return `${vegetation} Wynik dotyczy ${cropName}.${comparison}${uncertainty}`;
}

export async function POST(request: Request) {
  let body: {
    lat?: unknown;
    lng?: unknown;
    geometry?: Geometry | null;
    crop?: unknown;
    weatherAvailable?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawne dane działki." }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 55 || lng < 14 || lng > 24.5) {
    return NextResponse.json({ error: "Brak poprawnej lokalizacji działki." }, { status: 400 });
  }

  const crop = typeof body.crop === "string" && body.crop.trim() ? body.crop.trim() : "other";
  const geometry = body.geometry && typeof body.geometry === "object" ? body.geometry : null;
  const weatherAvailable = body.weatherAvailable === true;
  const bbox = geometryBbox(geometry, lat, lng);
  const cacheKey = `v5:${lng.toFixed(4)}:${lat.toFixed(4)}:${crop}:${JSON.stringify(geometry)}:${isoDate(new Date())}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  try {
    const today = new Date();
    const currentStart = isoDate(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000));
    const currentEnd = isoDate(today);
    const [currentScenes, historicalScenes] = await Promise.all([
      searchScenes(bbox, currentStart, currentEnd),
      searchScenes(
        bbox,
        isoDate(new Date(new Date(`${currentStart}T12:00:00Z`).setUTCFullYear(today.getUTCFullYear() - 1))),
        isoDate(new Date(new Date(`${currentEnd}T12:00:00Z`).setUTCFullYear(today.getUTCFullYear() - 1))),
      ),
    ]);

    const currentItem = currentScenes[0];
    if (!currentItem) {
      const unavailable: SatelliteResult = {
        status: "unavailable",
        provider: "Earth Search",
        satellite: "Sentinel-2",
        level: "L2A",
        currentImageUrl: null,
        historicalImageUrl: null,
        imageBounds: null,
        imageWidth: null,
        imageHeight: null,
        geometry,
        date: null,
        cloudCoverPercent: null,
        resolutionMeters: null,
        ndvi: null,
        historicalNdvi: null,
        ndviDifference: null,
        validPixelPercent: null,
        crop,
        interpretation: "Brak jakościowej obserwacji Sentinel-2 bez chmur w ostatnich 90 dniach.",
        limitations: ["Zakres chmur: poniżej 20% dla sceny.", "Brak pokrycia może wynikać z chmur, sezonu lub braku danych."],
      };
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: unavailable });
      return NextResponse.json(unavailable);
    }

    const current = await calculateNdvi(currentItem, geometry, bbox);
    const historicalItem = historicalScenes[0];
    const historical = historicalItem ? await calculateNdvi(historicalItem, geometry, bbox) : null;
    const difference = current.ndvi !== null && historical !== null && historical.ndvi !== null
      ? Number((current.ndvi - historical.ndvi).toFixed(3))
      : null;
    const [currentImage, historicalImage] = await Promise.all([
      createParcelImage(currentItem, geometry, bbox),
      historicalItem ? createParcelImage(historicalItem, geometry, bbox) : Promise.resolve(null),
    ]);

    const result: SatelliteResult = {
      status: current.validPixelPercent !== null && current.validPixelPercent < 70 ? "partial" : "available",
      provider: "Earth Search",
      satellite: "Sentinel-2",
      level: "L2A",
      currentImageUrl: currentImage?.url ?? null,
      historicalImageUrl: historicalImage?.url ?? null,
      imageBounds: paddedBbox(bbox),
      imageWidth: currentImage?.width ?? historicalImage?.width ?? null,
      imageHeight: currentImage?.height ?? historicalImage?.height ?? null,
      geometry,
      date: currentItem.properties.datetime?.slice(0, 10) ?? null,
      cloudCoverPercent: currentItem.properties["eo:cloud_cover"] != null
        ? Number(currentItem.properties["eo:cloud_cover"].toFixed(2))
        : null,
      resolutionMeters: current.resolutionMeters,
      ndvi: current.ndvi,
      historicalNdvi: historical?.ndvi ?? null,
      ndviDifference: difference,
      validPixelPercent: current.validPixelPercent,
      crop,
      interpretation: interpret(current.ndvi, difference, crop, weatherAvailable),
      limitations: [
        "NDVI opisuje zieloną biomasę i nie jest bezpośrednim pomiarem wilgotności gleby.",
        "Analiza nie zastępuje danych glebowych ani kontroli pola.",
        "Porównanie historyczne dotyczy analogicznego okresu z poprzedniego roku.",
        "Pokrycie pikseli parceli może być częściowe przy zachmurzeniu lub braku danych.",
      ],
    };
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nie udało się pobrać danych satelitarnych.",
    }, { status: 502 });
  }
}

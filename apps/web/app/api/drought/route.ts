import { NextResponse } from "next/server";
import proj4 from "proj4";
import sharp from "sharp";

export const runtime = "nodejs";

type DroughtCategory = {
  code: number;
  name: string;
  susceptibility: "bardzo wysoka" | "wysoka" | "umiarkowana" | "niska" | "nieklasyfikowana";
};

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type DroughtResult = {
  status: "available" | "unavailable";
  provider: "IUNG-PIB";
  source: "Susza:katgl_landuse2024";
  layerDate: "2024";
  category: DroughtCategory | null;
  previewUrl: string | null;
  crop: string;
  precipitation30DaysMm: number | null;
  cropRainfallMinimumMm30Days: number;
  precipitationDeficitMm: number | null;
  currentRisk: "niski" | "umiarkowany" | "wysoki" | "bardzo wysoki" | "brak danych";
  interpretation: string;
  limitations: string[];
};

const cache = new Map<string, { expiresAt: number; value: DroughtResult }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs",
);

const categoryMap: Record<number, DroughtCategory> = {
  1: { code: 1, name: "Kategoria I - bardzo podatna", susceptibility: "bardzo wysoka" },
  2: { code: 2, name: "Kategoria II - podatna", susceptibility: "wysoka" },
  3: { code: 3, name: "Kategoria III - średnio podatna", susceptibility: "umiarkowana" },
  4: { code: 4, name: "Kategoria IV - mało podatna", susceptibility: "niska" },
};

const cropLabels: Record<string, string> = {
  zboza: "zboża",
  rzepak: "rzepak",
  ziemniaki: "ziemniaki",
  buraki: "buraki",
  kukorydza: "kukurydza",
  owoce: "sady i owoce",
  warzywa: "warzywa",
  inna: "wybraną uprawę",
};

const cropRainfallMinimum: Record<string, number> = {
  zboza: 25,
  rzepak: 30,
  ziemniaki: 40,
  buraki: 40,
  kukorydza: 40,
  owoce: 50,
  warzywa: 35,
  inna: 30,
};

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

function pointInGeometry(lng: number, lat: number, geometry: Geometry | null): boolean {
  if (!geometry) return true;
  if (geometry.type === "Polygon") {
    return pointInRing(lng, lat, (geometry.coordinates as number[][][])[0]);
  }
  return (geometry.coordinates as number[][][][]).some((polygon) => pointInRing(lng, lat, polygon[0]));
}

async function getSoilCategory(
  lat: number,
  lng: number,
  geometry: Geometry | null,
): Promise<{ category: DroughtCategory | null; previewUrl: string | null }> {
  const [centerX, centerY] = proj4("EPSG:4326", "EPSG:2180", [lng, lat]) as number[];
  const projectedRings: number[][][] = [];
  if (geometry?.type === "Polygon") {
    projectedRings.push((geometry.coordinates as number[][][])[0].map(([ringLng, ringLat]) =>
      proj4("EPSG:4326", "EPSG:2180", [ringLng, ringLat]) as number[],
    ));
  } else if (geometry?.type === "MultiPolygon") {
    (geometry.coordinates as number[][][][]).forEach((polygon) =>
      projectedRings.push(polygon[0].map(([ringLng, ringLat]) =>
        proj4("EPSG:4326", "EPSG:2180", [ringLng, ringLat]) as number[],
      )),
    );
  }

  let xs: number[] = [];
  let ys: number[] = [];
  if (projectedRings.length > 0) {
    const allPoints = projectedRings.flat();
    xs = allPoints.map((point) => point[0]);
    ys = allPoints.map((point) => point[1]);
  } else {
    xs = [centerX - 250, centerX + 250];
    ys = [centerY - 250, centerY + 250];
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 300;
  const height = 300;
  const url = new URL("https://sgeo.iung.pl/geoserver/Susza/wms");
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", "Susza:katgl_landuse2024");
  url.searchParams.set("styles", "");
  url.searchParams.set("srs", "EPSG:2180");
  url.searchParams.set("bbox", `${minX},${minY},${maxX},${maxY}`);
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Warstwa podatności gleb IUNG jest niedostępna.");
  const image = await sharp(Buffer.from(await response.arrayBuffer()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map<number, number>();
  const rgba = new Uint8Array(width * height * 4);
  const pixelWidth = (maxX - minX) / width;
  const pixelHeight = (maxY - minY) / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nativeX = minX + (x + 0.5) * pixelWidth;
      const nativeY = maxY - (y + 0.5) * pixelHeight;
      const [sampleLng, sampleLat] = proj4("EPSG:2180", "EPSG:4326", [nativeX, nativeY]) as number[];
      if (!pointInGeometry(sampleLng, sampleLat, geometry)) continue;

      const index = (y * width + x) * 4;
      const red = image.data[index];
      const green = image.data[index + 1];
      const blue = image.data[index + 2];
      const alpha = image.data[index + 3];
      if (alpha < 128) continue;

      let code: number | null = null;
      if (red > 240 && green > 240 && blue < 110) code = 1;
      else if (red > 230 && green > 120 && green < 190 && blue < 30) code = 2;
      else if (red > 220 && green < 110 && blue < 80) code = 3;
      else if (red >= 110 && red <= 140 && green >= 55 && green <= 75 && blue === 0) code = 4;
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const dominantCode = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const sourceIndex = pixelIndex;
      const nativeX = minX + (x + 0.5) * pixelWidth;
      const nativeY = maxY - (y + 0.5) * pixelHeight;
      const [sampleLng, sampleLat] = proj4("EPSG:2180", "EPSG:4326", [nativeX, nativeY]) as number[];
      const inside = pointInGeometry(sampleLng, sampleLat, geometry);
      rgba[pixelIndex] = image.data[sourceIndex];
      rgba[pixelIndex + 1] = image.data[sourceIndex + 1];
      rgba[pixelIndex + 2] = image.data[sourceIndex + 2];
      rgba[pixelIndex + 3] = inside && image.data[sourceIndex + 3] >= 128 ? 255 : 0;
    }
  }
  const png = await sharp(Buffer.from(rgba), {
    raw: { width, height, channels: 4 },
  }).resize({ width: 220, height: 150, fit: "inside", withoutEnlargement: true }).png().toBuffer();

  return {
    category: dominantCode ? categoryMap[dominantCode] : null,
    previewUrl: `data:image/png;base64,${png.toString("base64")}`,
  };
}

function calculateRisk(
  category: DroughtCategory | null,
  precipitation: number | null,
  minimum: number,
): "niski" | "umiarkowany" | "wysoki" | "bardzo wysoki" | "brak danych" {
  if (precipitation === null) return "brak danych";
  const deficit = Math.max(0, minimum - precipitation);
  if (category?.susceptibility === "bardzo wysoka") {
    if (deficit >= minimum * 0.5) return "bardzo wysoki";
  }
  if (category?.susceptibility === "bardzo wysoka" || category?.susceptibility === "wysoka") {
    if (deficit >= minimum * 0.35) return "wysoki";
  }
  if (deficit >= minimum * 0.35) return "umiarkowany";
  return "niski";
}

export async function POST(request: Request) {
  let body: {
    lat?: unknown;
    lng?: unknown;
    crop?: unknown;
    geometry?: Geometry | null;
    precipitation30DaysMm?: unknown;
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

  const crop = typeof body.crop === "string" && body.crop.trim() ? body.crop.trim() : "inna";
  const geometry = body.geometry && typeof body.geometry === "object" ? body.geometry : null;
  const precipitation = typeof body.precipitation30DaysMm === "number" && Number.isFinite(body.precipitation30DaysMm)
    ? body.precipitation30DaysMm
    : null;
  const minimum = cropRainfallMinimum[crop] ?? cropRainfallMinimum.inna;
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}:${crop}:${precipitation ?? "none"}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  try {
    const soilData = await getSoilCategory(lat, lng, geometry);
    const category = soilData.category;
    const deficit = precipitation === null ? null : Number(Math.max(0, minimum - precipitation).toFixed(1));
    const currentRisk = calculateRisk(category, precipitation, minimum);
    const cropName = cropLabels[crop] ?? "wybraną uprawę";
    let interpretation = "Nie udało się określić podatności gleby ani bieżącego ryzyka.";
    if (category) {
      interpretation = `Podatność gleby dla działki: ${category.name}.`;
      if (precipitation === null) {
        interpretation += " Po pobraniu danych meteo można ocenić dodatkowy niedobór opadów.";
      } else if (deficit !== null && deficit > 0) {
        interpretation += ` W ostatnich 30 dniach suma opadów była o ${deficit.toFixed(1)} mm niższa od orientacyjnego progu ${minimum} mm dla ${cropName}.`;
      } else {
        interpretation += ` W ostatnich 30 dniach suma opadów nie jest niższa od orientacyjnego progu ${minimum} mm dla ${cropName}.`;
      }
    }

    const result: DroughtResult = {
      status: "available",
      provider: "IUNG-PIB",
      source: "Susza:katgl_landuse2024",
      layerDate: "2024",
      category,
      previewUrl: soilData.previewUrl,
      crop,
      precipitation30DaysMm: precipitation,
      cropRainfallMinimumMm30Days: minimum,
      precipitationDeficitMm: deficit,
      currentRisk,
      interpretation,
      limitations: [
        "Warstwa IUNG opisuje podatność gleby na suszę, a nie bieżące zagrożenie suszą.",
        "Orientacyjny próg 30-dniowych opadów nie jest oficjalnym normatywem IUNG dla konkretnego terminu uprawy.",
        "Wynik nie zastępuje danych o glebie, transpiracji uprawy ani lokalnych pomiarach wilgotności.",
      ],
    };
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    return NextResponse.json(result);
  } catch (error) {
    const unavailable: DroughtResult = {
      status: "unavailable",
      provider: "IUNG-PIB",
      source: "Susza:katgl_landuse2024",
      layerDate: "2024",
      category: null,
      previewUrl: null,
      crop,
      precipitation30DaysMm: precipitation,
      cropRainfallMinimumMm30Days: minimum,
      precipitationDeficitMm: null,
      currentRisk: "brak danych",
      interpretation: "Nie udało się pobrać podatności gleby z usługi IUNG-PIB.",
      limitations: ["W celu oceny potrzebna jest dostępna warstwa podatności gleby."],
    };
    return NextResponse.json(unavailable);
  }
}

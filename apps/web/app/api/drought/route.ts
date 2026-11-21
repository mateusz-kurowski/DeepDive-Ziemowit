import { NextResponse } from "next/server";
import proj4 from "proj4";

export const runtime = "nodejs";

type DroughtCategory = {
  code: number;
  name: string;
  susceptibility: "bardzo wysoka" | "wysoka" | "umiarkowana" | "niska" | "nieklasyfikowana";
};

type DroughtResult = {
  status: "available" | "unavailable";
  provider: "IUNG-PIB";
  source: "Susza:katgl_landuse2024";
  layerDate: "2024";
  category: DroughtCategory | null;
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

async function getSoilCategory(lat: number, lng: number): Promise<DroughtCategory | null> {
  const [x, y] = proj4("EPSG:4326", "EPSG:2180", [lng, lat]) as number[];
  const offset = 500;
  const bbox = `${x - offset},${y - offset},${x + offset},${y + offset}`;
  const url = new URL("https://sgeo.iung.pl/geoserver/Susza/wms");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("BBOX", bbox);
  url.searchParams.set("CRS", "EPSG:2180");
  url.searchParams.set("WIDTH", "101");
  url.searchParams.set("HEIGHT", "101");
  url.searchParams.set("LAYERS", "Susza:katgl_landuse2024");
  url.searchParams.set("QUERY_LAYERS", "Susza:katgl_landuse2024");
  url.searchParams.set("INFO_FORMAT", "application/json");
  url.searchParams.set("I", "50");
  url.searchParams.set("J", "50");
  url.searchParams.set("FEATURE_COUNT", "1");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Warstwa podatności gleb IUNG jest niedostępna.");
  const payload = await response.json() as {
    features?: Array<{ properties?: { GRAY_INDEX?: number } }>;
  };
  const code = payload.features?.[0]?.properties?.GRAY_INDEX;
  return typeof code === "number" ? categoryMap[code] ?? null : null;
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
  let body: { lat?: unknown; lng?: unknown; crop?: unknown; precipitation30DaysMm?: unknown };
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
  const precipitation = typeof body.precipitation30DaysMm === "number" && Number.isFinite(body.precipitation30DaysMm)
    ? body.precipitation30DaysMm
    : null;
  const minimum = cropRainfallMinimum[crop] ?? cropRainfallMinimum.inna;
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}:${crop}:${precipitation ?? "none"}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  try {
    const category = await getSoilCategory(lat, lng);
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

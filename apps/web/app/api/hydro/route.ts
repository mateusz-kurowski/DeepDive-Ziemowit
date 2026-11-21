import { NextRequest } from "next/server";
import type { HydroResult, HydroStation } from "../../types";

export const runtime = "nodejs";

type ForecastResponse = {
  elevation?: number;
  hourly?: {
    time?: string[];
    soil_moisture_0_to_1cm?: Array<number | null>;
    soil_moisture_9_to_27cm?: Array<number | null>;
    soil_moisture_27_to_81cm?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
  };
};

type FloodResponse = {
  daily?: { time?: string[]; river_discharge?: Array<number | null> };
};

type ImgwStation = {
  id_stacji: string;
  stacja: string;
  rzeka: string | null;
  lon: string | null;
  lat: string | null;
  stan_alarmowy: string | null;
  stan_ostrzegawczy: string | null;
  stan_wody: string | null;
  stan_wody_data_pomiaru: string | null;
  przeplyw: string | null;
};

const PAST_DAYS = 30;
const FORECAST_DAYS = 7;
const cache = new Map<string, { expiresAt: number; value: HydroResult }>();
let imgwCache: { expiresAt: number; stations: ImgwStation[] } | null = null;

function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function warsawNow(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" }).replace(" ", "T");
}

function toPercent(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : round(value * 100);
}

function sum(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? available.reduce((total, value) => total + value, 0) : null;
}

function mean(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? available.reduce((total, value) => total + value, 0) / available.length : null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function fetchJson<T>(url: string | URL): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function soilStatus(value: number | null): HydroResult["soil"]["status"] {
  if (value === null) return "unknown";
  if (value < 0.15) return "dry";
  if (value < 0.3) return "moderate";
  return "wet";
}

async function getSoilAndBalance(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "soil_moisture_0_to_1cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm");
  url.searchParams.set("daily", "precipitation_sum,et0_fao_evapotranspiration");
  url.searchParams.set("past_days", String(PAST_DAYS - 1));
  url.searchParams.set("forecast_days", String(FORECAST_DAYS + 1));
  url.searchParams.set("timezone", "Europe/Warsaw");

  const payload = await fetchJson<ForecastResponse>(url);
  const hourlyTime = payload.hourly?.time ?? [];
  const nowHour = warsawNow().slice(0, 13);
  let currentIndex = hourlyTime.findLastIndex((time) => time.slice(0, 13) <= nowHour);
  if (currentIndex < 0) currentIndex = hourlyTime.length - 1;

  const surface = payload.hourly?.soil_moisture_0_to_1cm ?? [];
  const rootZone = payload.hourly?.soil_moisture_9_to_27cm ?? [];
  const deep = payload.hourly?.soil_moisture_27_to_81cm ?? [];
  const rootZoneNow = rootZone[currentIndex] ?? null;
  const rootZoneMonthAgo = rootZone[0] ?? null;
  const status = soilStatus(rootZoneNow);

  const today = warsawNow().slice(0, 10);
  const dailyTime = payload.daily?.time ?? [];
  const daily = dailyTime.map((date, index) => ({
    date,
    precipitationMm: round(payload.daily?.precipitation_sum?.[index] ?? null),
    et0Mm: round(payload.daily?.et0_fao_evapotranspiration?.[index] ?? null),
    forecast: date > today,
  }));
  const past = daily.filter((day) => !day.forecast);
  const future = daily.filter((day) => day.forecast);

  const pastPrecipitation = sum(past.map((day) => day.precipitationMm));
  const pastEt0 = sum(past.map((day) => day.et0Mm));
  const balance = pastPrecipitation !== null && pastEt0 !== null ? pastPrecipitation - pastEt0 : null;
  const futurePrecipitation = sum(future.map((day) => day.precipitationMm));
  const futureEt0 = sum(future.map((day) => day.et0Mm));

  let balanceAssessment = "Brak danych do wyliczenia bilansu.";
  if (balance !== null) {
    if (balance <= -30) balanceAssessment = "Wyraźny deficyt wody – parowanie znacznie przewyższa opady.";
    else if (balance < -5) balanceAssessment = "Umiarkowany deficyt wody – parowanie przewyższa opady.";
    else if (balance <= 15) balanceAssessment = "Bilans wodny zbliżony do równowagi.";
    else balanceAssessment = "Nadwyżka wody – opady przewyższają parowanie.";
  }

  const soilAssessment = {
    dry: "Strefa korzeniowa jest przesuszona – rośliny mogą odczuwać stres wodny.",
    moderate: "Wilgotność strefy korzeniowej jest umiarkowana.",
    wet: "Strefa korzeniowa jest dobrze nawodniona, możliwe okresowe nadmiary wody.",
    unknown: "Brak danych o wilgotności gleby.",
  }[status];

  return {
    elevationM: round(payload.elevation ?? null, 0),
    soil: {
      surfacePct: toPercent(surface[currentIndex]),
      rootZonePct: toPercent(rootZoneNow),
      deepPct: toPercent(deep[currentIndex]),
      rootZoneChangePp: round(rootZoneNow !== null && rootZoneMonthAgo !== null ? (rootZoneNow - rootZoneMonthAgo) * 100 : null),
      status,
      assessment: soilAssessment,
    },
    waterBalance: {
      precipitationMm: round(pastPrecipitation),
      evapotranspirationMm: round(pastEt0),
      balanceMm: round(balance),
      assessment: balanceAssessment,
    },
    forecast: {
      days: future.length,
      precipitationMm: round(futurePrecipitation),
      evapotranspirationMm: round(futureEt0),
      balanceMm: round(futurePrecipitation !== null && futureEt0 !== null ? futurePrecipitation - futureEt0 : null),
    },
    daily,
  };
}

async function getRiver(latitude: number, longitude: number): Promise<HydroResult["river"]> {
  const url = new URL("https://flood-api.open-meteo.com/v1/flood");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "river_discharge");
  url.searchParams.set("past_days", String(PAST_DAYS));
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  const payload = await fetchJson<FloodResponse>(url);
  const times = payload.daily?.time ?? [];
  const values = payload.daily?.river_discharge ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const pastValues = values.filter((_, index) => times[index] < today);
  const futureValues = values.filter((_, index) => times[index] >= today);
  const current = values[times.indexOf(today)] ?? pastValues.at(-1) ?? null;
  const pastMean = mean(pastValues);
  const futureAvailable = futureValues.filter((value): value is number => value !== null);
  const forecastMax = futureAvailable.length ? Math.max(...futureAvailable) : null;
  if (current === null || pastMean === null) return null;

  const trendPercent = pastMean === 0 ? null : ((current - pastMean) / pastMean) * 100;
  let assessment = "Przepływ w pobliskim cieku jest stabilny.";
  if (trendPercent !== null && trendPercent <= -20) assessment = "Przepływ w pobliskim cieku spada – mniej wody w zlewni.";
  else if (trendPercent !== null && trendPercent >= 30) assessment = "Przepływ w pobliskim cieku rośnie – zlewnia jest zasilana.";

  return {
    dischargeM3s: round(current, 2),
    mean30dM3s: round(pastMean, 2),
    forecastMaxM3s: round(forecastMax, 2),
    trendPercent: round(trendPercent),
    assessment,
  };
}

async function getStations(latitude: number, longitude: number): Promise<HydroStation[]> {
  if (!imgwCache || imgwCache.expiresAt < Date.now()) {
    const stations = await fetchJson<ImgwStation[]>("https://danepubliczne.imgw.pl/api/data/hydro");
    imgwCache = { expiresAt: Date.now() + 10 * 60 * 1000, stations };
  }

  return imgwCache.stations
    .map((station) => {
      const lat = numberOrNull(station.lat);
      const lng = numberOrNull(station.lon);
      const level = numberOrNull(station.stan_wody);
      if (lat === null || lng === null || level === null) return null;
      const warning = numberOrNull(station.stan_ostrzegawczy);
      const alarm = numberOrNull(station.stan_alarmowy);
      let status: HydroStation["status"] = "unknown";
      if (alarm !== null && level >= alarm) status = "alarm";
      else if (warning !== null && level >= warning) status = "warning";
      else if (warning !== null || alarm !== null) status = "normal";
      return {
        id: station.id_stacji,
        name: station.stacja,
        river: station.rzeka,
        distanceKm: round(distanceKm(latitude, longitude, lat, lng)) ?? 0,
        waterLevelCm: level,
        warningLevelCm: warning,
        alarmLevelCm: alarm,
        flowM3s: numberOrNull(station.przeplyw),
        measuredAt: station.stan_wody_data_pomiaru,
        status,
      };
    })
    .filter((station): station is HydroStation => station !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
}

export async function POST(request: NextRequest) {
  let body: { latitude?: unknown; longitude?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Niepoprawne dane zapytania." }, { status: 400 });
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 49 || latitude > 55 || longitude < 14 || longitude > 24.5) {
    return Response.json({ error: "Podaj współrzędne w granicach Polski." }, { status: 400 });
  }

  const cacheKey = `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Response.json(cached.value);

  const [soilResult, riverResult, stationsResult] = await Promise.allSettled([
    getSoilAndBalance(latitude, longitude),
    getRiver(latitude, longitude),
    getStations(latitude, longitude),
  ]);

  if (soilResult.status === "rejected") {
    return Response.json({ error: "Dane hydrologiczne chwilowo niedostępne." }, { status: 503 });
  }

  const limitations = [
    "Wilgotność gleby i ewapotranspiracja pochodzą z modelu (Open-Meteo), nie z pomiaru na działce.",
    "Progi wilgotności (15% i 30% obj.) są orientacyjne i zależą od rodzaju gleby.",
  ];
  if (riverResult.status === "rejected") limitations.push("Model przepływu rzecznego GloFAS był niedostępny.");
  if (stationsResult.status === "rejected") limitations.push("Dane wodowskazów IMGW były niedostępne.");

  const result: HydroResult = {
    location: { latitude, longitude },
    fetchedAt: new Date().toISOString(),
    ...soilResult.value,
    river: riverResult.status === "fulfilled" ? riverResult.value : null,
    stations: stationsResult.status === "fulfilled" ? stationsResult.value : [],
    sources: ["Open-Meteo (gleba, ET₀)", "GloFAS / Open-Meteo Flood", "IMGW-PIB (wodowskazy)"],
    limitations,
  };

  cache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, value: result });
  return Response.json(result);
}

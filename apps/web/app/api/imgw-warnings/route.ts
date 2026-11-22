import { NextRequest, NextResponse } from "next/server";
import type { ImgwWarning, ImgwWarningsResult } from "../../types";

export const runtime = "nodejs";

type RawMeteorologicalWarning = {
  id?: string;
  nazwa_zdarzenia?: string;
  stopien?: string | number;
  prawdopodobienstwo?: string | number;
  obowiazuje_od?: string;
  obowiazuje_do?: string;
  opublikowano?: string;
  tresc?: string;
  teryt?: string[];
};

type RawHydrologicalWarning = {
  numer?: string | number;
  zdarzenie?: string;
  stopień?: string | number;
  prawdopodobienstwo?: string | number;
  data_od?: string;
  data_do?: string;
  opublikowano?: string;
  przebieg?: string;
  obszary?: Array<{ wojewodztwo?: string; opis?: string }>;
};

const SOURCE = {
  name: "IMGW-PIB — ostrzeżenia meteorologiczne i hydrologiczne",
  url: "https://danepubliczne.imgw.pl/apiinfo",
};
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: ImgwWarningsResult }>();

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^wojewodztwo\s+/i, "").trim().toLocaleLowerCase("pl-PL");
}

function warsawNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function isActive(startsAt: string | undefined, endsAt: string | undefined, now: string): boolean {
  const normalizeDateTime = (value: string | undefined, endOfMinute: boolean) => {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(value?.trim() ?? "");
    if (!match) return "";
    return `${match[1]} ${match[2]}:${match[3] ?? (endOfMinute ? "59" : "00")}`;
  };
  const start = normalizeDateTime(startsAt, false);
  const end = normalizeDateTime(endsAt, true);
  return Boolean(start && end && start <= now && end >= now);
}

function numericOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchWarnings<T>(url: string): Promise<T[]> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`IMGW zwrócił HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("IMGW zwrócił nieoczekiwany format danych.");
  return payload as T[];
}

function getMeteorologicalWarnings(raw: RawMeteorologicalWarning[], countyTeryt: string, now: string): ImgwWarning[] {
  return raw.flatMap((warning) => {
    const matchesCounty = (warning.teryt ?? []).some((code) => code.startsWith(countyTeryt));
    if (!matchesCounty || !isActive(warning.obowiazuje_od, warning.obowiazuje_do, now)) return [];
    return [{
      id: `meteo-${warning.id ?? warning.nazwa_zdarzenia ?? "warning"}`,
      type: "meteorological" as const,
      event: warning.nazwa_zdarzenia ?? "Ostrzeżenie meteorologiczne",
      degree: warning.stopien == null ? null : String(warning.stopien),
      probabilityPercent: numericOrNull(warning.prawdopodobienstwo),
      startsAt: warning.obowiazuje_od ?? null,
      endsAt: warning.obowiazuje_do ?? null,
      publishedAt: warning.opublikowano ?? null,
      area: "powiat wybranej działki",
      description: warning.tresc?.trim() ?? "Brak dodatkowego opisu ostrzeżenia.",
    }];
  });
}

function getHydrologicalWarnings(raw: RawHydrologicalWarning[], voivodeship: string, now: string): ImgwWarning[] {
  const targetRegion = normalize(voivodeship);
  return raw.flatMap((warning) => {
    if (!isActive(warning.data_od, warning.data_do, now)) return [];
    const matchingAreas = (warning.obszary ?? []).filter((area) => normalize(area.wojewodztwo ?? "") === targetRegion);
    if (!matchingAreas.length) return [];
    return [{
      id: `hydro-${warning.numer ?? warning.zdarzenie ?? "warning"}`,
      type: "hydrological" as const,
      event: warning.zdarzenie ?? "Ostrzeżenie hydrologiczne",
      degree: warning.stopień == null ? null : String(warning.stopień),
      probabilityPercent: numericOrNull(warning.prawdopodobienstwo),
      startsAt: warning.data_od ?? null,
      endsAt: warning.data_do ?? null,
      publishedAt: warning.opublikowano ?? null,
      area: matchingAreas.map((area) => area.opis ?? area.wojewodztwo ?? "obszar województwa").join("; "),
      description: warning.przebieg?.trim() ?? "Brak dodatkowego opisu ostrzeżenia.",
    }];
  });
}

export async function POST(request: NextRequest) {
  let body: { parcelId?: unknown; county?: unknown; voivodeship?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawne dane działki." }, { status: 400 });
  }

  const parcelId = typeof body.parcelId === "string" ? body.parcelId : "";
  const teryt = /^(\d{4,6})/.exec(parcelId)?.[1] ?? "";
  if (teryt.length < 4) {
    return NextResponse.json({ error: "Nie można ustalić powiatu działki do sprawdzenia ostrzeżeń IMGW." }, { status: 400 });
  }
  const countyTeryt = teryt.slice(0, 4);
  const county = typeof body.county === "string" ? body.county : "powiat działki";
  const voivodeship = typeof body.voivodeship === "string" ? body.voivodeship : "";
  const cacheKey = `${countyTeryt}:${normalize(voivodeship)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  const [meteorologicalResult, hydrologicalResult] = await Promise.allSettled([
    fetchWarnings<RawMeteorologicalWarning>("https://danepubliczne.imgw.pl/api/data/warningsmeteo"),
    fetchWarnings<RawHydrologicalWarning>("https://danepubliczne.imgw.pl/api/data/warningshydro"),
  ]);
  const now = warsawNow();
  const result: ImgwWarningsResult = {
    fetchedAt: new Date().toISOString(),
    meteorological: meteorologicalResult.status === "fulfilled"
      ? { status: "available", warnings: getMeteorologicalWarnings(meteorologicalResult.value, countyTeryt, now), error: null }
      : { status: "unavailable", warnings: [], error: "Nie udało się pobrać ostrzeżeń meteorologicznych IMGW." },
    hydrological: hydrologicalResult.status === "fulfilled" && voivodeship
      ? { status: "available", warnings: getHydrologicalWarnings(hydrologicalResult.value, voivodeship, now), error: null }
      : hydrologicalResult.status === "rejected"
        ? { status: "unavailable", warnings: [], error: "Nie udało się pobrać ostrzeżeń hydrologicznych IMGW." }
        : { status: "unavailable", warnings: [], error: "Nie udało się ustalić województwa działki." },
    location: { county, voivodeship },
    source: SOURCE,
  };

  if (meteorologicalResult.status === "fulfilled" || hydrologicalResult.status === "fulfilled") {
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  }
  return NextResponse.json(result);
}

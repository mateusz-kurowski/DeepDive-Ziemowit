import { NextResponse } from "next/server";
import type { Geometry } from "geojson";

export const runtime = "nodejs";

const OUTSIDE_POLAND = "Ten punkt leży poza granicami Polski. Wybierz działkę w granicach Polski.";

async function isInPoland(lat: number, lng: number, signal: AbortSignal): Promise<boolean | null> {
  const query = new URLSearchParams({ request: "GetVoivodeshipByXY", xy: `${lng},${lat},4326`, result: "teryt" });
  try {
    const response = await fetch(`https://uldk.gugik.gov.pl/?${query}`, { signal, headers: { Accept: "text/plain" }, cache: "no-store" });
    if (!response.ok) return null;
    const status = (await response.text()).trim().split(/\r?\n/, 1)[0];
    return status === "0" ? true : status.startsWith("-1") ? false : null;
  } catch {
    return null;
  }
}

function parseWktGeometry(wkt: string): Geometry | null {
  const normalizedWkt = wkt.trim().replace(/^SRID=\d+;/i, "");
  const match = /^(POLYGON|MULTIPOLYGON)\s*\(([\s\S]*)\)$/i.exec(normalizedWkt);
  if (!match) return null;

  function unwrap(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return trimmed;
    let depth = 0;
    for (let i = 0; i < trimmed.length; i += 1) {
      if (trimmed[i] === "(") depth += 1;
      else if (trimmed[i] === ")") depth -= 1;
      if (depth === 0 && i < trimmed.length - 1) return trimmed;
    }
    return trimmed.slice(1, -1);
  }

  function splitTopLevel(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") depth -= 1;
      else if (value[i] === "," && depth === 0) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(value.slice(start).trim());
    return parts;
  }

  function parseRing(ring: string): number[][] {
    return splitTopLevel(unwrap(ring)).map((pair) => {
      const coordinates = pair.split(/\s+/).map(Number);
      if (coordinates.length < 2 || coordinates.some((n) => !Number.isFinite(n))) throw new Error("Niepoprawna geometria");
      return coordinates;
    });
  }

  if (match[1] === "POLYGON") {
    return { type: "Polygon", coordinates: splitTopLevel(match[2]).map(parseRing) };
  }
  return {
    type: "MultiPolygon",
    coordinates: splitTopLevel(match[2]).map((polygon) => splitTopLevel(unwrap(polygon)).map(parseRing)),
  };
}

function parseParcelRow(row: string) {
  const [id, parcel, commune, county, voivodeship, ...geometryParts] = row.split("|");
  if (!id || !voivodeship) return null;

  let geometry: Geometry | null = null;
  try {
    geometry = parseWktGeometry(geometryParts.join("|"));
  } catch {
    geometry = null;
  }

  let lat: number | null = null;
  let lng: number | null = null;
  if (geometry?.type === "Polygon") {
    const points = geometry.coordinates.flat();
    if (points.length > 0) {
      lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    }
  } else if (geometry?.type === "MultiPolygon") {
    const points = geometry.coordinates.flat(2);
    if (points.length > 0) {
      lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    }
  }

  return { id, parcel: parcel || id.split(".").at(-1) || "Nieznany", commune, county, voivodeship, lat, lng, geometry };
}

async function lookupParcelsByIdentifier(identifier: string, signal: AbortSignal) {
  const query = new URLSearchParams({
    request: "GetParcelByIdOrNr",
    id: identifier,
    result: "id,parcel,commune,county,voivodeship,geom_wkt",
    srid: "4326",
  });
  const response = await fetch(`https://uldk.gugik.gov.pl/?${query}`, {
    signal,
    headers: { Accept: "text/plain" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("ULDK niedostępne");
  const lines = (await response.text()).trim().split(/\r?\n/);
  const count = Number(lines[0]);
  if (!Number.isFinite(count) || count < 1) {
    return { status: "not-found" as const, parcels: [] };
  }
  const parcels = lines.slice(1).map(parseParcelRow).filter((parcel) => parcel !== null);
  if (parcels.length === 0) {
    return { status: "invalid" as const, parcels: [] };
  }
  return { status: "ok" as const, parcels };
}

export async function POST(request: Request) {
  let body: { lat?: unknown; lng?: unknown; identifier?: unknown; parcelIds?: unknown; identifiers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawne dane punktu." }, { status: 400 });
  }

  const rawBatch = Array.isArray(body.parcelIds)
    ? body.parcelIds
    : Array.isArray(body.identifiers)
      ? body.identifiers
      : null;

  if (rawBatch !== null) {
    const requestedIds = Array.from(
      new Set(
        rawBatch
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && item.length <= 160 && !/[\r\n\u0000-\u001f]/.test(item)),
      ),
    ).slice(0, 25);

    if (requestedIds.length === 0) {
      return NextResponse.json({ error: "Podaj co najmniej jeden poprawny identyfikator działki." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);
    try {
      const settled = await Promise.allSettled(
        requestedIds.map(async (id) => {
          const lookup = await lookupParcelsByIdentifier(id, controller.signal);
          const match = lookup.parcels.find((candidate) => candidate.id === id) ?? lookup.parcels[0] ?? null;
          return { id, status: lookup.status, parcel: match };
        }),
      );

      const parcels = [];
      const errors: Record<string, string> = {};
      for (let i = 0; i < settled.length; i += 1) {
        const entry = settled[i];
        const reqId = requestedIds[i];
        if (entry.status === "fulfilled" && entry.value.parcel) {
          parcels.push(entry.value.parcel);
        } else if (entry.status === "fulfilled" && entry.value.status === "not-found") {
          errors[reqId] = "Nie znaleziono działki w usłudze ULDK.";
        } else {
          errors[reqId] = "Nie udało się pobrać danych działki z usługi GUGiK.";
        }
      }

      if (parcels.length === 0) {
        return NextResponse.json({ error: "Nie udało się wczytać żadnej ze wskazanych działek.", errors }, { status: 404 });
      }
      return NextResponse.json({ parcels, errors });
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Usługa lokalizacji działek odpowiada zbyt długo. Spróbuj ponownie za chwilę."
        : "Nie można teraz połączyć się z usługą GUGiK. Spróbuj ponownie za chwilę.";
      return NextResponse.json({ error: message }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (typeof body.identifier === "string") {
    const identifier = body.identifier.trim();
    if (!identifier || identifier.length > 160 || /[\r\n\u0000-\u001f]/.test(identifier)) {
      return NextResponse.json({ error: "Wpisz poprawny identyfikator działki." }, { status: 400 });
    }
    if (/^\d+(?:\/\d+)*$/.test(identifier)) {
      return NextResponse.json({ error: "Sam numer działki nie wystarczy. Wpisz pełny identyfikator albo nazwę obrębu i numer, np. „Krzewina 134”." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const lookup = await lookupParcelsByIdentifier(identifier, controller.signal);
      if (lookup.status === "not-found") {
        return NextResponse.json({ error: "Nie znaleziono działki. Sprawdź identyfikator lub nazwę obrębu." }, { status: 404 });
      }
      if (lookup.status === "invalid") {
        return NextResponse.json({ error: "ULDK nie zwrócił poprawnych danych działki." }, { status: 502 });
      }
      return NextResponse.json({ parcels: lookup.parcels });
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Usługa lokalizacji działek odpowiada zbyt długo. Spróbuj ponownie za chwilę."
        : "Nie można teraz połączyć się z usługą GUGiK. Spróbuj ponownie za chwilę.";
      return NextResponse.json({ error: message }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Niepoprawne współrzędne punktu." }, { status: 400 });
  }
  if (lat < 49 || lat > 55 || lng < 14 || lng > 24.5) {
    return NextResponse.json({ error: OUTSIDE_POLAND, code: "outside-poland" }, { status: 422 });
  }

  const query = new URLSearchParams({
    request: "GetParcelByXY",
    xy: `${lng},${lat},4326`,
    result: "id,parcel,commune,county,voivodeship,geom_wkt",
    srid: "4326",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`https://uldk.gugik.gov.pl/?${query}`, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("ULDK niedostępne");

    const text = await response.text();
    const [status, row = ""] = text.trim().split(/\r?\n/, 2);
    if (status !== "0" || !row) {
      if ((await isInPoland(lat, lng, controller.signal)) === false) {
        return NextResponse.json({ error: OUTSIDE_POLAND, code: "outside-poland" }, { status: 422 });
      }
      return NextResponse.json({ error: "Nie znaleziono działki w tym miejscu. Spróbuj kliknąć wewnątrz innej działki." }, { status: 404 });
    }

    const parcel = parseParcelRow(row);
    if (!parcel) {
      return NextResponse.json({ error: "Usługa GUGiK zwróciła niepełne dane działki. Kliknij ponownie za chwilę." }, { status: 502 });
    }
    return NextResponse.json({ ...parcel, lat, lng });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Usługa lokalizacji działek odpowiada zbyt długo. Spróbuj ponownie za chwilę."
      : "Nie można teraz połączyć się z usługą GUGiK. Spróbuj ponownie za chwilę.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

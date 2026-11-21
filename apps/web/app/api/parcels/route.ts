import { NextResponse } from "next/server";
import type { Geometry } from "geojson";

export const runtime = "nodejs";

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

  return { id, parcel: parcel || id.split(".").at(-1) || "Nieznany", commune, county, voivodeship, geometry };
}

export async function POST(request: Request) {
  let body: { lat?: unknown; lng?: unknown; identifier?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawne dane punktu." }, { status: 400 });
  }

  if (typeof body.identifier === "string") {
    const identifier = body.identifier.trim();
    if (!identifier || identifier.length > 160 || /[\r\n\u0000-\u001f]/.test(identifier)) {
      return NextResponse.json({ error: "Wpisz poprawny identyfikator działki." }, { status: 400 });
    }
    if (/^\d+(?:\/\d+)*$/.test(identifier)) {
      return NextResponse.json({ error: "Sam numer działki nie wystarczy. Wpisz pełny identyfikator albo nazwę obrębu i numer, np. „Krzewina 134”." }, { status: 400 });
    }

    const query = new URLSearchParams({
      request: "GetParcelByIdOrNr",
      id: identifier,
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
      const lines = (await response.text()).trim().split(/\r?\n/);
      const count = Number(lines[0]);
      if (!Number.isFinite(count) || count < 1) {
        return NextResponse.json({ error: "Nie znaleziono działki. Sprawdź identyfikator lub nazwę obrębu." }, { status: 404 });
      }

      const parcels = lines.slice(1).map(parseParcelRow).filter((parcel) => parcel !== null);
      if (parcels.length === 0) {
        return NextResponse.json({ error: "ULDK nie zwrócił poprawnych danych działki." }, { status: 502 });
      }
      return NextResponse.json({ parcels });
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
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 55 || lng < 14 || lng > 24.5) {
    return NextResponse.json({ error: "Kliknij punkt w granicach Polski." }, { status: 400 });
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
      return NextResponse.json({ error: "Nie znaleziono działki w tym miejscu. Spróbuj kliknąć wewnątrz innej działki." }, { status: 404 });
    }

    const parcel = parseParcelRow(row);
    if (!parcel) {
      return NextResponse.json({ error: "W tym miejscu nie znaleziono działki w granicach Polski." }, { status: 404 });
    }
    return NextResponse.json(parcel);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Usługa lokalizacji działek odpowiada zbyt długo. Spróbuj ponownie za chwilę."
      : "Nie można teraz połączyć się z usługą GUGiK. Spróbuj ponownie za chwilę.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

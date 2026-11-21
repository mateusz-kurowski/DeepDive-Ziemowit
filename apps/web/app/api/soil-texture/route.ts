import { NextResponse } from "next/server";
import { inflateRawSync, inflateSync } from "node:zlib";

export const runtime = "nodejs";

type TiffSample = {
  value: number;
  noData: number | null;
  center: [number, number];
};

function sampleGeoTiff(buffer: Buffer, lng: number, lat: number): TiffSample {
  const byteOrder = buffer.toString("ascii", 0, 2);
  const little = byteOrder === "II";
  if (!little && byteOrder !== "MM") throw new Error("WCS nie zwrócił pliku GeoTIFF.");

  const u16 = (offset: number) => little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const u32 = (offset: number) => little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  if (u16(2) !== 42) throw new Error("Nieobsługiwany format GeoTIFF z usługi SoilGrids.");

  const typeSizes: Record<number, number> = { 1: 1, 3: 2, 4: 4, 6: 1, 7: 1, 8: 2, 9: 4, 12: 8 };
  const tags = new Map<number, (number | string)[]>();
  const ifdOffset = u32(4);
  const entries = u16(ifdOffset);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = typeSizes[type];
    if (!size) continue;
    const offset = count * size <= 4 ? entry + 8 : u32(entry + 8);
    const values: (number | string)[] = [];
    for (let j = 0; j < count; j += 1) {
      const at = offset + j * size;
      if (type === 1 || type === 6 || type === 7) values.push(buffer.readUInt8(at));
      else if (type === 3 || type === 8) values.push(little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
      else if (type === 4 || type === 9) values.push(little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));
      else if (type === 12) values.push(little ? buffer.readDoubleLE(at) : buffer.readDoubleBE(at));
      else if (type === 2) values.push(buffer.toString("ascii", at, at + 1));
    }
    tags.set(tag, values);
  }

  const first = (tag: number, fallback?: number) => Number(tags.get(tag)?.[0] ?? fallback);
  const width = first(256);
  const height = first(257);
  const bits = first(258);
  const compression = first(259);
  const sampleFormat = first(339, 1);
  const predictor = first(317, 1);
  const tiled = tags.has(324);
  const blockWidth = first(tiled ? 322 : 256, width);
  const blockHeight = first(tiled ? 323 : 278, height);
  const offsets = tags.get(tiled ? 324 : 273)?.map(Number) ?? [];
  const byteCounts = tags.get(tiled ? 325 : 279)?.map(Number) ?? [];
  const scale = tags.get(33550)?.map(Number) ?? [];
  const tiepoint = tags.get(33922)?.map(Number) ?? [];
  if (!width || !height || bits !== 16 || ![1, 8, 32946].includes(compression) || scale.length < 2 || tiepoint.length < 6) {
    throw new Error("Usługa SoilGrids zwróciła nieobsługiwany raster.");
  }

  const pixels = Array<number | null>(width * height).fill(null);
  const across = Math.ceil(width / blockWidth);
  const down = Math.ceil(height / blockHeight);
  for (let by = 0; by < down; by += 1) {
    for (let bx = 0; bx < across; bx += 1) {
      const block = by * across + bx;
      let data = buffer.subarray(offsets[block], offsets[block] + byteCounts[block]);
      if (compression !== 1) {
        try { data = inflateSync(data); }
        catch {
          try { data = inflateRawSync(data); }
          catch { throw new Error("Nie udało się rozpakować rastra SoilGrids."); }
        }
      }
      const visibleWidth = Math.min(blockWidth, width - bx * blockWidth);
      const visibleHeight = Math.min(blockHeight, height - by * blockHeight);
      for (let y = 0; y < visibleHeight; y += 1) {
        const currentRow: number[] = [];
        for (let x = 0; x < visibleWidth; x += 1) {
          const at = (y * blockWidth + x) * 2;
          let value = little ? data.readUInt16LE(at) : data.readUInt16BE(at);
          if (predictor === 2 && x > 0) value = (value + currentRow[x - 1]) % 65536;
          if (sampleFormat === 2 && value >= 32768) value -= 65536;
          currentRow.push(value);
          pixels[(by * blockHeight + y) * width + bx * blockWidth + x] = value;
        }
      }
    }
  }

  const originX = tiepoint[3];
  const originY = tiepoint[4];
  const col = Math.min(width - 1, Math.max(0, Math.round((lng - originX) / scale[0] - 0.5)));
  const row = Math.min(height - 1, Math.max(0, Math.round((originY - lat) / scale[1] - 0.5)));
  const value = pixels[row * width + col];
  if (value === null || !Number.isFinite(value)) throw new Error("SoilGrids nie zwrócił wartości dla tej lokalizacji.");
  const noDataText = tags.get(42113)?.join("").replace(/\0+$/, "");
  const noData = noDataText && Number.isFinite(Number(noDataText)) ? Number(noDataText) : null;
  return {
    value,
    noData,
    center: [originX + (col + 0.5) * scale[0], originY - (row + 0.5) * scale[1]],
  };
}

async function fetchFraction(property: "sand" | "silt" | "clay", lat: number, lng: number) {
  const halfWindow = 0.004;
  const service = new URL(`https://maps.isric.org/mapserv?map=/map/${property}.map`);
  const params = service.searchParams;
  params.set("SERVICE", "WCS");
  params.set("VERSION", "2.0.1");
  params.set("REQUEST", "GetCoverage");
  params.set("COVERAGEID", `${property}_0-5cm_mean`);
  params.set("FORMAT", "GEOTIFF_INT16");
  params.append("SUBSET", `Lat(${lat - halfWindow},${lat + halfWindow})`);
  params.append("SUBSET", `Long(${lng - halfWindow},${lng + halfWindow})`);
  params.set("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326");
  params.set("OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326");

  const response = await fetch(service, { signal: AbortSignal.timeout(25_000), headers: { Accept: "image/tiff" } });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`SoilGrids odpowiedział kodem HTTP ${response.status}.`);
  const sample = sampleGeoTiff(bytes, lng, lat);
  if (sample.noData !== null && sample.value === sample.noData) return { valueGkg: null, flag: "nodata", cellCenter: sample.center };
  return { valueGkg: sample.value, flag: sample.value === 0 ? "zero" : "value", cellCenter: sample.center };
}

export async function POST(request: Request) {
  let body: { lat?: unknown; lng?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Niepoprawne współrzędne działki." }, { status: 400 }); }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 55 || lng < 14 || lng > 24.5) {
    return NextResponse.json({ error: "Nie można pobrać gleby poza granicami Polski." }, { status: 400 });
  }

  try {
    const entries = await Promise.all(([["sand", "Piasek"], ["silt", "Pył"], ["clay", "Ił"]] as const).map(async ([key, label]) => {
      try { return [key, { label, ...(await fetchFraction(key, lat, lng)) }] as const; }
      catch (error) { throw new Error(error instanceof Error ? `${label}: ${error.message}` : `${label}: błąd usługi.`); }
    }));
    const fractions = Object.fromEntries(entries);
    const values = Object.values(fractions) as { valueGkg: number | null; flag: string }[];
    const allZero = values.every((item) => item.valueGkg === 0 || item.valueGkg === null)
      && values.some((item) => item.valueGkg === 0);
    const incomplete = values.some((item) => item.valueGkg === null);
    return NextResponse.json({
      status: allZero ? "unresolved-zero" : incomplete ? "partial" : "available",
      depth: "0–5 cm",
      statistic: "mean",
      units: "g/kg",
      fractions,
      samplePoint: { lat, lng },
      source: { name: "ISRIC SoilGrids WCS", resolutionM: 250, url: "https://docs.isric.org/globaldata/soilgrids/" },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && /timeout|timed out/i.test(error.message);
    return NextResponse.json({ error: isTimeout
      ? "SoilGrids odpowiada zbyt długo. Spróbuj ponownie za chwilę."
      : error instanceof Error ? `Nie udało się pobrać uziarnienia gleby: ${error.message}` : "Nie udało się pobrać uziarnienia gleby." }, { status: 502 });
  }
}

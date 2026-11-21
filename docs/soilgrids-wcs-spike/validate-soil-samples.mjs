import { writeFileSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";

const outputDir = new URL("./", import.meta.url);
const properties = ["sand", "silt", "clay"];
const depths = ["0-5cm", "5-15cm", "15-30cm"];
const points = [
  { name: "Krośniewice — centrum Polski", lat: 52.251, lng: 19.249 },
  { name: "Ryki — wschodnia Polska", lat: 51.601, lng: 21.999 },
  { name: "Warszawa — obszar miejski", lat: 52.2297, lng: 21.0122 },
  { name: "Podlaskie — okolice Białegostoku", lat: 53.1, lng: 22.85 },
  { name: "Opolskie — południowy zachód", lat: 50.7, lng: 17.9 },
];
const statistics = ["mean", "Q0.5"];
const windowDegrees = 0.004;
const maxConcurrent = 4;

function decodeGeoTiff(buffer) {
  const byteOrder = buffer.toString("ascii", 0, 2);
  const little = byteOrder === "II";
  if (!little && byteOrder !== "MM") throw new Error(`Odpowiedź nie jest TIFF: ${buffer.toString("utf8", 0, 120)}`);
  const u16 = (offset) => little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const u32 = (offset) => little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  if (u16(2) !== 42) throw new Error("Nieobsługiwany wariant TIFF (wymagany classic TIFF).");

  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  const tags = new Map();
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const n = u32(entry + 4);
    const valueOffset = n * (sizes[type] ?? 0) <= 4 ? entry + 8 : u32(entry + 8);
    const values = [];
    for (let j = 0; j < n; j += 1) {
      const at = valueOffset + j * sizes[type];
      if (type === 1 || type === 6 || type === 7) values.push(buffer.readUInt8(at));
      else if (type === 2) values.push(buffer.toString("ascii", at, at + 1));
      else if (type === 3 || type === 8) values.push(little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
      else if (type === 4 || type === 9) values.push(little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));
      else if (type === 12) values.push(little ? buffer.readDoubleLE(at) : buffer.readDoubleBE(at));
      else values.push(null);
    }
    tags.set(tag, values);
  }

  const scalar = (tag, fallback = null) => tags.get(tag)?.[0] ?? fallback;
  const width = scalar(256);
  const height = scalar(257);
  const bits = scalar(258);
  const compression = scalar(259);
  const sampleFormat = scalar(339, 1);
  const predictor = scalar(317, 1);
  const tiled = tags.has(324);
  const blockWidth = scalar(tiled ? 322 : 256, width);
  const blockHeight = scalar(tiled ? 323 : 278, height);
  const offsets = tags.get(tiled ? 324 : 273) ?? [];
  const byteCounts = tags.get(tiled ? 325 : 279) ?? [];
  if (![8, 16, 32].includes(bits) || ![1, 8, 32946].includes(compression)) {
    throw new Error(`Nieobsługiwany GeoTIFF: bits=${bits}, compression=${compression}`);
  }

  const values = Array(width * height).fill(null);
  const across = Math.ceil(width / blockWidth);
  const down = Math.ceil(height / blockHeight);
  const bytesPerSample = bits / 8;
  for (let blockY = 0; blockY < down; blockY += 1) {
    for (let blockX = 0; blockX < across; blockX += 1) {
      const blockIndex = blockY * across + blockX;
      const from = offsets[blockIndex];
      const compressed = buffer.subarray(from, from + byteCounts[blockIndex]);
      let tile = compressed;
      if (compression !== 1) {
        try { tile = inflateSync(compressed); }
        catch { tile = inflateRawSync(compressed); }
      }
      const visibleWidth = Math.min(blockWidth, width - blockX * blockWidth);
      const visibleHeight = Math.min(blockHeight, height - blockY * blockHeight);
      for (let y = 0; y < visibleHeight; y += 1) {
        let previous = 0;
        for (let x = 0; x < visibleWidth; x += 1) {
          const at = (y * blockWidth + x) * bytesPerSample;
          let value = bits === 8 ? tile.readUInt8(at)
            : bits === 16 ? (little ? tile.readUInt16LE(at) : tile.readUInt16BE(at))
              : (little ? tile.readUInt32LE(at) : tile.readUInt32BE(at));
          if (predictor === 2 && x > 0) value = (value + previous) % (2 ** bits);
          previous = value;
          if (sampleFormat === 2 && value >= 2 ** (bits - 1)) value -= 2 ** bits;
          const outX = blockX * blockWidth + x;
          const outY = blockY * blockHeight + y;
          values[outY * width + outX] = value;
        }
      }
    }
  }

  const scale = tags.get(33550) ?? [];
  const tiepoint = tags.get(33922) ?? [];
  const noData = tags.get(42113)?.join("").replace(/\0+$/, "") ?? null;
  return { width, height, values, scale, tiepoint, noData };
}

async function lookupParcel(point) {
  const params = new URLSearchParams({
    request: "GetParcelByXY",
    xy: `${point.lng},${point.lat},4326`,
    result: "id,parcel,commune,county,voivodeship",
  });
  const response = await fetch(`https://uldk.gugik.gov.pl/?${params}`, { signal: AbortSignal.timeout(20_000) });
  const [status, row = ""] = (await response.text()).trim().split(/\r?\n/, 2);
  if (!response.ok || status !== "0") return { status: "not-found", id: null };
  const [id, parcel, commune, county, voivodeship] = row.split("|");
  return { status: "found", id, parcel, commune, county, voivodeship };
}

async function fetchCoverage(point, property, depth, statistic) {
  const service = new URL(`https://maps.isric.org/mapserv?map=/map/${property}.map`);
  const params = service.searchParams;
  params.set("SERVICE", "WCS");
  params.set("VERSION", "2.0.1");
  params.set("REQUEST", "GetCoverage");
  params.set("COVERAGEID", `${property}_${depth}_${statistic}`);
  params.set("FORMAT", "GEOTIFF_INT16");
  params.append("SUBSET", `Lat(${point.lat - windowDegrees},${point.lat + windowDegrees})`);
  params.append("SUBSET", `Long(${point.lng - windowDegrees},${point.lng + windowDegrees})`);
  params.set("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326");
  params.set("OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326");

  const response = await fetch(service, {
    headers: { Accept: "image/tiff" },
    signal: AbortSignal.timeout(30_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${property}/${depth}/${statistic}: HTTP ${response.status} ${bytes.toString("utf8", 0, 200)}`);
  const raster = decodeGeoTiff(bytes);
  const [i0 = 0, i1 = 0, i2 = 0, i3 = 0, i4 = 0, i5 = 0] = raster.tiepoint;
  const [pixelLng, , , pixelLat] = [
    i3 + raster.scale[0] / 2,
    i4,
    i5,
    i4 - raster.scale[1] / 2,
  ];
  const col = Math.min(raster.width - 1, Math.max(0, Math.round((point.lng - i3) / raster.scale[0] - 0.5)));
  const row = Math.min(raster.height - 1, Math.max(0, Math.round((i4 - point.lat) / raster.scale[1] - 0.5)));
  const raw = raster.values[row * raster.width + col];
  const isNoData = raw === null || (raster.noData !== null && Number(raster.noData) === raw);
  return {
    property, depth, statistic,
    valueGkg: isNoData ? null : raw,
    percent: isNoData ? null : raw / 10,
    valueFlag: isNoData ? "nodata-tag-or-empty" : raw === 0 ? "zero-no-nodata-tag" : "value",
    raster: {
      width: raster.width,
      height: raster.height,
      scaleDegrees: raster.scale.slice(0, 2),
      selectedCellCenter: [pixelLng, pixelLat],
      noDataTag: raster.noData,
      selectedPixelIndex: [col, row],
    },
  };
}

async function runLimited(tasks, limit) {
  const results = Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const parcelLookups = await runLimited(points.map((point) => () => lookupParcel(point)), 2);
const tasks = [];
for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
  const point = points[pointIndex];
  for (const depth of depths) {
    for (const statistic of statistics) {
      for (const property of properties) {
        tasks.push(async () => ({
          pointIndex,
          depth,
          statistic,
          property,
          result: await fetchCoverage(point, property, depth, statistic),
        }));
      }
    }
  }
}

const rawSamples = await runLimited(tasks, maxConcurrent);
const samples = points.map((point, pointIndex) => {
  const pointSamples = rawSamples.filter((sample) => sample.pointIndex === pointIndex);
  const groups = [];
  for (const depth of depths) {
    for (const statistic of statistics) {
      const values = Object.fromEntries(pointSamples
        .filter((sample) => sample.depth === depth && sample.statistic === statistic)
        .map((sample) => [sample.property, sample.result]));
      const gkg = properties.map((property) => values[property]?.valueGkg ?? null);
      const complete = gkg.every((value) => value !== null);
      groups.push({
        depth,
        statistic,
        fractions: values,
        sumGkg: complete ? gkg.reduce((sum, value) => sum + value, 0) : null,
        sumPercent: complete ? Math.round(gkg.reduce((sum, value) => sum + value, 0)) / 10 : null,
        hasZeroWithoutNoDataTag: properties.some((property) => values[property]?.valueFlag === "zero-no-nodata-tag"),
      });
    }
  }
  return { ...point, parcel: parcelLookups[pointIndex], groups };
});

const result = {
  generatedAt: new Date().toISOString(),
  source: "ISRIC SoilGrids WCS 2.0.1; GUGiK ULDK GetParcelByXY",
  request: {
    properties,
    depths,
    statistics,
    outputFormat: "GEOTIFF_INT16",
    subsettingCrs: "EPSG:4326",
    outputCrs: "EPSG:4326",
    bboxHalfSizeDegrees: windowDegrees,
    maxConcurrent,
  },
  units: "SoilGrids returns texture fractions in g/kg; percent = g/kg / 10.",
  samples,
};

const jsonPath = new URL("./soil-validation.json", outputDir);
const csvPath = new URL("./soil-validation.csv", outputDir);
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
const csvRows = ["point,parcel_id,commune,lat,lng,depth,statistic,sand_gkg,silt_gkg,clay_gkg,sum_gkg,sum_percent,zero_without_nodata"];
for (const sample of samples) {
  for (const group of sample.groups) {
    const { sand, silt, clay } = group.fractions;
    csvRows.push([
      JSON.stringify(sample.name), JSON.stringify(sample.parcel.id ?? ""), JSON.stringify(sample.parcel.commune ?? ""),
      sample.lat, sample.lng, group.depth, group.statistic,
      sand.valueGkg ?? "", silt.valueGkg ?? "", clay.valueGkg ?? "", group.sumGkg ?? "", group.sumPercent ?? "",
      group.hasZeroWithoutNoDataTag,
    ].join(","));
  }
}
writeFileSync(csvPath, `${csvRows.join("\n")}\n`, "utf8");
console.log(`Zapisano ${samples.length} lokalizacji i ${rawSamples.length} próbek do soil-validation.json oraz soil-validation.csv`);

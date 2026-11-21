import { readFileSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";

const filePath = process.argv[2];
if (!filePath) {
  throw new Error("Usage: node inspect-geotiff.mjs <file.tif>");
}

const bytes = readFileSync(filePath);
const byteOrder = bytes.toString("ascii", 0, 2);
const littleEndian = byteOrder === "II";
if (!littleEndian && byteOrder !== "MM") throw new Error("Not a TIFF file");
const u16 = (offset) => littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
const u32 = (offset) => littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
if (u16(2) !== 42) throw new Error("Only classic TIFF is supported by this small inspection script");

const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const ifdOffset = u32(4);
const entryCount = u16(ifdOffset);
const tags = new Map();

function readValues(type, count, offset) {
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const itemOffset = offset + i * typeSizes[type];
    if (type === 1 || type === 6 || type === 7) values.push(bytes.readUInt8(itemOffset));
    else if (type === 3 || type === 8) values.push(u16(itemOffset));
    else if (type === 4 || type === 9) values.push(u32(itemOffset));
    else if (type === 2) values.push(bytes.toString("ascii", itemOffset, itemOffset + 1));
    else if (type === 12) values.push(littleEndian ? bytes.readDoubleLE(itemOffset) : bytes.readDoubleBE(itemOffset));
    else values.push(`unsupported-type-${type}`);
  }
  return values;
}

for (let i = 0; i < entryCount; i += 1) {
  const entryOffset = ifdOffset + 2 + i * 12;
  const tag = u16(entryOffset);
  const type = u16(entryOffset + 2);
  const count = u32(entryOffset + 4);
  const valueOffset = count * (typeSizes[type] ?? 0) <= 4 ? entryOffset + 8 : u32(entryOffset + 8);
  tags.set(tag, readValues(type, count, valueOffset));
}

const scalar = (tag, fallback = null) => tags.get(tag)?.[0] ?? fallback;
const width = scalar(256);
const height = scalar(257);
const bitsPerSample = scalar(258);
const compression = scalar(259);
const samplesPerPixel = scalar(277, 1);
const sampleFormat = scalar(339, 1);
const predictor = scalar(317, 1);
const isTiled = tags.has(324);
const dataOffsets = tags.get(isTiled ? 324 : 273) ?? [];
const dataByteCounts = tags.get(isTiled ? 325 : 279) ?? [];
const blockWidth = scalar(isTiled ? 322 : 256, width);
const blockHeight = scalar(isTiled ? 323 : 278, height);
const pixels = [];

if (![1, 8, 32946].includes(compression)) throw new Error(`Unsupported TIFF compression: ${compression}`);
if (samplesPerPixel !== 1) throw new Error(`Expected one raster band, got ${samplesPerPixel}`);
if (![8, 16, 32].includes(bitsPerSample)) throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);

const bytesPerSample = bitsPerSample / 8;
const blocksAcross = Math.ceil(width / blockWidth);
const blocksDown = Math.ceil(height / blockHeight);
for (let blockY = 0; blockY < blocksDown; blockY += 1) {
  for (let blockX = 0; blockX < blocksAcross; blockX += 1) {
    const block = blockY * blocksAcross + blockX;
    const start = dataOffsets[block];
    const end = start + dataByteCounts[block];
    const compressed = bytes.subarray(start, end);
  let stripData = compressed;
  if (compression !== 1) {
    try { stripData = inflateSync(compressed); }
    catch { stripData = inflateRawSync(compressed); }
  }
    const visibleWidth = Math.min(blockWidth, width - blockX * blockWidth);
    const visibleHeight = Math.min(blockHeight, height - blockY * blockHeight);
    for (let y = 0; y < visibleHeight; y += 1) {
      let previous = 0;
      for (let x = 0; x < visibleWidth; x += 1) {
        const offset = (y * blockWidth + x) * bytesPerSample;
        let unsigned;
        if (bitsPerSample === 8) unsigned = stripData.readUInt8(offset);
        else if (bitsPerSample === 16) unsigned = littleEndian ? stripData.readUInt16LE(offset) : stripData.readUInt16BE(offset);
        else unsigned = littleEndian ? stripData.readUInt32LE(offset) : stripData.readUInt32BE(offset);
        if (predictor === 2 && x > 0) unsigned = (unsigned + previous) % (2 ** bitsPerSample);
        previous = unsigned;
        const value = sampleFormat === 2 && unsigned >= (2 ** (bitsPerSample - 1))
          ? unsigned - (2 ** bitsPerSample)
          : unsigned;
        pixels.push(value);
      }
    }
  }
}

console.log(JSON.stringify({
  file: filePath,
  byteOrder,
  width,
  height,
  bitsPerSample,
  sampleFormat,
  predictor,
  compression,
  samplesPerPixel,
  isTiled,
  blockWidth,
  blockHeight,
  tagIds: [...tags.keys()],
  dataOffsets,
  dataByteCounts,
  modelPixelScale: tags.get(33550) ?? null,
  modelTiepoint: tags.get(33922) ?? null,
  noData: tags.get(42113)?.join("") ?? null,
  pixels,
}, null, 2));

"use client";

import type { Geometry } from "geojson";

type SatelliteImageProps = {
  src: string;
  alt: string;
  geometry: Geometry | null;
  bounds: [number, number, number, number] | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
};

function ringPath(
  ring: number[][],
  bounds: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): string {
  const [west, south, east, north] = bounds;
  return ring.map((pair, index) => {
    const x = ((pair[0] - west) / (east - west)) * imageWidth;
    const y = ((north - pair[1]) / (north - south)) * imageHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";
}

export default function SatelliteImage({ src, alt, geometry, bounds, imageWidth, imageHeight }: SatelliteImageProps) {
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry?.type === "MultiPolygon"
      ? geometry.coordinates as number[][][][]
      : [];
  const width = imageWidth ?? 320;
  const height = imageHeight ?? 220;

  return (
    <div className="satellite-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} />
      {bounds && polygons.length > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {polygons.map((polygon, polygonIndex) => (
            <path
              key={polygonIndex}
              d={ringPath(polygon[0], bounds, width, height)}
              fill="rgba(22, 128, 91, 0.08)"
              stroke="#16805b"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

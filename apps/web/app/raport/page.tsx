import type { Metadata } from "next";
import ReportView from "./ReportView";

export const metadata: Metadata = {
  title: "Raport wodny działki – Ziemowit",
};

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePointPair(raw: string): { lat: number; lng: number } | null {
  const [latText, lngText] = raw.split(",");
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export default async function ReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

  const rawIds = [
    ...toArray(params.id).map((item) => item.trim()).filter(Boolean),
    ...toArray(params.ids)
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  ];

  const parcelIds: string[] = [];
  const points: Array<{ lat: number; lng: number } | null> = [];
  const rawPoints = toArray(params.pt);
  const seen = new Set<string>();

  for (let i = 0; i < rawIds.length; i += 1) {
    const id = rawIds[i];
    if (seen.has(id)) continue;
    seen.add(id);
    parcelIds.push(id);
    points.push(rawPoints[i] ? parsePointPair(rawPoints[i]) : null);
  }

  const lat = Number(single(params.lat));
  const lng = Number(single(params.lng));
  const legacyPoint = single(params.lat) && single(params.lng) && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;

  if (parcelIds.length === 1 && points[0] === null && legacyPoint !== null) {
    points[0] = legacyPoint;
  }

  return (
    <ReportView
      parcelId={parcelIds[0] ?? ""}
      parcelIds={parcelIds}
      crop={single(params.crop) || "zboza"}
      point={points[0] ?? legacyPoint}
      points={points}
    />
  );
}

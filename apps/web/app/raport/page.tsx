import type { Metadata } from "next";
import ReportView from "./ReportView";
import "../styles.css";

export const metadata: Metadata = {
  title: "Raport wodny działki – Zatrzymaj wodę, chroń plony",
};

export default async function ReportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const lat = Number(single(params.lat));
  const lng = Number(single(params.lng));

  return (
    <ReportView
      parcelId={single(params.id)}
      crop={single(params.crop) || "zboza"}
      point={single(params.lat) && single(params.lng) && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type {
  HydroResult,
  HydroStation,
  ImgwWarning,
  ImgwWarningsResult,
  ParcelResult,
  SatelliteResult,
  WeatherResult,
} from "../types";
import BrandLogo from "../components/BrandLogo";
import SatelliteImage from "../components/SatelliteImage";
import { buildAdvice, timingLabel, type Advice } from "./advice";
import {
  buildSimpleTiles,
  buildSummary,
  type FindingLevel,
  type ReportSummary,
  type SimpleTile,
} from "./findings";

type ReportMode = "simple" | "detailed";
const MODE_KEY = "report-mode";

const ParcelMap = dynamic(() => import("../components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="report-map map-placeholder">Ładowanie mapy…</div>,
});

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

type ParcelEntryState = {
  requestedId: string;
  fallbackPoint: { lat: number; lng: number } | null;
  parcel: LoadState<ParcelResult>;
  weather: LoadState<WeatherResult>;
  hydro: LoadState<HydroResult>;
  satellite: LoadState<SatelliteResult>;
};

async function postJson<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  fallbackMessage = "Nie udało się pobrać danych. Spróbuj ponownie później.",
  hideServerError = false,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(fallbackMessage);
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error(fallbackMessage);
  }
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
  if (!response.ok) {
    const errorValue = result && typeof result === "object" ? (result as { error?: unknown }).error : null;
    const serverMessage = typeof errorValue === "string" ? errorValue : fallbackMessage;
    const technicalMessage = /json\.parse|syntaxerror|unexpected (?:character|token)|<!doctype|<html/i.test(serverMessage);
    throw new Error(hideServerError || technicalMessage ? fallbackMessage : serverMessage);
  }
  return result as T;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function polishParcelsLabel(count: number): string {
  if (count === 1) return "1 działka";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} działki`;
  }
  return `${count} działek`;
}

function polishParcelsGenitive(count: number): string {
  return count === 1 ? "1 działki" : `${count} działek`;
}

const TIMING_ORDER: Record<Advice["timing"], number> = {
  now: 0,
  week: 1,
  season: 2,
};

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const current = nextIndex;
      nextIndex += 1;
      await tasks[current]();
    }
  });
  await Promise.all(workers);
}

const stationLabel: Record<HydroStation["status"], string> = {
  normal: "Stan normalny",
  warning: "Stan ostrzegawczy",
  alarm: "Stan alarmowy",
  unknown: "Brak progów",
};

const soilLabel: Record<HydroResult["soil"]["status"], string> = {
  dry: "Sucha",
  moderate: "Umiarkowana",
  wet: "Wilgotna",
  unknown: "Brak danych",
};

function warningDegreeLabel(degree: string | null) {
  if (degree === "-1") return "informacja";
  return degree ? `stopień ${degree}` : "ostrzeżenie";
}

function warningDate(value: string | null) {
  if (!value || value.startsWith("9999-")) return null;
  return value ? value.slice(0, 16).replace("T", " ") : "brak daty";
}

function WarningList({ title, warnings }: { title: string; warnings: ImgwWarning[] }) {
  const grouped = warnings.reduce<Map<string, ImgwWarning[]>>((groups, warning) => {
    const key = warning.event;
    groups.set(key, [...(groups.get(key) ?? []), warning]);
    return groups;
  }, new Map());

  return (
    <div className="imgw-warning-group">
      <div className="imgw-warning-group-heading">
        <h3 className="report-subtitle">{title}</h3>
        {warnings.length > 0 && <span className="imgw-warning-count">{warnings.length} {warnings.length === 1 ? "ostrzeżenie" : warnings.length < 5 ? "ostrzeżenia" : "ostrzeżeń"}</span>}
      </div>
      {warnings.length ? (
        <div className="imgw-warning-list">
          {[...grouped.entries()].map(([event, entries]) => (
            <details key={event} className="imgw-warning-item">
              <summary className="imgw-warning-heading">
                <span className="imgw-warning-title">
                  <svg className="imgw-warning-icon" aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 3 2.8 19.1A1.9 1.9 0 0 0 4.45 22h15.1A1.9 1.9 0 0 0 21.2 19.1L12 3Z" fill="currentColor" />
                    <path d="M12 8.2v6.1M12 17.7v.1" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <strong>{event}</strong>
                </span>
                <span>{entries.length} {entries.length === 1 ? "komunikat" : entries.length < 5 ? "komunikaty" : "komunikatów"}</span>
              </summary>
              <div className="imgw-warning-details">
                {entries.map((warning) => (
                  <article key={warning.id} className="imgw-warning-detail">
                    <div className="imgw-warning-detail-heading">
                      <strong>{warningDegreeLabel(warning.degree)}</strong>
                      {warningDate(warning.endsAt) && <span>Do: {warningDate(warning.endsAt)}</span>}
                    </div>
                    <p>{warning.description}</p>
                    <small title={warning.area}>Obszar: {warning.area}</small>
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : <p className="report-note">Brak obecnych ostrzeżeń w sprawdzonym obszarze.</p>}
    </div>
  );
}

const cropLabels: Record<string, string> = {
  zboza: "zboża",
  rzepak: "rzepak",
  ziemniaki: "ziemniaki",
  buraki: "buraki",
  kukorydza: "kukurydza",
  owoce: "owoce i sad",
  warzywa: "warzywa",
  inna: "inna uprawa",
};

const LEVEL_RANK: Record<FindingLevel, number> = {
  bad: 4,
  warn: 3,
  info: 2,
  good: 1,
};

function formatRange(values: number[], unit: string, digits = 1, signed = false): string {
  if (values.length === 0) return "Brak danych";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const fmt = (val: number) => `${signed && val > 0 ? "+" : ""}${val.toFixed(digits)}`;
  if (Math.abs(max - min) < 10 ** -digits) {
    return `${fmt(min)}${unit ? ` ${unit}` : ""}`;
  }
  return `${fmt(min)} – ${fmt(max)}${unit ? ` ${unit}` : ""}`;
}

type EvaluatedParcel = {
  requestedId: string;
  entry: ParcelEntryState;
  parcelData: ParcelResult | null;
  weatherData: WeatherResult | null;
  hydroData: HydroResult | null;
  satelliteData: SatelliteResult | null;
  dataLoading: boolean;
  summary: ReportSummary | null;
  tiles: SimpleTile[];
  advice: Advice[];
  label: string;
};

export default function ReportView({
  parcelId = "",
  parcelIds,
  point = null,
  points,
  crop,
}: {
  parcelId?: string;
  parcelIds?: string[];
  point?: { lat: number; lng: number } | null;
  points?: Array<{ lat: number; lng: number } | null>;
  crop: string;
}) {
  const effectiveIds = useMemo(() => {
    const raw = parcelIds && parcelIds.length > 0 ? parcelIds : parcelId ? [parcelId] : [];
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const item of raw) {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        clean.push(trimmed);
      }
    }
    return clean;
  }, [parcelId, parcelIds]);

  const pointsKey = useMemo(
    () => (points && points.length > 0
      ? points.map((pt) => (pt ? `${pt.lat},${pt.lng}` : "")).join("|")
      : point ? `${point.lat},${point.lng}` : ""),
    [point, points],
  );

  const isMulti = effectiveIds.length > 1;

  const [entriesById, setEntriesById] = useState<Record<string, ParcelEntryState>>({});
  const [imgwWarnings, setImgwWarnings] = useState<LoadState<ImgwWarningsResult>>({ status: "loading" });
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<ReportMode>("simple");
  const [activeChapterFilter, setActiveChapterFilter] = useState<string>("all");
  const [focusedMapParcelId, setFocusedMapParcelId] = useState<string | null>(null);

  useEffect(() => {
    setGeneratedAt(new Date());
    if (localStorage.getItem(MODE_KEY) === "detailed") setMode("detailed");
  }, []);

  function changeMode(next: ReportMode) {
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    setActiveChapterFilter("all");
    setFocusedMapParcelId(null);

    if (effectiveIds.length === 0) {
      setEntriesById({});
      setImgwWarnings({ status: "error", message: "Brak identyfikatora działki do sprawdzenia ostrzeżeń IMGW." });
      return;
    }

    const initialEntries: Record<string, ParcelEntryState> = {};
    effectiveIds.forEach((id, idx) => {
      const fallbackPoint = (points && points[idx]) ? points[idx] : (idx === 0 ? point : null);
      initialEntries[id] = {
        requestedId: id,
        fallbackPoint,
        parcel: { status: "loading" },
        weather: { status: "loading" },
        hydro: { status: "loading" },
        satellite: { status: "loading" },
      };
    });
    setEntriesById(initialEntries);
    setImgwWarnings({ status: "loading" });

    const controller = new AbortController();

    function patchEntry(id: string, patch: Partial<ParcelEntryState>) {
      if (controller.signal.aborted) return;
      setEntriesById((prev) => {
        const current = prev[id];
        if (!current) return prev;
        return { ...prev, [id]: { ...current, ...patch } };
      });
    }

    (async () => {

      const resolvedMap = new Map<string, ParcelResult>();

      if (effectiveIds.length === 1) {
        const singleId = effectiveIds[0];
        const fallback = initialEntries[singleId].fallbackPoint;
        try {
          const result = await postJson<{ parcels: ParcelResult[] }>("/api/parcels", { identifier: singleId }, controller.signal);
          const selected = result.parcels.find((candidate) => candidate.id === singleId) ?? result.parcels[0];
          resolvedMap.set(singleId, selected);
          patchEntry(singleId, { parcel: { status: "ready", data: selected } });
        } catch (reason) {
          if (controller.signal.aborted) return;
          const message = errorMessage(reason, "Nie udało się wczytać działki.");
          patchEntry(singleId, { parcel: { status: "error", message } });
          if (fallback) {
            resolvedMap.set(singleId, {
              id: singleId,
              parcel: singleId,
              commune: "",
              county: "",
              voivodeship: "",
              lat: fallback.lat,
              lng: fallback.lng,
              geometry: null,
            });
          } else {
            patchEntry(singleId, {
              weather: { status: "error", message: "Brak lokalizacji działki." },
              hydro: { status: "error", message: "Brak lokalizacji działki." },
              satellite: { status: "error", message: "Brak lokalizacji działki." },
            });
            setImgwWarnings({ status: "error", message });
            return;
          }
        }
      } else {
        try {
          const batchResult = await postJson<{ parcels: ParcelResult[]; errors?: Record<string, string> }>(
            "/api/parcels",
            { parcelIds: effectiveIds },
            controller.signal,
          );
          for (const reqId of effectiveIds) {
            const match = batchResult.parcels.find((item) => item.id === reqId);
            if (match) {
              resolvedMap.set(reqId, match);
              patchEntry(reqId, { parcel: { status: "ready", data: match } });
            } else {
              const fallback = initialEntries[reqId].fallbackPoint;
              const errMsg = batchResult.errors?.[reqId] ?? "Nie udało się wczytać danych tej działki.";
              patchEntry(reqId, { parcel: { status: "error", message: errMsg } });
              if (fallback) {
                resolvedMap.set(reqId, {
                  id: reqId,
                  parcel: reqId,
                  commune: "",
                  county: "",
                  voivodeship: "",
                  lat: fallback.lat,
                  lng: fallback.lng,
                  geometry: null,
                });
              } else {
                patchEntry(reqId, {
                  weather: { status: "error", message: "Brak lokalizacji działki." },
                  hydro: { status: "error", message: "Brak lokalizacji działki." },
                  satellite: { status: "error", message: "Brak lokalizacji działki." },
                });
              }
            }
          }
        } catch (reason) {
          if (controller.signal.aborted) return;
          const message = errorMessage(reason, "Nie udało się wczytać wskazanych działek.");
          for (const reqId of effectiveIds) {
            const fallback = initialEntries[reqId].fallbackPoint;
            patchEntry(reqId, { parcel: { status: "error", message } });
            if (fallback) {
              resolvedMap.set(reqId, {
                id: reqId,
                parcel: reqId,
                commune: "",
                county: "",
                voivodeship: "",
                lat: fallback.lat,
                lng: fallback.lng,
                geometry: null,
              });
            } else {
              patchEntry(reqId, {
                weather: { status: "error", message: "Brak lokalizacji działki." },
                hydro: { status: "error", message: "Brak lokalizacji działki." },
                satellite: { status: "error", message: "Brak lokalizacji działki." },
              });
            }
          }
        }
      }

      if (controller.signal.aborted) return;

      const resolvedList = Array.from(resolvedMap.values());
      if (resolvedList.length === 1) {
        const only = resolvedList[0];
        void postJson<ImgwWarningsResult>(
          "/api/imgw-warnings",
          { parcelId: only.id, county: only.county, voivodeship: only.voivodeship },
          controller.signal,
          "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.",
        )
          .then((data) => { if (!controller.signal.aborted) setImgwWarnings({ status: "ready", data }); })
          .catch((reason) => {
            if (!controller.signal.aborted) {
              setImgwWarnings({ status: "error", message: errorMessage(reason, "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.") });
            }
          });
      } else if (resolvedList.length > 1) {
        void postJson<ImgwWarningsResult>(
          "/api/imgw-warnings",
          {
            parcels: resolvedList.map((item) => ({
              parcelId: item.id,
              county: item.county,
              voivodeship: item.voivodeship,
            })),
          },
          controller.signal,
          "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.",
        )
          .then((data) => { if (!controller.signal.aborted) setImgwWarnings({ status: "ready", data }); })
          .catch((reason) => {
            if (!controller.signal.aborted) {
              setImgwWarnings({ status: "error", message: errorMessage(reason, "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.") });
            }
          });
      } else {
        setImgwWarnings({ status: "error", message: "Brak poprawnych działek do sprawdzenia ostrzeżeń IMGW." });
      }

      const tasks = effectiveIds.map((reqId) => async () => {
        const selected = resolvedMap.get(reqId);
        if (!selected) return;
        const fallback = initialEntries[reqId].fallbackPoint;
        const lat = (effectiveIds.length === 1 ? fallback?.lat : null) ?? selected.lat ?? fallback?.lat ?? null;
        const lng = (effectiveIds.length === 1 ? fallback?.lng : null) ?? selected.lng ?? fallback?.lng ?? null;

        if (lat == null || lng == null) {
          patchEntry(reqId, {
            weather: { status: "error", message: "Brak współrzędnych działki." },
            hydro: { status: "error", message: "Brak współrzędnych działki." },
            satellite: { status: "error", message: "Brak współrzędnych działki." },
          });
          return;
        }


        const hydroPromise = postJson<HydroResult>("/api/hydro", { latitude: lat, longitude: lng }, controller.signal)
          .then((data) => patchEntry(reqId, { hydro: { status: "ready", data } }))
          .catch((reason) => patchEntry(reqId, { hydro: { status: "error", message: errorMessage(reason, "Dane hydrologiczne niedostępne.") } }));

        const weatherAndSatPromise = (async () => {
          let weatherAvailable = false;
          try {
            const data = await postJson<WeatherResult>("/api/weather", { latitude: lat, longitude: lng, date: todayIso() }, controller.signal);
            weatherAvailable = true;
            patchEntry(reqId, { weather: { status: "ready", data } });
          } catch (reason) {
            patchEntry(reqId, { weather: { status: "error", message: errorMessage(reason, "Dane meteorologiczne niedostępne.") } });
          }
          if (controller.signal.aborted) return;
          try {
            const data = await postJson<SatelliteResult>(
              "/api/satellite",
              {
                lat,
                lng,
                geometry: selected.geometry,
                crop,
                weatherAvailable,
              },
              controller.signal,
              "Wskaźniki satelitarne są chwilowo niedostępne. Pozostałe dane raportu są nadal dostępne.",
              true,
            );
            patchEntry(reqId, { satellite: { status: "ready", data } });
          } catch (reason) {
            patchEntry(reqId, { satellite: { status: "error", message: errorMessage(reason, "Dane satelitarne niedostępne.") } });
          }
        })();

        await Promise.all([hydroPromise, weatherAndSatPromise]);
      });


      await runWithConcurrency(tasks, 3);
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIds.join("|"), pointsKey, crop]);


  const reportDate = useMemo(() => generatedAt ?? new Date(), [generatedAt]);
  const detailed = mode === "detailed";
  const cropName = cropLabels[crop] ?? "wybrana uprawa";

  const evaluatedParcels: EvaluatedParcel[] = useMemo(() => {
    return effectiveIds.map((reqId) => {
      const entry: ParcelEntryState = entriesById[reqId] ?? {
        requestedId: reqId,
        fallbackPoint: null,
        parcel: { status: "loading" },
        weather: { status: "loading" },
        hydro: { status: "loading" },
        satellite: { status: "loading" },
      };
      const parcelData = entry.parcel.status === "ready" ? entry.parcel.data : null;
      const weatherData = entry.weather.status === "ready" ? entry.weather.data : null;
      const hydroData = entry.hydro.status === "ready" ? entry.hydro.data : null;
      const satelliteData = entry.satellite.status === "ready" ? entry.satellite.data : null;
      const dataLoading = entry.weather.status === "loading" || entry.hydro.status === "loading";
      const satelliteArg = entry.satellite.status === "loading" ? undefined : satelliteData;
      const latitude = entry.fallbackPoint?.lat ?? parcelData?.lat ?? hydroData?.location.latitude ?? null;

      const summary = dataLoading || (!weatherData && !hydroData)
        ? null
        : buildSummary(weatherData, hydroData, satelliteArg, {
            date: reportDate,
            crop,
            latitude,
          });

      const tiles = summary
        ? buildSimpleTiles(weatherData, hydroData, satelliteArg, {
            date: reportDate,
            crop,
            latitude,
          })
        : [];

      const advice = summary
        ? buildAdvice({
            kind: summary.verdict.kind,
            weather: weatherData,
            hydro: hydroData,
            satellite: satelliteArg,
            crop,
            month: reportDate.getMonth(),
            date: reportDate,
            latitude,
          })
        : [];

      return {
        requestedId: reqId,
        entry,
        parcelData,
        weatherData,
        hydroData,
        satelliteData,
        dataLoading,
        summary,
        tiles,
        advice,
        label: parcelData ? parcelData.parcel : reqId,
      };
    });
  }, [effectiveIds, entriesById, reportDate, crop]);

  const anyDataLoading = evaluatedParcels.some(
    (item) => item.dataLoading || item.entry.satellite.status === "loading",
  );

  const readyParcels = useMemo(
    () => evaluatedParcels
      .map((item) => item.parcelData)
      .filter((item): item is ParcelResult => item !== null),
    [evaluatedParcels],
  );

  const aggregateOverview = useMemo(() => {
    if (!isMulti) return null;
    const withSummary = evaluatedParcels.filter((item) => item.summary !== null);
    if (withSummary.length === 0) return null;

    let worstLevel: FindingLevel = "good";
    for (const item of withSummary) {
      const lvl = item.summary!.verdict.level;
      if (LEVEL_RANK[lvl] > LEVEL_RANK[worstLevel]) worstLevel = lvl;
    }

    const deficitParcels = withSummary.filter((item) =>
      item.summary!.verdict.kind === "deficit-high"
      || item.summary!.verdict.kind === "deficit"
      || item.summary!.verdict.kind === "deficit-watch",
    );
    const excessParcels = withSummary.filter((item) =>
      item.summary!.verdict.kind === "flood"
      || item.summary!.verdict.kind === "wet"
      || item.summary!.verdict.kind === "drought-high-water",
    );
    const stableParcels = withSummary.filter((item) => item.summary!.verdict.kind === "stable");

    let title = "Warunki wodne stabilne na wszystkich działkach";
    if (deficitParcels.length > 0 && excessParcels.length > 0) {
      title = "Zróżnicowane warunki wodne między działkami";
    } else if (deficitParcels.length === withSummary.length) {
      title = deficitParcels.some((p) => p.summary!.verdict.kind === "deficit-high")
        ? "Silny niedobór wody w całym analizowanym zestawie"
        : "Niedobór lub ryzyko deficytu wody na wszystkich działkach";
    } else if (deficitParcels.length > 0) {
      title = `Niedobór wody na ${deficitParcels.length} z ${withSummary.length} analizowanych działek`;
    } else if (excessParcels.length > 0) {
      title = `Nadmiar wody lub wysoki stan rzek na ${excessParcels.length} z ${withSummary.length} działek`;
    }

    const parts: string[] = [];
    if (deficitParcels.length > 0) {
      parts.push(`Niedobór / sygnały suszy: dz. ${deficitParcels.map((p) => p.label).join(", ")}.`);
    }
    if (excessParcels.length > 0) {
      parts.push(`Nadwyżka wody / uwaga hydrologiczna: dz. ${excessParcels.map((p) => p.label).join(", ")}.`);
    }
    if (stableParcels.length > 0) {
      parts.push(`Stabilne uwilgotnienie: dz. ${stableParcels.map((p) => p.label).join(", ")}.`);
    }
    const description = parts.join(" ") || "Zestawienie warunków wodnych dla wybranych działek.";

    const precipValues = evaluatedParcels
      .map((p) => p.weatherData?.indicators.precipitationSumMm ?? null)
      .filter((val): val is number => val !== null);
    const soilValues = evaluatedParcels
      .map((p) => p.hydroData?.soil.rootZonePct ?? null)
      .filter((val): val is number => val !== null);
    const balanceValues = evaluatedParcels
      .map((p) => p.hydroData?.waterBalance.balanceMm ?? null)
      .filter((val): val is number => val !== null);
    const ndviValues = evaluatedParcels
      .map((p) => (p.satelliteData && p.satelliteData.status !== "unavailable" ? p.satelliteData.ndvi : null))
      .filter((val): val is number => val !== null);

    const tiles: SimpleTile[] = [
      {
        icon: "🗺️",
        label: "Zestaw działek",
        status: deficitParcels.length > 0
          ? `${deficitParcels.length} z ${withSummary.length} wymaga uwagi`
          : excessParcels.length > 0
            ? `${excessParcels.length} z ${withSummary.length} z nadwyżką wody`
            : `Wszystkie (${withSummary.length}) w normie`,
        hint: `analizowano ${polishParcelsLabel(evaluatedParcels.length)}`,
        level: worstLevel,
      },
      {
        icon: "🌧️",
        label: "Opad z 30 dni (zakres)",
        status: formatRange(precipValues, "mm", 1),
        hint: balanceValues.length > 0 ? `bilans: ${formatRange(balanceValues, "mm", 1, true)}` : "suma opadów w zestawie",
        level: deficitParcels.length > 0 ? "warn" : "info",
      },
      {
        icon: "💧",
        label: "Wilgotność 9–27 cm",
        status: formatRange(soilValues, "% obj.", 1),
        hint: "strefa korzeniowa działek",
        level: soilValues.some((v) => v < 18) ? "bad" : "good",
      },
      {
        icon: "🌾",
        label: "Kondycja roślin (NDVI)",
        status: ndviValues.length > 0 ? formatRange(ndviValues, "", 2) : "Brak obserwacji",
        hint: ndviValues.length > 0 ? `dane Sentinel-2 dla ${ndviValues.length} dz.` : "zachmurzenie lub brak sceny",
        level: ndviValues.some((v) => v < 0.35) ? "warn" : "good",
      },
    ];

    const adviceMap = new Map<string, { advice: Advice; parcelLabels: string[] }>();
    for (const item of evaluatedParcels) {
      for (const rec of item.advice) {
        const existing = adviceMap.get(rec.id);
        if (!existing) {
          adviceMap.set(rec.id, { advice: rec, parcelLabels: [item.label] });
        } else {
          const isMoreUrgent = rec.priority < existing.advice.priority
            || (rec.priority === existing.advice.priority && TIMING_ORDER[rec.timing] < TIMING_ORDER[existing.advice.timing]);
          if (isMoreUrgent) {
            existing.advice = rec;
          }
          if (!existing.parcelLabels.includes(item.label)) {
            existing.parcelLabels.push(item.label);
          }
        }
      }
    }
    const combinedAdvice = Array.from(adviceMap.values())
      .sort((a, b) => a.advice.priority - b.advice.priority || TIMING_ORDER[a.advice.timing] - TIMING_ORDER[b.advice.timing])
      .slice(0, 6);

    return {
      worstLevel,
      title,
      description,
      tiles,
      combinedAdvice,
    };
  }, [isMulti, evaluatedParcels]);

  const combinedLimitations = useMemo(() => {
    const items = new Set<string>();
    for (const item of evaluatedParcels) {
      for (const lim of item.satelliteData?.limitations ?? []) items.add(lim);
      for (const lim of item.hydroData?.limitations ?? []) items.add(lim);
      for (const lim of item.weatherData?.limitations ?? []) items.add(lim);
    }
    if (isMulti) {
      items.add("W raporcie zbiorczym ocena ogólna wskazuje najpilniejsze ryzyka w wybranym zestawie działek, natomiast szczegółowe wskaźniki są wyliczane odrębnie dla każdej działki.");
    }
    return Array.from(items);
  }, [evaluatedParcels, isMulti]);

  if (!isMulti) {
    const singleItem = evaluatedParcels[0];
    const parcelState = singleItem ? singleItem.entry.parcel : ({ status: "error", message: "Brak identyfikatora działki w adresie raportu." } as LoadState<ParcelResult>);
    const weatherState = singleItem ? singleItem.entry.weather : ({ status: "error", message: "Brak identyfikatora działki." } as LoadState<WeatherResult>);
    const hydroState = singleItem ? singleItem.entry.hydro : ({ status: "error", message: "Brak identyfikatora działki." } as LoadState<HydroResult>);
    const satelliteState = singleItem ? singleItem.entry.satellite : ({ status: "error", message: "Brak identyfikatora działki." } as LoadState<SatelliteResult>);
    const parcelData = singleItem?.parcelData ?? null;
    const weatherData = singleItem?.weatherData ?? null;
    const hydroData = singleItem?.hydroData ?? null;
    const satelliteData = singleItem?.satelliteData ?? null;
    const dataLoading = singleItem?.dataLoading ?? false;
    const summary = singleItem?.summary ?? null;
    const tiles = singleItem?.tiles ?? [];
    const advice = singleItem?.advice ?? [];
    const singleIdLabel = effectiveIds[0] ?? "";

    return (
      <main className="app-shell report-shell">
        <div className="report-toolbar">
          <a className="report-brand" href="/" aria-label="Ziemowit – strona główna">
            <BrandLogo className="report-brand-logo" />
            <span><strong>Ziemowit</strong><small>Grunt to nawodnienie</small></span>
          </a>
          <div className="report-actions">
            <a className="report-back" href="/">← Wróć do mapy</a>
            <button
              className="report-print"
              onClick={() => window.print()}
              disabled={dataLoading || satelliteState.status === "loading"}
              title={satelliteState.status === "loading" ? "Czekam na wskaźniki Sentinel-2" : undefined}
            >
              Drukuj / zapisz PDF
            </button>
          </div>
        </div>

        <header className="page-header report-header">
          <div className="brand-mark" aria-hidden="true">💧</div>
          <div>
            <p className="eyebrow">ZIEMOWIT · RAPORT WODNY DZIAŁKI</p>
            <h1>{parcelData ? `Działka ${parcelData.parcel}` : singleIdLabel || "Raport działki"}</h1>
            <p className="intro">
              {parcelData ? [parcelData.commune, parcelData.county, parcelData.voivodeship].filter(Boolean).join(" · ") : "Podsumowanie pomiarów meteorologicznych, hydrologicznych i satelitarnych"}
              {" · "}uprawa: {cropName}
              {" · "}wygenerowano {generatedAt ? generatedAt.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) : "…"}
            </p>
          </div>
        </header>

        {parcelState.status === "error" && (
          <div className="error-message report-block" role="alert"><strong>Problem z danymi działki</strong><p>{parcelState.message}</p></div>
        )}

        <div className="report-mode" role="radiogroup" aria-label="Widok raportu">
          <span className="report-mode-label">Widok raportu:</span>
          <button type="button" role="radio" aria-checked={!detailed} className={!detailed ? "active" : ""} onClick={() => changeMode("simple")}>
            Prosty
          </button>
          <button type="button" role="radio" aria-checked={detailed} className={detailed ? "active" : ""} onClick={() => changeMode("detailed")}>
            Szczegółowy
          </button>
        </div>

        <section className="report-top">
          <div className="report-card report-verdict-card">
            {summary ? (
              <>
                <div className={`report-verdict level-${summary.verdict.level}`}>
                  <span className="weather-kicker">OCENA OGÓLNA</span>
                  <h2>{summary.verdict.title}</h2>
                  <p>{detailed ? summary.verdict.text : summary.verdict.plain}</p>
                </div>
                {tiles.length > 0 && (
                  <ul className="simple-tiles">
                    {tiles.map((tile) => (
                      <li key={tile.label} className={`simple-tile tile-${tile.level}`}>
                        <span className="simple-tile-icon" aria-hidden="true">{tile.icon}</span>
                        <div>
                          <small>{tile.label}</small>
                          <strong>{tile.status}</strong>
                          <span>{tile.hint}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : dataLoading ? (
              <div className="status-message"><span className="spinner" /> Sprawdzam pogodę i wodę dla Twojej działki…</div>
            ) : (
              <div className="weather-error">Nie udało się przygotować oceny – brak danych pomiarowych.</div>
            )}
          </div>
          <div className="report-card report-map-card">
            <ParcelMap parcel={parcelData} className="report-map" />
          </div>
        </section>

        <ImgwWarningsSection imgwWarnings={imgwWarnings} isMulti={false} />

        {summary && (
          <section className="report-card report-block">
            <div className="report-section-heading">
              <div>
                <span className="weather-kicker">PLAN DZIAŁAŃ · DOBRANY DO TWOJEJ DZIAŁKI</span>
                <h2 className="report-title">Rekomendacje – jak zatrzymać wodę</h2>
              </div>
              <span className="weather-source">{advice.length} {advice.length === 1 ? "porada" : advice.length < 5 ? "porady" : "porad"}</span>
            </div>
            <AdviceCardsList items={advice.map((item) => ({ advice: item }))} />
          </section>
        )}

        {!detailed && (
          <section className="report-card report-block simple-more">
            <div>
              <strong>Chcesz zobaczyć dokładne liczby?</strong>
              <p>W raporcie szczegółowym są pomiary opadów, wilgotności gleby, stany rzek, wykresy i zdjęcia satelitarne.</p>
            </div>
            <button type="button" onClick={() => changeMode("detailed")}>Pokaż raport szczegółowy</button>
          </section>
        )}

        {detailed && (
          <ParcelDetailedBlocks
            summary={summary}
            weather={weatherState}
            weatherData={weatherData}
            hydro={hydroState}
            hydroData={hydroData}
            satellite={satelliteState}
            satelliteData={satelliteData}
            cropName={cropName}
          />
        )}

        {detailed && (
          <section className="report-card report-block report-limitations">
            <h2 className="report-title">Ograniczenia raportu</h2>
            <ul>
              {combinedLimitations.map((item) => <li key={item}>{item}</li>)}
              <li>Raport ma charakter informacyjny i nie zastępuje pomiarów terenowych ani decyzji eksperta.</li>
            </ul>
          </section>
        )}

        <footer>Źródła: GUGiK ULDK, Open-Meteo, GloFAS (Copernicus), IMGW-PIB, Earth Search (Sentinel-2 L2A). Mapa © OpenStreetMap.</footer>
      </main>
    );
  }

  // === MULTI-PARCEL COMBINED REPORT ===
  const communesSummary = Array.from(
    new Set(readyParcels.map((item) => [item.commune, item.county].filter(Boolean).join(" (") + (item.county && item.commune ? ")" : "")).filter(Boolean)),
  ).join(" · ");

  return (
    <main className="app-shell report-shell">
      <div className="report-toolbar">
        <a className="report-brand" href="/" aria-label="Ziemowit – strona główna">
          <BrandLogo className="report-brand-logo" />
          <span><strong>Ziemowit</strong><small>Grunt to nawodnienie</small></span>
        </a>
        <div className="report-actions">
          <a className="report-back" href="/">← Wróć do mapy</a>
          <button
            className="report-print"
            onClick={() => window.print()}
            disabled={anyDataLoading}
            title={anyDataLoading ? "Czekam na komplet danych dla wszystkich działek" : undefined}
          >
            Drukuj / zapisz PDF
          </button>
        </div>
      </div>

      <header className="page-header report-header">
        <div className="brand-mark" aria-hidden="true">💧</div>
        <div>
          <p className="eyebrow">ZIEMOWIT · ZBIORCZY RAPORT WODNY DZIAŁEK</p>
          <h1>Raport zbiorczy ({polishParcelsLabel(effectiveIds.length)})</h1>
          <p className="intro">
            Działki: <strong>{evaluatedParcels.map((p) => p.label).join(", ")}</strong>
            {communesSummary ? ` · ${communesSummary}` : ""}
            {" · "}uprawa: {cropName}
            {" · "}wygenerowano {generatedAt ? generatedAt.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) : "…"}
          </p>
        </div>
      </header>

      <div className="report-mode" role="radiogroup" aria-label="Widok raportu">
        <span className="report-mode-label">Widok raportu:</span>
        <button type="button" role="radio" aria-checked={!detailed} className={!detailed ? "active" : ""} onClick={() => changeMode("simple")}>
          Prosty
        </button>
        <button type="button" role="radio" aria-checked={detailed} className={detailed ? "active" : ""} onClick={() => changeMode("detailed")}>
          Szczegółowy
        </button>
      </div>

      <section className="report-top" aria-label="Podsumowanie całego zestawu działek">
        <div className="report-card report-verdict-card">
          {aggregateOverview ? (
            <>
              <div className={`report-verdict level-${aggregateOverview.worstLevel}`}>
                <span className="weather-kicker">PODSUMOWANIE ZBIORCZE · {polishParcelsLabel(effectiveIds.length).toUpperCase()}</span>
                <h2>{aggregateOverview.title}</h2>
                <p>{aggregateOverview.description}</p>
              </div>
              <ul className="simple-tiles">
                {aggregateOverview.tiles.map((tile) => (
                  <li key={tile.label} className={`simple-tile tile-${tile.level}`}>
                    <span className="simple-tile-icon" aria-hidden="true">{tile.icon}</span>
                    <div>
                      <small>{tile.label}</small>
                      <strong>{tile.status}</strong>
                      <span>{tile.hint}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : evaluatedParcels.some((p) => p.dataLoading) ? (
            <div className="status-message"><span className="spinner" /> Analizuję dane pogodowe i wodne dla {polishParcelsGenitive(effectiveIds.length)}…</div>
          ) : (
            <div className="weather-error">Nie udało się przygotować oceny zbiorczej – brak danych pomiarowych.</div>
          )}
        </div>
        <div className="report-card report-map-card">
          <ParcelMap
            parcels={readyParcels}
            activeParcelId={focusedMapParcelId}
            onSelectParcel={(clicked) => setFocusedMapParcelId((prev) => (prev === clicked.id ? null : clicked.id))}
            className="report-map"
          />
        </div>
      </section>

      <section className="report-card report-block" aria-label="Zestawienie porównawcze wybranych działek">
        <div className="report-section-heading">
          <div>
            <span className="weather-kicker">PORÓWNANIE W ZESTAWIE</span>
            <h2 className="report-title">Zestawienie wybranych działek</h2>
          </div>
          <span className="weather-source">{polishParcelsLabel(evaluatedParcels.length)}</span>
        </div>
        <div className="multi-comparison-wrap">
          <table className="station-table multi-comparison-table">
            <thead>
              <tr>
                <th>Działka / lokalizacja</th>
                <th>Ocena ogólna</th>
                <th>Opad 30 dni</th>
                <th>Bilans wodny</th>
                <th>Wilgotność 9–27 cm</th>
                <th>NDVI</th>
              </tr>
            </thead>
            <tbody>
              {evaluatedParcels.map((item, idx) => {
                const statusBadgeClass = item.summary
                  ? item.summary.verdict.level === "bad"
                    ? "alarm"
                    : item.summary.verdict.level === "warn"
                      ? "warning"
                      : "normal"
                  : "unknown";
                const precip = item.weatherData?.indicators.precipitationSumMm ?? null;
                const bal = item.hydroData?.waterBalance.balanceMm ?? null;
                const soilRoot = item.hydroData?.soil.rootZonePct ?? null;
                const ndvi = item.satelliteData && item.satelliteData.status !== "unavailable" ? item.satelliteData.ndvi : null;
                return (
                  <tr key={item.requestedId}>
                    <td>
                      <a
                        href={`#dzialka-sekcja-${idx + 1}`}
                        className="comparison-parcel-link"
                        onClick={() => setActiveChapterFilter("all")}
                      >
                        <strong>Działka {item.label}</strong>
                      </a>
                      <small>{item.parcelData ? [item.parcelData.commune, item.parcelData.county].filter(Boolean).join(", ") || item.parcelData.id : item.requestedId}</small>
                    </td>
                    <td>
                      {item.dataLoading ? (
                        <span className="station-status unknown">Wczytywanie…</span>
                      ) : item.summary ? (
                        <span className={`station-status ${statusBadgeClass}`}>{item.summary.verdict.title}</span>
                      ) : (
                        <span className="station-status unknown">Brak danych</span>
                      )}
                    </td>
                    <td>{precip !== null ? `${precip} mm` : "—"}</td>
                    <td>{bal !== null ? `${bal > 0 ? "+" : ""}${bal} mm` : "—"}</td>
                    <td>{soilRoot !== null ? `${soilRoot}% obj.` : "—"}</td>
                    <td>{ndvi !== null ? ndvi.toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ImgwWarningsSection imgwWarnings={imgwWarnings} isMulti />

      {aggregateOverview && aggregateOverview.combinedAdvice.length > 0 && (
        <section className="report-card report-block">
          <div className="report-section-heading">
            <div>
              <span className="weather-kicker">WSPÓLNY PLAN DZIAŁAŃ · CAŁY ZESTAW</span>
              <h2 className="report-title">Priorytetowe rekomendacje dla wybranych działek</h2>
            </div>
            <span className="weather-source">
              {aggregateOverview.combinedAdvice.length} {aggregateOverview.combinedAdvice.length === 1 ? "porada" : aggregateOverview.combinedAdvice.length < 5 ? "porady" : "porad"}
            </span>
          </div>
          <AdviceCardsList
            items={aggregateOverview.combinedAdvice.map((entry) => ({
              advice: entry.advice,
              scopeLabel: entry.parcelLabels.length === evaluatedParcels.length
                ? "Wszystkie działki"
                : `Dotyczy: dz. ${entry.parcelLabels.join(", ")}`,
            }))}
          />
        </section>
      )}

      {!detailed && (
        <section className="report-card report-block simple-more">
          <div>
            <strong>Chcesz zobaczyć dokładne liczby, wykresy i obrazy Sentinel-2 dla każdej działki?</strong>
            <p>Przełącz na widok szczegółowy, aby wyświetlić pełne pomiary meteorologiczne, hydrologiczne i satelitarne w kartach poszczególnych działek.</p>
          </div>
          <button type="button" onClick={() => changeMode("detailed")}>Pokaż raport szczegółowy</button>
        </section>
      )}

      <div className="report-chapters-header">
        <div>
          <span className="weather-kicker">KARTY POSZCZEGÓLNYCH DZIAŁEK</span>
          <h2 className="report-chapters-title">Analiza indywidualna dla każdej działki</h2>
        </div>
        <div className="report-chapter-pills" role="tablist" aria-label="Filtruj podgląd kart działek">
          <button
            type="button"
            role="tab"
            aria-selected={activeChapterFilter === "all"}
            className={`parcel-pill${activeChapterFilter === "all" ? " active" : ""}`}
            onClick={() => setActiveChapterFilter("all")}
          >
            Wszystkie ({evaluatedParcels.length})
          </button>
          {evaluatedParcels.map((item, index) => (
            <button
              key={item.requestedId}
              type="button"
              role="tab"
              aria-selected={activeChapterFilter === item.requestedId}
              className={`parcel-pill${activeChapterFilter === item.requestedId ? " active" : ""}`}
              onClick={() => setActiveChapterFilter(item.requestedId)}
            >
              <span className="parcel-pill-index">#{index + 1}</span>
              <strong>Dz. {item.label}</strong>
            </button>
          ))}
        </div>
      </div>

      {evaluatedParcels.map((item, index) => {
        const hiddenOnScreen = activeChapterFilter !== "all" && activeChapterFilter !== item.requestedId;
        return (
          <article
            key={item.requestedId}
            id={`dzialka-sekcja-${index + 1}`}
            className={`report-parcel-chapter${hiddenOnScreen ? " chapter-hidden-screen" : ""}`}
          >
            <div className="report-card report-block report-chapter-banner">
              <div className="report-chapter-banner-head">
                <div>
                  <span className="weather-kicker">DZIAŁKA {index + 1} Z {evaluatedParcels.length}</span>
                  <h2 className="report-chapter-heading">
                    {item.parcelData ? `Działka ${item.parcelData.parcel}` : item.requestedId}
                  </h2>
                  <p className="report-chapter-sub">
                    {item.parcelData
                      ? `${[item.parcelData.commune, item.parcelData.county, item.parcelData.voivodeship].filter(Boolean).join(" · ") || "Brak danych adresowych"} · ID: ${item.parcelData.id}`
                      : `Identyfikator: ${item.requestedId}`}
                  </p>
                </div>
                {item.summary && (
                  <span className={`chapter-verdict-pill level-${item.summary.verdict.level}`}>
                    {item.summary.verdict.title}
                  </span>
                )}
              </div>

              {item.entry.parcel.status === "error" && (
                <div className="error-message" role="alert" style={{ marginTop: 12 }}>
                  <strong>Problem z danymi działki {item.requestedId}</strong>
                  <p>{item.entry.parcel.message}</p>
                </div>
              )}

              <div className="report-top report-chapter-top">
                <div className="report-verdict-card">
                  {item.summary ? (
                    <>
                      <div className={`report-verdict level-${item.summary.verdict.level}`}>
                        <span className="weather-kicker">OCENA DZIAŁKI {item.label}</span>
                        <h3>{item.summary.verdict.title}</h3>
                        <p>{detailed ? item.summary.verdict.text : item.summary.verdict.plain}</p>
                      </div>
                      {item.tiles.length > 0 && (
                        <ul className="simple-tiles">
                          {item.tiles.map((tile) => (
                            <li key={tile.label} className={`simple-tile tile-${tile.level}`}>
                              <span className="simple-tile-icon" aria-hidden="true">{tile.icon}</span>
                              <div>
                                <small>{tile.label}</small>
                                <strong>{tile.status}</strong>
                                <span>{tile.hint}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : item.dataLoading ? (
                    <div className="status-message"><span className="spinner" /> Sprawdzam pogodę i wodę dla działki {item.label}…</div>
                  ) : (
                    <div className="weather-error">Nie udało się przygotować oceny dla tej działki – brak danych pomiarowych.</div>
                  )}
                </div>
                <div className="report-card report-map-card report-chapter-map-card">
                  <ParcelMap parcel={item.parcelData} className="report-map" />
                </div>
              </div>

              {item.summary && item.advice.length > 0 && (
                <div className="report-chapter-advice">
                  <div className="report-section-heading">
                    <div>
                      <span className="weather-kicker">REKOMENDACJE INDYWIDUALNE · DZ. {item.label}</span>
                      <h3 className="report-title">Zalecane działania dla tej działki</h3>
                    </div>
                  </div>
                  <AdviceCardsList items={item.advice.map((rec) => ({ advice: rec }))} />
                </div>
              )}
            </div>

            {detailed && (
              <ParcelDetailedBlocks
                summary={item.summary}
                weather={item.entry.weather}
                weatherData={item.weatherData}
                hydro={item.entry.hydro}
                hydroData={item.hydroData}
                satellite={item.entry.satellite}
                satelliteData={item.satelliteData}
                cropName={cropName}
                parcelBadge={`DZ. ${item.label}`}
              />
            )}
          </article>
        );
      })}

      <section className="report-card report-block report-limitations">
        <h2 className="report-title">Ograniczenia raportu</h2>
        <ul>
          {combinedLimitations.map((item) => <li key={item}>{item}</li>)}
          <li>Raport ma charakter informacyjny i nie zastępuje pomiarów terenowych ani decyzji eksperta.</li>
        </ul>
      </section>

      <footer>Źródła: GUGiK ULDK, Open-Meteo, GloFAS (Copernicus), IMGW-PIB, Earth Search (Sentinel-2 L2A). Mapa © OpenStreetMap.</footer>
    </main>
  );
}

function ImgwWarningsSection({
  imgwWarnings,
  isMulti,
}: {
  imgwWarnings: LoadState<ImgwWarningsResult>;
  isMulti: boolean;
}) {
  return (
    <section className="report-card report-block imgw-warning-card" aria-live="polite" aria-label="Ostrzeżenia IMGW">
      <div className="report-section-heading">
        <div>
          <span className="weather-kicker">IMGW-PIB · AKTUALNE KOMUNIKATY</span>
          <h2 className="report-title">{isMulti ? "Ostrzeżenia dla regionów wybranych działek" : "Ostrzeżenia dla regionu działki"}</h2>
        </div>
        {imgwWarnings.status === "ready" && (
          <a className="weather-source" href={imgwWarnings.data.source.url} target="_blank" rel="noreferrer">Źródło IMGW</a>
        )}
      </div>
      {imgwWarnings.status === "loading" ? (
        <div className="status-message"><span className="spinner" /> Sprawdzam aktywne ostrzeżenia IMGW…</div>
      ) : imgwWarnings.status === "error" ? (
        <div className="weather-error" role="status">Nie udało się sprawdzić ostrzeżeń. {imgwWarnings.message}</div>
      ) : (
        <>
          {imgwWarnings.data.meteorological.status === "available"
            && imgwWarnings.data.hydrological.status === "available"
            && imgwWarnings.data.meteorological.warnings.length === 0
            && imgwWarnings.data.hydrological.warnings.length === 0 && (
              <p className="imgw-no-warnings">Brak obecnych ostrzeżeń IMGW dla sprawdzanego powiatu i województwa.</p>
            )}
          {imgwWarnings.data.meteorological.status === "available" ? (
            <WarningList
              title={`Ostrzeżenia meteorologiczne · ${imgwWarnings.data.location.county || (isMulti ? "powiaty działek" : "powiat działki")}`}
              warnings={imgwWarnings.data.meteorological.warnings}
            />
          ) : <p className="weather-error" role="status">{imgwWarnings.data.meteorological.error}</p>}
          {imgwWarnings.data.hydrological.status === "available" ? (
            <WarningList
              title={isMulti ? "Ostrzeżenia hydrologiczne · województwa działek" : "Ostrzeżenia hydrologiczne · województwo działki"}
              warnings={imgwWarnings.data.hydrological.warnings}
            />
          ) : <p className="weather-error" role="status">{imgwWarnings.data.hydrological.error}</p>}
          <p className="imgw-warning-note">Ostrzeżenia meteorologiczne dopasowano do kodu TERYT powiatu. Ostrzeżenia hydrologiczne pokazujemy dla obszarów w województwie; opis IMGW wskazuje zlewnię i nie potwierdza, że ostrzeżenie obejmuje konkretną działkę.</p>
          <p className="imgw-warning-updated">Ostatnie sprawdzenie: {new Date(imgwWarnings.data.fetchedAt).toLocaleString("pl-PL")}</p>
        </>
      )}
    </section>
  );
}

function AdviceCardsList({ items }: { items: Array<{ advice: Advice; scopeLabel?: string }> }) {
  return (
    <ol className="advice-list">
      {items.map(({ advice: item, scopeLabel }, index) => (
        <li key={item.id} className={`advice-card timing-${item.timing}`}>
          <div className="advice-icon" aria-hidden="true">{item.icon}</div>
          <div className="advice-body">
            <div className="advice-meta">
              <span className="advice-step">Krok {index + 1}</span>
              <span className="advice-timing">{timingLabel[item.timing]}</span>
              <span className="advice-category">{item.category}</span>
              {scopeLabel && <span className="advice-scope-badge">{scopeLabel}</span>}
            </div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <p className="advice-why"><strong>Dlaczego?</strong> {item.why}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ParcelDetailedBlocks({
  summary,
  weather,
  weatherData,
  hydro,
  hydroData,
  satellite,
  satelliteData,
  cropName,
  parcelBadge,
}: {
  summary: ReportSummary | null;
  weather: LoadState<WeatherResult>;
  weatherData: WeatherResult | null;
  hydro: LoadState<HydroResult>;
  hydroData: HydroResult | null;
  satellite: LoadState<SatelliteResult>;
  satelliteData: SatelliteResult | null;
  cropName: string;
  parcelBadge?: string;
}) {
  return (
    <>
      {summary && (
        <section className="report-card report-block">
          <h2 className="report-title">Najważniejsze wnioski z danych{parcelBadge ? ` (${parcelBadge})` : ""}</h2>
          <ul className="finding-list finding-grid">
            {summary.findings.map((finding) => (
              <li key={finding.title} className={`finding level-${finding.level}`}>
                <strong>{finding.title}</strong>
                <p>{finding.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-card report-block">
        <div className="report-section-heading">
          <div>
            <span className="weather-kicker">METEOROLOGIA · OSTATNIE 30 DNI{parcelBadge ? ` · ${parcelBadge}` : ""}</span>
            <h2 className="report-title">Pomiary meteorologiczne</h2>
          </div>
          {weatherData && <span className="weather-source">{weatherData.source.provider}</span>}
        </div>
        {weather.status === "loading" ? (
          <div className="status-message"><span className="spinner" /> Pobieram dane pogodowe…</div>
        ) : weather.status === "error" ? (
          <div className="weather-error">{weather.message}</div>
        ) : (
          <>
            <div className="report-metrics">
              <Metric value={weather.data.indicators.precipitationSumMm} unit="mm" label="Suma opadów" />
              <Metric value={weather.data.historicalSummary.averagePrecipitationMm} unit="mm" label="Średnia wieloletnia (ten sam okres)" />
              <Metric value={weather.data.indicators.averageTemperatureC} unit="°C" label="Średnia temperatura" />
              <Metric value={weather.data.indicators.maximumTemperatureC} unit="°C" label="Temperatura maksymalna" />
              <Metric value={weather.data.indicators.longestDrySpellDays} unit="dni" label="Najdłuższy okres bez opadu" />
            </div>
            <p className="report-note">{weather.data.historicalSummary.assessment}</p>
          </>
        )}
      </section>

      <section className="report-card report-block">
        <div className="report-section-heading">
          <div>

            <span className="weather-kicker">HYDROLOGIA · GLEBA, BILANS, CIEKI{parcelBadge ? ` · ${parcelBadge}` : ""}</span>
            <h2 className="report-title">Pomiary hydrologiczne</h2>
          </div>
          {hydroData && <span className="weather-source">{hydroData.sources.join(" · ")}</span>}
        </div>
        {hydro.status === "loading" ? (
          <div className="status-message"><span className="spinner" /> Pobieram dane hydrologiczne…</div>
        ) : hydro.status === "error" ? (
          <div className="weather-error">{hydro.message}</div>
        ) : (
          <>
            <div className="report-metrics">
              <Metric
                value={hydro.data.soil.rootZonePct}
                unit="% obj."
                label={`Wilgotność gleby 9–27 cm · ${soilLabel[summary?.soil.status && summary.soil.status !== "unknown" ? summary.soil.status : hydro.data.soil.status]}`}
              />
              <Metric value={hydro.data.soil.surfacePct} unit="% obj." label="Wilgotność powierzchni 0–1 cm" />
              <Metric value={hydro.data.soil.deepPct} unit="% obj." label="Wilgotność głęboka 27–81 cm" />
              <Metric value={hydro.data.waterBalance.evapotranspirationMm} unit="mm" label="Parowanie (ET₀) / 30 dni" />
              <Metric value={hydro.data.waterBalance.balanceMm} unit="mm" label="Klimatyczny bilans wodny" signed />
              <Metric value={hydro.data.elevationM} unit="m n.p.m." label="Wysokość terenu" />
            </div>

            <h3 className="report-subtitle">Opad i parowanie dzień po dniu</h3>
            <WaterChart days={hydro.data.daily} />
            <div className="chart-legend">
              <span><i className="legend precipitation" /> Opad</span>
              <span><i className="legend evaporation" /> Parowanie ET₀</span>
              <span><i className="legend forecast" /> Prognoza {hydro.data.forecast.days} dni</span>
            </div>

            <div className="report-grid-2 inner">
              <div>
                <h3 className="report-subtitle">Najbliższe wodowskazy IMGW</h3>
                {hydro.data.stations.length ? (
                  <table className="station-table">
                    <thead><tr><th>Stacja / rzeka</th><th>Odległość</th><th>Stan wody</th><th>Status</th></tr></thead>
                    <tbody>
                      {hydro.data.stations.map((station) => (
                        <tr key={station.id}>
                          <td><strong>{station.name}</strong><small>{station.river ?? "—"}</small></td>
                          <td>{station.distanceKm} km</td>
                          <td>{station.waterLevelCm} cm<small>{station.warningLevelCm !== null ? `ostrz. ${station.warningLevelCm} cm` : ""}</small></td>
                          <td><span className={`station-status ${station.status}`}>{stationLabel[station.status]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="report-note">Brak danych z wodowskazów.</p>}
              </div>
              <div>
                <h3 className="report-subtitle">Przepływ w zlewni (model GloFAS)</h3>
                {hydro.data.river ? (
                  <>
                    <div className="report-metrics compact">
                      <Metric value={hydro.data.river.dischargeM3s} unit="m³/s" label="Przepływ dziś" />
                      <Metric value={hydro.data.river.mean30dM3s} unit="m³/s" label="Średnia 30 dni" />
                      <Metric value={hydro.data.river.forecastMaxM3s} unit="m³/s" label="Maks. w prognozie" />
                    </div>
                    <p className="report-note">{hydro.data.river.assessment}</p>
                  </>
                ) : <p className="report-note">Model przepływu nie zwrócił danych dla tej lokalizacji.</p>}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="report-card report-block">
        <div className="report-section-heading">
          <div>
            <span className="weather-kicker">SENTINEL-2 · NDVI · {cropName.toUpperCase()}{parcelBadge ? ` · ${parcelBadge}` : ""}</span>
            <h2 className="report-title">Wskaźniki satelitarne</h2>
          </div>
          {satelliteData && (
            <span className="weather-source">
              {satelliteData.provider} · {satelliteData.status === "partial" ? "częściowe pokrycie" : satelliteData.level}
            </span>
          )}
        </div>
        {satellite.status === "loading" ? (
          <div className="status-message"><span className="spinner" /> Analizuję obraz Sentinel-2 dla działki…</div>
        ) : satellite.status === "error" ? (
          <div className="weather-error">{satellite.message}</div>
        ) : satellite.data.status === "unavailable" ? (
          <p className="satellite-unavailable">{satellite.data.interpretation}</p>
        ) : (
          <>
            {(satellite.data.currentImageUrl || satellite.data.historicalImageUrl) && (
              <div className="satellite-comparison report-images">
                {satellite.data.currentImageUrl && (
                  <figure>
                    <SatelliteImage src={satellite.data.currentImageUrl} alt={`Obraz prawdziwokolorowy działki z ${satellite.data.date ?? "bieżącej obserwacji"}`} geometry={satellite.data.geometry} bounds={satellite.data.imageBounds} imageWidth={satellite.data.imageWidth} imageHeight={satellite.data.imageHeight} />
                    <figcaption>Teraz · {satellite.data.date ?? "brak daty"}</figcaption>
                  </figure>
                )}
                {satellite.data.historicalImageUrl && (
                  <figure>
                    <SatelliteImage src={satellite.data.historicalImageUrl} alt="Obraz historyczny działki" geometry={satellite.data.geometry} bounds={satellite.data.imageBounds} imageWidth={satellite.data.imageWidth} imageHeight={satellite.data.imageHeight} />
                    <figcaption>Rok temu · porównanie sezonowe</figcaption>
                  </figure>
                )}
              </div>
            )}
            <div className="report-metrics compact">
              <Metric value={satellite.data.ndvi} unit="" label="NDVI teraz" digits={2} />
              <Metric value={satellite.data.historicalNdvi} unit="" label="NDVI rok temu" digits={2} />
              <Metric value={satellite.data.ndviDifference} unit="" label="Różnica rok do roku" digits={2} signed />
              {satellite.data.ndwi != null && <Metric value={satellite.data.ndwi} unit="" label="NDWI, woda w roślinach" digits={2} />}
            </div>
            {summary?.sceneNote && <p className="report-note">{summary.sceneNote}</p>}
            <p className="satellite-meta">
              Obserwacja: <strong>{satellite.data.date ?? "brak"}</strong>
              {" · "}chmury: <strong>{satellite.data.cloudCoverPercent?.toFixed(1) ?? "—"}%</strong>
              {" · "}uprawa: <strong>{cropName}</strong>
            </p>
            <p className="ndvi-explanation">
              <strong>Co oznacza NDVI?</strong> Wskaźnik od 0 do 1 opisuje intensywność zielonego pokrycia roślin:
              0,2–0,4 — słaba kondycja, 0,4–0,6 — umiarkowana, powyżej 0,6 — dobra.
              Nie jest pomiarem wilgotności gleby.
            </p>
            <p className="satellite-interpretation">{satellite.data.interpretation}</p>
          </>
        )}
      </section>
    </>
  );
}

const dayFormatter = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long" });

function formatChartDay(date: string) {
  const text = dayFormatter.format(new Date(`${date}T12:00:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function WaterChart({ days }: { days: HydroResult["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.flatMap((day) => [day.precipitationMm ?? 0, day.et0Mm ?? 0]));
  const day = active === null ? null : days[active];
  const balance = day && day.precipitationMm !== null && day.et0Mm !== null
    ? Math.round((day.precipitationMm - day.et0Mm) * 10) / 10
    : null;
  const edge = active === null ? "" : active < 4 ? " align-left" : active > days.length - 5 ? " align-right" : "";

  return (
    <div className="water-chart-wrap" onMouseLeave={() => setActive(null)}>
      <div className={`water-chart${active !== null ? " has-active" : ""}`} role="img" aria-label="Wykres dziennych opadów i parowania">
        {days.map((item, index) => (
          <div
            key={item.date}
            className={`water-chart-day${item.forecast ? " forecast" : ""}${index === active ? " active" : ""}`}
            onMouseEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <span className="bar precipitation" style={{ height: `${((item.precipitationMm ?? 0) / max) * 100}%` }} />
            <span className="bar evaporation" style={{ height: `${((item.et0Mm ?? 0) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      {day && active !== null && (
        <div className={`chart-tooltip${edge}`} style={{ left: `calc(8px + (100% - 16px) * ${(active + 0.5) / days.length})` }}>
          <div className="chart-tooltip-head">
            <span>{formatChartDay(day.date)}</span>
            {day.forecast && <em>Prognoza</em>}
          </div>
          <div className="chart-tooltip-row"><i className="legend precipitation" /> Opad <strong>{day.precipitationMm ?? "—"} mm</strong></div>
          <div className="chart-tooltip-row"><i className="legend evaporation" /> Parowanie <strong>{day.et0Mm ?? "—"} mm</strong></div>
          {balance !== null && (
            <div className={`chart-tooltip-balance ${balance >= 0 ? "positive" : "negative"}`}>
              Bilans dnia <strong>{balance > 0 ? "+" : ""}{balance} mm</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ value, unit, label, signed = false, digits }: { value: number | string | null; unit: string; label: string; signed?: boolean; digits?: number }) {
  const shown = value === null
    ? "—"
    : typeof value === "string"
      ? value
      : `${signed && value > 0 ? "+" : ""}${digits === undefined ? value : value.toFixed(digits)}`;
  return (
    <div className="report-metric">
      <span className="weather-value">{shown}</span>
      {unit && <span className="weather-unit">{unit}</span>}
      <small>{label}</small>
    </div>
  );
}

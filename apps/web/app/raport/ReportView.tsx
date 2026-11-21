"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { HydroResult, HydroStation, ParcelResult, WeatherResult } from "../types";
import { buildSummary } from "./findings";

const ParcelMap = dynamic(() => import("../components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="report-map map-placeholder">Ładowanie mapy…</div>,
});

type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych.");
  return result as T;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatValue(value: number | null | undefined, unit: string) {
  return value === null || value === undefined ? "—" : `${value} ${unit}`;
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

export default function ReportView({ parcelId, point }: { parcelId: string; point: { lat: number; lng: number } | null }) {
  const [parcel, setParcel] = useState<LoadState<ParcelResult>>({ status: "loading" });
  const [weather, setWeather] = useState<LoadState<WeatherResult>>({ status: "loading" });
  const [hydro, setHydro] = useState<LoadState<HydroResult>>({ status: "loading" });
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    if (!parcelId) {
      setParcel({ status: "error", message: "Brak identyfikatora działki w adresie raportu." });
      return;
    }
    const controller = new AbortController();

    (async () => {
      let selected: ParcelResult;
      try {
        const result = await postJson<{ parcels: ParcelResult[] }>("/api/parcels", { identifier: parcelId }, controller.signal);
        selected = result.parcels.find((candidate) => candidate.id === parcelId) ?? result.parcels[0];
        setParcel({ status: "ready", data: selected });
      } catch (reason) {
        if (controller.signal.aborted) return;
        const message = errorMessage(reason, "Nie udało się wczytać działki.");
        setParcel({ status: "error", message });
        if (!point) {
          setWeather({ status: "error", message: "Brak lokalizacji działki." });
          setHydro({ status: "error", message: "Brak lokalizacji działki." });
          return;
        }
        selected = { id: parcelId, parcel: parcelId, commune: "", county: "", voivodeship: "", lat: point.lat, lng: point.lng, geometry: null };
      }

      const lat = point?.lat ?? selected.lat;
      const lng = point?.lng ?? selected.lng;
      if (lat == null || lng == null) {
        setWeather({ status: "error", message: "Brak współrzędnych działki." });
        setHydro({ status: "error", message: "Brak współrzędnych działki." });
        return;
      }

      void postJson<WeatherResult>("/api/weather", { latitude: lat, longitude: lng, date: todayIso() }, controller.signal)
        .then((data) => setWeather({ status: "ready", data }))
        .catch((reason) => { if (!controller.signal.aborted) setWeather({ status: "error", message: errorMessage(reason, "Dane meteorologiczne niedostępne.") }); });
      void postJson<HydroResult>("/api/hydro", { latitude: lat, longitude: lng }, controller.signal)
        .then((data) => setHydro({ status: "ready", data }))
        .catch((reason) => { if (!controller.signal.aborted) setHydro({ status: "error", message: errorMessage(reason, "Dane hydrologiczne niedostępne.") }); });
    })();

    return () => controller.abort();
  }, [parcelId, point?.lat, point?.lng]);

  const weatherData = weather.status === "ready" ? weather.data : null;
  const hydroData = hydro.status === "ready" ? hydro.data : null;
  const parcelData = parcel.status === "ready" ? parcel.data : null;
  const dataLoading = weather.status === "loading" || hydro.status === "loading";
  const summary = useMemo(
    () => (dataLoading || (!weatherData && !hydroData) ? null : buildSummary(weatherData, hydroData)),
    [dataLoading, weatherData, hydroData],
  );

  return (
    <main className="app-shell report-shell">
      <div className="report-toolbar">
        <a className="report-back" href="/">← Wróć do mapy</a>
        <button className="report-print" onClick={() => window.print()} disabled={dataLoading}>Drukuj / zapisz PDF</button>
      </div>

      <header className="page-header report-header">
        <div className="brand-mark" aria-hidden="true">💧</div>
        <div>
          <p className="eyebrow">RAPORT WODNY DZIAŁKI</p>
          <h1>{parcelData ? `Działka ${parcelData.parcel}` : parcelId || "Raport działki"}</h1>
          <p className="intro">
            {parcelData ? [parcelData.commune, parcelData.county, parcelData.voivodeship].filter(Boolean).join(" · ") : "Podsumowanie pomiarów meteorologicznych i hydrologicznych"}
            {" · "}wygenerowano {generatedAt.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </header>

      {parcel.status === "error" && (
        <div className="error-message report-block" role="alert"><strong>Problem z danymi działki</strong><p>{parcel.message}</p></div>
      )}

      <section className="report-top">
        <div className="report-card report-verdict-card">
          {summary ? (
            <div className={`report-verdict level-${summary.verdict.level}`}>
              <span className="weather-kicker">OCENA OGÓLNA</span>
              <h2>{summary.verdict.title}</h2>
              <p>{summary.verdict.text}</p>
            </div>
          ) : dataLoading ? (
            <div className="status-message"><span className="spinner" /> Analizuję dane meteorologiczne i hydrologiczne…</div>
          ) : (
            <div className="weather-error">Nie udało się przygotować oceny – brak danych pomiarowych.</div>
          )}
          {parcelData && (
            <dl className="report-facts">
              <div><dt>Identyfikator</dt><dd>{parcelData.id}</dd></div>
              <div><dt>Lokalizacja</dt><dd>{(point?.lat ?? parcelData.lat)?.toFixed(5)}, {(point?.lng ?? parcelData.lng)?.toFixed(5)}</dd></div>
              <div><dt>Wysokość terenu</dt><dd>{formatValue(hydroData?.elevationM, "m n.p.m.")}</dd></div>
            </dl>
          )}
        </div>
        <div className="report-card report-map-card">
          <ParcelMap parcel={parcelData} className="report-map" />
        </div>
      </section>

      {summary && (
        <section className="report-grid-2">
          <div className="report-card">
            <h2 className="report-title">Najważniejsze wnioski</h2>
            <ul className="finding-list">
              {summary.findings.map((finding) => (
                <li key={finding.title} className={`finding level-${finding.level}`}>
                  <strong>{finding.title}</strong>
                  <p>{finding.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="report-card">
            <h2 className="report-title">Rekomendacje – jak zatrzymać wodę</h2>
            <ol className="recommendation-list">
              {summary.recommendations.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>
        </section>
      )}

      <section className="report-card report-block">
        <div className="report-section-heading">
          <div><span className="weather-kicker">METEOROLOGIA · OSTATNIE 30 DNI</span><h2 className="report-title">Pomiary meteorologiczne</h2></div>
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
          <div><span className="weather-kicker">HYDROLOGIA · GLEBA, BILANS, CIEKI</span><h2 className="report-title">Pomiary hydrologiczne</h2></div>
          {hydroData && <span className="weather-source">{hydroData.sources.join(" · ")}</span>}
        </div>
        {hydro.status === "loading" ? (
          <div className="status-message"><span className="spinner" /> Pobieram dane hydrologiczne…</div>
        ) : hydro.status === "error" ? (
          <div className="weather-error">{hydro.message}</div>
        ) : (
          <>
            <div className="report-metrics">
              <Metric value={hydro.data.soil.rootZonePct} unit="% obj." label={`Wilgotność gleby 9–27 cm · ${soilLabel[hydro.data.soil.status]}`} />
              <Metric value={hydro.data.soil.surfacePct} unit="% obj." label="Wilgotność powierzchni 0–1 cm" />
              <Metric value={hydro.data.soil.deepPct} unit="% obj." label="Wilgotność głęboka 27–81 cm" />
              <Metric value={hydro.data.waterBalance.evapotranspirationMm} unit="mm" label="Parowanie (ET₀) / 30 dni" />
              <Metric value={hydro.data.waterBalance.balanceMm} unit="mm" label="Klimatyczny bilans wodny" signed />
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

      <section className="report-card report-block report-limitations">
        <h2 className="report-title">Ograniczenia raportu</h2>
        <ul>
          {[...(hydroData?.limitations ?? []), ...(weatherData?.limitations ?? [])].map((item) => <li key={item}>{item}</li>)}
          <li>Raport ma charakter informacyjny i nie zastępuje pomiarów terenowych ani decyzji eksperta.</li>
        </ul>
      </section>

      <footer>Źródła: GUGiK ULDK, Open-Meteo, GloFAS (Copernicus), IMGW-PIB. Mapa © OpenStreetMap.</footer>
    </main>
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

function Metric({ value, unit, label, signed = false }: { value: number | null; unit: string; label: string; signed?: boolean }) {
  return (
    <div className="report-metric">
      <span className="weather-value">{value === null ? "—" : `${signed && value > 0 ? "+" : ""}${value}`}</span>
      <span className="weather-unit">{unit}</span>
      <small>{label}</small>
    </div>
  );
}

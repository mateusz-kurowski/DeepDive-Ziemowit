"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { HydroResult, HydroStation, ImgwWarning, ImgwWarningsResult, ParcelResult, SatelliteResult, WeatherResult } from "../types";
import BrandLogo from "../components/BrandLogo";
import SatelliteImage from "../components/SatelliteImage";
import { buildAdvice, timingLabel } from "./advice";
import { buildSimpleTiles, buildSummary } from "./findings";

type ReportMode = "simple" | "detailed";
const MODE_KEY = "report-mode";

const ParcelMap = dynamic(() => import("../components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="report-map map-placeholder">Ładowanie mapy…</div>,
});

type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

async function postJson<T>(url: string, body: unknown, signal: AbortSignal, fallbackMessage = "Nie udało się pobrać danych. Spróbuj ponownie później.", hideServerError = false): Promise<T> {
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
  try { text = await response.text(); }
  catch { throw new Error(fallbackMessage); }
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
  return value ? value.slice(0, 16).replace("T", " ") : "brak daty";
}

function WarningList({ title, warnings }: { title: string; warnings: ImgwWarning[] }) {
  return (
    <div className="imgw-warning-group">
      <h3 className="report-subtitle">{title}</h3>
      {warnings.length ? (
        <ul className="imgw-warning-list">
          {warnings.map((warning) => (
            <li key={warning.id} className="imgw-warning-item">
              <div className="imgw-warning-heading">
                <strong>{warning.event}</strong>
                <span>{warningDegreeLabel(warning.degree)}</span>
              </div>
              <p>{warning.description}</p>
              <small>Obszar: {warning.area} · do {warningDate(warning.endsAt)}{warning.probabilityPercent !== null ? ` · prawdopodobieństwo ${warning.probabilityPercent}%` : ""}</small>
            </li>
          ))}
        </ul>
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

export default function ReportView({ parcelId, point, crop }: {
  parcelId: string;
  point: { lat: number; lng: number } | null;
  crop: string;
}) {
  const [parcel, setParcel] = useState<LoadState<ParcelResult>>({ status: "loading" });
  const [weather, setWeather] = useState<LoadState<WeatherResult>>({ status: "loading" });
  const [hydro, setHydro] = useState<LoadState<HydroResult>>({ status: "loading" });
  const [imgwWarnings, setImgwWarnings] = useState<LoadState<ImgwWarningsResult>>({ status: "loading" });
  const [satellite, setSatellite] = useState<LoadState<SatelliteResult>>({ status: "loading" });
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<ReportMode>("simple");

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
    if (!parcelId) {
      setImgwWarnings({ status: "error", message: "Brak identyfikatora działki do sprawdzenia ostrzeżeń IMGW." });
      setParcel({ status: "error", message: "Brak identyfikatora działki w adresie raportu." });
      setSatellite({ status: "error", message: "Brak identyfikatora działki." });
      return;
    }
    setSatellite({ status: "loading" });
    setImgwWarnings({ status: "loading" });
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
          setSatellite({ status: "error", message: "Brak lokalizacji działki." });
          return;
        }
        selected = { id: parcelId, parcel: parcelId, commune: "", county: "", voivodeship: "", lat: point.lat, lng: point.lng, geometry: null };
      }

      const lat = point?.lat ?? selected.lat;
      const lng = point?.lng ?? selected.lng;
      if (lat == null || lng == null) {
        setImgwWarnings({ status: "error", message: "Brak współrzędnych działki." });
        setWeather({ status: "error", message: "Brak współrzędnych działki." });
        setHydro({ status: "error", message: "Brak współrzędnych działki." });
        setSatellite({ status: "error", message: "Brak współrzędnych działki." });
        return;
      }

      void postJson<ImgwWarningsResult>("/api/imgw-warnings", {
        parcelId: selected.id,
        county: selected.county,
        voivodeship: selected.voivodeship,
      }, controller.signal, "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.")
        .then((data) => setImgwWarnings({ status: "ready", data }))
        .catch((reason) => { if (!controller.signal.aborted) setImgwWarnings({ status: "error", message: errorMessage(reason, "Nie udało się sprawdzić aktualnych ostrzeżeń IMGW.") }); });

      void postJson<HydroResult>("/api/hydro", { latitude: lat, longitude: lng }, controller.signal)
        .then((data) => setHydro({ status: "ready", data }))
        .catch((reason) => { if (!controller.signal.aborted) setHydro({ status: "error", message: errorMessage(reason, "Dane hydrologiczne niedostępne.") }); });

      void (async () => {
        let weatherAvailable = false;
        try {
          const data = await postJson<WeatherResult>("/api/weather", { latitude: lat, longitude: lng, date: todayIso() }, controller.signal);
          weatherAvailable = true;
          if (!controller.signal.aborted) setWeather({ status: "ready", data });
        } catch (reason) {
          if (!controller.signal.aborted) setWeather({ status: "error", message: errorMessage(reason, "Dane meteorologiczne niedostępne.") });
        }
        if (controller.signal.aborted) return;
        try {
          const data = await postJson<SatelliteResult>("/api/satellite", {
            lat,
            lng,
            geometry: selected.geometry,
            crop,
            weatherAvailable,
          }, controller.signal, "Wskaźniki satelitarne są chwilowo niedostępne. Pozostałe dane raportu są nadal dostępne.", true);
          if (!controller.signal.aborted) setSatellite({ status: "ready", data });
        } catch (reason) {
          if (!controller.signal.aborted) setSatellite({ status: "error", message: errorMessage(reason, "Dane satelitarne niedostępne.") });
        }
      })();
    })();

    return () => controller.abort();
  }, [parcelId, point?.lat, point?.lng, crop]);

  const weatherData = weather.status === "ready" ? weather.data : null;
  const hydroData = hydro.status === "ready" ? hydro.data : null;
  const satelliteData = satellite.status === "ready" ? satellite.data : null;
  const parcelData = parcel.status === "ready" ? parcel.data : null;
  const dataLoading = weather.status === "loading" || hydro.status === "loading";
  const satelliteArg = satellite.status === "loading" ? undefined : satelliteData;
  const latitude = point?.lat ?? parcelData?.lat ?? hydroData?.location.latitude ?? null;
  const summary = useMemo(
    () => (dataLoading || (!weatherData && !hydroData) ? null : buildSummary(weatherData, hydroData, satelliteArg, {
      date: generatedAt ?? new Date(),
      crop,
      latitude,
    })),
    [dataLoading, weatherData, hydroData, satelliteArg, generatedAt, crop, latitude],
  );
  const tiles = useMemo(
    () => (summary ? buildSimpleTiles(weatherData, hydroData, satelliteArg, { date: generatedAt ?? new Date(), crop, latitude }) : []),
    [summary, weatherData, hydroData, satelliteArg, generatedAt, crop, latitude],
  );
  const advice = useMemo(
    () => (summary
      ? buildAdvice({
        kind: summary.verdict.kind,
        weather: weatherData,
        hydro: hydroData,
        satellite: satelliteArg,
        crop,
        month: (generatedAt ?? new Date()).getMonth(),
        date: generatedAt ?? new Date(),
        latitude,
      })
      : []),
    [summary, weatherData, hydroData, satelliteArg, crop, generatedAt, latitude],
  );
  const detailed = mode === "detailed";
  const cropName = cropLabels[crop] ?? "wybrana uprawa";

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
            disabled={dataLoading || satellite.status === "loading"}
            title={satellite.status === "loading" ? "Czekam na wskaźniki Sentinel-2" : undefined}
          >
            Drukuj / zapisz PDF
          </button>
        </div>
      </div>

      <header className="page-header report-header">
        <div className="brand-mark" aria-hidden="true">💧</div>
        <div>
          <p className="eyebrow">ZIEMOWIT · RAPORT WODNY DZIAŁKI</p>
          <h1>{parcelData ? `Działka ${parcelData.parcel}` : parcelId || "Raport działki"}</h1>
          <p className="intro">
            {parcelData ? [parcelData.commune, parcelData.county, parcelData.voivodeship].filter(Boolean).join(" · ") : "Podsumowanie pomiarów meteorologicznych, hydrologicznych i satelitarnych"}
            {" · "}uprawa: {cropName}
            {" · "}wygenerowano {generatedAt ? generatedAt.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) : "…"}
          </p>
        </div>
      </header>

      {parcel.status === "error" && (
        <div className="error-message report-block" role="alert"><strong>Problem z danymi działki</strong><p>{parcel.message}</p></div>
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

      <section className="report-card report-block imgw-warning-card" aria-live="polite" aria-label="Ostrzeżenia IMGW">
        <div className="report-section-heading">
          <div>
            <span className="weather-kicker">IMGW-PIB · AKTUALNE KOMUNIKATY</span>
            <h2 className="report-title">Ostrzeżenia dla regionu działki</h2>
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
              <WarningList title={`Ostrzeżenia meteorologiczne · ${imgwWarnings.data.location.county || "powiat działki"}`} warnings={imgwWarnings.data.meteorological.warnings} />
            ) : <p className="weather-error" role="status">{imgwWarnings.data.meteorological.error}</p>}
            {imgwWarnings.data.hydrological.status === "available" ? (
              <WarningList title="Ostrzeżenia hydrologiczne · województwo działki" warnings={imgwWarnings.data.hydrological.warnings} />
            ) : <p className="weather-error" role="status">{imgwWarnings.data.hydrological.error}</p>}
            <p className="imgw-warning-note">Ostrzeżenia meteorologiczne dopasowano do kodu TERYT powiatu. Ostrzeżenia hydrologiczne pokazujemy dla obszarów w województwie; opis IMGW wskazuje zlewnię i nie potwierdza, że ostrzeżenie obejmuje konkretną działkę.</p>
            <p className="imgw-warning-updated">Ostatnie sprawdzenie: {new Date(imgwWarnings.data.fetchedAt).toLocaleString("pl-PL")}</p>
          </>
        )}
      </section>

      {summary && (
        <section className="report-card report-block">
          <div className="report-section-heading">
            <div>
              <span className="weather-kicker">PLAN DZIAŁAŃ · DOBRANY DO TWOJEJ DZIAŁKI</span>
              <h2 className="report-title">Rekomendacje – jak zatrzymać wodę</h2>
            </div>
            <span className="weather-source">{advice.length} {advice.length === 1 ? "porada" : advice.length < 5 ? "porady" : "porad"}</span>
          </div>
          <ol className="advice-list">
            {advice.map((item, index) => (
              <li key={item.id} className={`advice-card timing-${item.timing}`}>
                <div className="advice-icon" aria-hidden="true">{item.icon}</div>
                <div className="advice-body">
                  <div className="advice-meta">
                    <span className="advice-step">Krok {index + 1}</span>
                    <span className="advice-timing">{timingLabel[item.timing]}</span>
                    <span className="advice-category">{item.category}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <p className="advice-why"><strong>Dlaczego?</strong> {item.why}</p>
                </div>
              </li>
            ))}
          </ol>
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

      {detailed && summary && (
        <section className="report-card report-block">
          <h2 className="report-title">Najważniejsze wnioski z danych</h2>
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

      {detailed && (<>
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
              <Metric value={hydro.data.soil.rootZonePct} unit="% obj." label={`Wilgotność gleby 9–27 cm · ${soilLabel[summary?.soil.status && summary.soil.status !== "unknown" ? summary.soil.status : hydro.data.soil.status]}`} />
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
            <span className="weather-kicker">SENTINEL-2 · NDVI · {cropName.toUpperCase()}</span>
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <SatelliteImage src={satellite.data.currentImageUrl} alt={`Obraz prawdziwokolorowy działki z ${satellite.data.date ?? "bieżącej obserwacji"}`} geometry={satellite.data.geometry} bounds={satellite.data.imageBounds} imageWidth={satellite.data.imageWidth} imageHeight={satellite.data.imageHeight} />
                    <figcaption>Teraz · {satellite.data.date ?? "brak daty"}</figcaption>
                  </figure>
                )}
                {satellite.data.historicalImageUrl && (
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

      <section className="report-card report-block report-limitations">
        <h2 className="report-title">Ograniczenia raportu</h2>
        <ul>
          {[...(satelliteData?.limitations ?? []), ...(hydroData?.limitations ?? []), ...(weatherData?.limitations ?? [])].map((item) => <li key={item}>{item}</li>)}
          <li>Raport ma charakter informacyjny i nie zastępuje pomiarów terenowych ani decyzji eksperta.</li>
        </ul>
      </section>
      </>)}

      <footer>Źródła: GUGiK ULDK, Open-Meteo, GloFAS (Copernicus), IMGW-PIB, Earth Search (Sentinel-2 L2A). Mapa © OpenStreetMap.</footer>
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

function Metric({ value, unit, label, signed = false, digits }: { value: number | null; unit: string; label: string; signed?: boolean; digits?: number }) {
  const shown = value === null ? "—" : `${signed && value > 0 ? "+" : ""}${digits === undefined ? value : value.toFixed(digits)}`;
  return (
    <div className="report-metric">
      <span className="weather-value">{shown}</span>
      {unit && <span className="weather-unit">{unit}</span>}
      <small>{label}</small>
    </div>
  );
}

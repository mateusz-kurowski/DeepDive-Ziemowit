"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ParcelResult } from "./types";
import "./styles.css";

const ParcelMap = dynamic(() => import("./components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Ładowanie mapy…</div>,
});

type WeatherResult = {
  date: string;
  indicators: {
    precipitationSumMm: number | null;
    averageTemperatureC: number | null;
    longestDrySpellDays: number | null;
  };
  historicalSummary: {
    status: "available" | "partial" | "unavailable";
    differencePercent: number | null;
    assessment: string;
  };
  source: {
    provider: string;
  };
};

type SatelliteResult = {
  status: "available" | "partial" | "unavailable";
  provider: "Earth Search";
  satellite: "Sentinel-2";
  level: "L2A";
  currentImageUrl: string | null;
  historicalImageUrl: string | null;
  date: string | null;
  cloudCoverPercent: number | null;
  resolutionMeters: number | null;
  ndvi: number | null;
  historicalNdvi: number | null;
  ndviDifference: number | null;
  validPixelPercent: number | null;
  crop: string;
  interpretation: string;
  limitations: string[];
};

export default function Home() {
  const [parcel, setParcel] = useState<ParcelResult | null>(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<ParcelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [satellite, setSatellite] = useState<SatelliteResult | null>(null);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState("");
  const [crop, setCrop] = useState("zboza");
  const requestRef = useRef<AbortController | null>(null);
  const weatherRequestRef = useRef<AbortController | null>(null);
  const satelliteRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    satelliteRequestRef.current?.abort();
  }, []);

  async function fetchSatellite(selected: ParcelResult, selectedCrop: string) {
    if (selected.lat == null || selected.lng == null) return;
    satelliteRequestRef.current?.abort();
    const controller = new AbortController();
    satelliteRequestRef.current = controller;
    setSatelliteLoading(true);
    setSatelliteError("");
    setSatellite(null);
    try {
      const response = await fetch("/api/satellite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: selected.lat,
          lng: selected.lng,
          geometry: selected.geometry,
          crop: selectedCrop,
          weatherAvailable: weather != null,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych satelitarnych.");
      setSatellite(result as SatelliteResult);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setSatelliteError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych satelitarnych.");
      }
    } finally {
      if (satelliteRequestRef.current === controller) {
        satelliteRequestRef.current = null;
        setSatelliteLoading(false);
      }
    }
  }

  async function fetchWeather(lat: number, lng: number) {
    weatherRequestRef.current?.abort();
    const controller = new AbortController();
    weatherRequestRef.current = controller;
    setWeatherLoading(true);
    setWeatherError("");
    setWeather(null);

    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, date }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych pogodowych.");
      setWeather(result as WeatherResult);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setWeatherError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych pogodowych.");
      }
    } finally {
      if (weatherRequestRef.current === controller) {
        weatherRequestRef.current = null;
        setWeatherLoading(false);
      }
    }
  }

  function selectParcel(selected: ParcelResult) {
    setParcel(selected);
    setCandidates([]);
    if (selected.lat != null && selected.lng != null) {
      void fetchWeather(selected.lat, selected.lng);
      void fetchSatellite(selected, crop);
    } else {
      weatherRequestRef.current?.abort();
      satelliteRequestRef.current?.abort();
      setWeather(null);
      setWeatherError("");
      setSatellite(null);
      setSatelliteError("");
    }
  }

  async function selectPoint(lat: number, lng: number) {
    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    weatherRequestRef.current = null;
    satelliteRequestRef.current?.abort();
    satelliteRequestRef.current = null;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setSearchError("");
    setCandidates([]);
    setParcel(null);
    setWeather(null);
    setWeatherError("");
    setWeatherLoading(false);
    setSatellite(null);
    setSatelliteError("");
    setSatelliteLoading(false);
    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się znaleźć działki.");
      selectParcel(result as ParcelResult);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "Wystąpił nieznany błąd.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  async function searchParcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = searchText.trim();
    if (!identifier) {
      setSearchError("Wpisz identyfikator działki.");
      return;
    }

    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    weatherRequestRef.current = null;
    satelliteRequestRef.current?.abort();
    satelliteRequestRef.current = null;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setSearchError("");
    setCandidates([]);
    setParcel(null);
    setWeather(null);
    setWeatherError("");
    setWeatherLoading(false);
    setSatellite(null);
    setSatelliteError("");
    setSatelliteLoading(false);
    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się znaleźć działki.");
      const matches = result.parcels as ParcelResult[];
      if (matches.length === 1) selectParcel(matches[0]);
      else setCandidates(matches);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setSearchError(reason instanceof Error ? reason.message : "Wystąpił nieznany błąd.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark" aria-hidden="true">🌱</div>
        <div>
          <p className="eyebrow">ASYSTENT WODNY ROLNIKA</p>
          <h1>Zatrzymaj wodę, chroń plony</h1>
          <p className="intro">Wpisz numer działki lub kliknij na mapie, aby wybrać działkę do analizy.</p>
        </div>
      </header>
      <section className="workspace" aria-label="Wybór działki">
        <div className="map-column">
          <div className="map-heading">
            <div><h2>Wybierz działkę</h2><p>Przybliż mapę i kliknij wewnątrz jej granic.</p></div>
            <span className="map-hint">⌖ Kliknij punkt na mapie</span>
          </div>
          <ParcelMap onSelectPoint={selectPoint} parcel={parcel} />
          <p className="attribution-note">Dane działek: GUGiK, ULDK. Podkład mapy: © OpenStreetMap.</p>
          {(weatherLoading || weather || weatherError) && (
            <section className="weather-card" aria-live="polite" aria-label="Najważniejsze dane pogodowe">
              <div className="weather-card-heading">
                <div>
                  <span className="weather-kicker">METEO · {weather?.date ?? "ostatnie 30 dni"}</span>
                  <h2>Warunki pogodowe działki</h2>
                </div>
                {weather && <span className="weather-source">{weather.source.provider}</span>}
              </div>
              {weatherLoading ? (
                <div className="weather-status"><span className="spinner" /> Pobieram dane pogodowe…</div>
              ) : weatherError ? (
                <div className="weather-error" role="alert">{weatherError}</div>
              ) : weather ? (
                <>
                  <div className="weather-metrics">
                    <div><span className="weather-value">{weather.indicators.precipitationSumMm ?? "—"}</span><span className="weather-unit">mm</span><small>Suma opadów / 30 dni</small></div>
                    <div><span className="weather-value">{weather.indicators.averageTemperatureC ?? "—"}</span><span className="weather-unit">°C</span><small>Średnia temperatura</small></div>
                    <div><span className="weather-value">{weather.indicators.longestDrySpellDays ?? "—"}</span><span className="weather-unit">dni</span><small>Najdłużej bez opadów</small></div>
                  </div>
                  {weather.historicalSummary.status !== "unavailable" && weather.historicalSummary.differencePercent !== null && (
                    <p className="weather-history">
                      <strong>{weather.historicalSummary.differencePercent > 0 ? "+" : ""}{weather.historicalSummary.differencePercent}%</strong>
                      {" "}w porównaniu do średniej historycznej opadów.
                    </p>
                  )}
                </>
              ) : null}
            </section>
          )}
          {(satelliteLoading || satellite || satelliteError) && (
            <section className="satellite-card" aria-live="polite" aria-label="Dane satelitarne Sentinel-2">
              <div className="satellite-card-heading">
                <div>
                  <span className="satellite-kicker">SENTINEL-2 · NDVI</span>
                  <h2>Stan roślinności działki</h2>
                </div>
                {satellite && <span className="satellite-source">{satellite.status === "partial" ? "częściowe pokrycie" : "L2A"}</span>}
              </div>
              {satelliteLoading ? (
                <div className="satellite-status"><span className="spinner" /> Analizuję obraz Sentinel-2…</div>
              ) : satelliteError ? (
                <div className="satellite-error" role="alert">{satelliteError}</div>
              ) : satellite ? (
                satellite.status === "unavailable" ? (
                  <p className="satellite-unavailable">Brak jakościowej obserwacji Sentinel-2 w ostatnich 90 dniach. Nie pokazano pozornego NDVI.</p>
                ) : (
                  <>
                    {(satellite.currentImageUrl || satellite.historicalImageUrl) && (
                      <div className="satellite-comparison">
                        {satellite.currentImageUrl && (
                          <figure>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={satellite.currentImageUrl} alt={`Obraz prawdziwokolorowy działki z ${satellite.date ?? "bieżącej obserwacji"}`} />
                            <figcaption>Teraz · {satellite.date ?? "brak daty"}</figcaption>
                          </figure>
                        )}
                        {satellite.historicalImageUrl && (
                          <figure>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={satellite.historicalImageUrl} alt="Obraz prawdziwokolorowy działki z roku poprzedniego" />
                            <figcaption>Rok temu · porównanie sezonowe</figcaption>
                          </figure>
                        )}
                      </div>
                    )}
                    <div className="satellite-metrics">
                      <div><span className="satellite-value">{satellite.ndvi?.toFixed(2) ?? "—"}</span><small>NDVI teraz</small></div>
                      <div><span className="satellite-value">{satellite.historicalNdvi?.toFixed(2) ?? "—"}</span><small>NDVI rok temu</small></div>
                    </div>
                    <p className="ndvi-explanation">
                      <strong>Co oznacza NDVI?</strong> Wskaźnik od 0 do 1 opisuje intensywność zielonego pokrycia roślin:
                      poniżej 0,3 — słabe lub rozproszone, 0,3–0,6 — umiarkowane,
                      powyżej 0,6 — silne. Najniższe i ujemne wartości wskazują głównie glebę, wodę lub zabudowę.
                    </p>
                    <p className="satellite-meta">
                      Obserwacja: <strong>{satellite.date ?? "brak"}</strong>
                      {" · "}chmury: <strong>{satellite.cloudCoverPercent?.toFixed(1) ?? "—"}%</strong>
                      {" · "}rozdzielczość: <strong>{satellite.resolutionMeters ? `${satellite.resolutionMeters} m` : "—"}</strong>
                    </p>
                    <p className="satellite-interpretation">{satellite.interpretation}</p>
                  </>
                )
              ) : null}
            </section>
          )}
        </div>
        <aside className="details-panel" aria-live="polite">
          <div className="panel-icon" aria-hidden="true">▧</div>
          <h2>Wybrana działka</h2>
          <form className="parcel-search" onSubmit={searchParcel}>
            <label htmlFor="parcel-identifier">Znajdź działkę po numerze</label>
            <div className="search-controls">
              <input
                id="parcel-identifier"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="np. Krzewina 134"
                autoComplete="off"
              />
              <button type="submit" disabled={loading} aria-label="Szukaj działki">{loading ? "…" : "Szukaj"}</button>
            </div>
            <p className="search-help">Wpisz pełny identyfikator albo nazwę obrębu i numer.</p>
            {searchError && <p className="search-error" role="alert">{searchError}</p>}
          </form>
          <div className="crop-select">
            <label htmlFor="crop-type">Aktualna uprawa</label>
            <select
              id="crop-type"
              value={crop}
              onChange={(event) => {
                const nextCrop = event.target.value;
                setCrop(nextCrop);
                if (parcel) void fetchSatellite(parcel, nextCrop);
              }}
            >
              <option value="zboza">Zboża</option>
              <option value="rzepak">Rzepak</option>
              <option value="ziemniaki">Ziemniaki</option>
              <option value="buraki">Buraki</option>
              <option value="kukorydza">Kukurydza</option>
              <option value="owoce">Owoce i sad</option>
              <option value="warzywa">Warzywa</option>
              <option value="inna">Inna uprawa</option>
            </select>
          </div>
          {candidates.length > 0 && (
            <div className="candidate-list" aria-live="polite">
              <p>Znaleziono kilka działek. Wybierz właściwą:</p>
              {candidates.map((candidate) => (
                <button className="candidate-option" key={candidate.id} onClick={() => selectParcel(candidate)}>
                  <strong>{candidate.parcel}</strong>
                  <span>{[candidate.commune, candidate.county, candidate.voivodeship].filter(Boolean).join(", ")}</span>
                  <small>{candidate.id}</small>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="status-message"><span className="spinner" /> Sprawdzam działkę…</div>
          ) : error ? (
            <div className="error-message" role="alert"><strong>Nie udało się wybrać działki</strong><p>{error}</p></div>
          ) : candidates.length > 0 ? (
            <div className="empty-state"><p>Wybierz działkę z listy powyżej, aby wyświetlić jej granice na mapie.</p></div>
          ) : parcel ? (
            <>
              <p className="parcel-number">{parcel.parcel}</p>
              <dl className="parcel-data">
                <div><dt>Identyfikator</dt><dd>{parcel.id}</dd></div>
                <div><dt>Gmina</dt><dd>{parcel.commune || "Brak danych"}</dd></div>
                <div><dt>Powiat</dt><dd>{parcel.county || "Brak danych"}</dd></div>
                <div><dt>Województwo</dt><dd>{parcel.voivodeship || "Brak danych"}</dd></div>
                {parcel.lat != null && parcel.lng != null && (
                  <div><dt>Lokalizacja</dt><dd>{parcel.lat.toFixed(6)}, {parcel.lng.toFixed(6)}<small className="coordinate-label"> lat, lon</small></dd></div>
                )}
              </dl>
              <div className="selected-badge"><span /> Działka zaznaczona na mapie</div>
            </>
          ) : (
            <div className="empty-state"><div className="empty-illustration" aria-hidden="true">⌖</div><p>Wskaż punkt na mapie, aby zobaczyć numer działki oraz dane gminy, powiatu i województwa.</p></div>
          )}
          <div className="source-box"><span className="source-check">✓</span><p>Dane pobierane na bieżąco z usługi lokalizacji działek GUGiK (ULDK).</p></div>
        </aside>
      </section>
      <footer>Wynik lokalizacji ma charakter informacyjny. Granice na mapie pochodzą z ewidencji udostępnianej przez ULDK.</footer>
    </main>
  );
}

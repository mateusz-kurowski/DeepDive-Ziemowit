"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ParcelResult } from "./types";
const ParcelMap = dynamic(() => import("./components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Ładowanie mapy…</div>,
});

function reportUrl(parcel: ParcelResult, selectedCrop: string) {
  const params = new URLSearchParams({ id: parcel.id, crop: selectedCrop });
  if (parcel.lat != null && parcel.lng != null) {
    params.set("lat", parcel.lat.toFixed(6));
    params.set("lng", parcel.lng.toFixed(6));
  }
  return `/raport?${params}`;
}

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

type SoilTextureResult = {
  status: "available" | "partial" | "unresolved-zero";
  depth: string;
  statistic: string;
  units: string;
  fractions: Record<"sand" | "silt" | "clay", { label: string; valueGkg: number | null; flag: string }>;
  samplePoint: { lat: number; lng: number };
  source: { name: string; resolutionM: number; url: string };
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

type DroughtResult = {
  status: "available" | "unavailable";
  provider: "IUNG-PIB";
  category: {
    code: number;
    name: string;
    susceptibility: string;
  } | null;
  previewUrl: string | null;
  categoryPercentages: Record<"1" | "2" | "3" | "4", number>;
  unavailableReason: "classification" | "service" | null;
  precipitation30DaysMm: number | null;
  precipitationDeficitMm: number | null;
  currentRisk: "niski" | "umiarkowany" | "wysoki" | "bardzo wysoki" | "brak danych";
  interpretation: string;
};

export default function Home() {
  const [parcel, setParcel] = useState<ParcelResult | null>(null);
  const [error, setError] = useState("");
  const [outsidePoland, setOutsidePoland] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<ParcelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [soilTexture, setSoilTexture] = useState<SoilTextureResult | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState("");
  const [satellite, setSatellite] = useState<SatelliteResult | null>(null);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState("");
  const [drought, setDrought] = useState<DroughtResult | null>(null);
  const [droughtLoading, setDroughtLoading] = useState(false);
  const [droughtError, setDroughtError] = useState("");
  const [crop, setCrop] = useState("zboza");
  const requestRef = useRef<AbortController | null>(null);
  const weatherRequestRef = useRef<AbortController | null>(null);
  const soilRequestRef = useRef<AbortController | null>(null);
  const satelliteRequestRef = useRef<AbortController | null>(null);
  const droughtRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    soilRequestRef.current?.abort();
    satelliteRequestRef.current?.abort();
    droughtRequestRef.current?.abort();
  }, []);

  async function fetchDrought(
    lat: number,
    lng: number,
    selectedCrop: string,
    precipitation30DaysMm: number | null = null,
    geometry: ParcelResult["geometry"] = null,
  ) {
    droughtRequestRef.current?.abort();
    const controller = new AbortController();
    droughtRequestRef.current = controller;
    setDroughtLoading(true);
    setDroughtError("");
    setDrought(null);
    try {
      const response = await fetch("/api/drought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, crop: selectedCrop, geometry, precipitation30DaysMm }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych o suszy.");
      setDrought(result as DroughtResult);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setDroughtError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych o suszy.");
      }
    } finally {
      if (droughtRequestRef.current === controller) {
        droughtRequestRef.current = null;
        setDroughtLoading(false);
      }
    }
  }

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

  async function fetchWeather(
    lat: number,
    lng: number,
    geometry: ParcelResult["geometry"] = null,
  ) {
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
      const weatherResult = result as WeatherResult;
      void fetchDrought(lat, lng, crop, weatherResult.indicators.precipitationSumMm, geometry);
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

  async function fetchSoilTexture(lat: number, lng: number) {
    soilRequestRef.current?.abort();
    const controller = new AbortController();
    soilRequestRef.current = controller;
    setSoilLoading(true);
    setSoilError("");
    setSoilTexture(null);
    try {
      const response = await fetch("/api/soil-texture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać uziarnienia gleby.");
      setSoilTexture(result as SoilTextureResult);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setSoilError(reason instanceof Error ? reason.message : "Nie udało się pobrać uziarnienia gleby.");
      }
    } finally {
      if (soilRequestRef.current === controller) {
        soilRequestRef.current = null;
        setSoilLoading(false);
      }
    }
  }

  function selectParcel(selected: ParcelResult) {
    setParcel(selected);
    setCandidates([]);
    if (selected.lat != null && selected.lng != null) {
      void fetchWeather(selected.lat, selected.lng, selected.geometry);
      void fetchSoilTexture(selected.lat, selected.lng);
      void fetchSatellite(selected, crop);
      void fetchDrought(selected.lat, selected.lng, crop, null, selected.geometry);
    } else {
      weatherRequestRef.current?.abort();
      satelliteRequestRef.current?.abort();
      droughtRequestRef.current?.abort();
      setWeather(null);
      setWeatherError("");
      soilRequestRef.current?.abort();
      setSoilTexture(null);
      setSoilError("Dla tej działki nie udało się wyznaczyć punktu do odczytu gleby.");
      setSoilLoading(false);
      setSatellite(null);
      setSatelliteError("");
    }
  }

  async function selectPoint(lat: number, lng: number) {
    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    weatherRequestRef.current = null;
    soilRequestRef.current?.abort();
    soilRequestRef.current = null;
    satelliteRequestRef.current?.abort();
    satelliteRequestRef.current = null;
    droughtRequestRef.current?.abort();
    droughtRequestRef.current = null;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setOutsidePoland(false);
    setSearchError("");
    setCandidates([]);
    setParcel(null);
    setWeather(null);
    setWeatherError("");
    setWeatherLoading(false);
    setSoilTexture(null);
    setSoilError("");
    setSoilLoading(false);
    setSatellite(null);
    setSatelliteError("");
    setSatelliteLoading(false);
    setDrought(null);
    setDroughtError("");
    setDroughtLoading(false);
    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (result.code === "outside-poland") setOutsidePoland(true);
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
    soilRequestRef.current?.abort();
    soilRequestRef.current = null;
    satelliteRequestRef.current?.abort();
    satelliteRequestRef.current = null;
    droughtRequestRef.current?.abort();
    droughtRequestRef.current = null;
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
    setSoilTexture(null);
    setSoilError("");
    setSoilLoading(false);
    setSatellite(null);
    setSatelliteError("");
    setSatelliteLoading(false);
    setDrought(null);
    setDroughtError("");
    setDroughtLoading(false);
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
          {parcel && (
            <section className="terrain-card" aria-label="Dane o terenie i glebie">
              <div className="terrain-card-heading">
                <div>
                  <span className="terrain-kicker">CHARAKTERYSTYKA DZIAŁKI</span>
                  <h2>Teren i gleba</h2>
                </div>
                {soilTexture && <span className="terrain-source">SoilGrids · {soilTexture.source.resolutionM} m</span>}
              </div>
              <p className="terrain-description">Uziarnienie wierzchniej warstwy gleby (0–5 cm) dla działki {parcel.parcel}.</p>
              {soilLoading ? (
                <div className="weather-status"><span className="spinner" /> Pobieram dane o glebie z SoilGrids…</div>
              ) : soilError ? (
                <div className="weather-error" role="alert">{soilError}</div>
              ) : soilTexture?.status === "unresolved-zero" ? (
                <div className="soil-unavailable" role="status">Źródło zwróciło same zera bez znacznika braku danych. Nie pokazujemy ich jako składu gleby.</div>
              ) : soilTexture ? (
                <>
                  <div className="soil-fractions" aria-label="Udziały frakcji gleby">
                    {(["sand", "silt", "clay"] as const).map((key) => {
                      const fraction = soilTexture.fractions[key];
                      const percent = fraction.valueGkg === null ? null : fraction.valueGkg / 10;
                      return (
                        <div className="soil-fraction" key={key}>
                          <div className="soil-fraction-heading"><span>{fraction.label}</span><strong>{percent === null ? "—" : `${percent.toFixed(1)}%`}</strong></div>
                          <div className="soil-bar"><span className={`soil-bar-fill soil-${key}`} style={{ width: `${Math.max(0, Math.min(percent ?? 0, 100))}%` }} /></div>
                          <small>{fraction.valueGkg === null ? "brak danych" : `${fraction.valueGkg} g/kg`}</small>
                        </div>
                      );
                    })}
                  </div>
                  {soilTexture.status === "partial" && <p className="soil-unavailable">Część frakcji nie ma wartości w źródle.</p>}
                </>
              ) : null}
              <p className="terrain-note">
                Źródło: <a href={soilTexture?.source.url ?? "https://docs.isric.org/globaldata/soilgrids/"} target="_blank" rel="noreferrer">ISRIC SoilGrids</a>, predykcja modelu o rozdzielczości 250 m; wartości pobrane dla punktu reprezentatywnego działki, nie uśrednione po jej granicach. Frakcje podano oddzielnie, bez normalizowania sumy.
              </p>
            </section>
          )}
          {(droughtLoading || drought || droughtError) && (
            <section className="drought-card" aria-live="polite" aria-label="Dane o podatności na suszę">
              <div className="drought-card-heading">
                <div>
                  <span className="drought-kicker">IUNG-PIB · SUSZA</span>
                  <h2>Podatność gleby i ryzyko suszy</h2>
                </div>
                {drought?.category && <span className="drought-category">Kat. {drought.category.code}</span>}
              </div>
              {droughtLoading ? (
                <div className="drought-status"><span className="spinner" /> Pobieram podatność gleby IUNG…</div>
              ) : droughtError ? (
                <div className="drought-error" role="alert">{droughtError}</div>
              ) : drought ? (
                drought.status === "unavailable" || !drought.category ? (
                  <div className="drought-unavailable">
                    <strong>Brak danych o podatności gleby dla tej lokalizacji.</strong>
                    {drought.unavailableReason === "classification" ? (
                      <p>Warstwa IUNG nie przypisała działce kategorii I–IV podatności gleby. Działka lub jej część może należeć do gleby organicznej, lasu, wody, zabudowy, nieużytków, terenów komunikacyjnych albo obszaru niesklasyfikowanego.</p>
                    ) : (
                      <p>Usługa IUNG-PIB nie zwróciła w tym momencie prawidłowej warstwy klasyfikacji. Spróbuj ponownie później.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="drought-metrics">
                      <div>
                        <span className={`drought-value drought-category-${drought.category.code}`}>{drought.category.susceptibility}</span>
                        <small>Podatność gleby</small>
                      </div>
                      <div>
                        <span className={`drought-value drought-risk-${drought.currentRisk.replaceAll(" ", "-")}`}>{drought.currentRisk}</span>
                        <small>Wskaźnik bieżącego ryzyka</small>
                      </div>
                    </div>
                    {drought.previewUrl && (
                      <figure className="drought-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={drought.previewUrl} alt="Mały wycinek mapy podatności gleby IUNG dla granic działki" />
                        <figcaption>Wycinek mapy IUNG dla działki</figcaption>
                      </figure>
                    )}
                    <div className="drought-legend" aria-label="Legenda kategorii podatności gleby IUNG">
                      <span><i className="drought-legend-1" />I — bardzo podatna <strong>{drought.categoryPercentages["1"].toFixed(1)}%</strong></span>
                      <span><i className="drought-legend-2" />II — podatna <strong>{drought.categoryPercentages["2"].toFixed(1)}%</strong></span>
                      <span><i className="drought-legend-3" />III — średnio podatna <strong>{drought.categoryPercentages["3"].toFixed(1)}%</strong></span>
                      <span><i className="drought-legend-4" />IV — mało podatna <strong>{drought.categoryPercentages["4"].toFixed(1)}%</strong></span>
                    </div>
                    <p className="drought-interpretation">{drought.interpretation}</p>
                    {drought.precipitationDeficitMm !== null && drought.precipitationDeficitMm > 0 && (
                      <p className="drought-deficit">Niedobór względem orientacyjnego progu: <strong>{drought.precipitationDeficitMm.toFixed(1)} mm</strong></p>
                    )}
                    <p className="drought-source">Warstwa IUNG 2024 · {drought.provider} · dane nie są bieżącym monitorowaniem suszy</p>
                  </>
                )
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
                if (parcel) {
                  void fetchSatellite(parcel, nextCrop);
                  if (parcel.lat != null && parcel.lng != null) {
                    void fetchDrought(
                      parcel.lat,
                      parcel.lng,
                      nextCrop,
                      weather?.indicators.precipitationSumMm ?? null,
                      parcel.geometry,
                    );
                  }
                }
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
            <div className="error-message" role="alert"><strong>{outsidePoland ? "Punkt poza granicami Polski" : "Nie udało się wybrać działki"}</strong><p>{error}</p></div>
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
              <a className="report-button" href={reportUrl(parcel, crop)} target="_blank" rel="noopener">
                Otwórz raport wodny działki <span aria-hidden="true">→</span>
              </a>
              <p className="report-button-help">W nowej karcie: pogoda, hydrologia i wskaźniki Sentinel-2 (NDVI) dla wybranej uprawy.</p>
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

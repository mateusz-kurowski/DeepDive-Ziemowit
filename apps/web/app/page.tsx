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

export default function Home() {
  const [parcel, setParcel] = useState<ParcelResult | null>(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<ParcelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function selectPoint(lat: number, lng: number) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setSearchError("");
    setCandidates([]);
    setParcel(null);
    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się znaleźć działki.");
      setParcel(result as ParcelResult);
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
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setSearchError("");
    setCandidates([]);
    setParcel(null);
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
      if (matches.length === 1) setParcel(matches[0]);
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
          {candidates.length > 0 && (
            <div className="candidate-list" aria-live="polite">
              <p>Znaleziono kilka działek. Wybierz właściwą:</p>
              {candidates.map((candidate) => (
                <button className="candidate-option" key={candidate.id} onClick={() => { setParcel(candidate); setCandidates([]); }}>
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

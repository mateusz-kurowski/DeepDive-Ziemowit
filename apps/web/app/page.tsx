"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ParcelResult } from "./types";
import "./styles.css";

const ParcelMap = dynamic(() => import("./components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Ładowanie mapy…</div>,
});

export default function Home() {
  const [parcel, setParcel] = useState<ParcelResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function selectPoint(lat: number, lng: number) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
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
          {loading ? (
            <div className="status-message"><span className="spinner" /> Sprawdzam działkę…</div>
          ) : error ? (
            <div className="error-message" role="alert"><strong>Nie udało się wybrać działki</strong><p>{error}</p></div>
          ) : parcel ? (
            <>
              <p className="parcel-number">{parcel.parcel}</p>
              <dl className="parcel-data">
                <div><dt>Identyfikator</dt><dd>{parcel.id}</dd></div>
                <div><dt>Gmina</dt><dd>{parcel.commune || "Brak danych"}</dd></div>
                <div><dt>Powiat</dt><dd>{parcel.county || "Brak danych"}</dd></div>
                <div><dt>Województwo</dt><dd>{parcel.voivodeship || "Brak danych"}</dd></div>
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

"use client";

import { FormEvent, useState } from "react";

type WeatherResult = {
  date: string;
  source: {
    provider: string;
    endpoint: string;
    fetchedAt: string;
  };
  coverage: {
    start: string;
    end: string;
    daysRequested: number;
    daysAvailable: number;
  };
  indicators: {
    precipitationSumMm: number | null;
    averageTemperatureC: number | null;
    maximumTemperatureC: number | null;
    longestDrySpellDays: number | null;
    precipitationShortfallMm: number | null;
  };
  series: Array<{
    date: string;
    precipitationMm: number | null;
    meanTemperatureC: number | null;
    maxTemperatureC: number | null;
  }>;
  historicalSummary: {
    status: "available" | "partial" | "unavailable";
    yearsRequested: number;
    yearsAvailable: number;
    averagePrecipitationMm: number | null;
    medianPrecipitationMm: number | null;
    selectedPrecipitationMm: number | null;
    differenceMm: number | null;
    differencePercent: number | null;
    averageTemperatureC: number | null;
    assessment: string;
    limitation: string | null;
  };
  limitations: string[];
};

export default function Home() {
  const [latitude, setLatitude] = useState("52.23");
  const [longitude, setLongitude] = useState("21.01");
  const [date, setDate] = useState("2026-11-21");
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, date }),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Nie udało się pobrać meteo.");
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nieznany błąd.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 20px",
        fontFamily: "Arial, sans-serif",
        background: "#f4f7f5",
        color: "#15382a",
      }}
    >
      <section style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1>Zatrzymaj wodę, chroń plony</h1>
        <p>Wstępny moduł meteorologiczny dla punktu działki.</p>

        <aside
          style={{
            marginBottom: 12,
            padding: "12px 16px",
            background: "#e7f1ec",
            borderRadius: 12,
          }}
        >
          <strong>Źródło danych:</strong>{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          <br />
          Dane są pobierane dopiero po kliknięciu „Pobierz meteo”. Dla bieżących dat
          używane jest API forecast, dla starszych archiwum.
        </aside>

        <form
          onSubmit={submit}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            padding: 16,
            background: "#fff",
            borderRadius: 12,
          }}
        >
          <label>
            Szerokość
            <input value={latitude} onChange={(event) => setLatitude(event.target.value)} required />
          </label>
          <label>
            Długość
            <input value={longitude} onChange={(event) => setLongitude(event.target.value)} required />
          </label>
          <label>
            Data
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <button type="submit" disabled={loading} style={{ alignSelf: "end", minHeight: 40 }}>
            {loading ? "Analizuję..." : "Pobierz meteo"}
          </button>
        </form>

        {loading && (
          <p role="status" style={{ marginTop: 16, padding: 12, background: "#fff3cd", borderRadius: 8 }}>
            Pobieranie danych meteorologicznych z Open-Meteo...
          </p>
        )}

        {error && <p role="alert" style={{ color: "#a11" }}>{error}</p>}

        {result && (
          <section style={{ marginTop: 20 }}>
            <h2>Wynik dla {result.date}</h2>
            <aside
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: "#fff",
                borderLeft: "4px solid #2f8060",
              }}
            >
              <strong>Pobranie zakończone</strong>
              <br />
              Dostawca: {result.source.provider}
              {" · "}API: {result.source.endpoint}
              {" · "}czas pobrania: {new Date(result.source.fetchedAt).toLocaleString("pl-PL")}
              <br />
              Pokrycie: {result.coverage.daysAvailable}/{result.coverage.daysRequested} dni
              {" "}({result.coverage.start}–{result.coverage.end})
            </aside>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <article><strong>Opady 30 dni</strong><br />{result.indicators.precipitationSumMm ?? "brak"} mm</article>
              <article><strong>Średnia temperatura</strong><br />{result.indicators.averageTemperatureC ?? "brak"} °C</article>
              <article><strong>Najwyższa średnia dobowa</strong><br />{result.indicators.maximumTemperatureC ?? "brak"} °C</article>
              <article><strong>Najdłuższa sekwencja dni bezopadowych</strong><br />{result.indicators.longestDrySpellDays ?? "brak"} dni</article>
              <article><strong>Krótki wskaźnik poniżej progu 30 mm</strong><br />{result.indicators.precipitationShortfallMm ?? "brak"} mm</article>
            </div>

            <section
              style={{
                marginTop: 16,
                padding: 16,
                background: "#eef5ff",
                borderRadius: 12,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Podsumowanie historyczne</h3>
              {result.historicalSummary.status === "unavailable" ? (
                <p role="alert">
                  {result.historicalSummary.assessment}
                  {result.historicalSummary.limitation && (
                    <> {result.historicalSummary.limitation}</>
                  )}
                </p>
              ) : (
                <>
                  <p>
                    <strong>{result.historicalSummary.assessment}</strong>
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <article>
                      <strong>Opady obecnie</strong><br />
                      {result.historicalSummary.selectedPrecipitationMm ?? "brak"} mm
                    </article>
                    <article>
                      <strong>Średnia z lat historycznych</strong><br />
                      {result.historicalSummary.averagePrecipitationMm ?? "brak"} mm
                    </article>
                    <article>
                      <strong>Mediana historyczna</strong><br />
                      {result.historicalSummary.medianPrecipitationMm ?? "brak"} mm
                    </article>
                    <article>
                      <strong>Różnica</strong><br />
                      {result.historicalSummary.differenceMm ?? "brak"} mm
                      {result.historicalSummary.differencePercent !== null &&
                        ` (${result.historicalSummary.differencePercent > 0 ? "+" : ""}${result.historicalSummary.differencePercent}%)`}
                    </article>
                  </div>
                  <p>
                    Lata z danymi: {result.historicalSummary.yearsAvailable}/
                    {result.historicalSummary.yearsRequested}.
                  </p>
                  {result.historicalSummary.limitation && (
                    <p>{result.historicalSummary.limitation}</p>
                  )}
                </>
              )}
              {result.historicalSummary.status === "partial" && (
                <p>Porównanie jest częściowe z powodu brakujących danych w części lat.</p>
              )}
            </section>

            <p>
              Pokrycie: {result.coverage.daysAvailable}/{result.coverage.daysRequested} dni,
              {" "}{result.coverage.start}–{result.coverage.end}.
              Źródło: {result.source.provider}, {result.source.endpoint},
              pobrano {new Date(result.source.fetchedAt).toLocaleString("pl-PL")}.
            </p>

            <h3>Serie dobowe</h3>
            <div style={{ maxHeight: 260, overflow: "auto", background: "#fff", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th align="left">Data</th><th>Opady mm</th><th>Średnia °C</th><th>Max °C</th></tr></thead>
                <tbody>
                  {result.series.map((item) => (
                    <tr key={item.date}>
                      <td>{item.date}</td>
                      <td align="right">{item.precipitationMm ?? "—"}</td>
                      <td align="right">{item.meanTemperatureC ?? "—"}</td>
                      <td align="right">{item.maxTemperatureC ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Ograniczenia</h3>
            <ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}
      </section>
    </main>
  );
}

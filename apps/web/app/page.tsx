export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "Arial, sans-serif",
        background: "#f4f7f5",
        color: "#15382a",
      }}
    >
      <section style={{ maxWidth: 560, padding: 32, textAlign: "center" }}>
        <h1>Zatrzymaj wodę, chroń plony</h1>
        <p>Wstępny szkic aplikacji do analizy sytuacji wodnej działki.</p>
        <a href="/api/health">Sprawdź status aplikacji</a>
      </section>
    </main>
  );
}

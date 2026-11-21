import type { HydroResult, WeatherResult } from "../types";

export type FindingLevel = "good" | "info" | "warn" | "bad";

export type Finding = { level: FindingLevel; title: string; text: string };

export type ReportSummary = {
  verdict: { level: FindingLevel; title: string; text: string };
  findings: Finding[];
  recommendations: string[];
};

export function buildSummary(weather: WeatherResult | null, hydro: HydroResult | null): ReportSummary {
  const findings: Finding[] = [];
  let deficit = 0;
  let surplus = 0;
  let hasStationAlert = false;

  const precipitationDiff = weather?.historicalSummary.differencePercent ?? null;
  if (weather && precipitationDiff !== null) {
    const sign = precipitationDiff > 0 ? "+" : "";
    if (precipitationDiff <= -20) {
      deficit += 1;
      findings.push({ level: "warn", title: "Opady poniżej normy", text: `Suma opadów z 30 dni (${weather.indicators.precipitationSumMm} mm) to ${sign}${precipitationDiff}% względem średniej z ostatnich lat.` });
    } else if (precipitationDiff >= 20) {
      surplus += 1;
      findings.push({ level: "info", title: "Opady powyżej normy", text: `Suma opadów z 30 dni (${weather.indicators.precipitationSumMm} mm) to ${sign}${precipitationDiff}% względem średniej z ostatnich lat.` });
    } else {
      findings.push({ level: "good", title: "Opady w normie", text: `Suma opadów z 30 dni (${weather.indicators.precipitationSumMm} mm) jest zbliżona do średniej historycznej (${sign}${precipitationDiff}%).` });
    }
  }

  const drySpell = weather?.indicators.longestDrySpellDays ?? null;
  if (drySpell !== null && drySpell >= 10) {
    deficit += 1;
    findings.push({ level: "warn", title: "Długi okres bez opadów", text: `W ostatnich 30 dniach wystąpiło ${drySpell} dni z rzędu bez istotnego opadu (< 1 mm).` });
  }

  if (hydro) {
    const { balanceMm } = hydro.waterBalance;
    if (balanceMm !== null) {
      if (balanceMm <= -30) deficit += 2;
      else if (balanceMm < -5) deficit += 1;
      else if (balanceMm > 15) surplus += 1;
      findings.push({
        level: balanceMm <= -30 ? "bad" : balanceMm < -5 ? "warn" : "good",
        title: "Klimatyczny bilans wodny",
        text: `Opad ${hydro.waterBalance.precipitationMm} mm − parowanie ${hydro.waterBalance.evapotranspirationMm} mm = ${balanceMm > 0 ? "+" : ""}${balanceMm} mm. ${hydro.waterBalance.assessment}`,
      });
    }

    if (hydro.soil.status !== "unknown") {
      if (hydro.soil.status === "dry") deficit += 2;
      if (hydro.soil.status === "wet") surplus += 1;
      const change = hydro.soil.rootZoneChangePp;
      if (change !== null && change <= -3 && hydro.soil.status !== "wet") deficit += 1;
      findings.push({
        level: hydro.soil.status === "dry" ? "bad" : hydro.soil.status === "wet" ? "info" : "good",
        title: "Wilgotność gleby",
        text: `Strefa korzeniowa (9–27 cm): ${hydro.soil.rootZonePct}% obj.${change !== null ? ` (${change > 0 ? "+" : ""}${change} p.p. w ciągu 30 dni)` : ""}. ${hydro.soil.assessment}`,
      });
    }

    const alerted = hydro.stations.filter((station) => station.status === "warning" || station.status === "alarm");
    if (alerted.length) {
      hasStationAlert = true;
      surplus += 2;
      findings.push({
        level: alerted.some((station) => station.status === "alarm") ? "bad" : "warn",
        title: "Podwyższone stany wód",
        text: `Przekroczone stany na wodowskazach: ${alerted.map((station) => `${station.name} (${station.river ?? "—"})`).join(", ")}.`,
      });
    }

    if (hydro.river?.trendPercent != null) {
      if (hydro.river.trendPercent <= -20) deficit += 1;
      if (hydro.river.trendPercent >= 30) surplus += 1;
      findings.push({ level: hydro.river.trendPercent <= -20 ? "warn" : "info", title: "Przepływ w zlewni", text: hydro.river.assessment });
    }

    if (hydro.forecast.balanceMm !== null) {
      findings.push({
        level: hydro.forecast.balanceMm < -5 ? "warn" : "info",
        title: `Prognoza na ${hydro.forecast.days} dni`,
        text: `Spodziewany opad ${hydro.forecast.precipitationMm} mm przy parowaniu ${hydro.forecast.evapotranspirationMm} mm – ${hydro.forecast.balanceMm < -5 ? "deficyt będzie się pogłębiał" : hydro.forecast.balanceMm > 5 ? "zapasy wody się uzupełnią" : "bilans pozostanie zbliżony"}.`,
      });
    }
  }

  let verdict: ReportSummary["verdict"];
  let recommendations: string[];
  if (deficit >= 3) {
    verdict = { level: "bad", title: "Wysokie ryzyko niedoboru wody", text: "Wskaźniki meteorologiczne i hydrologiczne wskazują na przesuszenie działki. Warto pilnie zatrzymać wodę w krajobrazie." };
    recommendations = [
      "Zamknij lub podnieś zastawki na rowach melioracyjnych, aby ograniczyć odpływ wody z działki.",
      "Ogranicz uprawę płużną – uprawa uproszczona i mulcz zmniejszają parowanie z gleby.",
      "Pozostaw resztki pożniwne i rozważ międzyplony poprawiające retencję glebową.",
      "Jeżeli działka ma nawadnianie, planuj je wcześnie rano lub wieczorem, by ograniczyć straty na parowanie.",
    ];
  } else if (deficit >= 1 && deficit > surplus) {
    verdict = { level: "warn", title: "Umiarkowane ryzyko niedoboru wody", text: "Część wskaźników wskazuje na spadek zasobów wody. Sytuację warto monitorować i przygotować działania retencyjne." };
    recommendations = [
      "Sprawdź drożność i ustawienie zastawek – utrzymuj wyższy poziom wody w rowach.",
      "Unikaj zabiegów przesuszających glebę (głęboka orka, odkryta gleba).",
      "Rozważ zadrzewienia śródpolne lub pasy buforowe ograniczające wiatr i parowanie.",
    ];
  } else if (hasStationAlert || surplus >= 4) {
    verdict = { level: "warn", title: "Nadmiar wody – ryzyko podtopień", text: "Gleba i cieki są mocno zasilone. Nadwyżkę warto zatrzymać na później zamiast szybko ją odprowadzać." };
    recommendations = [
      "Zatrzymaj nadmiar wody w oczkach wodnych, zbiornikach lub na zastawkach zamiast odprowadzać go do rzeki.",
      "Unikaj wjazdu ciężkim sprzętem na mokre pole – grozi to zagęszczeniem gleby.",
      "Śledź komunikaty IMGW o stanach wód na pobliskich rzekach.",
    ];
  } else if (surplus >= 2) {
    verdict = { level: "info", title: "Dobre uwilgotnienie – czas magazynować wodę", text: "Gleba jest dobrze zasilona, a opady przewyższają parowanie. To najlepszy moment, by zatrzymać tę wodę na sezon wegetacyjny." };
    recommendations = [
      "Podnieś zastawki na rowach, aby nadwyżka wody wsiąkała w glebę zamiast odpływać.",
      "Kieruj spływ z pola do oczek wodnych lub zagłębień terenu zamiast do rowów odwadniających.",
      "Unikaj wjazdu ciężkim sprzętem na mokre pole – grozi to zagęszczeniem gleby.",
    ];
  } else {
    verdict = { level: "good", title: "Sytuacja wodna stabilna", text: "Bilans wody i wilgotność gleby są zbliżone do normy. To dobry moment, by przygotować działkę na okresy suszy." };
    recommendations = [
      "Utrzymuj zastawki w gotowości, aby szybko zatrzymać wodę w razie spadku opadów.",
      "Dbaj o zawartość próchnicy – poprawia ona zdolność gleby do magazynowania wody.",
    ];
  }

  return { verdict, findings, recommendations };
}

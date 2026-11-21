import type { HydroResult, SatelliteResult, WeatherResult } from "../types";

export type FindingLevel = "good" | "info" | "warn" | "bad";

export type Finding = { level: FindingLevel; title: string; text: string };

export type VerdictKind = "deficit-high" | "deficit" | "flood" | "wet" | "stable";

export type ReportSummary = {
  verdict: { kind: VerdictKind; level: FindingLevel; title: string; text: string; plain: string };
  findings: Finding[];
};

export type SimpleTile = { icon: string; label: string; status: string; hint: string; level: FindingLevel };

export function buildSimpleTiles(
  weather: WeatherResult | null,
  hydro: HydroResult | null,
  satellite?: SatelliteResult | null,
): SimpleTile[] {
  const tiles: SimpleTile[] = [];

  const diff = weather?.historicalSummary.differencePercent ?? null;
  const balance = hydro?.waterBalance.balanceMm ?? null;
  if (diff !== null) {
    tiles.push(diff <= -20
      ? { icon: "🌧️", label: "Deszcz", status: "Mniej deszczu niż zwykle", hint: "w ostatnim miesiącu", level: "warn" }
      : diff >= 20
        ? { icon: "🌧️", label: "Deszcz", status: "Więcej deszczu niż zwykle", hint: "w ostatnim miesiącu", level: "info" }
        : { icon: "🌧️", label: "Deszcz", status: "Tyle deszczu co zwykle", hint: "w ostatnim miesiącu", level: "good" });
  } else if (balance !== null) {
    tiles.push(balance < -5
      ? { icon: "🌧️", label: "Deszcz", status: "Za mało deszczu", hint: "więcej wody wyparowało, niż spadło", level: "warn" }
      : balance > 15
        ? { icon: "🌧️", label: "Deszcz", status: "Dużo deszczu", hint: "spadło więcej wody, niż wyparowało", level: "info" }
        : { icon: "🌧️", label: "Deszcz", status: "Deszczu w sam raz", hint: "w ostatnim miesiącu", level: "good" });
  }

  const soil = hydro?.soil.status;
  if (soil === "dry") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest sucha", hint: "korzenie mają za mało wody", level: "bad" });
  else if (soil === "moderate") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest lekko wilgotna", hint: "roślinom wody wystarcza", level: "good" });
  else if (soil === "wet") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest mokra", hint: "dobry moment, by zatrzymać wodę", level: "info" });

  if (satellite && satellite.status !== "unavailable" && satellite.ndvi !== null) {
    tiles.push(satellite.ndvi < 0.3
      ? { icon: "🌾", label: "Rośliny", status: "Rośliny słabo zielone", hint: "widok z satelity", level: "warn" }
      : satellite.ndvi >= 0.6
        ? { icon: "🌾", label: "Rośliny", status: "Rośliny mocno zielone", hint: "widok z satelity", level: "good" }
        : { icon: "🌾", label: "Rośliny", status: "Rośliny średnio zielone", hint: "widok z satelity", level: "info" });
  } else if (satellite !== undefined) {
    tiles.push({ icon: "🌾", label: "Rośliny", status: "Brak zdjęcia z satelity", hint: "np. przez chmury", level: "info" });
  }

  const alert = hydro?.stations.find((station) => station.status === "alarm" || station.status === "warning");
  const forecast = hydro?.forecast.balanceMm ?? null;
  if (alert) {
    tiles.push({ icon: "🌊", label: "Rzeki", status: "Wysoka woda w rzece", hint: `${alert.river ?? alert.name} – uważaj na podtopienia`, level: alert.status === "alarm" ? "bad" : "warn" });
  } else if (forecast !== null) {
    tiles.push(forecast < -5
      ? { icon: "📅", label: "Najbliższy tydzień", status: "Będzie sucho", hint: "mało deszczu w prognozie", level: "warn" }
      : forecast > 5
        ? { icon: "📅", label: "Najbliższy tydzień", status: "Będzie padać", hint: "ziemia dostanie wodę", level: "info" }
        : { icon: "📅", label: "Najbliższy tydzień", status: "Bez większych zmian", hint: "według prognozy pogody", level: "good" });
  }

  return tiles;
}

export function buildSummary(
  weather: WeatherResult | null,
  hydro: HydroResult | null,
  satellite?: SatelliteResult | null,
): ReportSummary {
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

  let vegetationStress = false;
  if (satellite === null) {
    findings.push({
      level: "info",
      title: "Brak wskaźnika satelitarnego",
      text: "Nie udało się pobrać NDVI z Sentinel-2. Raport nie podaje pozornej wartości roślinności.",
    });
  } else if (satellite) {
    if (satellite.status === "unavailable" || satellite.ndvi === null) {
      findings.push({
        level: "info",
        title: "Brak jakościowego NDVI",
        text: satellite.interpretation,
      });
    } else {
      const ndviText = `NDVI ${satellite.ndvi.toFixed(2)}`;
      const observedOn = satellite.date ?? "ostatniej sceny";
      if (satellite.ndvi < 0.3) {
        vegetationStress = true;
        findings.push({
          level: "warn",
          title: "Słaba zielona biomasa (NDVI)",
          text: `${ndviText} z ${observedOn} oznacza słabe lub rozproszone pokrycie roślin. NDVI nie mierzy wilgotności gleby.`,
        });
      } else if (satellite.ndvi >= 0.6) {
        findings.push({
          level: "good",
          title: "Silna zielona biomasa (NDVI)",
          text: `${ndviText} z ${observedOn} wskazuje na intensywne zielone pokrycie.`,
        });
      } else {
        findings.push({
          level: "info",
          title: "Umiarkowana zielona biomasa (NDVI)",
          text: `${ndviText} z ${observedOn} mieści się w zakresie umiarkowanego pokrycia roślin.`,
        });
      }

      if (satellite.ndviDifference !== null && satellite.historicalNdvi !== null) {
        const signed = `${satellite.ndviDifference > 0 ? "+" : ""}${satellite.ndviDifference.toFixed(2)}`;
        if (satellite.ndviDifference <= -0.08) {
          vegetationStress = true;
          findings.push({
            level: "warn",
            title: "Spadek NDVI rok do roku",
            text: `Względem analogicznego okresu ubiegłego roku NDVI spadło z ${satellite.historicalNdvi.toFixed(2)}. Różnica wynosi ${signed}.`,
          });
        } else if (satellite.ndviDifference >= 0.08) {
          findings.push({
            level: "info",
            title: "Wzrost NDVI rok do roku",
            text: `NDVI jest wyższe o ${satellite.ndviDifference.toFixed(2)} względem ubiegłego roku (${satellite.historicalNdvi.toFixed(2)}).`,
          });
        } else {
          findings.push({
            level: "good",
            title: "NDVI zbliżone do ubiegłego roku",
            text: `Różnica rok do roku wynosi ${signed}.`,
          });
        }
      }

      if (satellite.status === "partial") {
        findings.push({
          level: "info",
          title: "Częściowe pokrycie Sentinel-2",
          text: `Ważne piksele obejmują ${satellite.validPixelPercent ?? "—"}% działki, więc wskaźnik NDVI jest mniej pewny.`,
        });
      }
    }
  }

  let satelliteRaisedDeficit = false;
  if (vegetationStress && deficit > 0) {
    deficit += 1;
    satelliteRaisedDeficit = true;
  }

  let verdict: ReportSummary["verdict"];
  if (deficit >= 3) {
    verdict = { kind: "deficit-high", level: "bad", title: "Wysokie ryzyko niedoboru wody", text: "Wskaźniki meteorologiczne i hydrologiczne wskazują na przesuszenie działki. Warto pilnie zatrzymać wodę w krajobrazie.", plain: "Na Twoim polu jest za sucho. Warto jak najszybciej zatrzymać wodę, która jeszcze została na polu i w rowach." };
  } else if (deficit >= 1 && deficit > surplus) {
    verdict = { kind: "deficit", level: "warn", title: "Umiarkowane ryzyko niedoboru wody", text: "Część wskaźników wskazuje na spadek zasobów wody. Sytuację warto monitorować i przygotować działania retencyjne.", plain: "Wody zaczyna brakować. To dobry moment, żeby przygotować pole na suszę." };
  } else if (hasStationAlert || surplus >= 4) {
    verdict = { kind: "flood", level: "warn", title: "Nadmiar wody – ryzyko podtopień", text: "Gleba i cieki są mocno zasilone. Nadwyżkę warto zatrzymać na później zamiast szybko ją odprowadzać.", plain: "Wody jest bardzo dużo, a rzeki w okolicy są wysoko. Uważaj na podtopienia, a nadmiar wody zatrzymaj na później." };
  } else if (surplus >= 2) {
    verdict = { kind: "wet", level: "info", title: "Dobre uwilgotnienie – czas magazynować wodę", text: "Gleba jest dobrze zasilona, a opady przewyższają parowanie. To najlepszy moment, by zatrzymać tę wodę na sezon wegetacyjny.", plain: "Ziemia jest dobrze nawodniona. Zatrzymaj tę wodę na polu – przyda się latem, gdy będzie sucho." };
  } else {
    verdict = { kind: "stable", level: "good", title: "Sytuacja wodna stabilna", text: "Bilans wody i wilgotność gleby są zbliżone do normy. To dobry moment, by przygotować działkę na okresy suszy.", plain: "Z wodą na Twoim polu jest w porządku. Możesz spokojnie przygotować się na suchsze dni." };
  }

  if (satelliteRaisedDeficit && deficit > surplus) {
    verdict = {
      ...verdict,
      text: `${verdict.text} Sentinel-2 pokazuje słabszą zieloną biomasę i wzmacnia tę ocenę. NDVI nie jest pomiarem wilgotności gleby.`,
    };
  } else if (vegetationStress) {
    verdict = {
      ...verdict,
      text: `${verdict.text} Sentinel-2 pokazuje słabszą zieloną biomasę. Sam wskaźnik nie oznacza niedoboru wody — warto sprawdzić fazę uprawy i stan roślin w terenie.`,
    };
  }

  return { verdict, findings };
}

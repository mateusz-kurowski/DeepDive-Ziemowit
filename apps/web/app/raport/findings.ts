import type { HydroResult, SatelliteResult, WeatherResult } from "../types";
import { BALANCE, BALANCE_FALLBACK, FORECAST, PRECIP, SEASON, VEG } from "./advice-config";
import {
  assessWater,
  classifySoil,
  pickGauge,
  readScene,
  type AssessmentContext,
  type FindingLevel,
  type ReportSummary,
} from "./assessment";

export type { AssessmentContext, Finding, FindingLevel, ReportSummary, VerdictKind } from "./assessment";

export type SimpleTile = { icon: string; label: string; status: string; hint: string; level: FindingLevel };

export function buildSummary(
  weather: WeatherResult | null,
  hydro: HydroResult | null,
  satellite?: SatelliteResult | null,
  context: AssessmentContext = {},
): ReportSummary {
  return assessWater(weather, hydro, satellite, context).summary;
}

export function buildSimpleTiles(
  weather: WeatherResult | null,
  hydro: HydroResult | null,
  satellite?: SatelliteResult | null,
  context: AssessmentContext = {},
): SimpleTile[] {
  const date = context.date ?? new Date();
  const month = date.getMonth() + 1;
  const vegetation = (SEASON.vegetation as readonly number[]).includes(month);
  const tiles: SimpleTile[] = [];

  const diff = weather?.historicalSummary.differencePercent ?? null;
  const anomaly = hydro?.waterBalance.anomalyMm ?? null;
  const balance = hydro?.waterBalance.balanceMm ?? null;
  if (diff !== null) {
    tiles.push(diff <= PRECIP.deficitPct
      ? { icon: "🌧️", label: "Deszcz", status: "Mniej deszczu niż zwykle", hint: "w ostatnim miesiącu", level: "warn" }
      : diff >= PRECIP.surplusPct
        ? { icon: "🌧️", label: "Deszcz", status: "Więcej deszczu niż zwykle", hint: "w ostatnim miesiącu", level: "info" }
        : { icon: "🌧️", label: "Deszcz", status: "Tyle deszczu co zwykle", hint: "w ostatnim miesiącu", level: "good" });
  } else if (anomaly !== null) {
    tiles.push(anomaly <= BALANCE.deficit1
      ? { icon: "🌧️", label: "Deszcz", status: "Mniej wody niż zwykle", hint: "bilans poniżej normy wieloletniej", level: "warn" }
      : anomaly >= BALANCE.surplus1
        ? { icon: "🌧️", label: "Deszcz", status: "Więcej wody niż zwykle", hint: "bilans powyżej normy wieloletniej", level: "info" }
        : { icon: "🌧️", label: "Deszcz", status: "Bilans jak zwykle", hint: "w ostatnim miesiącu", level: "good" });
  } else if (balance !== null) {
    const limits = vegetation ? BALANCE_FALLBACK.vegetation : BALANCE_FALLBACK.other;
    tiles.push(balance <= limits.deficit1
      ? { icon: "🌧️", label: "Deszcz", status: "Za mało deszczu", hint: "więcej wody wyparowało, niż spadło", level: "warn" }
      : balance >= limits.surplus1
        ? { icon: "🌧️", label: "Deszcz", status: "Dużo deszczu", hint: "spadło więcej wody, niż wyparowało", level: "info" }
        : { icon: "🌧️", label: "Deszcz", status: "Deszczu w sam raz", hint: "w ostatnim miesiącu", level: "good" });
  }

  const soil = classifySoil(hydro?.soil.rootZonePct ?? null, hydro?.soil.texture);
  if (soil.status === "dry") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest sucha", hint: soil.approximate ? "progi orientacyjne, bez uziarnienia" : "korzenie mają za mało wody", level: "bad" });
  else if (soil.status === "moderate") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest lekko wilgotna", hint: soil.approximate ? "progi orientacyjne, bez uziarnienia" : "roślinom wody wystarcza", level: "good" });
  else if (soil.status === "wet") tiles.push({ icon: "💧", label: "Ziemia", status: "Ziemia jest mokra", hint: "dobry moment, by zatrzymać wodę", level: "info" });

  if (satellite !== undefined) {
    const scene = readScene(satellite, date);
    if (satellite && satellite.status !== "unavailable" && satellite.ndvi !== null && scene.usable) {
      tiles.push(satellite.ndvi < VEG.ndviWeak
        ? { icon: "🌾", label: "Rośliny", status: "Rośliny słabo zielone", hint: "widok z satelity", level: "warn" }
        : satellite.ndvi >= VEG.ndviGood
          ? { icon: "🌾", label: "Rośliny", status: "Rośliny mocno zielone", hint: "widok z satelity", level: "good" }
          : { icon: "🌾", label: "Rośliny", status: "Rośliny średnio zielone", hint: "widok z satelity", level: "info" });
    } else if (scene.note) {
      tiles.push({ icon: "🌾", label: "Rośliny", status: "Brak aktualnego zdjęcia", hint: scene.note, level: "info" });
    } else {
      tiles.push({ icon: "🌾", label: "Rośliny", status: "Brak zdjęcia z satelity", hint: "np. przez chmury", level: "info" });
    }
  }

  const gauge = pickGauge(hydro?.stations);
  const forecast = hydro?.forecast.balanceMm ?? null;
  const forecastLimit = vegetation ? FORECAST.vegetation : FORECAST.other;
  if (gauge.level !== "none" && gauge.station) {
    tiles.push({
      icon: "🌊",
      label: "Rzeki",
      status: "Wysoka woda w rzece",
      hint: `${gauge.station.river ?? gauge.station.name} – uważaj na podtopienia`,
      level: gauge.level === "alarm" ? "bad" : "warn",
    });
  } else if (forecast !== null) {
    tiles.push(forecast <= forecastLimit
      ? { icon: "📅", label: "Najbliższy tydzień", status: "Będzie sucho", hint: "mało deszczu w prognozie", level: "warn" }
      : forecast > 5
        ? { icon: "📅", label: "Najbliższy tydzień", status: "Będzie padać", hint: "ziemia dostanie wodę", level: "info" }
        : { icon: "📅", label: "Najbliższy tydzień", status: "Bez większych zmian", hint: "według prognozy pogody", level: "good" });
  }

  return tiles;
}

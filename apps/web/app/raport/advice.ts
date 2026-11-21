import type { HydroResult, SatelliteResult, WeatherResult } from "../types";
import type { VerdictKind } from "./findings";

export type AdviceTiming = "now" | "week" | "season";

export type Advice = {
  id: string;
  icon: string;
  category: "Zatrzymaj wodę" | "Gleba" | "Uprawa" | "Bezpieczeństwo";
  title: string;
  text: string;
  why: string;
  timing: AdviceTiming;
  priority: number;
};

export const timingLabel: Record<AdviceTiming, string> = {
  now: "Zrób teraz",
  week: "W tym tygodniu",
  season: "W tym sezonie",
};

type AdviceInput = {
  kind: VerdictKind;
  weather: WeatherResult | null;
  hydro: HydroResult | null;
  satellite: SatelliteResult | null | undefined;
  crop: string;
  month: number;
};

const MAX_ADVICE = 5;

function mm(value: number) {
  return `${Math.round(Math.abs(value))} mm`;
}

export function buildAdvice({ kind, weather, hydro, satellite, crop, month }: AdviceInput): Advice[] {
  const advice: Advice[] = [];
  const growingSeason = month >= 3 && month <= 8;
  const coldSeason = month >= 9 || month <= 1;
  const deficit = kind === "deficit" || kind === "deficit-high";
  const soil = hydro?.soil.status ?? "unknown";
  const rootZone = hydro?.soil.rootZonePct ?? null;
  const balance = hydro?.waterBalance.balanceMm ?? null;
  const forecast = hydro?.forecast ?? null;
  const drySpell = weather?.indicators.longestDrySpellDays ?? null;
  const alert = hydro?.stations.find((station) => station.status === "alarm" || station.status === "warning");

  if (alert) {
    advice.push({
      id: "flood",
      icon: "🌊",
      category: "Bezpieczeństwo",
      title: "Przygotuj pole na wysoką wodę",
      text: "Udrożnij przepusty i rowy na granicy pola, a sprzęt, nawozy i środki ochrony roślin przenieś w wyżej położone miejsce.",
      why: `Wodowskaz ${alert.name}${alert.river ? ` na rzece ${alert.river}` : ""} pokazuje ${alert.waterLevelCm} cm${alert.warningLevelCm !== null ? ` przy stanie ostrzegawczym ${alert.warningLevelCm} cm` : ""}.`,
      timing: "now",
      priority: 1,
    });
  }

  if (deficit) {
    advice.push({
      id: "gates-close",
      icon: "🚧",
      category: "Zatrzymaj wodę",
      title: "Zamknij zastawki na rowach",
      text: "Podnieś lub zamknij zastawki, żeby woda nie uciekała rowami z pola. Każdy centymetr wody w rowie to zapas dla gleby obok.",
      why: balance !== null && balance < 0
        ? `W ostatnich 30 dniach wyparowało o ${mm(balance)} więcej wody, niż spadło z deszczem.`
        : "Wskaźniki pokazują, że wody na działce ubywa.",
      timing: "now",
      priority: kind === "deficit-high" ? 2 : 3,
    });
  } else if (!alert && (soil === "wet" || (balance !== null && balance > 15))) {
    advice.push({
      id: "gates-hold",
      icon: "🚧",
      category: "Zatrzymaj wodę",
      title: "Zatrzymaj nadwyżkę wody na polu",
      text: "Podnieś zastawki, żeby woda wsiąkała w glebę zamiast odpływać rowami. Ta woda przyda się w suchym okresie.",
      why: balance !== null && balance > 0
        ? `W ostatnich 30 dniach spadło o ${mm(balance)} więcej wody, niż wyparowało${rootZone !== null ? `, a wilgotność gleby wynosi ${rootZone}%` : ""}.`
        : `Gleba jest mokra${rootZone !== null ? ` (${rootZone}% wilgotności)` : ""}.`,
      timing: "week",
      priority: 3,
    });
  }

  if (soil === "dry") {
    advice.push({
      id: "tillage",
      icon: "🚜",
      category: "Gleba",
      title: "Ogranicz uprawę gleby",
      text: "Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę.",
      why: `Wilgotność w strefie korzeni wynosi tylko ${rootZone ?? "—"}% – to poziom suchej gleby.`,
      timing: "week",
      priority: 3,
    });
  }

  if (growingSeason && drySpell !== null && drySpell >= 10) {
    advice.push({
      id: "irrigation",
      icon: "💦",
      category: "Uprawa",
      title: "Nawadniaj w chłodnych godzinach",
      text: "Jeśli masz możliwość nawadniania, rób to wcześnie rano lub wieczorem – w ciągu dnia duża część wody od razu wyparuje.",
      why: `Przez ${drySpell} dni z rzędu nie spadło więcej niż 1 mm deszczu.`,
      timing: "now",
      priority: 2,
    });
  }

  if (forecast?.balanceMm != null && forecast.balanceMm < -5) {
    advice.push({
      id: "forecast-dry",
      icon: "☀️",
      category: "Zatrzymaj wodę",
      title: "Nie czekaj na deszcz",
      text: "W najbliższych dniach opadów będzie mało. Działania zatrzymujące wodę na polu warto zrobić już teraz.",
      why: `Prognoza na ${forecast.days} dni: ok. ${mm(forecast.precipitationMm ?? 0)} deszczu przy ${mm(forecast.evapotranspirationMm ?? 0)} parowania.`,
      timing: "now",
      priority: 3,
    });
  }

  if (soil === "wet") {
    advice.push({
      id: "heavy-machinery",
      icon: "🛞",
      category: "Gleba",
      title: "Odłóż wjazd ciężkim sprzętem",
      text: "Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony.",
      why: forecast?.balanceMm != null && forecast.balanceMm > 5
        ? `Gleba jest już mokra, a w prognozie jest jeszcze ok. ${mm(forecast.precipitationMm ?? 0)} deszczu.`
        : `Wilgotność gleby wynosi ${rootZone ?? "—"}% – to poziom mokrej gleby.`,
      timing: "week",
      priority: 4,
    });
  }

  if (growingSeason && satellite && satellite.status !== "unavailable" && satellite.ndvi !== null) {
    const weak = satellite.ndvi < 0.3;
    const dropped = satellite.ndviDifference !== null && satellite.ndviDifference <= -0.08;
    if (weak || dropped) {
      advice.push({
        id: "field-check",
        icon: "🔍",
        category: "Uprawa",
        title: "Obejrzyj rośliny na polu",
        text: "Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody – samo zdjęcie z satelity tego nie rozstrzyga.",
        why: dropped && satellite.historicalNdvi !== null
          ? `Zieleń roślin z satelity (NDVI) spadła z ${satellite.historicalNdvi.toFixed(2)} rok temu do ${satellite.ndvi.toFixed(2)}.`
          : `Zieleń roślin z satelity (NDVI) wynosi ${satellite.ndvi.toFixed(2)} – to słabe pokrycie.`,
        timing: "week",
        priority: deficit ? 3 : 4,
      });
    }
  }

  if (deficit || soil === "dry") {
    const cropAdvice = cropMulchAdvice(crop);
    if (cropAdvice) advice.push(cropAdvice);
  }

  if (coldSeason && !deficit) {
    advice.push({
      id: "cover-crop",
      icon: "🌱",
      category: "Gleba",
      title: "Zostaw okrywę roślinną na zimę",
      text: "Międzyplon, poplon lub ściernisko pomagają zatrzymać wodę z deszczu i śniegu i chronią glebę przed spływem.",
      why: "Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać.",
      timing: "season",
      priority: 5,
    });
  }

  advice.push({
    id: "gates-ready",
    icon: "🔧",
    category: "Zatrzymaj wodę",
    title: "Sprawdź zastawki i rowy",
    text: "Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę.",
    why: "Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody.",
    timing: "season",
    priority: 6,
  });

  advice.push({
    id: "humus",
    icon: "🌿",
    category: "Gleba",
    title: "Dbaj o próchnicę w glebie",
    text: "Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody.",
    why: "To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody.",
    timing: "season",
    priority: 7,
  });

  return advice
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_ADVICE);
}

function cropMulchAdvice(crop: string): Advice | null {
  const base = { id: "crop", category: "Uprawa" as const, timing: "season" as const, priority: 4 };
  switch (crop) {
    case "ziemniaki":
    case "warzywa":
      return {
        ...base,
        icon: "🥔",
        title: "Okryj glebę między rzędami",
        text: "Słoma lub inna ściółka między rzędami ogranicza parowanie i utrzymuje wilgoć przy korzeniach.",
        why: "Ziemniaki i warzywa szczególnie źle znoszą brak wody w okresie wzrostu bulw i owoców.",
      };
    case "owoce":
      return {
        ...base,
        icon: "🍎",
        title: "Wyściółkuj pasy pod drzewami",
        text: "Kora, zrębki lub skoszona trawa pod drzewami zmniejszają parowanie i chronią korzenie przed przesuszeniem.",
        why: "Drzewa owocowe potrzebują stałej wilgoci, a odkryta gleba pod koronami szybko wysycha.",
      };
    case "zboza":
    case "rzepak":
    case "kukorydza":
    case "buraki":
      return {
        ...base,
        icon: "🌾",
        title: "Zostaw resztki roślin na polu",
        text: "Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby.",
        why: "Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni.",
      };
    default:
      return null;
  }
}

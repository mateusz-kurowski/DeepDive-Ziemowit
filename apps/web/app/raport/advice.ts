import type { HydroResult, SatelliteResult, WeatherResult } from "../types";
import {
  ADVICE_ID_ORDER,
  ADVICE_LIMIT,
  BALANCE,
  cropRule,
  DEFICIT_VERDICTS,
  FORECAST,
  GAUGE,
  LEGAL,
  NORTH,
  PRIORITY,
  SANDY_TEXTURES,
  SEASON,
  SOIL_SMI,
  TERM_RANK,
  VEG,
  WATCH_VERDICTS,
  WINTER_PRECIP_ANOMALY_PCT,
} from "./advice-config";
import { assessWater, type Assessment, type VerdictKind } from "./assessment";

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

export type AdviceInput = {
  kind?: VerdictKind;
  weather: WeatherResult | null;
  hydro: HydroResult | null;
  satellite: SatelliteResult | null | undefined;
  crop: string;
  month?: number;
  date?: Date;
  latitude?: number | null;
  isWinterCrop?: boolean;
};

export const MAX_ADVICE = ADVICE_LIMIT;

const DEFICIT = new Set<string>(DEFICIT_VERDICTS);
const WATCH = new Set<string>(WATCH_VERDICTS);

export function buildAdvice(input: AdviceInput): Advice[] {
  return selectAdvice(collectAdvice(input)).shown;
}

export function selectAdvice(advice: Advice[]): { shown: Advice[]; cut: Advice[] } {
  let top = advice.slice(0, MAX_ADVICE);
  const crop = advice.find((item) => item.id === "crop");
  if (crop && !top.includes(crop)) top = [...top.slice(0, MAX_ADVICE - 1), crop];
  return { shown: top, cut: advice.filter((item) => !top.includes(item)) };
}

export function collectAdvice(input: AdviceInput): Advice[] {
  const date = input.date ?? (input.month != null ? new Date(new Date().getFullYear(), input.month, 15, 12) : new Date());
  const assessed = assessWater(input.weather, input.hydro, input.satellite, {
    date,
    crop: input.crop,
    latitude: input.latitude,
    isWinterCrop: input.isWinterCrop,
  });
  const advice = composeAdvice(assessed);
  const blocked = applyBlocks(advice, assessed);
  const timed = assessed.summary.verdict.confidence === "low"
    ? blocked.map((item) => (item.timing === "now" && item.id !== "flood" ? { ...item, timing: "week" as const } : item))
    : blocked;
  return timed.sort((a, b) =>
    a.priority - b.priority
    || TERM_RANK[a.timing] - TERM_RANK[b.timing]
    || ADVICE_ID_ORDER.indexOf(a.id as (typeof ADVICE_ID_ORDER)[number]) - ADVICE_ID_ORDER.indexOf(b.id as (typeof ADVICE_ID_ORDER)[number]));
}

function composeAdvice(a: Assessment): Advice[] {
  const advice: Advice[] = [];
  const kind = a.summary.verdict.kind;
  const def = DEFICIT.has(kind);
  const watch = WATCH.has(kind);
  const defOrWatch = def || watch;
  const crop = cropRule(a.crop);
  const inHarvest = crop.harvest.includes(a.month);
  const alarm = a.gauge.level === "alarm";
  const warned = a.gauge.level !== "none";
  const gatesSpring = includes(SEASON.spring, a.month) && !alarm && !defOrWatch;
  const gatesHold = !defOrWatch && !warned && !gatesSpring && !inHarvest
    && (a.soil.status === "wet" || (a.balanceAnomaly != null && a.balanceAnomaly >= BALANCE.surplus1));

  if (a.gauge.station && a.gauge.level !== "none") advice.push(floodAdvice(a));
  if (defOrWatch && !alarm) advice.push(gatesCloseAdvice(a));
  if (gatesSpring) advice.push(gatesSpringAdvice(a));
  if (gatesHold) advice.push(gatesHoldAdvice(a));
  if (a.soil.status === "dry") advice.push(tillageAdvice(a));

  const irrigationOn = irrigationTrigger(a);
  if (irrigationOn) advice.push(irrigationAdvice(a));
  if (a.forecastDry && !irrigationOn) advice.push(forecastAdvice(a));
  if (a.soil.status === "wet") advice.push(machineryAdvice(a, inHarvest));
  if (a.inVegetation && a.ndviUsable && (a.vegAnomaly || a.vegWeak)) advice.push(fieldAdvice(a));

  const cropItem = cropAdvice(a, defOrWatch);
  if (cropItem) advice.push(cropItem);
  if (includes(SEASON.coverCrop, a.month)) advice.push(coverAdvice(a));

  const stableWatch = kind === "stable" && a.inVegetation && (a.drySpell ?? 0) >= 10 && a.soil.status !== "wet" && !irrigationOn;
  if (stableWatch) advice.push(drySpellAdvice(a));

  advice.push(gatesReadyAdvice(a));
  advice.push(humusAdvice());
  return advice.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

function applyBlocks(advice: Advice[], a: Assessment): Advice[] {
  const kind = a.summary.verdict.kind;
  const ids = new Set(advice.map((item) => item.id));
  return advice.filter((item) => {
    if (a.soil.status === "wet" && (item.id === "irrigation" || item.id === "forecast-dry" || item.id === "dry-spell-watch")) return false;
    if (ids.has("irrigation") && (item.id === "forecast-dry" || item.id === "dry-spell-watch")) return false;
    if (ids.has("gates-spring") && item.id === "gates-hold") return false;
    if ((DEFICIT.has(kind) || WATCH.has(kind)) && (item.id === "gates-spring" || item.id === "gates-hold")) return false;
    if (a.gauge.level === "alarm" && (item.id === "gates-spring" || item.id === "gates-hold" || item.id === "gates-close")) return false;
    return true;
  });
}

function floodAdvice(a: Assessment): Advice {
  const station = a.gauge.station!;
  const alarm = station.status === "alarm";
  const threshold = alarm ? station.alarmLevelCm : station.warningLevelCm;
  const name = station.name.replace(/^wodowskaz\s+/i, "");
  const distance = a.gauge.distant ? ` Stacja jest dalej niż ${GAUGE.maxDistanceKm} km, więc to ostrzeżenie jest mniej pewne.` : "";
  return {
    id: "flood",
    icon: "🌊",
    category: "Bezpieczeństwo",
    title: "Przygotuj pole na wysoką wodę",
    text: `Udrożnij przepusty i rowy na granicy pola, a sprzęt przenieś wyżej. ${LEGAL.flood} Przestaw maszyny wyżej i sprawdź na mapach zagrożenia powodziowego, czy działka leży w strefie zalewowej.`,
    why: `Stacja ${name}${station.river ? ` na rzece ${station.river}` : ""} pokazuje ${station.waterLevelCm} cm${threshold != null ? ` przy stanie ${alarm ? "alarmowym" : "ostrzegawczym"} ${threshold} cm` : ""}.${distance}`,
    timing: "now",
    priority: PRIORITY.flood,
  };
}

function gatesCloseAdvice(a: Assessment): Advice {
  const kind = a.summary.verdict.kind;
  const high = kind === "deficit-high" || kind === "drought-high-water";
  const watch = kind === "deficit-watch";
  const parts = [
    "Jeśli w rowach jest jeszcze woda, zamknij istniejące zastawki, żeby nie odpływała. W głębokiej suszy rowy często są już suche – wtedy zastawki nie pomogą. Na rowach spółki wodnej uzgodnij to ze spółką.",
    watch ? "Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie." : null,
    kind === "drought-high-water" ? "Obserwuj stan rzeki – przy dalszym wzroście bądź gotów otworzyć zastawki." : null,
    a.inSpring ? "Wczesna wiosna to najlepszy moment – zatrzymaj wody roztopowe." : null,
    LEGAL.gates,
    LEGAL.gatesPortable,
  ];
  const why = watch
    ? "Opadów jest mniej niż zwykle – zacznij zatrzymywać wodę, zanim gleba przeschnie."
    : deficitWhy(a);
  const river = kind === "drought-high-water" ? " Obserwuj stan rzeki – przy dalszym wzroście bądź gotów otworzyć zastawki." : "";
  return {
    id: "gates-close",
    icon: "🚧",
    category: "Zatrzymaj wodę",
    title: "Zamknij zastawki na rowach",
    text: join(parts),
    why: `${why}${river}`,
    timing: watch ? "week" : "now",
    priority: high ? PRIORITY.gatesCloseHigh : PRIORITY.gatesClose,
  };
}

function gatesSpringAdvice(a: Assessment): Advice {
  const dryWinter = a.winterPrecipAnomalyPct != null && a.winterPrecipAnomalyPct <= WINTER_PRECIP_ANOMALY_PCT;
  return {
    id: "gates-spring",
    icon: "🚧",
    category: "Zatrzymaj wodę",
    title: "Zamknij zastawki po roztopach",
    text: join([
      "Zamknij zastawki zaraz po roztopach i wiosennym odwodnieniu pola. Woda roztopowa to najtańszy zapas na wiosnę – jej całkowite odprowadzenie to marnotrawstwo.",
      dryWinter ? "Po bezśnieżnej zimie zamiast odwadniać rozważ wiosenne nawodnienie podsiąkowe, jeśli masz taki system." : null,
      LEGAL.gates,
    ]),
    why: dryWinter
      ? `Opady zimy były o ${Math.abs(Math.round(a.winterPrecipAnomalyPct!))}% niższe od normy. Woda roztopowa jest teraz najtańszym zapasem.`
      : "Luty, marzec i kwiecień to czas, żeby zatrzymać wodę roztopową, zanim odpłynie rowami.",
    timing: "week",
    priority: PRIORITY.gatesSpring,
  };
}

function gatesHoldAdvice(a: Assessment): Advice {
  const winter = a.isWinterCrop && includes(SEASON.winterCropHold, a.month);
  const why = a.balanceAnomaly != null && a.balanceAnomaly >= BALANCE.surplus1
    ? `Bilans wody jest o ${mm(a.balanceAnomaly)} wyższy niż zwykle o tej porze${a.soil.status === "wet" && a.rootZonePct != null ? `, a wilgotność gleby wynosi ${a.rootZonePct}%` : ""}.`
    : `Gleba jest mokra${a.rootZonePct != null ? ` (${a.rootZonePct}% wilgotności)` : ""}.`;
  return {
    id: "gates-hold",
    icon: "🚧",
    category: "Zatrzymaj wodę",
    title: "Zatrzymaj nadwyżkę wody na polu",
    text: winter
      ? `Zatrzymuj wodę w rowach, ale nie dopuść, żeby woda stała przy korzeniach oziminy. Przy zastoiskach uchyl zastawkę. ${LEGAL.gates}`
      : `Podnieś zastawki, żeby woda wsiąkała w glebę zamiast odpływać rowami. Ta woda przyda się w suchym okresie. ${LEGAL.gates}`,
    why: winter ? `${why} Nie zalewaj oziminy.` : why,
    timing: "week",
    priority: PRIORITY.gatesHold,
  };
}

function tillageAdvice(a: Assessment): Advice {
  return {
    id: "tillage",
    icon: "🚜",
    category: "Gleba",
    title: "Ogranicz uprawę gleby",
    text: "Zrezygnuj z orki i głębokiego spulchniania – odwracanie gleby przyspiesza jej wysychanie. Zostaw resztki roślin na powierzchni jako ochronę. Na glebach ciężkich z podeszwą płużną rozważ jesienią głęboszowanie, gdy gleba nie jest przesuszona ani mokra.",
    why: soilWhy(a, true),
    timing: "week",
    priority: PRIORITY.tillage,
  };
}

function irrigationAdvice(a: Assessment): Advice {
  const kind = a.summary.verdict.kind;
  const why = [irrigationWhy(a)];
  if ((a.drySpell ?? 0) >= 10) why.push(`Przez ${a.drySpell} dni z rzędu nie spadło więcej niż 1 mm deszczu.`);
  if (a.forecastDry && a.forecast?.balanceMm != null) why.push(forecastSentence(a));
  return {
    id: "irrigation",
    icon: "💦",
    category: "Uprawa",
    title: "Nawadniaj w chłodnych godzinach",
    text: `Jeśli masz ujęcie z pozwoleniem wodnoprawnym i instalację, nawadniaj rano lub wieczorem. Nie deszczuj przy wietrze powyżej 4 m/s. Przerwij po opadzie powyżej 25–30 mm. Nawadniaj do polowej pojemności, nie do zastoisk – nadmiar wymywa nawozy. ${LEGAL.irrigation} ${LEGAL.irrigationVolume}`,
    why: why.join(" "),
    timing: kind === "deficit-high" || kind === "drought-high-water" ? "now" : "week",
    priority: PRIORITY.irrigation,
  };
}

function forecastAdvice(a: Assessment): Advice {
  const kind = a.summary.verdict.kind;
  return {
    id: "forecast-dry",
    icon: "☀️",
    category: "Zatrzymaj wodę",
    title: "Nie czekaj na deszcz",
    text: "W najbliższych dniach opadów będzie mało względem parowania. Działania zatrzymujące wodę na polu warto zrobić już teraz.",
    why: forecastSentence(a),
    timing: DEFICIT.has(kind) ? "now" : "week",
    priority: DEFICIT.has(kind) || WATCH.has(kind) ? PRIORITY.forecastDryDeficit : PRIORITY.forecastDry,
  };
}

function machineryAdvice(a: Assessment, inHarvest: boolean): Advice {
  return {
    id: "heavy-machinery",
    icon: "🛞",
    category: "Gleba",
    title: "Odłóż wjazd ciężkim sprzętem",
    text: "Mokra gleba łatwo się ugniata. Ugnieciona ziemia gorzej przyjmuje wodę i może utrudniać uprawę przez kolejne sezony.",
    why: a.forecast?.balanceMm != null && a.forecast.balanceMm > 5
      ? `Gleba jest już mokra, a w prognozie jest jeszcze ok. ${mm(a.forecast.precipitationMm ?? 0)} deszczu.`
      : soilWhy(a, false),
    timing: "week",
    priority: inHarvest ? PRIORITY.heavyMachineryHarvest : PRIORITY.heavyMachinery,
  };
}

function fieldAdvice(a: Assessment): Advice {
  const kind = a.summary.verdict.kind;
  return {
    id: "field-check",
    icon: "🔍",
    category: "Uprawa",
    title: "Obejrzyj rośliny na polu",
    text: "Sprawdź, czy słabsza zieleń wynika z fazy rozwoju, choroby, szkodników czy braku wody. Zdjęcie z satelity nie wystarcza, żeby zdecydować o nawadnianiu.",
    why: fieldWhy(a),
    timing: "week",
    priority: DEFICIT.has(kind) || WATCH.has(kind) ? PRIORITY.fieldCheckDeficit : PRIORITY.fieldCheck,
  };
}

function cropAdvice(a: Assessment, defOrWatch: boolean): Advice | null {
  if (!defOrWatch && a.soil.status !== "dry") return null;
  const rule = cropRule(a.crop);
  const variant = cropVariant(rule, a.month);
  if (!variant) return null;
  const before = variant === "residue-before";
  const base = {
    id: "crop",
    category: "Uprawa" as const,
    timing: "season" as const,
    priority: before ? PRIORITY.cropBeforeHarvest : PRIORITY.crop,
  };
  if (variant === "rows") {
    return {
      ...base,
      icon: a.crop === "warzywa" ? "🥕" : "🥔",
      title: "Okryj glebę między rzędami",
      text: "Słoma lub inna ściółka między rzędami ogranicza parowanie i utrzymuje wilgoć przy korzeniach.",
      why: "Ziemniaki i warzywa szczególnie źle znoszą brak wody w okresie wzrostu bulw i owoców.",
    };
  }
  if (variant === "trees") {
    return {
      ...base,
      icon: "🍎",
      title: "Wyściółkuj pasy pod drzewami",
      text: "Kora, zrębki lub skoszona trawa pod drzewami zmniejszają parowanie i chronią korzenie przed przesuszeniem.",
      why: "Drzewa owocowe potrzebują stałej wilgoci, a odkryta gleba pod koronami szybko wysycha.",
    };
  }
  if (variant === "generic") {
    return {
      ...base,
      icon: "🪴",
      title: "Nie zostawiaj gleby odkrytej",
      text: "Nie zostawiaj gleby odkrytej – mulcz lub okrywa ogranicza parowanie.",
      why: "Odkryta gleba traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni.",
    };
  }
  if (variant === "residue-before") {
    return {
      ...base,
      icon: "🌾",
      title: "Po zbiorze zostaw resztki i wysiej międzyplon",
      text: "Po zbiorze zostaw resztki na polu i wysiej międzyplon, żeby gleba nie została odkryta.",
      why: "Do żniw jeszcze chwila, ale już teraz warto zaplanować okrywę, która ograniczy parowanie po zbiorze.",
    };
  }
  return {
    ...base,
    icon: "🌾",
    title: "Zostaw resztki roślin na polu",
    text: "Słoma i resztki pożniwne zostawione na powierzchni działają jak ściółka i zmniejszają parowanie z odkrytej gleby.",
    why: "Odkryta gleba po zbiorze traci wodę najszybciej, zwłaszcza w ciepłe i wietrzne dni.",
  };
}

function coverAdvice(a: Assessment): Advice {
  const month = a.month;
  const sandy = a.texture != null && (SANDY_TEXTURES as readonly string[]).includes(a.texture);
  const sandNote = sandy ? " Unikaj orki zimowej – skiby zwiększają parowanie." : "";
  if (month === 8 || month === 9) {
    return {
      id: "cover-crop",
      icon: "🌱",
      category: "Gleba",
      title: "Wysiej międzyplon po zbiorze",
      text: `Po zbiorze wysiej międzyplon lub mieszankę okrywową.${sandNote}`,
      why: "Okrywa po żniwach poprawia retencję i ogranicza parowanie z gołej gleby.",
      timing: "season",
      priority: PRIORITY.coverCrop,
    };
  }
  if (month === 2) {
    return {
      id: "cover-crop",
      icon: "🌱",
      category: "Gleba",
      title: "Nie zaoruj okrywy przed wiosną",
      text: `Nie zaoruj okrywy przed wiosną.${sandNote}`,
      why: "Okrywa zimowa trzyma wodę do startu wegetacji. Zaoranie jej teraz zwiększa parowanie.",
      timing: "season",
      priority: PRIORITY.coverCrop,
    };
  }
  return {
    id: "cover-crop",
    icon: "🌱",
    category: "Gleba",
    title: "Zostaw okrywę roślinną na zimę",
    text: `Zostaw okrywę roślinną na zimę.${sandNote}`,
    why: "Jesienią i zimą gleba gromadzi zapas wody na wiosnę – okrywa roślinna pomaga go utrzymać.",
    timing: "season",
    priority: PRIORITY.coverCrop,
  };
}

function drySpellAdvice(a: Assessment): Advice {
  return {
    id: "dry-spell-watch",
    icon: "👀",
    category: "Gleba",
    title: "Obserwuj glebę",
    text: `Od ${a.drySpell} dni nie padało więcej niż 1 mm. Sprawdź glebę łopatą na głębokości korzeni – po krótkim deszczu wierzch bywa wilgotny, a 5 cm niżej sucho.`,
    why: `Seria ${a.drySpell} dni bez istotnego deszczu jeszcze nie oznacza suszy, ale glebę warto sprawdzić na głębokości korzeni.`,
    timing: "week",
    priority: PRIORITY.drySpellWatch,
  };
}

function gatesReadyAdvice(a: Assessment): Advice {
  const season = includes(SEASON.gatesReadyPriority, a.month);
  return {
    id: "gates-ready",
    icon: "🔧",
    category: "Zatrzymaj wodę",
    title: "Sprawdź zastawki i rowy",
    text: `Upewnij się, że zastawki działają, a rowy nie są zarośnięte. Dzięki temu w razie potrzeby szybko zatrzymasz albo odprowadzisz wodę. ${LEGAL.gatesReadyPermit} ${LEGAL.gatesReadyOwner}`,
    why: season
      ? "Wiosna i jesień to czas konserwacji urządzeń melioracyjnych."
      : "Sprawne urządzenia na rowach to najszybszy sposób reagowania na suszę i nadmiar wody.",
    timing: "season",
    priority: season ? PRIORITY.gatesReadySeason : PRIORITY.gatesReady,
  };
}

function humusAdvice(): Advice {
  return {
    id: "humus",
    icon: "🌿",
    category: "Gleba",
    title: "Dbaj o próchnicę w glebie",
    text: "Obornik, kompost i międzyplony zwiększają ilość próchnicy, a gleba bogata w próchnicę magazynuje więcej wody.",
    why: "To długofalowy sposób na większy zapas wody w glebie niezależnie od pogody.",
    timing: "season",
    priority: PRIORITY.humus,
  };
}

function irrigationTrigger(a: Assessment) {
  const rule = cropRule(a.crop);
  if (!rule.irrigable || !rule.window) return false;
  const start = shiftNorth(rule.window[0], a.latitude);
  if (!isWithin(a.date, start, rule.window[1])) return false;
  if (a.soil.status === "wet") return false;
  const soilDeficit = a.soil.status === "dry"
    || (a.soil.smi != null && a.soil.smi < SOIL_SMI.irrigateBelow)
    || (a.soilDrop && (a.balanceAnomaly ?? Number.NEGATIVE_INFINITY) <= BALANCE.deficit1)
    || (a.ndwi != null && a.ndwi < VEG.ndwiVeryDry && a.ndviUsable);
  return soilDeficit;
}

function deficitWhy(a: Assessment) {
  if (a.balanceAnomaly != null && a.balanceAnomaly <= BALANCE.deficit1) {
    const absolute = a.balanceMm != null && a.balanceMm < 0
      ? ` W ostatnich 30 dniach wyparowało o ${mm(a.balanceMm)} więcej wody, niż spadło.`
      : "";
    return `Bilans wody jest o ${mm(a.balanceAnomaly)} niższy niż zwykle o tej porze.${absolute}`;
  }
  if (a.balanceMm != null && a.balanceMm < 0) {
    return `W ostatnich 30 dniach wyparowało o ${mm(a.balanceMm)} więcej wody, niż spadło z deszczem.`;
  }
  if (a.soil.status === "dry") return soilWhy(a, true);
  return "Wskaźniki pokazują, że wody na działce ubywa.";
}

function soilWhy(a: Assessment, dry: boolean) {
  if (a.soil.smi != null && a.texture) {
    const label = dry ? "sucha" : "mokra";
    return `Przy tej glebie ${a.rootZonePct}% obj. daje wskaźnik ${num(a.soil.smi)} (0 = więdnięcie, 1 = polowa pojemność) – gleba jest ${label}.`;
  }
  return `Wilgotność w strefie korzeni wynosi ${a.rootZonePct ?? "—"}% – to poziom ${dry ? "suchej" : "mokrej"} gleby.`;
}

function irrigationWhy(a: Assessment) {
  const moisture = a.rootZonePct;
  if (a.soil.status === "dry") return `Wilgotność w strefie korzeni wynosi ${moisture ?? "—"}% – gleba jest sucha.`;
  if (a.soil.smi != null && a.soil.smi < SOIL_SMI.irrigateBelow) {
    return `Wskaźnik wilgotności gleby wynosi ${a.soil.smi.toFixed(2).replace(".", ",")} (0 = więdnięcie, 1 = polowa pojemność).`;
  }
  if (a.ndwi != null && a.ndwi < VEG.ndwiVeryDry) return `NDWI ${a.ndwi.toFixed(2).replace(".", ",")} wskazuje, że rośliny są bardzo suche.`;
  return "Wilgotność gleby spada, a bilans wody jest poniżej normy.";
}

function fieldWhy(a: Assessment) {
  const ndvi = a.ndvi ?? 0;
  if (a.physio && a.ndwi != null) {
    return `Rośliny tracą wodę (NDWI ${num(a.ndwi)} przy NDVI ${num(ndvi)}) – sprawdź, czy liście więdną.`;
  }
  if (a.ndviZ != null && a.ndviZ <= VEG.ndviAnomalyZ) {
    return `Zieleń roślin (NDVI ${num(ndvi)}) jest wyraźnie niższa niż zwykle o tej porze na tej działce.`;
  }
  if (a.ndviYoY != null && a.ndviYoY <= VEG.ndviYoYDrop && a.historicalNdvi != null) {
    return `NDVI spadło z ${num(a.historicalNdvi)} rok temu do ${num(ndvi)}. Jeśli rok temu rosła tu inna uprawa, porównanie może mylić.`;
  }
  return `NDVI ${num(ndvi)} to słaba kondycja roślin (0,2–0,4).`;
}

function forecastSentence(a: Assessment) {
  const forecast = a.forecast;
  const limit = a.inVegetation ? FORECAST.vegetation : FORECAST.other;
  return `Prognoza na ${forecast?.days ?? 7} dni: ok. ${mm(forecast?.precipitationMm ?? 0)} deszczu przy ${mm(forecast?.evapotranspirationMm ?? 0)} parowania (próg suchej prognozy ${limit} mm).`;
}

function cropVariant(rule: ReturnType<typeof cropRule>, month: number) {
  if (rule.mulch === "rows") return rule.growing.includes(month) ? "rows" as const : null;
  if (rule.mulch === "tree_strips") return "trees" as const;
  if (rule.mulch === "generic") return rule.growing.includes(month) ? "generic" as const : null;
  if (rule.harvest.includes(month)) return "residue" as const;
  const firstHarvest = rule.harvest.length ? Math.min(...rule.harvest) : null;
  if (firstHarvest != null && rule.growing.includes(month) && month < firstHarvest) return "residue-before" as const;
  return null;
}

function shiftNorth(start: string, latitude: number | null) {
  if (latitude == null || latitude < NORTH.latitude) return start;
  const [month, day] = start.split("-").map(Number);
  const shift = month < 5 || (month === 5 && day <= 5)
    ? NORTH.aprilOrEarlyMayDays
    : month === 5 && day < 25
      ? NORTH.lateMayDays
      : 0;
  if (!shift) return start;
  const shifted = new Date(2026, month - 1, day + shift);
  return `${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

function isWithin(date: Date, start: string, end: string) {
  const key = monthDay(date);
  return key >= start && key <= end;
}

function monthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function includes(months: readonly number[], month: number) {
  return months.includes(month);
}

function join(parts: Array<string | null | undefined | false>) {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

function num(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function mm(value: number) {
  return `${Math.round(Math.abs(value))} mm`;
}

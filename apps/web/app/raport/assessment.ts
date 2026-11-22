import type { HydroResult, HydroStation, SatelliteResult, SoilTexture, WeatherResult } from "../types";
import {
  BALANCE,
  BALANCE_FALLBACK,
  DRY_SPELL_DAYS,
  FORECAST,
  GAUGE,
  LOW_CONFIDENCE_SUFFIX,
  PRECIP,
  RIVER,
  SCENE,
  SANDY_TEXTURES,
  SEASON,
  SOIL_ANOMALY_Z,
  SOIL_DROP_PP,
  SOIL_FALLBACK,
  SOIL_SMI,
  SOIL_WATER,
  SPI,
  TEXTURE_LABEL,
  VEG,
  VERDICT_TITLE,
  WINTER_CROPS,
} from "./advice-config";

export type FindingLevel = "good" | "info" | "warn" | "bad";
export type Finding = { level: FindingLevel; title: string; text: string };
export type Cause = { title: string; evidence: string; source: string; certainty: "sygnał" | "brak danych" };
export type VerdictKind = "deficit-high" | "deficit" | "deficit-watch" | "drought-high-water" | "flood" | "wet" | "stable";
export type SoilStatus = "dry" | "moderate" | "wet" | "unknown";
export type SignalName = "meteo" | "soil" | "veg";

export type ReportSummary = {
  verdict: {
    kind: VerdictKind;
    level: FindingLevel;
    title: string;
    text: string;
    plain: string;
    intense: boolean;
    confidence: "low" | "normal";
    stage: 0 | 1 | 2 | 3;
    deficit: number;
    surplus: number;
  };
  findings: Finding[];
  causes: Cause[];
  soil: { status: SoilStatus; smi: number | null; approximate: boolean };
  sceneNote: string | null;
  signals: SignalName[];
};

export type AssessmentContext = {
  date?: Date;
  crop?: string;
  latitude?: number | null;
  isWinterCrop?: boolean;
};

export type GaugePick = {
  level: "alarm" | "warning" | "none";
  station: HydroStation | null;
  distant: boolean;
};

export type SoilReading = {
  status: SoilStatus;
  smi: number | null;
  approximate: boolean;
};

export type Assessment = {
  summary: ReportSummary;
  date: Date;
  month: number;
  crop: string;
  latitude: number | null;
  isWinterCrop: boolean;
  soil: SoilReading;
  rootZonePct: number | null;
  texture: SoilTexture | null;
  soilDrop: boolean;
  soilAnomalyZ: number | null;
  balanceMm: number | null;
  balanceAnomaly: number | null;
  drySpell: number | null;
  forecastDry: boolean;
  gauge: GaugePick;
  riverUsable: boolean;
  inVegetation: boolean;
  inSpring: boolean;
  ndvi: number | null;
  ndviYoY: number | null;
  ndviZ: number | null;
  historicalNdvi: number | null;
  ndwi: number | null;
  ndviUsable: boolean;
  vegAnomaly: boolean;
  vegWeak: boolean;
  physio: boolean;
  winterPrecipAnomalyPct: number | null;
  forecast: HydroResult["forecast"] | null;
};

export function classifySoil(theta: number | null, texture: SoilTexture | null | undefined): SoilReading {
  if (theta == null) return { status: "unknown", smi: null, approximate: false };
  if (!texture) {
    const status: SoilStatus = theta < SOIL_FALLBACK.dryBelow ? "dry" : theta >= SOIL_FALLBACK.wetAt ? "wet" : "moderate";
    return { status, smi: null, approximate: true };
  }
  const { ptw, ppw } = SOIL_WATER[texture];
  const smi = (theta - ptw) / (ppw - ptw);
  const status: SoilStatus = smi < SOIL_SMI.dryBelow ? "dry" : smi >= SOIL_SMI.wetAt ? "wet" : "moderate";
  return { status, smi, approximate: false };
}

export function pickGauge(stations: HydroStation[] | undefined): GaugePick {
  const alerts = (stations ?? []).filter((station) => station.status === "alarm" || station.status === "warning");
  if (!alerts.length) return { level: "none", station: null, distant: false };
  const near = alerts.filter((station) => station.distanceKm <= GAUGE.maxDistanceKm);
  const pool = near.length ? near : alerts;
  const chosen = pool.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === "alarm" ? -1 : 1;
    return a.distanceKm - b.distanceKm;
  })[0];
  return {
    level: chosen.status === "alarm" ? "alarm" : "warning",
    station: chosen,
    distant: near.length === 0,
  };
}

export function readScene(satellite: SatelliteResult | null | undefined, date: Date): { usable: boolean; note: string | null } {
  if (!satellite || satellite.status === "unavailable" || satellite.ndvi == null) return { usable: false, note: null };
  const sceneDate = satellite.date?.slice(0, 10) ?? null;
  const age = sceneDate ? daysBetween(sceneDate, date) : null;
  const clear = satellite.sceneClearPct ?? satellite.validPixelPercent;
  const usable = age != null && age <= SCENE.maxAgeDays && clear != null && clear >= SCENE.minClearPct;
  if (usable) return { usable: true, note: null };
  const stamp = sceneDate ? formatDayMonth(sceneDate) : "brak daty";
  return { usable: false, note: `Brak aktualnej, bezchmurnej sceny (ostatnia: ${stamp}).` };
}

export function assessWater(
  weather: WeatherResult | null,
  hydro: HydroResult | null,
  satellite?: SatelliteResult | null,
  context: AssessmentContext = {},
): Assessment {
  const date = context.date ?? new Date();
  const month = date.getMonth() + 1;
  const crop = context.crop ?? "inna";
  const latitude = context.latitude ?? hydro?.location.latitude ?? null;
  const isWinterCrop = context.isWinterCrop ?? (WINTER_CROPS as readonly string[]).includes(crop);
  const inVegetation = includesMonth(SEASON.vegetation, month);
  const inSpring = includesMonth(SEASON.spring, month);

  const texture = hydro?.soil.texture ?? null;
  const theta = hydro?.soil.rootZonePct ?? null;
  const soil = classifySoil(theta, texture);
  const soilNormal = hydro?.soil.normalPct ?? null;
  const soilSd = hydro?.soil.sdPct ?? null;
  const soilAnomalyZ = theta != null && soilNormal != null && soilSd ? (theta - soilNormal) / soilSd : null;
  const change = hydro?.soil.rootZoneChangePp ?? null;
  const soilDrop = change != null && change <= SOIL_DROP_PP && soil.status !== "wet" && soil.status !== "unknown";

  const spi1 = weather?.indicators.spi1 ?? null;
  const spi3 = weather?.indicators.spi3 ?? null;
  const precipPct = weather?.historicalSummary.differencePercent ?? null;
  const precipDeficit = (spi3 != null && spi3 < SPI.spi3Deficit)
    || (spi1 != null && spi1 < SPI.spi1Deficit)
    || (spi1 == null && spi3 == null && precipPct != null && precipPct <= PRECIP.deficitPct);
  const precipSurplus = spi1 != null ? spi1 > SPI.spi1Surplus : precipPct != null && precipPct >= PRECIP.surplusPct;

  const balanceMm = hydro?.waterBalance.balanceMm ?? null;
  const balanceAnomaly = hydro?.waterBalance.anomalyMm ?? null;
  const balanceThresholds = balanceAnomaly != null
    ? BALANCE
    : (inVegetation ? BALANCE_FALLBACK.vegetation : BALANCE_FALLBACK.other);
  const balanceValue = balanceAnomaly != null ? balanceAnomaly : balanceMm;
  let balanceDeficit: 0 | 1 | 2 = 0;
  let balanceSurplus: 0 | 1 = 0;
  if (balanceValue != null) {
    if (balanceValue <= balanceThresholds.deficit2) balanceDeficit = 2;
    else if (balanceValue <= balanceThresholds.deficit1) balanceDeficit = 1;
    else if (balanceValue >= balanceThresholds.surplus1) balanceSurplus = 1;
  }

  const trend = hydro?.river?.trendPercent ?? null;
  const catchment = hydro?.river?.catchmentKm2 ?? null;
  const riverUsable = catchment == null || catchment >= RIVER.minCatchmentKm2;
  const riverLow = riverUsable && trend != null && trend <= RIVER.deficit;
  const riverHigh = riverUsable && trend != null && trend >= RIVER.surplus;

  const gauge = pickGauge(hydro?.stations);
  const drySpell = weather?.indicators.longestDrySpellDays ?? null;

  const scene = readScene(satellite, date);
  const ndvi = satellite && satellite.status !== "unavailable" ? satellite.ndvi : null;
  const ndviYoY = satellite?.ndviDifference ?? null;
  const historicalNdvi = satellite?.historicalNdvi ?? null;
  const ndviNormal = satellite?.ndviNormal ?? null;
  const ndviSd = satellite?.ndviSd ?? null;
  const ndwi = satellite?.ndwi ?? null;
  const ndviZ = ndvi != null && ndviNormal != null && ndviSd ? (ndvi - ndviNormal) / ndviSd : null;
  const physio = ndvi != null && ndwi != null && ndvi < VEG.physioNdvi && ndwi < VEG.physioNdwi;
  const yoyDrop = ndviYoY != null && ndviYoY <= VEG.ndviYoYDrop;
  const vegAnomaly = (ndviZ != null ? ndviZ <= VEG.ndviAnomalyZ : yoyDrop) || physio;
  const vegSignal = Boolean(vegAnomaly && scene.usable && inVegetation);
  const vegWeak = Boolean(ndvi != null && ndvi < VEG.ndviWeak && includesMonth(VEG.ndviWeakMonths, month) && scene.usable);

  const meteo = Boolean(precipDeficit || balanceDeficit > 0 || riverLow);
  const soilSignal = soil.status === "dry" || soilDrop || (soilAnomalyZ != null && soilAnomalyZ <= SOIL_ANOMALY_Z);

  let stage: 0 | 1 | 2 | 3 = 0;
  if (meteo) stage = 1;
  if (soilSignal || (meteo && vegSignal)) stage = 2;
  if (soilSignal && vegSignal) stage = 3;

  let deficit = 0;
  let surplus = 0;
  if (precipDeficit) deficit += 1;
  if (precipSurplus) surplus += 1;
  deficit += balanceDeficit;
  surplus += balanceSurplus;
  if (drySpell != null && drySpell >= DRY_SPELL_DAYS) deficit += 1;
  if (riverLow) deficit += 1;
  if (riverHigh) surplus += 1;
  if (gauge.level !== "none" && !gauge.distant) surplus += 2;
  if (soil.status === "dry") deficit += 2;
  if (soil.status === "wet") surplus += 1;
  if (soilDrop) deficit += 1;
  if (soilAnomalyZ != null && soilAnomalyZ <= SOIL_ANOMALY_Z) deficit += 1;
  if (vegSignal) deficit += 1;

  const signals: SignalName[] = [];
  if (meteo) signals.push("meteo");
  if (soilSignal) signals.push("soil");
  if (vegSignal) signals.push("veg");

  let kind: VerdictKind = "stable";
  if (gauge.level === "alarm") kind = "flood";
  else if (gauge.level === "warning" && stage >= 2) kind = "drought-high-water";
  else if (gauge.level === "warning") kind = "flood";
  else if (stage === 3) kind = "deficit-high";
  else if (stage === 2 && deficit >= 3) kind = "deficit-high";
  else if (stage === 2 && deficit > surplus) kind = "deficit";
  else if (stage === 1 && deficit > surplus) kind = "deficit-watch";
  else if (surplus >= 2) kind = "wet";

  const intense = kind === "wet" && surplus >= 4;
  const confidence: "low" | "normal" = hydro == null || theta == null ? "low" : "normal";
  const forecast = hydro?.forecast ?? null;
  const forecastLimit = inVegetation ? FORECAST.vegetation : FORECAST.other;
  const forecastDry = forecast?.balanceMm != null && forecast.balanceMm <= forecastLimit && soil.status !== "wet";

  const findings = buildFindings({
    weather,
    hydro,
    satellite,
    soil,
    texture,
    theta,
    soilAnomalyZ,
    change,
    balanceMm,
    balanceAnomaly,
    balanceThresholds,
    balanceValue,
    gauge,
    riverUsable,
    trend,
    catchment,
    scene,
    ndvi,
    ndviYoY,
    historicalNdvi,
    ndviZ,
    ndwi,
    inVegetation,
    month,
    precipDeficit,
    precipSurplus,
    spi1,
    spi3,
    confidence,
    forecastDry,
    forecastLimit,
  });

  const verdict = describeVerdict({ kind, intense, confidence, stage, deficit, surplus, vegSignal, vegWeak, sceneUsable: scene.usable });

  return {
    summary: { verdict, findings, causes: identifyCauses(findings, confidence, texture, balanceDeficit > 0), soil, sceneNote: scene.note, signals },
    date,
    month,
    crop,
    latitude,
    isWinterCrop,
    soil,
    rootZonePct: theta,
    texture,
    soilDrop,
    soilAnomalyZ,
    balanceMm,
    balanceAnomaly,
    drySpell,
    forecastDry,
    gauge,
    riverUsable,
    inVegetation,
    inSpring,
    ndvi,
    ndviYoY,
    ndviZ,
    historicalNdvi,
    ndwi,
    ndviUsable: scene.usable,
    vegAnomaly,
    vegWeak,
    physio,
    winterPrecipAnomalyPct: weather?.winterPrecipAnomalyPct ?? null,
    forecast,
  };
}

function describeVerdict(input: {
  kind: VerdictKind;
  intense: boolean;
  confidence: "low" | "normal";
  stage: 0 | 1 | 2 | 3;
  deficit: number;
  surplus: number;
  vegSignal: boolean;
  vegWeak: boolean;
  sceneUsable: boolean;
}): ReportSummary["verdict"] {
  const copy: Record<VerdictKind, { level: FindingLevel; text: string; plain: string }> = {
    "deficit-high": {
      level: "bad",
      text: "Wskaźniki pokazują poważny niedobór wody na działce. Warto od razu zatrzymać wodę, która jeszcze została w glebie i w rowach.",
      plain: "Na Twoim polu jest za sucho. Warto jak najszybciej zatrzymać wodę, która jeszcze została na polu i w rowach.",
    },
    deficit: {
      level: "warn",
      text: "Część wskaźników wskazuje na spadek zasobów wody. Sytuację warto monitorować i przygotować działania retencyjne.",
      plain: "Wody zaczyna brakować. To dobry moment, żeby przygotować pole na suszę.",
    },
    "deficit-watch": {
      level: "warn",
      text: "Wody jest mniej niż zwykle, ale gleba i rośliny nie potwierdzają jeszcze suszy. Obserwuj pole i zacznij zatrzymywać wodę, zanim gleba przeschnie.",
      plain: "Wody jest mniej niż zwykle. Obserwuj glebę i zacznij zatrzymywać wodę, zanim pole przeschnie.",
    },
    "drought-high-water": {
      level: "bad",
      text: "Na polu brakuje wody, a jednocześnie rzeka w okolicy przekroczyła stan ostrzegawczy. Zatrzymuj wodę ostrożnie i obserwuj stan rzeki.",
      plain: "Na polu brakuje wody, ale rzeka w okolicy jest wysoka. Zatrzymuj wodę ostrożnie i patrz na rzekę.",
    },
    flood: {
      level: "warn",
      text: "Wodowskaz w okolicy pokazuje wysoką wodę. Udrożnij odpływ z pola i zabierz z terenów zalewowych to, co woda może zabrać.",
      plain: "W okolicy jest wysoka woda. Uważaj na podtopienia i zabierz z pola rzeczy, które woda może zabrać.",
    },
    wet: {
      level: "info",
      text: "Gleba jest dobrze zasilona, a wody jest więcej niż zwykle. To najlepszy moment, by zatrzymać ją na sezon wegetacyjny.",
      plain: "Ziemia jest dobrze nawodniona. Zatrzymaj tę wodę na polu – przyda się, gdy będzie sucho.",
    },
    stable: {
      level: "good",
      text: "Bilans wody i wilgotność gleby są zbliżone do normy. To dobry moment, by przygotować działkę na okresy suszy.",
      plain: "Z wodą na Twoim polu jest w porządku. Możesz spokojnie przygotować się na suchsze dni.",
    },
  };

  const base = copy[input.kind];
  let title: string = input.intense ? VERDICT_TITLE["wet-intense"] : VERDICT_TITLE[input.kind];
  let text = input.intense
    ? "Wody jest bardzo dużo. Zatrzymaj ją na polu, ale pilnuj odpływu, żeby nadmiar nie zalał upraw."
    : base.text;
  let plain = input.intense
    ? "Wody jest bardzo dużo. Zatrzymaj ją na polu, ale pilnuj, żeby mogła odpłynąć, gdy będzie jej za wiele."
    : base.plain;

  if (input.sceneUsable && (input.vegSignal || input.vegWeak)) {
    const note = input.kind === "deficit" || input.kind === "deficit-high" || input.kind === "drought-high-water"
      ? " Sentinel-2 pokazuje słabszą zieleń roślin i wzmacnia tę ocenę. NDVI nie jest pomiarem wilgotności gleby."
      : " Sentinel-2 pokazuje słabszą zieleń roślin. Sam wskaźnik nie oznacza niedoboru wody — warto sprawdzić fazę uprawy i stan roślin w terenie.";
    text += note;
    plain += note;
  }

  if (input.confidence === "low") {
    title = `${title} ${LOW_CONFIDENCE_SUFFIX}`;
    const note = " Brakuje części pomiarów, więc to ocena wstępna.";
    text += note;
    plain += note;
  }

  return {
    kind: input.kind,
    level: input.intense ? "warn" : base.level,
    title,
    text,
    plain,
    intense: input.intense,
    confidence: input.confidence,
    stage: input.stage,
    deficit: input.deficit,
    surplus: input.surplus,
  };
}

function buildFindings(input: {
  weather: WeatherResult | null;
  hydro: HydroResult | null;
  satellite?: SatelliteResult | null;
  soil: SoilReading;
  texture: SoilTexture | null;
  theta: number | null;
  soilAnomalyZ: number | null;
  change: number | null;
  balanceMm: number | null;
  balanceAnomaly: number | null;
  balanceThresholds: { deficit1: number; deficit2: number; surplus1: number };
  balanceValue: number | null;
  gauge: GaugePick;
  riverUsable: boolean;
  trend: number | null;
  catchment: number | null;
  scene: { usable: boolean; note: string | null };
  ndvi: number | null;
  ndviYoY: number | null;
  historicalNdvi: number | null;
  ndviZ: number | null;
  ndwi: number | null;
  inVegetation: boolean;
  month: number;
  precipDeficit: boolean;
  precipSurplus: boolean;
  spi1: number | null;
  spi3: number | null;
  confidence: "low" | "normal";
  forecastDry: boolean;
  forecastLimit: number;
}): Finding[] {
  const findings: Finding[] = [];
  const weather = input.weather;
  const precipPct = weather?.historicalSummary.differencePercent ?? null;

  if (weather && precipPct != null) {
    const sign = precipPct > 0 ? "+" : "";
    const spiNote = input.spi1 != null || input.spi3 != null
      ? ` SPI-1 ${fmtNum(input.spi1)} , SPI-3 ${fmtNum(input.spi3)}.`
      : "";
    if (input.precipDeficit) {
      findings.push({ level: "warn", title: "Opady poniżej normy", text: `Suma opadów z 30 dni (${fmtNum(weather.indicators.precipitationSumMm)} mm) to ${sign}${precipPct}% względem średniej z ostatnich lat.${spiNote}` });
    } else if (input.precipSurplus) {
      findings.push({ level: "info", title: "Opady powyżej normy", text: `Suma opadów z 30 dni (${fmtNum(weather.indicators.precipitationSumMm)} mm) to ${sign}${precipPct}% względem średniej z ostatnich lat.${spiNote}` });
    } else {
      findings.push({ level: "good", title: "Opady w normie", text: `Suma opadów z 30 dni (${fmtNum(weather.indicators.precipitationSumMm)} mm) jest zbliżona do średniej historycznej (${sign}${precipPct}%).${spiNote}` });
    }
  }

  const drySpell = weather?.indicators.longestDrySpellDays ?? null;
  if (drySpell != null && drySpell >= DRY_SPELL_DAYS) {
    findings.push({ level: "warn", title: "Długi okres bez opadów", text: `W ostatnich 30 dniach wystąpiło ${drySpell} dni z rzędu bez istotnego opadu (< 1 mm). Sam ten fakt nie zmienia etapu suszy.` });
  }

  if (input.hydro && input.balanceValue != null) {
    const anomalyText = input.balanceAnomaly != null
      ? ` Anomalia względem wielolecia: ${signed(input.balanceAnomaly)} mm (progi ${input.balanceThresholds.deficit2} / ${input.balanceThresholds.deficit1} / +${input.balanceThresholds.surplus1} mm).`
      : ` Brak normy wieloletniej, więc liczony jest bilans bezwzględny (progi ${input.balanceThresholds.deficit2} / ${input.balanceThresholds.deficit1} / +${input.balanceThresholds.surplus1} mm).`;
    const absolute = input.balanceMm != null
      ? `Opad ${fmtNum(input.hydro.waterBalance.precipitationMm)} mm − parowanie ${fmtNum(input.hydro.waterBalance.evapotranspirationMm)} mm = ${signed(input.balanceMm)} mm.`
      : "Bilans wodny jest niedostępny w milimetrach bezwzględnych.";
    const level: FindingLevel = input.balanceValue <= input.balanceThresholds.deficit2
      ? "bad"
      : input.balanceValue <= input.balanceThresholds.deficit1
        ? "warn"
        : "good";
    findings.push({ level, title: "Klimatyczny bilans wodny", text: `${absolute}${anomalyText}` });
  }

  if (input.soil.status !== "unknown" && input.theta != null) {
    const changeText = input.change != null ? ` (${input.change > 0 ? "+" : ""}${input.change} p.p. w ciągu 30 dni)` : "";
    const smiText = input.soil.smi != null
      ? ` Wskaźnik wilgotności gleby wynosi ${fmtNum(input.soil.smi, 2)} (0 = więdnięcie, 1 = polowa pojemność) dla uziarnienia: ${TEXTURE_LABEL[input.texture!]}.`
      : ` Progi ${SOIL_FALLBACK.dryBelow}% i ${SOIL_FALLBACK.wetAt}% są orientacyjne, bo nie znamy uziarnienia gleby.`;
    const anomalyText = input.soilAnomalyZ != null ? ` Anomalia wilgotności: ${fmtNum(input.soilAnomalyZ, 1)} odchylenia standardowego.` : "";
    findings.push({
      level: input.soil.status === "dry" ? "bad" : input.soil.status === "wet" ? "info" : "good",
      title: "Wilgotność gleby",
      text: `Strefa korzeniowa (9–27 cm): ${input.theta}% obj.${changeText}. Gleba: ${soilWord(input.soil.status)}.${smiText}${anomalyText}`,
    });
  }

  if (input.gauge.level !== "none" && input.gauge.station) {
    const station = input.gauge.station;
    const alarm = station.status === "alarm";
    const threshold = alarm ? station.alarmLevelCm : station.warningLevelCm;
    const distanceNote = input.gauge.distant
      ? ` Stacja jest dalej niż ${GAUGE.maxDistanceKm} km, więc ten sygnał jest mniej pewny i nie dodaje punktów nadwyżki.`
      : "";
    findings.push({
      level: alarm ? "bad" : "warn",
      title: alarm ? "Stan alarmowy na wodowskazie" : "Stan ostrzegawczy na wodowskazie",
      text: `${stationLabel(station)} pokazuje ${station.waterLevelCm} cm${threshold != null ? ` przy stanie ${alarm ? "alarmowym" : "ostrzegawczym"} ${threshold} cm` : ""}.${distanceNote}`,
    });
  }

  if (input.trend != null) {
    const usableText = input.riverUsable
      ? (input.hydro?.river?.assessment || `Trend przepływu ${signed(input.trend)}%.`)
      : `Trend przepływu ${signed(input.trend)}%. Zlewnia ma ${input.catchment} km², poniżej progu ${RIVER.minCatchmentKm2} km² dla GloFAS, więc trend nie zmienia oceny.`;
    findings.push({
      level: !input.riverUsable ? "info" : input.trend <= RIVER.deficit ? "warn" : "info",
      title: "Przepływ w zlewni",
      text: usableText,
    });
  }

  const forecast = input.hydro?.forecast;
  if (forecast && forecast.balanceMm != null) {
    findings.push({
      level: input.forecastDry ? "warn" : "info",
      title: `Prognoza na ${forecast.days} dni`,
      text: `Spodziewany opad ${fmtNum(forecast.precipitationMm)} mm przy parowaniu ${fmtNum(forecast.evapotranspirationMm)} mm (bilans ${signed(forecast.balanceMm)} mm). Próg suchej prognozy w tym sezonie to ${input.forecastLimit} mm.`,
    });
  }

  if (input.satellite === null) {
    findings.push({ level: "info", title: "Brak wskaźnika satelitarnego", text: "Nie udało się pobrać NDVI z Sentinel-2. Raport nie podaje pozornej wartości roślinności." });
  } else if (input.satellite && (input.satellite.status === "unavailable" || input.satellite.ndvi == null)) {
    findings.push({ level: "info", title: "Brak jakościowego NDVI", text: input.satellite.interpretation });
  } else if (input.satellite && input.ndvi != null) {
    if (!input.scene.usable && input.scene.note) {
      findings.push({ level: "info", title: "Jakość sceny Sentinel-2", text: input.scene.note });
    } else {
      const band = input.ndvi >= VEG.ndviGood ? "dobra kondycja" : input.ndvi >= VEG.ndviWeak ? "umiarkowana kondycja" : "słaba kondycja";
      findings.push({
        level: input.ndvi < VEG.ndviWeak ? "warn" : input.ndvi >= VEG.ndviGood ? "good" : "info",
        title: "Zieleń roślin (NDVI)",
        text: `NDVI ${fmtNum(input.ndvi, 2)} z ${input.satellite.date ?? "ostatniej sceny"} – ${band} według progów podręcznika PAK. NDVI nie mierzy wilgotności gleby.`,
      });
      if (input.ndviZ != null) {
        findings.push({
          level: input.ndviZ <= VEG.ndviAnomalyZ ? "warn" : "good",
          title: "Anomalia NDVI",
          text: `Względem wielolecia tej działki NDVI odchyla się o ${fmtNum(input.ndviZ, 1)} odchylenia standardowego.`,
        });
      } else if (input.ndviYoY != null && input.historicalNdvi != null) {
        const signedDiff = `${input.ndviYoY > 0 ? "+" : ""}${fmtNum(input.ndviYoY, 2)}`;
        findings.push({
          level: input.ndviYoY <= VEG.ndviYoYDrop ? "warn" : "good",
          title: "NDVI rok do roku",
          text: `NDVI rok temu ${fmtNum(input.historicalNdvi, 2)}, teraz ${fmtNum(input.ndvi, 2)} (różnica ${signedDiff}). Jeśli rok temu rosła tu inna uprawa, porównanie może mylić.`,
        });
      }
      if (input.ndwi != null) {
        findings.push({
          level: input.ndwi < VEG.physioNdwi ? "warn" : "info",
          title: "Woda w roślinach (NDWI)",
          text: `NDWI ${fmtNum(input.ndwi, 2)}. Poniżej ${fmtNum(VEG.physioNdwi, 1)} przy NDVI poniżej ${fmtNum(VEG.physioNdvi, 1)} oznacza suszę fizjologiczną.`,
        });
      }
    }
  }

  if (input.confidence === "low") {
    findings.push({ level: "info", title: "Niepełne dane", text: "Brakuje danych hydrologicznych albo wilgotności gleby. Werdykt jest wstępny, a porady poza zagrożeniem powodziowym mają niższą pilność." });
  }

  return findings;
}

function identifyCauses(findings: Finding[], confidence: "low" | "normal", texture: SoilTexture | null, balanceDeficit: boolean): Cause[] {
  const causeRules: Array<{ source: string; title: string; matches: (finding: Finding) => boolean }> = [
    { source: "Opady poniżej normy", title: "Deficyt opadów", matches: (f) => f.title === "Opady poniżej normy" },
    { source: "Klimatyczny bilans wodny", title: "Niekorzystny bilans opadów i parowania", matches: (f) => f.title === "Klimatyczny bilans wodny" && balanceDeficit },
    { source: "Wilgotność gleby", title: "Mały zapas wody w strefie korzeniowej", matches: (f) => f.title === "Wilgotność gleby" && f.level === "bad" },
    { source: "Przepływ w zlewni", title: "Niski przepływ w zlewni", matches: (f) => f.title === "Przepływ w zlewni" && f.level === "warn" },
    { source: "Długi okres bez opadów", title: "Długi okres bez opadów", matches: (f) => f.title === "Długi okres bez opadów" },
  ];
  const causes = causeRules.flatMap((rule) => {
    const evidence = findings.find(rule.matches);
    return evidence ? [{ title: rule.title, evidence: evidence.text, source: rule.source, certainty: "sygnał" as const }] : [];
  });
  if (texture && (SANDY_TEXTURES as readonly SoilTexture[]).includes(texture)) {
    causes.push({
      title: "Gleba o małej pojemności wodnej",
      evidence: `Uziarnienie gleby (${TEXTURE_LABEL[texture]}) wskazuje na podatność na szybkie przesychanie; to cecha gleby, nie pomiar jej obecnego nawodnienia.`,
      source: "Uziarnienie gleby",
      certainty: "sygnał",
    });
  }
  if (confidence === "low") {
    causes.push({
      title: "Niepełne dane lokalne",
      evidence: "Brakuje danych hydrologicznych albo pomiaru wilgotności gleby; wskazane przyczyny są wstępne.",
      source: "Niepełne dane",
      certainty: "brak danych",
    });
  }
  return causes;
}

function includesMonth(months: readonly number[], month: number) {
  return months.includes(month);
}

function daysBetween(isoDate: string, report: Date) {
  const scene = new Date(`${isoDate}T12:00:00`);
  const noon = new Date(report.getFullYear(), report.getMonth(), report.getDate(), 12);
  return Math.round((noon.getTime() - scene.getTime()) / 86_400_000);
}

function formatDayMonth(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function fmtNum(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits).replace(".", ",");
}

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function soilWord(status: SoilStatus) {
  if (status === "dry") return "sucha";
  if (status === "wet") return "mokra";
  if (status === "moderate") return "umiarkowana";
  return "brak danych";
}

function stationLabel(station: HydroStation) {
  const name = station.name.replace(/^wodowskaz\s+/i, "");
  return `Stacja ${name}${station.river ? ` na rzece ${station.river}` : ""}`;
}

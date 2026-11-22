import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HydroResult, HydroStation, SatelliteResult, SoilTexture, WeatherResult } from "../app/types.ts";
import {
  ADVICE_LIMIT,
  BALANCE,
  BALANCE_FALLBACK,
  CROPS,
  DRY_SPELL_DAYS,
  FORECAST,
  GAUGE,
  LEGAL,
  NORTH,
  PRECIP,
  PRIORITY,
  RIVER,
  SCENE,
  SEASON,
  SOIL_ANOMALY_Z,
  SOIL_DROP_PP,
  SOIL_FALLBACK,
  SOIL_SMI,
  SOIL_WATER,
  SPI,
  VEG,
  VERDICT_TITLE,
} from "../app/raport/advice-config.ts";
import { buildSummary, type ReportSummary } from "../app/raport/findings.ts";
import { collectAdvice, selectAdvice, timingLabel, type Advice } from "../app/raport/advice.ts";

type WeatherInput = { diff: number | null; drySpell: number | null; spi1?: number | null; spi3?: number | null; winterPrecipAnomalyPct?: number | null };
type HydroInput = {
  balance: number | null;
  anomaly: number | null;
  soil: HydroResult["soil"]["status"];
  rootZone: number | null;
  change: number | null;
  station: "none" | "warning" | "alarm";
  riverTrend: number | null;
  catchmentKm2: number | null;
  forecast: number | null;
  texture: SoilTexture | null;
  distanceKm: number;
};
type SatelliteInput = {
  ndvi: number;
  diff: number | null;
  ndwi?: number | null;
  sceneAgeDays?: number;
  clearPct?: number;
  ndviNormal?: number | null;
  ndviSd?: number | null;
} | "unavailable";
type Variant = { label: string; texture?: SoilTexture | null; isWinterCrop?: boolean };
type Scenario = {
  id: string;
  name: string;
  goal: string;
  month: number;
  day?: number;
  crop: string;
  isWinterCrop?: boolean;
  latitude?: number;
  weather?: Partial<WeatherInput> | null;
  hydro?: Partial<HydroInput> | null;
  satellite?: SatelliteInput;
  variants?: Variant[];
};

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const CROP_LABEL: Record<string, string> = { zboza: "zboża", rzepak: "rzepak", ziemniaki: "ziemniaki", buraki: "buraki", kukorydza: "kukurydza", owoce: "owoce i sad", warzywa: "warzywa", inna: "inna uprawa" };
const ADVICE_COLUMNS = ["flood", "gates-close", "gates-spring", "gates-hold", "irrigation", "tillage", "forecast-dry", "heavy-machinery", "field-check", "crop", "cover-crop", "dry-spell-watch", "gates-ready", "humus"];

const DEFAULT_WEATHER: WeatherInput = { diff: 0, drySpell: 4, spi1: null, spi3: null, winterPrecipAnomalyPct: null };
const DEFAULT_HYDRO: HydroInput = { balance: 0, anomaly: 0, soil: "moderate", rootZone: 22, change: 0, station: "none", riverTrend: null, catchmentKm2: null, forecast: 0, texture: null, distanceKm: 8 };

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function makeWeather(input: WeatherInput, date: Date): WeatherResult {
  return {
    date: iso(date),
    coverage: { start: iso(shiftDays(date, -30)), end: iso(date), daysRequested: 30, daysAvailable: 30 },
    indicators: {
      precipitationSumMm: 45,
      averageTemperatureC: 18,
      maximumTemperatureC: 27,
      longestDrySpellDays: input.drySpell,
      precipitationShortfallMm: null,
      spi1: input.spi1 ?? null,
      spi3: input.spi3 ?? null,
    },
    series: [],
    historicalSummary: { status: input.diff === null ? "unavailable" : "available", averagePrecipitationMm: 45, differencePercent: input.diff, assessment: "" },
    winterPrecipAnomalyPct: input.winterPrecipAnomalyPct ?? null,
    source: { provider: "scenariusz testowy" },
    limitations: [],
  };
}

function makeStation(input: HydroInput): HydroStation[] {
  if (input.station === "none") {
    return [{ id: "1", name: "Wodowskaz Warszawa", river: "Wisła", distanceKm: input.distanceKm, waterLevelCm: 380, warningLevelCm: 520, alarmLevelCm: 600, flowM3s: null, measuredAt: null, status: "normal" }];
  }
  return [{
    id: "1",
    name: "Wodowskaz Warszawa",
    river: "Wisła",
    distanceKm: input.distanceKm,
    waterLevelCm: input.station === "alarm" ? 620 : 540,
    warningLevelCm: 520,
    alarmLevelCm: 600,
    flowM3s: null,
    measuredAt: null,
    status: input.station,
  }];
}

function makeHydro(input: HydroInput, date: Date, latitude: number): HydroResult {
  const balancePrecip = input.balance === null ? null : Math.max(0, 50 + input.balance);
  const forecastPrecip = input.forecast === null ? null : Math.max(0, 15 + input.forecast);
  return {
    location: { latitude, longitude: 20 },
    fetchedAt: `${iso(date)}T12:00:00`,
    elevationM: 100,
    soil: {
      surfacePct: input.rootZone,
      rootZonePct: input.rootZone,
      deepPct: input.rootZone,
      rootZoneChangePp: input.change,
      status: input.soil,
      assessment: "",
      texture: input.texture,
      normalPct: null,
      sdPct: null,
    },
    waterBalance: {
      precipitationMm: balancePrecip,
      evapotranspirationMm: balancePrecip === null || input.balance === null ? null : balancePrecip - input.balance,
      balanceMm: input.balance,
      assessment: "",
      normal30Mm: null,
      anomalyMm: input.anomaly,
    },
    forecast: {
      days: 7,
      precipitationMm: forecastPrecip,
      evapotranspirationMm: forecastPrecip === null || input.forecast === null ? null : forecastPrecip - input.forecast,
      balanceMm: input.forecast,
    },
    daily: [],
    river: input.riverTrend === null ? null : {
      dischargeM3s: 100,
      mean30dM3s: 100,
      forecastMaxM3s: 100,
      trendPercent: input.riverTrend,
      assessment: `Trend przepływu ${input.riverTrend}%.`,
      catchmentKm2: input.catchmentKm2,
    },
    stations: makeStation(input),
    sources: [],
    limitations: [],
  };
}

function makeSatellite(input: SatelliteInput | undefined, date: Date): SatelliteResult | undefined {
  if (input === undefined) return undefined;
  const sceneDate = iso(shiftDays(date, -(input === "unavailable" ? 5 : input.sceneAgeDays ?? 5)));
  const base = {
    provider: "Earth Search" as const,
    satellite: "Sentinel-2" as const,
    level: "L2A" as const,
    currentImageUrl: null,
    historicalImageUrl: null,
    date: sceneDate,
    cloudCoverPercent: 5,
    resolutionMeters: 10,
    validPixelPercent: input === "unavailable" ? null : input.clearPct ?? 95,
    crop: "test",
    limitations: [] as string[],
    ndviNormal: null,
    ndviSd: null,
    ndwi: null,
  };
  if (input === "unavailable") {
    return { ...base, status: "unavailable", ndvi: null, historicalNdvi: null, ndviDifference: null, interpretation: "Brak jakościowej sceny Sentinel-2." };
  }
  return {
    ...base,
    status: "available",
    ndvi: input.ndvi,
    historicalNdvi: input.diff === null ? null : Math.round((input.ndvi - input.diff) * 100) / 100,
    ndviDifference: input.diff,
    ndviNormal: input.ndviNormal ?? null,
    ndviSd: input.ndviSd ?? null,
    ndwi: input.ndwi ?? null,
    interpretation: "",
  };
}

const SCENARIOS: Scenario[] = [
  { id: "S01", name: "Sytuacja stabilna latem", goal: "Lipiec w normie. Zostają porady ogólne.", month: 6, crop: "zboza", hydro: { anomaly: 0 }, satellite: { ndvi: 0.7, diff: 0.02 } },
  { id: "S02", name: "Sytuacja stabilna jesienią", goal: "Listopad w normie – dochodzi okrywa roślinna.", month: 10, crop: "zboza", hydro: { anomaly: 0 }, satellite: "unavailable" },
  { id: "S03", name: "Sytuacja stabilna w marcu", goal: "Marzec bez deficytu – porada o zamknięciu zastawek po roztopach.", month: 2, crop: "zboza", hydro: { anomaly: 0 } },
  { id: "S04", name: "Silna susza w lipcu", goal: "Wszystkie sygnały suszy naraz, ziemniaki w oknie nawadniania. Porada uprawy zostaje w limicie.", month: 6, crop: "ziemniaki", weather: { diff: -45, drySpell: 16 }, hydro: { balance: -48, anomaly: -45, soil: "dry", rootZone: 12, change: -5, forecast: -18 }, satellite: { ndvi: 0.25, diff: -0.12 } },
  { id: "S05", name: "Obserwacja niedoboru w maju", goal: "Sam sygnał meteorologiczny – werdykt obserwacji, nie niedoboru. Rzepak bez nawadniania.", month: 4, crop: "rzepak", weather: { diff: -25 }, hydro: { balance: -10, anomaly: -15 } },
  { id: "S06", name: "Obserwacja niedoboru w styczniu", goal: "Sad zimą: zastawki, ściółka pod drzewami i okrywa, bez nawadniania.", month: 0, crop: "owoce", weather: { diff: -30 }, hydro: { balance: -12, anomaly: -15 } },
  { id: "S07", name: "Krótka susza w sierpniu", goal: "Same dni bez deszczu nie zmieniają werdyktu. Jest obserwacja gleby i międzyplon.", month: 7, crop: "kukorydza", weather: { drySpell: 12 }, hydro: { anomaly: 0 } },
  { id: "S08", name: "Sucha prognoza przy normalnym stanie", goal: "Prognoza −10 mm w czerwcu nie schodzi poniżej progu sezonu.", month: 5, crop: "zboza", hydro: { anomaly: 0, forecast: -10 } },
  { id: "S09", name: "Mokro jesienią, ozimina", goal: "Nadwyżka wody w październiku na zbożu ozimym – wariant zastawek dla ozimin.", month: 9, crop: "zboza", isWinterCrop: true, weather: { diff: 35 }, hydro: { balance: 24, anomaly: 30, soil: "wet", rootZone: 34, forecast: 3 } },
  { id: "S10", name: "Stan alarmowy na rzece", goal: "Alarm wygrywa z nadwyżką. W tekście jest próg alarmowy, bez podwójnego „Wodowskaz”.", month: 3, crop: "kukorydza", weather: { diff: 40 }, hydro: { balance: 40, anomaly: 45, soil: "wet", rootZone: 38, station: "alarm", forecast: 12 } },
  { id: "S11", name: "Duży nadmiar wody bez alarmu", goal: "Nadwyżka 4 pkt bez wodowskazu to mokro (intense), nie powódź. Luty: zastawki po roztopach.", month: 1, crop: "buraki", weather: { diff: 50 }, hydro: { balance: 30, anomaly: 35, soil: "wet", rootZone: 36, riverTrend: 40, catchmentKm2: 5000 } },
  { id: "S12", name: "Susza i stan ostrzegawczy", goal: "Ostrzeżenie przy etapie 2 daje suszę na polu i wysoką wodę. Zbóż się nie nawadnia.", month: 7, crop: "zboza", weather: { diff: -35, drySpell: 14 }, hydro: { balance: -35, anomaly: -40, soil: "dry", rootZone: 13, station: "warning", forecast: -8 } },
  { id: "S13", name: "Dni bez deszczu i mokra gleba", goal: "Remis nie daje niedoboru. Mokra gleba blokuje nawadnianie warzyw.", month: 5, crop: "warzywa", weather: { drySpell: 11 }, hydro: { anomaly: 0, soil: "wet", rootZone: 32 } },
  { id: "S14", name: "Słabe NDVI przy normalnej wodzie", goal: "NDVI 0,25 w czerwcu daje obejrzenie pola, bez punktów suszy.", month: 5, crop: "zboza", hydro: { anomaly: 0 }, satellite: { ndvi: 0.25, diff: 0 } },
  { id: "S15", name: "Spadek NDVI wzmacnia niedobór", goal: "Anomalia bilansu i spadek rok do roku. Uzasadnienie wspomina płodozmian.", month: 6, crop: "zboza", hydro: { balance: -10, anomaly: -15 }, satellite: { ndvi: 0.45, diff: -0.15 } },
  { id: "S16", name: "Słabe NDVI w listopadzie", goal: "Poza sezonem wegetacyjnym nie ma porady o oględzinach roślin.", month: 10, crop: "zboza", hydro: { anomaly: 0 }, satellite: { ndvi: 0.2, diff: -0.1 } },
  { id: "S17", name: "Obserwacja dla innej uprawy", goal: "Sam sygnał meteo to obserwacja, a uprawa bez własnej ściółki dostaje poradę ogólną.", month: 5, crop: "inna", weather: { diff: -30 }, hydro: { balance: -15, anomaly: -20 } },
  { id: "S18", name: "Brak danych hydrologicznych", goal: "Sama meteorologia obniża pewność. Termin porad schodzi z „teraz” na ten tydzień.", month: 4, crop: "zboza", weather: { diff: -25, drySpell: 5 }, hydro: null },
  { id: "S19", name: "Gleba szybko przesycha, buraki przed oknem", goal: "15 czerwca jest przed oknem nawadniania buraków. Nie ma jeszcze „zostaw resztki”.", month: 5, day: 15, crop: "buraki", hydro: { balance: -8, anomaly: -15, rootZone: 16, change: -4 } },
  { id: "S20", name: "Wartości tuż powyżej progów", goal: "Anomalia −14 mm, opady −19% i 9 dni bez deszczu nie włączają sygnału.", month: 6, crop: "zboza", weather: { diff: -19, drySpell: 9 }, hydro: { balance: -5, anomaly: -14, forecast: -5 } },
  { id: "S21", name: "Wartości dokładnie na progach", goal: "Progi dają 4 pkt deficytu, ale bez gleby i roślin zostaje obserwacja. Zbóż się nie nawadnia.", month: 6, crop: "zboza", weather: { diff: -20, drySpell: 10 }, hydro: { balance: -30, anomaly: -40 } },
  { id: "S22", name: "Mokro po roztopach", goal: "Marzec, nadwyżka i mokra gleba. Najpierw zastawki po roztopach, bez powodzi i bez zatrzymywania nadwyżki.", month: 2, crop: "zboza", weather: { diff: 25 }, hydro: { anomaly: 25, soil: "wet", rootZone: 33 } },
  { id: "S23", name: "Przeciętny lipiec", goal: "Bilans −35 mm przy normie −30 mm (anomalia −5) nie daje punktów.", month: 6, crop: "zboza", weather: { diff: 0 }, hydro: { balance: -35, anomaly: -5, rootZone: 22 } },
  { id: "S24", name: "Susza po żniwach", goal: "Sierpień, zboża, sucha gleba. Brak nawadniania, resztki pożniwne, uprawa uproszczona i międzyplon.", month: 7, crop: "zboza", weather: { diff: -30, drySpell: 14 }, hydro: { anomaly: -30, soil: "dry", rootZone: 12 } },
  { id: "S25", name: "Susza w kukurydzy", goal: "Nawadnianie z dopiskiem prawnym i o wietrze. Prognoza dokleja się do nawadniania. Porada przed zbiorem zostaje w piątce.", month: 6, crop: "kukorydza", weather: { diff: -30, drySpell: 12 }, hydro: { anomaly: -30, soil: "dry", rootZone: 12, forecast: -20 } },
  { id: "S26", name: "Mokra jesień, ozimina", goal: "Październik i ozimina: zatrzymanie wody z zastrzeżeniem, żeby nie stała przy korzeniach. Kontrola bez oziminy ma tekst standardowy.", month: 9, crop: "zboza", isWinterCrop: true, weather: { diff: 30 }, hydro: { anomaly: 25, soil: "wet", rootZone: 34 }, variants: [{ label: "kontrola bez oziminy", isWinterCrop: false }] },
  { id: "S27", name: "Alarm i susza na ziemniakach", goal: "Alarm zawsze daje powódź. Nie ma zamykania zastawek. Nawadnianie zostaje, ale na ten tydzień.", month: 6, crop: "ziemniaki", weather: { diff: -40 }, hydro: { anomaly: -45, soil: "dry", rootZone: 12, station: "alarm" } },
  { id: "S28", name: "Te same 22%, różne gleby", goal: "Piasek przy 22% jest mokry, ił suchy. Bez tekstury zostają progi orientacyjne.", month: 5, crop: "zboza", hydro: { anomaly: 0, rootZone: 22, texture: "sand" }, variants: [{ label: "B: ił", texture: "clay" }, { label: "bez tekstury", texture: null }] },
  { id: "S29", name: "Susza fizjologiczna", goal: "NDWI 0,25 przy NDVI 0,45 podnosi etap do ostrzeżenia. Zbóż się nie nawadnia.", month: 6, crop: "zboza", hydro: { anomaly: -20, rootZone: 22 }, satellite: { ndvi: 0.45, diff: null, ndwi: 0.25, sceneAgeDays: 3, clearPct: 90 } },
  { id: "S30", name: "Mała rzeka i stara scena", goal: "Zlewnia 300 km² i scena sprzed 14 dni nie dają punktów. W raporcie jest informacja o braku aktualnej sceny.", month: 5, crop: "warzywa", hydro: { anomaly: 0, riverTrend: -30, catchmentKm2: 300 }, satellite: { ndvi: 0.2, diff: -0.2, sceneAgeDays: 14, clearPct: 90 } },
];

type Run = {
  label: string | null;
  weatherInput: WeatherInput | null;
  hydroInput: HydroInput | null;
  summary: ReportSummary;
  shown: Advice[];
  cut: Advice[];
  all: Advice[];
};

function scenarioDate(scenario: Scenario) {
  return new Date(2026, scenario.month, scenario.day ?? 15, 12, 0, 0);
}

function runScenario(scenario: Scenario, variant?: Variant): Run {
  const date = scenarioDate(scenario);
  const latitude = scenario.latitude ?? 52;
  const weatherInput = scenario.weather === null ? null : { ...DEFAULT_WEATHER, ...scenario.weather };
  const hydroInput = scenario.hydro === null ? null : { ...DEFAULT_HYDRO, ...scenario.hydro };
  if (hydroInput && variant && "texture" in variant) hydroInput.texture = variant.texture ?? null;
  const isWinterCrop = variant && "isWinterCrop" in variant ? variant.isWinterCrop : scenario.isWinterCrop;
  const weather = weatherInput ? makeWeather(weatherInput, date) : null;
  const hydro = hydroInput ? makeHydro(hydroInput, date, latitude) : null;
  const satellite = makeSatellite(scenario.satellite, date);
  const summary = buildSummary(weather, hydro, satellite, { date, crop: scenario.crop, latitude, isWinterCrop });
  const all = collectAdvice({ weather, hydro, satellite, crop: scenario.crop, month: scenario.month, date, latitude, isWinterCrop });
  const picked = selectAdvice(all);
  return { label: variant?.label ?? null, weatherInput, hydroInput, summary, shown: picked.shown, cut: picked.cut, all };
}

const results = SCENARIOS.map((scenario) => ({
  scenario,
  primary: runScenario(scenario),
  variants: (scenario.variants ?? []).map((variant) => runScenario(scenario, variant)),
}));

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function describeInputs(scenario: Scenario, weather: WeatherInput | null, hydro: HydroInput | null) {
  const rows: Array<[string, string]> = [
    ["Data", iso(scenarioDate(scenario))],
    ["Uprawa", CROP_LABEL[scenario.crop] ?? scenario.crop],
    ["Oziminy", scenario.isWinterCrop === false ? "nie" : scenario.crop === "zboza" || scenario.crop === "rzepak" ? "tak (domyślnie)" : "nie"],
    ["Opady 30 dni vs norma", weather ? (weather.diff === null ? "brak danych" : `${signed(weather.diff)}%`) : "brak danych meteo"],
    ["SPI-1 / SPI-3", "brak (fallback procentowy)"],
    ["Najdłużej bez deszczu", weather?.drySpell != null ? `${weather.drySpell} dni` : "brak danych"],
  ];
  if (hydro) {
    rows.push(
      ["Bilans wodny 30 dni", hydro.balance === null ? "brak danych" : `${signed(hydro.balance)} mm`],
      ["Anomalia bilansu", hydro.anomaly === null ? "brak normy" : `${signed(hydro.anomaly)} mm`],
      ["Gleba", `${hydro.rootZone ?? "—"}%${hydro.texture ? `, ${hydro.texture}` : ", bez tekstury"}${hydro.change ? `, zmiana ${signed(hydro.change)} p.p.` : ""}`],
      ["Wodowskaz", hydro.station === "none" ? "stan normalny" : hydro.station === "alarm" ? "STAN ALARMOWY" : "stan ostrzegawczy"],
      ["Trend rzeki", hydro.riverTrend === null ? "brak danych" : `${signed(hydro.riverTrend)}%${hydro.catchmentKm2 != null ? `, zlewnia ${hydro.catchmentKm2} km²` : ""}`],
      ["Prognoza 7 dni", hydro.forecast === null ? "brak danych" : `${signed(hydro.forecast)} mm`],
    );
  } else rows.push(["Dane hydrologiczne", "brak (null)"]);
  const sat = scenario.satellite;
  rows.push(["Satelita", sat === undefined ? "nie pobrano" : sat === "unavailable" ? "brak jakościowej sceny" : `NDVI ${sat.ndvi.toFixed(2)}${sat.diff != null ? `, rok do roku ${signed(sat.diff)}` : ""}${sat.ndwi != null ? `, NDWI ${sat.ndwi.toFixed(2)}` : ""}${sat.sceneAgeDays != null ? `, scena ${sat.sceneAgeDays} dni` : ""}`]);
  return rows;
}

function verdictCell(summary: ReportSummary) {
  const intense = summary.verdict.intense ? " (intense)" : "";
  return `\`${summary.verdict.kind}\`${intense}`;
}

const lines: string[] = [];
const push = (...values: string[]) => lines.push(...values);
const soilLine = (texture: SoilTexture) => {
  const row = SOIL_WATER[texture];
  return `| \`${texture}\` | ${row.ptw} | ${row.ppw} |`;
};

push(
  "# Rekomendacje Ziemowita – zestaw do weryfikacji",
  "",
  "> Plik generowany automatycznie przez `apps/web/scripts/advice-matrix.mts` (uruchom: `npm run advice:matrix` w `apps/web`).",
  "> Wyniki scenariuszy pochodzą z prawdziwych funkcji `buildSummary` i `collectAdvice`. Progi w sekcji „1. Reguły” są wstawione z `apps/web/app/raport/advice-config.ts`.",
  "",
  "Dokument ma trzy części:",
  "",
  "1. **Reguły** – kiedy włącza się każda porada i każda ocena ogólna.",
  "2. **Macierz scenariuszy** – które porady pojawiają się w 30 sytuacjach testowych.",
  "3. **Karty scenariuszy** – pełne dane wejściowe, wynik i miejsce na ocenę eksperta.",
  "",
  "## 1. Reguły",
  "",
  "### 1.1. Skąd biorą się statusy wejściowe",
  "",
  "| Wskaźnik | Źródło | Jak jest liczony |",
  "| --- | --- | --- |",
  "| Opady vs norma | Open-Meteo | Suma opadów z 30 dni względem średniej z tych samych dni w poprzednich latach, w %. |",
  "| SPI-1 / SPI-3 | archiwum opadów, gdy jest | SPI-3 < " + SPI.spi3Deficit + " albo SPI-1 < " + SPI.spi1Deficit + " zastępuje próg procentowy. |",
  "| Dni bez deszczu | Open-Meteo | Najdłuższa seria dni z opadem < 1 mm. Próg: " + DRY_SPELL_DAYS + " dni. Nie otwiera etapu suszy. |",
  "| Anomalia bilansu | opad − ET0 minus norma | Progi " + BALANCE.deficit2 + " / " + BALANCE.deficit1 + " / +" + BALANCE.surplus1 + " mm. Bez normy: sezon wegetacyjny " + BALANCE_FALLBACK.vegetation.deficit2 + " / " + BALANCE_FALLBACK.vegetation.deficit1 + " / +" + BALANCE_FALLBACK.vegetation.surplus1 + ", poza nim " + BALANCE_FALLBACK.other.deficit2 + " / " + BALANCE_FALLBACK.other.deficit1 + " / +" + BALANCE_FALLBACK.other.surplus1 + ". |",
  "| Gleba | Open-Meteo 9–27 cm i opcjonalnie uziarnienie | Bez tekstury: < " + SOIL_FALLBACK.dryBelow + "% sucha, ≥ " + SOIL_FALLBACK.wetAt + "% mokra. Z teksturą: wskaźnik 0–1, sucha poniżej " + SOIL_SMI.dryBelow + ", mokra od " + SOIL_SMI.wetAt + ". |",
  "| Wodowskaz | IMGW | Liczy się stacja w stanie ostrzegawczym lub alarmowym do " + GAUGE.maxDistanceKm + " km. Dalsza jest tylko wskazówką o niższej pewności. |",
  "| Trend rzeki | GloFAS | Progi " + RIVER.deficit + "% / +" + RIVER.surplus + "%. Poniżej " + RIVER.minCatchmentKm2 + " km² zlewni trend nie daje punktów. |",
  "| Prognoza | Open-Meteo, 7 dni | Sucha, gdy opad − ET0 ≤ " + FORECAST.vegetation + " mm w sezonie wegetacyjnym i ≤ " + FORECAST.other + " mm poza nim. |",
  "| NDVI / NDWI | Sentinel-2 L2A | Scena do " + SCENE.maxAgeDays + " dni i co najmniej " + SCENE.minClearPct + "% czystych pikseli. Słabe NDVI < " + VEG.ndviWeak + " w miesiącach " + VEG.ndviWeakMonths.join(", ") + ". |",
  "",
  "### 1.2. Punkty i etap suszy",
  "",
  "Etap rośnie jak w CDI: sam sygnał meteorologiczny to obserwacja, gleba albo gleba z roślinami podnosi ostrzeżenie, gleba i rośliny razem dają alarm suszy na polu. Same dni bez deszczu dodają punkt, ale nie otwierają etapu.",
  "",
  "| Warunek | Deficyt | Nadwyżka | Sygnał |",
  "| --- | --- | --- | --- |",
  `| SPI albo opady ≤ ${PRECIP.deficitPct}% | +1 | | meteo |`,
  `| SPI-1 > ${SPI.spi1Surplus} albo opady ≥ +${PRECIP.surplusPct}% | | +1 | |`,
  `| Anomalia bilansu ≤ ${BALANCE.deficit2} mm | +2 | | meteo |`,
  `| Anomalia bilansu w (${BALANCE.deficit2}; ${BALANCE.deficit1}] mm | +1 | | meteo |`,
  `| Anomalia bilansu ≥ +${BALANCE.surplus1} mm | | +1 | |`,
  `| ≥ ${DRY_SPELL_DAYS} dni bez deszczu | +1 | | brak |`,
  `| Trend rzeki ≤ ${RIVER.deficit}% i zlewnia się liczy | +1 | | meteo |`,
  `| Trend rzeki ≥ +${RIVER.surplus}% i zlewnia się liczy | | +1 | |`,
  `| Wodowskaz ostrzegawczy lub alarmowy w promieniu ${GAUGE.maxDistanceKm} km | | +2 | |`,
  "| Gleba sucha | +2 | | gleba |",
  "| Gleba mokra | | +1 | |",
  `| Spadek wilgotności ≤ ${SOIL_DROP_PP} p.p. (gleba nie mokra) | +1 | | gleba |`,
  `| Anomalia wilgotności ≤ ${SOIL_ANOMALY_Z} | +1 | | gleba |`,
  `| Anomalia roślin, sezon wegetacyjny, scena użyteczna | +1 | | rośliny |`,
  "",
  "Werdykt (pierwszy pasujący wygrywa):",
  "",
  "| Werdykt | Warunek | Tytuł |",
  "| --- | --- | --- |",
  `| \`flood\` | stan alarmowy, albo ostrzegawczy przy etapie 0–1 | ${VERDICT_TITLE.flood} |`,
  `| \`drought-high-water\` | stan ostrzegawczy i etap ≥ 2 | ${VERDICT_TITLE["drought-high-water"]} |`,
  `| \`deficit-high\` | etap 3, albo etap 2 i deficyt ≥ 3 | ${VERDICT_TITLE["deficit-high"]} |`,
  `| \`deficit\` | etap 2 i deficyt większy od nadwyżki | ${VERDICT_TITLE.deficit} |`,
  `| \`deficit-watch\` | etap 1 i deficyt większy od nadwyżki | ${VERDICT_TITLE["deficit-watch"]} |`,
  `| \`wet\` | nadwyżka ≥ 2; przy ≥ 4 dopisek intense | ${VERDICT_TITLE.wet} / ${VERDICT_TITLE["wet-intense"]} |`,
  `| \`stable\` | reszta | ${VERDICT_TITLE.stable} |`,
  "",
  `Sezon wegetacyjny: miesiące ${SEASON.vegetation.join(", ")}. Wiosna (roztopy): ${SEASON.spring.join(", ")}. Okno ustawowe suszy rolniczej: ${SEASON.droughtWindow.from}–${SEASON.droughtWindow.to}. Brak hydrologii albo wilgotności gleby obniża pewność. Brak tekstury, SPI, norm i NDVI pewności nie obniża.`,
  "",
  "Uziarnienie (orientacyjne PTW / PPW, % obj.):",
  "",
  "| Tekstura | PTW | PPW |",
  "| --- | --- | --- |",
  ...(Object.keys(SOIL_WATER) as SoilTexture[]).map(soilLine),
  "",
  `Nawadnianie przy wskaźniku gleby poniżej ${SOIL_SMI.irrigateBelow}. Dla szerokości ≥ ${NORTH.latitude}° start okna z kwietnia i do 5 maja przesuwa się o ${NORTH.aprilOrEarlyMayDays} dni, a z 2.–3. dekady maja o ${NORTH.lateMayDays} dni.`,
  "",
  `### 1.3. Porady (maksymalnie ${ADVICE_LIMIT}, najpierw priorytet, potem termin)`,
  "",
  "| ID | Porada | Kiedy | Priorytet | Termin |",
  "| --- | --- | --- | --- | --- |",
  `| \`flood\` | Przygotuj pole na wysoką wodę | Wodowskaz ostrzegawczy lub alarmowy. | ${PRIORITY.flood} | Zrób teraz |`,
  `| \`gates-close\` | Zamknij zastawki na rowach | Niedobór, wysoki niedobór, susza przy wysokiej rzece albo obserwacja. Nie przy alarmie. | ${PRIORITY.gatesCloseHigh} / ${PRIORITY.gatesClose} | teraz, a przy obserwacji: tydzień |`,
  `| \`gates-spring\` | Zamknij zastawki po roztopach | Miesiące ${SEASON.spring.join(", ")}, brak alarmu i brak niedoboru. | ${PRIORITY.gatesSpring} | W tym tygodniu |`,
  `| \`gates-hold\` | Zatrzymaj nadwyżkę | Brak niedoboru i alarmu, gleba mokra albo anomalia ≥ +${BALANCE.surplus1} mm. Odpada w żniwa i gdy jest porada wiosenna. | ${PRIORITY.gatesHold} | W tym tygodniu |`,
  `| \`irrigation\` | Nawadniaj w chłodnych godzinach | Uprawa z okna nawadniania, gleba nie mokra i sucha albo wskaźnik < ${SOIL_SMI.irrigateBelow}. | ${PRIORITY.irrigation} | teraz przy wysokim niedoborze, inaczej tydzień |`,
  `| \`tillage\` | Ogranicz uprawę gleby | Gleba sucha. | ${PRIORITY.tillage} | W tym tygodniu |`,
  `| \`forecast-dry\` | Nie czekaj na deszcz | Prognoza poniżej progu sezonu i gleba nie mokra. Znika, gdy jest nawadnianie. | ${PRIORITY.forecastDryDeficit} / ${PRIORITY.forecastDry} | teraz tylko przy niedoborze |`,
  `| \`heavy-machinery\` | Odłóż wjazd ciężkim sprzętem | Gleba mokra. | ${PRIORITY.heavyMachineryHarvest} w żniwa, inaczej ${PRIORITY.heavyMachinery} | W tym tygodniu |`,
  `| \`field-check\` | Obejrzyj rośliny na polu | Sezon, świeża scena i anomalia roślin albo słabe NDVI. | ${PRIORITY.fieldCheckDeficit} / ${PRIORITY.fieldCheck} | W tym tygodniu |`,
  `| \`crop\` | Ściółka albo resztki wg uprawy | Niedobór, obserwacja albo sucha gleba, i jest wariant na ten miesiąc. Przypięta – nie wypada z limitu. | ${PRIORITY.crop}, przed zbiorem ${PRIORITY.cropBeforeHarvest} | W tym sezonie |`,
  `| \`cover-crop\` | Okrywa roślinna | Miesiące ${SEASON.coverCrop.join(", ")}, także przy deficycie. | ${PRIORITY.coverCrop} | W tym sezonie |`,
  `| \`dry-spell-watch\` | Obserwuj glebę | Stabilnie, sezon, ≥ ${DRY_SPELL_DAYS} dni bez deszczu, gleba nie mokra, bez nawadniania. | ${PRIORITY.drySpellWatch} | W tym tygodniu |`,
  `| \`gates-ready\` | Sprawdź zastawki i rowy | Zawsze. | ${PRIORITY.gatesReadySeason} w miesiącach ${SEASON.gatesReadyPriority.join(", ")}, inaczej ${PRIORITY.gatesReady} | W tym sezonie |`,
  `| \`humus\` | Dbaj o próchnicę | Zawsze. | ${PRIORITY.humus} | W tym sezonie |`,
  "",
  "Każde nawadnianie zawiera zdanie o pozwoleniu wodnoprawnym. Zastawki (zamykanie, roztopy, zatrzymanie nadwyżki) zawierają zakaz budowy urządzenia bez zgody Wód Polskich.",
  "",
  "Warianty `crop`:",
  "",
  "| Uprawa | Ściółka | Kiedy |",
  "| --- | --- | --- |",
  ...Object.entries(CROPS).map(([id, rule]) => `| ${CROP_LABEL[id] ?? id} | ${rule.mulch} | wzrost ${rule.growing.join(", ") || "—"}, zbiór ${rule.harvest.join(", ") || "brak"}, nawadnianie ${rule.irrigable ? (rule.window ?? []).join("–") : "nie"} |`),
  "",
  "## 2. Macierz scenariuszy",
  "",
  `● – porada w raporcie, ○ – pasuje, ale wypadła przez limit ${ADVICE_LIMIT}.`,
  "",
  `| Scenariusz | Werdykt | ${ADVICE_COLUMNS.map((id) => `\`${id}\``).join(" | ")} |`,
  `| --- | --- | ${ADVICE_COLUMNS.map(() => ":-:").join(" | ")} |`,
);

for (const { scenario, primary } of results) {
  const cells = ADVICE_COLUMNS.map((id) => (primary.shown.some((item) => item.id === id) ? "●" : primary.cut.some((item) => item.id === id) ? "○" : ""));
  push(`| [${scenario.id}](#${scenario.id.toLowerCase()}) ${scenario.name} | ${verdictCell(primary.summary)} | ${cells.join(" | ")} |`);
}

const covered = ADVICE_COLUMNS.filter((id) => results.some((result) => result.primary.shown.some((item) => item.id === id)));
const verdicts = [...new Set(results.map((result) => result.primary.summary.verdict.kind))];
push(
  "",
  `Pokrycie: ${covered.length}/${ADVICE_COLUMNS.length} porad pokazanych co najmniej raz, werdykty: ${verdicts.map((verdict) => `\`${verdict}\``).join(", ")}.`,
  "",
  "Kolumna `forecast-dry` jest pusta celowo: w S08 prognoza −10 mm nie schodzi poniżej progu sezonu, a w S04 i S25 zdanie o prognozie dokleja się do nawadniania.",
  "",
  "## 3. Karty scenariuszy",
  "",
);

function adviceTable(shown: Advice[]) {
  return shown.map((item, index) => `| ${index + 1} | ${item.icon} ${item.title} | ${timingLabel[item.timing]} | ${item.priority} | ${item.why} | ${item.text} |`);
}

function renderRun(run: Run) {
  const { summary, shown, cut } = run;
  push(
    `**Werdykt:** ${verdictCell(summary)} – ${summary.verdict.title}`,
    "",
    `**Punkty:** deficyt ${summary.verdict.deficit}, nadwyżka ${summary.verdict.surplus}, etap ${summary.verdict.stage}, sygnały ${summary.signals.join(", ") || "brak"}, gleba \`${summary.soil.status}\`${summary.soil.smi != null ? ` (wskaźnik ${summary.soil.smi.toFixed(2)})` : ""}.`,
    "",
    summary.sceneNote ? `**Scena:** ${summary.sceneNote}` : "**Scena:** użyta albo brak zdjęcia.",
    "",
    `**Wnioski:** ${summary.findings.map((finding) => finding.title).join("; ") || "brak"}`,
    "",
    "| # | Porada | Termin | Priorytet | Uzasadnienie | Treść |",
    "| --- | --- | --- | --- | --- | --- |",
    ...adviceTable(shown),
  );
  if (cut.length) push("", `*Wypadły przez limit ${ADVICE_LIMIT}:* ${cut.map((item) => `${item.title} (priorytet ${item.priority})`).join(", ")}.`);
}

for (const { scenario, primary, variants } of results) {
  push(
    "",
    `<a id="${scenario.id.toLowerCase()}"></a>`,
    `### ${scenario.id} · ${scenario.name}`,
    "",
    `*Cel:* ${scenario.goal}`,
    "",
    "| Dane wejściowe | Wartość |",
    "| --- | --- |",
    ...describeInputs(scenario, primary.weatherInput, primary.hydroInput).map(([key, value]) => `| ${key} | ${value} |`),
    "",
  );
  renderRun(primary);
  for (const variant of variants) {
    push("", `#### ${variant.label}`, "");
    renderRun(variant);
  }
  push("", "**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………");
}

push(
  "",
  "## 4. Miejsca do szczególnej weryfikacji",
  "",
  `- Progi anomalii bilansu (${BALANCE.deficit1} / ${BALANCE.deficit2} / +${BALANCE.surplus1} mm) – kalibracja na latach 2015, 2018, 2019 i na roku mokrym.`,
  `- Fallback opadów ${PRECIP.deficitPct}% jest czulszy niż standard EDO (SPI-3 < ${SPI.spi3Deficit} lub SPI-1 < ${SPI.spi1Deficit}).`,
  `- PTW i PPW oraz progi wskaźnika gleby ${SOIL_SMI.dryBelow} (sucha) i ${SOIL_SMI.irrigateBelow} (nawadnianie) – potrzebny gleboznawca.`,
  "- Odstępstwo od CDI: deficyt opadów razem ze spadkiem NDVI to tu ostrzeżenie, a nie alarm.",
  `- Progi NDVI ${VEG.ndviWeak} i NDWI ${VEG.physioNdwi} / ${VEG.ndwiVeryDry} pochodzą z literatury ogólnej, nie z kalibracji dla polskich upraw.`,
  "- Porównanie NDVI rok do roku myli się przy zmianie uprawy. Anomalia wieloletnia jest stabilniejsza i włącza się, gdy są norma i odchylenie.",
  `- Jakość sceny (${SCENE.maxAgeDays} dni, ${SCENE.minClearPct}% czystych pikseli) i próg zlewni ${RIVER.minCatchmentKm2} km² dla GloFAS.`,
  `- Miesiące zbioru upraw i heurystyka północy (szerokość ≥ ${NORTH.latitude}).`,
  `- Promień filtra stacji wodowskazowych (${GAUGE.maxDistanceKm} km).`,
  "- Stan prawny piętrzenia wody w rowach melioracyjnych.",
  "- Bezpieczeństwo zamykania zastawek przy wysokiej rzece i suchym polu.",
  "",
);

const failures: string[] = [];
const expect: Record<string, { kind: string; intense?: boolean; ids: string[] }> = {
  S01: { kind: "stable", ids: ["gates-ready", "humus"] },
  S02: { kind: "stable", ids: ["cover-crop", "gates-ready", "humus"] },
  S03: { kind: "stable", ids: ["gates-spring", "gates-ready", "humus"] },
  S04: { kind: "deficit-high", ids: ["gates-close", "irrigation", "tillage", "field-check", "crop"] },
  S05: { kind: "deficit-watch", ids: ["gates-close", "crop", "gates-ready", "humus"] },
  S06: { kind: "deficit-watch", ids: ["gates-close", "crop", "cover-crop", "gates-ready", "humus"] },
  S07: { kind: "stable", ids: ["dry-spell-watch", "cover-crop", "gates-ready", "humus"] },
  S08: { kind: "stable", ids: ["gates-ready", "humus"] },
  S09: { kind: "wet", ids: ["gates-hold", "heavy-machinery", "cover-crop", "gates-ready", "humus"] },
  S10: { kind: "flood", ids: ["flood", "heavy-machinery", "gates-ready", "humus"] },
  S11: { kind: "wet", intense: true, ids: ["gates-spring", "heavy-machinery", "cover-crop", "gates-ready", "humus"] },
  S12: { kind: "drought-high-water", ids: ["flood", "gates-close", "tillage", "crop", "cover-crop"] },
  S13: { kind: "stable", ids: ["gates-hold", "heavy-machinery", "gates-ready", "humus"] },
  S14: { kind: "stable", ids: ["field-check", "gates-ready", "humus"] },
  S15: { kind: "deficit", ids: ["gates-close", "field-check", "crop", "gates-ready", "humus"] },
  S16: { kind: "stable", ids: ["cover-crop", "gates-ready", "humus"] },
  S17: { kind: "deficit-watch", ids: ["gates-close", "crop", "gates-ready", "humus"] },
  S18: { kind: "deficit-watch", ids: ["gates-close", "crop", "gates-ready", "humus"] },
  S19: { kind: "deficit", ids: ["gates-close", "crop", "gates-ready", "humus"] },
  S20: { kind: "stable", ids: ["gates-ready", "humus"] },
  S21: { kind: "deficit-watch", ids: ["gates-close", "crop", "gates-ready", "humus"] },
  S22: { kind: "wet", ids: ["gates-spring", "heavy-machinery", "gates-ready", "humus"] },
  S23: { kind: "stable", ids: ["gates-ready", "humus"] },
  S24: { kind: "deficit-high", ids: ["gates-close", "tillage", "crop", "cover-crop", "gates-ready"] },
  S25: { kind: "deficit-high", ids: ["gates-close", "irrigation", "tillage", "crop", "gates-ready"] },
  S26: { kind: "wet", ids: ["gates-hold", "heavy-machinery", "cover-crop", "gates-ready", "humus"] },
  S27: { kind: "flood", ids: ["flood", "irrigation", "tillage", "crop", "gates-ready"] },
  S28: { kind: "stable", ids: ["gates-hold", "heavy-machinery", "gates-ready", "humus"] },
  S29: { kind: "deficit", ids: ["gates-close", "field-check", "crop", "gates-ready", "humus"] },
  S30: { kind: "stable", ids: ["gates-ready", "humus"] },
};

function sameIds(actual: string[], expectedIds: string[]) {
  return actual.length === expectedIds.length && actual.every((id, index) => id === expectedIds[index]);
}

for (const { scenario, primary, variants } of results) {
  const expected = expect[scenario.id];
  const ids = primary.shown.map((item) => item.id);
  if (!expected) failures.push(`${scenario.id}: brak oczekiwań`);
  else {
    if (primary.summary.verdict.kind !== expected.kind || Boolean(primary.summary.verdict.intense) !== Boolean(expected.intense)) {
      failures.push(`${scenario.id}: werdykt ${verdictCell(primary.summary)}, oczekiwano ${expected.kind}${expected.intense ? " intense" : ""} (d${primary.summary.verdict.deficit}/s${primary.summary.verdict.surplus}/etap ${primary.summary.verdict.stage})`);
    }
    if (!sameIds(ids, expected.ids)) failures.push(`${scenario.id}: porady ${ids.join(", ")} ≠ ${expected.ids.join(", ")}`);
  }
  const blob = [...primary.all, ...variants.flatMap((variant) => variant.all)].map((item) => `${item.text} ${item.why}`).join("\n");
  if (blob.includes("Wodowskaz Wodowskaz")) failures.push(`${scenario.id}: podwójny Wodowskaz`);
  if ((scenario.crop === "zboza" || scenario.crop === "rzepak" || scenario.crop === "inna") && ids.includes("irrigation")) failures.push(`${scenario.id}: nawadnianie uprawy bez nawadniania`);
  for (const item of primary.all) {
    if (item.id === "irrigation" && !item.text.includes(LEGAL.irrigation)) failures.push(`${scenario.id}: nawadnianie bez pozwolenia`);
    if ((item.id === "gates-close" || item.id === "gates-spring" || item.id === "gates-hold") && !item.text.includes(LEGAL.gates)) failures.push(`${scenario.id}: ${item.id} bez dopisku prawnego`);
    if (item.id === "crop" && !primary.shown.some((shown) => shown.id === "crop")) failures.push(`${scenario.id}: porada uprawy wypadła z limitu`);
  }
  if (primary.summary.verdict.kind === "flood" && !["warning", "alarm"].includes(primary.hydroInput?.station ?? "")) failures.push(`${scenario.id}: flood bez wodowskazu`);
  if (primary.hydroInput?.station === "alarm" && primary.summary.verdict.kind !== "flood") failures.push(`${scenario.id}: alarm nie dał flood`);
  const meteoOnly = primary.summary.signals.every((signal) => signal === "meteo");
  if (meteoOnly && primary.summary.signals.length > 0 && ["deficit", "deficit-high"].includes(primary.summary.verdict.kind)) {
    failures.push(`${scenario.id}: sam meteo dał ${primary.summary.verdict.kind}`);
  }
}

const s04 = results.find((result) => result.scenario.id === "S04")!;
if (!s04.primary.shown.find((item) => item.id === "crop")?.title.includes("między rzędami")) failures.push("S04: zła porada uprawy");
if (s04.primary.all.some((item) => item.id === "forecast-dry")) failures.push("S04: forecast-dry nie został scalony");
const s05 = results.find((result) => result.scenario.id === "S05")!;
if (s05.primary.shown.find((item) => item.id === "gates-close")?.timing !== "week") failures.push("S05: zastawki nie są na ten tydzień");
if (!s05.primary.shown.find((item) => item.id === "crop")?.title.includes("międzyplon")) failures.push("S05: brak wariantu przed zbiorem");
const s10 = results.find((result) => result.scenario.id === "S10")!;
const floodWhy = s10.primary.shown.find((item) => item.id === "flood")?.why ?? "";
if (!floodWhy.includes("alarmowym") || !floodWhy.includes("600") || floodWhy.includes("520")) failures.push(`S10: zły próg w tekście: ${floodWhy}`);
const s12 = results.find((result) => result.scenario.id === "S12")!;
if (!s12.primary.shown.find((item) => item.id === "gates-close")?.why.includes("rzeki")) failures.push("S12: brak zdania o rzece");
if (s12.primary.shown.some((item) => item.id === "irrigation")) failures.push("S12: nawadnianie zbóż");
if (!s12.primary.shown.find((item) => item.id === "crop")?.title.startsWith("Zostaw resztki")) failures.push("S12: zły wariant resztek");
const s15 = results.find((result) => result.scenario.id === "S15")!;
if (!s15.primary.shown.find((item) => item.id === "field-check")?.why.includes("inna uprawa")) failures.push("S15: brak zastrzeżenia o płodozmianie");
const s18 = results.find((result) => result.scenario.id === "S18")!;
if (!s18.primary.summary.verdict.title.includes("ocena wstępna")) failures.push("S18: brak oceny wstępnej");
const s19 = results.find((result) => result.scenario.id === "S19")!;
if (s19.primary.shown.find((item) => item.id === "crop")?.title.startsWith("Zostaw resztki")) failures.push("S19: resztki pożniwne w czerwcu");
if (s19.primary.all.some((item) => item.id === "irrigation")) failures.push("S19: nawadnianie przed oknem");
const s25 = results.find((result) => result.scenario.id === "S25")!;
const irrigation = s25.primary.shown.find((item) => item.id === "irrigation");
if (!irrigation?.text.includes("4 m/s") || !irrigation.why.includes("Prognoza")) failures.push("S25: brak wiatru albo prognozy przy nawadnianiu");
if (s25.primary.all.some((item) => item.id === "forecast-dry")) failures.push("S25: osobna porada o prognozie");
const s26 = results.find((result) => result.scenario.id === "S26")!;
if (!s26.primary.shown.find((item) => item.id === "gates-hold")?.text.includes("ozimin")) failures.push("S26: brak wariantu ozimin");
if (s26.variants[0]?.shown.find((item) => item.id === "gates-hold")?.text.includes("ozimin")) failures.push("S26: kontrola nadal ma oziminę");
const s27 = results.find((result) => result.scenario.id === "S27")!;
if (s27.primary.shown.find((item) => item.id === "irrigation")?.timing !== "week") failures.push("S27: nawadnianie nie jest na ten tydzień");
if (s27.primary.all.some((item) => item.id === "gates-close")) failures.push("S27: zastawki przy alarmie");
const s28 = results.find((result) => result.scenario.id === "S28")!;
if (s28.primary.summary.soil.status !== "wet") failures.push("S28 A: piasek nie jest mokry");
if (s28.variants[0]?.summary.verdict.kind !== "deficit" || s28.variants[0]?.summary.soil.status !== "dry") failures.push("S28 B: ił nie daje niedoboru");
if (!s28.variants[0]?.shown.some((item) => item.id === "tillage")) failures.push("S28 B: brak uproszczenia uprawy");
if (s28.variants[1]?.summary.soil.status !== "moderate" || !s28.variants[1]?.summary.findings.some((finding) => finding.text.includes("orientacyjne"))) failures.push("S28 bez tekstury: brak zdania o progach");
const s29 = results.find((result) => result.scenario.id === "S29")!;
if (!s29.primary.shown.find((item) => item.id === "field-check")?.why.includes("NDWI")) failures.push("S29: brak NDWI w oględzinach");
if (s29.primary.all.some((item) => item.id === "irrigation")) failures.push("S29: nawadnianie zbóż");
const s30 = results.find((result) => result.scenario.id === "S30")!;
if (!s30.primary.summary.sceneNote?.includes("Brak aktualnej, bezchmurnej sceny")) failures.push("S30: brak informacji o scenie");
if (s30.primary.summary.verdict.deficit !== 0 || s30.primary.summary.signals.length) failures.push("S30: mała rzeka albo stara scena dały punkty");
const march = results.find((result) => result.scenario.id === "S03")!;
if (!march.primary.shown.some((item) => item.timing === "season")) failures.push("S03: marzec bez porady sezonowej");

const forecastOnly = runScenario({
  id: "FX",
  name: "sucha prognoza",
  goal: "",
  month: 5,
  crop: "zboza",
  hydro: { anomaly: 0, forecast: -20, rootZone: 22 },
});
if (!forecastOnly.shown.some((item) => item.id === "forecast-dry")) failures.push("FX: sucha prognoza bez nawadniania nie dała forecast-dry");
if (forecastOnly.summary.verdict.kind !== "stable") failures.push(`FX: sucha prognoza zmieniła werdykt na ${forecastOnly.summary.verdict.kind}`);

const outPath = resolve(import.meta.dirname, "../../../docs/rekomendacje-weryfikacja.md");
writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Zapisano ${outPath}`);
console.log(`Scenariusze: ${results.length}, porady: ${covered.length}/${ADVICE_COLUMNS.length}, werdykty: ${verdicts.join(", ")}`);
if (failures.length) {
  console.error(`Niezgodności (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
}

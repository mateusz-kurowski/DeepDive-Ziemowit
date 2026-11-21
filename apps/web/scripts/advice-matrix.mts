import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HydroResult, HydroStation, SatelliteResult, WeatherResult } from "../app/types.ts";
import { buildSummary } from "../app/raport/findings.ts";
import { collectAdvice, MAX_ADVICE, timingLabel } from "../app/raport/advice.ts";

type WeatherInput = { diff: number | null; drySpell: number | null };
type HydroInput = {
  balance: number | null;
  soil: HydroResult["soil"]["status"];
  rootZone: number | null;
  change: number | null;
  station: "none" | "warning" | "alarm";
  riverTrend: number | null;
  forecast: number | null;
};
type SatelliteInput = { ndvi: number; diff: number | null } | "unavailable";

type Scenario = {
  id: string;
  name: string;
  goal: string;
  month: number;
  crop: string;
  weather?: Partial<WeatherInput> | null;
  hydro?: Partial<HydroInput> | null;
  satellite?: SatelliteInput;
};

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const CROPS: Record<string, string> = { zboza: "zboża", rzepak: "rzepak", ziemniaki: "ziemniaki", buraki: "buraki", kukorydza: "kukurydza", owoce: "owoce i sad", warzywa: "warzywa", inna: "inna uprawa" };
const ADVICE_COLUMNS = ["flood", "gates-close", "gates-hold", "tillage", "irrigation", "forecast-dry", "heavy-machinery", "field-check", "crop", "cover-crop", "gates-ready", "humus"];

const DEFAULT_WEATHER: WeatherInput = { diff: 0, drySpell: 4 };
const DEFAULT_HYDRO: HydroInput = { balance: 0, soil: "moderate", rootZone: 22, change: 0, station: "none", riverTrend: null, forecast: 0 };

function makeWeather(input: WeatherInput): WeatherResult {
  return {
    date: "2026-07-15",
    coverage: { start: "2026-06-15", end: "2026-07-15", daysRequested: 30, daysAvailable: 30 },
    indicators: { precipitationSumMm: 45, averageTemperatureC: 18, maximumTemperatureC: 27, longestDrySpellDays: input.drySpell, precipitationShortfallMm: null },
    series: [],
    historicalSummary: { status: input.diff === null ? "unavailable" : "available", averagePrecipitationMm: 45, differencePercent: input.diff, assessment: "" },
    source: { provider: "scenariusz testowy" },
    limitations: [],
  };
}

function makeStation(status: HydroInput["station"]): HydroStation[] {
  if (status === "none") return [{ id: "1", name: "Wodowskaz testowy", river: "Wisła", distanceKm: 8, waterLevelCm: 380, warningLevelCm: 520, alarmLevelCm: 600, flowM3s: null, measuredAt: null, status: "normal" }];
  return [{ id: "1", name: "Wodowskaz testowy", river: "Wisła", distanceKm: 8, waterLevelCm: status === "alarm" ? 620 : 540, warningLevelCm: 520, alarmLevelCm: 600, flowM3s: null, measuredAt: null, status }];
}

function makeHydro(input: HydroInput): HydroResult {
  const balancePrecip = input.balance === null ? null : Math.max(0, 50 + input.balance);
  const forecastPrecip = input.forecast === null ? null : Math.max(0, 15 + input.forecast);
  return {
    location: { latitude: 52, longitude: 20 },
    fetchedAt: "2026-07-15T12:00:00Z",
    elevationM: 100,
    soil: { surfacePct: input.rootZone, rootZonePct: input.rootZone, deepPct: input.rootZone, rootZoneChangePp: input.change, status: input.soil, assessment: "" },
    waterBalance: {
      precipitationMm: balancePrecip,
      evapotranspirationMm: balancePrecip === null || input.balance === null ? null : balancePrecip - input.balance,
      balanceMm: input.balance,
      assessment: "",
    },
    forecast: {
      days: 7,
      precipitationMm: forecastPrecip,
      evapotranspirationMm: forecastPrecip === null || input.forecast === null ? null : forecastPrecip - input.forecast,
      balanceMm: input.forecast,
    },
    daily: [],
    river: input.riverTrend === null ? null : { dischargeM3s: 100, mean30dM3s: 100, forecastMaxM3s: 100, trendPercent: input.riverTrend, assessment: `Trend przepływu ${input.riverTrend}%.` },
    stations: makeStation(input.station),
    sources: [],
    limitations: [],
  };
}

function makeSatellite(input: SatelliteInput | undefined): SatelliteResult | undefined {
  if (input === undefined) return undefined;
  const base = { provider: "Earth Search", satellite: "Sentinel-2", level: "L2A", currentImageUrl: null, historicalImageUrl: null, date: "2026-07-10", cloudCoverPercent: 5, resolutionMeters: 10, validPixelPercent: 95, crop: "test", limitations: [] as string[] } as const;
  if (input === "unavailable") return { ...base, status: "unavailable", ndvi: null, historicalNdvi: null, ndviDifference: null, interpretation: "Brak jakościowej sceny Sentinel-2." };
  return {
    ...base,
    status: "available",
    ndvi: input.ndvi,
    historicalNdvi: input.diff === null ? null : Math.round((input.ndvi - input.diff) * 100) / 100,
    ndviDifference: input.diff,
    interpretation: "",
  };
}

const SCENARIOS: Scenario[] = [
  { id: "S01", name: "Sytuacja stabilna latem", goal: "Punkt odniesienia: wszystkie wskaźniki w normie w sezonie wegetacyjnym. Powinny zostać tylko porady ogólne.", month: 6, crop: "zboza", satellite: { ndvi: 0.7, diff: 0.02 } },
  { id: "S02", name: "Sytuacja stabilna jesienią", goal: "Normalne warunki w okresie chłodnym – powinna dojść porada o okrywie roślinnej.", month: 10, crop: "zboza", satellite: "unavailable" },
  { id: "S03", name: "Sytuacja stabilna w marcu", goal: "Marzec nie jest ani sezonem wegetacyjnym (kwi–wrz), ani chłodnym (paź–lut) – brak porad sezonowych.", month: 2, crop: "zboza" },
  { id: "S04", name: "Silna susza w lipcu", goal: "Wszystkie wskaźniki suszy naraz. Sprawdza limit 5 porad i kolejność priorytetów.", month: 6, crop: "ziemniaki", weather: { diff: -45, drySpell: 16 }, hydro: { balance: -48, soil: "dry", rootZone: 12, change: -5, forecast: -18 }, satellite: { ndvi: 0.25, diff: -0.12 } },
  { id: "S05", name: "Umiarkowany niedobór wiosną", goal: "Opady poniżej normy i lekko ujemny bilans przy umiarkowanej wilgotności gleby.", month: 4, crop: "rzepak", weather: { diff: -25 }, hydro: { balance: -10 } },
  { id: "S06", name: "Niedobór zimą (sad)", goal: "Deficyt poza sezonem wegetacyjnym: bez porady o nawadnianiu i bez okrywy roślinnej (bo jest deficyt).", month: 0, crop: "owoce", weather: { diff: -30 }, hydro: { balance: -12 } },
  { id: "S07", name: "Krótka susza w sierpniu", goal: "Tylko długi okres bez deszczu (12 dni), reszta w normie.", month: 7, crop: "kukorydza", weather: { drySpell: 12 } },
  { id: "S08", name: "Sucha prognoza przy normalnym stanie", goal: "Bieżąco w normie, ale prognoza na 7 dni wyraźnie ujemna.", month: 5, crop: "zboza", hydro: { forecast: -10 } },
  { id: "S09", name: "Mokro jesienią", goal: "Opady powyżej normy, dodatni bilans i mokra gleba bez alarmów – ocena „wet”.", month: 9, crop: "zboza", weather: { diff: 35 }, hydro: { balance: 24, soil: "wet", rootZone: 34, forecast: 3 } },
  { id: "S10", name: "Stan alarmowy na rzece", goal: "Wodowskaz w stanie alarmowym – porada bezpieczeństwa na pierwszym miejscu, bez „zatrzymaj nadwyżkę”.", month: 3, crop: "kukorydza", weather: { diff: 40 }, hydro: { balance: 40, soil: "wet", rootZone: 38, station: "alarm", forecast: 12 } },
  { id: "S11", name: "Duży nadmiar wody bez alarmu", goal: "Nadwyżka ≥ 4 pkt bez przekroczeń na wodowskazie – ocena „flood”, ale bez porady o wysokiej wodzie.", month: 1, crop: "buraki", weather: { diff: 50 }, hydro: { balance: 30, soil: "wet", rootZone: 36, riverTrend: 40 } },
  { id: "S12", name: "Susza i jednocześnie stan ostrzegawczy", goal: "Sytuacja sprzeczna: lokalna susza, ale rzeka w stanie ostrzegawczym (np. opady w górze zlewni).", month: 7, crop: "zboza", weather: { diff: -35, drySpell: 14 }, hydro: { balance: -35, soil: "dry", rootZone: 13, station: "warning", forecast: -8 } },
  { id: "S13", name: "Remis: długi brak deszczu i mokra gleba", goal: "1 pkt deficytu i 1 pkt nadwyżki – ocena wypada „stabilna”, a porady się wzajemnie wykluczają.", month: 5, crop: "warzywa", weather: { drySpell: 11 }, hydro: { soil: "wet", rootZone: 32 } },
  { id: "S14", name: "Słabe NDVI przy normalnej wodzie", goal: "Satelita pokazuje słabe rośliny, ale woda w normie – porada „obejrzyj rośliny” bez zmiany oceny.", month: 5, crop: "zboza", satellite: { ndvi: 0.25, diff: 0 } },
  { id: "S15", name: "Spadek NDVI wzmacnia niedobór", goal: "Lekki deficyt + spadek NDVI rok do roku – satelita dodaje punkt deficytu.", month: 6, crop: "zboza", hydro: { balance: -10 }, satellite: { ndvi: 0.45, diff: -0.15 } },
  { id: "S16", name: "Słabe NDVI w listopadzie", goal: "Poza sezonem wegetacyjnym porada „obejrzyj rośliny” nie powinna się pojawić.", month: 10, crop: "zboza", satellite: { ndvi: 0.2, diff: -0.1 } },
  { id: "S17", name: "Niedobór dla „innej uprawy”", goal: "Deficyt przy uprawie bez dedykowanej porady ściółkowania.", month: 5, crop: "inna", weather: { diff: -30 }, hydro: { balance: -15 } },
  { id: "S18", name: "Brak danych hydrologicznych", goal: "Działa tylko meteorologia (np. awaria API hydro) – porada o zastawkach z ogólnym uzasadnieniem.", month: 4, crop: "zboza", weather: { diff: -25, drySpell: 5 }, hydro: null },
  { id: "S19", name: "Gleba szybko przesycha", goal: "Gleba jeszcze umiarkowana, ale spadek wilgotności ≥ 3 p.p. i lekko ujemny bilans.", month: 5, crop: "buraki", hydro: { balance: -8, rootZone: 16, change: -4 } },
  { id: "S20", name: "Wartości tuż poniżej progów", goal: "Bilans dokładnie −5 mm, 9 dni bez deszczu, opady −19% – żaden próg nie powinien się uruchomić.", month: 6, crop: "zboza", weather: { diff: -19, drySpell: 9 }, hydro: { balance: -5, forecast: -5 } },
  { id: "S21", name: "Wartości dokładnie na progach", goal: "Bilans dokładnie −30 mm i 10 dni bez deszczu – progi włączające (≤ −30, ≥ 10).", month: 6, crop: "zboza", weather: { diff: -20, drySpell: 10 }, hydro: { balance: -30 } },
];

function describeInputs(scenario: Scenario, weather: WeatherInput | null, hydro: HydroInput | null) {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const rows: Array<[string, string]> = [
    ["Miesiąc", MONTHS[scenario.month]],
    ["Uprawa", CROPS[scenario.crop] ?? scenario.crop],
    ["Opady 30 dni vs norma", weather ? (weather.diff === null ? "brak danych" : `${signed(weather.diff)}%`) : "brak danych meteo"],
    ["Najdłużej bez deszczu", weather?.drySpell != null ? `${weather.drySpell} dni` : "brak danych"],
  ];
  if (hydro) {
    rows.push(
      ["Bilans wodny 30 dni (opad − parowanie)", hydro.balance === null ? "brak danych" : `${signed(hydro.balance)} mm`],
      ["Gleba (strefa korzeni)", `${hydro.soil}${hydro.rootZone !== null ? `, ${hydro.rootZone}%` : ""}${hydro.change ? `, zmiana ${signed(hydro.change)} p.p.` : ""}`],
      ["Wodowskaz w pobliżu", hydro.station === "none" ? "stan normalny" : hydro.station === "alarm" ? "STAN ALARMOWY" : "stan ostrzegawczy"],
      ["Trend przepływu rzeki", hydro.riverTrend === null ? "brak danych" : `${signed(hydro.riverTrend)}%`],
      ["Prognoza 7 dni (opad − parowanie)", hydro.forecast === null ? "brak danych" : `${signed(hydro.forecast)} mm`],
    );
  } else {
    rows.push(["Dane hydrologiczne", "brak (null)"]);
  }
  const sat = scenario.satellite;
  rows.push(["Satelita (NDVI)", sat === undefined ? "nie pobrano" : sat === "unavailable" ? "brak jakościowej sceny" : `${sat.ndvi.toFixed(2)}${sat.diff !== null ? ` (rok do roku ${signed(sat.diff)})` : ""}`]);
  return rows;
}

const results = SCENARIOS.map((scenario) => {
  const weatherInput = scenario.weather === null ? null : { ...DEFAULT_WEATHER, ...scenario.weather };
  const hydroInput = scenario.hydro === null ? null : { ...DEFAULT_HYDRO, ...scenario.hydro };
  const weather = weatherInput ? makeWeather(weatherInput) : null;
  const hydro = hydroInput ? makeHydro(hydroInput) : null;
  const satellite = makeSatellite(scenario.satellite);
  const summary = buildSummary(weather, hydro, satellite);
  const all = collectAdvice({ kind: summary.verdict.kind, weather, hydro, satellite, crop: scenario.crop, month: scenario.month });
  return { scenario, weatherInput, hydroInput, summary, shown: all.slice(0, MAX_ADVICE), cut: all.slice(MAX_ADVICE) };
});

const lines: string[] = [];
const push = (...values: string[]) => lines.push(...values);

push(
  "# Rekomendacje Ziemowita – zestaw do weryfikacji",
  "",
  "> Plik generowany automatycznie przez `apps/web/scripts/advice-matrix.mts` (uruchom: `npm run advice:matrix` w `apps/web`).",
  "> Wyniki scenariuszy pochodzą z prawdziwych funkcji `buildSummary` i `collectAdvice` – nie edytuj ich ręcznie, tylko popraw logikę i wygeneruj plik ponownie.",
  "",
  "Dokument ma trzy części:",
  "",
  "1. **Reguły** – kiedy włącza się każda porada i każda ocena ogólna (progi wprost z kodu).",
  "2. **Macierz scenariuszy** – które porady pojawiają się w 21 sytuacjach testowych.",
  "3. **Karty scenariuszy** – pełne dane wejściowe, wynik i miejsce na ocenę eksperta.",
  "",
  "Na końcu jest lista miejsc, które szczególnie warto zweryfikować merytorycznie.",
  "",
  "## 1. Reguły",
  "",
  "### 1.1. Skąd biorą się statusy wejściowe",
  "",
  "| Wskaźnik | Źródło | Jak jest liczony |",
  "| --- | --- | --- |",
  "| Opady vs norma | Open-Meteo (archiwum) | Suma opadów z 30 dni w porównaniu ze średnią z tych samych dni w poprzednich latach, w %. |",
  "| Najdłużej bez deszczu | Open-Meteo | Najdłuższa seria dni z opadem < 1 mm w ostatnich 30 dniach. |",
  "| Bilans wodny | Open-Meteo | Suma opadu − suma parowania potencjalnego (ET0) z ostatnich 30 dni, w mm. |",
  "| Status gleby | Open-Meteo (wilgotność 9–27 cm) | < 15% obj. → `dry` (sucha), 15–30% → `moderate`, ≥ 30% → `wet` (mokra). |",
  "| Zmiana wilgotności | Open-Meteo | Różnica wilgotności strefy korzeni z 30 dni, w punktach procentowych. |",
  "| Stan wodowskazu | IMGW | `alarm`, gdy stan ≥ alarmowy; `warning`, gdy stan ≥ ostrzegawczy (3 najbliższe stacje). |",
  "| Trend rzeki | GloFAS | Zmiana przepływu względem średniej z 30 dni, w %. |",
  "| Prognoza | Open-Meteo | Opad − parowanie na najbliższe 7 dni, w mm. |",
  "| NDVI | Sentinel-2 | Zieleń roślin 0–1 i różnica względem tego samego okresu rok temu. |",
  "",
  "### 1.2. Ocena ogólna (werdykt)",
  "",
  "Ocena powstaje z punktów **deficytu** i **nadwyżki** zbieranych przez `buildSummary`:",
  "",
  "| Warunek | Deficyt | Nadwyżka |",
  "| --- | --- | --- |",
  "| Opady ≤ −20% normy | +1 | |",
  "| Opady ≥ +20% normy | | +1 |",
  "| ≥ 10 dni bez deszczu | +1 | |",
  "| Bilans ≤ −30 mm | +2 | |",
  "| Bilans od −30 do −5 mm (bez −5) | +1 | |",
  "| Bilans > +15 mm | | +1 |",
  "| Gleba sucha | +2 | |",
  "| Gleba mokra | | +1 |",
  "| Spadek wilgotności ≤ −3 p.p. (gdy gleba nie jest mokra) | +1 | |",
  "| Wodowskaz w stanie ostrzegawczym lub alarmowym | | +2 |",
  "| Trend rzeki ≤ −20% | +1 | |",
  "| Trend rzeki ≥ +30% | | +1 |",
  "| NDVI < 0,3 lub spadek NDVI ≤ −0,08 rok do roku, **tylko gdy deficyt > 0** | +1 | |",
  "",
  "Werdykt wybierany jest w tej kolejności (pierwszy pasujący wygrywa):",
  "",
  "| Werdykt | Warunek | Tytuł w raporcie |",
  "| --- | --- | --- |",
  "| `deficit-high` | deficyt ≥ 3 | Wysokie ryzyko niedoboru wody |",
  "| `deficit` | deficyt ≥ 1 i deficyt > nadwyżka | Umiarkowane ryzyko niedoboru wody |",
  "| `flood` | alarm/ostrzeżenie na wodowskazie lub nadwyżka ≥ 4 | Nadmiar wody – ryzyko podtopień |",
  "| `wet` | nadwyżka ≥ 2 | Dobre uwilgotnienie – czas magazynować wodę |",
  "| `stable` | pozostałe przypadki | Sytuacja wodna stabilna |",
  "",
  "Sezon wegetacyjny w regułach to **kwiecień–wrzesień**, sezon chłodny to **październik–luty**. Marzec nie należy do żadnego z nich.",
  "",
  `### 1.3. Porady (maksymalnie ${MAX_ADVICE} w raporcie, posortowane po priorytecie – mniejszy = ważniejszy)`,
  "",
  "| ID | Porada | Kiedy się włącza | Priorytet | Termin |",
  "| --- | --- | --- | --- | --- |",
  "| `flood` | Przygotuj pole na wysoką wodę | Którykolwiek z 3 najbliższych wodowskazów w stanie ostrzegawczym lub alarmowym. | 1 | Zrób teraz |",
  "| `gates-close` | Zamknij zastawki na rowach | Werdykt `deficit` lub `deficit-high`. | 2 przy `deficit-high`, 3 przy `deficit` | Zrób teraz |",
  "| `gates-hold` | Zatrzymaj nadwyżkę wody na polu | Brak deficytu **i** brak alarmu na wodowskazie **i** (gleba mokra **lub** bilans > +15 mm). | 3 | W tym tygodniu |",
  "| `tillage` | Ogranicz uprawę gleby | Gleba sucha (< 15%). | 3 | W tym tygodniu |",
  "| `irrigation` | Nawadniaj w chłodnych godzinach | Sezon wegetacyjny **i** ≥ 10 dni bez deszczu. | 2 | Zrób teraz |",
  "| `forecast-dry` | Nie czekaj na deszcz | Prognoza 7 dni < −5 mm. | 3 | Zrób teraz |",
  "| `heavy-machinery` | Odłóż wjazd ciężkim sprzętem | Gleba mokra (≥ 30%). | 4 | W tym tygodniu |",
  "| `field-check` | Obejrzyj rośliny na polu | Sezon wegetacyjny **i** jest NDVI **i** (NDVI < 0,3 **lub** spadek ≤ −0,08 rok do roku). | 3 przy deficycie, inaczej 4 | W tym tygodniu |",
  "| `crop` | Ściółkowanie zależne od uprawy (patrz niżej) | Werdykt `deficit`/`deficit-high` **lub** gleba sucha; uprawa inna niż „inna uprawa”. | 4 | W tym sezonie |",
  "| `cover-crop` | Zostaw okrywę roślinną na zimę | Sezon chłodny **i** brak deficytu. | 5 | W tym sezonie |",
  "| `gates-ready` | Sprawdź zastawki i rowy | Zawsze. | 6 | W tym sezonie |",
  "| `humus` | Dbaj o próchnicę w glebie | Zawsze. | 7 | W tym sezonie |",
  "",
  "Warianty porady `crop`:",
  "",
  "| Uprawa | Porada |",
  "| --- | --- |",
  "| ziemniaki, warzywa | Okryj glebę między rzędami |",
  "| owoce i sad | Wyściółkuj pasy pod drzewami |",
  "| zboża, rzepak, kukurydza, buraki | Zostaw resztki roślin na polu |",
  "| inna uprawa | brak porady |",
  "",
  "## 2. Macierz scenariuszy",
  "",
  `● – porada pokazana w raporcie, ○ – porada pasuje, ale wypadła przez limit ${MAX_ADVICE} porad.`,
  "",
  `| Scenariusz | Werdykt | ${ADVICE_COLUMNS.map((id) => `\`${id}\``).join(" | ")} |`,
  `| --- | --- | ${ADVICE_COLUMNS.map(() => ":-:").join(" | ")} |`,
);

for (const { scenario, summary, shown, cut } of results) {
  const cells = ADVICE_COLUMNS.map((id) => (shown.some((a) => a.id === id) ? "●" : cut.some((a) => a.id === id) ? "○" : ""));
  push(`| [${scenario.id}](#${scenario.id.toLowerCase()}) ${scenario.name} | \`${summary.verdict.kind}\` | ${cells.join(" | ")} |`);
}

const covered = ADVICE_COLUMNS.filter((id) => results.some((r) => r.shown.some((a) => a.id === id)));
const verdicts = [...new Set(results.map((r) => r.summary.verdict.kind))];
push(
  "",
  `Pokrycie: ${covered.length}/${ADVICE_COLUMNS.length} porad pokazanych co najmniej raz, werdykty: ${verdicts.map((v) => `\`${v}\``).join(", ")}.`,
  "",
  "## 3. Karty scenariuszy",
  "",
  "Przy każdej karcie zaznacz ocenę. Jeśli porada jest nietrafna, wpisz, co powinno się pojawić zamiast niej.",
);

for (const { scenario, weatherInput, hydroInput, summary, shown, cut } of results) {
  push(
    "",
    `<a id="${scenario.id.toLowerCase()}"></a>`,
    `### ${scenario.id} · ${scenario.name}`,
    "",
    `*Cel:* ${scenario.goal}`,
    "",
    "| Dane wejściowe | Wartość |",
    "| --- | --- |",
    ...describeInputs(scenario, weatherInput, hydroInput).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    `**Werdykt:** \`${summary.verdict.kind}\` – ${summary.verdict.title}`,
    "",
    `**Wnioski z danych:** ${summary.findings.map((f) => f.title).join("; ") || "brak"}`,
    "",
    "| # | Porada | Termin | Priorytet | Uzasadnienie pokazywane rolnikowi |",
    "| --- | --- | --- | --- | --- |",
    ...shown.map((a, i) => `| ${i + 1} | ${a.icon} ${a.title} | ${timingLabel[a.timing]} | ${a.priority} | ${a.why} |`),
  );
  if (cut.length) push("", `*Wypadły przez limit ${MAX_ADVICE}:* ${cut.map((a) => `${a.title} (priorytet ${a.priority})`).join(", ")}.`);
  push("", "**Ocena eksperta:** ☐ trafne  ☐ częściowo trafne  ☐ nietrafne — uwagi: ……………………………………");
}

push(
  "",
  "## 4. Miejsca do szczególnej weryfikacji",
  "",
  "- **Sprzeczne porady przy remisie punktów (S13).** Przy 1 pkt deficytu i 1 pkt nadwyżki werdykt jest „stabilny”, a jednocześnie pojawiają się „Nawadniaj” i „Zatrzymaj nadwyżkę” / „Odłóż wjazd ciężkim sprzętem”.",
  "- **Susza przy wysokiej rzece (S12).** Rolnik dostaje jednocześnie „Przygotuj pole na wysoką wodę” i „Zamknij zastawki”. Do oceny, czy to sensowne, gdy wysoka woda pochodzi z góry zlewni.",
  "- **Stałe progi wilgotności gleby (15% / 30%).** Nie zależą od rodzaju gleby – dla piasku 15% to dużo, dla gliny mało.",
  "- **Stały próg NDVI 0,3.** Nie uwzględnia fazy rozwoju roślin (np. wczesna wiosna po siewie zawsze ma niskie NDVI).",
  "- **Porada „Zostaw resztki roślin na polu” przed żniwami (S05 – maj, S19 – czerwiec).** Treść mówi o resztkach pożniwnych, a włącza się w środku sezonu.",
  "- **Nawadnianie zależy tylko od dni bez deszczu.** Nie sprawdza, czy gleba jest mokra (S13).",
  "- **Marzec bez porad sezonowych (S03).** Ani okrywa roślinna, ani porady sezonu wegetacyjnego.",
  `- **Limit ${MAX_ADVICE} porad (S04, S12).** Przy silnej suszy część porad wypada – w S04 wypada jedyna porada dopasowana do uprawy (ziemniaki: „Okryj glebę między rzędami”). Warto ocenić, czy wypadają właściwe.`,
  "",
);

const outPath = resolve(import.meta.dirname, "../../../docs/rekomendacje-weryfikacja.md");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Zapisano ${outPath}`);
console.log(`Scenariusze: ${results.length}, porady pokazane: ${covered.length}/${ADVICE_COLUMNS.length}, werdykty: ${verdicts.join(", ")}`);

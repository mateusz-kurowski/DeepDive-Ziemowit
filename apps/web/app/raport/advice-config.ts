import type { SoilTexture } from "../types";

/**
 * Konfiguracja progów hydrologicznych, meteorologicznych i agronomicznych silnika rekomendacji.
 * Wykorzystywana również przez generator macierzy reguł (`npm run advice:matrix`).
 */

export const SEASON = {
  spring: [2, 3, 4],
  vegetation: [4, 5, 6, 7, 8, 9],
  cold: [10, 11, 12, 1, 2],
  droughtWindow: { from: "03-21", to: "09-30" },
  coverCrop: [8, 9, 10, 11, 12, 1, 2],
  winterCropHold: [9, 10, 11, 12, 1, 2, 3],
  gatesReadyPriority: [3, 4, 9, 10],
} as const;

export const SPI = {
  spi3Deficit: -1,
  spi1Deficit: -2,
  spi1Surplus: 1,
} as const;

export const PRECIP = {
  deficitPct: -20,
  surplusPct: 20,
} as const;

/** Anomalia 30-dniowego bilansu wodnego (opad − ET0) względem wielolecia [mm]. */
export const BALANCE = {
  deficit1: -15,
  deficit2: -40,
  surplus1: 20,
} as const;

/** Progi bezwzględnego bilansu wodnego [mm] stosowane przy braku normy wieloletniej. */
export const BALANCE_FALLBACK = {
  vegetation: { deficit1: -30, deficit2: -50, surplus1: 15 },
  other: { deficit1: -5, deficit2: -30, surplus1: 15 },
} as const;

export const DRY_SPELL_DAYS = 10;
export const SOIL_DROP_PP = -3;

/** Orientacyjne progi wilgotności objętościowej gleby [% obj.] przy nieznanym uziarnieniu. */
export const SOIL_FALLBACK = {
  dryBelow: 15,
  wetAt: 30,
} as const;

/** Literaturowe wartości punktu trwałego więdnięcia (PTW) i polowej pojemności wodnej (PPW) [% obj.]. */
export const SOIL_WATER: Record<SoilTexture, { ptw: number; ppw: number }> = {
  sand: { ptw: 4, ppw: 12 },
  loamy_sand: { ptw: 6, ppw: 16 },
  sandy_loam: { ptw: 9, ppw: 23 },
  loam: { ptw: 13, ppw: 30 },
  silt_loam: { ptw: 13, ppw: 33 },
  clay_loam: { ptw: 18, ppw: 36 },
  clay: { ptw: 23, ppw: 40 },
};

export const SOIL_SMI = {
  dryBelow: 0.4,
  wetAt: 1,
  irrigateBelow: 0.5,
} as const;

export const SOIL_ANOMALY_Z = -1;

export const SANDY_TEXTURES: readonly SoilTexture[] = ["sand", "loamy_sand"];

/** Progi trendu przepływu GloFAS [%] oraz minimalna powierzchnia zlewni [km²] uwzględniana w ocenie. */
export const RIVER = {
  deficit: -20,
  surplus: 30,
  minCatchmentKm2: 2000,
} as const;

export const GAUGE = {
  maxDistanceKm: 15,
} as const;

export const VEG = {
  ndviWeak: 0.4,
  ndviGood: 0.6,
  ndviWeakMonths: [5, 6, 7, 8],
  ndviAnomalyZ: -1,
  ndviYoYDrop: -0.08,
  physioNdvi: 0.5,
  physioNdwi: 0.3,
  ndwiVeryDry: 0.2,
} as const;

/** Wymogi jakościowe obserwacji Sentinel-2 (maksymalny wiek sceny i minimalny udział pikseli bezchmurnych). */
export const SCENE = {
  maxAgeDays: 10,
  minClearPct: 70,
} as const;

/** Próg suchej prognozy 7-dniowej (opad − ET0) [mm]. */
export const FORECAST = {
  vegetation: -15,
  other: -5,
} as const;

export const WINTER_PRECIP_ANOMALY_PCT = -20;

/** Korekta terminu wiosennego dla północnej części Polski (powyżej 53°N). */
export const NORTH = {
  latitude: 53,
  aprilOrEarlyMayDays: 10,
  lateMayDays: 5,
} as const;

export const WINTER_CROPS = ["zboza", "rzepak"] as const;

export type CropMulch = "rows" | "tree_strips" | "residue" | "generic";

export type CropRule = {
  irrigable: boolean;
  window?: readonly [string, string];
  harvest: readonly number[];
  growing: readonly number[];
  mulch: CropMulch;
};

export const CROPS: Record<string, CropRule> = {
  ziemniaki: { irrigable: true, window: ["05-20", "08-10"], harvest: [8, 9, 10], growing: [4, 5, 6, 7, 8, 9], mulch: "rows" },
  warzywa: { irrigable: true, window: ["04-15", "09-30"], harvest: [7, 8, 9, 10], growing: [4, 5, 6, 7, 8, 9], mulch: "rows" },
  owoce: { irrigable: true, window: ["06-01", "08-31"], harvest: [], growing: [4, 5, 6, 7, 8, 9], mulch: "tree_strips" },
  kukorydza: { irrigable: true, window: ["06-10", "08-31"], harvest: [9, 10, 11], growing: [5, 6, 7, 8, 9], mulch: "residue" },
  buraki: { irrigable: true, window: ["06-20", "09-10"], harvest: [9, 10, 11], growing: [4, 5, 6, 7, 8, 9, 10], mulch: "residue" },
  zboza: { irrigable: false, harvest: [7, 8], growing: [3, 4, 5, 6, 7], mulch: "residue" },
  rzepak: { irrigable: false, harvest: [7, 8], growing: [3, 4, 5, 6, 7], mulch: "residue" },
  inna: { irrigable: false, harvest: [], growing: [4, 5, 6, 7, 8, 9], mulch: "generic" },
};

export function cropRule(crop: string): CropRule {
  return CROPS[crop] ?? CROPS.inna;
}

export const LEGAL = {
  irrigation: "Nawadniaj tylko z ujęcia objętego pozwoleniem wodnoprawnym.",
  irrigationVolume: "Bezpłatny limit 5 m³/dobę nie obejmuje nawadniania pól. 1 mm wody na 1 ha to 10 m³.",
  gates: "Używaj tylko istniejących, legalnych urządzeń. Nie buduj zastawki ani nie przebudowuj rowu bez zgody Wód Polskich.",
  gatesPortable: "Jeśli nie masz zastawki, zapytaj ODR o przenośny próg piętrzący.",
  gatesReadyPermit: "Sprawdź też, czy zastawka ma pozwolenie. Urządzenie bez zgody można zalegalizować w Wodach Polskich.",
  gatesReadyOwner: "Utrzymanie rowów należy do właściciela gruntu albo spółki wodnej.",
  flood: "Wywieź z terenów zalewowych obornik, nawozy i środki ochrony roślin.",
} as const;

export const VERDICT_TITLE = {
  "deficit-high": "Wysokie ryzyko niedoboru wody",
  deficit: "Umiarkowane ryzyko niedoboru wody",
  "deficit-watch": "Mniej wody niż zwykle – obserwuj sytuację",
  "drought-high-water": "Susza na polu, wysoka woda w rzece",
  flood: "Nadmiar wody – ryzyko podtopień",
  wet: "Dobre uwilgotnienie – czas magazynować wodę",
  "wet-intense": "Bardzo dużo wody – zatrzymaj ją, ale pilnuj odpływu",
  stable: "Sytuacja wodna stabilna",
} as const;

export const LOW_CONFIDENCE_SUFFIX = "(ocena wstępna – brak części danych)";

export const DEFICIT_VERDICTS = ["deficit", "deficit-high", "drought-high-water"] as const;
export const WATCH_VERDICTS = ["deficit-watch"] as const;

export const ADVICE_LIMIT = 5;

export const TERM_RANK = { now: 0, week: 1, season: 2 } as const;

export const ADVICE_ID_ORDER = [
  "flood",
  "gates-close",
  "gates-spring",
  "gates-hold",
  "irrigation",
  "tillage",
  "field-check",
  "forecast-dry",
  "heavy-machinery",
  "crop",
  "cover-crop",
  "dry-spell-watch",
  "gates-ready",
  "humus",
] as const;

/** Kolejność faz działań: bezpieczeństwo powodziowe → retencja korytowa i rowowa → gleba i agrotechnika → nawadnianie. */
export const ADVICE_PHASE: Record<(typeof ADVICE_ID_ORDER)[number], number> = {
  flood: 0,
  "gates-close": 1,
  "gates-spring": 1,
  "gates-hold": 1,
  "forecast-dry": 1,
  "gates-ready": 1,
  tillage: 2,
  "heavy-machinery": 2,
  "field-check": 2,
  crop: 2,
  "cover-crop": 2,
  "dry-spell-watch": 2,
  humus: 2,
  irrigation: 3,
};

export const PRIORITY = {
  flood: 1,
  gatesCloseHigh: 2,
  gatesClose: 3,
  gatesSpring: 3,
  gatesHold: 3,
  irrigation: 2,
  tillage: 3,
  forecastDryDeficit: 3,
  forecastDry: 4,
  heavyMachineryHarvest: 3,
  heavyMachinery: 4,
  fieldCheckDeficit: 3,
  fieldCheck: 4,
  crop: 4,
  cropBeforeHarvest: 5,
  coverCrop: 5,
  drySpellWatch: 5,
  gatesReadySeason: 5,
  gatesReady: 6,
  humus: 7,
} as const;

export const TEXTURE_LABEL: Record<SoilTexture, string> = {
  sand: "piasek",
  loamy_sand: "piasek gliniasty",
  sandy_loam: "glina piaszczysta",
  loam: "glina",
  silt_loam: "glina pylasta",
  clay_loam: "glina ilasta",
  clay: "ił",
};

export type ParcelResult = {
  id: string;
  parcel: string;
  commune: string;
  county: string;
  voivodeship: string;
  lat: number | null;
  lng: number | null;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
};

export type WeatherResult = {
  date: string;
  coverage: { start: string; end: string; daysRequested: number; daysAvailable: number };
  indicators: {
    precipitationSumMm: number | null;
    averageTemperatureC: number | null;
    maximumTemperatureC: number | null;
    longestDrySpellDays: number | null;
    precipitationShortfallMm: number | null;
  };
  series: Array<{
    date: string;
    precipitationMm: number | null;
    meanTemperatureC: number | null;
    maxTemperatureC: number | null;
  }>;
  historicalSummary: {
    status: "available" | "partial" | "unavailable";
    averagePrecipitationMm: number | null;
    differencePercent: number | null;
    assessment: string;
  };
  source: { provider: string };
  limitations: string[];
};

export type HydroStation = {
  id: string;
  name: string;
  river: string | null;
  distanceKm: number;
  waterLevelCm: number;
  warningLevelCm: number | null;
  alarmLevelCm: number | null;
  flowM3s: number | null;
  measuredAt: string | null;
  status: "normal" | "warning" | "alarm" | "unknown";
};

export type HydroResult = {
  location: { latitude: number; longitude: number };
  fetchedAt: string;
  elevationM: number | null;
  soil: {
    surfacePct: number | null;
    rootZonePct: number | null;
    deepPct: number | null;
    rootZoneChangePp: number | null;
    status: "dry" | "moderate" | "wet" | "unknown";
    assessment: string;
  };
  waterBalance: {
    precipitationMm: number | null;
    evapotranspirationMm: number | null;
    balanceMm: number | null;
    assessment: string;
  };
  forecast: {
    days: number;
    precipitationMm: number | null;
    evapotranspirationMm: number | null;
    balanceMm: number | null;
  };
  daily: Array<{ date: string; precipitationMm: number | null; et0Mm: number | null; forecast: boolean }>;
  river: {
    dischargeM3s: number | null;
    mean30dM3s: number | null;
    forecastMaxM3s: number | null;
    trendPercent: number | null;
    assessment: string;
  } | null;
  stations: HydroStation[];
  sources: string[];
  limitations: string[];
};

export type ImgwWarning = {
  id: string;
  type: "meteorological" | "hydrological";
  event: string;
  degree: string | null;
  probabilityPercent: number | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  area: string;
  description: string;
};

export type ImgwWarningsResult = {
  fetchedAt: string;
  meteorological: { status: "available" | "unavailable"; warnings: ImgwWarning[]; error: string | null };
  hydrological: { status: "available" | "unavailable"; warnings: ImgwWarning[]; error: string | null };
  location: { county: string; voivodeship: string };
  source: { name: string; url: string };
};

export type SatelliteResult = {
  status: "available" | "partial" | "unavailable";
  provider: "Earth Search";
  satellite: "Sentinel-2";
  level: "L2A";
  currentImageUrl: string | null;
  historicalImageUrl: string | null;
  imageBounds: [number, number, number, number] | null;
  imageWidth: number | null;
  imageHeight: number | null;
  geometry: import("geojson").Geometry | null;
  date: string | null;
  cloudCoverPercent: number | null;
  resolutionMeters: number | null;
  ndvi: number | null;
  historicalNdvi: number | null;
  ndviDifference: number | null;
  validPixelPercent: number | null;
  crop: string;
  interpretation: string;
  limitations: string[];
};

"use client";

import type { Geometry } from "geojson";
import dynamic from "next/dynamic";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "./components/BrandLogo";
import type { MapFocus } from "./components/ParcelMap";
import SatelliteImage from "./components/SatelliteImage";
import type { ParcelResult } from "./types";

const ParcelMap = dynamic(() => import("./components/ParcelMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Ładowanie mapy…</div>,
});

type DemoScenario = {
  id: string;
  tone: "flood" | "drought" | "retention";
  problem: string;
  region: string;
  detail: string;
  crop: string;
  parcelId: string | null;
  lat: number;
  lng: number;
  label: string;
};

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "zulawy",
    tone: "flood",
    problem: "Podatność na podtopienia",
    region: "Żuławy Wiślane",
    detail: "Ostaszewo · pszenica ozima (scenariusz)",
    crop: "zboza",
    parcelId: "221003_2.0002.63/2",
    lat: 54.215,
    lng: 19.012,
    label: "Scenariusz demo: pole rolne w nisko położonych, odwadnianych Żuławach. To podatność regionalna na podtopienia, nie bieżące ostrzeżenie.",
  },
  {
    id: "wielkopolska",
    tone: "drought",
    problem: "Podatność na suszę",
    region: "Wielkopolska",
    detail: "Nekla · pole uprawne · kukurydza (scenariusz)",
    crop: "kukorydza",
    parcelId: "303003_5.0215.110/10",
    lat: 52.3505,
    lng: 17.405,
    label: "Scenariusz demo: pole uprawne 110/10 w Nekli, w Wielkopolsce — regionie o wysokim zagrożeniu suszą rolniczą. Nie oznacza to bieżącego deficytu wody.",
  },
  {
    id: "kujawy",
    tone: "retention",
    problem: "Potencjał retencji dolinowej",
    region: "Dolina Wisły",
    detail: "Zławieś Wielka · pole w dolinie Wisły · burak cukrowy (scenariusz)",
    crop: "buraki",
    parcelId: "041509_2.0017.452",
    lat: 53.07765,
    lng: 18.30921,
    label: "Scenariusz demo: pole rolne w dolinie Wisły, reprezentujące potencjał retencji dolinowej. Nie jest to bieżące ostrzeżenie powodziowe.",
  },
];

function GuideIcon({ children }: { children: ReactNode }) {
  return (
    <span className="guide-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

function polishParcelsCount(count: number): string {
  if (count === 1) return "1 działka";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} działki`;
  }
  return `${count} działek`;
}

function reportUrl(parcelsInput: ParcelResult | ParcelResult[], selectedCrop: string) {
  const list = Array.isArray(parcelsInput) ? parcelsInput : [parcelsInput];
  if (list.length <= 1) {
    const first = list[0];
    if (!first) return `/raport?crop=${encodeURIComponent(selectedCrop)}`;
    const params = new URLSearchParams({ id: first.id, crop: selectedCrop });
    if (first.lat != null && first.lng != null) {
      params.set("lat", first.lat.toFixed(6));
      params.set("lng", first.lng.toFixed(6));
    }
    return `/raport?${params}`;
  }

  const params = new URLSearchParams();
  for (const item of list) {
    params.append("id", item.id);
    params.append("pt", item.lat != null && item.lng != null ? `${item.lat.toFixed(6)},${item.lng.toFixed(6)}` : "");
  }
  params.set("crop", selectedCrop);
  return `/raport?${params}`;
}

type WeatherResult = {
  date: string;
  indicators: {
    precipitationSumMm: number | null;
    averageTemperatureC: number | null;
    longestDrySpellDays: number | null;
  };
  historicalSummary: {
    status: "available" | "partial" | "unavailable";
    differencePercent: number | null;
    assessment: string;
  };
  source: {
    provider: string;
  };
};

type SoilTextureResult = {
  status: "available" | "partial" | "unresolved-zero";
  depth: string;
  statistic: string;
  units: string;
  fractions: Record<"sand" | "silt" | "clay", { label: string; valueGkg: number | null; flag: string }>;
  samplePoint: { lat: number; lng: number };
  source: { name: string; resolutionM: number; url: string };
};

type TerrainFlowResult = {
  status: "available" | "partial";
  sampleSpacingM: number;
  bufferM: number;
  elevationDatum: string;
  validSampleCount: number;
  source: { name: string; url: string; nativeResolutionM: number };
  slope: { meanDeg: number | null; medianDeg: number | null; p90Deg: number | null; maxDeg: number | null };
  flow: {
    outflowExits: Array<{ direction: string; estimatedContributingAreaM2: number }>;
    outflowPoints: Array<{ lat: number; lng: number; direction: string; estimatedContributingAreaM2: number }>;
    inflowExits: Array<{ direction: string; estimatedContributingAreaM2: number }>;
    concentrationZones: Array<{ lat: number; lng: number; estimatedContributingAreaM2: number }>;
    depressions: Array<{ lat: number; lng: number; areaM2: number; maxFillDepthM: number }>;
  };
  limitations: string[];
};

type SatelliteResult = {
  status: "available" | "partial" | "unavailable";
  provider: "Earth Search";
  satellite: "Sentinel-2";
  level: "L2A";
  currentImageUrl: string | null;
  historicalImageUrl: string | null;
  imageBounds: [number, number, number, number] | null;
  imageWidth: number | null;
  imageHeight: number | null;
  geometry: Geometry | null;
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

type DroughtResult = {
  status: "available" | "unavailable";
  provider: "IUNG-PIB";
  category: {
    code: number;
    name: string;
    susceptibility: string;
  } | null;
  previewUrl: string | null;
  categoryPercentages: Record<"1" | "2" | "3" | "4", number>;
  unclassifiedPercentage: number;
  unavailableReason: "classification" | "service" | null;
  precipitation30DaysMm: number | null;
  precipitationDeficitMm: number | null;
  currentRisk: "niski" | "umiarkowany" | "wysoki" | "bardzo wysoki" | "brak danych";
  interpretation: string;
};

type ParcelAnalysisCacheEntry = {
  weather?: WeatherResult;
  soilTexture?: SoilTextureResult;
  terrainFlow?: TerrainFlowResult;
  droughtByCrop: Record<string, DroughtResult>;
  satelliteByCrop: Record<string, SatelliteResult>;
};

export default function Home() {
  const [selectedParcels, setSelectedParcels] = useState<ParcelResult[]>([]);
  const [activeParcelId, setActiveParcelId] = useState<string | null>(null);
  const [isAddingAnother, setIsAddingAnother] = useState(false);
  const [armMultiAfterFirst, setArmMultiAfterFirst] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchError, setSearchError] = useState("");
  const [candidates, setCandidates] = useState<ParcelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [outsidePoland, setOutsidePoland] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState("");

  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [soilTexture, setSoilTexture] = useState<SoilTextureResult | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState("");
  const [terrainFlow, setTerrainFlow] = useState<TerrainFlowResult | null>(null);
  const [terrainFlowLoading, setTerrainFlowLoading] = useState(false);
  const [terrainFlowError, setTerrainFlowError] = useState("");
  const [satellite, setSatellite] = useState<SatelliteResult | null>(null);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState("");
  const [drought, setDrought] = useState<DroughtResult | null>(null);
  const [droughtLoading, setDroughtLoading] = useState(false);
  const [droughtError, setDroughtError] = useState("");
  const [crop, setCrop] = useState("zboza");
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const analysisCacheRef = useRef<Record<string, ParcelAnalysisCacheEntry>>({});
  const activeParcelIdRef = useRef<string | null>(null);

  const requestRef = useRef<AbortController | null>(null);
  const weatherRequestRef = useRef<AbortController | null>(null);
  const soilRequestRef = useRef<AbortController | null>(null);
  const terrainFlowRequestRef = useRef<AbortController | null>(null);
  const satelliteRequestRef = useRef<AbortController | null>(null);
  const droughtRequestRef = useRef<AbortController | null>(null);

  const parcel = useMemo(
    () => selectedParcels.find((item) => item.id === activeParcelId) ?? selectedParcels[0] ?? null,
    [selectedParcels, activeParcelId],
  );

  activeParcelIdRef.current = parcel?.id ?? null;

  const isMultiSelected = selectedParcels.length > 1;
  const shouldAppendOnSelect = isAddingAnother || isMultiSelected || armMultiAfterFirst;

  const multiSummary = useMemo(() => {
    if (selectedParcels.length <= 1) return null;
    const communes = Array.from(new Set(selectedParcels.map((item) => item.commune).filter(Boolean)));
    return {
      communesLabel: communes.length > 0 ? communes.join(", ") : "Brak danych",
    };
  }, [selectedParcels]);

  useEffect(() => () => {
    requestRef.current?.abort();
    weatherRequestRef.current?.abort();
    soilRequestRef.current?.abort();
    terrainFlowRequestRef.current?.abort();
    satelliteRequestRef.current?.abort();
    droughtRequestRef.current?.abort();
  }, []);

  function getCacheEntry(parcelId: string): ParcelAnalysisCacheEntry {
    if (!analysisCacheRef.current[parcelId]) {
      analysisCacheRef.current[parcelId] = { droughtByCrop: {}, satelliteByCrop: {} };
    }
    return analysisCacheRef.current[parcelId];
  }

  async function fetchDrought(
    parcelId: string,
    lat: number,
    lng: number,
    selectedCrop: string,
    precipitation30DaysMm: number | null = null,
    geometry: ParcelResult["geometry"] = null,
  ) {
    droughtRequestRef.current?.abort();
    const controller = new AbortController();
    droughtRequestRef.current = controller;
    if (activeParcelIdRef.current === parcelId) {
      setDroughtLoading(true);
      setDroughtError("");
      setDrought(null);
    }
    try {
      const response = await fetch("/api/drought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, crop: selectedCrop, geometry, precipitation30DaysMm }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych o suszy.");
      const typed = result as DroughtResult;
      getCacheEntry(parcelId).droughtByCrop[selectedCrop] = typed;
      if (activeParcelIdRef.current === parcelId) {
        setDrought(typed);
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError") && activeParcelIdRef.current === parcelId) {
        setDroughtError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych o suszy.");
      }
    } finally {
      if (droughtRequestRef.current === controller) {
        droughtRequestRef.current = null;
        if (activeParcelIdRef.current === parcelId) setDroughtLoading(false);
      }
    }
  }

  async function fetchSatellite(selected: ParcelResult, selectedCrop: string, weatherReady = false) {
    if (selected.lat == null || selected.lng == null) return;
    satelliteRequestRef.current?.abort();
    const controller = new AbortController();
    satelliteRequestRef.current = controller;
    if (activeParcelIdRef.current === selected.id) {
      setSatelliteLoading(true);
      setSatelliteError("");
      setSatellite(null);
    }
    try {
      const response = await fetch("/api/satellite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: selected.lat,
          lng: selected.lng,
          geometry: selected.geometry,
          crop: selectedCrop,
          weatherAvailable: weatherReady || Boolean(getCacheEntry(selected.id).weather),
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych satelitarnych.");
      const typed = result as SatelliteResult;
      getCacheEntry(selected.id).satelliteByCrop[selectedCrop] = typed;
      if (activeParcelIdRef.current === selected.id) {
        setSatellite(typed);
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError") && activeParcelIdRef.current === selected.id) {
        setSatelliteError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych satelitarnych.");
      }
    } finally {
      if (satelliteRequestRef.current === controller) {
        satelliteRequestRef.current = null;
        if (activeParcelIdRef.current === selected.id) setSatelliteLoading(false);
      }
    }
  }

  async function fetchWeather(selected: ParcelResult, selectedCrop = crop) {
    if (selected.lat == null || selected.lng == null) return;
    weatherRequestRef.current?.abort();
    const controller = new AbortController();
    weatherRequestRef.current = controller;
    if (activeParcelIdRef.current === selected.id) {
      setWeatherLoading(true);
      setWeatherError("");
      setWeather(null);
    }

    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: selected.lat, longitude: selected.lng, date }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać danych pogodowych.");
      const weatherResult = result as WeatherResult;
      getCacheEntry(selected.id).weather = weatherResult;
      if (activeParcelIdRef.current === selected.id) {
        setWeather(weatherResult);
      }
      void fetchDrought(
        selected.id,
        selected.lat,
        selected.lng,
        selectedCrop,
        weatherResult.indicators.precipitationSumMm,
        selected.geometry,
      );
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError") && activeParcelIdRef.current === selected.id) {
        setWeatherError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych pogodowych.");
      }
    } finally {
      if (weatherRequestRef.current === controller) {
        weatherRequestRef.current = null;
        if (activeParcelIdRef.current === selected.id) setWeatherLoading(false);
      }
    }
  }

  async function fetchSoilTexture(parcelId: string, lat: number, lng: number) {
    soilRequestRef.current?.abort();
    const controller = new AbortController();
    soilRequestRef.current = controller;
    if (activeParcelIdRef.current === parcelId) {
      setSoilLoading(true);
      setSoilError("");
      setSoilTexture(null);
    }
    try {
      const response = await fetch("/api/soil-texture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się pobrać uziarnienia gleby.");
      const typed = result as SoilTextureResult;
      getCacheEntry(parcelId).soilTexture = typed;
      if (activeParcelIdRef.current === parcelId) {
        setSoilTexture(typed);
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError") && activeParcelIdRef.current === parcelId) {
        setSoilError(reason instanceof Error ? reason.message : "Nie udało się pobrać uziarnienia gleby.");
      }
    } finally {
      if (soilRequestRef.current === controller) {
        soilRequestRef.current = null;
        if (activeParcelIdRef.current === parcelId) setSoilLoading(false);
      }
    }
  }

  async function fetchTerrainFlow(selected: ParcelResult) {
    terrainFlowRequestRef.current?.abort();
    const controller = new AbortController();
    terrainFlowRequestRef.current = controller;
    if (activeParcelIdRef.current === selected.id) {
      setTerrainFlowLoading(true);
      setTerrainFlowError("");
      setTerrainFlow(null);
    }
    try {
      const response = await fetch("/api/terrain-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, lat: selected.lat, lng: selected.lng, geometry: selected.geometry }),
        cache: "no-store",
        signal: controller.signal,
      });
      const responseText = await response.text();
      let result: unknown;
      try {
        result = JSON.parse(responseText) as unknown;
      } catch {
        const contentType = response.headers.get("content-type") ?? "nieznany format";
        throw new Error(`Serwer analizy terenu zwrócił nieoczekiwaną odpowiedź (HTTP ${response.status}, ${contentType}). Możliwy timeout lub błąd endpointu.`);
      }
      if (!response.ok) {
        const serverError = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "Nie udało się obliczyć kierunku spływu.";
        throw new Error(serverError);
      }
      const typed = result as TerrainFlowResult;
      getCacheEntry(selected.id).terrainFlow = typed;
      if (activeParcelIdRef.current === selected.id) {
        setTerrainFlow(typed);
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError") && activeParcelIdRef.current === selected.id) {
        setTerrainFlowError(reason instanceof Error ? reason.message : "Nie udało się obliczyć kierunku spływu.");
      }
    } finally {
      if (terrainFlowRequestRef.current === controller) {
        terrainFlowRequestRef.current = null;
        if (activeParcelIdRef.current === selected.id) setTerrainFlowLoading(false);
      }
    }
  }

  function abortActiveAnalysisRequests() {
    weatherRequestRef.current?.abort();
    weatherRequestRef.current = null;
    soilRequestRef.current?.abort();
    soilRequestRef.current = null;
    terrainFlowRequestRef.current?.abort();
    terrainFlowRequestRef.current = null;
    satelliteRequestRef.current?.abort();
    satelliteRequestRef.current = null;
    droughtRequestRef.current?.abort();
    droughtRequestRef.current = null;
  }

  function resetAnalysisDisplay() {
    abortActiveAnalysisRequests();
    setWeather(null);
    setWeatherError("");
    setWeatherLoading(false);
    setSoilTexture(null);
    setSoilError("");
    setSoilLoading(false);
    setTerrainFlow(null);
    setTerrainFlowError("");
    setTerrainFlowLoading(false);
    setSatellite(null);
    setSatelliteError("");
    setSatelliteLoading(false);
    setDrought(null);
    setDroughtError("");
    setDroughtLoading(false);
  }

  function loadAnalysisForParcel(selected: ParcelResult | null, selectedCrop = crop) {
    abortActiveAnalysisRequests();
    activeParcelIdRef.current = selected?.id ?? null;

    if (!selected) {
      resetAnalysisDisplay();
      return;
    }

    if (selected.lat == null || selected.lng == null) {
      setWeather(null);
      setWeatherError("");
      setWeatherLoading(false);
      setSoilTexture(null);
      setSoilError("Dla tej działki nie udało się wyznaczyć punktu do odczytu gleby.");
      setSoilLoading(false);
      setTerrainFlow(null);
      setTerrainFlowError("Dla tej działki brakuje geometrii do analizy spływu.");
      setTerrainFlowLoading(false);
      setSatellite(null);
      setSatelliteError("");
      setSatelliteLoading(false);
      setDrought(null);
      setDroughtError("");
      setDroughtLoading(false);
      return;
    }

    const cached = getCacheEntry(selected.id);

    if (cached.weather) {
      setWeather(cached.weather);
      setWeatherError("");
      setWeatherLoading(false);
    } else {
      void fetchWeather(selected, selectedCrop);
    }

    if (cached.soilTexture) {
      setSoilTexture(cached.soilTexture);
      setSoilError("");
      setSoilLoading(false);
    } else {
      void fetchSoilTexture(selected.id, selected.lat, selected.lng);
    }

    if (cached.terrainFlow) {
      setTerrainFlow(cached.terrainFlow);
      setTerrainFlowError("");
      setTerrainFlowLoading(false);
    } else {
      void fetchTerrainFlow(selected);
    }

    const cachedSatellite = cached.satelliteByCrop[selectedCrop];
    if (cachedSatellite) {
      setSatellite(cachedSatellite);
      setSatelliteError("");
      setSatelliteLoading(false);
    } else {
      void fetchSatellite(selected, selectedCrop, Boolean(cached.weather));
    }

    const cachedDrought = cached.droughtByCrop[selectedCrop];
    if (cachedDrought) {
      setDrought(cachedDrought);
      setDroughtError("");
      setDroughtLoading(false);
    } else if (cached.weather) {
      void fetchDrought(
        selected.id,
        selected.lat,
        selected.lng,
        selectedCrop,
        cached.weather.indicators.precipitationSumMm,
        selected.geometry,
      );
    } else {
      void fetchDrought(selected.id, selected.lat, selected.lng, selectedCrop, null, selected.geometry);
    }
  }

  function switchActiveParcelById(parcelId: string) {
    setDuplicateNotice("");
    setActiveParcelId(parcelId);
    const target = selectedParcels.find((item) => item.id === parcelId) ?? null;
    if (!isAddingAnother && target && selectedParcels.length === 1) {
      setSearchText(target.id);
    }
    loadAnalysisForParcel(target, crop);
  }

  function startAddingAnotherParcel() {
    setDuplicateNotice("");
    setError("");
    setSearchError("");
    setCandidates([]);
    if (selectedParcels.length === 0) {
      setArmMultiAfterFirst(true);
      searchInputRef.current?.focus();
      return;
    }
    setIsAddingAnother(true);
    setSearchText("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function cancelAddingAnotherParcel() {
    setIsAddingAnother(false);
    setArmMultiAfterFirst(false);
    setSearchError("");
    setCandidates([]);
    if (selectedParcels.length === 1) {
      setSearchText(selectedParcels[0].id);
    } else {
      setSearchText("");
    }
  }

  function removeParcelById(parcelId: string) {
    setDuplicateNotice("");
    setError("");
    const remaining = selectedParcels.filter((item) => item.id !== parcelId);
    setSelectedParcels(remaining);

    if (remaining.length === 0) {
      setActiveParcelId(null);
      setIsAddingAnother(false);
      setArmMultiAfterFirst(false);
      setSearchText("");
      setActiveScenario(null);
      resetAnalysisDisplay();
      return;
    }

    if (remaining.length === 1 && !isAddingAnother) {
      setSearchText(remaining[0].id);
    }

    if (activeParcelId === parcelId) {
      const next = remaining[0];
      setActiveParcelId(next.id);
      loadAnalysisForParcel(next, crop);
    }
    setMapFocus(null);
  }

  function commitSelectedParcel(selected: ParcelResult, selectedCrop = crop) {
    const appendMode = isAddingAnother || selectedParcels.length > 1 || armMultiAfterFirst;

    if (appendMode && selectedParcels.some((item) => item.id === selected.id)) {
      const msg = `Działka ${selected.parcel} (${selected.id}) jest już na liście wybranych działek.`;
      setDuplicateNotice(msg);
      setSearchError(msg);
      setLoading(false);
      return;
    }

    setDuplicateNotice("");
    setError("");
    setOutsidePoland(false);
    setSearchError("");
    setCandidates([]);
    setLoading(false);

    if (selectedParcels.length === 0 && armMultiAfterFirst) {
      setSelectedParcels([selected]);
      setActiveParcelId(selected.id);
      setArmMultiAfterFirst(false);
      setIsAddingAnother(true);
      setSearchText("");
      loadAnalysisForParcel(selected, selectedCrop);
      return;
    }

    if (appendMode) {
      const nextList = [...selectedParcels, selected];
      setSelectedParcels(nextList);
      setActiveParcelId(selected.id);
      setIsAddingAnother(false);
      setSearchText("");
      setMapFocus(null);
      loadAnalysisForParcel(selected, selectedCrop);
      return;
    }

    setSelectedParcels([selected]);
    setActiveParcelId(selected.id);
    setSearchText(selected.id);
    loadAnalysisForParcel(selected, selectedCrop);
  }

  function handleMapParcelClick(clickedParcel: ParcelResult) {
    if (isAddingAnother) {
      setDuplicateNotice(`Działka ${clickedParcel.parcel} (${clickedParcel.id}) jest już wybrana — wskaż inną działkę na mapie.`);
      return;
    }
    if (selectedParcels.length > 1) {
      switchActiveParcelById(clickedParcel.id);
    }
  }

  async function selectPoint(lat: number, lng: number, selectedCrop = crop, scenarioId: string | null = null) {
    const appendMode = isAddingAnother || selectedParcels.length > 1 || armMultiAfterFirst;
    setActiveScenario(scenarioId);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError("");
    setOutsidePoland(false);
    setDuplicateNotice("");
    setSearchError("");
    setCandidates([]);

    if (!appendMode) {
      setSelectedParcels([]);
      setActiveParcelId(null);
      resetAnalysisDisplay();
    }

    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (result.code === "outside-poland") setOutsidePoland(true);
      if (!response.ok) throw new Error(result.error ?? "Nie udało się znaleźć działki.");
      const found = result as ParcelResult;

      if (appendMode && selectedParcels.some((item) => item.id === found.id)) {
        setDuplicateNotice(`Działka ${found.parcel} (${found.id}) jest już na liście wybranych działek.`);
        return;
      }

      commitSelectedParcel(found, selectedCrop);
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setActiveScenario(null);
        setError(reason instanceof Error ? reason.message : "Wystąpił nieznany błąd.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  async function searchParcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = searchText.trim();
    if (!identifier) {
      setSearchError("Wpisz identyfikator działki.");
      return;
    }
    await loadParcelByIdentifier(identifier);
  }

  async function loadParcelByIdentifier(identifier: string, selectedCrop = crop, scenarioId: string | null = null) {
    const appendMode = isAddingAnother || selectedParcels.length > 1 || armMultiAfterFirst;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError("");
    setDuplicateNotice("");
    setSearchError("");
    setActiveScenario(scenarioId);
    setCandidates([]);

    if (!appendMode) {
      setSelectedParcels([]);
      setActiveParcelId(null);
      resetAnalysisDisplay();
    }

    try {
      const response = await fetch("/api/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Nie udało się znaleźć działki.");
      const matches = result.parcels as ParcelResult[];
      const exact = matches.find((match) => match.id === identifier);
      if (exact) {
        commitSelectedParcel(exact, selectedCrop);
      } else if (matches.length === 1) {
        commitSelectedParcel(matches[0], selectedCrop);
      } else {
        setCandidates(matches);
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setActiveScenario(null);
        setSearchError(reason instanceof Error ? reason.message : "Wystąpił nieznany błąd.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function openScenario(scenario: DemoScenario) {
    const appendMode = isAddingAnother || selectedParcels.length > 1 || armMultiAfterFirst;
    if (appendMode && scenario.parcelId && selectedParcels.some((item) => item.id === scenario.parcelId)) {
      setDuplicateNotice(`Działka ${scenario.parcelId} ze scenariusza demo jest już wybrana.`);
      return;
    }

    setCrop(scenario.crop);
    if (!appendMode && selectedParcels.length === 0) {
      setMapFocus({ lat: scenario.lat, lng: scenario.lng, zoom: 16, token: Date.now() });
    } else if (!appendMode) {
      setMapFocus({ lat: scenario.lat, lng: scenario.lng, zoom: 16, token: Date.now() });
    } else {
      setMapFocus(null);
    }

    if (scenario.parcelId) {
      setSearchText(scenario.parcelId);
      void loadParcelByIdentifier(scenario.parcelId, scenario.crop, scenario.id);
    } else {
      void selectPoint(scenario.lat, scenario.lng, scenario.crop, scenario.id);
    }
  }

  const showSearchInput = selectedParcels.length <= 1 || isAddingAnother;

  return (
    <main className={`app-shell${selectedParcels.length > 0 ? " parcel-selected" : ""}`}>
      <header className="hero">
        <div>
          <div className="hero-brand">
            <BrandLogo className="hero-logo" />
            <div>
              <p className="eyebrow">TWÓJ ASYSTENT WODNY</p>
              <h1 className="brand-name">Ziemowit</h1>
              <p className="brand-slogan">Grunt to <span>nawodnienie</span></p>
            </div>
          </div>
          <p className="intro hero-intro">Sprawdź, ile wody ma Twoja działka i co zrobić, żeby jej nie stracić. Wpisz numer działki lub kliknij na mapie.</p>
        </div>
        <div className="hero-side">
          <div className="demo-scenarios">
            <p className="demo-scenarios-label" id="demo-scenarios-label">SCENARIUSZE DEMO</p>
            <div className="demo-scenarios-grid" role="group" aria-labelledby="demo-scenarios-label">
              {DEMO_SCENARIOS.map((scenario) => {
                const alreadySelected = Boolean(
                  shouldAppendOnSelect
                  && scenario.parcelId
                  && selectedParcels.some((item) => item.id === scenario.parcelId),
                );
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    className={`demo-scenario demo-scenario-${scenario.tone}`}
                    aria-pressed={activeScenario === scenario.id}
                    aria-label={scenario.label}
                    disabled={alreadySelected}
                    title={alreadySelected ? "Ta działka jest już na liście wybranych działek" : undefined}
                    onClick={() => openScenario(scenario)}
                  >
                    <span className="demo-scenario-kicker">{scenario.problem}</span>
                    <strong>{scenario.region}</strong>
                    <small>{scenario.detail}</small>
                    {scenario.parcelId && (
                      <small className="demo-scenario-parcel">
                        Działka {scenario.parcelId}{alreadySelected ? " (wybrana)" : ""}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>
      <section className="workspace" aria-label="Wybór działki">
        <div className="map-column">
          <div className="map-heading">
            <div>
              <h2>Wybierz działkę</h2>
              <p>
                {isAddingAnother
                  ? "Kliknij na mapie kolejną działkę, aby dodać ją do zestawu, albo wyszukaj ją po numerze obok."
                  : isMultiSelected
                    ? `Zaznaczono ${polishParcelsCount(selectedParcels.length)}. Kliknij wybrany poligon, aby przełączyć podgląd, albo wskaż kolejną działkę.`
                    : "Kliknij w granicach działki albo wybierz scenariusz demo powyżej."}
              </p>
            </div>
            <div className="map-heading-actions">
              {selectedParcels.length > 0 && !isAddingAnother && (
                <button
                  type="button"
                  className="map-add-parcel-btn"
                  onClick={startAddingAnotherParcel}
                >
                  + Dodaj kolejną działkę
                </button>
              )}
              <span className={`map-hint${isAddingAnother ? " map-hint-active" : ""}`}>
                {isAddingAnother ? "⌖ Wskaż kolejną działkę" : "⌖ Kliknij punkt na mapie"}
              </span>
            </div>
          </div>
          {duplicateNotice && (
            <div className="duplicate-notice" role="status">
              <span>{duplicateNotice}</span>
              <button type="button" onClick={() => setDuplicateNotice("")} aria-label="Zamknij komunikat">×</button>
            </div>
          )}
          <ParcelMap
            onSelectPoint={selectPoint}
            onSelectParcel={handleMapParcelClick}
            parcel={parcel}
            parcels={selectedParcels}
            activeParcelId={parcel?.id ?? null}
            fitTrigger={fitTrigger}
            focus={isMultiSelected ? null : mapFocus}
          />
          <p className="attribution-note">Dane działek: GUGiK, ULDK. Podkład mapy: © OpenStreetMap.</p>

          {isMultiSelected && (
            <div className="analysis-parcel-switcher" role="region" aria-label="Przełączanie podglądu szczegółowego działki">
              <div className="analysis-switcher-head">
                <span className="weather-kicker">PODGLĄD SZCZEGÓŁOWY ANALIZY</span>
                <button
                  type="button"
                  className="fit-all-link"
                  onClick={() => {
                    setMapFocus(null);
                    setFitTrigger((value) => value + 1);
                  }}
                >
                  Pokaż wszystkie na mapie ({selectedParcels.length})
                </button>
              </div>
              <div className="parcel-pills" role="tablist" aria-label="Wybrane działki">
                {selectedParcels.map((item, idx) => {
                  const isActive = parcel?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`parcel-pill${isActive ? " active" : ""}`}
                      onClick={() => switchActiveParcelById(item.id)}
                    >
                      <span className="parcel-pill-index">#{idx + 1}</span>
                      <strong>Dz. {item.parcel}</strong>
                      {item.commune && <small>{item.commune}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        <aside className="details-panel" aria-live="polite">
          <div className="panel-heading">
            <div className="panel-icon" aria-hidden="true">▧</div>
            <h2>{isMultiSelected ? `Wybrane działki (${selectedParcels.length})` : "Wybrana działka"}</h2>
          </div>

          <div className="parcel-selector-section">
            {(isMultiSelected || (selectedParcels.length === 1 && isAddingAnother)) && (
              <div className="selected-parcels-box" aria-label="Lista aktualnie wybranych działek">
                <div className="selected-parcels-head">
                  <span>Wybrane ({selectedParcels.length})</span>
                  {isMultiSelected && (
                    <button
                      type="button"
                      className="fit-all-link"
                      onClick={() => {
                        setMapFocus(null);
                        setFitTrigger((value) => value + 1);
                      }}
                    >
                      Pokaż całość
                    </button>
                  )}
                </div>
                <div className="selected-parcel-chips">
                  {selectedParcels.map((item) => {
                    const isActive = parcel?.id === item.id;
                    return (
                      <div key={item.id} className={`selected-parcel-chip${isActive ? " active" : ""}`}>
                        <button
                          type="button"
                          className="selected-parcel-chip-select"
                          onClick={() => switchActiveParcelById(item.id)}
                          title={`Pokaż szczegóły działki ${item.parcel} (${item.id})`}
                        >
                          <strong>Dz. {item.parcel}</strong>
                          {item.commune && <small>{item.commune}</small>}
                        </button>
                        {(selectedParcels.length > 1 || isAddingAnother) && (
                          <button
                            type="button"
                            className="selected-parcel-chip-remove"
                            onClick={() => removeParcelById(item.id)}
                            aria-label={`Usuń działkę ${item.parcel}`}
                            title="Usuń działkę"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {multiSummary && !isAddingAnother && (
                  <p className="multi-summary-note">
                    Gminy: <strong>{multiSummary.communesLabel}</strong>
                  </p>
                )}
              </div>
            )}

            {showSearchInput && (
              <div className={isAddingAnother ? "parcel-slot parcel-slot-multi parcel-slot-active" : "parcel-slot"}>
                <form className="parcel-search" onSubmit={searchParcel}>
                  <div className="parcel-slot-header">
                    <label htmlFor="parcel-identifier">
                      {isAddingAnother
                        ? `Kolejna działka (#${selectedParcels.length + 1})`
                        : armMultiAfterFirst
                          ? "Pierwsza działka z zestawu"
                          : "Znajdź działkę po numerze"}
                    </label>
                    {(isAddingAnother || armMultiAfterFirst) && (
                      <button
                        type="button"
                        className="slot-remove-btn"
                        onClick={cancelAddingAnotherParcel}
                        aria-label="Anuluj dodawanie kolejnej działki"
                        title="Anuluj dodawanie"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="search-controls">
                    <input
                      id="parcel-identifier"
                      ref={searchInputRef}
                      value={searchText}
                      onChange={(event) => {
                        setSearchText(event.target.value);
                        setSearchError("");
                      }}
                      placeholder={isAddingAnother ? "Wpisz nr lub kliknij na mapie" : "np. Krzewina 134 lub pełny ID"}
                      autoComplete="off"
                    />
                    <button type="submit" disabled={loading} aria-label="Szukaj działki">
                      {loading ? "…" : "Szukaj"}
                    </button>
                  </div>
                  {armMultiAfterFirst && selectedParcels.length === 0 && (
                    <p className="search-help">
                      Wybierz pierwszą działkę na mapie lub po numerze, a od razu dodasz kolejną.
                    </p>
                  )}
                  {searchError && <p className="search-error" role="alert">{searchError}</p>}
                </form>

                {candidates.length > 0 && (
                  <div className="candidate-list" aria-live="polite">
                    <p>Znaleziono kilka działek. Wybierz właściwą:</p>
                    {candidates.map((candidate) => {
                      const alreadyChosen = shouldAppendOnSelect && selectedParcels.some((item) => item.id === candidate.id);
                      return (
                        <button
                          type="button"
                          className={`candidate-option${alreadyChosen ? " candidate-option-disabled" : ""}`}
                          key={candidate.id}
                          disabled={alreadyChosen}
                          onClick={() => commitSelectedParcel(candidate)}
                        >
                          <div className="candidate-option-head">
                            <strong>{candidate.parcel}</strong>
                            {alreadyChosen && <em className="candidate-taken-badge">Już wybrana</em>}
                          </div>
                          <span>{[candidate.commune, candidate.county, candidate.voivodeship].filter(Boolean).join(", ")}</span>
                          <small>{candidate.id}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!isAddingAnother && (
              <button
                type="button"
                className="add-parcel-button"
                onClick={startAddingAnotherParcel}
              >
                + Dodaj kolejną działkę
              </button>
            )}
          </div>

          <div className="crop-select">
            <label htmlFor="crop-type">Aktualna uprawa</label>
            <select
              id="crop-type"
              value={crop}
              onChange={(event) => {
                const nextCrop = event.target.value;
                setCrop(nextCrop);
                if (parcel) {
                  loadAnalysisForParcel(parcel, nextCrop);
                }
              }}
            >
              <option value="zboza">Zboża</option>
              <option value="rzepak">Rzepak</option>
              <option value="ziemniaki">Ziemniaki</option>
              <option value="buraki">Buraki</option>
              <option value="kukorydza">Kukurydza</option>
              <option value="owoce">Owoce i sad</option>
              <option value="warzywa">Warzywa</option>
              <option value="inna">Inna uprawa</option>
            </select>
          </div>

          {loading && selectedParcels.length === 0 ? (
            <div className="status-message"><span className="spinner" /> Sprawdzam działkę…</div>
          ) : candidates.length > 0 && selectedParcels.length === 0 ? (
            <div className="empty-state"><p>Wybierz działkę z listy powyżej, aby wyświetlić jej granice na mapie.</p></div>
          ) : parcel ? (
            <>
              {loading && (
                <div className="status-message status-message-compact"><span className="spinner" /> Wczytuję kolejną działkę…</div>
              )}
              <div className="parcel-summary-header">
                <div>
                  {isMultiSelected && <span className="active-parcel-kicker">PODGLĄD DZIAŁKI</span>}
                  <p className="parcel-number">{parcel.parcel}</p>
                </div>
                <div className="selected-badge selected-badge-inline">
                  <span />
                  {isMultiSelected ? polishParcelsCount(selectedParcels.length) : "Na mapie"}
                </div>
              </div>
              <dl className="parcel-data parcel-data-compact">
                <div className="parcel-data-wide"><dt>Identyfikator</dt><dd>{parcel.id}</dd></div>
                <div><dt>Gmina</dt><dd>{parcel.commune || "Brak danych"}</dd></div>
                <div><dt>Powiat</dt><dd>{parcel.county || "Brak danych"}</dd></div>
                <div><dt>Województwo</dt><dd>{parcel.voivodeship || "Brak danych"}</dd></div>
                {parcel.lat != null && parcel.lng != null && (
                  <div><dt>Współrzędne</dt><dd>{parcel.lat.toFixed(4)}, {parcel.lng.toFixed(4)}</dd></div>
                )}
              </dl>
              <a className="report-button" href={reportUrl(selectedParcels, crop)} target="_blank" rel="noopener">
                {isMultiSelected
                  ? `Otwórz wspólny raport zbiorczy (${polishParcelsCount(selectedParcels.length)})`
                  : "Otwórz raport wodny działki"}{" "}
                <span aria-hidden="true">→</span>
              </a>
              <p className="report-button-help">
                {isMultiSelected
                  ? `W nowej karcie: raport łączony oraz karty dla wszystkich ${selectedParcels.length} działek.`
                  : "W nowej karcie: pogoda, hydrologia i wskaźniki Sentinel-2 (NDVI)."}
              </p>
            </>
          ) : (
            <>
              {error && <div className="error-message" role="alert"><strong>{outsidePoland ? "Punkt poza granicami Polski" : "Nie udało się wybrać działki"}</strong><p>{error}</p></div>}
              {candidates.length === 0 && (
                <section className="guide-card" aria-label="Jak przygotować raport">
                  <div>
                    <h3>Jak to działa</h3>
                    <ol className="guide-steps">
                      <li>
                        <GuideIcon><path d="M12 21c0-6 4-9 9-10-1 7-5 10-9 10z" /><path d="M12 21C12 14 7 9 3 8c1 7 5 11 9 13z" /></GuideIcon>
                        <span>Wybierz uprawę z listy powyżej.</span>
                      </li>
                      <li>
                        <GuideIcon><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.2" /></GuideIcon>
                        <span>Kliknij działkę na mapie lub wpisz numer.</span>
                      </li>
                      <li>
                        <GuideIcon><path d="M7 3.5h7.2L19 8.2V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5z" /><path d="M14 3.5V8h4.5M8.5 13h7M8.5 17h4.5" /></GuideIcon>
                        <span>Odbierz raport retencyjny i zalecenia.</span>
                      </li>
                    </ol>
                  </div>
                  <div>
                    <h3>Co zawiera raport</h3>
                    <ul className="guide-badges">
                      <li><i className="guide-dot" aria-hidden="true" />Bilans opadów</li>
                      <li><i className="guide-dot guide-dot-soil" aria-hidden="true" />Wilgotność gleby</li>
                      <li><i className="guide-dot guide-dot-water" aria-hidden="true" />Wodowskazy</li>
                    </ul>
                  </div>
                </section>
              )}
            </>
          )}
        </aside>
      </section>
      <footer><strong>Ziemowit</strong> · grunt to nawodnienie. Wynik lokalizacji ma charakter informacyjny.</footer>
    </main>
  );
}

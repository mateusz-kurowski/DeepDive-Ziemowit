import { NextRequest } from "next/server";

type DailyResponse = {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    temperature_2m_mean?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
  };
  daily_units?: Record<string, string>;
  timezone?: string;
  elevation?: number;
};

type WeatherResult = {
  location: { latitude: number; longitude: number };
  date: string;
  source: {
    provider: "Open-Meteo";
    endpoint: "archive" | "forecast";
    fetchedAt: string;
  };
  coverage: {
    start: string;
    end: string;
    daysRequested: number;
    daysAvailable: number;
  };
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
    yearsRequested: number;
    yearsAvailable: number;
    averagePrecipitationMm: number | null;
    medianPrecipitationMm: number | null;
    selectedPrecipitationMm: number | null;
    differenceMm: number | null;
    differencePercent: number | null;
    averageTemperatureC: number | null;
    assessment: string;
    limitation: string | null;
  };
  limitations: string[];
};

const cache = new Map<string, { expiresAt: number; value: WeatherResult }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function validCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

async function fetchWithRetry(url: URL): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      if (response.ok) return response;

      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Open-Meteo zwróciło HTTP ${response.status}`);
      }

      lastError = new Error(`Open-Meteo zwróciło HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Nieznany błąd API");
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Nie udało się pobrać danych Open-Meteo");
}

function mean(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (!available.length) return null;
  return Number((available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(1));
}

function longestDrySpell(precipitation: Array<number | null>): number | null {
  if (!precipitation.length || precipitation.every((value) => value === null)) return null;

  let longest = 0;
  let current = 0;
  for (const value of precipitation) {
    if (value !== null && value < 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function sumAvailable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (!available.length) return null;
  return Number(available.reduce((sum, value) => sum + value, 0).toFixed(1));
}

function windowDateInYear(selectedDate: Date, yearOffset: number): Date {
  const year = selectedDate.getUTCFullYear() - yearOffset;
  const month = selectedDate.getUTCMonth();
  const day = selectedDate.getUTCDate();
  const date = new Date(Date.UTC(year, month, day));

  if (date.getUTCMonth() !== month) {
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return date;
}

async function getHistoricalSummary(
  latitude: number,
  longitude: number,
  selectedDate: Date,
  selectedPrecipitation: number | null,
  selectedTemperature: number | null,
): Promise<WeatherResult["historicalSummary"]> {
  const unavailability = (limitation: string): WeatherResult["historicalSummary"] => ({
    status: "unavailable",
    yearsRequested: 10,
    yearsAvailable: 0,
    averagePrecipitationMm: null,
    medianPrecipitationMm: null,
    selectedPrecipitationMm: selectedPrecipitation,
    differenceMm: null,
    differencePercent: null,
    averageTemperatureC: null,
    assessment: "Podsumowanie historyczne jest niedostępne.",
    limitation,
  });

  if (selectedPrecipitation === null) {
    return unavailability("Brak bieżących opadów potrzebnych do porównania historycznego.");
  }

  const archiveStart = shiftDate(windowDateInYear(selectedDate, 9), -29);
  const archiveEnd = selectedDate;
  const archiveUrl = new URL("https://archive-api.open-meteo.com/v1/archive");
  archiveUrl.searchParams.set("latitude", String(latitude));
  archiveUrl.searchParams.set("longitude", String(longitude));
  archiveUrl.searchParams.set("start_date", toIsoDate(archiveStart));
  archiveUrl.searchParams.set("end_date", toIsoDate(archiveEnd));
  archiveUrl.searchParams.set("daily", "precipitation_sum,temperature_2m_mean");
  archiveUrl.searchParams.set("timezone", "Europe/Warsaw");

  try {
    const response = await fetchWithRetry(archiveUrl);
    const payload = (await response.json()) as DailyResponse;
    const dates = payload.daily?.time ?? [];
    const precipitationByDate = new Map<string, number | null>();
    const temperatureByDate = new Map<string, number | null>();

    dates.forEach((date, index) => {
      precipitationByDate.set(date, payload.daily?.precipitation_sum?.[index] ?? null);
      temperatureByDate.set(date, payload.daily?.temperature_2m_mean?.[index] ?? null);
    });

    const historicalWindows: Array<{ precipitation: number | null; temperature: number | null }> = [];
    for (let yearOffset = 1; yearOffset <= 9; yearOffset += 1) {
      const windowEnd = windowDateInYear(selectedDate, yearOffset);
      const windowStart = shiftDate(windowEnd, -29);
      const precipitationValues: Array<number | null> = [];
      const temperatureValues: Array<number | null> = [];

      for (let day = 0; day < 30; day += 1) {
        const date = toIsoDate(shiftDate(windowStart, day));
        precipitationValues.push(precipitationByDate.get(date) ?? null);
        temperatureValues.push(temperatureByDate.get(date) ?? null);
      }

      historicalWindows.push({
        precipitation: sumAvailable(precipitationValues),
        temperature: sumAvailable(temperatureValues) === null
          ? null
          : mean(temperatureValues),
      });
    }

    const precipitationValues = historicalWindows
      .map((window) => window.precipitation)
      .filter((value): value is number => value !== null);
    const temperatureValues = historicalWindows
      .map((window) => window.temperature)
      .filter((value): value is number => value !== null);

    if (!precipitationValues.length) {
      return unavailability("Archiwum nie zawiera kompletnych serii opadów.");
    }

    const average = Number(
      (precipitationValues.reduce((sum, value) => sum + value, 0) / precipitationValues.length).toFixed(1),
    );
    const medianPrecipitation = median(precipitationValues);
    const difference = Number((selectedPrecipitation - average).toFixed(1));
    const differencePercent = average === 0
      ? null
      : Number(((difference / average) * 100).toFixed(1));
    const averageTemperature = mean(temperatureValues);

    let assessment = "Okres jest zbliżony do wartości historycznych.";
    if (differencePercent !== null && differencePercent <= -20) {
      assessment = "W analizowanym okresie opady są wyraźnie niższe niż historyczna średnia.";
    } else if (differencePercent !== null && differencePercent >= 20) {
      assessment = "W analizowanym okresie opady są wyraźnie wyższe niż historyczna średnia.";
    }

    return {
      status: precipitationValues.length >= 6 ? "available" : "partial",
      yearsRequested: 10,
      yearsAvailable: precipitationValues.length + 1,
      averagePrecipitationMm: average,
      medianPrecipitationMm: medianPrecipitation,
      selectedPrecipitationMm: selectedPrecipitation,
      differenceMm: difference,
      differencePercent,
      averageTemperatureC:
        selectedTemperature === null
          ? averageTemperature
          : averageTemperature,
      assessment,
      limitation:
        precipitationValues.length < 9
          ? "Część lat ma brakujące dane i nie została uwzględniona w porównaniu."
          : null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Nieznana awaria archiwum.";
    return unavailability(`Dane historyczne niedostępne: ${detail}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const date = typeof body.date === "string" ? body.date : "";

    if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
      return Response.json({ error: "Podaj poprawne współrzędne." }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "Podaj datę w formacie YYYY-MM-DD." }, { status: 400 });
    }

    const selectedDate = parseDate(date);
    if (Number.isNaN(selectedDate.getTime()) || toIsoDate(selectedDate) !== date) {
      return Response.json({ error: "Niepoprawna data." }, { status: 400 });
    }

    const today = parseDate(toIsoDate(new Date()));
    const tenYearsAgo = shiftDate(today, -10 * 365);
    if (selectedDate < tenYearsAgo || selectedDate > today) {
      return Response.json(
        { error: "Data musi mieścić się w okresie ostatnich 10 lat i nie może być z przyszłości." },
        { status: 400 },
      );
    }

    const start = toIsoDate(shiftDate(selectedDate, -29));
    const cacheKey = `${latitude.toFixed(4)}:${longitude.toFixed(4)}:${date}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.value);
    }

    const useForecast = shiftDate(today, -92) <= selectedDate;
    const endpoint = useForecast ? "forecast" : "archive";
    const url = new URL(
      useForecast
        ? "https://api.open-meteo.com/v1/forecast"
        : "https://archive-api.open-meteo.com/v1/archive",
    );
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("daily", "precipitation_sum,temperature_2m_mean,temperature_2m_max");
    url.searchParams.set("timezone", "Europe/Warsaw");

    if (useForecast) {
      url.searchParams.set("past_days", "92");
      url.searchParams.set("forecast_days", "1");
    } else {
      url.searchParams.set("start_date", start);
      url.searchParams.set("end_date", date);
    }

    const response = await fetchWithRetry(url);
    const payload = (await response.json()) as DailyResponse;
    const dates = payload.daily?.time ?? [];

    const series = dates.map((seriesDate, index) => ({
      date: seriesDate,
      precipitationMm: payload.daily?.precipitation_sum?.[index] ?? null,
      meanTemperatureC: payload.daily?.temperature_2m_mean?.[index] ?? null,
      maxTemperatureC: payload.daily?.temperature_2m_max?.[index] ?? null,
    })).filter((item) => item.date >= start && item.date <= date);

    const precipitation = series.map((item) => item.precipitationMm);
    const meanTemperatures = series.map((item) => item.meanTemperatureC);
    const maxTemperatures = series.map((item) => item.maxTemperatureC);
    const precipitationAvailable = precipitation.filter((value): value is number => value !== null);
    const precipitationSum = precipitationAvailable.length
      ? Number(precipitationAvailable.reduce((sum, value) => sum + value, 0).toFixed(1))
      : null;
    const historicalSummary = await getHistoricalSummary(
      latitude,
      longitude,
      selectedDate,
      precipitationSum,
      mean(meanTemperatures),
    );

    const result: WeatherResult = {
      location: { latitude, longitude },
      date,
      source: {
        provider: "Open-Meteo",
        endpoint,
        fetchedAt: new Date().toISOString(),
      },
      coverage: {
        start,
        end: date,
        daysRequested: 30,
        daysAvailable: series.length,
      },
      indicators: {
        precipitationSumMm: precipitationSum,
        averageTemperatureC: mean(meanTemperatures),
        maximumTemperatureC: mean(maxTemperatures) === null
          ? null
          : Math.max(...maxTemperatures.filter((value): value is number => value !== null)),
        longestDrySpellDays: longestDrySpell(precipitation),
        precipitationShortfallMm:
          precipitationSum === null ? null : Number(Math.max(0, 30 - precipitationSum).toFixed(1)),
      },
      series,
      historicalSummary,
      limitations: [
        "Współrzędna jest reprezentatywną lokalizacją punktową, nie granicami działki.",
        "Progowy wskaźnik niedoboru 30 mm nie jest oficjalną kategorią suszy IUNG.",
        "Wynik nie zastępuje pomiarów gleby ani lokalnych zasobów wodnych.",
      ],
    };

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieznany błąd.";
    return Response.json(
      {
        error: "Dane meteorologiczne chwilowo niedostępne.",
        detail: message,
      },
      { status: 503 },
    );
  }
}

// Maps the engine's weather payload to the frontend's WeatherContext (src/types/resident.ts).
// Open-Meteo's past hours are model estimates, not rain-gauge observations, so
// observedRainfall6hMm stays null: forecast or modelled rain is never shown as observed.
import type { WeatherResponse } from "../../risk-engine/src/index.ts";

export type WeatherDataStatus = "available" | "stale" | "unavailable" | "insufficient_data";

export interface WeatherContext {
  status: WeatherDataStatus;
  provider: string | null;
  retrievedAt: string | null;
  observedRainfall6hMm: number | null;
  forecastRainfall24hMm: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  staleLimitHours: number | null;
  message: string | null;
  isDemoData: boolean;
  /** Extra fields beyond the current frontend type (safe to ignore). */
  forecast?: WeatherResponse["next24h"];
  current?: WeatherResponse["current"];
  floodRelevance?: string;
  attribution?: string;
}

export const WEATHER_STALE_LIMIT_H = 6;

export function toWeatherContext(w: WeatherResponse | null, now: string, reason?: string): WeatherContext {
  if (!w) {
    return {
      status: "unavailable", provider: null, retrievedAt: null, observedRainfall6hMm: null, forecastRainfall24hMm: null,
      temperatureC: null, humidityPct: null, staleLimitHours: WEATHER_STALE_LIMIT_H,
      message: reason ?? "Weather data is not available for this community right now.", isDemoData: false,
    };
  }
  const ageH = (Date.parse(now) - Date.parse(w.retrievedAt)) / 3_600_000;
  const stale = w.stale || ageH > WEATHER_STALE_LIMIT_H;
  return {
    status: stale ? "stale" : "available",
    provider: w.source,
    retrievedAt: w.retrievedAt,
    observedRainfall6hMm: null,
    forecastRainfall24hMm: w.next24h.totalMm,
    temperatureC: w.current.temperatureC,
    humidityPct: null,
    staleLimitHours: WEATHER_STALE_LIMIT_H,
    message: stale
      ? "This forecast is out of date. It is shown for reference only."
      : `Forecast for the area (model grid about ${w.gridResolutionKm} km), not a measurement in the community. ${w.floodRelevance}`,
    isDemoData: false,
    forecast: w.next24h,
    current: w.current,
    floodRelevance: w.floodRelevance,
    attribution: w.attribution,
  };
}

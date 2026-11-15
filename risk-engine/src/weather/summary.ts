// Builds the resident-facing weather response (GET /api/communities/{id}/weather) from the
// same forecast bundle the risk engine consumes, so the two can never disagree.
import { INTENSITY_BANDS } from "../engine/config.ts";
import { describePercentile } from "../engine/factors.ts";
import type { Climatology } from "../engine/types.ts";
import { maxRolling, type ForecastBundle, type HourlyPoint } from "../providers/openMeteo.ts";

export type Intensity = "none" | "light" | "moderate" | "heavy" | "violent";

export function classifyIntensity(mmPerHour: number): Intensity {
  if (!(mmPerHour > 0.1)) return "none";
  if (mmPerHour < INTENSITY_BANDS.light) return "light";
  if (mmPerHour < INTENSITY_BANDS.moderate) return "moderate";
  if (mmPerHour < INTENSITY_BANDS.heavy) return "heavy";
  return "violent";
}

/** WMO weather interpretation codes used by Open-Meteo. */
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  80: "Light showers", 81: "Showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};
export const describeWeatherCode = (c: number | null) => (c == null ? "Unknown" : WMO[c] ?? `WMO code ${c}`);

export interface WeatherResponse {
  communityId: string;
  source: string;
  retrievedAt: string;
  gridResolutionKm: number;
  gridPoint: { lat: number; lon: number };
  isLocalMeasurement: false;
  stale: boolean;
  current: { time: string; temperatureC: number | null; precipitationMm: number | null; weatherCode: number | null; description: string };
  next24h: {
    rainExpected: boolean;
    totalMm: number;
    maxProbabilityPct: number | null;
    peakIntensity: Intensity;
    peakMmPerHour: number;
    window: { from: string; to: string } | null;
  };
  hourly: { time: string; precipitationMm: number; probabilityPct: number | null; intensity: Intensity }[];
  daily: { date: string; totalMm: number; maxProbabilityPct: number | null }[];
  floodRelevance: string;
  attribution: string;
}

const RAIN_MM = 0.2; // below this an hour counts as dry
const STALE_H = 6;

export function buildWeatherResponse(communityId: string, b: ForecastBundle, now: string, clim: Climatology | null): WeatherResponse {
  const nowMs = Date.parse(now);
  const future = b.hourly.filter((p) => Date.parse(p.time) > nowMs - 3_600_000);
  const next24 = future.filter((p) => Date.parse(p.time) <= nowMs + 24 * 3_600_000);
  const wet = next24.filter((p) => p.precipitationMm >= RAIN_MM);
  const total = next24.reduce((s, p) => s + p.precipitationMm, 0);
  const peak = next24.reduce((m, p) => Math.max(m, p.precipitationMm), 0);
  const probs = next24.map((p) => p.probabilityPct).filter((x): x is number => x != null);
  const maxProb = probs.length ? Math.max(...probs) : null;

  return {
    communityId,
    source: b.source,
    retrievedAt: b.retrievedAt,
    gridResolutionKm: 9,
    gridPoint: { lat: b.gridLat, lon: b.gridLon },
    isLocalMeasurement: false,
    stale: (nowMs - Date.parse(b.retrievedAt)) / 3_600_000 > STALE_H,
    current: { ...b.current, description: describeWeatherCode(b.current.weatherCode) },
    next24h: {
      rainExpected: wet.length > 0 && (maxProb == null || maxProb >= 30),
      totalMm: round1(total),
      maxProbabilityPct: maxProb,
      peakIntensity: classifyIntensity(peak),
      peakMmPerHour: round1(peak),
      window: wet.length ? { from: wet[0]!.time, to: addHour(wet.at(-1)!.time) } : null,
    },
    hourly: future.slice(0, 48).map((p) => ({
      time: p.time, precipitationMm: round1(p.precipitationMm), probabilityPct: p.probabilityPct, intensity: classifyIntensity(p.precipitationMm),
    })),
    daily: dailyTotals(future),
    floodRelevance: relevance(next24, clim),
    attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
  };
}

function relevance(next24: HourlyPoint[], clim: Climatology | null): string {
  if (!next24.length) return "No forecast available.";
  if (!clim) return "Local rainfall history not yet available, so this forecast cannot be compared with what is normal here.";
  const r6 = maxRolling(next24, 6);
  const r24 = maxRolling(next24, 24);
  const d6 = describePercentile(r6, clim.rain6h);
  const d24 = describePercentile(r24, clim.rain24h);
  if (d6.startsWith("within") && d24.startsWith("within")) return "Forecast rainfall is within the normal range for this location.";
  return `Forecast heaviest 6 h rainfall (${round1(r6)} mm) is ${d6}; 24 h total (${round1(r24)} mm) is ${d24}. This can raise flood risk, especially where drains are blocked.`;
}

function dailyTotals(pts: HourlyPoint[]) {
  const by = new Map<string, { totalMm: number; maxProbabilityPct: number | null }>();
  for (const p of pts) {
    const d = p.time.slice(0, 10);
    const cur = by.get(d) ?? { totalMm: 0, maxProbabilityPct: null };
    cur.totalMm += p.precipitationMm;
    if (p.probabilityPct != null) cur.maxProbabilityPct = Math.max(cur.maxProbabilityPct ?? 0, p.probabilityPct);
    by.set(d, cur);
  }
  return [...by.entries()].map(([date, v]) => ({ date, totalMm: round1(v.totalMm), maxProbabilityPct: v.maxProbabilityPct }));
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const addHour = (t: string) => new Date(Date.parse(t) + 3_600_000).toISOString();

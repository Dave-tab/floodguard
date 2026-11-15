// Open-Meteo adapters. Free tier is non-commercial (see research brief); set
// OPEN_METEO_API_KEY + customer host for a commercial plan. Every value returned carries
// provenance: provider, retrieval time and forecast window. Gridded model output is never
// flagged as a local measurement.
import type { AntecedentInput, RainfallForecastInput, RiverDischargeInput } from "../engine/types.ts";

export interface OpenMeteoConfig {
  apiKey?: string;
  forecastBase?: string;
  floodBase?: string;
  archiveBase?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  forecastBase: "https://api.open-meteo.com/v1/forecast",
  floodBase: "https://flood-api.open-meteo.com/v1/flood",
  archiveBase: "https://archive-api.open-meteo.com/v1/archive",
};

export interface HourlyPoint {
  time: string; // ISO UTC
  precipitationMm: number;
  probabilityPct: number | null;
  weatherCode: number | null;
  soilMoisture: number | null;
}

export interface ForecastBundle {
  source: string;
  retrievedAt: string;
  gridLat: number;
  gridLon: number;
  current: { time: string; temperatureC: number | null; precipitationMm: number | null; weatherCode: number | null };
  hourly: HourlyPoint[];
}

type Series = (number | null)[];
interface ForecastResponse {
  latitude: number;
  longitude: number;
  current?: { time?: string; temperature_2m?: number | null; precipitation?: number | null; weather_code?: number | null };
  hourly?: { time?: string[]; precipitation?: Series; precipitation_probability?: Series; weather_code?: Series; soil_moisture_0_to_7cm?: Series };
}
interface FloodResponse { daily?: { time?: string[]; river_discharge?: Series } }
interface ArchiveResponse { hourly?: { time?: string[]; precipitation?: Series; soil_moisture_0_to_7cm?: Series } }

/** GET with one retry on network errors and 429/5xx. Other failures surface immediately. */
async function getJson<T>(url: string, f: typeof fetch): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await f(url, { headers: { "User-Agent": "FloodGuard-RiskEngine/0.1" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        const err = new Error(`Open-Meteo ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
        if (res.status === 429 || res.status >= 500) { lastErr = err; continue; }
        throw Object.assign(err, { final: true });
      }
      const body = (await res.json()) as T & { error?: boolean; reason?: string };
      if (body?.error) throw Object.assign(new Error(`Open-Meteo error: ${body.reason}`), { final: true });
      return body;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Open-Meteo returns "2026-11-14T15:00" in UTC when timezone=UTC; normalise to full ISO. */
export function toIso(t: string): string {
  if (/(?:[zZ]|[+-]\d\d:\d\d)$/.test(t)) return t; // already carries a timezone
  const withTime = t.length === 10 ? t + "T00:00" : t; // date-only -> midnight
  return withTime + ":00Z";
}
const withKey = (u: URL, key?: string) => {
  if (key) u.searchParams.set("apikey", key);
  return u;
};

/** Hourly forecast for the next 3 days plus the past 7 days (for antecedent rainfall). */
export async function fetchForecast(lat: number, lon: number, cfg: OpenMeteoConfig = {}): Promise<ForecastBundle> {
  const f = cfg.fetchImpl ?? fetch;
  const u = new URL(cfg.forecastBase ?? DEFAULTS.forecastBase);
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("current", "temperature_2m,precipitation,weather_code");
  u.searchParams.set("hourly", "precipitation,precipitation_probability,weather_code,soil_moisture_0_to_7cm");
  u.searchParams.set("past_days", "7");
  u.searchParams.set("forecast_days", "3");
  u.searchParams.set("timezone", "UTC");
  const body = await getJson<ForecastResponse>(withKey(u, cfg.apiKey).toString(), f);
  const h = body.hourly ?? {};
  const hourly: HourlyPoint[] = (h.time ?? []).map((t: string, i: number) => ({
    time: toIso(t),
    precipitationMm: h.precipitation?.[i] ?? 0,
    probabilityPct: h.precipitation_probability?.[i] ?? null,
    weatherCode: h.weather_code?.[i] ?? null,
    soilMoisture: h.soil_moisture_0_to_7cm?.[i] ?? null,
  }));
  return {
    source: "Open-Meteo Forecast API (best_match model blend)",
    retrievedAt: new Date().toISOString(),
    gridLat: body.latitude,
    gridLon: body.longitude,
    current: {
      time: body.current?.time ? toIso(body.current.time) : new Date().toISOString(),
      temperatureC: body.current?.temperature_2m ?? null,
      precipitationMm: body.current?.precipitation ?? null,
      weatherCode: body.current?.weather_code ?? null,
    },
    hourly,
  };
}

const sumWindow = (pts: HourlyPoint[], start: number, len: number) =>
  pts.slice(start, start + len).reduce((s, p) => s + (p.precipitationMm ?? 0), 0);

export function maxRolling(pts: HourlyPoint[], len: number): number {
  if (pts.length <= len) return sumWindow(pts, 0, pts.length);
  let best = 0;
  for (let i = 0; i + len <= pts.length; i++) best = Math.max(best, sumWindow(pts, i, len));
  return best;
}

/** Split a forecast bundle into engine inputs (future -> forecast, past -> antecedent). */
export function toEngineInputs(b: ForecastBundle, now: string, horizonH = 48): {
  rainfallForecast: RainfallForecastInput;
  antecedent: AntecedentInput;
} {
  const nowMs = Date.parse(now);
  const future = b.hourly.filter((p) => Date.parse(p.time) > nowMs && Date.parse(p.time) <= nowMs + horizonH * 3_600_000);
  const past = b.hourly.filter((p) => Date.parse(p.time) <= nowMs);
  const past72 = past.slice(-72).reduce((s, p) => s + p.precipitationMm, 0);
  const past7d = past.slice(-168).reduce((s, p) => s + p.precipitationMm, 0);
  const probs = future.map((p) => p.probabilityPct).filter((x): x is number => x != null);
  const soil = [...past].reverse().find((p) => p.soilMoisture != null)?.soilMoisture ?? null;
  const prov = { source: b.source, retrievedAt: b.retrievedAt, resolutionKm: 9, measured: false } as const;
  return {
    rainfallForecast: {
      ...prov,
      forecastPeriod: future.length ? { from: future[0]!.time, to: future.at(-1)!.time } : null,
      max1hMm: maxRolling(future, 1),
      max6hMm: maxRolling(future, 6),
      max24hMm: maxRolling(future, 24),
      maxProbabilityPct: probs.length ? Math.max(...probs) : null,
    },
    antecedent: {
      ...prov,
      observedAt: past.at(-1)?.time ?? null,
      past72hMm: past72,
      past7dMm: past7d,
      soilMoisture: soil,
    },
  };
}

/**
 * GloFAS river discharge (daily). Open-Meteo snaps to the largest river within ~5 km of the
 * point and may pick the wrong one; each community's riverPoint is chosen and checked by hand.
 */
export async function fetchRiverDischarge(
  lat: number,
  lon: number,
  cfg: OpenMeteoConfig = {},
): Promise<RiverDischargeInput & { daily: { date: string; m3s: number }[] }> {
  const f = cfg.fetchImpl ?? fetch;
  const u = new URL(cfg.floodBase ?? DEFAULTS.floodBase);
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("daily", "river_discharge");
  u.searchParams.set("past_days", "3");
  u.searchParams.set("forecast_days", "30");
  const body = await getJson<FloodResponse>(withKey(u, cfg.apiKey).toString(), f);
  const times: string[] = body.daily?.time ?? [];
  const vals: (number | null)[] = body.daily?.river_discharge ?? [];
  const daily = times
    .map((t, i) => ({ date: t, m3s: vals[i] ?? Number.NaN }))
    .filter((d) => Number.isFinite(d.m3s));
  if (!daily.length) throw new Error("No river discharge returned for this location");
  const today = new Date().toISOString().slice(0, 10);
  const future = daily.filter((d) => d.date >= today);
  const pool = future.length ? future : daily;
  const peak = pool.reduce((a, b) => (b.m3s > a.m3s ? b : a), pool[0]!);
  return {
    source: "GloFAS v4 (Copernicus EMS) via Open-Meteo Flood API",
    retrievedAt: new Date().toISOString(),
    forecastPeriod: future.length ? { from: future[0]!.date, to: future.at(-1)!.date } : null,
    resolutionKm: 5,
    measured: false,
    peakForecastM3s: peak.m3s,
    peakDate: peak.date,
    currentM3s: daily.find((d) => d.date === today)?.m3s ?? null,
    daily,
  };
}

/** Historical hourly precipitation + soil moisture (ERA5 family) for climatology building. */
export async function fetchArchive(lat: number, lon: number, start: string, end: string, cfg: OpenMeteoConfig = {}) {
  const f = cfg.fetchImpl ?? fetch;
  const u = new URL(cfg.archiveBase ?? DEFAULTS.archiveBase);
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  u.searchParams.set("hourly", "precipitation,soil_moisture_0_to_7cm");
  u.searchParams.set("timezone", "UTC");
  const body = await getJson<ArchiveResponse>(withKey(u, cfg.apiKey).toString(), f);
  return {
    time: (body.hourly?.time ?? []) as string[],
    precipitation: (body.hourly?.precipitation ?? []) as (number | null)[],
    soilMoisture: (body.hourly?.soil_moisture_0_to_7cm ?? []) as (number | null)[],
  };
}

/** Historical daily discharge (GloFAS reanalysis, 1984+) for return-period fitting. */
export async function fetchDischargeHistory(lat: number, lon: number, start: string, end: string, cfg: OpenMeteoConfig = {}) {
  const f = cfg.fetchImpl ?? fetch;
  const u = new URL(cfg.floodBase ?? DEFAULTS.floodBase);
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("daily", "river_discharge");
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  const body = await getJson<FloodResponse>(withKey(u, cfg.apiKey).toString(), f);
  return { time: (body.daily?.time ?? []) as string[], discharge: (body.daily?.river_discharge ?? []) as (number | null)[] };
}

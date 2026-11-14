// Builds a community's local climatology from historical records. This is what lets the
// engine say "heavy for THIS place" instead of using a national mm threshold.
import type { Climatology, Percentiles } from "../engine/types.ts";

/** Linear-interpolated quantile of an unsorted array. */
export function quantile(values: number[], q: number): number {
  if (!values.length) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export const percentiles = (v: number[]): Percentiles => ({
  p90: round(quantile(v, 0.9)),
  p99: round(quantile(v, 0.99)),
  p999: round(quantile(v, 0.999)),
});

/** Rolling sums over a series (missing values count as 0). */
export function rollingSums(series: (number | null)[], len: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < series.length; i++) {
    acc += series[i] ?? 0;
    if (i >= len) acc -= series[i - len] ?? 0;
    if (i >= len - 1) out.push(acc);
  }
  return out;
}

/**
 * Rainfall percentiles. Short durations (1/6/24 h) are computed over WET windows only
 * (total >= 1 mm): over all hours, tropical p90 is close to zero and every shower would
 * look extreme. The 7-day total uses all windows (it measures how wet the week is).
 */
export function rainfallClimatology(hourlyPrecip: (number | null)[]) {
  const wet = (xs: number[]) => xs.filter((x) => x >= 1);
  return {
    rain1h: percentiles(wet(rollingSums(hourlyPrecip, 1))),
    rain6h: percentiles(wet(rollingSums(hourlyPrecip, 6))),
    rain24h: percentiles(wet(rollingSums(hourlyPrecip, 24))),
    rain7d: percentiles(rollingSums(hourlyPrecip, 168)),
  };
}

/**
 * Return-period discharge from annual maxima using a Gumbel (EV1) fit by method of moments.
 * Adequate for a preliminary stage; Stage 2 should compare GEV / L-moments and use
 * GloFAS official reporting-point thresholds where available.
 */
export function gumbelReturnLevels(dates: string[], discharge: (number | null)[]) {
  const maxByYear = new Map<string, number>();
  dates.forEach((d, i) => {
    const q = discharge[i];
    if (q == null || !Number.isFinite(q)) return;
    const y = d.slice(0, 4);
    maxByYear.set(y, Math.max(maxByYear.get(y) ?? -Infinity, q));
  });
  // Drop the current, incomplete year.
  const thisYear = String(new Date().getUTCFullYear());
  maxByYear.delete(thisYear);
  const am = [...maxByYear.values()];
  if (am.length < 10) throw new Error(`Need >= 10 annual maxima, got ${am.length}`);
  const mean = am.reduce((s, x) => s + x, 0) / am.length;
  const sd = Math.sqrt(am.reduce((s, x) => s + (x - mean) ** 2, 0) / (am.length - 1));
  const alpha = (sd * Math.sqrt(6)) / Math.PI;
  const u = mean - 0.5772 * alpha;
  const level = (T: number) => round(u - alpha * Math.log(-Math.log(1 - 1 / T)));
  return { rp2: level(2), rp5: level(5), rp20: level(20), years: am.length, meanAnnualMax: round(mean) };
}

export function assembleClimatology(parts: {
  hourlyPrecip: (number | null)[];
  soilMoisture?: (number | null)[];
  discharge?: { dates: string[]; values: (number | null)[] };
  period: string;
}): Climatology & { dischargeYears?: number } {
  const rain = rainfallClimatology(parts.hourlyPrecip);
  const soil = parts.soilMoisture?.filter((x): x is number => x != null);
  const rp = parts.discharge ? gumbelReturnLevels(parts.discharge.dates, parts.discharge.values) : undefined;
  return {
    ...rain,
    soilMoisture: soil && soil.length ? { p90: round3(quantile(soil, 0.9)), p99: round3(quantile(soil, 0.99)), p999: round3(quantile(soil, 0.999)) } : undefined,
    dischargeReturnPeriods: rp ? { rp2: rp.rp2, rp5: rp.rp5, rp20: rp.rp20 } : undefined,
    dischargeYears: rp?.years,
    source: `ERA5 hourly via Open-Meteo Historical Weather API${rp ? "; GloFAS v4 reanalysis via Open-Meteo Flood API (Gumbel fit of annual maxima)" : ""}`,
    period: parts.period,
  };
}

const round = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

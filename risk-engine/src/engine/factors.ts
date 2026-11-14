// Converts raw hydro-meteorological values into 0-1 hazard factors, always relative to the
// community's OWN climatology or river statistics, never a fixed national mm threshold.
import type { Percentiles } from "./types.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Piecewise-linear scaling against local percentiles:
 *   below p90 -> 0..0.3, p90..p99 -> 0.3..0.6, p99..p99.9 -> 0.6..0.9, beyond -> up to 1.
 * So "0.6" always means "as heavy as the wettest 1% of comparable periods at this location".
 */
export function scaleByPercentiles(value: number, p: Percentiles): number {
  if (!(value > 0)) return 0;
  const { p90, p99, p999 } = monotone(p);
  if (value < p90) return 0.3 * (value / p90);
  if (value < p99) return 0.3 + 0.3 * ((value - p90) / (p99 - p90));
  if (value < p999) return 0.6 + 0.3 * ((value - p99) / (p999 - p99));
  return clamp01(0.9 + 0.1 * ((value - p999) / (p999 - p99)));
}

/**
 * Discharge vs return-period levels: below RP2 -> 0..0.4, RP2..RP5 -> 0.4..0.6,
 * RP5..RP20 -> 0.6..0.85, above RP20 -> up to 1.
 */
export function scaleDischarge(q: number, rp: { rp2: number; rp5: number; rp20: number }): number {
  if (!(q > 0)) return 0;
  const { rp2, rp5, rp20 } = rp;
  if (q < rp2) return 0.4 * (q / rp2);
  if (q < rp5) return 0.4 + 0.2 * ((q - rp2) / Math.max(1e-9, rp5 - rp2));
  if (q < rp20) return 0.6 + 0.25 * ((q - rp5) / Math.max(1e-9, rp20 - rp5));
  return clamp01(0.85 + 0.15 * ((q - rp20) / Math.max(1e-9, rp20 - rp5)));
}

/** Gauge level vs agency stages: alert -> 0.6, danger -> 0.85. */
export function scaleGauge(level: number, alert: number, danger: number): number {
  if (level < alert) return clamp01(0.6 * (level / alert));
  if (level < danger) return 0.6 + 0.25 * ((level - alert) / Math.max(1e-9, danger - alert));
  return clamp01(0.85 + 0.15 * ((level - danger) / Math.max(1e-9, danger - alert)));
}

/** Guard against degenerate climatology (e.g. arid cell with p90 = 0). */
function monotone(p: Percentiles): Percentiles {
  const p90 = Math.max(p.p90, 0.1);
  const p99 = Math.max(p.p99, p90 * 1.01 + 0.1);
  const p999 = Math.max(p.p999, p99 * 1.01 + 0.1);
  return { p90, p99, p999 };
}

/** Human description of where a value sits against local percentiles. */
export function describePercentile(value: number, p: Percentiles): string {
  const m = monotone(p);
  if (value >= m.p999) return "above the local 99.9th percentile";
  if (value >= m.p99) return "above the local 99th percentile";
  if (value >= m.p90) return "above the local 90th percentile";
  return "within normal local range";
}

export function describeDischarge(q: number, rp: { rp2: number; rp5: number; rp20: number }): string {
  if (q >= rp.rp20) return "above the 20-year return level";
  if (q >= rp.rp5) return "above the 5-year return level";
  if (q >= rp.rp2) return "above the 2-year return level";
  return "below the 2-year return level";
}

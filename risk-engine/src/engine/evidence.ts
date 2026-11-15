// Weighting of verified observations by reliability, location relevance, recency and
// corroboration. Quantity alone cannot drive the result: duplicates are merged and the
// noisy-OR combination saturates, so many weak reports never equal one strong one.
import { DEDUPE, RECENCY_TAU_H, RELEVANCE_D0_KM, RELIABILITY } from "./config.ts";
import type { Community, Observation } from "./types.ts";

export interface WeightedObservation {
  obs: Observation;
  weight: number;
  distanceKm: number;
  ageH: number;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const hoursBetween = (fromIso: string, toIso: string) =>
  (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;

/**
 * Merge near-duplicates: same reporter, or within DEDUPE.radiusM and DEDUPE.windowH of
 * an already-kept observation of the same category. Keeps the most reliable / intense one.
 * Official warnings are never merged with each other.
 */
export function dedupeObservations(observations: Observation[]): Observation[] {
  const sorted = [...observations].sort(
    (a, b) => RELIABILITY[b.type] * b.intensity - RELIABILITY[a.type] * a.intensity,
  );
  const kept: Observation[] = [];
  for (const o of sorted) {
    const dup = kept.some((k) => {
      if (o.type === "official_warning" || k.type === "official_warning") return false;
      if (k.category !== o.category) return false;
      const closeInTime = Math.abs(hoursBetween(k.observedAt, o.observedAt)) <= DEDUPE.windowH;
      if (o.reporterId && k.reporterId === o.reporterId && closeInTime) return true;
      const closeInSpace = haversineKm(k.lat, k.lon, o.lat, o.lon) * 1000 <= DEDUPE.radiusM;
      return closeInSpace && closeInTime;
    });
    if (!dup) kept.push(o);
  }
  return kept;
}

export function weighObservation(obs: Observation, community: Community, now: string): WeightedObservation {
  const distanceKm = obs.insideCommunity ? 0 : haversineKm(community.lat, community.lon, obs.lat, obs.lon);
  const ageH = Math.max(0, hoursBetween(obs.observedAt, now));
  const d0 = RELEVANCE_D0_KM[community.setting];
  const tau = RECENCY_TAU_H[obs.category] ?? RECENCY_TAU_H.default!;
  const relevance = obs.insideCommunity ? 1 : Math.exp(-distanceKm / d0);
  // Official warnings stay fully relevant while they are in force (caller filters expired ones).
  const recency = obs.type === "official_warning" ? 1 : Math.exp(-ageH / tau);
  const weight = RELIABILITY[obs.type] * relevance * recency * clamp01(obs.intensity);
  return { obs, weight, distanceKm, ageH };
}

/** Noisy-OR: O = 1 - prod(1 - w_i). Saturates; independent strong evidence still adds up. */
export function combineNoisyOr(weights: number[]): number {
  return 1 - weights.reduce((acc, w) => acc * (1 - clamp01(w)), 1);
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

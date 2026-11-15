// The only place that converts between API/frontend contract values (lowercase, approved in
// docs/IMPLEMENTATION_CONTRACTS.md and the lead's brief) and the live database enums
// (UPPERCASE). Where the two sets do not line up, nothing is silently relabelled: the raw
// database value is kept alongside, or the value is shown as unavailable.
import type { ConfidenceLevel, InputKey, Severity } from "../../risk-engine/src/index.ts";
import type { DbConfidence, DbHazardCategory, DbReportStatus, DbRiskLevel, DbVerificationStatus } from "./db/schema.ts";

// ---- Hazard categories ----
export const HAZARD_CATEGORIES = ["flooded_road", "rising_water_level", "blocked_drainage", "overflowing_waterway", "damaged_drainage", "other"] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

export const CATEGORY_TO_DB: Record<HazardCategory, DbHazardCategory> = {
  flooded_road: "FLOODED_ROAD",
  rising_water_level: "RISING_WATER",
  blocked_drainage: "BLOCKED_DRAINAGE",
  damaged_drainage: "DRAINAGE_DAMAGE",
  other: "OTHER",
  overflowing_waterway: "FLOODING", // contract mismatch: the DB has no "overflowing waterway" value
};

/** DB -> contract. FLOODING and EROSION have no exact contract value; callers also expose `dbCategory`. */
export const CATEGORY_FROM_DB: Record<DbHazardCategory, HazardCategory> = {
  FLOODED_ROAD: "flooded_road",
  RISING_WATER: "rising_water_level",
  BLOCKED_DRAINAGE: "blocked_drainage",
  DRAINAGE_DAMAGE: "damaged_drainage",
  OTHER: "other",
  FLOODING: "overflowing_waterway",
  EROSION: "other",
};
export const categoryFromDb = (c: string): HazardCategory => CATEGORY_FROM_DB[c as DbHazardCategory] ?? "other";

/** Engine evidence for each DB category (category names the engine's recency rules know). */
export const CATEGORY_EVIDENCE: Record<DbHazardCategory, { category: string; intensity: number }> = {
  FLOODING: { category: "flooding", intensity: 0.8 },
  FLOODED_ROAD: { category: "flooding", intensity: 0.8 },
  RISING_WATER: { category: "rising_water", intensity: 0.7 },
  BLOCKED_DRAINAGE: { category: "blocked_drain", intensity: 0.5 },
  DRAINAGE_DAMAGE: { category: "blocked_drain", intensity: 0.4 },
  EROSION: { category: "other", intensity: 0.3 },
  OTHER: { category: "other", intensity: 0.3 },
};

// ---- Report status ----
export type ReportStatus = "pending" | "verified" | "rejected";
export const STATUS_TO_DB: Record<ReportStatus, DbReportStatus> = { pending: "PENDING", verified: "VERIFIED", rejected: "REJECTED" };
/** Raw lowercase for the reporter/admin; IN_PROGRESS and RESOLVED are not approved statuses and are never public. */
export const statusFromDb = (s: string) => s.toLowerCase();

// ---- Risk level / confidence ----
const SEVERITY_TO_DB: Record<Severity, DbRiskLevel> = { low: "LOW", high: "HIGH", severe: "SEVERE", critical: "CRITICAL" };
export const severityToDb = (s: Severity | null): DbRiskLevel => (s ? SEVERITY_TO_DB[s] : "UNAVAILABLE");

/** DB -> approved severity. MODERATE has no meaning in the approved scale, so it is not mapped. */
export function severityFromDb(level: string): { level: Severity | null; note: string | null } {
  switch (level) {
    case "LOW": return { level: "low", note: null };
    case "HIGH": return { level: "high", note: null };
    case "SEVERE": return { level: "severe", note: null };
    case "CRITICAL": return { level: "critical", note: null };
    case "MODERATE": return { level: null, note: "This stored assessment uses a 'moderate' level, which is not part of the approved scale, so no level is shown." };
    default: return { level: null, note: null };
  }
}

export const confidenceToDb = (c: ConfidenceLevel): DbConfidence => c.toUpperCase() as DbConfidence;
export function confidenceFromDb(c: string): ConfidenceLevel {
  const l = c.toLowerCase();
  return l === "high" || l === "medium" || l === "low" ? l : "insufficient";
}

// ---- Community verification ----
export function verificationFromDb(s: DbVerificationStatus | string | null): "verified" | "under_review" | "unverified" {
  if (s === "VERIFIED") return "verified";
  if (s === "PENDING_REVIEW") return "under_review";
  return "unverified";
}

// ---- Roles ----
export const isAdminRole = (role: string | null) => role === "ADMIN";

// ---- Plain labels for engine inputs (stored in inputs_used / inputs_missing) ----
export const INPUT_LABELS: Record<InputKey, string> = {
  forecast_rainfall: "Rainfall forecast",
  antecedent_rainfall: "Recent rainfall record",
  soil_moisture: "Soil wetness data",
  river_discharge_model: "River forecast",
  river_gauge: "Local river gauge reading",
  susceptibility: "Local flood-history profile",
  verified_observations: "Verified local reports",
};

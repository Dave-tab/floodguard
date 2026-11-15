// Every tunable number in the engine lives here so it can be reviewed, versioned and
// later replaced by calibrated values. Bump METHOD_VERSION whenever any value changes:
// stored assessments record the version that produced them.
import type { FloodMechanism, InputKey, ObservationType, Severity } from "./types.ts";

export const METHOD_VERSION = "fg-risk-0.1.0";

export const DISCLAIMER =
  "Preliminary risk assessment based on available data. Not an official warning and not a validated flood prediction. Follow NEMA, NIHSA and State Emergency Management Agency instructions.";

/** Assessment validity window (hours). */
export const ASSESSMENT_VALIDITY_H = 3;

/** Severity bands on the 0-100 score. Lower bound inclusive. */
export const SEVERITY_BANDS: { severity: Severity; min: number }[] = [
  { severity: "critical", min: 85 },
  { severity: "severe", min: 65 },
  { severity: "high", min: 40 },
  { severity: "low", min: 0 },
];

/** Combination coefficients (starting values; Stage 2 calibrates them). */
export const COMBINE = {
  pluvialAntecedentBase: 0.6,
  pluvialAntecedentGain: 0.4,
  fluvialUpstreamMix: 0.5,
  susceptibilityBase: 0.7,
  susceptibilityGain: 0.3,
  observationUplift: 0.25,
  /** Susceptibility used when a community has none assessed (neutral, and lowers confidence). */
  defaultSusceptibility: 0.5,
};

/** Hazard factor value that a Severe rating requires from a non-report source. */
export const SEVERE_GATE_FACTOR = 0.6;

/** Source reliability r_i for scored observations. Unverified reports are absent on purpose. */
export const RELIABILITY: Record<ObservationType, number> = {
  official_warning: 1.0,
  river_gauge_report: 0.95,
  verified_incident: 0.8,
};

/** Location relevance length scale d0 (km) and recency time constant tau (hours). */
export const RELEVANCE_D0_KM = { urban: 1.5, riverine: 5 };
export const RECENCY_TAU_H: Record<string, number> = {
  flooding: 6,
  rising_water: 6,
  blocked_drain: 24,
  default: 12,
};

/** Duplicate-merge window for observations. */
export const DEDUPE = { radiusM: 100, windowH: 1 };

/** Staleness limits (hours) per input. Freshness decays linearly to 0 at the limit. */
export const STALE_AFTER_H: Record<InputKey, number> = {
  forecast_rainfall: 6,
  antecedent_rainfall: 12,
  soil_moisture: 24,
  river_discharge_model: 36,
  river_gauge: 3,
  susceptibility: 24 * 365,
  verified_observations: 24,
};

/** Source quality q_k: 1 = local measurement, lower for coarse model output. */
export const QUALITY: Record<InputKey, number> = {
  forecast_rainfall: 0.6, // ~9-25 km NWP grid
  antecedent_rainfall: 0.6, // reanalysis/model, not a local gauge
  soil_moisture: 0.5,
  river_discharge_model: 0.6, // GloFAS ~5 km
  river_gauge: 1.0,
  susceptibility: 0.7,
  verified_observations: 0.9,
};

/** Importance I_k of each input, by dominant flood mechanism. */
export const IMPORTANCE: Record<FloodMechanism, Record<InputKey, number>> = {
  pluvial: {
    forecast_rainfall: 3,
    antecedent_rainfall: 1.5,
    soil_moisture: 0.5,
    river_discharge_model: 0.25,
    river_gauge: 0,
    susceptibility: 1,
    verified_observations: 1.5,
  },
  fluvial: {
    forecast_rainfall: 1,
    antecedent_rainfall: 1,
    soil_moisture: 0.5,
    river_discharge_model: 3,
    river_gauge: 1.5,
    susceptibility: 1,
    verified_observations: 1.5,
  },
  mixed: {
    forecast_rainfall: 2,
    antecedent_rainfall: 1.25,
    soil_moisture: 0.5,
    river_discharge_model: 2,
    river_gauge: 1,
    susceptibility: 1,
    verified_observations: 1.5,
  },
};

export const CONFIDENCE_LEVELS = { high: 0.75, medium: 0.5, low: 0.3 };

/** WMO-style rainfall intensity bands (mm/h). */
export const INTENSITY_BANDS = { light: 2.5, moderate: 10, heavy: 50 };

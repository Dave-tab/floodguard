// Core domain types for the FloodGuard preliminary risk engine.
// The engine is pure: it takes already-fetched inputs and returns an assessment.
// It never fetches data and never mutates incident or warning state.

export type Severity = "low" | "high" | "severe" | "critical";
export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";
export type FloodMechanism = "pluvial" | "fluvial" | "mixed";
export type AssessmentStatus = "active" | "updated" | "expired" | "cancelled" | "insufficient_data";
export type Freshness = "fresh" | "aging" | "stale" | "missing";

export type InputKey =
  | "forecast_rainfall"
  | "antecedent_rainfall"
  | "soil_moisture"
  | "river_discharge_model"
  | "river_gauge"
  | "susceptibility"
  | "verified_observations";

/** Local climatology for one community, built offline from ERA5 / GloFAS reanalysis. */
export interface Climatology {
  /** Rainfall accumulation percentiles (mm) for each duration, from ERA5 hourly at the community grid cell. */
  rain1h: Percentiles;
  rain6h: Percentiles;
  rain24h: Percentiles;
  rain7d: Percentiles;
  /** Volumetric soil moisture percentiles (m3/m3), 0-7 cm layer. */
  soilMoisture?: Percentiles;
  /** River discharge return-period levels (m3/s) for the reach that drains the community. */
  dischargeReturnPeriods?: { rp2: number; rp5: number; rp20: number };
  source: string;
  period: string;
}

export interface Percentiles {
  p90: number;
  p99: number;
  p999: number;
}

export interface Community {
  id: string;
  name: string;
  lga: string;
  state: string;
  lat: number;
  lon: number;
  mechanism: FloodMechanism;
  /** Static susceptibility 0-1 (terrain, HAND, history, baseline drainage). Null when not yet assessed. */
  susceptibility: number | null;
  susceptibilityNotes?: string;
  climatology: Climatology | null;
  /** Coordinates of the river reach used for discharge (may differ from the centroid). */
  riverPoint?: { lat: number; lon: number; name: string };
  /** Urban communities use a tighter relevance radius for observations. */
  setting: "urban" | "riverine";
}

/** Provenance carried by every provider-derived input. */
export interface Provenance {
  source: string;
  retrievedAt: string; // ISO
  observedAt?: string | null; // for observations
  forecastPeriod?: { from: string; to: string } | null; // for forecasts
  modelRunAt?: string | null;
  resolutionKm?: number | null;
  /** True only for an in-situ measurement at or near the community. Gridded/model data is never "measured". */
  measured: boolean;
}

export interface RainfallForecastInput extends Provenance {
  max1hMm: number;
  max6hMm: number;
  max24hMm: number;
  /** Highest precipitation probability in the next 48 h, if provider supplies it. */
  maxProbabilityPct: number | null;
}

export interface AntecedentInput extends Provenance {
  past72hMm: number;
  past7dMm: number;
  soilMoisture: number | null; // m3/m3
}

export interface RiverDischargeInput extends Provenance {
  /** Peak forecast discharge over the horizon (m3/s). */
  peakForecastM3s: number;
  peakDate: string;
  currentM3s: number | null;
}

export interface RiverGaugeInput extends Provenance {
  levelM: number;
  /** Agency warning stages for this gauge. */
  alertLevelM: number;
  dangerLevelM: number;
}

export type ObservationType = "official_warning" | "verified_incident" | "river_gauge_report";

export interface Observation {
  id: string;
  type: ObservationType;
  /** Category of hazard, e.g. flooding, blocked_drain, rising_water. */
  category: string;
  /** Severity implied by the observation, 0-1 (e.g. official "critical" warning = 1). */
  intensity: number;
  lat: number;
  lon: number;
  /** True if inside the community polygon. */
  insideCommunity: boolean;
  observedAt: string;
  reporterId?: string | null;
  source: string;
  /** Official warning / incident severity, if applicable. */
  officialSeverity?: Severity | null;
}

/** An unverified resident report: carried for display to admins, never scored. */
export interface UnverifiedSignal {
  id: string;
  category: string;
  observedAt: string;
  lat: number;
  lon: number;
}

export interface AssessmentInputs {
  community: Community;
  now: string; // ISO; injected for determinism
  rainfallForecast: RainfallForecastInput | null;
  antecedent: AntecedentInput | null;
  riverDischarge: RiverDischargeInput | null;
  riverGauge: RiverGaugeInput | null;
  observations: Observation[];
  unverifiedSignals?: UnverifiedSignal[];
}

export interface Driver {
  factor: InputKey | "pluvial_hazard" | "fluvial_hazard";
  value: number; // 0-1
  detail: string;
}

export interface EvidenceItem {
  type: "model_forecast" | "reanalysis" | "measurement" | "official_warning" | "verified_incident" | "static";
  input: InputKey;
  source: string;
  measured: boolean;
  resolutionKm: number | null;
  observedAt: string | null;
  forecastPeriod: { from: string; to: string } | null;
  retrievedAt: string | null;
  freshness: Freshness;
  weight: number;
  note?: string;
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  missingInputs: InputKey[];
  staleInputs: InputKey[];
  agreement: number;
  notes: string[];
}

export interface RiskAssessment {
  communityId: string;
  location: { name: string; lga: string; state: string; lat: number; lon: number };
  assessmentType: "preliminary";
  methodVersion: string;
  riskScore: number | null;
  severity: Severity | null;
  /** If a gate prevented a higher band, which band was blocked and why. */
  severityCappedBy: { wouldBe: Severity; reason: string } | null;
  confidence: ConfidenceResult;
  summary: string;
  drivers: Driver[];
  evidence: EvidenceItem[];
  signalsUnderReview: number;
  recommendedActions: string[];
  status: AssessmentStatus;
  assessedAt: string;
  validUntil: string;
  nextReviewAt: string;
  dataFreshness: Partial<Record<InputKey, Freshness>> & { oldestInputAt: string | null };
  disclaimer: string;
}

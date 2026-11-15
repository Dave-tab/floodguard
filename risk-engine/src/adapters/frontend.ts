// Maps the engine's RiskAssessment to the shape the resident frontend's RiskAssessmentCard
// reads (src/types/resident.ts on main). One deliberate difference: `level` uses the four
// approved severities (low | high | severe | critical). The frontend type currently lists
// low | moderate | high | critical and needs `severe` added; "severe" is never silently
// relabelled, because that would understate or overstate risk to residents.
import { DISCLAIMER } from "../engine/config.ts";
import type { InputKey, RiskAssessment, Severity } from "../engine/types.ts";
import type { ExplanationResult } from "../explain/vultr.ts";

export type FrontendRiskStatus = "available" | "insufficient_data" | "unavailable";

export interface FrontendRiskFactor {
  id: string;
  label: string;
  description: string;
  value: string | number | null;
  contributionLabel?: string | null;
  iconKey: "rainfall" | "water_level" | "drainage" | "terrain" | "other";
}

export interface FrontendRiskAssessment {
  status: FrontendRiskStatus;
  level: Severity | null;
  score: number | null;
  summary: string | null;
  explanation: string | null;
  explanationStatus: "deterministic_template" | "ai" | "unavailable";
  factors: FrontendRiskFactor[];
  missingInputs: string[];
  limitations: string[];
  disclaimer: string;
  confidence: number | null;
  assessedAt: string | null;
  isDemoData: boolean;
  // Extra fields beyond the current frontend type (safe to ignore until the UI uses them).
  confidenceLevel: RiskAssessment["confidence"]["level"];
  validUntil: string;
  nextReviewAt: string;
  methodVersion: string;
}

const LABELS: Record<string, { label: string; icon: FrontendRiskFactor["iconKey"] }> = {
  forecast_rainfall: { label: "Forecast rainfall", icon: "rainfall" },
  antecedent_rainfall: { label: "Recent rainfall and soil wetness", icon: "rainfall" },
  soil_moisture: { label: "Soil wetness", icon: "rainfall" },
  river_discharge_model: { label: "River forecast", icon: "water_level" },
  river_gauge: { label: "River gauge level", icon: "water_level" },
  susceptibility: { label: "Local flood susceptibility", icon: "terrain" },
  verified_observations: { label: "Verified local reports", icon: "other" },
};

const PLAIN_MISSING: Record<InputKey, string> = {
  forecast_rainfall: "Rainfall forecast",
  antecedent_rainfall: "Recent rainfall record",
  soil_moisture: "Soil wetness data",
  river_discharge_model: "River forecast",
  river_gauge: "Local river gauge reading",
  susceptibility: "Local flood-history profile",
  verified_observations: "Verified local reports",
};

const contribution = (v: number) => (v >= 0.6 ? "Strong" : v >= 0.3 ? "Moderate" : "Weak");

export function toFrontendRiskAssessment(
  a: RiskAssessment,
  explanation?: ExplanationResult | null,
  opts: { now?: string } = {},
): FrontendRiskAssessment {
  const now = opts.now ?? new Date().toISOString();
  const expired = Date.parse(a.validUntil) <= Date.parse(now);
  const status: FrontendRiskStatus =
    expired || a.status === "expired" || a.status === "cancelled" ? "unavailable"
    : a.status === "insufficient_data" ? "insufficient_data"
    : "available";
  const showLevel = status === "available";

  const limitations = [
    ...a.confidence.notes,
    ...a.confidence.staleInputs.map((k) => `${PLAIN_MISSING[k]} is out of date and was not used.`),
  ];
  if (a.evidence.some((e) => !e.measured && e.type !== "static")) {
    limitations.push("Weather and river values are model estimates for the area, not measurements taken in the community.");
  }
  if (a.severityCappedBy) limitations.push(a.severityCappedBy.reason);
  if (expired) limitations.push("This assessment has expired and is not a current warning.");

  return {
    status,
    level: showLevel ? a.severity : null,
    score: showLevel ? a.riskScore : null,
    summary: a.summary,
    explanation: explanation ? explanation.text : null,
    explanationStatus: !explanation ? "unavailable" : explanation.source === "llm" ? "ai" : "deterministic_template",
    factors: a.drivers
      .filter((d) => d.factor !== "pluvial_hazard" && d.factor !== "fluvial_hazard")
      .map((d) => ({
        id: d.factor,
        label: LABELS[d.factor]?.label ?? d.factor,
        description: d.detail,
        value: d.value,
        contributionLabel: contribution(d.value),
        iconKey: LABELS[d.factor]?.icon ?? "other",
      })),
    missingInputs: a.confidence.missingInputs.map((k) => PLAIN_MISSING[k]),
    limitations,
    disclaimer: a.disclaimer || DISCLAIMER,
    confidence: a.confidence.score,
    assessedAt: a.assessedAt,
    isDemoData: false,
    confidenceLevel: a.confidence.level,
    validUntil: a.validUntil,
    nextReviewAt: a.nextReviewAt,
    methodVersion: a.methodVersion,
  };
}

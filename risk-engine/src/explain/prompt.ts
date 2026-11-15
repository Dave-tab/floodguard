// Optional LLM explanation (server-side only). The LLM receives a small set of plain facts
// taken from the engine's output and may only rephrase them. It never sees raw provider
// data, never sets the severity, and its reply is checked before any resident sees it.
import type { RiskAssessment } from "../engine/types.ts";

export const MAX_WORDS = 70;

const PLAIN_INPUT: Record<string, string> = {
  forecast_rainfall: "rain forecast",
  antecedent_rainfall: "recent rainfall record",
  soil_moisture: "soil wetness data",
  river_discharge_model: "river forecast",
  river_gauge: "local river gauge reading",
  susceptibility: "local flood-history profile",
  verified_observations: "verified local reports",
};

export function buildExplanationPrompt(a: RiskAssessment) {
  const system = [
    "You write a short flood-risk update for residents of a Nigerian community.",
    `Use ONLY the facts in the JSON. Plain, calm, everyday English. At most ${MAX_WORDS - 10} words, 2 or 3 short sentences, no lists, no headings.`,
    "Start with the risk level and how confident the estimate is, in ordinary words.",
    "If riskLevel is \"unavailable\", say risk information is unavailable right now and that people should not assume it is safe.",
    "Explain the main reasons simply. Do not use technical terms such as return level, return period, percentile, pathway, antecedent, m³/s or RP, and do not copy JSON field names.",
    "If something is listed under notAvailable, mention it briefly in plain words.",
    "End with the first action from actions.",
    "Do not call this an official warning or a guaranteed prediction. Never tell people to evacuate.",
  ].join(" ");
  const facts = {
    place: a.location.name,
    riskLevel: a.severity ?? "unavailable",
    confidence: a.confidence.level === "insufficient" ? "not enough data" : a.confidence.level,
    mainReasons: a.drivers
      .filter((d) => d.factor !== "pluvial_hazard" && d.factor !== "fluvial_hazard")
      .sort((x, y) => y.value - x.value)
      .slice(0, 3)
      .map((d) => d.detail),
    notAvailable: a.confidence.missingInputs.map((k) => PLAIN_INPUT[k] ?? k),
    actions: a.recommendedActions.slice(0, 2),
  };
  return { system, user: JSON.stringify(facts) };
}

const NEAR = "(?:risk|level|danger|threat|rating|severity)";

/** Does the text assert severity `w`? "severe"/"critical" anywhere count; "high"/"low" only
 *  near a risk word, so "move to high ground" or "low-lying roads" stay allowed. */
function claimsSeverity(text: string, w: string): boolean {
  if (w === "severe" || w === "critical") return new RegExp(`\\b${w}\\b`, "i").test(text);
  return (
    new RegExp(`\\b${NEAR}\\W+(?:\\w+\\W+){0,3}${w}\\b`, "i").test(text) ||
    new RegExp(`\\b${w}\\W+(?:\\w+\\W+){0,2}${NEAR}`, "i").test(text)
  );
}

export type RejectReason = "empty" | "wrong_severity" | "official_claim" | "evacuation" | "internal_terms" | "too_long";

/** Rule-based check of LLM output. Returns null if acceptable, else why it was rejected. */
export function checkExplanation(a: RiskAssessment, text: string): RejectReason | null {
  const t = text.trim();
  if (!t) return "empty";
  const others = ["low", "high", "severe", "critical"].filter((s) => s !== a.severity);
  if (others.some((w) => claimsSeverity(t, w))) return "wrong_severity";
  if (/\bofficial\s+(?:flood\s+)?warning\b/i.test(t.replace(/\bnot\s+an?\s+official\s+(?:flood\s+)?warning\b/gi, ""))) return "official_claim";
  if (/\bevacuat/i.test(t)) return "evacuation";
  // Leaked field names / JSON values / engine jargon.
  if (/\bnull\b|\b[a-z]+_[a-z_]+\b|\bRP\d|\breturn (?:level|period)\b|\bpercentile\b|\bpathway/i.test(t)) return "internal_terms";
  if (t.split(/\s+/).length > MAX_WORDS) return "too_long";
  return null;
}

/** Returns the model text if it passes the checks, otherwise the engine's own summary. */
export function acceptExplanation(a: RiskAssessment, text: string): string {
  return checkExplanation(a, text) ? a.summary : text.trim();
}

// FloodGuard preliminary community risk assessment.
//
// Pure and deterministic: same inputs + same `now` => same output. This function owns the
// score and severity. Any LLM text is generated afterwards from this output and may only
// rephrase it (see src/explain/prompt.ts).
import {
  ASSESSMENT_VALIDITY_H,
  COMBINE,
  CONFIDENCE_LEVELS,
  DISCLAIMER,
  IMPORTANCE,
  METHOD_VERSION,
  QUALITY,
  SEVERE_GATE_FACTOR,
  SEVERITY_BANDS,
  STALE_AFTER_H,
} from "./config.ts";
import { combineNoisyOr, dedupeObservations, hoursBetween, weighObservation } from "./evidence.ts";
import {
  describeDischarge,
  describePercentile,
  scaleByPercentiles,
  scaleDischarge,
  scaleGauge,
} from "./factors.ts";
import { recommendedActions } from "./actions.ts";
import type {
  AssessmentInputs,
  ConfidenceLevel,
  ConfidenceResult,
  Driver,
  EvidenceItem,
  Freshness,
  InputKey,
  Provenance,
  RiskAssessment,
  Severity,
} from "./types.ts";

const SEVERITY_ORDER: Severity[] = ["low", "high", "severe", "critical"];
const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

interface InputState {
  available: boolean;
  freshness: number; // 0-1
  label: Freshness;
  at: string | null;
}

function freshnessOf(key: InputKey, timestamp: string | null | undefined, now: string): InputState {
  if (!timestamp) return { available: false, freshness: 0, label: "missing", at: null };
  const age = Math.max(0, hoursBetween(timestamp, now));
  const limit = STALE_AFTER_H[key];
  const f = Math.max(0, 1 - age / limit);
  const label: Freshness = f <= 0 ? "stale" : age < limit / 2 ? "fresh" : "aging";
  // Stale inputs are excluded from scoring, not just down-weighted.
  return { available: f > 0, freshness: f, label, at: timestamp };
}

/** Time that determines how current a provider value is: model run, observation, else retrieval. */
const asOf = (p: Provenance) => p.modelRunAt ?? p.observedAt ?? p.retrievedAt;

export function assessCommunity(inputs: AssessmentInputs): RiskAssessment {
  const { community: c, now } = inputs;
  const clim = c.climatology;
  const drivers: Driver[] = [];
  const evidence: EvidenceItem[] = [];
  const notes: string[] = [];
  const state: Partial<Record<InputKey, InputState>> = {};
  const missing = (k: InputKey, why: string) => {
    state[k] = { available: false, freshness: 0, label: "missing", at: null };
    notes.push(why);
  };

  // ---- Forecast rainfall (P) -------------------------------------------------------------
  let P: number | null = null;
  const rf = inputs.rainfallForecast;
  if (!rf) missing("forecast_rainfall", "No rainfall forecast available.");
  else if (!clim) missing("forecast_rainfall", "Rainfall forecast present but no local climatology to judge it against.");
  else {
    const st = freshnessOf("forecast_rainfall", asOf(rf), now);
    state.forecast_rainfall = st;
    if (st.available) {
      const s1 = scaleByPercentiles(rf.max1hMm, clim.rain1h);
      const s6 = scaleByPercentiles(rf.max6hMm, clim.rain6h);
      const s24 = scaleByPercentiles(rf.max24hMm, clim.rain24h);
      P = Math.max(s1, s6, s24);
      // Probability tempers a deterministic amount the provider itself thinks unlikely.
      if (rf.maxProbabilityPct != null) P *= 0.5 + 0.5 * Math.min(1, rf.maxProbabilityPct / 70);
      const worst = s1 >= s6 && s1 >= s24 ? ["1 h", rf.max1hMm, clim.rain1h] as const
        : s6 >= s24 ? ["6 h", rf.max6hMm, clim.rain6h] as const
        : ["24 h", rf.max24hMm, clim.rain24h] as const;
      drivers.push({
        factor: "forecast_rainfall",
        value: round(P),
        detail: `Forecast max ${worst[0]} rainfall ${worst[1].toFixed(1)} mm, ${describePercentile(worst[1], worst[2])}` +
          (rf.maxProbabilityPct != null ? `; peak probability ${rf.maxProbabilityPct}%` : ""),
      });
    } else notes.push("Rainfall forecast is stale and was not used.");
    evidence.push(ev("model_forecast", "forecast_rainfall", rf, st.label, QUALITY.forecast_rainfall));
  }

  // ---- Antecedent wetness (A) -----------------------------------------------------------
  let A: number | null = null;
  const an = inputs.antecedent;
  if (!an) {
    missing("antecedent_rainfall", "No recent rainfall record available.");
    missing("soil_moisture", "No soil moisture available.");
  } else if (!clim) {
    missing("antecedent_rainfall", "Recent rainfall present but no local climatology.");
    missing("soil_moisture", "Soil moisture present but no local climatology.");
  } else {
    const st = freshnessOf("antecedent_rainfall", asOf(an), now);
    state.antecedent_rainfall = st;
    const parts: number[] = [];
    if (st.available) parts.push(scaleByPercentiles(an.past7dMm, clim.rain7d));
    // Soil moisture is only used (and only mentioned) when it can be judged against local history.
    let soilUsed = false;
    if (an.soilMoisture != null && clim.soilMoisture) {
      const sst = freshnessOf("soil_moisture", asOf(an), now);
      state.soil_moisture = sst;
      if (sst.available) {
        parts.push(scaleByPercentiles(an.soilMoisture, clim.soilMoisture));
        soilUsed = true;
      }
    } else if (an.soilMoisture == null) {
      missing("soil_moisture", "Soil moisture not available for this location.");
    } else {
      missing("soil_moisture", "Soil moisture has no local history to compare against, so it was not used.");
    }
    if (parts.length) {
      A = Math.max(...parts);
      const soilText = soilUsed && an.soilMoisture != null ? `; soil moisture ${an.soilMoisture.toFixed(2)} m³/m³` : "";
      drivers.push({
        factor: "antecedent_rainfall",
        value: round(A),
        detail: `Past 7 days ${an.past7dMm.toFixed(0)} mm (${describePercentile(an.past7dMm, clim.rain7d)})${soilText}`,
      });
    }
    evidence.push(ev("reanalysis", "antecedent_rainfall", an, st.label, QUALITY.antecedent_rainfall));
  }

  // ---- River (Q): gauge preferred, model otherwise ---------------------------------------
  let Qmodel: number | null = null;
  let Qgauge: number | null = null;
  let dischargeAboveRp20 = false;
  const rd = inputs.riverDischarge;
  const rp = clim?.dischargeReturnPeriods;
  if (!rd) missing("river_discharge_model", c.mechanism === "pluvial"
    ? "No river discharge data (low importance for this community)."
    : "No river discharge forecast available.");
  else if (!rp) missing("river_discharge_model", "River discharge present but no return-period levels for this reach.");
  else {
    const st = freshnessOf("river_discharge_model", asOf(rd), now);
    state.river_discharge_model = st;
    if (st.available) {
      Qmodel = scaleDischarge(rd.peakForecastM3s, rp);
      dischargeAboveRp20 = rd.peakForecastM3s >= rp.rp20;
      drivers.push({
        factor: "river_discharge_model",
        value: round(Qmodel),
        detail: `${c.riverPoint?.name ?? "River"} forecast peak ${Math.round(rd.peakForecastM3s).toLocaleString("en")} m³/s on ${rd.peakDate.slice(0, 10)}, ${describeDischarge(rd.peakForecastM3s, rp)} (RP5 ${Math.round(rp.rp5).toLocaleString("en")} m³/s)`,
      });
    }
    evidence.push(ev("model_forecast", "river_discharge_model", rd, st.label, QUALITY.river_discharge_model));
  }
  const rg = inputs.riverGauge;
  if (!rg) state.river_gauge = { available: false, freshness: 0, label: "missing", at: null };
  else {
    const st = freshnessOf("river_gauge", asOf(rg), now);
    state.river_gauge = st;
    if (st.available) {
      Qgauge = scaleGauge(rg.levelM, rg.alertLevelM, rg.dangerLevelM);
      drivers.push({
        factor: "river_gauge",
        value: round(Qgauge),
        detail: `Gauge level ${rg.levelM.toFixed(2)} m (alert ${rg.alertLevelM} m, danger ${rg.dangerLevelM} m)`,
      });
    }
    evidence.push(ev("measurement", "river_gauge", rg, st.label, QUALITY.river_gauge));
  }
  const Q = Qgauge ?? Qmodel;
  const gaugeAboveDanger = !!rg && Qgauge != null && rg.levelM >= rg.dangerLevelM;

  // ---- Susceptibility (S) ---------------------------------------------------------------
  let S = COMBINE.defaultSusceptibility;
  if (c.susceptibility == null) missing("susceptibility", "Community susceptibility not yet assessed; neutral value used.");
  else {
    S = c.susceptibility;
    state.susceptibility = { available: true, freshness: 1, label: "fresh", at: null };
    evidence.push({
      type: "static", input: "susceptibility", source: c.susceptibilityNotes ?? "FloodGuard community profile",
      measured: false, resolutionKm: null, observedAt: null, forecastPeriod: null, retrievedAt: null,
      freshness: "fresh", weight: QUALITY.susceptibility,
    });
  }

  // ---- Verified observations (O) --------------------------------------------------------
  const weighted = dedupeObservations(inputs.observations)
    .map((o) => weighObservation(o, c, now))
    .filter((w) => w.weight > 0.01);
  const O = combineNoisyOr(weighted.map((w) => w.weight));
  state.verified_observations = { available: true, freshness: weighted.length ? 1 : 0.5, label: "fresh", at: null };
  for (const w of weighted) {
    evidence.push({
      type: w.obs.type === "official_warning" ? "official_warning" : w.obs.type === "verified_incident" ? "verified_incident" : "measurement",
      input: "verified_observations", source: w.obs.source, measured: true, resolutionKm: null,
      observedAt: w.obs.observedAt, forecastPeriod: null, retrievedAt: null, freshness: "fresh", weight: round(w.weight),
      note: `${w.obs.category}, ${w.distanceKm.toFixed(1)} km away, ${w.ageH.toFixed(1)} h ago`,
    });
  }
  if (weighted.length) {
    drivers.push({ factor: "verified_observations", value: round(O), detail: `${weighted.length} verified observation(s) weighted by reliability, distance and age` });
  }

  // ---- Pathways & score -----------------------------------------------------------------
  const Hp = P == null ? null : P * (COMBINE.pluvialAntecedentBase + COMBINE.pluvialAntecedentGain * (A ?? 0));
  const Hf = Q == null ? null : Math.max(Q, COMBINE.fluvialUpstreamMix * Q + (1 - COMBINE.fluvialUpstreamMix) * (A ?? 0));
  if (Hp != null) drivers.push({ factor: "pluvial_hazard", value: round(Hp), detail: "Rainfall-driven (surface water / drainage) pathway" });
  if (Hf != null) drivers.push({ factor: "fluvial_hazard", value: round(Hf), detail: "River-driven pathway" });

  // ---- Confidence -----------------------------------------------------------------------
  const importance = IMPORTANCE[c.mechanism];
  let num = 0;
  let den = 0;
  const missingInputs: InputKey[] = [];
  const staleInputs: InputKey[] = [];
  for (const k of Object.keys(importance) as InputKey[]) {
    const I = importance[k];
    if (I === 0) continue;
    const s = state[k];
    den += I;
    if (!s || s.label === "missing") { missingInputs.push(k); continue; }
    if (s.label === "stale") { staleInputs.push(k); continue; }
    num += I * s.freshness * QUALITY[k];
  }
  let agreement = 1;
  const Hmodel = Math.max(Hp ?? 0, Hf ?? 0);
  if (O >= 0.5 && Hmodel < 0.3) { agreement *= 0.8; notes.push("Verified observations indicate flooding that the forecast data does not explain."); }
  if (Qgauge != null && Qmodel != null && Math.abs(Qgauge - Qmodel) > 0.3) { agreement *= 0.8; notes.push("River gauge and river model disagree."); }
  if (rf?.maxProbabilityPct != null && rf.maxProbabilityPct < 30 && (P ?? 0) >= 0.5) { agreement *= 0.9; notes.push("Large forecast amount but low precipitation probability."); }
  const confScore = den > 0 ? (num / den) * agreement : 0;
  const hasPrimary = Hp != null || Hf != null;
  const level: ConfidenceLevel = !hasPrimary || confScore < CONFIDENCE_LEVELS.low ? "insufficient"
    : confScore >= CONFIDENCE_LEVELS.high ? "high" : confScore >= CONFIDENCE_LEVELS.medium ? "medium" : "low";
  const confidence: ConfidenceResult = {
    score: round(confScore), level, missingInputs, staleInputs, agreement: round(agreement), notes,
  };

  const assessedAt = now;
  const validUntil = new Date(Date.parse(now) + ASSESSMENT_VALIDITY_H * 3_600_000).toISOString();
  const dataFreshness = freshnessSummary(state);
  const base = {
    communityId: c.id,
    location: { name: c.name, lga: c.lga, state: c.state, lat: c.lat, lon: c.lon },
    assessmentType: "preliminary" as const,
    methodVersion: METHOD_VERSION,
    drivers, evidence, confidence,
    signalsUnderReview: inputs.unverifiedSignals?.length ?? 0,
    assessedAt, validUntil, nextReviewAt: validUntil, dataFreshness, disclaimer: DISCLAIMER,
  };

  if (level === "insufficient") {
    return {
      ...base, riskScore: null, severity: null, severityCappedBy: null, status: "insufficient_data",
      summary: `Risk information unavailable for ${c.name}: not enough current, reliable data. Missing: ${missingInputs.map(label).join(", ") || "primary hazard inputs"}.`,
      recommendedActions: recommendedActions(null, c.mechanism),
    };
  }

  const raw = Math.min(1, Hmodel * (COMBINE.susceptibilityBase + COMBINE.susceptibilityGain * S) + COMBINE.observationUplift * O);
  const score = Math.round(raw * 100);
  let severity = SEVERITY_BANDS.find((b) => score >= b.min)!.severity;
  let severityCappedBy: RiskAssessment["severityCappedBy"] = null;

  // ---- Gates: higher bands need specific corroboration ----------------------------------
  const strongVerified = weighted.some((w) => w.obs.type !== "official_warning" && w.weight >= 0.4 && w.obs.intensity >= 0.6);
  const activeFloodIncident = weighted.some((w) => w.obs.type === "verified_incident" && w.obs.category === "flooding" && w.weight >= 0.5);
  const officialSevere = weighted.some((w) => w.obs.type === "official_warning" && w.weight >= 0.5 && (w.obs.officialSeverity === "severe" || w.obs.officialSeverity === "critical"));
  const criticalGate = dischargeAboveRp20 || gaugeAboveDanger || activeFloodIncident || officialSevere;
  const severeGate = Math.max(P ?? 0, Q ?? 0) >= SEVERE_GATE_FACTOR || strongVerified || criticalGate;
  if (severity === "critical" && !criticalGate) {
    severityCappedBy = { wouldBe: "critical", reason: "Critical requires river above the 20-year level, a gauge above danger level, a verified active flood, or an official severe warning." };
    severity = "severe";
  }
  if (severity === "severe" && !severeGate) {
    severityCappedBy = severityCappedBy ?? { wouldBe: "severe", reason: "Severe requires a forecast or measured hazard at or above the local 99th percentile / 5-year river level, or strong verified evidence." };
    severity = "high";
  }
  // An official warning in force sets a floor: the engine never shows less than the authority.
  for (const w of weighted) {
    const os = w.obs.officialSeverity;
    if (w.obs.type === "official_warning" && os && w.weight >= 0.5 && rank(os) > rank(severity)) severity = os;
  }

  return {
    ...base,
    riskScore: score,
    severity,
    severityCappedBy,
    status: "active",
    summary: buildSummary(c.name, severity, drivers, confidence),
    recommendedActions: recommendedActions(severity, c.mechanism),
  };
}

function ev(type: EvidenceItem["type"], input: InputKey, p: Provenance, freshness: Freshness, weight: number): EvidenceItem {
  return {
    type, input, source: p.source, measured: p.measured, resolutionKm: p.resolutionKm ?? null,
    observedAt: p.observedAt ?? null, forecastPeriod: p.forecastPeriod ?? null, retrievedAt: p.retrievedAt,
    freshness, weight,
  };
}

function freshnessSummary(state: Partial<Record<InputKey, InputState>>): RiskAssessment["dataFreshness"] {
  const out: RiskAssessment["dataFreshness"] = { oldestInputAt: null };
  for (const [k, s] of Object.entries(state) as [InputKey, InputState][]) {
    out[k] = s.label;
    if (s.at && (!out.oldestInputAt || s.at < out.oldestInputAt)) out.oldestInputAt = s.at;
  }
  return out;
}

const LABELS: Record<string, string> = {
  forecast_rainfall: "rainfall forecast",
  antecedent_rainfall: "recent rainfall",
  soil_moisture: "soil moisture",
  river_discharge_model: "river discharge forecast",
  river_gauge: "river gauge",
  susceptibility: "community susceptibility profile",
  verified_observations: "verified observations",
};
const label = (k: string) => LABELS[k] ?? k;

function buildSummary(name: string, severity: Severity, drivers: Driver[], conf: ConfidenceResult): string {
  const top = drivers
    .filter((d) => d.factor !== "pluvial_hazard" && d.factor !== "fluvial_hazard")
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((d) => d.detail);
  const sev = severity.charAt(0).toUpperCase() + severity.slice(1);
  const main = top.length ? ` Main factors: ${top.join("; ")}.` : "";
  const gaps = conf.missingInputs.length ? ` Not available: ${conf.missingInputs.map(label).join(", ")}.` : "";
  return `${sev} preliminary flood risk for ${name} (${conf.level} confidence).${main}${gaps}`;
}

const round = (x: number) => Math.round(x * 100) / 100;

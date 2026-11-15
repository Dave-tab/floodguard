import { describe, expect, it } from "vitest";
import { assessCommunity } from "../src/engine/assess.ts";
import { acceptExplanation, buildExplanationPrompt, checkExplanation } from "../src/explain/prompt.ts";
import type { Community, RiskAssessment } from "../src/engine/types.ts";

const NOW = "2026-11-14T12:00:00.000Z";
const clim = {
  rain1h: { p90: 4.6, p99: 10.7, p999: 19 }, rain6h: { p90: 10, p99: 28, p999: 60 },
  rain24h: { p90: 14.5, p99: 38, p999: 95.6 }, rain7d: { p90: 68, p99: 131, p999: 219 },
  source: "t", period: "t",
};
const c: Community = {
  id: "ikorodu", name: "Ikorodu", lga: "Ikorodu", state: "Lagos", lat: 6.62, lon: 3.51,
  mechanism: "pluvial", setting: "urban", susceptibility: 0.6, climatology: clim,
};
const prov = { source: "Open-Meteo", retrievedAt: NOW, measured: false, resolutionKm: 9 };
const low: RiskAssessment = assessCommunity({
  community: c, now: NOW, riverDischarge: null, riverGauge: null, observations: [],
  rainfallForecast: { ...prov, max1hMm: 1, max6hMm: 2, max24hMm: 3, maxProbabilityPct: 40 },
  antecedent: { ...prov, observedAt: NOW, past72hMm: 5, past7dMm: 10, soilMoisture: null },
});
const unavailable: RiskAssessment = assessCommunity({
  community: c, now: NOW, riverDischarge: null, riverGauge: null, observations: [], rainfallForecast: null, antecedent: null,
});

describe("LLM explanation prompt", () => {
  it("passes only plain engine facts, including risk level, confidence and missing inputs", () => {
    const { system, user } = buildExplanationPrompt(low);
    const facts = JSON.parse(user);
    expect(facts.riskLevel).toBe("low");
    expect(facts.confidence).toBe(low.confidence.level);
    expect(facts.notAvailable.length).toBe(low.confidence.missingInputs.length);
    expect(user).not.toMatch(/_/); // no snake_case field values handed to the model
    expect(system).toMatch(/Use ONLY the facts in the JSON/);
    expect(system).toMatch(/Do not call this an official warning/);
  });
  it("describes an unavailable assessment as unavailable, not null", () => {
    expect(JSON.parse(buildExplanationPrompt(unavailable).user).riskLevel).toBe("unavailable");
  });
});

describe("LLM output check", () => {
  const ok = "Flood risk in Ikorodu is currently low, with medium confidence. Light rain is possible.";
  it("accepts faithful text", () => {
    expect(acceptExplanation(low, ok)).toBe(ok);
  });
  it.each([
    "Ikorodu faces critical flood risk tonight.",
    "The risk level is severe.",
    "Risk: HIGH. Stay alert.",
    "Conditions are critical in Ikorodu.",
    "This is a severe flooding situation.",
  ])("rejects text that contradicts the engine's severity: %s", (bad) => {
    expect(acceptExplanation(low, bad)).toBe(low.summary);
  });
  it.each([
    "This is an official warning from FloodGuard.",
    "Evacuate immediately.",
    "Residents must evacuate now.",
  ])("rejects official-warning or evacuation claims: %s", (bad) => {
    expect(acceptExplanation(low, bad)).toBe(low.summary);
  });
  it("rejects any severity claim when the engine returned no severity", () => {
    expect(acceptExplanation(unavailable, "Flood risk is low today.")).toBe(unavailable.summary);
  });
  it.each([
    "Flood risk in Ikorodu is low. If water rises, move to high ground.",
    "Risk is low. Avoid low-lying roads during heavy rain.",
    "Low flood risk. This is a preliminary assessment, not an official warning.",
  ])("does not over-block safe wording: %s", (good) => {
    expect(acceptExplanation(low, good)).toBe(good);
  });
  it.each([
    "Severity is null; status is insufficient_data.",
    "The river is below its 2-year return level.",
    "Peak flow is under RP5.",
    "Both rainfall-driven and river-driven pathways are low risk.",
  ])("rejects leaked field names and jargon: %s", (bad) => {
    expect(checkExplanation(low, bad)).toBe("internal_terms");
  });
  it("rejects replies over the word limit", () => {
    expect(checkExplanation(low, "Flood risk is low. " + "word ".repeat(80))).toBe("too_long");
  });
  it("falls back on empty output", () => {
    expect(acceptExplanation(low, "   ")).toBe(low.summary);
  });
});

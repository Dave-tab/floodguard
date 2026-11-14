import { describe, expect, it } from "vitest";
import { toFrontendRiskAssessment } from "../src/adapters/frontend.ts";
import { assessCommunity } from "../src/engine/assess.ts";
import type { Community } from "../src/engine/types.ts";

const NOW = "2026-11-14T12:00:00.000Z";
const clim = {
  rain1h: { p90: 4.6, p99: 10.7, p999: 19 }, rain6h: { p90: 10, p99: 28, p999: 60 },
  rain24h: { p90: 14.5, p99: 38, p999: 95.6 }, rain7d: { p90: 68, p99: 131, p999: 219 }, source: "t", period: "t",
};
const c: Community = { id: "ikorodu", name: "Ikorodu", lga: "Ikorodu", state: "Lagos", lat: 6.62, lon: 3.51, mechanism: "pluvial", setting: "urban", susceptibility: 0.6, climatology: clim };
const prov = { source: "Open-Meteo", retrievedAt: NOW, measured: false, resolutionKm: 9 };
const base = { community: c, now: NOW, riverDischarge: null, riverGauge: null, observations: [] };
const severe = assessCommunity({
  ...base,
  rainfallForecast: { ...prov, max1hMm: 25, max6hMm: 70, max24hMm: 110, maxProbabilityPct: 90 },
  antecedent: { ...prov, observedAt: NOW, past72hMm: 75, past7dMm: 150, soilMoisture: null },
});
const unavailable = assessCommunity({ ...base, rainfallForecast: null, antecedent: null });

describe("frontend adapter", () => {
  it("passes the approved severity through unchanged (no silent relabelling)", () => {
    const f = toFrontendRiskAssessment(severe, null, { now: NOW });
    expect(f.status).toBe("available");
    expect(f.level).toBe("severe");
    expect(f.score).toBe(severe.riskScore);
    expect(f.factors.every((x) => !x.id.endsWith("_hazard"))).toBe(true);
    expect(f.limitations.join(" ")).toMatch(/model estimates/);
  });
  it("maps insufficient data to no level and no score", () => {
    const f = toFrontendRiskAssessment(unavailable, null, { now: NOW });
    expect(f.status).toBe("insufficient_data");
    expect(f.level).toBeNull();
    expect(f.score).toBeNull();
    expect(f.missingInputs).toContain("Rainfall forecast");
  });
  it("shows an expired assessment as unavailable, never as its old level", () => {
    const f = toFrontendRiskAssessment(severe, null, { now: "2026-11-14T16:00:00.000Z" });
    expect(f.status).toBe("unavailable");
    expect(f.level).toBeNull();
    expect(f.limitations.join(" ")).toMatch(/expired/);
  });
  it("labels the explanation source", () => {
    const ai = toFrontendRiskAssessment(severe, { text: "x", source: "llm", model: "m" }, { now: NOW });
    const tpl = toFrontendRiskAssessment(severe, { text: severe.summary, source: "engine", model: "m" }, { now: NOW });
    expect(ai.explanationStatus).toBe("ai");
    expect(tpl.explanationStatus).toBe("deterministic_template");
    expect(toFrontendRiskAssessment(severe, null, { now: NOW }).explanationStatus).toBe("unavailable");
  });
});

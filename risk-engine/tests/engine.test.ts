import { describe, expect, it } from "vitest";
import { assessCommunity } from "../src/engine/assess.ts";
import { combineNoisyOr, dedupeObservations } from "../src/engine/evidence.ts";
import { scaleByPercentiles, scaleDischarge } from "../src/engine/factors.ts";
import type { AssessmentInputs, Community, Observation } from "../src/engine/types.ts";

const NOW = "2026-11-14T12:00:00.000Z";
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

const clim = {
  rain1h: { p90: 4.6, p99: 10.7, p999: 19 },
  rain6h: { p90: 10, p99: 28, p999: 60 },
  rain24h: { p90: 14.5, p99: 38, p999: 95.6 },
  rain7d: { p90: 68, p99: 131, p999: 219 },
  soilMoisture: { p90: 0.48, p99: 0.51, p999: 0.52 },
  dischargeReturnPeriods: { rp2: 20000, rp5: 24000, rp20: 29000 },
  source: "test",
  period: "test",
};

const urban: Community = {
  id: "ikorodu", name: "Ikorodu", lga: "Ikorodu", state: "Lagos", lat: 6.62, lon: 3.51,
  mechanism: "pluvial", setting: "urban", susceptibility: 0.6, climatology: clim,
};
const riverine: Community = {
  ...urban, id: "lokoja", name: "Lokoja", lga: "Lokoja", state: "Kogi", lat: 7.8, lon: 6.74,
  mechanism: "fluvial", setting: "riverine", riverPoint: { lat: 7.67, lon: 6.73, name: "Niger" },
};

const prov = { source: "Open-Meteo", retrievedAt: hoursAgo(0.5), measured: false, resolutionKm: 9 };
const rain = (max1h: number, max6h: number, max24h: number, prob: number | null = 90) => ({
  ...prov, forecastPeriod: { from: NOW, to: NOW }, max1hMm: max1h, max6hMm: max6h, max24hMm: max24h, maxProbabilityPct: prob,
});
const wetness = (past7d: number, soil: number | null = 0.45) => ({
  ...prov, observedAt: hoursAgo(1), past72hMm: past7d / 2, past7dMm: past7d, soilMoisture: soil,
});
const river = (peak: number) => ({
  source: "GloFAS", retrievedAt: hoursAgo(2), measured: false, resolutionKm: 5,
  forecastPeriod: { from: NOW, to: NOW }, peakForecastM3s: peak, peakDate: "2026-11-18", currentM3s: peak * 0.8,
});

const base = (c: Community, over: Partial<AssessmentInputs> = {}): AssessmentInputs => ({
  community: c, now: NOW, rainfallForecast: rain(1, 2, 3), antecedent: wetness(20), riverDischarge: null,
  riverGauge: null, observations: [], ...over,
});

const incident = (over: Partial<Observation> = {}): Observation => ({
  id: Math.random().toString(36).slice(2), type: "verified_incident", category: "flooding", intensity: 0.9,
  lat: 6.62, lon: 3.51, insideCommunity: true, observedAt: hoursAgo(1), source: "FloodGuard admin-verified report", ...over,
});

describe("factor scaling", () => {
  it("is relative to local percentiles", () => {
    expect(scaleByPercentiles(0, clim.rain24h)).toBe(0);
    expect(scaleByPercentiles(14.5, clim.rain24h)).toBeCloseTo(0.3);
    expect(scaleByPercentiles(38, clim.rain24h)).toBeCloseTo(0.6);
    expect(scaleByPercentiles(95.6, clim.rain24h)).toBeCloseTo(0.9);
    expect(scaleByPercentiles(1000, clim.rain24h)).toBe(1);
  });
  it("maps return periods to 0.4 / 0.6 / 0.85", () => {
    const rp = clim.dischargeReturnPeriods;
    expect(scaleDischarge(rp.rp2, rp)).toBeCloseTo(0.4);
    expect(scaleDischarge(rp.rp5, rp)).toBeCloseTo(0.6);
    expect(scaleDischarge(rp.rp20, rp)).toBeCloseTo(0.85);
  });
});

describe("assessment safety rules", () => {
  it("returns insufficient data, never Low, when primary inputs are missing", () => {
    const a = assessCommunity(base(urban, { rainfallForecast: null, antecedent: null }));
    expect(a.severity).toBeNull();
    expect(a.riskScore).toBeNull();
    expect(a.status).toBe("insufficient_data");
    expect(a.confidence.level).toBe("insufficient");
    expect(a.confidence.missingInputs).toContain("forecast_rainfall");
  });

  it("treats a stale forecast as missing", () => {
    const stale = { ...rain(30, 60, 120), retrievedAt: hoursAgo(10) };
    const a = assessCommunity(base(urban, { rainfallForecast: stale, antecedent: null }));
    expect(a.severity).toBeNull();
    expect(a.confidence.staleInputs).toContain("forecast_rainfall");
  });

  it("returns insufficient data without climatology rather than using fixed mm thresholds", () => {
    const a = assessCommunity(base({ ...urban, climatology: null }, { rainfallForecast: rain(40, 90, 150) }));
    expect(a.severity).toBeNull();
  });

  it("dry conditions give Low with a stated confidence", () => {
    const a = assessCommunity(base(urban));
    expect(a.severity).toBe("low");
    expect(a.confidence.level).not.toBe("insufficient");
    expect(a.assessmentType).toBe("preliminary");
    expect(Date.parse(a.validUntil) - Date.parse(a.assessedAt)).toBe(3 * 3_600_000);
  });

  it("extreme local rainfall on wet ground raises urban risk to Severe", () => {
    const a = assessCommunity(base(urban, { rainfallForecast: rain(25, 70, 110), antecedent: wetness(150, 0.515) }));
    expect(["severe", "critical"]).toContain(a.severity);
    // Without an incident, river exceedance or official warning, Critical is gated.
    expect(a.severity).toBe("severe");
  });

  it("caps Critical when no corroboration exists, and records why", () => {
    const a = assessCommunity(base({ ...urban, susceptibility: 1 }, { rainfallForecast: rain(40, 100, 200), antecedent: wetness(300, 0.52) }));
    expect(a.severity).toBe("severe");
    expect(a.severityCappedBy?.wouldBe).toBe("critical");
  });

  it("allows Critical when a verified active flood incident corroborates", () => {
    const a = assessCommunity(base({ ...urban, susceptibility: 1 }, {
      rainfallForecast: rain(40, 100, 200), antecedent: wetness(300, 0.52), observations: [incident()],
    }));
    expect(a.severity).toBe("critical");
  });

  it("unverified signals never change the score", () => {
    const signals = Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, category: "flooding", observedAt: hoursAgo(0.2), lat: 6.62, lon: 3.51 }));
    const without = assessCommunity(base(urban));
    const withSignals = assessCommunity(base(urban, { unverifiedSignals: signals }));
    expect(withSignals.riskScore).toBe(without.riskScore);
    expect(withSignals.severity).toBe("low");
    expect(withSignals.signalsUnderReview).toBe(50);
  });

  it("a single verified report cannot make a dry community Severe", () => {
    const a = assessCommunity(base(urban, { observations: [incident({ category: "blocked_drain", intensity: 0.5 })] }));
    expect(a.severity).toBe("low");
  });

  it("duplicate reports do not inflate evidence", () => {
    const dupes = Array.from({ length: 20 }, () => incident({ reporterId: "r1" }));
    expect(dedupeObservations(dupes)).toHaveLength(1);
    const one = assessCommunity(base(urban, { observations: [incident()] }));
    const many = assessCommunity(base(urban, { observations: dupes }));
    expect(many.riskScore).toBe(one.riskScore);
  });

  it("distant and old observations carry little weight", () => {
    const far = assessCommunity(base(urban, { observations: [incident({ insideCommunity: false, lat: 6.75, lon: 3.7 })] }));
    const old = assessCommunity(base(urban, { observations: [incident({ observedAt: hoursAgo(48) })] }));
    const near = assessCommunity(base(urban, { observations: [incident()] }));
    expect(far.riskScore!).toBeLessThan(near.riskScore!);
    expect(old.riskScore!).toBeLessThan(near.riskScore!);
  });

  it("noisy-OR saturates", () => {
    expect(combineNoisyOr([0.1, 0.1, 0.1])).toBeLessThan(0.3);
    expect(combineNoisyOr(Array(100).fill(0.8))).toBeLessThanOrEqual(1);
  });

  it("an official warning sets a severity floor", () => {
    const warning: Observation = {
      id: "w1", type: "official_warning", category: "flooding", intensity: 1, lat: 6.62, lon: 3.51,
      insideCommunity: true, observedAt: hoursAgo(5), source: "LASEMA", officialSeverity: "severe",
    };
    const a = assessCommunity(base(urban, { observations: [warning] }));
    expect(a.severity).toBe("severe");
  });
});

describe("riverine pathway", () => {
  it("river above the 20-year level permits Critical", () => {
    const a = assessCommunity(base({ ...riverine, susceptibility: 0.9 }, { riverDischarge: river(34000), antecedent: wetness(140, 0.51) }));
    expect(a.severity).toBe("critical");
    expect(a.drivers.find((d) => d.factor === "river_discharge_model")?.detail).toMatch(/20-year/);
  });

  it("river below the 2-year level stays Low with dry weather", () => {
    const a = assessCommunity(base(riverine, { riverDischarge: river(8000) }));
    expect(a.severity).toBe("low");
  });

  it("missing river data lowers confidence for a riverine community more than for an urban one", () => {
    const r = assessCommunity(base(riverine));
    const u = assessCommunity(base(urban));
    expect(r.confidence.score).toBeLessThan(u.confidence.score);
    expect(r.confidence.missingInputs).toContain("river_discharge_model");
  });

  it("modelled data alone never reaches High confidence", () => {
    const a = assessCommunity(base(riverine, { riverDischarge: river(26000) }));
    expect(a.confidence.level).not.toBe("high");
  });
});

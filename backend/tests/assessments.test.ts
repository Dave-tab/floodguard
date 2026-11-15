import { describe, expect, it } from "vitest";
import { callWeight } from "../src/assessments/budget.ts";
import { cellKey, CLIMATOLOGY_WEIGHT } from "../src/assessments/climatology.ts";
import { chooseExplanation, riskFromRow, type CachedAssessment } from "../src/assessments/service.ts";
import type { RiskRow } from "../src/db/schema.ts";
import { Scheduler } from "../src/scheduler.ts";
import { ids, NOW, setup } from "./fakes.ts";

const row = (hoursAgo: number, o: Partial<RiskRow> = {}): RiskRow => ({
  id: "r", community_id: ids.ikorodu, risk_level: "HIGH", score: 55, confidence: "MEDIUM", explanation: "x", explanation_source: "AI",
  explanation_provider: "m", explanation_generated_at: null, recommended_actions: [], data_available: true, limitations: [], inputs_used: [],
  inputs_missing: [], input_summary: {}, data_freshness: {}, methodology_version: "fg-risk-0.1.0",
  assessed_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), ...o,
});
const ikorodu = (db: { communities: { id: string }[] }) => db.communities.find((c) => c.id === ids.ikorodu)! as never;

describe("reading stored rows", () => {
  it("shows a stored row within 3 h, and an older row as unavailable (never as Low)", () => {
    expect(riskFromRow(row(1), NOW)).toMatchObject({ status: "available", level: "high", confidenceLevel: "medium" });
    const old = riskFromRow(row(4), NOW);
    expect(old).toMatchObject({ status: "unavailable", level: null, score: null });
  });
  it("uses validUntil from input_summary when present", () => {
    const r = row(1, { input_summary: { validUntil: new Date(NOW.getTime() - 60_000).toISOString() } });
    expect(riskFromRow(r, NOW).status).toBe("unavailable");
  });
  it("does not invent a level for MODERATE or UNAVAILABLE", () => {
    const m = riskFromRow(row(1, { risk_level: "MODERATE" }), NOW);
    expect(m).toMatchObject({ status: "insufficient_data", level: null, score: null });
    expect(m.limitations.join(" ")).toMatch(/moderate/);
    expect(riskFromRow(row(1, { risk_level: "UNAVAILABLE", data_available: false, score: null }), NOW)).toMatchObject({ level: null, status: "insufficient_data" });
  });
});

describe("expiry", () => {
  it("drops expired assessments from the map and shows them as unavailable", async () => {
    let t = NOW;
    const { app, assessments, locations, db, pipe } = await setup({ now: () => t });
    pipe.rain = "wet";
    await app.inject({ url: `/communities/${ids.ikorodu}/overview` });
    expect((await app.inject({ url: "/risk-assessments?status=active" })).json().data).toHaveLength(1);
    t = new Date(NOW.getTime() + 4 * 3_600_000);
    expect((await app.inject({ url: "/risk-assessments?status=active" })).json().data).toEqual([]);
    const { risk } = await assessments.forCommunity(ikorodu(db), await locations.index(), { allowRun: false });
    expect(risk).toMatchObject({ status: "unavailable", level: null, score: null });
  });
  it("reports missing coordinates as insufficient data, not Low", async () => {
    const { app } = await setup();
    const { risk, weather } = (await app.inject({ url: `/communities/${ids.noCoords}/overview` })).json().data;
    expect(risk).toMatchObject({ status: "insufficient_data", level: null, score: null });
    expect(weather.status).toBe("unavailable");
  });
});

describe("storing assessments", () => {
  it("fills every NOT NULL column with live enum values", async () => {
    const { assessments, locations, db, pipe } = await setup();
    pipe.rain = "wet";
    const out = await assessments.assess(ikorodu(db), await locations.index());
    expect(out!.storedInDb).toBe(true);
    const r = db.risk[0]!;
    expect(r).toMatchObject({
      community_id: ids.ikorodu, risk_level: "HIGH", confidence: "LOW", data_available: true, explanation_source: "AI",
      explanation_provider: "fake-model", methodology_version: "fg-risk-0.1.0",
    });
    expect(r.inputs_used).toContain("Rainfall forecast");
    expect(r.inputs_missing).toContain("Local flood-history profile");
    expect(r.input_summary).toMatchObject({ engineSeverity: "high", validUntil: out!.assessment.validUntil, nextReviewAt: out!.assessment.nextReviewAt, status: "active" });
    expect(r.limitations.length).toBeGreaterThan(0);
    expect(r.explanation_generated_at).toBe(NOW.toISOString());
  });
  it("never relabels severe: the row is refused by the enum, logged, and kept in the cache only", async () => {
    const { assessments, locations, db, pipe, warnings, app } = await setup();
    pipe.rain = "heavy";
    const out = await assessments.assess(ikorodu(db), await locations.index());
    expect(out!.assessment.severity).toBe("severe");
    expect(out!.storedInDb).toBe(false);
    expect(db.risk).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/no SEVERE value/);
    const { risk } = (await app.inject({ url: `/communities/${ids.ikorodu}/overview` })).json().data;
    expect(risk.level).toBe("severe");
  });
  it("stores insufficient data as UNAVAILABLE with no score", async () => {
    const { assessments, locations, db, pipe } = await setup();
    pipe.rain = "dry";
    const c = { ...ikorodu(db) as object, latitude: 11.0, longitude: 7.7 } as never; // no climatology offline
    const out = await assessments.assess(c, await locations.index());
    expect(out!.assessment.severity).toBeNull();
    expect(db.risk[0]).toMatchObject({ risk_level: "UNAVAILABLE", data_available: false, score: null, confidence: "INSUFFICIENT" });
  });
  it("marks the engine summary as FALLBACK when no AI is configured", async () => {
    const { assessments, locations, db } = await setup({ explain: null });
    await assessments.assess(ikorodu(db), await locations.index());
    expect(db.risk[0]).toMatchObject({ explanation_source: "FALLBACK", explanation_provider: "fg-risk-engine" });
  });
});

describe("assessment pipeline", () => {
  it("assesses on demand, caches and serves the map", async () => {
    const { app, pipe } = await setup();
    pipe.rain = "wet";
    const { risk } = (await app.inject({ url: `/communities/${ids.ikorodu}/overview` })).json().data;
    expect(risk).toMatchObject({ status: "available", level: "high", explanationStatus: "ai" });
    const map = (await app.inject({ url: "/risk-assessments?status=active" })).json().data;
    expect(map[0]).toMatchObject({ communityId: ids.ikorodu, severity: "high", status: "active", latitude: 6.62 });
    expect(pipe.calls).toBe(1); // second request used the cache
  });

  it("requests an AI explanation only when severity or confidence level changes", async () => {
    const { assessments, locations, db, pipe, explainCalls } = await setup();
    const idx = await locations.index();
    pipe.rain = "dry";
    await assessments.assess(ikorodu(db), idx);
    await assessments.assess(ikorodu(db), idx);
    expect(explainCalls).toHaveLength(1);
    pipe.rain = "wet";
    await assessments.assess(ikorodu(db), idx);
    expect(explainCalls).toHaveLength(2);
    expect(pipe.calls).toBe(3);
  });

  it("uses VERIFIED reports as evidence and PENDING reports only as signals", async () => {
    const { assessments, locations, db } = await setup();
    db.addReport("PENDING");
    db.addReport("PENDING");
    db.addReport("REJECTED");
    db.addReport("IN_PROGRESS");
    const out = await assessments.assess(ikorodu(db), await locations.index());
    expect(out!.assessment.signalsUnderReview).toBe(2);
    expect(out!.assessment.evidence.some((e) => e.type === "verified_incident")).toBe(false);
    db.addReport("VERIFIED");
    const out2 = await assessments.assess(ikorodu(db), await locations.index());
    expect(out2!.assessment.evidence.some((e) => e.type === "verified_incident")).toBe(true);
  });

  it("chooseExplanation compares severity and confidence level", () => {
    const base = { assessment: { severity: "high", confidence: { level: "medium" } }, explanation: { text: "t", source: "llm", model: "m" } } as unknown as CachedAssessment;
    const next = (severity: string, level: string) => ({ severity, confidence: { level } }) as unknown as CachedAssessment["assessment"];
    expect(chooseExplanation(base, next("high", "medium"))).toBe("reuse");
    expect(chooseExplanation(base, next("severe", "medium"))).toBe("request");
    expect(chooseExplanation(base, next("high", "low"))).toBe("request");
    expect(chooseExplanation(null, next("high", "medium"))).toBe("request");
  });

  it("scheduler reassesses communities whose reports were reviewed since the last poll", async () => {
    let t = NOW;
    const { db, assessments, locations, pipe } = await setup({ now: () => t });
    const sched = new Scheduler(db, locations, assessments, { now: () => t, spacingMs: 0 });
    t = new Date(NOW.getTime() + 60_000);
    db.addReport("VERIFIED", { reviewed_at: t.toISOString() });
    expect(await sched.pollReviews()).toEqual([ids.ikorodu]);
    expect(await sched.pollReviews()).toEqual([]);
    expect(await sched.runFull()).toBe(1); // only the active community with coordinates
    expect(pipe.calls).toBe(2);
  });
});

describe("Open-Meteo budget", () => {
  it("estimates call weights", () => {
    expect(callWeight(7, 10)).toBe(1);
    expect(callWeight(1, 33)).toBeCloseTo(2.36, 2);
    expect(Math.round(CLIMATOLOGY_WEIGHT)).toBe(261);
  });
  it("groups nearby communities into one ERA5 cell", () => {
    expect(cellKey(6.62, 3.51)).toBe(cellKey(6.58, 3.45));
    expect(cellKey(6.62, 3.51)).not.toBe(cellKey(6.9, 3.51));
  });
  it("returns insufficient data (not Low) when a non-pilot cell has no climatology", async () => {
    const { assessments, locations, db, pipe } = await setup();
    pipe.rain = "heavy";
    const c = { ...ikorodu(db) as object, latitude: 11.0, longitude: 7.7 } as never;
    const out = await assessments.assess(c, await locations.index());
    expect(out!.assessment.severity).toBeNull();
    expect(out!.assessment.status).toBe("insufficient_data");
  });
});

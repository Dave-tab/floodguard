import { describe, expect, it } from "vitest";
import { callWeight } from "../src/assessments/budget.ts";
import { cellKey, CLIMATOLOGY_WEIGHT } from "../src/assessments/climatology.ts";
import { chooseExplanation, riskFromRow, type CachedAssessment } from "../src/assessments/service.ts";
import type { RiskRow } from "../src/db/schema.ts";
import { Scheduler } from "../src/scheduler.ts";
import { ids, NOW, setup } from "./fakes.ts";

const row = (hoursAgo: number): RiskRow => ({
  id: "r", community_id: ids.ikorodu, risk_level: "high", score: 55, confidence: "medium", explanation: "x", explanation_source: "ai",
  assessed_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), data_freshness: {}, recommended_actions: [],
});

describe("expiry", () => {
  it("shows a stored row within 3 h, and an older row as unavailable (never as Low)", () => {
    expect(riskFromRow(row(1), NOW)).toMatchObject({ status: "available", level: "high" });
    const old = riskFromRow(row(4), NOW);
    expect(old.status).toBe("unavailable");
    expect(old.level).toBeNull();
    expect(old.score).toBeNull();
  });
  it("shows an expired cached assessment as unavailable when it cannot be refreshed", async () => {
    let t = NOW;
    const { app, assessments, locations, db, pipe } = await setup({ now: () => t });
    pipe.heavy = true;
    await app.inject({ url: `/communities/${ids.ikorodu}/overview` }); // creates a cached assessment
    expect((await app.inject({ url: "/risk-assessments?status=active" })).json().data).toHaveLength(1);
    t = new Date(NOW.getTime() + 4 * 3_600_000);
    // The map endpoint drops it once validUntil has passed (it never runs new assessments).
    expect((await app.inject({ url: "/risk-assessments?status=active" })).json().data).toEqual([]);
    // Without a refresh, the card shows it as unavailable rather than its old level.
    const { risk } = await assessments.forCommunity(db.communities[0]!, await locations.index(), { allowRun: false });
    expect(risk).toMatchObject({ status: "unavailable", level: null, score: null });
  });
  it("reports missing coordinates as insufficient data, not Low", async () => {
    const { app } = await setup();
    const res = await app.inject({ url: `/communities/${ids.noCoords}/overview` });
    const { risk, weather } = res.json().data;
    expect(risk).toMatchObject({ status: "insufficient_data", level: null, score: null });
    expect(weather.status).toBe("unavailable");
  });
});

describe("assessment pipeline", () => {
  it("assesses on demand, caches, records a row and serves the map", async () => {
    const { app, db, pipe } = await setup();
    pipe.heavy = true;
    const res = await app.inject({ url: `/communities/${ids.ikorodu}/overview` });
    const { risk } = res.json().data;
    expect(risk.status).toBe("available");
    expect(["high", "severe", "critical"]).toContain(risk.level);
    expect(risk.explanationStatus).toBe("ai");
    expect(db.risk).toHaveLength(1);
    expect(db.risk[0]).toMatchObject({ community_id: ids.ikorodu, risk_level: risk.level, explanation_source: "ai" });
    const map = (await app.inject({ url: "/risk-assessments?status=active" })).json().data;
    expect(map[0]).toMatchObject({ communityId: ids.ikorodu, severity: risk.level, status: "active", latitude: 6.62 });
    expect(pipe.calls).toBe(1); // second request used the cache
  });

  it("requests an AI explanation only when severity or confidence level changes", async () => {
    const { assessments, locations, db, pipe, explainCalls } = await setup();
    const idx = await locations.index();
    const c = db.communities[0]!;
    pipe.heavy = false;
    await assessments.assess(c, idx);
    await assessments.assess(c, idx);
    expect(explainCalls).toHaveLength(1);
    pipe.heavy = true;
    await assessments.assess(c, idx);
    expect(explainCalls).toHaveLength(2);
    expect(pipe.calls).toBe(3);
  });

  it("uses verified reports as evidence and pending reports only as signals", async () => {
    const { assessments, locations, db } = await setup();
    db.addReport("pending");
    db.addReport("pending");
    db.addReport("rejected");
    const out = await assessments.assess(db.communities[0]!, await locations.index());
    expect(out!.assessment.signalsUnderReview).toBe(2);
    expect(out!.assessment.evidence.some((e) => e.type === "verified_incident")).toBe(false);
    db.addReport("verified");
    const out2 = await assessments.assess(db.communities[0]!, await locations.index());
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
    db.addReport("verified", { reviewed_at: t.toISOString() });
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
    pipe.heavy = true;
    const c = { ...db.communities[0]!, latitude: 11.0, longitude: 7.7 }; // far from all pilots; archive fetch fails offline
    const out = await assessments.assess(c, await locations.index());
    expect(out!.assessment.severity).toBeNull();
    expect(out!.assessment.status).toBe("insufficient_data");
  });
});

import { describe, expect, it } from "vitest";
import { reportSchema, reviewSchema } from "../src/app.ts";
import { ids, setup } from "./fakes.ts";

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const validReport = { communityId: ids.ikorodu, category: "blocked_drainage", description: "Drain by the school is full of refuse" };

describe("input validation", () => {
  it("accepts a valid report and trims the description", () => {
    expect(reportSchema.parse({ ...validReport, description: "  Drain by the school is blocked  " }).description).toBe("Drain by the school is blocked");
  });
  it.each<[Record<string, unknown>, string]>([
    [{ ...validReport, category: "fire" }, "unknown category"],
    [{ ...validReport, category: "FLOODING" }, "database enum instead of contract value"],
    [{ ...validReport, description: "short" }, "short description"],
    [{ ...validReport, description: "x".repeat(1001) }, "long description"],
    [{ ...validReport, latitude: 6.6 }, "latitude without longitude"],
    [{ ...validReport, latitude: 95, longitude: 3 }, "latitude out of range"],
    [{ ...validReport, status: "verified" }, "client-supplied status"],
    [{ ...validReport, communityId: "not-a-uuid" }, "bad community id"],
  ])("rejects %j (%s)", (body) => {
    expect(reportSchema.safeParse(body).success).toBe(false);
  });
  it("only allows verified or rejected as review decisions", () => {
    expect(reviewSchema.safeParse({ decision: "verified" }).success).toBe(true);
    expect(reviewSchema.safeParse({ decision: "pending" }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "resolved" }).success).toBe(false);
  });
});

describe("report submission", () => {
  it("requires a signed-in user", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "POST", url: "/reports", payload: validReport })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("bad") })).statusCode).toBe(401);
  });
  it("stores a PENDING report with a reference code, DB category and the token's user", async () => {
    const { app, db } = await setup();
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({ status: "pending", category: "blocked_drainage", dbCategory: "BLOCKED_DRAINAGE" });
    expect(data.referenceCode).toMatch(/^FG-261115-[2-9A-HJ-NP-Z]{5}$/);
    expect(db.reports.at(-1)).toMatchObject({ reporter_id: ids.resident, status: "PENDING", category: "BLOCKED_DRAINAGE", reference_code: data.referenceCode });
  });
  it("maps overflowing_waterway to the FLOODING enum", async () => {
    const { app, db } = await setup();
    await app.inject({ method: "POST", url: "/reports", payload: { ...validReport, category: "overflowing_waterway" }, headers: auth("resident-token") });
    expect(db.reports.at(-1)!.category).toBe("FLOODING");
  });
  it("retries when a reference code already exists", async () => {
    const { app, db } = await setup();
    db.duplicateCodes = 2;
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") });
    expect(res.statusCode).toBe(201);
    expect(db.reports).toHaveLength(1);
  });
  it("rejects reports for inactive or unknown communities", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "POST", url: "/reports", payload: { ...validReport, communityId: ids.inactive }, headers: auth("resident-token") });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty("message");
  });
  it("limits repeated submissions", async () => {
    const { app } = await setup();
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") })).statusCode);
    expect(codes).toEqual([201, 201, 201, 429]);
  });
  it("returns only the caller's own reports, with unapproved statuses shown raw", async () => {
    const { app, db } = await setup();
    db.addReport("IN_PROGRESS");
    db.addReport("PENDING", { reporter_id: ids.admin });
    const data = (await app.inject({ url: "/reports/mine", headers: auth("resident-token") })).json().data;
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("in_progress");
  });
});

describe("admin review", () => {
  it("forbids residents", async () => {
    const { app, db } = await setup();
    const r = db.addReport("PENDING");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified" }, headers: auth("resident-token") });
    expect(res.statusCode).toBe(403);
    expect(r.status).toBe("PENDING");
  });
  it("treats a lowercase 'admin' role as not admin (live enum is ADMIN)", async () => {
    const { app, db } = await setup();
    db.roles.set(ids.resident, "admin");
    const r = db.addReport("PENDING");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified" }, headers: auth("resident-token") });
    expect(res.statusCode).toBe(403);
  });
  it("verifies a PENDING report once, records reviewer + history and reassesses", async () => {
    const { app, db, pipe } = await setup();
    const r = db.addReport("PENDING");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified", reviewNote: "Confirmed by phone" }, headers: auth("admin-token") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reassessment: "started", data: { status: "verified" } });
    expect(r).toMatchObject({ status: "VERIFIED", reviewed_by: ids.admin, admin_note: "Confirmed by phone" });
    expect(db.history).toEqual([{ report_id: r.id, previous_status: "PENDING", new_status: "VERIFIED", changed_by: ids.admin, note: "Confirmed by phone" }]);
    await new Promise((x) => setTimeout(x, 20));
    expect(pipe.calls).toBe(1);
    const again = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "rejected" }, headers: auth("admin-token") });
    expect(again.statusCode).toBe(409);
  });
  it("does not review reports in other states (e.g. IN_PROGRESS)", async () => {
    const { app, db } = await setup();
    const r = db.addReport("IN_PROGRESS");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified" }, headers: auth("admin-token") });
    expect(res.statusCode).toBe(409);
    expect(db.history).toEqual([]);
  });
});

describe("public hazard visibility", () => {
  it("returns VERIFIED reports only, without reporter identity", async () => {
    const { app, db } = await setup();
    for (const s of ["PENDING", "REJECTED", "IN_PROGRESS", "RESOLVED"] as const) db.addReport(s);
    const v = db.addReport("VERIFIED", { latitude: 6.6, longitude: 3.5 });
    const data = (await app.inject({ url: "/hazards?status=verified" })).json().data;
    expect(data.map((h: { id: string }) => h.id)).toEqual([v.id]);
    expect(JSON.stringify(data)).not.toContain(ids.resident);
    expect(data[0]).toMatchObject({ status: "verified", category: "flooded_road", communityName: "Ikorodu Central", lga: "IKORODU", state: "Lagos", latitude: 6.6 });
  });
  it("maps categories without a contract value and keeps the raw one", async () => {
    const { app, db } = await setup();
    db.addReport("VERIFIED", { category: "EROSION" });
    db.addReport("VERIFIED", { category: "FLOODING" });
    const data = (await app.inject({ url: "/hazards" })).json().data;
    expect(data.map((h: { category: string; dbCategory: string }) => [h.category, h.dbCategory])).toEqual([["other", "EROSION"], ["overflowing_waterway", "FLOODING"]]);
  });
  it("refuses to list non-verified statuses", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/hazards?status=pending" })).statusCode).toBe(403);
  });
  it("shows only verified hazards in the community overview", async () => {
    const { app, db } = await setup();
    db.addReport("PENDING");
    db.addReport("VERIFIED");
    const res = await app.inject({ url: `/communities/${ids.ikorodu}/overview` });
    expect(res.json().data.verifiedHazards).toHaveLength(1);
  });
});

describe("locations", () => {
  it("resolves a frontend dataset LGA id by name within the state", async () => {
    const { app } = await setup();
    const data = (await app.inject({ url: "/locations/lgas/NG025012/communities" })).json().data;
    expect(data.map((c: { name: string }) => c.name)).toEqual(["Ikorodu Central", "No Coords"]);
    expect(data[0]).toMatchObject({ lgaId: ids.ikoroduLga, stateId: ids.lagos, stateName: "Lagos", verificationStatus: "verified" });
    expect(data[1].verificationStatus).toBe("under_review");
  });
  it("accepts the DB uuid too, and resolves by code", async () => {
    const { app, db } = await setup();
    expect((await app.inject({ url: `/locations/lgas/${ids.ikoroduLga}/communities` })).json().data).toHaveLength(2);
    db.communities[0]!.lga_id = ids.etiOsaLga;
    expect((await app.inject({ url: "/locations/lgas/NG025009/communities" })).json().data).toHaveLength(1);
    expect((await app.inject({ url: "/locations/lgas/NG999999/communities" })).statusCode).toBe(404);
  });
  it("serves DB states/LGAs when present, else the bundled dataset", async () => {
    const db1 = await setup();
    const states = (await db1.app.inject({ url: "/locations/states" })).json();
    expect(states.data).toEqual([{ id: ids.lagos, name: "Lagos", code: null, isDemoData: false }]);
    expect((await db1.app.inject({ url: "/locations/states/NG025/lgas" })).json().data).toHaveLength(2);
    const ds = await setup({ emptyAdminTables: true });
    const dsStates = (await ds.app.inject({ url: "/locations/states" })).json();
    expect(dsStates.data[0].id).toBe("NG025");
    expect(dsStates.source).toMatch(/Open Admin Data/);
    expect((await ds.app.inject({ url: "/locations/lgas/NG025012/communities" })).json().data).toEqual([]);
  });
  it("404s for inactive communities", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: `/locations/communities/${ids.inactive}` })).statusCode).toBe(404);
  });
  it("matches nearby coordinates honestly", async () => {
    const { app } = await setup();
    const near = await app.inject({ method: "POST", url: "/locations/resolve", payload: { latitude: 6.621, longitude: 3.511 } });
    expect(near.json().data).toMatchObject({ matchStatus: "matched", location: { lga: { id: ids.ikoroduLga } } });
    const far = await app.inject({ method: "POST", url: "/locations/resolve", payload: { latitude: 9.06, longitude: 7.49 } });
    expect(far.json().data).toMatchObject({ matchStatus: "unmatched", location: { state: null, lga: null, community: null } });
  });
  it("never invents emergency numbers", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/safety/hotlines" })).json()).toEqual({ data: [] });
  });
});

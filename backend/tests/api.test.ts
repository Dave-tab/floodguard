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
  it("inserts as the user; the database sets reporter, reference code and PENDING", async () => {
    const { app, db } = await setup();
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({ status: "pending", category: "blocked_drainage", dbCategory: "BLOCKED_DRAINAGE" });
    expect(data.referenceCode).toMatch(/^FG-[0-9A-F]{10}$/);
    expect(db.reports.at(-1)).toMatchObject({ reporter_id: ids.resident, status: "PENDING", category: "BLOCKED_DRAINAGE", reference_code: data.referenceCode });
  });
  it("maps overflowing_waterway to the FLOODING enum", async () => {
    const { app, db } = await setup();
    await app.inject({ method: "POST", url: "/reports", payload: { ...validReport, category: "overflowing_waterway" }, headers: auth("resident-token") });
    expect(db.reports.at(-1)!.category).toBe("FLOODING");
  });
  it("answers 503, not a fake success, when the server cannot insert as the user", async () => {
    const { app, db } = await setup();
    db.userClientConfigured = false;
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") });
    expect(res.statusCode).toBe(503);
    expect(db.reports).toHaveLength(0);
  });
  it("creates a missing profile on first report without setting a role", async () => {
    const { app, db } = await setup();
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("new-user-token") });
    expect(res.statusCode).toBe(201);
    expect(db.profileInserts).toEqual([{ id: ids.newUser, full_name: "Nora New" }]);
    expect(Object.keys(db.profileInserts[0]!)).not.toContain("role");
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

describe("signed-in user", () => {
  it("reports the role from the profile, lowercase", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/me", headers: auth("admin-token") })).json().data).toMatchObject({ role: "admin", fullName: "Ada Admin" });
    expect((await app.inject({ method: "GET", url: "/me", headers: auth("resident-token") })).json().data.role).toBe("resident");
    expect((await app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
  });
  it("never changes an existing role when ensuring a profile", async () => {
    const { app, db } = await setup();
    await app.inject({ method: "GET", url: "/me", headers: auth("admin-token") });
    expect(db.profileInserts).toHaveLength(0);
    expect(db.roles.get(ids.admin)).toBe("ADMIN");
  });
  it("returns the caller's own email and preferred community", async () => {
    const { app, db } = await setup();
    db.preferred.set(ids.resident, ids.ikorodu);
    const me = (await app.inject({ method: "GET", url: "/me", headers: auth("resident-token") })).json().data;
    expect(me).toMatchObject({ id: ids.resident, email: "rita@example.test", preferredCommunityId: ids.ikorodu });
  });
});

describe("PATCH /me (preferred community)", () => {
  const patch = (payload: unknown, token?: string) => ({ method: "PATCH" as const, url: "/me", payload: payload as object, headers: token ? auth(token) : {} });
  it("requires sign-in", async () => {
    const { app, db } = await setup();
    expect((await app.inject(patch({ preferredCommunityId: ids.ikorodu }))).statusCode).toBe(401);
    expect(db.profileUpdates).toHaveLength(0);
  });
  it("sets only the caller's own preferred community", async () => {
    const { app, db } = await setup();
    const res = await app.inject(patch({ preferredCommunityId: ids.ikorodu }, "resident-token"));
    expect(res.statusCode).toBe(200);
    expect(db.profileUpdates).toEqual([{ id: ids.resident, preferred_community_id: ids.ikorodu }]);
    expect(db.roles.get(ids.resident)).toBe("RESIDENT");
  });
  it("clears it with null", async () => {
    const { app, db } = await setup();
    db.preferred.set(ids.resident, ids.ikorodu);
    expect((await app.inject(patch({ preferredCommunityId: null }, "resident-token"))).statusCode).toBe(200);
    expect(db.preferred.get(ids.resident)).toBeNull();
  });
  it.each<[Record<string, unknown>, string]>([
    [{ preferredCommunityId: ids.inactive }, "inactive community"],
    [{ preferredCommunityId: "99999999-9999-4999-8999-999999999999" }, "unknown community"],
    [{ preferredCommunityId: "not-a-uuid" }, "bad id"],
    [{ preferredCommunityId: ids.ikorodu, role: "ADMIN" }, "role field"],
    [{ role: "ADMIN" }, "role only"],
    [{}, "missing field"],
  ])("rejects %j (%s) and writes nothing", async (body) => {
    const { app, db } = await setup();
    expect((await app.inject(patch(body, "resident-token"))).statusCode).toBe(400);
    expect(db.profileUpdates).toHaveLength(0);
    expect(db.roles.get(ids.resident)).toBe("RESIDENT");
  });
});

describe("admin endpoints", () => {
  const adminGets = ["/admin/summary", "/admin/reports", "/admin/communities"];
  it.each(adminGets)("%s requires an ADMIN profile", async (url) => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url, headers: auth("resident-token") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: auth("admin-token") })).statusCode).toBe(200);
  });
  it("summarises counts and recent reports from the live-shaped data", async () => {
    const { app, db } = await setup();
    db.addReport("PENDING");
    db.addReport("VERIFIED");
    db.addReport("REJECTED");
    const data = (await app.inject({ method: "GET", url: "/admin/summary", headers: auth("admin-token") })).json().data;
    expect(data).toMatchObject({ activeCommunities: 2, totalReports: 3, pendingReports: 1, verifiedReports: 1, elevatedAssessments: 0 });
    expect(data.recentReports).toHaveLength(3);
    expect(data.recentReports[0]).toMatchObject({ communityName: "Ikorodu Central", lga: "IKORODU", state: "Lagos" });
  });
  it("lists every report status for admins, filtered by lowercase status", async () => {
    const { app, db } = await setup();
    db.addReport("PENDING");
    db.addReport("IN_PROGRESS");
    const all = (await app.inject({ method: "GET", url: "/admin/reports", headers: auth("admin-token") })).json().data;
    expect(all.map((r: { status: string }) => r.status).sort()).toEqual(["in_progress", "pending"]);
    const pending = (await app.inject({ method: "GET", url: "/admin/reports?status=pending", headers: auth("admin-token") })).json().data;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ referenceCode: expect.any(String), reporterId: ids.resident, communityName: "Ikorodu Central" });
    expect((await app.inject({ method: "GET", url: "/admin/reports?status=PENDING", headers: auth("admin-token") })).statusCode).toBe(400);
  });
  it("shows the latest assessment per community, assessing nothing new", async () => {
    const { app, pipe } = await setup();
    const data = (await app.inject({ method: "GET", url: "/admin/communities", headers: auth("admin-token") })).json().data;
    expect(pipe.calls).toBe(0);
    const ik = data.find((c: { communityName: string }) => c.communityName === "Ikorodu Central");
    expect(ik).toMatchObject({ status: "unavailable", level: null });
  });
});

describe("alerts", () => {
  const alert = { title: "Drain clearing", message: "Council will clear drains on Monday morning.", severity: "moderate", alertType: "community_notice" };
  it("lets only admins publish, stores uppercase enums and the author", async () => {
    const { app, db } = await setup();
    expect((await app.inject({ method: "POST", url: "/admin/alerts", payload: alert, headers: auth("resident-token") })).statusCode).toBe(403);
    const res = await app.inject({ method: "POST", url: "/admin/alerts", payload: { ...alert, communityId: ids.ikorodu }, headers: auth("admin-token") });
    expect(res.statusCode).toBe(201);
    expect(db.alerts.at(-1)).toMatchObject({ severity: "MODERATE", alert_type: "COMMUNITY_NOTICE", created_by: ids.admin, community_id: ids.ikorodu });
    expect(res.json().data).toMatchObject({ severity: "moderate", alertType: "community_notice", communityName: "Ikorodu Central" });
    expect(res.json().data.source).toMatch(/not an official government warning/);
  });
  it.each<[Record<string, unknown>, string]>([
    [{ ...alert, severity: "MODERATE" }, "DB enum instead of contract value"],
    [{ ...alert, title: "x" }, "short title"],
    [{ ...alert, message: "short" }, "short message"],
    [{ ...alert, expiresAt: "2026-11-15T11:00:00Z" }, "expiry in the past"],
    [{ ...alert, communityId: "nope" }, "bad community id"],
    [{ ...alert, createdBy: "someone" }, "client-supplied author"],
  ])("rejects %j (%s)", async (payload) => {
    const { app } = await setup();
    expect((await app.inject({ method: "POST", url: "/admin/alerts", payload, headers: auth("admin-token") })).statusCode).toBe(400);
  });
  it("lists unexpired alerts publicly without the author", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/admin/alerts", payload: { ...alert, communityId: ids.ikorodu }, headers: auth("admin-token") });
    await app.inject({ method: "POST", url: "/admin/alerts", payload: { ...alert, title: "Everywhere" }, headers: auth("admin-token") });
    const all = (await app.inject({ method: "GET", url: "/alerts" })).json().data;
    expect(all).toHaveLength(2);
    expect(JSON.stringify(all)).not.toContain(ids.admin);
    const other = (await app.inject({ method: "GET", url: `/alerts?communityId=${ids.noCoords}` })).json().data;
    expect(other.map((a: { title: string }) => a.title)).toEqual(["Everywhere"]);
  });
});

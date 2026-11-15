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
  it("stores a pending report owned by the token's user", async () => {
    const { app, db } = await setup();
    const res = await app.inject({ method: "POST", url: "/reports", payload: validReport, headers: auth("resident-token") });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("pending");
    expect(db.reports.at(-1)!.reporter_id).toBe(ids.resident);
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
  it("returns only the caller's own reports", async () => {
    const { app, db } = await setup();
    db.addReport("pending");
    db.addReport("pending", { reporter_id: ids.admin });
    const res = await app.inject({ url: "/reports/mine", headers: auth("resident-token") });
    expect(res.json().data).toHaveLength(1);
  });
});

describe("admin review", () => {
  it("forbids residents", async () => {
    const { app, db } = await setup();
    const r = db.addReport("pending");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified" }, headers: auth("resident-token") });
    expect(res.statusCode).toBe(403);
    expect(db.reports[0]!.status).toBe("pending");
  });
  it("lets an admin verify a pending report once, records the reviewer and reassesses", async () => {
    const { app, db, pipe } = await setup();
    const r = db.addReport("pending");
    const res = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "verified", reviewNote: "Confirmed by phone" }, headers: auth("admin-token") });
    expect(res.statusCode).toBe(200);
    expect(res.json().reassessment).toBe("started");
    expect(r.status).toBe("verified");
    expect(r.reviewed_by).toBe(ids.admin);
    expect(r.admin_note).toBe("Confirmed by phone");
    await new Promise((x) => setTimeout(x, 20));
    expect(pipe.calls).toBe(1);
    const again = await app.inject({ method: "POST", url: `/admin/reports/${r.id}/review`, payload: { decision: "rejected" }, headers: auth("admin-token") });
    expect(again.statusCode).toBe(409);
  });
});

describe("public hazard visibility", () => {
  it("never returns pending or rejected reports, or reporter identity", async () => {
    const { app, db } = await setup();
    db.addReport("pending");
    db.addReport("rejected");
    const v = db.addReport("verified", { latitude: 6.6, longitude: 3.5 });
    const res = await app.inject({ url: "/hazards?status=verified" });
    const data = res.json().data;
    expect(data.map((h: { id: string }) => h.id)).toEqual([v.id]);
    expect(JSON.stringify(data)).not.toContain(ids.resident);
    expect(data[0]).toMatchObject({ status: "verified", communityName: "Ikorodu Central", lga: "Ikorodu", state: "Lagos", latitude: 6.6 });
  });
  it("refuses to list non-verified statuses", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/hazards?status=pending" })).statusCode).toBe(403);
  });
  it("shows only verified hazards in the community overview", async () => {
    const { app, db } = await setup();
    db.addReport("pending");
    db.addReport("verified");
    const res = await app.inject({ url: `/communities/${ids.ikorodu}/overview` });
    expect(res.json().data.verifiedHazards).toHaveLength(1);
  });
});

describe("locations", () => {
  it("lists communities for a frontend (dataset) LGA id", async () => {
    const { app } = await setup();
    const res = await app.inject({ url: "/locations/lgas/NG025012/communities" });
    const names = res.json().data.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Ikorodu Central", "No Coords"]);
    expect(res.json().data[0]).toMatchObject({ lgaId: "NG025012", stateId: "NG025", stateName: "Lagos" });
  });
  it("404s for inactive communities", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: `/locations/communities/${ids.inactive}` })).statusCode).toBe(404);
  });
  it("matches nearby coordinates honestly", async () => {
    const { app } = await setup();
    const near = await app.inject({ method: "POST", url: "/locations/resolve", payload: { latitude: 6.621, longitude: 3.511 } });
    expect(near.json().data.matchStatus).toBe("matched");
    const far = await app.inject({ method: "POST", url: "/locations/resolve", payload: { latitude: 9.06, longitude: 7.49 } });
    expect(far.json().data).toMatchObject({ matchStatus: "unmatched", location: { state: null, lga: null, community: null } });
  });
  it("never invents emergency numbers", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/safety/hotlines" })).json()).toEqual({ data: [] });
  });
});

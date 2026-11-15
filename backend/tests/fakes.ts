// In-memory stand-ins for Supabase (with the live schema's enums and NOT NULL columns), auth,
// Open-Meteo and the AI explainer. No network.
import { randomUUID } from "node:crypto";
import {
  assessCommunity, type Climatology, type Community, type Observation, type PipelineResult, type UnverifiedSignal,
} from "../../risk-engine/src/index.ts";
import { buildApp } from "../src/app.ts";
import { OpenMeteoBudget } from "../src/assessments/budget.ts";
import { ClimatologyService } from "../src/assessments/climatology.ts";
import { AssessmentService, type Explainer } from "../src/assessments/service.ts";
import { MemoryStore } from "../src/assessments/store.ts";
import { DbError, NO_USER_CLIENT, type AuthVerifier, type CommunityFilter, type Db, type NewReport, type ReportFilter, type ReviewPatch } from "../src/db/repo.ts";
import type { AlertInsert, AlertRow, CommunityRow, DbReportStatus, LgaRow, ReportHistoryInsert, ReportRow, RiskInsert, RiskRow, StateRow } from "../src/db/schema.ts";
import { LocationService, type AdminDataset } from "../src/locations.ts";

export const NOW = new Date("2026-11-15T12:00:00.000Z");
export const ids = {
  ikorodu: "11111111-1111-4111-8111-111111111111",
  inactive: "22222222-2222-4222-8222-222222222222",
  noCoords: "33333333-3333-4333-8333-333333333333",
  resident: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  newUser: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  admin: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  lagos: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  ikoroduLga: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  etiOsaLga: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

export const dataset: AdminDataset = {
  states: [{ id: "NG025", name_en: "Lagos" }],
  lgas: [
    { id: "NG025009", name_en: "Eti-Osa", parent_id: "NG025" },
    { id: "NG025012", name_en: "Ikorodu", parent_id: "NG025" },
  ],
};

export const CLIM: Climatology = {
  rain1h: { p90: 4.6, p99: 10.7, p999: 19 }, rain6h: { p90: 10, p99: 28, p999: 60 },
  rain24h: { p90: 14.5, p99: 38, p999: 95.6 }, rain7d: { p90: 68, p99: 131, p999: 219 }, source: "test", period: "test",
};

const community = (o: Partial<CommunityRow>): CommunityRow => ({
  id: randomUUID(), name: "X", lga_id: ids.ikoroduLga, ward_id: null, latitude: 6.62, longitude: 3.51, is_active: true,
  verification_status: "VERIFIED", community_type: "urban", ...o,
});

const RISK_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL", "UNAVAILABLE"]; // live enum: no SEVERE
const RISK_NOT_NULL: (keyof RiskInsert)[] = [
  "community_id", "risk_level", "confidence", "recommended_actions", "data_available", "limitations", "inputs_used",
  "inputs_missing", "input_summary", "data_freshness", "explanation_source", "assessed_at",
];

function withoutAuthor(a: AlertRow & { created_by: string }): AlertRow {
  const pub: Partial<AlertRow & { created_by: string }> = { ...a };
  delete pub.created_by;
  return pub as AlertRow;
}

export class FakeDb implements Db {
  states: StateRow[] = [{ id: ids.lagos, name: "Lagos", code: null, source_record_id: null }];
  lgas: LgaRow[] = [
    { id: ids.ikoroduLga, name: "IKORODU", state_id: ids.lagos, code: null, source_record_id: null }, // matched by name
    { id: ids.etiOsaLga, name: "Eti Osa", state_id: ids.lagos, code: "NG025009", source_record_id: null }, // matched by code
  ];
  communities: CommunityRow[] = [
    community({ id: ids.ikorodu, name: "Ikorodu Central" }),
    community({ id: ids.inactive, name: "Closed Place", is_active: false }),
    community({ id: ids.noCoords, name: "No Coords", latitude: null, longitude: null, verification_status: "PENDING_REVIEW" }),
  ];
  reports: ReportRow[] = [];
  history: ReportHistoryInsert[] = [];
  risk: RiskRow[] = [];
  roles = new Map<string, string>([[ids.resident, "RESIDENT"], [ids.admin, "ADMIN"]]);
  names = new Map<string, string | null>([[ids.resident, null], [ids.admin, "Ada Admin"]]);
  alerts: (AlertRow & { created_by: string })[] = [];
  profileInserts: { id: string; full_name: string | null }[] = [];
  profileUpdates: { id: string; preferred_community_id: string | null }[] = [];
  preferred = new Map<string, string | null>();
  /** Access tokens accepted for user-scoped inserts (stand-in for auth.uid()). */
  tokenUsers = new Map<string, string>([["resident-token", ids.resident], ["admin-token", ids.admin], ["new-user-token", ids.newUser]]);
  /** Simulates the server running without SUPABASE_PUBLISHABLE_KEY. */
  userClientConfigured = true;

  addReport(status: DbReportStatus, o: Partial<ReportRow> = {}): ReportRow {
    const r: ReportRow = {
      id: randomUUID(), reference_code: `FG-TEST-${this.reports.length}`, reporter_id: ids.resident, community_id: ids.ikorodu, category: "FLOODED_ROAD",
      description: "Road under water near market", latitude: null, longitude: null, status, photo_path: null, reviewed_by: null,
      reviewed_at: status === "PENDING" ? null : NOW.toISOString(), admin_note: null, created_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      updated_at: null, ...o,
    };
    this.reports.push(r);
    return r;
  }

  async listStates() { return this.states; }
  async listLgas() { return this.lgas; }
  async listCommunities(f: CommunityFilter = {}) {
    return this.communities.filter((c) => (!f.activeOnly || c.is_active) && (!f.ids || f.ids.includes(c.id))
      && (!f.lgaIds || f.lgaIds.includes(c.lga_id)) && (!f.search || c.name.toLowerCase().includes(f.search.toLowerCase())));
  }
  async getCommunity(id: string) { return this.communities.find((c) => c.id === id) ?? null; }
  async listReports(f: ReportFilter = {}) {
    return this.reports.filter((r) => (!f.statuses || f.statuses.includes(r.status)) && (!f.communityId || r.community_id === f.communityId)
      && (!f.reporterId || r.reporter_id === f.reporterId) && (!f.createdSince || r.created_at >= f.createdSince)
      && (!f.reviewedSince || (r.reviewed_at != null && r.reviewed_at > f.reviewedSince)));
  }
  async listPublicReports(f: { communityId?: string }) {
    return this.reports.filter((r) => r.status === "VERIFIED" && (!f.communityId || r.community_id === f.communityId)).map((r) => ({
      id: r.id, community_id: r.community_id, category: r.category, description: r.description, latitude: r.latitude, longitude: r.longitude,
      status: r.status, reviewed_at: r.reviewed_at, created_at: r.created_at,
    }));
  }
  async getReport(id: string) { return this.reports.find((r) => r.id === id) ?? null; }
  async insertReport(n: NewReport, accessToken: string) {
    if (!this.userClientConfigured) throw new DbError("insert report", NO_USER_CLIENT, "SUPABASE_PUBLISHABLE_KEY is not configured");
    const uid = this.tokenUsers.get(accessToken);
    // Live trigger: "Authentication required" when auth.uid() is null.
    if (!uid) throw new DbError("insert report", "42501", "Authentication required");
    if ("reporter_id" in n || "reference_code" in n || "status" in n) throw new Error("client must not send trigger-owned columns");
    const code = `FG-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`; // DB-generated format
    return this.addReport("PENDING", { ...n, reporter_id: uid, reference_code: code, created_at: NOW.toISOString() });
  }
  async reviewReport(id: string, p: ReviewPatch) {
    const r = this.reports.find((x) => x.id === id && x.status === "PENDING");
    if (!r) return null;
    Object.assign(r, p);
    return r;
  }
  async insertReportHistory(h: ReportHistoryInsert) { this.history.push(h); }
  async countCommunities(activeOnly: boolean) { return this.communities.filter((c) => !activeOnly || c.is_active).length; }
  async getProfileRole(userId: string) { return this.roles.get(userId) ?? null; }
  async getProfile(userId: string) {
    return this.roles.has(userId)
      ? { id: userId, full_name: this.names.get(userId) ?? null, role: this.roles.get(userId)!, preferred_community_id: this.preferred.get(userId) ?? null }
      : null;
  }
  async setPreferredCommunity(userId: string, communityId: string | null) {
    this.profileUpdates.push({ id: userId, preferred_community_id: communityId });
    this.preferred.set(userId, communityId);
  }
  async ensureProfile(userId: string, fullName: string | null) {
    if (this.roles.has(userId)) return;
    this.profileInserts.push({ id: userId, full_name: fullName });
    this.roles.set(userId, "RESIDENT"); // database default
    this.names.set(userId, fullName);
  }
  async countReports(status?: DbReportStatus) { return this.reports.filter((r) => !status || r.status === status).length; }
  async listActiveAlerts(f: { at: string; communityId?: string }) {
    return this.alerts
      .filter((a) => (!a.expires_at || a.expires_at > f.at) && (!f.communityId || a.community_id === null || a.community_id === f.communityId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => withoutAuthor(a));
  }
  async insertAlert(a: AlertInsert) {
    const row = { ...a, id: randomUUID(), created_at: NOW.toISOString(), updated_at: null };
    this.alerts.push(row);
    return withoutAuthor(row);
  }
  async insertRiskAssessment(row: RiskInsert) {
    if (!RISK_LEVELS.includes(row.risk_level)) throw new DbError("insert risk assessment", "22P02", `invalid input value for enum risk_level: "${row.risk_level}"`);
    const missing = RISK_NOT_NULL.filter((k) => row[k] === null || row[k] === undefined);
    if (missing.length) throw new DbError("insert risk assessment", "23502", `null value in ${missing.join(",")}`);
    this.risk.push({ id: randomUUID(), ...row });
  }
  async latestRiskAssessment(communityId: string) {
    return [...this.risk].filter((r) => r.community_id === communityId).sort((a, b) => b.assessed_at.localeCompare(a.assessed_at))[0] ?? null;
  }
}

export const fakeAuth: AuthVerifier = {
  async verify(token: string) {
    if (token === "resident-token") return { id: ids.resident, fullName: "Rita Resident", email: "rita@example.test" };
    if (token === "admin-token") return { id: ids.admin, fullName: "Ada Admin" };
    if (token === "new-user-token") return { id: ids.newUser, fullName: "Nora New" };
    return null;
  },
};

const prov = { source: "Open-Meteo test", retrievedAt: NOW.toISOString(), measured: false, resolutionKm: 9 };

/** Rain presets that give low, high and severe results with the test climatology. */
export const RAIN = {
  dry: { max1hMm: 0, max6hMm: 0, max24hMm: 1, maxProbabilityPct: 10, past72hMm: 2, past7dMm: 5 },
  wet: { max1hMm: 12, max6hMm: 30, max24hMm: 40, maxProbabilityPct: 80, past72hMm: 40, past7dMm: 80 },
  heavy: { max1hMm: 25, max6hMm: 70, max24hMm: 110, maxProbabilityPct: 90, past72hMm: 75, past7dMm: 150 },
};

/** Fake pipeline: the rain preset controls the result; no network. */
export function fakePipeline(state: { rain: keyof typeof RAIN; calls: number }) {
  return (c: Community, o: { now?: string; observations?: Observation[]; unverifiedSignals?: UnverifiedSignal[] } | undefined): Promise<PipelineResult> => {
    state.calls++;
    const now = o?.now ?? NOW.toISOString();
    const r = RAIN[state.rain];
    const assessment = assessCommunity({
      community: c, now,
      rainfallForecast: { ...prov, max1hMm: r.max1hMm, max6hMm: r.max6hMm, max24hMm: r.max24hMm, maxProbabilityPct: r.maxProbabilityPct },
      antecedent: { ...prov, observedAt: now, past72hMm: r.past72hMm, past7dMm: r.past7dMm, soilMoisture: null },
      riverDischarge: null, riverGauge: null, observations: o?.observations ?? [], unverifiedSignals: o?.unverifiedSignals,
    });
    return Promise.resolve({ assessment, weather: null, forecast: null, errors: [] });
  };
}

export async function setup(opts: { explain?: Explainer | null; now?: () => Date; emptyAdminTables?: boolean } = {}) {
  const db = new FakeDb();
  if (opts.emptyAdminTables) {
    db.states = [];
    db.lgas = [];
  }
  const store = new MemoryStore();
  const now = opts.now ?? (() => NOW);
  const budget = new OpenMeteoBudget(8000, store, now);
  const failingFetch = (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch;
  const climatology = new ClimatologyService(store, budget, { fetchImpl: failingFetch, loadPilots: () => Promise.resolve({ ikorodu: CLIM }), now });
  const pipe: { rain: keyof typeof RAIN; calls: number } = { rain: "dry", calls: 0 };
  const explainCalls: string[] = [];
  const explain: Explainer | null = opts.explain === undefined
    ? async (a) => { explainCalls.push(a.severity ?? "none"); return { text: `AI: ${a.severity}`, source: "llm", model: "fake-model" }; }
    : opts.explain;
  const warnings: string[] = [];
  const log = { info: () => undefined, warn: (_o: object, m?: string) => { warnings.push(m ?? ""); }, error: (_o: object, m?: string) => { warnings.push(`error: ${m}`); } };
  const assessments = new AssessmentService({ db, store, climatology, budget, explain, now, pipeline: fakePipeline(pipe) as never, log });
  const locations = new LocationService(db, async () => dataset);
  const app = await buildApp({ db, auth: fakeAuth, locations, assessments, now, reportsPerHour: 3 });
  return { app, db, store, assessments, locations, pipe, explainCalls, warnings };
}

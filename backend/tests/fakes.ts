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
import { DbError, type AuthVerifier, type CommunityFilter, type Db, type NewReport, type ReportFilter, type ReviewPatch } from "../src/db/repo.ts";
import type { CommunityRow, DbReportStatus, LgaRow, ReportHistoryInsert, ReportRow, RiskInsert, RiskRow, StateRow } from "../src/db/schema.ts";
import { LocationService, type AdminDataset } from "../src/locations.ts";

export const NOW = new Date("2026-11-15T12:00:00.000Z");
export const ids = {
  ikorodu: "11111111-1111-4111-8111-111111111111",
  inactive: "22222222-2222-4222-8222-222222222222",
  noCoords: "33333333-3333-4333-8333-333333333333",
  resident: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
  /** Makes the next N inserts fail as duplicate reference codes. */
  duplicateCodes = 0;

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
  async insertReport(n: NewReport, referenceCode: string) {
    if (this.duplicateCodes > 0) {
      this.duplicateCodes--;
      throw new DbError("insert report", "23505", "duplicate key value violates unique constraint");
    }
    return this.addReport("PENDING", { ...n, reference_code: referenceCode, created_at: NOW.toISOString() });
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
    if (token === "resident-token") return { id: ids.resident };
    if (token === "admin-token") return { id: ids.admin };
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
  return async (c: Community, o: { now?: string; observations?: Observation[]; unverifiedSignals?: UnverifiedSignal[] } | undefined): Promise<PipelineResult> => {
    state.calls++;
    const now = o?.now ?? NOW.toISOString();
    const r = RAIN[state.rain];
    const assessment = assessCommunity({
      community: c, now,
      rainfallForecast: { ...prov, max1hMm: r.max1hMm, max6hMm: r.max6hMm, max24hMm: r.max24hMm, maxProbabilityPct: r.maxProbabilityPct },
      antecedent: { ...prov, observedAt: now, past72hMm: r.past72hMm, past7dMm: r.past7dMm, soilMoisture: null },
      riverDischarge: null, riverGauge: null, observations: o?.observations ?? [], unverifiedSignals: o?.unverifiedSignals,
    });
    return { assessment, weather: null, forecast: null, errors: [] };
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
  const climatology = new ClimatologyService(store, budget, { fetchImpl: failingFetch, loadPilots: async () => ({ ikorodu: CLIM }), now });
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

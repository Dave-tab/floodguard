// Data access. Routes and services depend on the Db interface only, so tests use an
// in-memory implementation and every Supabase query lives in this file.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  COLS,
  OPTIONAL_RISK_COLUMNS,
  T,
  type AlertRow,
  type CommunityRow,
  type LgaRow,
  type OptionalRiskColumn,
  type PublicReportRow,
  type ReportRow,
  type ReportStatus,
  type RiskRow,
  type StateRow,
} from "./schema.ts";

export interface CommunityFilter {
  activeOnly?: boolean;
  ids?: string[];
  lgaIds?: string[];
  search?: string;
  limit?: number;
}

export interface ReportFilter {
  statuses?: ReportStatus[];
  communityId?: string;
  reporterId?: string;
  createdSince?: string;
  reviewedSince?: string;
  limit?: number;
}

export type NewReport = Pick<ReportRow, "reporter_id" | "community_id" | "category" | "description" | "latitude" | "longitude">;
export interface ReviewPatch { status: "verified" | "rejected"; reviewed_by: string; reviewed_at: string; admin_note: string | null }
export type RiskInsert = Omit<RiskRow, "id" | "created_at"> & Partial<Record<OptionalRiskColumn, unknown>>;

export interface Db {
  listStates(): Promise<StateRow[]>;
  listLgas(): Promise<LgaRow[]>;
  listCommunities(f?: CommunityFilter): Promise<CommunityRow[]>;
  getCommunity(id: string): Promise<CommunityRow | null>;
  /** Full report rows (admin / owner use only). */
  listReports(f?: ReportFilter): Promise<ReportRow[]>;
  /** Verified reports with public-safe columns only. */
  listPublicReports(f: { communityId?: string; limit?: number }): Promise<PublicReportRow[]>;
  getReport(id: string): Promise<ReportRow | null>;
  insertReport(r: NewReport): Promise<ReportRow>;
  /** Conditional update: only succeeds while the report is still pending. */
  reviewReport(id: string, patch: ReviewPatch): Promise<ReportRow | null>;
  countCommunities(activeOnly: boolean): Promise<number | null>;
  countReports(status: ReportStatus): Promise<number | null>;
  getProfileRole(userId: string): Promise<string | null>;
  insertRiskAssessment(row: RiskInsert): Promise<void>;
  latestRiskAssessment(communityId: string): Promise<RiskRow | null>;
  listActiveAlerts(nowIso: string, communityId?: string): Promise<AlertRow[]>;
  /** Which of the optional risk_assessments columns exist. */
  probeOptionalRiskColumns(): Promise<OptionalRiskColumn[]>;
}

export interface AuthVerifier {
  /** Returns the user id for a valid Supabase access token, otherwise null. */
  verify(token: string): Promise<{ id: string } | null>;
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}${error?.code ? ` (${error.code})` : ""}`);
}

export function createSupabase(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class SupabaseDb implements Db {
  constructor(private readonly sb: SupabaseClient) {}

  async listStates() {
    const { data, error } = await this.sb.from(T.states).select(COLS.states).order("name");
    if (error) fail("states", error);
    return (data ?? []) as unknown as StateRow[];
  }

  async listLgas() {
    const { data, error } = await this.sb.from(T.lgas).select(COLS.lgas).order("name").limit(2000);
    if (error) fail("lgas", error);
    return (data ?? []) as unknown as LgaRow[];
  }

  async listCommunities(f: CommunityFilter = {}) {
    const ids = f.ids?.filter(isUuid);
    if (ids && !ids.length) return [];
    let q = this.sb.from(T.communities).select(COLS.communities);
    if (f.activeOnly) q = q.eq("is_active", true);
    if (ids) q = q.in("id", ids);
    if (f.lgaIds) q = q.in("lga_id", f.lgaIds);
    if (f.search) q = q.ilike("name", `%${f.search.replace(/[%_,()]/g, " ")}%`);
    const { data, error } = await q.order("name").limit(f.limit ?? 5000);
    if (error) fail("communities", error);
    return (data ?? []) as unknown as CommunityRow[];
  }

  async getCommunity(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.sb.from(T.communities).select(COLS.communities).eq("id", id).maybeSingle();
    if (error) fail("community", error);
    return (data as unknown as CommunityRow) ?? null;
  }

  async listReports(f: ReportFilter = {}) {
    let q = this.sb.from(T.reports).select(COLS.reports);
    if (f.statuses) q = q.in("status", f.statuses);
    if (f.communityId) q = q.eq("community_id", f.communityId);
    if (f.reporterId) q = q.eq("reporter_id", f.reporterId);
    if (f.createdSince) q = q.gte("created_at", f.createdSince);
    if (f.reviewedSince) q = q.gt("reviewed_at", f.reviewedSince);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(f.limit ?? 500);
    if (error) fail("reports", error);
    return (data ?? []) as unknown as ReportRow[];
  }

  async listPublicReports(f: { communityId?: string; limit?: number }) {
    let q = this.sb.from(T.reports).select(COLS.reportsPublic).eq("status", "verified");
    if (f.communityId) q = q.eq("community_id", f.communityId);
    const { data, error } = await q.order("reviewed_at", { ascending: false }).limit(f.limit ?? 500);
    if (error) fail("public reports", error);
    return (data ?? []) as unknown as PublicReportRow[];
  }

  async getReport(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.sb.from(T.reports).select(COLS.reports).eq("id", id).maybeSingle();
    if (error) fail("report", error);
    return (data as unknown as ReportRow) ?? null;
  }

  async insertReport(r: NewReport) {
    const { data, error } = await this.sb.from(T.reports).insert({ ...r, status: "pending" }).select(COLS.reports).single();
    if (error) fail("insert report", error);
    return data as unknown as ReportRow;
  }

  async reviewReport(id: string, patch: ReviewPatch) {
    const { data, error } = await this.sb
      .from(T.reports)
      .update({ ...patch, updated_at: patch.reviewed_at })
      .eq("id", id)
      .eq("status", "pending")
      .select(COLS.reports)
      .maybeSingle();
    if (error) fail("review report", error);
    return (data as unknown as ReportRow) ?? null;
  }

  async countCommunities(activeOnly: boolean) {
    let q = this.sb.from(T.communities).select("id", { count: "exact", head: true });
    if (activeOnly) q = q.eq("is_active", true);
    const { count, error } = await q;
    return error ? null : count;
  }

  async countReports(status: ReportStatus) {
    const { count, error } = await this.sb.from(T.reports).select("id", { count: "exact", head: true }).eq("status", status);
    return error ? null : count;
  }

  async getProfileRole(userId: string) {
    const { data, error } = await this.sb.from(T.profiles).select("role").eq("id", userId).maybeSingle();
    if (error) fail("profile", error);
    const role = (data as { role?: unknown } | null)?.role;
    return typeof role === "string" ? role : null;
  }

  async insertRiskAssessment(row: RiskInsert) {
    const { error } = await this.sb.from(T.risk).insert(row);
    if (error) fail("insert risk assessment", error);
  }

  async latestRiskAssessment(communityId: string) {
    if (!isUuid(communityId)) return null;
    const { data, error } = await this.sb
      .from(T.risk)
      .select(COLS.risk)
      .eq("community_id", communityId)
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("latest risk", error);
    return (data as unknown as RiskRow) ?? null;
  }

  async listActiveAlerts(nowIso: string, communityId?: string) {
    let q = this.sb.from(T.alerts).select(COLS.alerts).or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    if (communityId && isUuid(communityId)) q = q.or(`community_id.is.null,community_id.eq.${communityId}`);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) fail("alerts", error);
    return (data ?? []) as unknown as AlertRow[];
  }

  async probeOptionalRiskColumns() {
    const present: OptionalRiskColumn[] = [];
    for (const c of OPTIONAL_RISK_COLUMNS) {
      const { error } = await this.sb.from(T.risk).select(c).limit(0);
      if (!error) present.push(c);
    }
    return present;
  }
}

export class SupabaseAuth implements AuthVerifier {
  constructor(private readonly sb: SupabaseClient) {}
  async verify(token: string) {
    const { data, error } = await this.sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id };
  }
}

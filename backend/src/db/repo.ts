// Data access. Routes and services depend on the Db interface only, so tests use an
// in-memory implementation and every Supabase query lives in this file. Values here are the
// database's own (UPPERCASE enums); conversion happens in ../mapping.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  COLS,
  T,
  type AlertInsert,
  type AlertRow,
  type CommunityRow,
  type DbReportStatus,
  type LgaRow,
  type ProfileRow,
  type PublicReportRow,
  type ReportHistoryInsert,
  type ReportRow,
  type RiskInsert,
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
  statuses?: DbReportStatus[];
  communityId?: string;
  reporterId?: string;
  createdSince?: string;
  reviewedSince?: string;
  limit?: number;
}

/** What the client may set. reporter_id, reference_code and status are set by database triggers (auth.uid()). */
export type NewReport = Pick<ReportRow, "community_id" | "category" | "description" | "latitude" | "longitude">;
export interface ReviewPatch { status: "VERIFIED" | "REJECTED"; reviewed_by: string; reviewed_at: string; admin_note: string | null }

/** Error carrying the Postgres / PostgREST code (e.g. 22P02 invalid enum, 23505 unique violation). */
export class DbError extends Error {
  constructor(context: string, readonly code: string | undefined, detail: string) {
    super(`${context}: ${detail}${code ? ` (${code})` : ""}`);
  }
}

export interface Db {
  listStates(): Promise<StateRow[]>;
  listLgas(): Promise<LgaRow[]>;
  listCommunities(f?: CommunityFilter): Promise<CommunityRow[]>;
  getCommunity(id: string): Promise<CommunityRow | null>;
  /** Full report rows (admin / owner use only). */
  listReports(f?: ReportFilter): Promise<ReportRow[]>;
  /** VERIFIED reports with public-safe columns only. */
  listPublicReports(f: { communityId?: string; limit?: number }): Promise<PublicReportRow[]>;
  getReport(id: string): Promise<ReportRow | null>;
  /**
   * Inserts a report AS THE SIGNED-IN USER (their access token): a database trigger requires
   * auth.uid() and fills reporter_id, reference_code and status PENDING. Throws DbError.
   */
  insertReport(r: NewReport, accessToken: string): Promise<ReportRow>;
  /** Conditional update: only succeeds while the report is still PENDING. */
  reviewReport(id: string, patch: ReviewPatch): Promise<ReportRow | null>;
  insertReportHistory(h: ReportHistoryInsert): Promise<void>;
  countCommunities(activeOnly: boolean): Promise<number | null>;
  getProfileRole(userId: string): Promise<string | null>;
  getProfile(userId: string): Promise<ProfileRow | null>;
  /** Creates the profile row if it does not exist yet. Never changes an existing row (role included). */
  ensureProfile(userId: string, fullName: string | null): Promise<void>;
  /** Sets ONLY profiles.preferred_community_id for this user (secret key; users have no UPDATE grant). */
  setPreferredCommunity(userId: string, communityId: string | null): Promise<void>;
  countReports(status?: DbReportStatus): Promise<number | null>;
  /** Alerts that have not expired at `at`; with communityId, that community's plus platform-wide ones. */
  listActiveAlerts(f: { at: string; communityId?: string; limit?: number }): Promise<AlertRow[]>;
  insertAlert(a: AlertInsert): Promise<AlertRow>;
  insertRiskAssessment(row: RiskInsert): Promise<void>;
  latestRiskAssessment(communityId: string): Promise<RiskRow | null>;
}

export interface AuthUser { id: string; fullName?: string | null; email?: string | null }

export interface AuthVerifier {
  /** Returns the user for a valid Supabase access token, otherwise null. */
  verify(token: string): Promise<AuthUser | null>;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new DbError(context, error?.code, error?.message ?? "unknown error");
}

export function createSupabase(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Code used when report submission is not configured (no publishable key on the server). */
export const NO_USER_CLIENT = "FG_NO_PUBLISHABLE_KEY";

export interface UserClientConfig { url: string; publishableKey: string }

export class SupabaseDb implements Db {
  constructor(private readonly sb: SupabaseClient, private readonly userClient: UserClientConfig | null = null) {}

  /** A per-request client acting as the signed-in user (RLS and auth.uid() apply). */
  private asUser(accessToken: string): SupabaseClient {
    if (!this.userClient) throw new DbError("insert report", NO_USER_CLIENT, "SUPABASE_PUBLISHABLE_KEY is not configured");
    return createClient(this.userClient.url, this.userClient.publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

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
    const lgaIds = f.lgaIds?.filter(isUuid);
    if ((ids && !ids.length) || (lgaIds && !lgaIds.length)) return [];
    let q = this.sb.from(T.communities).select(COLS.communities);
    if (f.activeOnly) q = q.eq("is_active", true);
    if (ids) q = q.in("id", ids);
    if (lgaIds) q = q.in("lga_id", lgaIds);
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
    if (f.communityId && !isUuid(f.communityId)) return [];
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
    if (f.communityId && !isUuid(f.communityId)) return [];
    let q = this.sb.from(T.reports).select(COLS.reportsPublic).eq("status", "VERIFIED");
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

  async insertReport(r: NewReport, accessToken: string) {
    const { data, error } = await this.asUser(accessToken).from(T.reports).insert(r).select(COLS.reports).single();
    if (error) fail("insert report", error);
    return data as unknown as ReportRow;
  }

  async reviewReport(id: string, patch: ReviewPatch) {
    const { data, error } = await this.sb
      .from(T.reports)
      .update({ ...patch, updated_at: patch.reviewed_at })
      .eq("id", id)
      .eq("status", "PENDING")
      .select(COLS.reports)
      .maybeSingle();
    if (error) fail("review report", error);
    return (data as unknown as ReportRow) ?? null;
  }

  async insertReportHistory(h: ReportHistoryInsert) {
    const { error } = await this.sb.from(T.reportHistory).insert(h);
    if (error) fail("report history", error);
  }

  async countCommunities(activeOnly: boolean) {
    let q = this.sb.from(T.communities).select("id", { count: "exact", head: true });
    if (activeOnly) q = q.eq("is_active", true);
    const { count, error } = await q;
    return error ? null : count;
  }

  async getProfileRole(userId: string) {
    const { data, error } = await this.sb.from(T.profiles).select("role").eq("id", userId).maybeSingle();
    if (error) fail("profile", error);
    const role = (data as { role?: unknown } | null)?.role;
    return typeof role === "string" ? role : null;
  }

  async getProfile(userId: string) {
    if (!isUuid(userId)) return null;
    const { data, error } = await this.sb.from(T.profiles).select("id,full_name,role,preferred_community_id").eq("id", userId).maybeSingle();
    if (error) fail("profile", error);
    return (data as unknown as ProfileRow) ?? null;
  }

  async ensureProfile(userId: string, fullName: string | null) {
    if (await this.getProfile(userId)) return;
    // Insert only: role is left to its database default (RESIDENT) and is never written here.
    const { error } = await this.sb.from(T.profiles).insert({ id: userId, full_name: fullName });
    if (error && error.code !== "23505") fail("create profile", error);
  }

  async setPreferredCommunity(userId: string, communityId: string | null) {
    if (!isUuid(userId)) throw new DbError("update profile", undefined, "invalid user id");
    // Only this one column is ever written; role and name are untouched.
    const { error } = await this.sb.from(T.profiles).update({ preferred_community_id: communityId }).eq("id", userId);
    if (error) fail("update profile", error);
  }

  async countReports(status?: DbReportStatus) {
    let q = this.sb.from(T.reports).select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    const { count, error } = await q;
    return error ? null : count;
  }

  async listActiveAlerts(f: { at: string; communityId?: string; limit?: number }) {
    if (f.communityId && !isUuid(f.communityId)) return [];
    let q = this.sb.from(T.alerts).select(COLS.alerts);
    if (f.communityId) q = q.or(`community_id.is.null,community_id.eq.${f.communityId}`);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(f.limit ?? 200);
    if (error) fail("alerts", error);
    // Expiry is filtered here rather than with a second .or() so the two conditions cannot combine wrongly.
    const at = Date.parse(f.at);
    return ((data ?? []) as unknown as AlertRow[]).filter((a) => !a.expires_at || Date.parse(a.expires_at) > at);
  }

  async insertAlert(a: AlertInsert) {
    const { data, error } = await this.sb.from(T.alerts).insert(a).select(COLS.alerts).single();
    if (error) fail("insert alert", error);
    return data as unknown as AlertRow;
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
}

export class SupabaseAuth implements AuthVerifier {
  constructor(private readonly sb: SupabaseClient) {}
  async verify(token: string) {
    const { data, error } = await this.sb.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [meta.display_name, meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "");
    return { id: data.user.id, fullName: name?.trim().slice(0, 120) ?? null, email: data.user.email ?? null };
  }
}

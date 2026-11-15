// Supabase table and column names, and row types. Confirmed from the live database's
// PostgREST OpenAPI description on 2026-11-15 (secret key). Database enum values are
// UPPERCASE; the API and frontend use the approved lowercase values. All conversion between
// the two lives in ../mapping.ts.

export const T = {
  states: "states",
  lgas: "lgas",
  communities: "communities",
  reports: "hazard_reports",
  reportHistory: "report_status_history",
  risk: "risk_assessments",
  profiles: "profiles",
  alerts: "alerts",
} as const;

export const COLS = {
  states: "id,name,code,source_record_id,is_active",
  lgas: "id,name,state_id,code,source_record_id,is_active",
  communities:
    "id,name,lga_id,ward_id,latitude,longitude,is_active,verification_status,community_type,created_at,updated_at",
  reports:
    "id,reference_code,reporter_id,community_id,category,description,latitude,longitude,status,photo_path,reviewed_by,reviewed_at,admin_note,created_at,updated_at",
  /** Public view of a report: never includes reporter_id, reviewer or admin note. */
  reportsPublic: "id,community_id,category,description,latitude,longitude,status,reviewed_at,created_at",
  /** Public alert columns: created_by is never exposed. */
  alerts: "id,community_id,severity,alert_type,title,message,expires_at,created_at,updated_at",
  risk:
    "id,community_id,risk_level,score,confidence,explanation,explanation_source,explanation_provider,explanation_generated_at,recommended_actions,data_available,limitations,inputs_used,inputs_missing,input_summary,data_freshness,methodology_version,assessed_at,created_at",
} as const;

// ---- Database enums (exact values) ----
export const DB_HAZARD_CATEGORIES = ["FLOODING", "RISING_WATER", "BLOCKED_DRAINAGE", "FLOODED_ROAD", "DRAINAGE_DAMAGE", "EROSION", "OTHER"] as const;
export type DbHazardCategory = (typeof DB_HAZARD_CATEGORIES)[number];
export type DbReportStatus = "PENDING" | "VERIFIED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
/** Live enum has no SEVERE (see supabase/proposed_severe_level.sql); it is attempted, never relabelled. */
export type DbRiskLevel = "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "CRITICAL" | "UNAVAILABLE";
export type DbConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type DbExplanationSource = "AI" | "FALLBACK" | "NONE";
export type DbVerificationStatus = "UNVERIFIED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
export type DbRole = "RESIDENT" | "ADMIN";
export type DbAlertSeverity = "INFO" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type DbAlertType = "FLOOD_WARNING" | "WEATHER_NOTICE" | "SAFETY_ADVISORY" | "COMMUNITY_NOTICE" | "OTHER";

export interface StateRow { id: string; name: string; code: string | null; source_record_id?: string | null; is_active?: boolean }
export interface LgaRow { id: string; name: string; state_id: string; code: string | null; source_record_id?: string | null; is_active?: boolean }
export interface CommunityRow {
  id: string;
  name: string;
  lga_id: string;
  ward_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  verification_status: DbVerificationStatus | string | null;
  community_type: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
export interface ReportRow {
  id: string;
  reference_code: string;
  reporter_id: string;
  community_id: string;
  category: DbHazardCategory;
  description: string;
  latitude: number | null;
  longitude: number | null;
  status: DbReportStatus;
  photo_path: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
}
export type PublicReportRow = Pick<
  ReportRow,
  "id" | "community_id" | "category" | "description" | "latitude" | "longitude" | "status" | "reviewed_at" | "created_at"
>;
export interface ReportHistoryInsert {
  report_id: string;
  previous_status: DbReportStatus | null;
  new_status: DbReportStatus;
  changed_by: string | null;
  note: string | null;
}
export interface RiskRow {
  id: string;
  community_id: string;
  risk_level: DbRiskLevel | string;
  score: number | null;
  confidence: DbConfidence | string;
  explanation: string | null;
  explanation_source: DbExplanationSource | string;
  explanation_provider: string | null;
  explanation_generated_at: string | null;
  recommended_actions: string[];
  data_available: boolean;
  limitations: string[];
  inputs_used: string[];
  inputs_missing: string[];
  input_summary: Record<string, unknown>;
  data_freshness: Record<string, unknown>;
  methodology_version: string | null;
  assessed_at: string;
  created_at?: string | null;
}
export type RiskInsert = Omit<RiskRow, "id" | "created_at">;
export interface ProfileRow { id: string; full_name: string | null; role: DbRole | string }
export interface AlertRow {
  id: string;
  community_id: string | null;
  severity: DbAlertSeverity;
  alert_type: DbAlertType;
  title: string;
  message: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
}
export type AlertInsert = Pick<AlertRow, "community_id" | "severity" | "alert_type" | "title" | "message" | "expires_at"> & { created_by: string };

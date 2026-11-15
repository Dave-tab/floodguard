// Single place for Supabase table and column names. The live schema was probed on
// 2026-11-15 with the publishable key (tables empty, column types not visible). If a name is
// wrong, fix it here only.

export const T = {
  states: "states",
  lgas: "lgas",
  wards: "wards",
  communities: "communities",
  reports: "hazard_reports",
  risk: "risk_assessments",
  alerts: "alerts",
  profiles: "profiles",
} as const;

export const COLS = {
  states: "id,name,code",
  lgas: "id,name,state_id,code",
  communities: "id,name,lga_id,ward_id,latitude,longitude,is_active,verification_status,community_type,created_at,updated_at",
  reports:
    "id,reporter_id,community_id,category,description,latitude,longitude,status,photo_path,reviewed_by,reviewed_at,admin_note,created_at,updated_at",
  /** Public view of a report: never includes reporter_id or reviewer identity. */
  reportsPublic: "id,community_id,category,description,latitude,longitude,status,reviewed_at,created_at",
  risk: "id,community_id,risk_level,score,confidence,explanation,explanation_source,assessed_at,data_freshness,recommended_actions,created_at",
  alerts: "id,community_id,severity,title,message,alert_type,expires_at,created_by,created_at",
} as const;

/** Columns proposed in supabase/proposed_additive_columns.sql. Written only if present. */
export const OPTIONAL_RISK_COLUMNS = [
  "summary",
  "status",
  "valid_until",
  "next_review_at",
  "factors",
  "missing_inputs",
  "inputs_json",
  "method_version",
  "confidence_score",
  "provider",
] as const;
export type OptionalRiskColumn = (typeof OPTIONAL_RISK_COLUMNS)[number];

export const HAZARD_CATEGORIES = [
  "flooded_road",
  "rising_water_level",
  "blocked_drainage",
  "overflowing_waterway",
  "damaged_drainage",
  "other",
] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];
export type ReportStatus = "pending" | "verified" | "rejected";

export interface StateRow { id: string; name: string; code: string | null }
export interface LgaRow { id: string; name: string; state_id: string; code: string | null }
export interface CommunityRow {
  id: string;
  name: string;
  lga_id: string | null;
  ward_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  verification_status: string | null;
  community_type: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
export interface ReportRow {
  id: string;
  reporter_id: string;
  community_id: string;
  category: HazardCategory;
  description: string;
  latitude: number | null;
  longitude: number | null;
  status: ReportStatus;
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
export interface RiskRow {
  id: string;
  community_id: string;
  risk_level: string | null;
  score: number | null;
  confidence: string | null;
  explanation: string | null;
  explanation_source: string | null;
  assessed_at: string;
  data_freshness: unknown;
  recommended_actions: unknown;
  created_at?: string | null;
}
export interface AlertRow {
  id: string;
  community_id: string | null;
  severity: string | null;
  title: string;
  message: string;
  alert_type: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

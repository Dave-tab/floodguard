import { createClient } from '@supabase/supabase-js';

import type {
  HazardCategory,
  HazardReportStatus,
} from '../types/resident';

export type AdminReportStatus = HazardReportStatus;

export type AssessmentRiskLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL';

export type AlertSeverity = AssessmentRiskLevel;

export type CommunityPayload = {
  id: string;
  community_name: string;
  state: string;
  lga: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
};

export type HazardReportPayload = {
  id: string;
  community_id: string;
  hazard_category: HazardCategory;
  description: string;
  image_url: string | null;
  status: AdminReportStatus;
  admin_notes: string | null;
  submitted_at: string;
};

export type RiskAssessmentPayload = {
  id: string;
  community_id: string;
  risk_level: AssessmentRiskLevel;
  risk_score: number | null;
  assessment_time: string;
  rainfall_forecast: string | null;
  recent_rainfall: string | null;
  drainage_condition: string | null;
  historical_incidents: string | null;
  ai_explanation: string | null;
};

export type AlertPayload = {
  id: string;
  title: string;
  message: string;
  community_id: string | null;
  severity: AlertSeverity;
  expires_at: string | null;
  source_type: string;
  issued_at: string;
  created_by: string | null;
};

type TableDefinition<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

interface Database {
  public: {
    Tables: {
      communities: TableDefinition<CommunityPayload>;
      hazard_reports: TableDefinition<HazardReportPayload>;
      risk_assessments: TableDefinition<RiskAssessmentPayload>;
      alerts: TableDefinition<AlertPayload>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const isValidSupabaseUrl = (() => {
  if (!supabaseUrl) return false;

  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
})();

export const supabase =
  isValidSupabaseUrl && supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;

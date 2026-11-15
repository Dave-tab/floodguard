
export type UserRole = 'resident' | 'admin';

export type HazardCategory =
  | 'flooded_road'
  | 'rising_water_level'
  | 'blocked_drainage'
  | 'overflowing_waterway'
  | 'damaged_drainage'
  | 'other';

export type HazardReportStatus =
  | 'pending'
  | 'verified'
  | 'rejected';

export interface Community {
  id: string;
  name: string;
  state: string;
  lga: string;
  basinLabel?: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  isDemoData: boolean;
  lastSyncedLabel?: string | null;
}

export type WeatherDataStatus =
  | 'available'
  | 'stale'
  | 'unavailable'
  | 'insufficient_data';

export interface WeatherContext {
  status: WeatherDataStatus;
  provider: string | null;
  retrievedAt: string | null;
  observedRainfall6hMm: number | null;
  forecastRainfall24hMm: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  staleLimitHours: number | null;
  message: string | null;
  isDemoData: boolean;
}

export type RiskAssessmentStatus =
  | 'available'
  | 'insufficient_data'
  | 'unavailable';

/** Approved levels are low | high | severe | critical; 'moderate' is kept only for older data. */
export type RiskLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'severe'
  | 'critical';

export interface RiskFactorItem {
  id: string;
  label: string;
  description: string;
  value: string | number | null;
  contributionLabel?: string | null;
  iconKey:
    | 'rainfall'
    | 'water_level'
    | 'drainage'
    | 'terrain'
    | 'other';
}

export interface RiskAssessment {
  status: RiskAssessmentStatus;
  level: RiskLevel | null;
  score: number | null;
  summary: string | null;
  explanation: string | null;
  explanationStatus:
    | 'deterministic_template'
    | 'ai'
    | 'unavailable';
  factors: RiskFactorItem[];
  missingInputs: string[];
  limitations: string[];
  disclaimer: string;
  confidence: number | null;
  assessedAt: string | null;
  isDemoData: boolean;
}

export interface VerifiedHazardSummary {
  id: string;
  title: string;
  category: HazardCategory;
  description: string;
  communityId: string;
  communityName: string;
  lga: string;
  status: HazardReportStatus;
  reportedAt: string;
  verifiedAt: string | null;
  verifiedByLabel?: string | null;
  isDemoData: boolean;
}

export interface SafetyGuidelineItem {
  id: string;
  title: string;
  description: string;
  category: 'before' | 'during' | 'after' | 'general';
}

export interface EmergencyHotline {
  id: string;
  name: string;
  phone: string;
  telHref: string;
  description?: string;
  sourceUrl?: string;
}

export interface CommunityOverviewData {
  community: Community;
  weather: WeatherContext;
  risk: RiskAssessment;
  verifiedHazards: VerifiedHazardSummary[];
  safetyGuidelines: SafetyGuidelineItem[];
  hotlines: EmergencyHotline[];
  isDemoData: boolean;
}

export interface PlatformImpactSnapshot {
  isDemoData: boolean;
  activeCommunities: number | null;
  activeVolunteers: number | null;
  verifiedWarnings: number | null;
  averageNoticeHours: number | null;
  uptimePct: number | null;
  retrievedAt: string | null;
}


import type { HazardCategory } from '../../types/resident';

export type FloodSeverity = 'low' | 'high' | 'severe' | 'critical';

export interface MapHazard {
  id: string;
  title: string;
  description: string;
  category: HazardCategory;
  latitude: number;
  longitude: number;
  communityId: string;
  communityName: string;
  state: string;
  lga: string;
  reportedAt: string;
  verifiedAt: string | null;
  verifiedByLabel: string | null;
  status: 'verified';
  isDemoData: boolean;
}

export interface CommunityRiskAssessment {
  id: string;
  communityId: string;
  communityName: string;
  state: string;
  lga: string;
  latitude: number;
  longitude: number;
  severity: FloodSeverity;
  summary: string;
  recommendedActions: string[];
  assessedAt: string;
  validUntil: string | null;
  status: 'active';
  isDemoData: boolean;
}

export type HazardMapDataStatus = 'live' | 'demo' | 'unavailable';

export interface HazardMapResult {
  hazards: MapHazard[];
  risks: CommunityRiskAssessment[];
  status: HazardMapDataStatus;
  message: string | null;
  lastUpdated: string | null;
  riskStatus: HazardMapDataStatus;
  riskMessage: string | null;
}

interface HazardApiRecord {
  id: string;
  title?: string;
  description?: string;
  category: HazardCategory;
  latitude: number;
  longitude: number;
  communityId?: string;
  communityName?: string;
  state?: string;
  lga?: string;
  reportedAt?: string;
  verifiedAt?: string | null;
  verifiedByLabel?: string | null;
  status: string;
  isDemoData?: boolean;
}

interface RiskApiRecord {
  id: string;
  communityId: string;
  communityName: string;
  state?: string;
  lga?: string;
  latitude: number;
  longitude: number;
  severity: FloodSeverity;
  summary?: string;
  recommendedActions?: string[];
  assessedAt: string;
  validUntil?: string | null;
  status: string;
  isDemoData?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');

const validSeverities: FloodSeverity[] = [
  'low',
  'high',
  'severe',
  'critical',
];

function isValidCoordinate(value: number, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function extractRecords<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }

  throw new Error('The service returned an unexpected response.');
}

async function fetchEndpoint<T>(path: string): Promise<T[]> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Service returned ${response.status} for ${path}.`);
  }

  return extractRecords<T>(await response.json());
}

function isValidHazard(record: HazardApiRecord): boolean {
  return (
    record.status === 'verified' &&
    record.isDemoData !== true &&
    Boolean(record.id) &&
    Boolean(record.category) &&
    isValidCoordinate(record.latitude, -90, 90) &&
    isValidCoordinate(record.longitude, -180, 180)
  );
}

function isValidRisk(record: RiskApiRecord): boolean {
  return (
    record.status === 'active' &&
    record.isDemoData !== true &&
    Boolean(record.id) &&
    Boolean(record.communityId) &&
    validSeverities.includes(record.severity) &&
    isValidCoordinate(record.latitude, -90, 90) &&
    isValidCoordinate(record.longitude, -180, 180) &&
    Boolean(record.assessedAt) &&
    (!record.validUntil ||
      new Date(record.validUntil).getTime() > Date.now())
  );
}

export async function getHazardMapData(
  communityId?: string,
): Promise<HazardMapResult> {
  if (!API_BASE_URL) {
    return {
      hazards: [],
      risks: [],
      status: 'demo',
      message:
        'The hazard map is in demonstration mode. Verified live hazard data has not been connected.',
      lastUpdated: null,
      riskStatus: 'demo',
      riskMessage:
        'Live community risk assessments are not connected yet.',
    };
  }

  const params = new URLSearchParams();

  if (communityId) {
    params.set('communityId', communityId);
  }

  const query = params.toString();
  const suffix = query ? `&${query}` : '';

  const [hazardResult, riskResult] = await Promise.allSettled([
    fetchEndpoint<HazardApiRecord>(
      `/hazards?status=verified${suffix}`,
    ),
    fetchEndpoint<RiskApiRecord>(
      `/risk-assessments?status=active${suffix}`,
    ),
  ]);

  const hazardsAvailable = hazardResult.status === 'fulfilled';
  const risksAvailable = riskResult.status === 'fulfilled';

  const hazards: MapHazard[] = hazardsAvailable
    ? hazardResult.value
        .filter(isValidHazard)
        .map((hazard) => ({
          id: hazard.id,
          title: hazard.title || 'Verified hazard report',
          description:
            hazard.description || 'No additional description provided.',
          category: hazard.category,
          latitude: hazard.latitude,
          longitude: hazard.longitude,
          communityId: hazard.communityId || '',
          communityName: hazard.communityName || 'Unknown community',
          state: hazard.state || '',
          lga: hazard.lga || '',
          reportedAt: hazard.reportedAt || '',
          verifiedAt: hazard.verifiedAt || null,
          verifiedByLabel: hazard.verifiedByLabel || null,
          status: 'verified',
          isDemoData: false,
        }))
    : [];

  const risks: CommunityRiskAssessment[] = risksAvailable
    ? riskResult.value
        .filter(isValidRisk)
        .map((risk) => ({
          id: risk.id,
          communityId: risk.communityId,
          communityName: risk.communityName,
          state: risk.state || '',
          lga: risk.lga || '',
          latitude: risk.latitude,
          longitude: risk.longitude,
          severity: risk.severity,
          summary: risk.summary || 'No additional risk summary provided.',
          recommendedActions: risk.recommendedActions || [],
          assessedAt: risk.assessedAt,
          validUntil: risk.validUntil || null,
          status: 'active',
          isDemoData: false,
        }))
    : [];

  const errors = [
    !hazardsAvailable
      ? hazardResult.reason instanceof Error
        ? hazardResult.reason.message
        : 'Unable to retrieve hazard reports.'
      : null,
    !risksAvailable
      ? riskResult.reason instanceof Error
        ? riskResult.reason.message
        : 'Unable to retrieve risk assessments.'
      : null,
  ].filter(Boolean);

  return {
    hazards,
    risks,
    status: hazardsAvailable ? 'live' : 'unavailable',
    message: errors.length ? errors.join(' ') : null,
    lastUpdated: hazardsAvailable ? new Date().toISOString() : null,
    riskStatus: risksAvailable ? 'live' : 'unavailable',
    riskMessage: risksAvailable
      ? null
      : 'Community risk assessments are currently unavailable.',
  };
}

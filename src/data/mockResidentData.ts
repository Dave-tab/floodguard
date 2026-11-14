
import type {
  Community,
  CommunityOverviewData,
  EmergencyHotline,
  PlatformImpactSnapshot,
  SafetyGuidelineItem,
  VerifiedHazardSummary,
} from '../types/resident';

export const MOCK_COMMUNITIES: Community[] = [
  {
    id: 'demo-lekki-phase-1',
    name: 'Lekki Phase 1',
    state: 'Lagos',
    lga: 'Eti-Osa',
    basinLabel: null,
    latitude: null,
    longitude: null,
    isActive: true,
    isDemoData: true,
    lastSyncedLabel: 'Demonstration fixture',
  },
  {
    id: 'demo-surulere-central',
    name: 'Surulere Central',
    state: 'Lagos',
    lga: 'Surulere',
    basinLabel: null,
    latitude: null,
    longitude: null,
    isActive: true,
    isDemoData: true,
    lastSyncedLabel: 'Demonstration fixture',
  },
  {
    id: 'demo-dibou',
    name: 'Diobu',
    state: 'Rivers',
    lga: 'Port Harcourt',
    basinLabel: null,
    latitude: null,
    longitude: null,
    isActive: true,
    isDemoData: true,
    lastSyncedLabel: 'Demonstration fixture',
  },
];

export const MOCK_VERIFIED_HAZARDS: VerifiedHazardSummary[] = [];

/**
 * General flood-safety guidance for the prototype.
 * This is educational guidance, not a location-specific emergency instruction.
 */
export const SAFETY_GUIDELINES: SafetyGuidelineItem[] = [
  {
    id: 'before-flood',
    title: 'Prepare before flooding',
    description:
      'Keep important documents, essential medicines and emergency supplies in a safe, accessible place.',
    category: 'before',
  },
  {
    id: 'avoid-floodwater',
    title: 'Stay away from floodwater',
    description:
      'Do not walk, swim or drive through floodwater. Its depth, speed and hidden hazards may be difficult to judge.',
    category: 'during',
  },
  {
    id: 'move-to-safety',
    title: 'Move to safer ground',
    description:
      'If water is rising around you, move away from low-lying areas and follow instructions from local emergency authorities.',
    category: 'during',
  },
  {
    id: 'return-safely',
    title: 'Take care after flooding',
    description:
      'Do not return to affected buildings until authorities say it is safe. Avoid contact with contaminated water.',
    category: 'after',
  },
];

export const MOCK_EMERGENCY_HOTLINES: EmergencyHotline[] = [];

export const MOCK_PLATFORM_IMPACT: PlatformImpactSnapshot = {
  isDemoData: true,
  activeCommunities: null,
  activeVolunteers: null,
  verifiedWarnings: null,
  averageNoticeHours: null,
  uptimePct: null,
  retrievedAt: null,
};

export function createUnavailableOverview(
  community: Community,
): CommunityOverviewData {
  return {
    community,
    weather: {
      status: 'unavailable',
      provider: null,
      retrievedAt: null,
      observedRainfall6hMm: null,
      forecastRainfall24hMm: null,
      temperatureC: null,
      humidityPct: null,
      staleLimitHours: null,
      message:
        'Live weather data has not been connected to this demonstration community.',
      isDemoData: true,
    },
    risk: {
      status: 'insufficient_data',
      level: null,
      score: null,
      summary: 'A risk assessment is not available.',
      explanation: null,
      explanationStatus: 'unavailable',
      factors: [],
      missingInputs: [
        'Live weather observations',
        'Configured local environmental inputs',
      ],
      limitations: [
        'This demonstration community has no connected live data.',
        'No official flood warning can be inferred from this prototype.',
      ],
      disclaimer:
        'FloodGuard AI prototype assessments are not official emergency warnings or scientifically validated predictions.',
      confidence: null,
      assessedAt: null,
      isDemoData: true,
    },
    verifiedHazards: [],
    safetyGuidelines: SAFETY_GUIDELINES,
    hotlines: [],
    isDemoData: true,
  };
}

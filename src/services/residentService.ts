
import {
  createUnavailableOverview,
  MOCK_COMMUNITIES,
  MOCK_EMERGENCY_HOTLINES,
  MOCK_PLATFORM_IMPACT,
  MOCK_VERIFIED_HAZARDS,
  SAFETY_GUIDELINES,
} from '../data/mockResidentData';

import type {
  Community,
  CommunityOverviewData,
  EmergencyHotline,
  PlatformImpactSnapshot,
  VerifiedHazardSummary,
} from '../types/resident';


import { getLocationDataMode } from '../features/location/services/locationService';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/+$/, '');

function ensureApiConfigured() {
  if (!API_BASE_URL) {
    throw new Error(
      'The FloodGuard API base URL has not been configured.',
    );
  }
}

async function requestApi<T>(path: string): Promise<T> {
  ensureApiConfigured();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `FloodGuard API request failed (${response.status}).`,
    );
  }

  const payload: unknown = await response.json();

  // Accept either a direct response or a { data: ... } envelope.
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload
  ) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function isApiMode() {
  return getLocationDataMode() === 'api';
}

/**
 * Lists active communities.
 * API mode uses the backend; demo mode uses local fixtures.
 */
export async function listActiveCommunities(): Promise<Community[]> {
  if (isApiMode()) {
    return requestApi<Community[]>(
      '/locations/communities?status=active',
    );
  }

  return MOCK_COMMUNITIES.filter(
    (community) => community.isActive,
  );
}

/**
 * Retrieves a community by its ID.
 * IDs returned by the backend do not need to exist in MOCK_COMMUNITIES.
 */
export async function getCommunityById(
  communityId: string,
): Promise<Community | null> {
  if (isApiMode()) {
    try {
      return await requestApi<Community>(
        `/locations/communities/${encodeURIComponent(communityId)}`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('(404)')
      ) {
        return null;
      }

      throw error;
    }
  }

  return (
    MOCK_COMMUNITIES.find(
      (community) =>
        community.id === communityId && community.isActive,
    ) ?? null
  );
}

/**
 * Retrieves the complete overview for a community.
 *
 * API response must conform to CommunityOverviewData.
 * Demo mode continues to use clearly labelled fixtures.
 */
export async function getCommunityOverview(
  communityId: string,
): Promise<CommunityOverviewData | null> {
  if (isApiMode()) {
    try {
      return await requestApi<CommunityOverviewData>(
        `/communities/${encodeURIComponent(communityId)}/overview`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('(404)')
      ) {
        return null;
      }

      throw error;
    }
  }

  const community = await getCommunityById(communityId);

  if (!community) {
    return null;
  }

  return createUnavailableOverview(community);
}

export async function listVerifiedHazards(
  communityId?: string,
): Promise<VerifiedHazardSummary[]> {
  if (isApiMode()) {
    const query = communityId
      ? `?communityId=${encodeURIComponent(communityId)}&status=verified`
      : '?status=verified';

    return requestApi<VerifiedHazardSummary[]>(
      `/hazards${query}`,
    );
  }

  return MOCK_VERIFIED_HAZARDS.filter(
    (hazard) =>
      hazard.status === 'verified' &&
      (!communityId || hazard.communityId === communityId),
  );
}

export async function getFeaturedIncident(): Promise<VerifiedHazardSummary | null> {
  const hazards = await listVerifiedHazards();

  return hazards[0] ?? null;
}

export async function getPlatformImpactSnapshot(): Promise<PlatformImpactSnapshot> {
  if (isApiMode()) {
    return requestApi<PlatformImpactSnapshot>('/platform/impact');
  }

  return MOCK_PLATFORM_IMPACT;
}

export async function getEmergencyHotlines(): Promise<EmergencyHotline[]> {
  if (isApiMode()) {
    return requestApi<EmergencyHotline[]>('/safety/hotlines');
  }

  return MOCK_EMERGENCY_HOTLINES;
}

export async function getSafetyGuidelines() {
  if (isApiMode()) {
    return requestApi<typeof SAFETY_GUIDELINES>('/safety/guidelines');
  }

  return SAFETY_GUIDELINES;
}

/**
 * Finds the closest configured active community.
 * Communities without coordinates are intentionally ignored.
 *
 * This is a proximity helper, not an authoritative reverse-geocoding
 * service. Do not use it to claim a user's administrative location.
 */
export async function findNearestActiveCommunity(
  latitude: number,
  longitude: number,
): Promise<Community | null> {
  const communities = await listActiveCommunities();

  let nearest: Community | null = null;
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (const community of communities) {
    if (
      community.latitude === null ||
      community.longitude === null
    ) {
      continue;
    }

    const distance = getDistanceInKm(
      latitude,
      longitude,
      community.latitude,
      community.longitude,
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearest = community;
    }
  }

  return nearest;
}

function getDistanceInKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const latitudeDifference = toRadians(latitude2 - latitude1);
  const longitudeDifference = toRadians(longitude2 - longitude1);

  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  );
}

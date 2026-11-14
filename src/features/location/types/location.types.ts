
/**
 * FloodGuard location domain types.
 *
 * These types distinguish administrative areas from
 * communities/settlements and their verification status.
 */

export type LocationCoverage =
  | 'national'
  | 'partial'
  | 'unknown';

export type CommunityVerificationStatus =
  | 'verified'
  | 'under_review'
  | 'unverified';

export type LocationMatchStatus =
  | 'matched'
  | 'partial'
  | 'ambiguous'
  | 'unmatched';

export interface LocationState {
  id: string;
  name: string;
  code?: string | null;
  isDemoData: boolean;
}

export interface LocationLga {
  id: string;
  name: string;
  stateId: string;
  stateName: string;
  isDemoData: boolean;
}

export interface LocationCommunity {
  id: string;
  name: string;
  stateId: string;
  stateName: string;
  lgaId: string;
  lgaName: string;
  wardId?: string | null;
  wardName?: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: CommunityVerificationStatus;
  sourceName?: string | null;
  isDemoData: boolean;
}

export interface LocationCollection<T> {
  items: T[];
  coverage: LocationCoverage;
  isDemoData: boolean;
}

export interface ResolvedLocation {
  state: LocationState | null;
  lga: LocationLga | null;
  community: LocationCommunity | null;
}

export interface ResolveCoordinatesRequest {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface ResolveCoordinatesResponse {
  matchStatus: LocationMatchStatus;
  location: ResolvedLocation;
  coordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  message: string;
  isDemoData: boolean;
}

export interface LocationRequestOptions {
  signal?: AbortSignal;
}

export interface LocationServiceConfig {
  apiBaseUrl: string;
  dataMode: 'api' | 'demo';
}

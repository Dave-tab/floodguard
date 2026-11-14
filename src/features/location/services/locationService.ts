
import { MOCK_COMMUNITIES } from '../../../data/mockResidentData';
import type { Community } from '../../../types/resident';

import type {
  LocationCollection,
  LocationCommunity,
  LocationCoverage,
  LocationLga,
  LocationRequestOptions,
  LocationServiceConfig,
  LocationState,
  ResolveCoordinatesRequest,
  ResolveCoordinatesResponse,
} from '../types/location.types';

interface AdministrativeEntity {
  id: string;
  name_en: string;
  name_local?: string;
  slug?: string;
  lat?: number | null;
  lon?: number | null;
  parent_id?: string | null;
  parent_name_en?: string | null;
}

interface AdministrativeDataset {
  count: number;
  entities: AdministrativeEntity[];
}

interface ApiCollectionResponse<T> {
  data: T[];
  coverage?: LocationCoverage;
}

interface ApiSingleResponse<T> {
  data: T;
}

type DataMode = 'api' | 'demo';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/+$/, '');

const REQUESTED_DATA_MODE = import.meta.env
  .VITE_LOCATION_DATA_MODE as DataMode | undefined;

const DATA_MODE: DataMode =
  REQUESTED_DATA_MODE === 'api' || REQUESTED_DATA_MODE === 'demo'
    ? REQUESTED_DATA_MODE
    : API_BASE_URL
      ? 'api'
      : 'demo';

const config: LocationServiceConfig = {
  apiBaseUrl: API_BASE_URL,
  dataMode: DATA_MODE,
};

const LOCAL_DATA_PATH = '/data/nigeria';

let statesDatasetPromise: Promise<AdministrativeDataset> | null = null;
let lgasDatasetPromise: Promise<AdministrativeDataset> | null = null;

export class LocationServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LocationServiceError';
    this.status = status;
  }
}

function createCollection<T>(
  items: T[],
  coverage: LocationCoverage,
  isDemoData: boolean,
): LocationCollection<T> {
  return { items, coverage, isDemoData };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createDemoStateId(stateName: string): string {
  return `demo-state-${slugify(stateName)}`;
}

function createDemoLgaId(
  stateName: string,
  lgaName: string,
): string {
  return `demo-lga-${slugify(stateName)}-${slugify(lgaName)}`;
}

function mapDemoCommunities(
  communities: Community[],
): LocationCommunity[] {
  return communities.map((community) => ({
    id: community.id,
    name: community.name,
    stateId: createDemoStateId(community.state),
    stateName: community.state,
    lgaId: createDemoLgaId(community.state, community.lga),
    lgaName: community.lga,
    latitude: community.latitude,
    longitude: community.longitude,
    verificationStatus: 'unverified',
    sourceName: 'FloodGuard local demo fixtures',
    isDemoData: true,
  }));
}

async function loadDemoCommunities(): Promise<LocationCommunity[]> {
  const communities = MOCK_COMMUNITIES.filter(
    (community) => community.isActive,
  );

  return mapDemoCommunities(communities);
}

async function loadAdministrativeDataset(
  filename: 'states.json' | 'lgas.json',
): Promise<AdministrativeDataset> {
  const response = await fetch(`${LOCAL_DATA_PATH}/${filename}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new LocationServiceError(
      `Unable to load Nigeria's ${filename.replace('.json', '')} dataset. Check that the file exists in public/data/nigeria.`,
      response.status,
    );
  }

  const payload: unknown = await response.json();

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('entities' in payload) ||
    !Array.isArray(payload.entities)
  ) {
    throw new LocationServiceError(
      `The Nigeria ${filename} file has an unexpected format.`,
    );
  }

  const dataset = payload as AdministrativeDataset;

  if (
    !dataset.entities.every(
      (entity) =>
        typeof entity.id === 'string' &&
        typeof entity.name_en === 'string',
    )
  ) {
    throw new LocationServiceError(
      `The Nigeria ${filename} file contains invalid administrative records.`,
    );
  }

  return dataset;
}

async function loadStatesDataset(): Promise<AdministrativeDataset> {
  if (!statesDatasetPromise) {
    statesDatasetPromise = loadAdministrativeDataset('states.json')
      .catch((error: unknown) => {
        statesDatasetPromise = null;
        throw error;
      });
  }

  return statesDatasetPromise;
}

async function loadLgasDataset(): Promise<AdministrativeDataset> {
  if (!lgasDatasetPromise) {
    lgasDatasetPromise = loadAdministrativeDataset('lgas.json')
      .catch((error: unknown) => {
        lgasDatasetPromise = null;
        throw error;
      });
  }

  return lgasDatasetPromise;
}

function ensureApiMode(): void {
  if (config.dataMode !== 'api') {
    throw new LocationServiceError(
      'The location API is not configured. The service is currently using demo data.',
    );
  }

  if (!config.apiBaseUrl) {
    throw new LocationServiceError(
      'VITE_API_BASE_URL is required when location API mode is enabled.',
    );
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  ensureApiMode();

  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    throw new LocationServiceError(
      'Unable to connect to the location service. Please try again.',
    );
  }

  if (!response.ok) {
    let message = 'The location service could not complete your request.';

    try {
      const errorBody: unknown = await response.json();

      if (
        typeof errorBody === 'object' &&
        errorBody !== null &&
        'message' in errorBody &&
        typeof errorBody.message === 'string'
      ) {
        message = errorBody.message;
      }
    } catch {
      // Keep the default message if the response has no JSON body.
    }

    throw new LocationServiceError(message, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new LocationServiceError(
      'The location service returned an invalid response.',
    );
  }
}

async function requestCollection<T>(
  path: string,
  options?: LocationRequestOptions,
): Promise<LocationCollection<T>> {
  const response = await requestJson<
    ApiCollectionResponse<T> | T[]
  >(path, {
    method: 'GET',
    signal: options?.signal,
  });

  if (Array.isArray(response)) {
    return createCollection(response as T[], 'unknown', false);
  }

  const collection = response as ApiCollectionResponse<T>;

  if (!collection || !Array.isArray(collection.data)) {
    throw new LocationServiceError(
      'The location service returned an invalid collection.',
    );
  }

  return createCollection(
    collection.data,
    collection.coverage ?? 'unknown',
    false,
  );
}

/** Returns whether community data comes from the API or demo fixtures. */
export function getLocationDataMode(): DataMode {
  return config.dataMode;
}

/**
 * Loads all 37 Nigerian state-level divisions from the local
 * Open Admin Data Nigeria dataset.
 */
export async function listStates(): Promise<LocationCollection<LocationState>> {
  const dataset = await loadStatesDataset();

  const items: LocationState[] = dataset.entities
    .map((entity) => ({
      id: entity.id,
      name: entity.name_en,
      isDemoData: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return createCollection(items, 'national', false);
}

/**
 * Loads the LGAs belonging to the selected state.
 * The relationship is determined by the dataset's parent_id.
 */
export async function listLgas(
  stateId: string,
): Promise<LocationCollection<LocationLga>> {
  if (!stateId.trim()) {
    return createCollection([], 'unknown', false);
  }

  const [statesDataset, lgasDataset] = await Promise.all([
    loadStatesDataset(),
    loadLgasDataset(),
  ]);

  const selectedState = statesDataset.entities.find(
    (state) => state.id === stateId,
  );

  if (!selectedState) {
    return createCollection([], 'national', false);
  }

  const items: LocationLga[] = lgasDataset.entities
    .filter((lga) => lga.parent_id === stateId)
    .map((lga) => ({
      id: lga.id,
      name: lga.name_en,
      stateId,
      stateName: selectedState.name_en,
      isDemoData: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return createCollection(items, 'national', false);
}

/**
 * Returns communities belonging to a selected LGA.
 * Actual community records are not inferred from wards.
 */
export async function listCommunitiesByLga(
  lgaId: string,
  options?: LocationRequestOptions,
): Promise<LocationCollection<LocationCommunity>> {
  if (!lgaId.trim()) {
    return createCollection(
      [],
      'unknown',
      config.dataMode === 'demo',
    );
  }

  if (config.dataMode === 'api') {
    return requestCollection<LocationCommunity>(
      `/locations/lgas/${encodeURIComponent(lgaId)}/communities`,
      options,
    );
  }

  const communities = await loadDemoCommunities();

  const items = communities
    .filter((community) => community.lgaId === lgaId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return createCollection(items, 'partial', true);
}

/** Searches community records in the configured community data source. */
export async function searchCommunities(
  query: string,
  options?: LocationRequestOptions,
): Promise<LocationCollection<LocationCommunity>> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return createCollection(
      [],
      'unknown',
      config.dataMode === 'demo',
    );
  }

  if (config.dataMode === 'api') {
    const params = new URLSearchParams({
      search: normalizedQuery,
    });

    return requestCollection<LocationCommunity>(
      `/locations/communities?${params.toString()}`,
      options,
    );
  }

  const communities = await loadDemoCommunities();
  const searchTerm = normalizedQuery.toLowerCase();

  const items = communities
    .filter((community) =>
      [
        community.name,
        community.lgaName,
        community.stateName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return createCollection(items, 'partial', true);
}

/**
 * Resolves device coordinates through the backend.
 * Demo mode never guesses a community from nearby sample records.
 */
export async function resolveCoordinates(
  input: ResolveCoordinatesRequest,
  options?: LocationRequestOptions,
): Promise<ResolveCoordinatesResponse> {
  const { latitude, longitude, accuracyMeters } = input;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new LocationServiceError(
      'Please provide valid geographic coordinates.',
    );
  }

  if (config.dataMode === 'demo') {
    return {
      matchStatus: 'unmatched',
      location: {
        state: null,
        lga: null,
        community: null,
      },
      coordinates: {
        latitude,
        longitude,
        accuracyMeters,
      },
      message:
        'Automatic location matching is not available in demo mode. Please select your location manually.',
      isDemoData: true,
    };
  }

  const response = await requestJson<
    ApiSingleResponse<ResolveCoordinatesResponse> |
    ResolveCoordinatesResponse
  >('/locations/resolve', {
    method: 'POST',
    signal: options?.signal,
    body: JSON.stringify({
      latitude,
      longitude,
      accuracyMeters,
    }),
  });

  const result =
    typeof response === 'object' &&
    response !== null &&
    'data' in response
      ? response.data
      : response;

  if (
    !result ||
    !result.location ||
    !result.coordinates ||
    !result.matchStatus
  ) {
    throw new LocationServiceError(
      'The location service returned an invalid coordinate match.',
    );
  }

  return {
    ...result,
    isDemoData: false,
  };
}

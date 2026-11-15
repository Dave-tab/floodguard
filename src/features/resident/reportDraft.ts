/**
 * A hazard report that a signed-out visitor filled in, kept on THIS device only until they
 * sign in and press Submit. It is never sent anywhere by itself and expires after 24 hours.
 * Pure helpers (storage is passed in) so they can be unit-tested without a browser.
 */
import type { HazardCategory } from '../../types/resident';

export const DRAFT_KEY = 'floodguard.reportDraft.v1';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** Where the report page resumes a saved draft after sign-in. */
export const RESUME_PATH = '/report-hazard?resume=1';

const CATEGORIES: readonly HazardCategory[] = [
  'flooded_road',
  'rising_water_level',
  'blocked_drainage',
  'overflowing_waterway',
  'damaged_drainage',
  'other',
];

const LIMITS = { communityId: 100, description: 1000, locationDetails: 500 } as const;

export interface ReportDraft {
  communityId: string;
  category: HazardCategory;
  description: string;
  locationDetails: string;
  /** Only present when the visitor explicitly used the location button. */
  latitude: number | null;
  longitude: number | null;
  savedAt: string;
}

export interface DraftInput {
  communityId: string;
  category: HazardCategory;
  description: string;
  locationDetails: string;
  coordinates: { latitude: number; longitude: number } | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isCategory(value: unknown): value is HazardCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function validCoordinates(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function buildDraft(input: DraftInput, now: Date): ReportDraft {
  const c = input.coordinates;
  const coords = c && validCoordinates(c.latitude, c.longitude) ? c : null;

  return {
    communityId: input.communityId.slice(0, LIMITS.communityId),
    category: input.category,
    description: input.description.slice(0, LIMITS.description),
    locationDetails: input.locationDetails.slice(0, LIMITS.locationDetails),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    savedAt: now.toISOString(),
  };
}

/** Returns the draft if the stored text is a well-formed, unexpired draft; otherwise null. */
export function parseDraft(raw: string | null, now: Date): ReportDraft | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;
  const d = value as Record<string, unknown>;

  if (
    typeof d.communityId !== 'string' ||
    d.communityId === '' ||
    d.communityId.length > LIMITS.communityId ||
    !isCategory(d.category) ||
    typeof d.description !== 'string' ||
    d.description.length > LIMITS.description ||
    typeof d.locationDetails !== 'string' ||
    d.locationDetails.length > LIMITS.locationDetails ||
    typeof d.savedAt !== 'string'
  ) {
    return null;
  }

  const savedAt = Date.parse(d.savedAt);
  const age = now.getTime() - savedAt;
  if (Number.isNaN(savedAt) || age < 0 || age > DRAFT_TTL_MS) return null;

  const hasCoords = validCoordinates(d.latitude, d.longitude);
  if (!hasCoords && (d.latitude != null || d.longitude != null)) return null;

  return {
    communityId: d.communityId,
    category: d.category,
    description: d.description,
    locationDetails: d.locationDetails,
    latitude: hasCoords ? (d.latitude as number) : null,
    longitude: hasCoords ? (d.longitude as number) : null,
    savedAt: d.savedAt,
  };
}

/** Saves the draft; returns false if this device does not allow storage. */
export function saveDraft(storage: StorageLike | null, draft: ReportDraft): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Loads a valid draft; an invalid or expired one is removed. */
export function loadDraft(storage: StorageLike | null, now: Date): ReportDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    const draft = parseDraft(raw, now);
    if (raw && !draft) storage.removeItem(DRAFT_KEY);
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** The browser's localStorage, or null when it is blocked or unavailable. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Accepts only same-site paths ("/..."), so a `from` value can never redirect elsewhere. */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

/** Sign-in / registration link that returns to the saved report afterwards. */
export function authLinkForDraft(mode: 'login' | 'register'): string {
  return `/${mode}?from=${encodeURIComponent(RESUME_PATH)}`;
}

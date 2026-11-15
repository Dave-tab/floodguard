// Unit tests for the saved-report draft helpers. Run with `npm test` (Node's built-in test
// runner; Node 22.18+/24 runs TypeScript directly, no extra dependencies).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DRAFT_KEY,
  DRAFT_TTL_MS,
  authLinkForDraft,
  buildDraft,
  clearDraft,
  loadDraft,
  parseDraft,
  safeInternalPath,
  saveDraft,
  type StorageLike,
} from '../src/features/resident/reportDraft.ts';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const input = {
  communityId: '37463757-bb85-4887-99fc-f8062f1eff65',
  category: 'blocked_drainage' as const,
  description: 'Drain near the market is blocked with refuse',
  locationDetails: 'Beside the bus stop',
  coordinates: null,
};

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('report draft', () => {
  it('round-trips a draft through storage', () => {
    const s = memoryStorage();
    assert.equal(saveDraft(s, buildDraft(input, NOW)), true);
    const d = loadDraft(s, NOW);
    assert.ok(d);
    assert.equal(d.communityId, input.communityId);
    assert.equal(d.category, 'blocked_drainage');
    assert.equal(d.locationDetails, 'Beside the bus stop');
    assert.equal(d.latitude, null);
    assert.equal(d.savedAt, NOW.toISOString());
  });

  it('stores only the expected fields', () => {
    const d = buildDraft({ ...input, coordinates: { latitude: 7.44, longitude: 3.92 } }, NOW);
    assert.deepEqual(Object.keys(d).sort(), [
      'category', 'communityId', 'description', 'latitude', 'locationDetails', 'longitude', 'savedAt',
    ]);
    assert.equal(d.latitude, 7.44);
  });

  it('drops out-of-range coordinates', () => {
    const d = buildDraft({ ...input, coordinates: { latitude: 95, longitude: 3 } }, NOW);
    assert.equal(d.latitude, null);
    assert.equal(d.longitude, null);
  });

  it('expires after 24 hours and removes the stale draft', () => {
    const s = memoryStorage();
    saveDraft(s, buildDraft(input, NOW));
    const later = new Date(NOW.getTime() + DRAFT_TTL_MS + 1000);
    assert.equal(loadDraft(s, later), null);
    assert.equal(s.data.has(DRAFT_KEY), false);
  });

  it('rejects malformed or tampered drafts', () => {
    const good = buildDraft(input, NOW);
    const bad = [
      'not json',
      JSON.stringify({ ...good, category: 'fire' }),
      JSON.stringify({ ...good, communityId: '' }),
      JSON.stringify({ ...good, description: 'x'.repeat(1001) }),
      JSON.stringify({ ...good, latitude: 7.4 }),
      JSON.stringify({ ...good, savedAt: 'yesterday' }),
      JSON.stringify({ ...good, savedAt: new Date(NOW.getTime() + 60_000).toISOString() }),
    ];
    for (const raw of bad) assert.equal(parseDraft(raw, NOW), null, raw.slice(0, 60));
  });

  it('never throws when storage is blocked', () => {
    assert.equal(saveDraft(throwingStorage, buildDraft(input, NOW)), false);
    assert.equal(loadDraft(throwingStorage, NOW), null);
    assert.doesNotThrow(() => clearDraft(throwingStorage));
    assert.equal(saveDraft(null, buildDraft(input, NOW)), false);
    assert.equal(loadDraft(null, NOW), null);
  });

  it('clears the draft', () => {
    const s = memoryStorage();
    saveDraft(s, buildDraft(input, NOW));
    clearDraft(s);
    assert.equal(loadDraft(s, NOW), null);
  });
});

describe('redirect helpers', () => {
  it('accepts only same-site paths', () => {
    assert.equal(safeInternalPath('/report-hazard?resume=1'), '/report-hazard?resume=1');
    for (const v of ['https://evil.example', '//evil.example', '/\\evil', 'report', '', null, undefined]) {
      assert.equal(safeInternalPath(v), null, String(v));
    }
  });

  it('builds sign-in and register links that return to the saved report', () => {
    assert.equal(authLinkForDraft('login'), '/login?from=%2Freport-hazard%3Fresume%3D1');
    assert.equal(authLinkForDraft('register'), '/register?from=%2Freport-hazard%3Fresume%3D1');
  });
});

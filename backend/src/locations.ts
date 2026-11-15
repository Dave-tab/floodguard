// States, LGAs and communities. The frontend selects States/LGAs from the bundled Open Admin
// Data Nigeria files (ids like "NG025" / "NG025012") and sends those ids back to us, while the
// database has its own states/lgas tables. This module maps between the two so either id works.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Db } from "./db/repo.ts";
import type { CommunityRow, LgaRow, StateRow } from "./db/schema.ts";

export interface AdminEntity { id: string; name_en: string; parent_id?: string | null; lat?: number | null; lon?: number | null }
export interface AdminDataset { states: AdminEntity[]; lgas: AdminEntity[] }

const DATA_DIR = fileURLToPath(new URL("../../public/data/nigeria/", import.meta.url));

export async function loadAdminDataset(dir = DATA_DIR): Promise<AdminDataset> {
  const read = async (f: string) => (JSON.parse(await readFile(dir + f, "utf8")) as { entities: AdminEntity[] }).entities;
  const [states, lgas] = await Promise.all([read("states.json"), read("lgas.json")]);
  return { states, lgas };
}

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

export interface LgaInfo { extId: string; dbIds: string[]; name: string; stateExtId: string; stateName: string }
export interface StateInfo { extId: string; dbIds: string[]; name: string; code: string | null }

/** Joined view of administrative areas: dataset ids are the external ids the frontend uses. */
export class LocationIndex {
  readonly states: StateInfo[];
  readonly lgas: LgaInfo[];
  private readonly lgaByAnyId = new Map<string, LgaInfo>();
  private readonly stateByAnyId = new Map<string, StateInfo>();

  constructor(ds: AdminDataset, dbStates: StateRow[], dbLgas: LgaRow[]) {
    const stateByNorm = new Map<string, StateInfo>();
    this.states = ds.states.map((s) => {
      const info: StateInfo = { extId: s.id, dbIds: [], name: s.name_en, code: null };
      stateByNorm.set(norm(s.name_en), info);
      return info;
    });
    for (const s of this.states) this.stateByAnyId.set(s.extId, s);
    for (const r of dbStates) {
      const info = this.stateByAnyId.get(r.id) ?? (r.code ? this.stateByAnyId.get(r.code) : undefined) ?? stateByNorm.get(norm(r.name))
        ?? stateByNorm.get(norm(r.name.replace(/federal capital territory/i, "fct")));
      if (!info) continue;
      info.dbIds.push(r.id);
      info.code = r.code;
      this.stateByAnyId.set(r.id, info);
    }

    const lgaByKey = new Map<string, LgaInfo>();
    this.lgas = ds.lgas.map((l) => {
      const st = this.stateByAnyId.get(l.parent_id ?? "");
      const info: LgaInfo = { extId: l.id, dbIds: [], name: l.name_en, stateExtId: l.parent_id ?? "", stateName: st?.name ?? "" };
      lgaByKey.set(`${info.stateExtId}|${norm(l.name_en)}`, info);
      return info;
    });
    for (const l of this.lgas) this.lgaByAnyId.set(l.extId, l);
    for (const r of dbLgas) {
      const st = this.stateByAnyId.get(r.state_id);
      const info = this.lgaByAnyId.get(r.id) ?? (r.code ? this.lgaByAnyId.get(r.code) : undefined)
        ?? (st ? lgaByKey.get(`${st.extId}|${norm(r.name)}`) : undefined);
      if (!info) continue;
      info.dbIds.push(r.id);
      this.lgaByAnyId.set(r.id, info);
    }
  }

  lga(anyId: string | null | undefined): LgaInfo | null {
    return anyId ? this.lgaByAnyId.get(anyId) ?? null : null;
  }
  state(anyId: string | null | undefined): StateInfo | null {
    return anyId ? this.stateByAnyId.get(anyId) ?? null : null;
  }
  lgasOfState(stateAnyId: string): LgaInfo[] {
    const st = this.state(stateAnyId);
    return st ? this.lgas.filter((l) => l.stateExtId === st.extId) : [];
  }
  /** Every id the communities.lga_id column might hold for this LGA. */
  lgaIdCandidates(anyId: string): string[] {
    const info = this.lga(anyId);
    return info ? [...new Set([info.extId, ...info.dbIds])] : [];
  }
}

/** Caches the index (states/LGAs change rarely). */
export class LocationService {
  private cached: { at: number; index: LocationIndex } | null = null;
  private dataset: AdminDataset | null = null;

  constructor(private readonly db: Db, private readonly loadDataset: () => Promise<AdminDataset> = () => loadAdminDataset(), private readonly ttlMs = 10 * 60_000) {}

  async index(): Promise<LocationIndex> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.index;
    this.dataset ??= await this.loadDataset();
    const [s, l] = await Promise.all([this.db.listStates().catch(() => []), this.db.listLgas().catch(() => [])]);
    const index = new LocationIndex(this.dataset, s, l);
    this.cached = { at: Date.now(), index };
    return index;
  }
}

// ---- Frontend shapes (src/types/resident.ts and src/features/location/types on main) ----

export interface ResidentCommunity {
  id: string; name: string; state: string; lga: string; basinLabel: string | null;
  latitude: number | null; longitude: number | null; isActive: boolean; isDemoData: false; lastSyncedLabel: string | null;
}
export interface LocationCommunity {
  id: string; name: string; stateId: string; stateName: string; lgaId: string; lgaName: string;
  wardId: string | null; wardName: string | null; latitude: number | null; longitude: number | null;
  verificationStatus: "verified" | "under_review" | "unverified"; sourceName: string | null; isDemoData: false;
}

const UNKNOWN = "Unknown";

export function toResidentCommunity(c: CommunityRow, idx: LocationIndex): ResidentCommunity {
  const lga = idx.lga(c.lga_id);
  return {
    id: c.id, name: c.name, state: lga?.stateName || UNKNOWN, lga: lga?.name ?? UNKNOWN, basinLabel: null,
    latitude: num(c.latitude), longitude: num(c.longitude), isActive: c.is_active, isDemoData: false, lastSyncedLabel: null,
  };
}

export function toLocationCommunity(c: CommunityRow, idx: LocationIndex): LocationCommunity {
  const lga = idx.lga(c.lga_id);
  const vs = c.verification_status;
  return {
    id: c.id, name: c.name,
    stateId: lga?.stateExtId ?? "", stateName: lga?.stateName || UNKNOWN,
    lgaId: lga?.extId ?? c.lga_id ?? "", lgaName: lga?.name ?? UNKNOWN,
    wardId: c.ward_id, wardName: null,
    latitude: num(c.latitude), longitude: num(c.longitude),
    verificationStatus: vs === "verified" || vs === "under_review" ? vs : "unverified",
    sourceName: "FloodGuard community registry", isDemoData: false,
  };
}

/** Coordinates are only usable when both are finite and inside Nigeria's bounding box. */
export function coords(c: Pick<CommunityRow, "latitude" | "longitude">): { lat: number; lon: number } | null {
  const lat = num(c.latitude);
  const lon = num(c.longitude);
  if (lat == null || lon == null) return null;
  if (lat < 3.5 || lat > 14.5 || lon < 2.4 || lon > 15) return null;
  return { lat, lon };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

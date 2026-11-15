// States, LGAs and communities.
//
// The frontend selects States/LGAs from its bundled Open Admin Data Nigeria files (ids like
// "NG025" / "NG025012") and sends those ids back; the database uses uuids. This module
// resolves either kind of id:
//   dataset id -> DB row by `code` or `source_record_id`, then by case-insensitive name
//   within the state of the same name.
// The states/LGAs endpoints always cover all 37 States/FCT and 774 LGAs: database rows where
// they exist (with their uuids), and the bundled dataset entries for everything else.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Db } from "./db/repo.ts";
import type { CommunityRow, LgaRow, StateRow } from "./db/schema.ts";
import { verificationFromDb } from "./mapping.ts";

export interface AdminEntity { id: string; name_en: string; parent_id?: string | null }
export interface AdminDataset { states: AdminEntity[]; lgas: AdminEntity[] }

const DATA_DIR = fileURLToPath(new URL("../../public/data/nigeria/", import.meta.url));

export async function loadAdminDataset(dir = DATA_DIR): Promise<AdminDataset> {
  const read = async (f: string) => (JSON.parse(await readFile(dir + f, "utf8")) as { entities: AdminEntity[] }).entities;
  const [states, lgas] = await Promise.all([read("states.json"), read("lgas.json")]);
  return { states, lgas };
}

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
const stateNorm = (s: string) => norm(s.replace(/federal capital territory/i, "fct"));

export interface StateInfo { id: string; name: string; code: string | null; dbId: string | null; datasetId: string | null }
export interface LgaInfo { id: string; name: string; stateId: string; stateName: string; dbId: string | null; datasetId: string | null }

export class LocationIndex {
  /** "database": DB rows merged over the national dataset; "dataset": DB admin tables empty. */
  readonly source: "database" | "dataset";
  readonly states: StateInfo[];
  readonly lgas: LgaInfo[];
  private readonly stateById = new Map<string, StateInfo>();
  private readonly lgaById = new Map<string, LgaInfo>();

  constructor(ds: AdminDataset, dbStates: StateRow[], dbLgas: LgaRow[]) {
    this.source = dbStates.length && dbLgas.length ? "database" : "dataset";
    const dsStateById = new Map(ds.states.map((s) => [s.id, s]));

    if (this.source === "database") {
      const dbStateByNorm = new Map<string, StateRow>();
      const dbStateByKey = new Map<string, StateRow>();
      for (const s of dbStates) {
        dbStateByNorm.set(stateNorm(s.name), s);
        for (const k of [s.code, s.source_record_id]) if (k) dbStateByKey.set(k, s);
      }
      // dataset state -> DB state
      const dsToDbState = new Map<string, string>();
      for (const s of ds.states) {
        const m = dbStateByKey.get(s.id) ?? dbStateByNorm.get(stateNorm(s.name_en));
        if (m) dsToDbState.set(s.id, m.id);
      }
      const dbToDsState = new Map([...dsToDbState].map(([d, b]) => [b, d]));
      this.states = dbStates.map((s) => ({ id: s.id, name: s.name, code: s.code, dbId: s.id, datasetId: dbToDsState.get(s.id) ?? null }));
      for (const s of this.states) {
        this.stateById.set(s.id, s);
        if (s.datasetId) this.stateById.set(s.datasetId, s);
      }

      const stateName = new Map(dbStates.map((s) => [s.id, s.name]));
      const dbLgaByKey = new Map<string, LgaRow>();
      const dbLgaByName = new Map<string, LgaRow>();
      for (const l of dbLgas) {
        for (const k of [l.code, l.source_record_id]) if (k) dbLgaByKey.set(k, l);
        dbLgaByName.set(`${l.state_id}|${norm(l.name)}`, l);
      }
      this.lgas = dbLgas.map((l) => ({ id: l.id, name: l.name, stateId: l.state_id, stateName: stateName.get(l.state_id) ?? "", dbId: l.id, datasetId: null }));
      for (const l of this.lgas) this.lgaById.set(l.id, l);
      for (const d of ds.lgas) {
        const dbState = dsToDbState.get(d.parent_id ?? "");
        const m = dbLgaByKey.get(d.id) ?? (dbState ? dbLgaByName.get(`${dbState}|${norm(d.name_en)}`) : undefined);
        const info = m ? this.lgaById.get(m.id) : undefined;
        if (info) {
          info.datasetId ??= d.id;
          this.lgaById.set(d.id, info);
        }
      }
      // The database may hold only some States/LGAs (on 2026-11-15: Oyo only). Keep national
      // coverage by adding every dataset State/LGA that has no database row yet; such an LGA
      // simply has no communities, it is not "not found".
      for (const s of ds.states) {
        if (dsToDbState.has(s.id)) continue;
        const info: StateInfo = { id: s.id, name: s.name_en, code: null, dbId: null, datasetId: s.id };
        this.states.push(info);
        this.stateById.set(s.id, info);
      }
      for (const d of ds.lgas) {
        if (this.lgaById.has(d.id)) continue;
        const st = this.state(d.parent_id ?? "");
        const info: LgaInfo = { id: d.id, name: d.name_en, stateId: st?.id ?? d.parent_id ?? "", stateName: st?.name ?? "", dbId: null, datasetId: d.id };
        this.lgas.push(info);
        this.lgaById.set(d.id, info);
      }
      this.states.sort((a, b) => a.name.localeCompare(b.name));
      this.lgas.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      this.states = ds.states.map((s) => ({ id: s.id, name: s.name_en, code: null, dbId: null, datasetId: s.id }));
      for (const s of this.states) this.stateById.set(s.id, s);
      this.lgas = ds.lgas.map((l) => ({
        id: l.id, name: l.name_en, stateId: l.parent_id ?? "", stateName: dsStateById.get(l.parent_id ?? "")?.name_en ?? "", dbId: null, datasetId: l.id,
      }));
      for (const l of this.lgas) this.lgaById.set(l.id, l);
    }
  }

  state(anyId: string | null | undefined) { return anyId ? this.stateById.get(anyId) ?? null : null; }
  lga(anyId: string | null | undefined) { return anyId ? this.lgaById.get(anyId) ?? null : null; }
  lgasOfState(stateAnyId: string): LgaInfo[] {
    const st = this.state(stateAnyId);
    return st ? this.lgas.filter((l) => l.stateId === st.id) : [];
  }
  /** DB lga uuid for a frontend or DB LGA id (null when the LGA is not in the database). */
  dbLgaId(anyId: string): string | null { return this.lga(anyId)?.dbId ?? null; }
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
  return {
    id: c.id, name: c.name,
    stateId: lga?.stateId ?? "", stateName: lga?.stateName || UNKNOWN,
    lgaId: lga?.id ?? c.lga_id, lgaName: lga?.name ?? UNKNOWN,
    wardId: c.ward_id, wardName: null,
    latitude: num(c.latitude), longitude: num(c.longitude),
    verificationStatus: verificationFromDb(c.verification_status),
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

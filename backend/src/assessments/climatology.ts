// Local rainfall climatology for any community.
//
// - Within 25 km of a pilot area: reuse the pilot's hand-checked setup (20-year ERA5
//   climatology, river reach, flood mechanism) from risk-engine/data/climatology.json.
// - Elsewhere: build it lazily from ERA5 hourly precipitation, 2015-2024 (10 years, one
//   variable). Open-Meteo counts that as ~261 calls, so results are shared per ERA5 grid cell
//   (0.25 deg, ~28 km) and cached on disk; at most a few cells are built per day, leaving the
//   rest of the free-tier budget for the 3-hourly forecasts. Until a cell is built the engine
//   gets no climatology and reports insufficient data for rainfall - it is never guessed.
//   No river reach is assigned outside pilots, because Open-Meteo can snap to the wrong river
//   and each reach must be checked by hand.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assembleClimatology, PILOT_COMMUNITIES, type Climatology, type Community } from "../../../risk-engine/src/index.ts";
import { haversineKm } from "../locations.ts";
import { callWeight, type OpenMeteoBudget } from "./budget.ts";
import type { JsonStore } from "./store.ts";

export const CLIMATOLOGY_START = "2015-01-01";
export const CLIMATOLOGY_END = "2024-12-31";
export const CLIMATOLOGY_WEIGHT = callWeight(1, 3653);
/** Budget kept free for forecasts when deciding whether to build a new cell today. */
export const FORECAST_RESERVE = 2500;
const PILOT_RADIUS_KM = 25;
const RETRY_AFTER_FAILURE_MS = 6 * 3_600_000;

type PilotBase = (typeof PILOT_COMMUNITIES)[number];
export interface PilotMatch { pilot: PilotBase; climatology: Climatology | null; distanceKm: number }

const PILOT_FILE = fileURLToPath(new URL("../../../risk-engine/data/climatology.json", import.meta.url));

export async function loadPilotClimatology(file = PILOT_FILE): Promise<Record<string, Climatology>> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, Climatology>;
  } catch {
    return {};
  }
}

export function nearestPilot(lat: number, lon: number, clim: Record<string, Climatology>): PilotMatch | null {
  let best: PilotMatch | null = null;
  for (const p of PILOT_COMMUNITIES) {
    const d = haversineKm({ lat, lon }, { lat: p.lat, lon: p.lon });
    if (d <= PILOT_RADIUS_KM && (!best || d < best.distanceKm)) best = { pilot: p, climatology: clim[p.id] ?? null, distanceKm: d };
  }
  return best;
}

export const cellKey = (lat: number, lon: number) => {
  const r = (x: number) => (Math.round(x * 4) / 4).toFixed(2);
  return `${r(lat)}_${r(lon)}`;
};

interface CellRecord { climatology: Climatology | null; builtAt?: string; failedAt?: string; error?: string }

export class ClimatologyService {
  private pilotClim: Record<string, Climatology> | null = null;
  private inflight = new Map<string, Promise<Climatology | null>>();

  constructor(
    private readonly store: JsonStore,
    private readonly budget: OpenMeteoBudget,
    private readonly opts: { apiKey?: string | null; fetchImpl?: typeof fetch; loadPilots?: () => Promise<Record<string, Climatology>>; now?: () => Date } = {},
  ) {}

  private async pilots() {
    this.pilotClim ??= await (this.opts.loadPilots ?? loadPilotClimatology)();
    return this.pilotClim;
  }

  /** Engine community fields that depend on location: pilot setup or plain pluvial. */
  async profile(lat: number, lon: number, communityType: string | null): Promise<Pick<Community, "mechanism" | "setting" | "riverPoint" | "climatology"> & { pilotId: string | null }> {
    const pilot = nearestPilot(lat, lon, await this.pilots());
    if (pilot) {
      return { mechanism: pilot.pilot.mechanism, setting: pilot.pilot.setting, riverPoint: pilot.pilot.riverPoint, climatology: pilot.climatology, pilotId: pilot.pilot.id };
    }
    const setting = /river|rural|coast|delta/i.test(communityType ?? "") ? "riverine" : "urban";
    return { mechanism: "pluvial", setting, riverPoint: undefined, climatology: await this.forCell(lat, lon), pilotId: null };
  }

  /** Cached cell climatology, building it if budget allows. Null = not available yet. */
  async forCell(lat: number, lon: number): Promise<Climatology | null> {
    const key = cellKey(lat, lon);
    const rec = await this.store.get<CellRecord>(`clim-${key}`);
    if (rec?.climatology) return rec.climatology;
    const now = (this.opts.now ?? (() => new Date()))();
    if (rec?.failedAt && now.getTime() - Date.parse(rec.failedAt) < RETRY_AFTER_FAILURE_MS) return null;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.build(key, now).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async build(key: string, now: Date): Promise<Climatology | null> {
    if (!(await this.budget.take(CLIMATOLOGY_WEIGHT, FORECAST_RESERVE))) return null;
    const [latS, lonS] = key.split("_");
    const u = new URL("https://archive-api.open-meteo.com/v1/archive");
    u.searchParams.set("latitude", latS!);
    u.searchParams.set("longitude", lonS!);
    u.searchParams.set("start_date", CLIMATOLOGY_START);
    u.searchParams.set("end_date", CLIMATOLOGY_END);
    u.searchParams.set("hourly", "precipitation");
    u.searchParams.set("timezone", "UTC");
    if (this.opts.apiKey) u.searchParams.set("apikey", this.opts.apiKey);
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(u.toString(), { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
      const body = (await res.json()) as { hourly?: { precipitation?: (number | null)[] } };
      const precip = body.hourly?.precipitation ?? [];
      const valid = precip.filter((x) => x != null).length;
      if (valid < 5 * 365 * 24) throw new Error(`Too little archive data (${valid} hours)`);
      const climatology = assembleClimatology({ hourlyPrecip: precip, period: `${CLIMATOLOGY_START}/${CLIMATOLOGY_END} (ERA5 cell ${key})` });
      await this.store.set(`clim-${key}`, { climatology, builtAt: now.toISOString() } satisfies CellRecord);
      return climatology;
    } catch (e) {
      await this.store.set(`clim-${key}`, { climatology: null, failedAt: now.toISOString(), error: String(e).slice(0, 300) } satisfies CellRecord);
      return null;
    }
  }
}

// Open-Meteo usage budget. The free tier allows 10,000 calls/day, and a call asking for more
// than 2 weeks of data (or more than 10 variables) counts as several calls. We estimate the
// weight of each call before making it and stop when the day's budget is spent, so the
// service degrades to "insufficient data" instead of being blocked by the provider.
import type { JsonStore } from "./store.ts";

/** Estimated call weight: max(1, variables / 10) x max(1, days / 14). */
export function callWeight(variables: number, days: number): number {
  return Math.max(1, variables / 10) * Math.max(1, days / 14);
}

export const WEIGHTS = {
  /** Forecast: 7 past + 3 forecast days, 4 hourly + 3 current variables. */
  forecast: callWeight(7, 10),
  /** GloFAS: 3 past + 30 forecast days, 1 variable. */
  river: callWeight(1, 33),
} as const;

export class OpenMeteoBudget {
  private day = "";
  private used = 0;
  private loaded = false;

  constructor(private readonly limit: number, private readonly store: JsonStore, private readonly now: () => Date = () => new Date()) {}

  private async sync() {
    const today = this.now().toISOString().slice(0, 10);
    if (!this.loaded) {
      const saved = await this.store.get<{ day: string; used: number }>("openmeteo-budget");
      if (saved?.day === today) this.used = saved.used;
      this.day = today;
      this.loaded = true;
    }
    if (this.day !== today) {
      this.day = today;
      this.used = 0;
    }
  }

  /** Reserves `weight` if it fits within the limit minus `keepFree`. */
  async take(weight: number, keepFree = 0): Promise<boolean> {
    await this.sync();
    if (this.used + weight > this.limit - keepFree) return false;
    this.used += weight;
    await this.store.set("openmeteo-budget", { day: this.day, used: Math.round(this.used * 10) / 10 }).catch(() => undefined);
    return true;
  }

  async usage() {
    await this.sync();
    return { day: this.day, used: Math.round(this.used * 10) / 10, limit: this.limit };
  }
}

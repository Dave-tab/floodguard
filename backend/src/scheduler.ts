// Background jobs:
// - every 3 h: assess every active community that has coordinates (2 at a time, spaced out);
// - every 5 min: reassess communities whose reports were reviewed since the last check
//   (the admin dashboard reviews reports directly in Supabase, so we poll for changes).
import type { AssessmentService } from "./assessments/service.ts";
import type { Db } from "./db/repo.ts";
import { coords, type LocationService } from "./locations.ts";

export interface SchedulerOptions {
  fullEveryMs?: number;
  reviewPollMs?: number;
  concurrency?: number;
  spacingMs?: number;
  now?: () => Date;
  log?: { info: (o: object, m?: string) => void; error: (o: object, m?: string) => void };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private fullRunning = false;
  private lastReviewCheck: string;
  private readonly o: Required<Omit<SchedulerOptions, "log">> & Pick<SchedulerOptions, "log">;

  constructor(private readonly db: Db, private readonly locations: LocationService, private readonly assessments: AssessmentService, opts: SchedulerOptions = {}) {
    this.o = {
      fullEveryMs: opts.fullEveryMs ?? 3 * 3_600_000,
      reviewPollMs: opts.reviewPollMs ?? 5 * 60_000,
      concurrency: opts.concurrency ?? 2,
      spacingMs: opts.spacingMs ?? 1_500,
      now: opts.now ?? (() => new Date()),
      log: opts.log,
    };
    this.lastReviewCheck = this.o.now().toISOString();
  }

  start() {
    const full = () => void this.runFull().catch((err: unknown) => this.o.log?.error({ err: String(err) }, "scheduled assessment run failed"));
    const poll = () => void this.pollReviews().catch((err: unknown) => this.o.log?.error({ err: String(err) }, "review poll failed"));
    setTimeout(full, 10_000); // first run shortly after start-up
    this.timers.push(setInterval(full, this.o.fullEveryMs), setInterval(poll, this.o.reviewPollMs));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async runFull(): Promise<number> {
    if (this.fullRunning) return 0;
    this.fullRunning = true;
    try {
      const idx = await this.locations.index();
      const rows = (await this.db.listCommunities({ activeOnly: true })).filter((c) => coords(c));
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < rows.length) {
          const c = rows[next++]!;
          await this.assessments.assess(c, idx).catch((err: unknown) => this.o.log?.error({ community: c.id, err: String(err) }, "assessment failed"));
          done++;
          if (this.o.spacingMs) await sleep(this.o.spacingMs);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, this.o.concurrency) }, worker));
      this.o.log?.info({ communities: rows.length, done }, "scheduled assessment run complete");
      return done;
    } finally {
      this.fullRunning = false;
    }
  }

  /** Reassesses communities with reports reviewed since the previous poll. Returns their ids. */
  async pollReviews(): Promise<string[]> {
    const since = this.lastReviewCheck;
    this.lastReviewCheck = this.o.now().toISOString();
    const reviewed = await this.db.listReports({ reviewedSince: since, statuses: ["VERIFIED", "REJECTED"], limit: 500 });
    const ids = [...new Set(reviewed.map((r) => r.community_id))];
    if (!ids.length) return [];
    const idx = await this.locations.index();
    const rows = await this.db.listCommunities({ ids, activeOnly: true });
    for (const c of rows) {
      if (!coords(c)) continue;
      await this.assessments.assess(c, idx).catch((err: unknown) => this.o.log?.error({ community: c.id, err: String(err) }, "reassessment failed"));
    }
    return rows.map((c) => c.id);
  }
}

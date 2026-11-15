// Entry point: `node --import tsx src/server.ts` (systemd unit floodguard-api).
import { join } from "node:path";
import { DEFAULT_VULTR_MODEL, explainAssessment } from "../../risk-engine/src/index.ts";
import { buildApp } from "./app.ts";
import { OpenMeteoBudget } from "./assessments/budget.ts";
import { ClimatologyService } from "./assessments/climatology.ts";
import { AssessmentService, type Explainer } from "./assessments/service.ts";
import { FileStore } from "./assessments/store.ts";
import { loadConfig } from "./config.ts";
import { SupabaseAuth, SupabaseDb, createSupabase } from "./db/repo.ts";
import { LocationService } from "./locations.ts";
import { Scheduler } from "./scheduler.ts";

/** One-line JSON logs for background jobs (journalctl -u floodguard-api). Never logs secrets. */
const log = {
  info: (o: object, msg?: string) => console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), msg, ...o })),
  warn: (o: object, msg?: string) => console.warn(JSON.stringify({ level: "warn", time: new Date().toISOString(), msg, ...o })),
  error: (o: object, msg?: string) => console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), msg, ...o })),
};

const cfg = loadConfig();
const sb = createSupabase(cfg.supabaseUrl, cfg.supabaseSecretKey);
const db = new SupabaseDb(sb, cfg.supabasePublishableKey ? { url: cfg.supabaseUrl, publishableKey: cfg.supabasePublishableKey } : null);
const store = new FileStore(join(cfg.cacheDir, "store"));
const budget = new OpenMeteoBudget(cfg.openMeteoDailyBudget, store);
const climatology = new ClimatologyService(store, budget, { apiKey: cfg.openMeteoApiKey });
const locations = new LocationService(db);

const vultrKey = cfg.vultrApiKey;
const explain: Explainer | null = vultrKey
  ? (a) => explainAssessment(a, { apiKey: vultrKey, model: cfg.vultrModel ?? DEFAULT_VULTR_MODEL })
  : null;

const assessments = new AssessmentService({
  db, store, climatology, budget, explain, openMeteoApiKey: cfg.openMeteoApiKey, log,
});

const app = await buildApp({ db, auth: new SupabaseAuth(sb), locations, assessments, corsOrigins: cfg.corsOrigins, logger: true });

const scheduler = cfg.enableScheduler ? new Scheduler(db, locations, assessments, { log }) : null;

await app.listen({ port: cfg.port, host: cfg.host });
log.info({ port: cfg.port, scheduler: !!scheduler, ai: !!explain, reports: !!cfg.supabasePublishableKey, cors: cfg.corsOrigins.length ? cfg.corsOrigins : "any" }, "FloodGuard API started");
scheduler?.start();

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  scheduler?.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

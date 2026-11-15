// Environment configuration. Secrets live in /etc/floodguard/backend.env on the server and are
// never logged. Missing optional values disable the feature that needs them; they never
// produce fabricated data.

export interface AppConfig {
  port: number;
  host: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  vultrApiKey: string | null;
  vultrModel: string | null;
  openMeteoApiKey: string | null;
  corsOrigins: string[];
  enableScheduler: boolean;
  cacheDir: string;
  /** Approximate Open-Meteo call weight we allow per UTC day (free tier is 10,000). */
  openMeteoDailyBudget: number;
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = blank(env.SUPABASE_URL);
  const supabaseSecretKey = blank(env.SUPABASE_SECRET_KEY);
  const missing = [!supabaseUrl && "SUPABASE_URL", !supabaseSecretKey && "SUPABASE_SECRET_KEY"].filter(Boolean);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return {
    port: Number(env.PORT ?? 8080),
    host: blank(env.HOST) ?? "127.0.0.1",
    supabaseUrl: supabaseUrl!,
    supabaseSecretKey: supabaseSecretKey!,
    vultrApiKey: blank(env.VULTR_INFERENCE_API_KEY),
    vultrModel: blank(env.VULTR_INFERENCE_MODEL),
    openMeteoApiKey: blank(env.OPEN_METEO_API_KEY),
    corsOrigins: (blank(env.CORS_ORIGINS) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    enableScheduler: (blank(env.ENABLE_SCHEDULER) ?? "true").toLowerCase() === "true",
    cacheDir: blank(env.CACHE_DIR) ?? "./cache",
    openMeteoDailyBudget: Number(env.OPEN_METEO_DAILY_BUDGET ?? 8000),
  };
}

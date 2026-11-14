// Fetch -> assess pipeline for one community. Shared by the demo script, the Supabase
// scheduled function and any Vercel API route. A provider failure becomes a missing input
// (lowering confidence), never a fabricated value.
import { assessCommunity } from "../engine/assess.ts";
import type { Community, Observation, RiskAssessment, UnverifiedSignal } from "../engine/types.ts";
import { fetchForecast, fetchRiverDischarge, toEngineInputs, type ForecastBundle, type OpenMeteoConfig } from "../providers/openMeteo.ts";
import { buildWeatherResponse, type WeatherResponse } from "../weather/summary.ts";

export interface PipelineResult {
  assessment: RiskAssessment;
  weather: WeatherResponse | null;
  forecast: ForecastBundle | null;
  errors: string[];
}

export async function runAssessment(
  community: Community,
  opts: {
    now?: string;
    observations?: Observation[];
    unverifiedSignals?: UnverifiedSignal[];
    openMeteo?: OpenMeteoConfig;
  } = {},
): Promise<PipelineResult> {
  const now = opts.now ?? new Date().toISOString();
  const errors: string[] = [];

  const [fc, rv] = await Promise.allSettled([
    fetchForecast(community.lat, community.lon, opts.openMeteo),
    community.riverPoint ? fetchRiverDischarge(community.riverPoint.lat, community.riverPoint.lon, opts.openMeteo) : Promise.resolve(null),
  ]);
  const forecast = fc.status === "fulfilled" ? fc.value : null;
  if (fc.status === "rejected") errors.push(`weather: ${String(fc.reason)}`);
  const riverDischarge = rv.status === "fulfilled" ? rv.value : null;
  if (rv.status === "rejected") errors.push(`river: ${String(rv.reason)}`);

  const weatherInputs = forecast ? toEngineInputs(forecast, now) : null;
  const assessment = assessCommunity({
    community,
    now,
    rainfallForecast: weatherInputs?.rainfallForecast ?? null,
    antecedent: weatherInputs?.antecedent ?? null,
    riverDischarge,
    riverGauge: null, // NIHSA has no live feed yet; gauge readings arrive as admin-entered observations
    observations: opts.observations ?? [],
    unverifiedSignals: opts.unverifiedSignals,
  });
  const weather = forecast ? buildWeatherResponse(community.id, forecast, now, community.climatology) : null;
  return { assessment, weather, forecast, errors };
}

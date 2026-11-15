// Runs the risk engine for a community, keeps the latest full result in the cache, records a
// row in risk_assessments, and serves results to the API. Guardrails:
// - only admin-verified reports (and community-specific official warnings) are evidence;
//   pending reports are passed as unverified signals that never change the score;
// - an expired or missing assessment is shown as unavailable, never as Low;
// - the AI explanation is requested only when severity or confidence level changes.
import {
  ASSESSMENT_VALIDITY_H,
  DISCLAIMER,
  assessCommunity,
  runAssessment,
  toFrontendRiskAssessment,
  type Community,
  type ExplanationResult,
  type FrontendRiskAssessment,
  type Observation,
  type PipelineResult,
  type RiskAssessment,
  type Severity,
  type UnverifiedSignal,
  type WeatherResponse,
} from "../../../risk-engine/src/index.ts";
import type { Db, RiskInsert } from "../db/repo.ts";
import type { AlertRow, CommunityRow, OptionalRiskColumn, ReportRow, RiskRow } from "../db/schema.ts";
import { coords, type LocationIndex } from "../locations.ts";
import { WEIGHTS, type OpenMeteoBudget } from "./budget.ts";
import type { ClimatologyService } from "./climatology.ts";
import type { JsonStore } from "./store.ts";

export interface CachedAssessment {
  assessment: RiskAssessment;
  weather: WeatherResponse | null;
  explanation: ExplanationResult | null;
  storedAt: string;
  errors: string[];
  pilotId: string | null;
}

export type Explainer = (a: RiskAssessment) => Promise<ExplanationResult>;
type Pipeline = (c: Community, o: Parameters<typeof runAssessment>[1]) => Promise<PipelineResult>;
type Log = { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void };

export interface AssessmentDeps {
  db: Db;
  store: JsonStore;
  climatology: ClimatologyService;
  budget: OpenMeteoBudget;
  explain: Explainer | null;
  openMeteoApiKey?: string | null;
  now?: () => Date;
  pipeline?: Pipeline;
  log?: Log;
  optionalRiskColumns?: () => Promise<OptionalRiskColumn[]>;
}

const SEVERITIES: Severity[] = ["low", "high", "severe", "critical"];
const EVIDENCE_WINDOW_H = 7 * 24;
const SIGNAL_WINDOW_H = 72;

/** Report category -> engine observation category and intensity (0-1). */
export const REPORT_EVIDENCE: Record<ReportRow["category"], { category: string; intensity: number }> = {
  flooded_road: { category: "flooding", intensity: 0.8 },
  overflowing_waterway: { category: "flooding", intensity: 0.8 },
  rising_water_level: { category: "rising_water", intensity: 0.7 },
  blocked_drainage: { category: "blocked_drain", intensity: 0.5 },
  damaged_drainage: { category: "blocked_drain", intensity: 0.4 },
  other: { category: "other", intensity: 0.3 },
};
const OFFICIAL_INTENSITY: Record<Severity, number> = { low: 0.3, high: 0.6, severe: 0.85, critical: 1 };

const silent: Log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

export function reportToObservation(r: ReportRow, at: { lat: number; lon: number }): Observation {
  const own = coords(r);
  const ev = REPORT_EVIDENCE[r.category] ?? REPORT_EVIDENCE.other;
  return {
    id: r.id,
    type: "verified_incident",
    category: ev.category,
    intensity: ev.intensity,
    lat: own?.lat ?? at.lat,
    lon: own?.lon ?? at.lon,
    insideCommunity: !own,
    observedAt: r.created_at,
    reporterId: r.reporter_id,
    source: "FloodGuard resident report, verified by an administrator",
  };
}

/** Only alerts explicitly typed as official warnings for this community count as evidence. */
export function alertToObservation(a: AlertRow, communityId: string, at: { lat: number; lon: number }): Observation | null {
  if ((a.alert_type ?? "").toLowerCase() !== "official_warning" || a.community_id !== communityId) return null;
  const sev = (a.severity ?? "").toLowerCase() as Severity;
  if (!SEVERITIES.includes(sev)) return null;
  return {
    id: a.id, type: "official_warning", category: "flooding", intensity: OFFICIAL_INTENSITY[sev],
    lat: at.lat, lon: at.lon, insideCommunity: true, observedAt: a.created_at, source: `Official warning: ${a.title}`, officialSeverity: sev,
  };
}

export function chooseExplanation(prev: CachedAssessment | null, a: RiskAssessment): "reuse" | "request" {
  if (!prev?.explanation) return "request";
  const same = prev.assessment.severity === a.severity && prev.assessment.confidence.level === a.confidence.level;
  return same ? "reuse" : "request";
}

export function isCurrent(c: CachedAssessment, now: Date): boolean {
  return Date.parse(c.assessment.validUntil) > now.getTime();
}

export class AssessmentService {
  private inflight = new Map<string, Promise<CachedAssessment | null>>();
  private readonly now: () => Date;
  private readonly log: Log;

  constructor(private readonly d: AssessmentDeps) {
    this.now = d.now ?? (() => new Date());
    this.log = d.log ?? silent;
  }

  cached(communityId: string) {
    return this.d.store.get<CachedAssessment>(`assessment-${communityId}`);
  }

  /** Runs a fresh assessment (deduplicated per community). Null if the community can't be assessed. */
  assess(row: CommunityRow, idx: LocationIndex): Promise<CachedAssessment | null> {
    const running = this.inflight.get(row.id);
    if (running) return running;
    const p = this.run(row, idx).finally(() => this.inflight.delete(row.id));
    this.inflight.set(row.id, p);
    return p;
  }

  private async run(row: CommunityRow, idx: LocationIndex): Promise<CachedAssessment | null> {
    const at = coords(row);
    if (!row.is_active || !at) return null;
    const now = this.now();
    const nowIso = now.toISOString();
    const lga = idx.lga(row.lga_id);
    const profile = await this.d.climatology.profile(at.lat, at.lon, row.community_type);
    const community: Community = {
      id: row.id, name: row.name, lga: lga?.name ?? "Unknown", state: lga?.stateName || "Unknown",
      lat: at.lat, lon: at.lon, mechanism: profile.mechanism, setting: profile.setting,
      riverPoint: profile.riverPoint, climatology: profile.climatology, susceptibility: null,
    };

    const [verified, pending, alerts] = await Promise.all([
      this.d.db.listReports({ statuses: ["verified"], communityId: row.id, createdSince: hoursAgo(now, EVIDENCE_WINDOW_H) }),
      this.d.db.listReports({ statuses: ["pending"], communityId: row.id, createdSince: hoursAgo(now, SIGNAL_WINDOW_H) }),
      this.d.db.listActiveAlerts(nowIso, row.id).catch(() => [] as AlertRow[]),
    ]);
    const observations: Observation[] = [
      ...verified.map((r) => reportToObservation(r, at)),
      ...alerts.map((a) => alertToObservation(a, row.id, at)).filter((o): o is Observation => o !== null),
    ];
    const unverifiedSignals: UnverifiedSignal[] = pending.map((r) => {
      const c = coords(r) ?? at;
      return { id: r.id, category: r.category, observedAt: r.created_at, lat: c.lat, lon: c.lon };
    });

    const weight = WEIGHTS.forecast + (community.riverPoint ? WEIGHTS.river : 0);
    let result: PipelineResult;
    if (await this.d.budget.take(weight)) {
      result = await (this.d.pipeline ?? runAssessment)(community, {
        now: nowIso, observations, unverifiedSignals, openMeteo: { apiKey: this.d.openMeteoApiKey ?? undefined },
      });
    } else {
      // Daily provider budget spent: assess with no weather inputs (insufficient data), never guess.
      const assessment = assessCommunity({
        community, now: nowIso, rainfallForecast: null, antecedent: null, riverDischarge: null, riverGauge: null, observations, unverifiedSignals,
      });
      result = { assessment, weather: null, forecast: null, errors: ["Open-Meteo daily budget reached; weather not fetched"] };
    }
    const a = result.assessment;
    if (result.errors.length) this.log.warn({ community: row.id, errors: result.errors }, "assessment inputs missing");

    const prev = await this.cached(row.id);
    let explanation: ExplanationResult | null = null;
    if (this.d.explain) {
      if (chooseExplanation(prev, a) === "reuse" && prev?.explanation) {
        explanation = prev.explanation.source === "llm" ? prev.explanation : { ...prev.explanation, text: a.summary };
      } else {
        explanation = await this.d.explain(a).catch((e: unknown) => ({ text: a.summary, source: "engine" as const, model: "unknown", error: String(e) }));
      }
    }

    const cached: CachedAssessment = { assessment: a, weather: result.weather, explanation, storedAt: nowIso, errors: result.errors, pilotId: profile.pilotId };
    await this.d.store.set(`assessment-${row.id}`, cached);
    await this.record(a, explanation).catch((e: unknown) => this.log.error({ community: row.id, err: String(e) }, "could not store risk_assessments row"));
    this.log.info({ community: row.id, severity: a.severity, score: a.riskScore, confidence: a.confidence.level, explanation: explanation?.source ?? "none" }, "assessed");
    return cached;
  }

  private async record(a: RiskAssessment, e: ExplanationResult | null) {
    const present = new Set(await (this.d.optionalRiskColumns?.() ?? Promise.resolve([])));
    const row: RiskInsert = {
      community_id: a.communityId,
      risk_level: a.severity,
      score: a.riskScore,
      confidence: a.confidence.level,
      explanation: e?.text ?? a.summary,
      explanation_source: e ? (e.source === "llm" ? "ai" : "deterministic_template") : "deterministic_template",
      assessed_at: a.assessedAt,
      data_freshness: a.dataFreshness,
      recommended_actions: a.recommendedActions,
    };
    const optional: Record<OptionalRiskColumn, unknown> = {
      summary: a.summary, status: a.status, valid_until: a.validUntil, next_review_at: a.nextReviewAt, factors: a.drivers,
      missing_inputs: a.confidence.missingInputs, inputs_json: a.evidence, method_version: a.methodVersion,
      confidence_score: a.confidence.score, provider: [...new Set(a.evidence.map((x) => x.source))].join("; ") || null,
    };
    for (const [k, v] of Object.entries(optional) as [OptionalRiskColumn, unknown][]) if (present.has(k)) row[k] = v;
    await this.d.db.insertRiskAssessment(row);
  }

  /**
   * The assessment to show for a community: a current cached result, else a fresh run if
   * allowed, else the latest database row (expired after the validity window).
   */
  async forCommunity(row: CommunityRow, idx: LocationIndex, opts: { allowRun: boolean }): Promise<{ cached: CachedAssessment | null; risk: FrontendRiskAssessment }> {
    const now = this.now();
    let cached = await this.cached(row.id);
    if ((!cached || !isCurrent(cached, now)) && opts.allowRun && coords(row) && row.is_active) {
      cached = (await this.assess(row, idx).catch((e: unknown) => {
        this.log.error({ community: row.id, err: String(e) }, "on-demand assessment failed");
        return null;
      })) ?? cached;
    }
    if (cached) return { cached, risk: toFrontendRiskAssessment(cached.assessment, cached.explanation, { now: now.toISOString() }) };
    if (!coords(row)) return { cached: null, risk: noCoordinatesRisk() };
    const dbRow = await this.d.db.latestRiskAssessment(row.id).catch(() => null);
    return { cached: null, risk: dbRow ? riskFromRow(dbRow, now) : unavailableRisk("No assessment has been made for this community yet.") };
  }
}

function baseRisk(): Omit<FrontendRiskAssessment, "status" | "summary" | "limitations" | "missingInputs"> {
  return {
    level: null, score: null, explanation: null, explanationStatus: "unavailable", factors: [], disclaimer: DISCLAIMER,
    confidence: null, assessedAt: null, isDemoData: false, confidenceLevel: "insufficient", validUntil: "", nextReviewAt: "", methodVersion: "",
  };
}

export function unavailableRisk(reason: string): FrontendRiskAssessment {
  return { ...baseRisk(), status: "unavailable", summary: reason, missingInputs: [], limitations: [reason] };
}

export function noCoordinatesRisk(): FrontendRiskAssessment {
  return {
    ...baseRisk(), status: "insufficient_data", summary: "This community has no verified location yet, so weather and risk cannot be assessed.",
    missingInputs: ["Community location"], limitations: ["A risk assessment needs the community's coordinates."],
  };
}

/** Fallback from a stored row (fewer details than the cache). Expired rows are never shown as a level. */
export function riskFromRow(r: RiskRow, now: Date): FrontendRiskAssessment {
  const validUntil = new Date(Date.parse(r.assessed_at) + ASSESSMENT_VALIDITY_H * 3_600_000).toISOString();
  if (Date.parse(validUntil) <= now.getTime()) {
    return { ...unavailableRisk("This assessment has expired and is not a current warning."), assessedAt: r.assessed_at, validUntil };
  }
  const level = SEVERITIES.includes(r.risk_level as Severity) ? (r.risk_level as Severity) : null;
  const confidenceLevel = (["high", "medium", "low", "insufficient"] as const).find((x) => x === r.confidence) ?? "insufficient";
  return {
    ...baseRisk(),
    status: level ? "available" : "insufficient_data",
    level,
    score: level && typeof r.score === "number" ? r.score : null,
    summary: r.explanation,
    explanation: r.explanation,
    explanationStatus: r.explanation_source === "ai" ? "ai" : r.explanation ? "deterministic_template" : "unavailable",
    missingInputs: [],
    limitations: ["Details of this assessment are not available; only the summary was stored."],
    assessedAt: r.assessed_at,
    confidenceLevel,
    validUntil,
  };
}

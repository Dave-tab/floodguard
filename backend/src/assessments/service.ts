// Runs the risk engine for a community, keeps the latest full result in the cache, records a
// row in risk_assessments, and serves results to the API. Guardrails:
// - evidence = admin-VERIFIED reports only; PENDING reports are passed as unverified signals
//   that never change the score. Alerts are not used: none of the live alert_type values
//   (FLOOD_WARNING, WEATHER_NOTICE, SAFETY_ADVISORY, COMMUNITY_NOTICE, OTHER) marks a notice as
//   an official government warning - an admin-written FLOOD_WARNING is the platform's own
//   output, so feeding it back would let the system confirm itself;
// - an expired or missing assessment is shown as unavailable, never as Low;
// - "severe" is never relabelled: if the database enum lacks SEVERE the row is not stored and
//   the cache stays the source of truth;
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
  type UnverifiedSignal,
  type WeatherResponse,
} from "../../../risk-engine/src/index.ts";
import { DbError, type Db } from "../db/repo.ts";
import type { CommunityRow, DbExplanationSource, ReportRow, RiskInsert, RiskRow } from "../db/schema.ts";
import { coords, type LocationIndex } from "../locations.ts";
import { CATEGORY_EVIDENCE, INPUT_LABELS, confidenceFromDb, confidenceToDb, severityFromDb, severityToDb } from "../mapping.ts";
import { WEIGHTS, type OpenMeteoBudget } from "./budget.ts";
import type { ClimatologyService } from "./climatology.ts";
import type { JsonStore } from "./store.ts";

export interface CachedAssessment {
  assessment: RiskAssessment;
  weather: WeatherResponse | null;
  explanation: ExplanationResult | null;
  explanationAt: string | null;
  storedAt: string;
  errors: string[];
  pilotId: string | null;
  /** Whether the row reached risk_assessments (false e.g. when SEVERE is not in the DB enum). */
  storedInDb: boolean;
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
}

const EVIDENCE_WINDOW_H = 7 * 24;
const SIGNAL_WINDOW_H = 72;
export const ENGINE_PROVIDER = "fg-risk-engine";

const silent: Log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

export function reportToObservation(r: ReportRow, at: { lat: number; lon: number }): Observation {
  const own = coords(r);
  const ev = CATEGORY_EVIDENCE[r.category] ?? CATEGORY_EVIDENCE.OTHER;
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

export function chooseExplanation(prev: CachedAssessment | null, a: RiskAssessment): "reuse" | "request" {
  if (!prev?.explanation) return "request";
  const same = prev.assessment.severity === a.severity && prev.assessment.confidence.level === a.confidence.level;
  return same ? "reuse" : "request";
}

export function isCurrent(c: CachedAssessment, now: Date): boolean {
  return Date.parse(c.assessment.validUntil) > now.getTime();
}

/** Row for risk_assessments, filling every NOT NULL column. */
export function toRiskRow(a: RiskAssessment, e: ExplanationResult | null, explanationAt: string | null, nowIso: string): RiskInsert {
  const available = a.severity !== null;
  const card = toFrontendRiskAssessment(a, e, { now: nowIso });
  const source: DbExplanationSource = !e ? (a.summary ? "FALLBACK" : "NONE") : e.source === "llm" ? "AI" : "FALLBACK";
  const used = [...new Set(a.evidence.map((x) => x.input))].filter((k) => !a.confidence.missingInputs.includes(k));
  return {
    community_id: a.communityId,
    risk_level: severityToDb(a.severity),
    score: available ? a.riskScore : null,
    confidence: confidenceToDb(a.confidence.level),
    explanation: e?.text ?? a.summary,
    explanation_source: source,
    explanation_provider: e?.source === "llm" ? e.model : ENGINE_PROVIDER,
    explanation_generated_at: explanationAt ?? a.assessedAt,
    recommended_actions: a.recommendedActions,
    data_available: available,
    limitations: card.limitations,
    inputs_used: used.map((k) => INPUT_LABELS[k]),
    inputs_missing: a.confidence.missingInputs.map((k) => INPUT_LABELS[k]),
    input_summary: {
      engineSeverity: a.severity,
      riskScore: a.riskScore,
      status: a.status,
      validUntil: a.validUntil,
      nextReviewAt: a.nextReviewAt,
      severityCappedBy: a.severityCappedBy,
      confidenceScore: a.confidence.score,
      signalsUnderReview: a.signalsUnderReview,
      drivers: a.drivers.map((d) => ({ factor: d.factor, value: d.value })),
      evidence: a.evidence.map((x) => ({ input: x.input, type: x.type, source: x.source, measured: x.measured, freshness: x.freshness, weight: x.weight })),
    },
    data_freshness: a.dataFreshness,
    methodology_version: a.methodVersion,
    assessed_at: a.assessedAt,
  };
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

    const [verified, pending] = await Promise.all([
      this.d.db.listReports({ statuses: ["VERIFIED"], communityId: row.id, createdSince: hoursAgo(now, EVIDENCE_WINDOW_H) }),
      this.d.db.listReports({ statuses: ["PENDING"], communityId: row.id, createdSince: hoursAgo(now, SIGNAL_WINDOW_H) }),
    ]);
    const observations = verified.map((r) => reportToObservation(r, at));
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
    let explanationAt: string | null = null;
    if (this.d.explain) {
      if (chooseExplanation(prev, a) === "reuse" && prev?.explanation) {
        explanation = prev.explanation.source === "llm" ? prev.explanation : { ...prev.explanation, text: a.summary };
        explanationAt = prev.explanation.source === "llm" ? prev.explanationAt : nowIso;
      } else {
        explanation = await this.d.explain(a).catch((e: unknown) => ({ text: a.summary, source: "engine" as const, model: "unknown", error: String(e) }));
        explanationAt = nowIso;
      }
    }

    const storedInDb = await this.record(a, explanation, explanationAt, nowIso);
    const cached: CachedAssessment = {
      assessment: a, weather: result.weather, explanation, explanationAt, storedAt: nowIso, errors: result.errors, pilotId: profile.pilotId, storedInDb,
    };
    await this.d.store.set(`assessment-${row.id}`, cached);
    this.log.info({ community: row.id, severity: a.severity, score: a.riskScore, confidence: a.confidence.level, explanation: explanation?.source ?? "none", storedInDb }, "assessed");
    return cached;
  }

  private async record(a: RiskAssessment, e: ExplanationResult | null, explanationAt: string | null, nowIso: string): Promise<boolean> {
    try {
      await this.d.db.insertRiskAssessment(toRiskRow(a, e, explanationAt, nowIso));
      return true;
    } catch (err) {
      if (err instanceof DbError && err.code === "22P02" && a.severity === "severe") {
        this.log.warn(
          { community: a.communityId },
          "risk_assessments.risk_level has no SEVERE value; this SEVERE assessment is kept in the API cache only and is NOT relabelled. See supabase/proposed_severe_level.sql",
        );
      } else {
        this.log.error({ community: a.communityId, err: String(err) }, "could not store risk_assessments row");
      }
      return false;
    }
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

/** Fallback from a stored row. Expired rows, MODERATE and UNAVAILABLE are never shown as a level. */
export function riskFromRow(r: RiskRow, now: Date): FrontendRiskAssessment {
  const summaryValid = (r.input_summary as { validUntil?: unknown } | null)?.validUntil;
  const validUntil = typeof summaryValid === "string" && !Number.isNaN(Date.parse(summaryValid))
    ? summaryValid
    : new Date(Date.parse(r.assessed_at) + ASSESSMENT_VALIDITY_H * 3_600_000).toISOString();
  if (Date.parse(validUntil) <= now.getTime()) {
    return { ...unavailableRisk("This assessment has expired and is not a current warning."), assessedAt: r.assessed_at, validUntil };
  }
  const { level, note } = severityFromDb(r.risk_level);
  const usable = level !== null && r.data_available !== false;
  return {
    ...baseRisk(),
    status: usable ? "available" : "insufficient_data",
    level: usable ? level : null,
    score: usable && typeof r.score === "number" ? r.score : usable && r.score != null ? Number(r.score) : null,
    summary: r.explanation,
    explanation: r.explanation,
    explanationStatus: r.explanation_source === "AI" ? "ai" : r.explanation ? "deterministic_template" : "unavailable",
    missingInputs: r.inputs_missing ?? [],
    limitations: [...(r.limitations ?? []), ...(note ? [note] : [])],
    assessedAt: r.assessed_at,
    confidenceLevel: confidenceFromDb(r.confidence),
    methodVersion: r.methodology_version ?? "",
    validUntil,
  };
}

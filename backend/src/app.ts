// HTTP API. Response shapes follow the frontend on main (src/types/resident.ts,
// src/features/location/types/location.types.ts, src/features/resident/hazardMapService.ts).
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { isCurrent, type AssessmentService } from "./assessments/service.ts";
import { CATEGORY_LABELS, SAFETY_GUIDELINES } from "./content.ts";
import { DbError, NO_USER_CLIENT, type AuthVerifier, type Db } from "./db/repo.ts";
import type { AlertRow, CommunityRow, DbReportStatus, PublicReportRow, ReportRow } from "./db/schema.ts";
import { coords, haversineKm, toLocationCommunity, toResidentCommunity, type LocationIndex, type LocationService } from "./locations.ts";
import {
  ALERT_SEVERITIES, ALERT_TYPES, CATEGORY_TO_DB, HAZARD_CATEGORIES, STATUS_TO_DB, alertSeverityFromDb, alertSeverityToDb, alertTypeFromDb,
  alertTypeToDb, categoryFromDb, isAdminRole, roleFromDb, statusFromDb,
} from "./mapping.ts";
import { toWeatherContext } from "./weather.ts";

export interface AppDeps {
  db: Db;
  auth: AuthVerifier;
  locations: LocationService;
  assessments: AssessmentService;
  corsOrigins?: string[];
  now?: () => Date;
  logger?: boolean;
  reportsPerHour?: number;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const uuid = z.string().uuid();

export const reportSchema = z
  .object({
    communityId: uuid,
    category: z.enum(HAZARD_CATEGORIES),
    description: z.string().trim().min(10, "Description must be at least 10 characters.").max(1000, "Description must be at most 1000 characters."),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
  })
  .strict()
  .refine((b) => (b.latitude == null) === (b.longitude == null), { message: "Provide both latitude and longitude, or neither." });

export const reviewSchema = z
  .object({ decision: z.enum(["verified", "rejected"]), reviewNote: z.string().trim().max(1000).optional().nullable() })
  .strict();

export const alertSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title must be at most 120 characters."),
    message: z.string().trim().min(10, "Message must be at least 10 characters.").max(1000, "Message must be at most 1000 characters."),
    severity: z.enum(ALERT_SEVERITIES),
    alertType: z.enum(ALERT_TYPES).default("community_notice"),
    communityId: uuid.optional().nullable(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .strict();

const ADMIN_STATUS_FILTER: Record<string, DbReportStatus> = {
  pending: "PENDING", verified: "VERIFIED", rejected: "REJECTED", in_progress: "IN_PROGRESS", resolved: "RESOLVED",
};

const adminReportQuery = z.object({
  status: z.enum(["pending", "verified", "rejected", "in_progress", "resolved"]).optional(),
  communityId: uuid.optional(),
});

const resolveSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional().nullable(),
});

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  const m = h ? /^Bearer\s+(.+)$/i.exec(h) : null;
  return m?.[1]?.trim() || null;
}

/** Rows from the database are only exposed through these mappers. */
export function hazardRecord(r: PublicReportRow, c: CommunityRow | undefined, idx: LocationIndex) {
  const lga = idx.lga(c?.lga_id);
  const at = coords(r) ?? (c ? coords(c) : null);
  const category = categoryFromDb(r.category);
  return {
    id: r.id,
    title: `${CATEGORY_LABELS[category]}${c ? ` in ${c.name}` : ""}`,
    category,
    dbCategory: r.category,
    description: r.description,
    communityId: r.community_id,
    communityName: c?.name ?? "Unknown community",
    state: lga?.stateName || "Unknown",
    lga: lga?.name ?? "Unknown",
    latitude: at?.lat ?? null,
    longitude: at?.lon ?? null,
    status: "verified" as const,
    reportedAt: r.created_at,
    verifiedAt: r.reviewed_at,
    verifiedByLabel: "FloodGuard administrator",
    isDemoData: false,
  };
}

function ownReport(r: ReportRow) {
  return {
    id: r.id, referenceCode: r.reference_code, communityId: r.community_id, category: categoryFromDb(r.category), dbCategory: r.category,
    description: r.description, latitude: r.latitude, longitude: r.longitude,
    // pending | verified | rejected, or the raw in_progress / resolved (not approved statuses; owner/admin only)
    status: statusFromDb(r.status), photoPath: r.photo_path, reviewNote: r.admin_note, reviewedAt: r.reviewed_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Admin view of a report. No contact details: the reporter is identified by id only. */
function adminReport(r: ReportRow, c: CommunityRow | undefined, idx: LocationIndex) {
  const lga = idx.lga(c?.lga_id);
  return {
    ...ownReport(r),
    adminNote: r.admin_note,
    reporterId: r.reporter_id,
    communityName: c?.name ?? "Unknown community",
    state: lga?.stateName || "Unknown",
    lga: lga?.name ?? "Unknown",
  };
}

function publicAlert(a: AlertRow, c: CommunityRow | undefined) {
  return {
    id: a.id, title: a.title, message: a.message, severity: alertSeverityFromDb(a.severity), alertType: alertTypeFromDb(a.alert_type),
    communityId: a.community_id, communityName: c?.name ?? null, issuedAt: a.created_at, expiresAt: a.expires_at,
    source: "FloodGuard administrator notice (not an official government warning)",
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db, auth, locations, assessments } = deps;
  const now = deps.now ?? (() => new Date());
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });

  await app.register(cors, {
    origin: deps.corsOrigins?.length ? deps.corsOrigins : true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ message: err.issues.map((i) => i.message).join(" ") });
    if (err instanceof HttpError) return reply.status(err.status).send({ message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ message: (err as Error).message });
    req.log.error({ err }, "request failed");
    return reply.status(500).send({ message: "Something went wrong. Please try again." });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ message: "Not found." }));

  const requireUser = async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Please sign in to continue.");
    const user = await auth.verify(token);
    if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.");
    return user;
  };
  const requireAdmin = async (req: FastifyRequest) => {
    const user = await requireUser(req);
    const role = await db.getProfileRole(user.id).catch(() => null);
    if (!isAdminRole(role)) throw new HttpError(403, "Administrator access is required.");
    return user;
  };
  const activeCommunity = async (id: string) => {
    const c = await db.getCommunity(id);
    if (!c || !c.is_active) throw new HttpError(404, "Community not found.");
    return c;
  };
  const communitiesById = async (ids: string[]) => {
    const unique = [...new Set(ids)];
    const rows = unique.length ? await db.listCommunities({ ids: unique }) : [];
    return new Map(rows.map((c) => [c.id, c]));
  };
  /** Latest assessment per community for admin views (cache, else stored row); never starts a new run. */
  const latestRisks = async (rows: CommunityRow[], idx: LocationIndex) =>
    Promise.all(rows.map(async (c) => {
      const { risk } = await assessments.forCommunity(c, idx, { allowRun: false });
      const lga = idx.lga(c.lga_id);
      return {
        communityId: c.id, communityName: c.name, state: lga?.stateName || "Unknown", lga: lga?.name ?? "Unknown",
        latitude: c.latitude, longitude: c.longitude,
        status: risk.status, level: risk.level, score: risk.score, confidenceLevel: risk.confidenceLevel,
        summary: risk.explanation ?? risk.summary, assessedAt: risk.assessedAt, validUntil: risk.validUntil || null,
        missingInputs: risk.missingInputs,
      };
    }));

  // Simple in-memory limit on report submissions per user.
  const limit = deps.reportsPerHour ?? 10;
  const submissions = new Map<string, number[]>();
  const allowSubmission = (userId: string) => {
    const t = now().getTime();
    const recent = (submissions.get(userId) ?? []).filter((x) => t - x < 3_600_000);
    if (recent.length >= limit) return false;
    recent.push(t);
    submissions.set(userId, recent);
    return true;
  };

  app.get("/health", async () => ({ status: "ok", time: now().toISOString() }));

  // ---- Signed-in user ----
  app.get("/me", async (req) => {
    const user = await requireUser(req);
    // A database trigger normally creates the profile at sign-up; this is only a fallback.
    await db.ensureProfile(user.id, user.fullName ?? null);
    const profile = await db.getProfile(user.id);
    return { data: { id: user.id, role: roleFromDb(profile?.role ?? null), fullName: profile?.full_name ?? user.fullName ?? null } };
  });

  // ---- Public alerts (FloodGuard notices, not official warnings) ----
  app.get<{ Querystring: { communityId?: string } }>("/alerts", async (req) => {
    const communityId = req.query.communityId?.trim() || undefined;
    if (communityId && !uuid.safeParse(communityId).success) return { data: [] };
    const rows = await db.listActiveAlerts({ at: now().toISOString(), communityId, limit: 200 });
    const byId = await communitiesById(rows.map((a) => a.community_id).filter((x): x is string => !!x));
    return { data: rows.map((a) => publicAlert(a, a.community_id ? byId.get(a.community_id) : undefined)) };
  });

  // ---- Locations ----
  app.get("/locations/states", async () => {
    const idx = await locations.index();
    return {
      data: idx.states.map((s) => ({ id: s.id, name: s.name, code: s.code, isDemoData: false })),
      coverage: "national",
      source: idx.source === "database" ? "FloodGuard database" : "Open Admin Data Nigeria (OCHA COD / INEC), CC BY 4.0",
    };
  });

  app.get<{ Params: { stateId: string } }>("/locations/states/:stateId/lgas", async (req) => {
    const idx = await locations.index();
    const st = idx.state(req.params.stateId);
    if (!st) throw new HttpError(404, "State not found.");
    return {
      data: idx.lgasOfState(st.id).map((l) => ({ id: l.id, name: l.name, stateId: st.id, stateName: st.name, isDemoData: false })),
      coverage: "national",
    };
  });

  app.get<{ Params: { lgaId: string } }>("/locations/lgas/:lgaId/communities", async (req) => {
    const idx = await locations.index();
    const lga = idx.lga(req.params.lgaId);
    if (!lga) throw new HttpError(404, "LGA not found.");
    // An LGA that is not in the database yet has no communities (communities.lga_id references lgas).
    const rows = lga.dbId ? await db.listCommunities({ activeOnly: true, lgaIds: [lga.dbId] }) : [];
    return { data: rows.map((c) => toLocationCommunity(c, idx)), coverage: "partial" };
  });

  app.get<{ Querystring: { search?: string; status?: string } }>("/locations/communities", async (req) => {
    const idx = await locations.index();
    const search = req.query.search?.trim();
    if (search !== undefined) {
      if (search.length < 2) return { data: [], coverage: "partial" };
      const rows = await db.listCommunities({ activeOnly: true, search: search.slice(0, 80), limit: 50 });
      return { data: rows.map((c) => toLocationCommunity(c, idx)), coverage: "partial" };
    }
    if (req.query.status && req.query.status !== "active") throw new HttpError(400, "Only active communities can be listed.");
    const rows = await db.listCommunities({ activeOnly: true });
    return { data: rows.map((c) => toResidentCommunity(c, idx)) };
  });

  app.get<{ Params: { id: string } }>("/locations/communities/:id", async (req) => {
    const c = await activeCommunity(req.params.id);
    return { data: toResidentCommunity(c, await locations.index()) };
  });

  app.post("/locations/resolve", async (req) => {
    const body = resolveSchema.parse(req.body);
    const idx = await locations.index();
    const point = { lat: body.latitude, lon: body.longitude };
    let best: { c: CommunityRow; km: number } | null = null;
    for (const c of await db.listCommunities({ activeOnly: true })) {
      const at = coords(c);
      if (!at) continue;
      const km = haversineKm(point, at);
      if (!best || km < best.km) best = { c, km };
    }
    const coordinates = { latitude: body.latitude, longitude: body.longitude, accuracyMeters: body.accuracyMeters ?? undefined };
    const imprecise = (body.accuracyMeters ?? 0) > 2000;
    if (!best || best.km > 10) {
      return { data: { matchStatus: "unmatched", location: { state: null, lga: null, community: null }, coordinates, isDemoData: false,
        message: "No FloodGuard community was found near this location. Please choose your State, LGA and community manually." } };
    }
    const matched = best.km <= 2 && !imprecise;
    const lc = toLocationCommunity(best.c, idx);
    const lga = idx.lga(best.c.lga_id);
    return {
      data: {
        matchStatus: matched ? "matched" : "partial",
        location: {
          state: lga ? { id: lga.stateId, name: lga.stateName, code: idx.state(lga.stateId)?.code ?? null, isDemoData: false } : null,
          lga: lga ? { id: lga.id, name: lga.name, stateId: lga.stateId, stateName: lga.stateName, isDemoData: false } : null,
          community: lc,
        },
        coordinates,
        message: matched
          ? `You appear to be near ${lc.name}. Please confirm this is your community.`
          : `The nearest FloodGuard community is ${lc.name}, about ${best.km.toFixed(1)} km away. Please confirm or choose another.`,
        isDemoData: false,
      },
    };
  });

  // ---- Community overview ----
  app.get<{ Params: { id: string } }>("/communities/:id/overview", async (req) => {
    const c = await activeCommunity(req.params.id);
    const idx = await locations.index();
    const [{ cached, risk }, hazards] = await Promise.all([
      assessments.forCommunity(c, idx, { allowRun: true }),
      db.listPublicReports({ communityId: c.id, limit: 50 }),
    ]);
    const weather = coords(c)
      ? toWeatherContext(cached?.weather ?? null, now().toISOString())
      : toWeatherContext(null, now().toISOString(), "This community has no verified location yet, so weather cannot be shown.");
    return {
      data: {
        community: toResidentCommunity(c, idx),
        weather,
        risk,
        verifiedHazards: hazards.map((h) => hazardRecord(h, c, idx)),
        safetyGuidelines: SAFETY_GUIDELINES,
        hotlines: [],
        isDemoData: false,
      },
    };
  });

  // ---- Public hazards (verified only) ----
  app.get<{ Querystring: { status?: string; communityId?: string } }>("/hazards", async (req) => {
    if (req.query.status && req.query.status !== "verified") throw new HttpError(403, "Only verified hazards are public.");
    const communityId = req.query.communityId?.trim() || undefined;
    if (communityId && !uuid.safeParse(communityId).success) return { data: [] };
    const rows = await db.listPublicReports({ communityId, limit: 500 });
    const visible = rows.filter((r) => r.status === "VERIFIED");
    const ids = [...new Set(visible.map((r) => r.community_id))];
    const communities = ids.length ? await db.listCommunities({ ids }) : [];
    const byId = new Map(communities.map((c) => [c.id, c]));
    const idx = await locations.index();
    return { data: visible.map((r) => hazardRecord(r, byId.get(r.community_id), idx)) };
  });

  // ---- Current risk assessments for the map ----
  app.get<{ Querystring: { status?: string; communityId?: string } }>("/risk-assessments", async (req) => {
    if (req.query.status && req.query.status !== "active") throw new HttpError(400, "Only active assessments are listed.");
    const idx = await locations.index();
    const communityId = req.query.communityId?.trim();
    const rows = communityId ? [await db.getCommunity(communityId)].filter((c): c is CommunityRow => !!c?.is_active) : await db.listCommunities({ activeOnly: true });
    const t = now();
    const out = [];
    for (const c of rows) {
      const at = coords(c);
      const cached = at ? await assessments.cached(c.id) : null;
      if (!at || !cached || !isCurrent(cached, t)) continue;
      const a = cached.assessment;
      if (!a.severity || (a.status !== "active" && a.status !== "updated")) continue;
      const lga = idx.lga(c.lga_id);
      out.push({
        id: `${c.id}:${a.assessedAt}`, communityId: c.id, communityName: c.name, state: lga?.stateName || "Unknown", lga: lga?.name ?? "Unknown",
        latitude: at.lat, longitude: at.lon, severity: a.severity, summary: cached.explanation?.text ?? a.summary,
        recommendedActions: a.recommendedActions, assessedAt: a.assessedAt, validUntil: a.validUntil, status: "active" as const,
        confidenceLevel: a.confidence.level, isDemoData: false,
      });
    }
    return { data: out };
  });

  // ---- Safety and platform ----
  app.get("/safety/guidelines", async () => ({ data: SAFETY_GUIDELINES }));
  app.get("/safety/hotlines", async () => ({ data: [] }));
  app.get("/platform/impact", async () => ({
    data: {
      isDemoData: false,
      activeCommunities: await db.countCommunities(true),
      activeVolunteers: null,
      verifiedWarnings: null,
      averageNoticeHours: null,
      uptimePct: null,
      retrievedAt: now().toISOString(),
    },
  }));

  // ---- Resident reports ----
  app.post("/reports", async (req, reply: FastifyReply) => {
    const user = await requireUser(req);
    const body = reportSchema.parse(req.body);
    await activeCommunity(body.communityId);
    if (!allowSubmission(user.id)) throw new HttpError(429, "You have submitted several reports recently. Please wait before sending another.");
    // hazard_reports.reporter_id references profiles. The sign-up trigger normally creates it; fallback only, role never written.
    await db.ensureProfile(user.id, user.fullName ?? null);
    const report = {
      community_id: body.communityId, category: CATEGORY_TO_DB[body.category], description: body.description,
      latitude: body.latitude ?? null, longitude: body.longitude ?? null,
    };
    // Inserted as the user: database triggers set reporter_id = auth.uid(), reference_code and status PENDING.
    try {
      const row = await db.insertReport(report, bearer(req)!);
      if (row.reporter_id !== user.id) req.log.warn({ report: row.id }, "inserted report has an unexpected reporter_id");
      return reply.status(201).send({ data: ownReport(row) });
    } catch (err) {
      if (err instanceof DbError && err.code === NO_USER_CLIENT) {
        req.log.error({ err }, "report submission is not configured");
        throw new HttpError(503, "Report submission is temporarily unavailable. Please try again later.");
      }
      if (err instanceof DbError && err.code === "42501") throw new HttpError(403, "Your account is not allowed to submit reports. Please sign in again.");
      throw err;
    }
  });

  app.get("/reports/mine", async (req) => {
    const user = await requireUser(req);
    return { data: (await db.listReports({ reporterId: user.id, limit: 200 })).map(ownReport) };
  });

  // ---- Admin ----
  app.get("/admin/summary", async (req) => {
    await requireAdmin(req);
    const idx = await locations.index();
    const active = await db.listCommunities({ activeOnly: true });
    const [risks, total, pending, verified, recent] = await Promise.all([
      latestRisks(active, idx), db.countReports(), db.countReports("PENDING"), db.countReports("VERIFIED"), db.listReports({ limit: 6 }),
    ]);
    const current = risks.filter((r) => r.status === "available");
    const byId = await communitiesById(recent.map((r) => r.community_id));
    return {
      data: {
        activeCommunities: active.length,
        elevatedAssessments: current.filter((r) => r.level === "high" || r.level === "severe" || r.level === "critical").length,
        totalReports: total,
        pendingReports: pending,
        verifiedReports: verified,
        recentReports: recent.map((r) => adminReport(r, byId.get(r.community_id), idx)),
        recentAssessments: risks
          .filter((r) => r.assessedAt)
          .sort((a, b) => (b.assessedAt ?? "").localeCompare(a.assessedAt ?? ""))
          .slice(0, 5),
      },
    };
  });

  app.get<{ Querystring: { status?: string; communityId?: string } }>("/admin/reports", async (req) => {
    await requireAdmin(req);
    const q = adminReportQuery.parse(req.query);
    const rows = await db.listReports({ statuses: q.status ? [ADMIN_STATUS_FILTER[q.status]!] : undefined, communityId: q.communityId, limit: 500 });
    const byId = await communitiesById(rows.map((r) => r.community_id));
    const idx = await locations.index();
    return { data: rows.map((r) => adminReport(r, byId.get(r.community_id), idx)) };
  });

  app.get("/admin/communities", async (req) => {
    await requireAdmin(req);
    const idx = await locations.index();
    return { data: await latestRisks(await db.listCommunities({ activeOnly: true }), idx) };
  });

  app.post("/admin/alerts", async (req, reply: FastifyReply) => {
    const admin = await requireAdmin(req);
    const body = alertSchema.parse(req.body);
    if (body.expiresAt && Date.parse(body.expiresAt) <= now().getTime()) throw new HttpError(400, "The expiry time must be in the future.");
    const community = body.communityId ? await activeCommunity(body.communityId) : undefined;
    const row = await db.insertAlert({
      title: body.title, message: body.message, severity: alertSeverityToDb(body.severity), alert_type: alertTypeToDb(body.alertType),
      community_id: body.communityId ?? null, expires_at: body.expiresAt ?? null, created_by: admin.id,
    });
    return reply.status(201).send({ data: publicAlert(row, community) });
  });

  app.post<{ Params: { id: string } }>("/admin/reports/:id/review", async (req) => {
    const admin = await requireAdmin(req);
    const body = reviewSchema.parse(req.body);
    const report = await db.getReport(req.params.id);
    if (!report) throw new HttpError(404, "Report not found.");
    if (report.status !== "PENDING") throw new HttpError(409, `This report is already ${statusFromDb(report.status).replace("_", " ")}.`);
    const newStatus = STATUS_TO_DB[body.decision] as "VERIFIED" | "REJECTED";
    const note = body.reviewNote ?? null;
    const updated = await db.reviewReport(report.id, { status: newStatus, reviewed_by: admin.id, reviewed_at: now().toISOString(), admin_note: note });
    if (!updated) throw new HttpError(409, "This report was reviewed by someone else. Refresh to see its status.");
    await db
      .insertReportHistory({ report_id: report.id, previous_status: "PENDING", new_status: newStatus, changed_by: admin.id, note })
      .catch((err: unknown) => req.log.error({ err, report: report.id }, "could not write report_status_history"));
    // Reassess the community straight away with the new evidence (does not block the response).
    const community = await db.getCommunity(updated.community_id);
    let reassessment: "started" | "skipped" = "skipped";
    if (community?.is_active && coords(community)) {
      reassessment = "started";
      const idx = await locations.index();
      void assessments.assess(community, idx).catch((err: unknown) => req.log.error({ err }, "reassessment after review failed"));
    }
    return { data: ownReport(updated), reassessment };
  });

  app.post<{ Params: { communityId: string } }>("/admin/assess/:communityId", async (req) => {
    await requireAdmin(req);
    const c = await activeCommunity(req.params.communityId);
    if (!coords(c)) throw new HttpError(422, "This community has no valid coordinates, so it cannot be assessed.");
    const idx = await locations.index();
    await assessments.assess(c, idx);
    const { risk } = await assessments.forCommunity(c, idx, { allowRun: false });
    return { data: risk };
  });

  return app;
}

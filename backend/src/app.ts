// HTTP API. Response shapes follow the frontend on main (src/types/resident.ts,
// src/features/location/types/location.types.ts, src/features/resident/hazardMapService.ts).
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { isCurrent, type AssessmentService } from "./assessments/service.ts";
import { CATEGORY_LABELS, SAFETY_GUIDELINES } from "./content.ts";
import type { AuthVerifier, Db } from "./db/repo.ts";
import { HAZARD_CATEGORIES, type CommunityRow, type PublicReportRow, type ReportRow } from "./db/schema.ts";
import { coords, haversineKm, toLocationCommunity, toResidentCommunity, type LocationIndex, type LocationService } from "./locations.ts";
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
  return {
    id: r.id,
    title: `${CATEGORY_LABELS[r.category] ?? "Hazard"}${c ? ` in ${c.name}` : ""}`,
    category: r.category,
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
    id: r.id, communityId: r.community_id, category: r.category, description: r.description, latitude: r.latitude, longitude: r.longitude,
    status: r.status, photoPath: r.photo_path, reviewNote: r.admin_note, reviewedAt: r.reviewed_at, createdAt: r.created_at, updatedAt: r.updated_at,
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
    if (role !== "admin") throw new HttpError(403, "Administrator access is required.");
    return user;
  };
  const activeCommunity = async (id: string) => {
    const c = await db.getCommunity(id);
    if (!c || !c.is_active) throw new HttpError(404, "Community not found.");
    return c;
  };

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

  // ---- Locations ----
  app.get("/locations/states", async () => {
    const idx = await locations.index();
    return {
      data: idx.states.map((s) => ({ id: s.extId, name: s.name, code: s.code, isDemoData: false })),
      coverage: "national",
      source: "Open Admin Data Nigeria (OCHA COD / INEC), CC BY 4.0",
    };
  });

  app.get<{ Params: { stateId: string } }>("/locations/states/:stateId/lgas", async (req) => {
    const idx = await locations.index();
    const st = idx.state(req.params.stateId);
    if (!st) throw new HttpError(404, "State not found.");
    return {
      data: idx.lgasOfState(st.extId).map((l) => ({ id: l.extId, name: l.name, stateId: st.extId, stateName: st.name, isDemoData: false })),
      coverage: "national",
    };
  });

  app.get<{ Params: { lgaId: string } }>("/locations/lgas/:lgaId/communities", async (req) => {
    const idx = await locations.index();
    const ids = idx.lgaIdCandidates(req.params.lgaId);
    if (!ids.length) throw new HttpError(404, "LGA not found.");
    const rows = await db.listCommunities({ activeOnly: true, lgaIds: ids });
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
          state: lga ? { id: lga.stateExtId, name: lga.stateName, code: idx.state(lga.stateExtId)?.code ?? null, isDemoData: false } : null,
          lga: lga ? { id: lga.extId, name: lga.name, stateId: lga.stateExtId, stateName: lga.stateName, isDemoData: false } : null,
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
    const visible = rows.filter((r) => r.status === "verified");
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
    const row = await db.insertReport({
      reporter_id: user.id, community_id: body.communityId, category: body.category, description: body.description,
      latitude: body.latitude ?? null, longitude: body.longitude ?? null,
    });
    return reply.status(201).send({ data: ownReport(row) });
  });

  app.get("/reports/mine", async (req) => {
    const user = await requireUser(req);
    return { data: (await db.listReports({ reporterId: user.id, limit: 200 })).map(ownReport) };
  });

  // ---- Admin ----
  app.post<{ Params: { id: string } }>("/admin/reports/:id/review", async (req) => {
    const admin = await requireAdmin(req);
    const body = reviewSchema.parse(req.body);
    const report = await db.getReport(req.params.id);
    if (!report) throw new HttpError(404, "Report not found.");
    if (report.status !== "pending") throw new HttpError(409, `This report has already been ${report.status}.`);
    const updated = await db.reviewReport(report.id, {
      status: body.decision, reviewed_by: admin.id, reviewed_at: now().toISOString(), admin_note: body.reviewNote ?? null,
    });
    if (!updated) throw new HttpError(409, "This report was reviewed by someone else. Refresh to see its status.");
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

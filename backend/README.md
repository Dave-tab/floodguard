# FloodGuard AI — API server

TypeScript API (Fastify) that runs on the Vultr server. It serves the endpoints the resident
frontend already calls (`VITE_API_BASE_URL`, `VITE_LOCATION_DATA_MODE=api`), runs the risk
engine in `../risk-engine` on a schedule, and handles report submission and admin review.
Supabase stays the database and sign-in provider. The admin dashboard keeps querying
Supabase directly; this server only adds trusted operations on top.

> Assessments are **preliminary**, not official warnings. Missing, stale or expired data is
> shown as *insufficient data* or *unavailable*, never as Low. Pending reports are never
> public and never change a score.

## Endpoints

All responses are JSON. Collections use `{ "data": [...] }`, and errors use `{ "message": "..." }`.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness |
| GET | `/locations/states` | public | 37 states + FCT (Open Admin Data Nigeria ids, e.g. `NG025`) |
| GET | `/locations/states/:stateId/lgas` | public | LGAs of a state (ids like `NG025012`) |
| GET | `/locations/lgas/:lgaId/communities` | public | `LocationCommunity[]` in the LGA. Accepts dataset or database LGA ids |
| GET | `/locations/communities?status=active` | public | Resident `Community[]` |
| GET | `/locations/communities?search=` | public | `LocationCommunity[]`, min 2 characters, max 50 results |
| GET | `/locations/communities/:id` | public | `Community`, 404 if missing or inactive |
| POST | `/locations/resolve` | public | `{latitude, longitude, accuracyMeters?}` → nearest community within 10 km (`matched` ≤ 2 km, otherwise `partial`/`unmatched`). Never guesses an LGA without a community match |
| GET | `/communities/:id/overview` | public | `CommunityOverviewData`. Assesses on demand if there is no current assessment |
| GET | `/hazards?status=verified&communityId=` | public | Verified reports only. Fits `VerifiedHazardSummary` and `MapHazard`. No reporter identity |
| GET | `/risk-assessments?status=active&communityId=` | public | Current (unexpired) assessments with a severity, for the map (`RiskApiRecord`) |
| GET | `/safety/guidelines` | public | The team's guidance text (same as the frontend) |
| GET | `/safety/hotlines` | public | Always `[]` until a verified, sourced list exists |
| GET | `/platform/impact` | public | Real counts where known, otherwise `null` |
| POST | `/reports` | signed in | `{communityId, category, description, latitude?, longitude?}`. Status is always `pending`; reporter comes from the token. 10 per user per hour |
| GET | `/reports/mine` | signed in | The caller's own reports and their review status |
| POST | `/admin/reports/:id/review` | admin | `{decision: "verified" \| "rejected", reviewNote?}`. Only from `pending`. Records reviewer and time, then reassesses the community |
| POST | `/admin/assess/:communityId` | admin | Run an assessment now |

**Authentication:** send the Supabase access token as `Authorization: Bearer <token>`
(`supabase.auth.getSession()` in the frontend). The server verifies it with Supabase. Admin
means `profiles.role = 'admin'`.

## How assessments run

- **Every 3 hours:** all active communities with valid coordinates, 2 at a time.
- **Every 5 minutes:** communities whose reports were reviewed since the last check. This
  covers reviews made in the admin dashboard, which writes to Supabase directly.
- **Evidence:** reports verified in the last 7 days, plus alerts with
  `alert_type = 'official_warning'` for that community. Reports pending in the last 72 hours
  count only as "signals under review".
- **AI explanation (Vultr Inference):** requested only when the severity or confidence level
  changes; otherwise the previous text is reused. If no key is set, the engine's own summary
  is used.
- **Storage:** the full engine output (drivers, evidence, validity window) is cached on disk
  in `CACHE_DIR`. A row with the core columns goes into `risk_assessments` on every run.
- **Local climatology:** what counts as heavy rain *for this place*.
  - Within 25 km of a pilot area (Ikorodu, Lekki/Ajah, Lokoja, Makurdi, Yenagoa), the pilot's
    hand-checked setup is reused, including its river reach.
  - Elsewhere, 10 years (2015–2024) of hourly ERA5 rainfall are fetched once per 0.25°
    grid cell (about 28 km) and cached. Open-Meteo counts this as about 261 calls, so a few
    cells are built per day within the free tier, keeping 2,500 calls/day for forecasts.
  - Until a cell is built, that community's rainfall is reported as insufficient data. No river
    reach is assigned outside the pilots, because each reach has to be checked by hand.
- **Open-Meteo budget:** the estimated usage is tracked per UTC day (`OPEN_METEO_DAILY_BUDGET`,
  default 8,000). When it's spent, assessments run without weather (insufficient data) rather
  than being blocked by the provider.

## Configuration

`/etc/floodguard/backend.env` on the server (readable only by root and the service):

| Variable | Required | Meaning |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_SECRET_KEY` | yes | Supabase **secret / service_role** key. Server only, never in the frontend or git |
| `PORT` | no | Default 8080 (Nginx proxies to it) |
| `VULTR_INFERENCE_API_KEY` | no | Enables AI explanations |
| `VULTR_INFERENCE_MODEL` | no | Default `deepseek-v4.1-flash-1017` |
| `OPEN_METEO_API_KEY` | no | Only for a commercial Open-Meteo plan |
| `OPEN_METEO_DAILY_BUDGET` | no | Default 8000 |
| `CORS_ORIGINS` | no | Comma list, e.g. `https://floodguard.vercel.app`. Empty = any origin |
| `ENABLE_SCHEDULER` | no | `true` (default) / `false` |
| `CACHE_DIR` | no | `/opt/floodguard/cache` on the server |

Frontend: `VITE_LOCATION_DATA_MODE=api` and `VITE_API_BASE_URL=https://<api host>`. A site
served over HTTPS (Vercel) can only call an HTTPS API, so the server needs a domain and
certificate before the deployed frontend can use it.

## Deploy

```bash
# once, as root on a fresh Ubuntu 22.04/24.04 server
bash deploy/setup.sh            # Node 22, Nginx, firewall, service user, systemd unit, env file
nano /etc/floodguard/backend.env   # fill in SUPABASE_URL and SUPABASE_SECRET_KEY (and Vultr key)
bash deploy/deploy.sh main      # clone/update, npm ci, restart, health check
```

Logs: `journalctl -u floodguard-api -f`.

## Develop

```bash
cd backend
npm install
npm test          # 37 tests, in-memory fakes, no network
npm run typecheck # also checks responses against the frontend's own types
```

## Schema assumptions and mismatches (please confirm)

The live tables were probed on 2026-11-15 with the publishable key. All were empty, and column
types weren't visible. Every name the server uses is in `src/db/schema.ts`.

- **`risk_assessments`** has no columns for validity window, factors, missing inputs,
  provider or method version. These are proposed in `supabase/proposed_additive_columns.sql`
  (additive, not applied). The server writes them automatically once they exist.
  - `risk_level` stores the approved `low | high | severe | critical` (lowercase), or `null`
    for insufficient data.
  - `confidence` stores the level as text.
  - `recommended_actions` is a string array, and `data_freshness` is JSON.
  - If any of these types differ, the insert fails and is logged, and the API keeps serving
    from its cache.
- **`profiles.role`** is assumed to hold `resident` / `admin`.
- **`states` / `lgas` / `communities` are empty.** States and LGAs are served from the bundled
  dataset either way. Communities must be added (with coordinates) before anything can be
  assessed. `communities.lga_id` may hold the dataset id (`NG025012`) or a database `lgas.id`;
  both are matched.
- **Admin dashboard on `main`:** it queries columns that don't exist in the live database:
  - `communities.community_name`, `state`, `lga` (live: `name`, `lga_id`)
  - `hazard_reports.hazard_category`, `submitted_at`, `image_url`, `admin_notes` (live:
    `category`, `created_at`, `photo_path`, `admin_note`)
  - `risk_assessments` ordered by `assessment_time` and read as `risk_score`,
    `rainfall_forecast`, … (live: `assessed_at`, `score`)
  - uppercase `LOW/MODERATE/HIGH/CRITICAL` (approved: lowercase
    `low/high/severe/critical`)

  This is for the dashboard owner to update; this branch doesn't change it.
- **Frontend `RiskLevel`** lacks `severe` (see `risk-engine/README.md`).
- **Not implemented here:**
  - photo upload (Supabase Storage policy not yet agreed);
  - a `resolved` status (not approved);
  - push/SMS notifications.

## Proposed decision (needs lead approval for `docs/DECISION_LOG.md`)

**DEC-PROPOSED: Custom TypeScript API on Vultr alongside Supabase.**

- **Context:** the hackathon requires Vultr. The frontend's API mode already expects a REST
  base URL, and the risk engine needs scheduled server-side runs, provider budgets and a
  secret AI key.
- **Options considered:** Supabase Edge Functions only (the current architecture doc), or
  this API on a Vultr instance.
- **Proposal:**
  - Supabase stays the database, auth and RLS boundary.
  - This server adds the public read API, report submission, admin review and the
    3-hourly assessments.
  - It uses the service-role key server-side only.
- **Consequences:**
  - There is one more service to run, with HTTPS needed for the deployed frontend.
  - RLS policies are still required, because the admin dashboard and auth use Supabase
    directly from the browser.

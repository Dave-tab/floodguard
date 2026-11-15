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
| GET | `/locations/states` | public | Database `states` rows when the table has data; until then the bundled dataset (37 states + FCT, ids like `NG025`). `source` says which |
| GET | `/locations/states/:stateId/lgas` | public | LGAs of a state, same source rule. Accepts a database uuid or a dataset id |
| GET | `/locations/lgas/:lgaId/communities` | public | Active communities in the LGA (`LocationCommunity[]`). Accepts the database uuid or the frontend's dataset id (`NG025012`), matched to `lgas.code` / `source_record_id`, then by name within the state |
| GET | `/locations/communities?status=active` | public | Resident `Community[]` |
| GET | `/locations/communities?search=` | public | `LocationCommunity[]`, min 2 characters, max 50 results |
| GET | `/locations/communities/:id` | public | `Community`, 404 if missing or inactive |
| POST | `/locations/resolve` | public | `{latitude, longitude, accuracyMeters?}` → nearest community within 10 km (`matched` ≤ 2 km, otherwise `partial`/`unmatched`). Never guesses an LGA without a community match |
| GET | `/communities/:id/overview` | public | `CommunityOverviewData`. Assesses on demand if there is no current assessment |
| GET | `/hazards?status=verified&communityId=` | public | `VERIFIED` reports only (never pending, rejected, in progress or resolved). Fits `VerifiedHazardSummary` and `MapHazard`, plus `dbCategory`. No reporter identity |
| GET | `/risk-assessments?status=active&communityId=` | public | Current (unexpired) assessments with a severity, for the map (`RiskApiRecord`) |
| GET | `/safety/guidelines` | public | The team's guidance text (same as the frontend) |
| GET | `/safety/hotlines` | public | Always `[]` until a verified, sourced list exists |
| GET | `/platform/impact` | public | Real counts where known, otherwise `null` |
| POST | `/reports` | signed in | `{communityId, category, description, latitude?, longitude?}` with one of the six approved categories. Stored as `PENDING` with a generated `reference_code` (`FG-YYMMDD-XXXXX`, returned as `referenceCode`); reporter comes from the token. 10 per user per hour |
| GET | `/reports/mine` | signed in | The caller's own reports. `status` is `pending`/`verified`/`rejected`, or the raw `in_progress`/`resolved` if someone set those in the database |
| POST | `/admin/reports/:id/review` | admin | `{decision: "verified" \| "rejected", reviewNote?}`. Only from `PENDING`. Sets `reviewed_by`, `reviewed_at`, `admin_note`, writes a `report_status_history` row, then reassesses the community |
| POST | `/admin/assess/:communityId` | admin | Run an assessment now |

**Authentication:** send the Supabase access token as `Authorization: Bearer <token>`
(`supabase.auth.getSession()` in the frontend). The server verifies it with Supabase. Admin
means `profiles.role = 'ADMIN'`.

## How assessments run

- **Every 3 hours:** all active communities with valid coordinates, 2 at a time.
- **Every 5 minutes:** communities whose reports were reviewed since the last check. This
  covers reviews made in the admin dashboard, which writes to Supabase directly.
- **Evidence:** only reports `VERIFIED` in the last 7 days. Reports `PENDING` in the last 72
  hours count only as "signals under review" and never change the score.
- **Alerts are not evidence.** None of the live `alert_type` values (`FLOOD_WARNING`,
  `WEATHER_NOTICE`, `SAFETY_ADVISORY`, `COMMUNITY_NOTICE`, `OTHER`) marks a notice as an official
  government warning. An admin-written `FLOOD_WARNING` is FloodGuard's own output, so feeding
  it back would let the system confirm itself.
- **AI explanation (Vultr Inference):** requested only when the severity or confidence level
  changes; otherwise the previous text is reused. If no key is set, the engine's own summary
  is used.
- **Storage:** the full engine output is cached on disk in `CACHE_DIR`. Every run also writes
  a `risk_assessments` row with all NOT NULL columns:
  - levels and confidence as the database enums;
  - plain-language `inputs_used`, `inputs_missing` and `limitations`;
  - an `input_summary` with `validUntil`, `nextReviewAt`, `status`, `severityCappedBy`, drivers
    and evidence;
  - `explanation_source` `AI`/`FALLBACK` and `explanation_provider` (the model id, or
    `fg-risk-engine`).
- **Severe assessments:** the `risk_level` enum has no `SEVERE`. These rows are refused, a
  warning is logged and the result stays in the cache only; it is never relabelled. Insufficient
  data is stored as `UNAVAILABLE` with `data_available = false` and no score.
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
npm test          # 51 tests, in-memory fakes with the live enums, no network
npm run typecheck # also checks responses against the frontend's own types
```

## Schema (confirmed from the live database on 2026-11-15)

Table and column names are in `src/db/schema.ts`. Every conversion between the API/frontend
contract values (lowercase, approved) and the database enums (UPPERCASE) is in
`src/mapping.ts`.

| Contract (API / frontend) | Database | Notes |
| --- | --- | --- |
| report status `pending` / `verified` / `rejected` | `PENDING` / `VERIFIED` / `REJECTED` | `IN_PROGRESS` and `RESOLVED` are not approved statuses. They're never public and can't be reviewed; the owner and admins see them raw (`in_progress`, `resolved`) |
| `flooded_road` | `FLOODED_ROAD` | |
| `rising_water_level` | `RISING_WATER` | |
| `blocked_drainage` | `BLOCKED_DRAINAGE` | |
| `damaged_drainage` | `DRAINAGE_DAMAGE` | |
| `other` | `OTHER` | `EROSION` is also read back as `other`, with `dbCategory: "EROSION"` |
| `overflowing_waterway` | `FLOODING` | **Contract mismatch**, see below |
| risk `low` / `high` / `critical` | `LOW` / `HIGH` / `CRITICAL` | |
| risk `severe` | none | **Mismatch**: not stored, never relabelled |
| no level (insufficient data) | `UNAVAILABLE`, `data_available = false`, `score = null` | |
| none | `MODERATE` | Not in the approved scale. A stored `MODERATE` row is shown with no level and a note, rather than guessing a mapping |
| confidence `low`/`medium`/`high`/`insufficient` | `LOW`/`MEDIUM`/`HIGH`/`INSUFFICIENT` | |
| admin | `profiles.role = 'ADMIN'` | |
| community `verified` / `under_review` / `unverified` | `VERIFIED` / `PENDING_REVIEW` / anything else | |

**Contract mismatches for the team to settle:**

- **Hazard categories.** The approved six (DEC-004) don't match the database enum:
  - `overflowing_waterway` has no database value and is stored as `FLOODING`;
  - `FLOODING` and `EROSION` have no contract value.

  The API keeps the raw value in `dbCategory`, so nothing is lost, but DEC-004 or the enum
  should be aligned.
- **Severity scale.** `risk_level` lacks `SEVERE` and has an extra `MODERATE`. The proposal in
  `supabase/proposed_severe_level.sql` (for the database owner, not applied) adds `SEVERE` and
  `valid_until` / `next_review_at` columns. Until then, validity is stored in `input_summary`.
- **Report status.** `IN_PROGRESS` and `RESOLVED` exist in the database without an approved
  transition (contracts §5.4).

**Other facts:**

- `hazard_reports.reference_code` is required and has no default; the API generates it and
  retries if it hits a duplicate.
- Reviews also write `report_status_history`. If that insert fails, the review still stands
  and the error is logged.
- `states`, `lgas` and `communities` were empty. Nothing can be assessed until active
  communities with coordinates exist (`communities.is_active` defaults to `false`).
- The bundled dataset's LGA ids are matched to `lgas.code` / `source_record_id`, then by name
  within the state.
- `profiles` has `full_name` (no `display_name`); the API doesn't read names.
- **Admin dashboard on `main`:** it queries columns that don't exist in the live database:
  - `communities.community_name`, `state`, `lga`;
  - `hazard_reports.hazard_category`, `submitted_at`, `image_url`, `admin_notes`;
  - `risk_assessments.assessment_time`, `risk_score`;
  - and it uses `LOW/MODERATE/HIGH/CRITICAL` filters.

  This is for the dashboard owner to update; this branch doesn't change it.
- **Frontend `RiskLevel`** lacks `severe` (see `risk-engine/README.md`).
- **Not implemented here:**
  - photo upload (Supabase Storage policy not yet agreed);
  - `resolved` transitions (not approved);
  - shelters (no verified data);
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

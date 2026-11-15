# FloodGuard AI - Backend Handoff (BE1: Core Backend & Data)

**Audience:** Frontend developer, BE2, and anyone integrating with the FloodGuard database.
**Source of truth:** [`database/migrations/0001_floodguard_supabase_schema.sql`](../database/migrations/0001_floodguard_supabase_schema.sql). That migration has already been executed in the development Supabase project and must not be edited casually.

Related documents: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | [API_INTEGRATION.md](API_INTEGRATION.md) | [TESTING_GUIDE.md](TESTING_GUIDE.md) | [TEST_DATA.md](TEST_DATA.md)

Legend used throughout: **Implemented** = present in the migration. **Proposed** = suggested, not built. **Needs confirmation** = cannot be determined from the migration.

---

## 1. Architecture overview

FloodGuard's backend is a Supabase project (Postgres + PostGIS, Supabase Auth, Supabase Storage). The migration is the only backend artefact in this repository.

```text
Frontend (Vite, @supabase/supabase-js)  --- publishable/anon key + user JWT --->  Supabase
                                                                                  |- Auth (auth.users)
                                                                                  |- PostgREST (tables + RPC), protected by RLS
                                                                                  |- Storage (private bucket report-images)
BE2 trusted server / Edge Function (not in this repo) --- service-role key --->  risk_assessments inserts
```

- **Implemented:** schema, enums, triggers, one admin RPC (`review_hazard_report`), RLS policies, column-level grants, private Storage bucket and policies.
- **Not in this repository:** frontend code, Edge Functions, a server application, scheduled jobs, risk scoring, AI explanation generation, notifications, data import scripts.
- There are **no custom REST routes**. The frontend talks to Supabase directly; Supabase's auto-generated REST endpoints (`/rest/v1/<table>`, `/rest/v1/rpc/<function>`) expose only what RLS and grants allow.

### Responsibilities

| Area | Owner (per migration header) | State |
|---|---|---|
| Schema, RLS, Storage, report lifecycle | BE1 | Implemented |
| Risk calculation and writing `risk_assessments` | BE2 (calculation); BE1 (persistence schema) | Schema implemented; writer **not implemented** |
| Frontend integration | Frontend developer | See [API_INTEGRATION.md](API_INTEGRATION.md) |

---

## 2. Authentication and roles

- **Provider:** Supabase Auth. The migration does not configure providers; its checklist says to "Enable/configure the required Supabase Auth provider". Which provider(s) and whether email confirmation is required **Needs confirmation**.
- **Roles:** enum `app_role` = `RESIDENT`, `ADMIN`, stored in `public.profiles.role`.
- **Profile creation:** Trigger `on_auth_user_created_floodguard` runs after each insert into `auth.users` and calls `handle_new_auth_user()`, which inserts a `profiles` row with `id = auth.users.id`, `full_name` from the sign-up metadata key `full_name` (if present), and `role = 'RESIDENT'`. The role is hard-coded in the function, so sign-up metadata cannot grant `ADMIN`.
- **Role checks in SQL:** `public.is_admin()` looks up the caller's profile (`auth.uid()`) and returns true for `ADMIN`.

### Secure admin provisioning

There is no public admin registration (**Implemented** by omission). Provision admins like this:
1. The person signs up normally (becomes `RESIDENT`).
2. A trusted operator promotes them in the Supabase SQL Editor (runs with elevated database privileges):
   ```sql
   update public.profiles
   set role = 'ADMIN'
   where id = '<AUTH_USER_UUID>';
   ```
   (This statement is taken from the migration's own comments.)
3. The user signs in again so their session reflects the change (the role is read from the database by `is_admin()`, not from the JWT, so it takes effect on the next query; refreshing the UI state is still recommended).

### Why users must not change their own role

If a resident could set `role = 'ADMIN'`, they would gain access to every report, the status history, and the review RPC. The migration prevents this with **column-level privileges**: `UPDATE` on `profiles` is revoked from `anon` and `authenticated`, then re-granted only for `full_name` and `preferred_community_id`. Even admins cannot change `role` through the API. Do not add `role` to that grant.

---

## 3. Access control

Row Level Security (RLS) is enabled on all 14 application tables and is the database-level enforcement mechanism. **Do not weaken, disable or bypass RLS to make frontend integration easier.** If a screen needs data RLS does not allow, raise it with BE1 for a purpose-built view or RPC rather than loosening a policy. Never put the Supabase service-role key in frontend code.

### Anonymous users
- May use landing, login and onboarding screens (these are frontend routes and need no data).
- **Implemented:** no table has an `anon` policy, and the migration grants `anon` no table privileges. Anonymous users therefore receive no community data, risk assessments, reports, alerts or shelters. Whether a blocked anonymous query returns an empty array or a permission error depends on Supabase default privileges - **Needs confirmation** (test T02 in the [testing guide](TESTING_GUIDE.md)).

### Authenticated residents
- Read active communities, geography (states/LGAs/wards), risk assessments for active communities, active (non-expired) alerts, and verified active shelters.
- Create hazard reports in **active** communities (always as `PENDING`, always as themselves).
- Read their own reports in any status, plus other residents' reports that are `VERIFIED`, `IN_PROGRESS` or `RESOLVED` in active communities.
- Cannot read another resident's `PENDING` or `REJECTED` reports.
- Can update only their own `profiles.full_name` / `preferred_community_id`, and `hazard_reports.photo_path` on their own `PENDING` report.
- Cannot read `report_status_history`, cannot call `review_hazard_report` (the RPC raises `Admin permission required`, SQLSTATE `42501`).

### Administrators
- Read all reports (any status, any community), all profiles, all communities (including inactive), all risk assessments, all alerts (including expired), and `report_status_history`.
- Review reports through `review_hazard_report`.
- Policies of type `FOR ALL` exist for admins on `communities`, `community_aliases`, `community_sources`, `community_verifications`, `alerts` and `shelters`. These policies are **implemented**; whether the client can actually perform the writes also depends on table privileges not granted in the migration - **Needs confirmation** (see [Known gaps](#known-backend-gaps)).

### Privacy observation (Needs product decision)
Verified/in-progress/resolved reports are readable by every authenticated user as **whole rows**, including `reporter_id`, `admin_note`, `photo_path`, `latitude`, `longitude` and `reviewed_by`. Postgres RLS cannot hide individual columns. If this is not desired, a **proposed** fix is a restricted view or RPC returning only public-safe columns - not implemented.

---

## 4. Hazard report lifecycle

Statuses (enum `hazard_report_status`): `PENDING`, `VERIFIED`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`.

### Creation
A resident inserts into `hazard_reports`. A BEFORE INSERT trigger forces `reporter_id = auth.uid()`, `status = 'PENDING'`, clears `reviewed_by`, `reviewed_at`, `admin_note`, generates `reference_code` (`FG-` + 10 hex characters), and builds the PostGIS `location` from `latitude`/`longitude`. The RLS insert policy additionally requires the community to be active.

### Review (only path for changing status)
Admins call `review_hazard_report(p_report_id, p_new_status, p_admin_note)`. It locks the row, checks the transition, validates the rejection reason, updates `status`, `admin_note`, `reviewed_by = auth.uid()`, `reviewed_at = now()`, and returns the updated report row.

### Allowed transitions (from the RPC)

| Current status | Allowed new status |
|---|---|
| `PENDING` | `VERIFIED`, `REJECTED` |
| `VERIFIED` | `VERIFIED` (re-save note), `IN_PROGRESS`, `RESOLVED` |
| `IN_PROGRESS` | `RESOLVED` |
| `RESOLVED` | none (terminal) |
| `REJECTED` | none (terminal) |

Any other transition raises `Invalid report status transition: <old> -> <new>` (SQLSTATE `22023`). Other errors: `Admin permission required` (`42501`), `Report not found` (`P0002`).

### Rejection reason
When `p_new_status = 'REJECTED'`, `p_admin_note` must be non-blank (`22023`: `A rejection reason is required`). The note is trimmed; an empty string becomes NULL. For any status, the saved `admin_note` is exactly the note passed in (a NULL/blank note on a later review clears the previous note).

### Audit history
Trigger `trg_audit_hazard_report_status` inserts a `report_status_history` row (`previous_status`, `new_status`, `changed_by`, `note`) whenever `status` changes. Caveats from the SQL:
- No history row is written when a report is first created.
- A `VERIFIED -> VERIFIED` review changes `admin_note`/`reviewed_*` but writes **no** history row, because `status` did not change.
- Only admins can read the history.

---

## 5. Image uploads

- **Bucket:** `report-images`, **private** (`public = false`).
- **Max size:** 5 MB (`5242880` bytes). **MIME types:** `image/jpeg`, `image/png`, `image/webp`.
- **Required object path:** `<user_uuid>/<hazard_report_uuid>/<filename>`

### Correct sequence
1. An authenticated resident inserts the report; the response includes the report `id` (UUID) and `reference_code`.
2. The resident uploads the file to `report-images/<their auth uid>/<report id>/<filename>`. The Storage INSERT policy checks that the first folder equals the caller's `auth.uid()` **and** the second folder is a report they own.
3. The resident sets `hazard_reports.photo_path` to the uploaded object path on that report. This succeeds only while the report is `PENDING` and owned by the caller; only the `photo_path` column is writable.
4. Reading: the owner (first folder = own uid) and admins can read/sign URLs; the owner and admins can delete.

### Constraints to be aware of
- **No Storage UPDATE policy:** upserts/overwrites are rejected. Use a unique filename per upload and `upsert: false`.
- **Race:** if an admin verifies/rejects the report before the resident attaches the path, the attach step will match zero rows (see [API_INTEGRATION.md](API_INTEGRATION.md#8-attach-the-image-path)).
- `photo_path` is not validated by the database. The Storage policies still prevent reading someone else's objects, but a bad path can be stored. Frontend should always build the path itself.
- Other residents cannot view photos of verified reports (read access is owner/admin only). A resident-facing photo for community reports would need a **proposed** change (for example server-signed URLs); **not implemented**.
- Do not change the Storage policies just to make uploads work; fix the path or the sequence instead.

---

## 6. Risk assessments

Table `risk_assessments` stores an append-only history per community.

- **Key fields:** `community_id`, `risk_level` (`LOW`/`MODERATE`/`HIGH`/`CRITICAL`/`UNAVAILABLE`), `score numeric(5,2)` (0-100), `confidence` (`HIGH`/`MEDIUM`/`LOW`/`INSUFFICIENT`), `explanation`, `recommended_actions[]`, `data_available`, `limitations[]`, `inputs_used[]`, `inputs_missing[]`, `input_summary jsonb`, `data_freshness jsonb`, `methodology_version`, `explanation_source` (`AI`/`FALLBACK`/`NONE`), `explanation_provider`, `explanation_generated_at`, `assessed_at`.
- **Rules enforced by constraints:** `UNAVAILABLE` requires a NULL score; any other level requires a score.
- **Read access:** authenticated users see rows for active communities; admins see all.
- **Write access:** no client policy or grant. Rows must be inserted by a trusted server-side service, Edge Function, or a narrowly scoped RPC (none exists yet) using credentials that bypass RLS. Append-only is enforced by the absence of update/delete policies and grants, not by a trigger; a service-role key could still alter rows, so BE2 must only insert.
- **Latest assessment per community:** order by `assessed_at desc`, take one (example in [API_INTEGRATION.md](API_INTEGRATION.md#11-read-risk-assessments)).
- **Not implemented:** any scoring formula, scheduler, data ingestion, or AI explanation generation. This handoff does not define one. Frontend must handle `UNAVAILABLE` / `INSUFFICIENT` states and the case of no rows at all.
- **Needs confirmation (BE2):** the agreed JSON shape for `input_summary` and `data_freshness`, and the write mechanism (Edge Function vs. RPC).

---

## 7. Alerts

Table `alerts`: `title`, `message`, `severity` (`INFO`/`LOW`/`MODERATE`/`HIGH`/`CRITICAL`), `alert_type` (`FLOOD_WARNING`/`WEATHER_NOTICE`/`SAFETY_ADVISORY`/`COMMUNITY_NOTICE`/`OTHER`), `community_id` (nullable), `created_by` (required profile id), `expires_at`, timestamps.

| Function | Who | Implementation |
|---|---|---|
| **Viewing** | Any authenticated user | RLS: not expired and (no community, or community active). Implemented. |
| **Creating/managing** | Admins | `FOR ALL` policy with `is_admin()`. Implemented as policy only; there is no RPC, and the client-side write path **Needs confirmation** because only `SELECT` is explicitly granted. |

Notes: alerts are not filtered to the resident's preferred community by the database; filter in the frontend if desired. Alerts are not push notifications - delivery beyond reading the table is **not implemented**. `created_by` is not set automatically and is not forced to equal the caller.

---

## 8. Geography

Hierarchy (all **Implemented** as tables):

```text
states -> lgas -> wards            (administrative boundaries)
lgas   -> communities              (required)
wards  -> communities              (optional; ward_id may be NULL)
communities -> community_aliases, community_sources, community_verifications
geographic_sources                 (dataset registry referenced by all of the above)
```

- **A ward is not a community.** Wards are administrative/electoral units; communities are settlements or neighbourhoods people recognise (for example Bodija). A community's `ward_id` is nullable because source data may not reliably assign one. A composite foreign key `(ward_id, lga_id) -> wards(id, lga_id)` guarantees a community's ward belongs to the community's own LGA.
- **Nationwide records may be imported** into states/LGAs/wards/communities. Only configured and verified pilot communities should be active: communities default to `is_active = false`, and residents can only read active ones.
- **Verification:** `communities.verification_status` (`UNVERIFIED`/`PENDING_REVIEW`/`VERIFIED`/`REJECTED`) plus a history table `community_verifications`. The database does **not** enforce "active implies verified" and no trigger syncs the history table to `communities.verification_status`; follow the import checklist in the migration.
- **Aliases and sources:** `community_aliases` (alternative names), `community_sources` (per-community provenance linking to `geographic_sources`).
- **Do not claim nationwide live flood monitoring.** The schema can store nationwide geography, but nothing in this repository monitors floods anywhere.
- **Not implemented:** import scripts, and point-in-polygon matching of coordinates to states/LGAs (mentioned in the migration checklist; no function exists).

---

## 9. Implementation status

| Capability | Status |
|---|---|
| Schema, enums, FKs, indexes, triggers | Implemented |
| Auth-to-profile trigger; default `RESIDENT` role | Implemented |
| Role protected from client edits (column grants) | Implemented |
| RLS on all 14 tables | Implemented |
| Report submission with enforced `PENDING`/ownership | Implemented |
| `review_hazard_report` RPC, transition rules, rejection reason | Implemented |
| Status history trigger | Implemented (see caveats in section 4) |
| Private `report-images` bucket + policies | Implemented |
| Alerts table and read policy | Implemented |
| Alert creation UI/RPC | Not implemented (policy only) |
| Risk assessment table and read policy | Implemented |
| Risk calculation / writer / AI explanation | **Not implemented** (BE2; proposed) |
| Shelters table | Schema only (P2/optional, no data) |
| Edge Functions, custom API routes, notifications, realtime | Not implemented / **Needs confirmation** for realtime |
| Data import scripts, point-in-polygon matching | Not implemented |

## Known backend gaps

1. **Admin write privileges:** `FOR ALL` admin policies exist for communities, aliases, sources, verifications, alerts and shelters, but the migration grants only `SELECT`. Confirm how admin writes are meant to happen (direct client, RPC, or SQL/service role).
2. **`photo_path` not validated** (arbitrary text; no ownership/existence check).
3. **Public verified-report rows expose all columns** (including `reporter_id`, `admin_note`, coordinates).
4. **Verified-report photos are not viewable by other residents** (Storage read is owner/admin only).
5. **`VERIFIED -> VERIFIED` re-reviews are not audited**; no history row on creation.
6. **No enforcement of "active community must be VERIFIED"**, and no sync between `community_verifications` and `communities.verification_status`.
7. **`alerts.created_by`** must be supplied and is not forced to the caller.
8. **Risk writer missing** (no RPC/Edge Function); JSON shapes undefined.
9. **Resident community verified feed** is not scoped by preferred community in the database.
10. **Community/community_verifications privacy:** residents can read `reviewed_by`, notes and evidence URLs for active communities.
11. **Migration re-runnability untested:** many statements use `if not exists`/`drop ... if exists`, but re-running against a populated database has not been verified.
12. **Minor:** a stale comment in the SQL ("Remove the manual history insert in the RPC...") refers to code that is not present; harmless, left unchanged on purpose.

## Needs confirmation (checklist)

- Which Auth providers are enabled; whether email confirmation is required.
- Anonymous behaviour on blocked tables (empty array vs. permission error).
- Default table privileges on the Supabase project (affects admin writes and anonymous responses).
- Whether Bodija is currently `is_active = true` and `verification_status = 'VERIFIED'`.
- Whether Realtime is enabled for any table.
- BE2's write mechanism and JSON shape for risk assessments.
- Resident B's correct UUID (see [TEST_DATA.md](TEST_DATA.md)).

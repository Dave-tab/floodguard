# FloodGuard AI - Database Schema Reference

Source of truth: [`database/migrations/0001_floodguard_supabase_schema.sql`](../database/migrations/0001_floodguard_supabase_schema.sql) (header: "Version: 001").

This document describes only what that migration creates. Anything not in the migration is marked **Needs confirmation** or listed as not implemented. Migration section numbers (0-9) refer to the comment headings in the SQL file.

> **Important - table privileges.** The migration explicitly `GRANT`s only the privileges listed in section 7 of the SQL (mostly `SELECT`, plus `INSERT` on `hazard_reports` and column-level `UPDATE`). Supabase projects may also apply default privileges to new tables in `public`; those are not visible in the migration. Where a policy allows a write (for example admin `FOR ALL` policies) but no explicit grant exists, whether the Supabase client can perform that write **Needs confirmation** (see [Known gaps](BACKEND_HANDOFF.md#known-backend-gaps)).

## Contents

1. [Extensions](#1-extensions)
2. [Enums](#2-enums)
3. [Entity relationship overview](#3-entity-relationship-overview)
4. [Tables](#4-tables) (14)
5. [Functions and RPCs](#5-functions-and-rpcs)
6. [Triggers](#6-triggers)
7. [Indexes](#7-indexes)
8. [Grants](#8-grants)
9. [Storage](#9-storage-bucket-and-policies)
10. [Access matrix](#10-access-matrix-summary)

---

## 1. Extensions

| Extension | Notes |
|---|---|
| `pgcrypto` | Used by `generate_hazard_reference_code()` (`gen_random_bytes`). |
| `postgis` (schema `extensions`) | `geometry` / `geography` columns and `ST_*` functions. |

## 2. Enums

| Enum | Values |
|---|---|
| `app_role` | `RESIDENT`, `ADMIN` |
| `community_verification_status` | `UNVERIFIED`, `PENDING_REVIEW`, `VERIFIED`, `REJECTED` |
| `hazard_report_status` | `PENDING`, `VERIFIED`, `IN_PROGRESS`, `RESOLVED`, `REJECTED` |
| `hazard_category` | `FLOODING`, `RISING_WATER`, `BLOCKED_DRAINAGE`, `FLOODED_ROAD`, `DRAINAGE_DAMAGE`, `EROSION`, `OTHER` |
| `risk_level` | `LOW`, `MODERATE`, `HIGH`, `CRITICAL`, `UNAVAILABLE` |
| `risk_confidence` | `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT` |
| `alert_severity` | `INFO`, `LOW`, `MODERATE`, `HIGH`, `CRITICAL` |
| `alert_type` | `FLOOD_WARNING`, `WEATHER_NOTICE`, `SAFETY_ADVISORY`, `COMMUNITY_NOTICE`, `OTHER` |
| `explanation_source` | `AI`, `FALLBACK`, `NONE` |

## 3. Entity relationship overview

```text
geographic_sources 1---* states 1---* lgas 1---* wards
                          (state_id)   (lga_id)
lgas 1---* communities   (communities.lga_id, required)
wards 1---* communities  (communities.ward_id, OPTIONAL; composite FK (ward_id, lga_id) -> wards(id, lga_id))

communities 1---* community_aliases
communities 1---* community_sources   *---1 geographic_sources
communities 1---* community_verifications
communities 1---* hazard_reports 1---* report_status_history
communities 1---* risk_assessments
communities 0..1---* alerts      (community_id NULL = not community-specific)
communities 0..1---* shelters

auth.users 1---1 profiles
profiles 1---* hazard_reports (reporter_id), alerts (created_by)
profiles 0..1---* hazard_reports (reviewed_by), report_status_history (changed_by)
communities 0..1---* profiles (preferred_community_id)
```

---

## 4. Tables

### 4.1 `geographic_sources`
- **Purpose:** Registry of datasets that geographic records were imported from (publisher, version, licence, attribution).
- **Primary key:** `id uuid` (default `gen_random_uuid()`).
- **Important columns:** `name` (not null), `publisher`, `dataset_name` (not null), `dataset_version`, `source_url`, `license_name`, `license_url`, `attribution_text`, `accessed_at`, `published_at` (date), `last_updated_at`, `notes`, `created_at`.
- **Foreign keys:** none.
- **Constraints:** `UNIQUE (name, dataset_name, dataset_version)` - because `dataset_version` is nullable, rows with a NULL version are not deduplicated by this constraint.
- **RLS/access:** RLS enabled. Authenticated users can `SELECT` all rows. No insert/update/delete policy -> imports run through the SQL editor / trusted server credentials.
- **Used by:** Data provenance and attribution (import process; optional attribution display).

### 4.2 `states`
- **Purpose:** First administrative level.
- **Primary key:** `id`.
- **Important columns:** `name`, `code`, `country_code char(2)` default `'NG'`, `source_id`, `source_record_id`, `boundary geometry(MultiPolygon, 4326)`, `is_active` (default `true`), `created_at`, `updated_at`.
- **Foreign keys:** `source_id -> geographic_sources(id)` ON DELETE SET NULL.
- **Constraints:** `UNIQUE (country_code, name)`; `UNIQUE (source_id, source_record_id)`; unique index on `(country_code, upper(code))` where `code is not null`.
- **RLS/access:** Authenticated `SELECT` all rows (including `is_active = false`). No write policies.
- **Used by:** State/LGA selection and geography lookups (onboarding, community browsing).

### 4.3 `lgas`
- **Purpose:** Local Government Areas.
- **Primary key:** `id`.
- **Important columns:** `state_id` (not null), `name`, `code`, `source_id`, `source_record_id`, `boundary`, `is_active` (default `true`), timestamps.
- **Foreign keys:** `state_id -> states(id)` ON DELETE RESTRICT; `source_id -> geographic_sources(id)` ON DELETE SET NULL.
- **Constraints:** `UNIQUE (id, state_id)`; `UNIQUE (state_id, name)`; `UNIQUE (source_id, source_record_id)`; unique index `(state_id, upper(code))` where code not null.
- **RLS/access:** Authenticated `SELECT` all rows. No write policies.
- **Used by:** Geography hierarchy; parent of communities.

### 4.4 `wards`
- **Purpose:** Electoral/administrative wards within an LGA. **A ward is not a community.**
- **Primary key:** `id`.
- **Important columns:** `lga_id` (not null), `name`, `code`, `source_id`, `source_record_id`, `boundary`, `is_active` (default `true`), timestamps.
- **Foreign keys:** `lga_id -> lgas(id)` ON DELETE RESTRICT; `source_id -> geographic_sources(id)` ON DELETE SET NULL.
- **Constraints:** `UNIQUE (id, lga_id)` (target of the communities composite FK); `UNIQUE (lga_id, name)`; `UNIQUE (source_id, source_record_id)`; unique index `(lga_id, upper(code))` where code not null.
- **RLS/access:** Authenticated `SELECT` all rows. No write policies.
- **Used by:** Optional grouping of communities.

### 4.5 `communities`
- **Purpose:** Settlements/neighbourhoods (for example Bodija) that residents report on and that risk assessments and alerts attach to. Only rows with `is_active = true` are intended to be offered as configured pilot communities.
- **Primary key:** `id`.
- **Important columns:** `lga_id` (not null), `ward_id` (nullable), `name`, `community_type`, `latitude`, `longitude`, `location geography(Point, 4326)` (derived), `boundary geometry(MultiPolygon, 4326)`, `verification_status` (default `UNVERIFIED`), `verification_notes`, `is_active` (default **`false`**), `source_id`, `source_record_id`, timestamps.
- **Foreign keys:** `lga_id -> lgas(id)` RESTRICT; composite `(ward_id, lga_id) -> wards(id, lga_id)` RESTRICT (prevents a ward from a different LGA; skipped when `ward_id` is NULL); `source_id -> geographic_sources(id)` SET NULL.
- **Constraints:** latitude in [-90, 90]; longitude in [-180, 180]; latitude and longitude both NULL or both set; `UNIQUE (source_id, source_record_id)`. There is **no** unique constraint on `(lga_id, name)`.
- **Behaviour:** Trigger `trg_sync_community_location` rebuilds `location` from latitude/longitude on insert or on update of those columns, and sets `updated_at` in those cases only.
- **RLS/access:** Authenticated users can `SELECT` rows where `is_active = true`; admins can select all. Policy "Admins manage communities" (`FOR ALL`, `is_admin()`).
- **Not enforced by the database:** `is_active = true` is **not** tied to `verification_status = 'VERIFIED'`. Activating only verified communities is an operational rule.
- **Used by:** Community picker, report submission target, risk display, alerts.

### 4.6 `community_aliases`
- **Purpose:** Alternative or local names for a community.
- **Primary key:** `id`. **Columns:** `community_id`, `alias`, `language_code`, `source_id`, `created_at`.
- **Foreign keys:** `community_id -> communities(id)` ON DELETE CASCADE; `source_id -> geographic_sources(id)` SET NULL.
- **Constraints:** `UNIQUE (community_id, alias)`. Index on `lower(alias)`.
- **RLS/access:** Authenticated `SELECT` where the parent community is active (admins: any). Admin `FOR ALL` policy.
- **Used by:** Community search by alternative name (frontend feature **Needs confirmation**).

### 4.7 `community_sources`
- **Purpose:** Per-community provenance links to `geographic_sources`.
- **Primary key:** `id`. **Columns:** `community_id`, `source_id` (not null), `source_record_id`, `source_name`, `source_confidence` (text), `imported_at`, `notes`.
- **Foreign keys:** `community_id -> communities(id)` CASCADE; `source_id -> geographic_sources(id)` RESTRICT.
- **Constraints:** `UNIQUE (community_id, source_id, source_record_id)`.
- **RLS/access:** Same pattern as aliases: authenticated read for active communities; admin `FOR ALL`.
- **Used by:** Data provenance.

### 4.8 `community_verifications`
- **Purpose:** History of verification reviews for a community.
- **Primary key:** `id`. **Columns:** `community_id`, `verification_status` (enum), `source_id`, `reviewed_by` (uuid), `evidence_url`, `notes`, `verified_at`, `created_at`.
- **Foreign keys:** `community_id -> communities(id)` CASCADE; `source_id -> geographic_sources(id)` SET NULL; `reviewed_by -> auth.users(id)` SET NULL.
- **Indexes:** `(community_id, created_at desc)`.
- **RLS/access:** Authenticated `SELECT` where the community is active (admins: any); admin `FOR ALL`.
- **Behaviour note:** No trigger copies a row's status into `communities.verification_status`; the two are maintained separately.
- **Privacy note:** Residents can read `reviewed_by`, `notes` and `evidence_url` for active communities under this policy.
- **Used by:** Admin community verification workflow (UI **Needs confirmation**).

### 4.9 `profiles`
- **Purpose:** One application profile per Supabase Auth user; holds the role.
- **Primary key:** `id uuid` = `auth.users(id)` (ON DELETE CASCADE).
- **Important columns:** `full_name`, `role app_role` (default `RESIDENT`), `preferred_community_id`, `created_at`, `updated_at`.
- **Foreign keys:** `id -> auth.users(id)` CASCADE; `preferred_community_id -> communities(id)` SET NULL.
- **Creation:** Automatically by trigger `on_auth_user_created_floodguard` -> `handle_new_auth_user()`. `role` is always `RESIDENT`; `full_name` is read from `raw_user_meta_data ->> 'full_name'`.
- **RLS/access:** `SELECT` own row, or all rows for admins. `UPDATE` policy allows own row (or admin), but **column privileges** restrict updates to `full_name` and `preferred_community_id` only. No client `INSERT`/`DELETE` policy.
- **Not validated:** `preferred_community_id` is only an FK; it is not checked to be an active community.
- **Used by:** Auth/role lookup, onboarding (preferred community), profile screen.

### 4.10 `hazard_reports`
- **Purpose:** Resident-submitted hazard reports and their review state.
- **Primary key:** `id`. **Unique:** `reference_code` (format `FG-` + 10 uppercase hex characters, for example `FG-0AB9B3574B`).
- **Important columns:** `reporter_id`, `community_id`, `category hazard_category`, `description`, `photo_path`, `latitude`, `longitude`, `location` (derived), `status` (default `PENDING`), `admin_note`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.
- **Foreign keys:** `reporter_id -> profiles(id)` RESTRICT; `community_id -> communities(id)` RESTRICT; `reviewed_by -> profiles(id)` SET NULL.
- **Constraints:** description not blank (`length(trim(description)) > 0`); latitude/longitude ranges; coordinates both-or-neither.
- **Insert trigger** `trg_prepare_hazard_report_insert` (BEFORE INSERT, `security invoker`): requires `auth.uid()` (else error `42501`), then **overwrites** `reporter_id := auth.uid()`, `status := 'PENDING'`, `reviewed_by/reviewed_at/admin_note := NULL`, generates `reference_code` if missing, derives `location` from latitude/longitude.
- **RLS policies:**
  - SELECT: owner, **or** admin, **or** (status in `VERIFIED`/`IN_PROGRESS`/`RESOLVED` **and** community active) - the last branch lets *any authenticated user* read those reports (whole row).
  - INSERT: `reporter_id = auth.uid()`, status `PENDING`, review fields NULL, community active.
  - UPDATE (owner): own report while `PENDING`. UPDATE (admin): `is_admin()`. Both are limited by the column grant below.
- **Column privilege:** `UPDATE` revoked from `anon`/`authenticated`, then `GRANT UPDATE (photo_path)`. Status/review fields change only through `review_hazard_report`.
- **No** DELETE policy.
- **`photo_path`:** free text; the database does not verify that it points to an existing object or to the caller's own Storage folder.
- **Used by:** Report submission, "my reports", community verified-reports feed, admin review queue.

### 4.11 `report_status_history`
- **Purpose:** Audit trail of report status changes.
- **Primary key:** `id`. **Columns:** `report_id`, `previous_status`, `new_status`, `changed_by`, `note`, `created_at`.
- **Foreign keys:** `report_id -> hazard_reports(id)` CASCADE; `changed_by -> profiles(id)` SET NULL.
- **Written by:** trigger `trg_audit_hazard_report_status` (AFTER UPDATE OF status, `security definer`), only when `status` actually changes. `note` copies `admin_note`; `changed_by` = `coalesce(reviewed_by, auth.uid())`.
- **Not recorded:** initial creation (no row on insert), and a `VERIFIED -> VERIFIED` review (status unchanged, so no history row, although `admin_note`/`reviewed_*` are updated).
- **RLS/access:** Admins `SELECT` only. No client write policy or grant.
- **Used by:** Admin audit view.

### 4.12 `risk_assessments`
- **Purpose:** Append-only history of community flood-risk assessments, written by a trusted server-side process (BE2).
- **Primary key:** `id`.
- **Important columns:** `community_id`, `risk_level` (default `UNAVAILABLE`), `score numeric(5,2)`, `confidence` (default `INSUFFICIENT`), `explanation`, `recommended_actions text[]`, `data_available` (default `false`), `limitations text[]`, `inputs_used text[]`, `inputs_missing text[]`, `input_summary jsonb`, `data_freshness jsonb`, `methodology_version`, `explanation_source` (default `NONE`), `explanation_provider`, `explanation_generated_at`, `assessed_at`, `created_at`.
- **Foreign keys:** `community_id -> communities(id)` RESTRICT.
- **Constraints:** score in [0, 100] or NULL; `risk_level = 'UNAVAILABLE'` requires NULL score; any other level requires a non-NULL score.
- **Indexes:** `(community_id, assessed_at desc)`, `(risk_level, assessed_at desc)`.
- **RLS/access:** `SELECT` for active communities (admins: any). No insert/update/delete policy and only `SELECT` is granted -> clients cannot write. Server-side writes use credentials that bypass RLS (service role). Append-only is achieved by policies/grants, not by a trigger.
- **Not in the schema:** any scoring formula, scheduler or Edge Function. The JSON shapes of `input_summary` and `data_freshness` are not defined - **Needs confirmation** with BE2.
- **Used by:** Community risk display.

### 4.13 `alerts`
- **Purpose:** Advisories/notices shown to residents.
- **Primary key:** `id`.
- **Important columns:** `title`, `message`, `severity alert_severity`, `alert_type` (default `COMMUNITY_NOTICE`), `community_id` (nullable), `created_by` (not null), `expires_at`, `created_at`, `updated_at`.
- **Foreign keys:** `community_id -> communities(id)` CASCADE; `created_by -> profiles(id)` RESTRICT.
- **Constraints:** title and message not blank; `expires_at` NULL or `> created_at`.
- **Indexes:** `(community_id, expires_at, created_at desc)`, `(severity, created_at desc)`.
- **RLS/access:** Authenticated `SELECT` where not expired and (no community, or community active). Admin `FOR ALL` (also lets admins see expired alerts).
- **Notes:** No trigger sets `created_by`, and the policy does not require `created_by = auth.uid()`; the inserting admin must supply a valid profile id. Whether the Supabase client can insert alerts depends on table privileges beyond the explicit `SELECT` grant - **Needs confirmation**.
- **Used by:** Resident alert list/banner; admin alert management.

### 4.14 `shelters`
- **Purpose:** Optional/P2 table for verified shelter locations. The migration warns not to seed unverified shelters.
- **Primary key:** `id`. **Columns:** `community_id`, `name`, `address`, `latitude`, `longitude`, `location` (derived), `verification_status` (default `UNVERIFIED`), `source_id`, `source_record_id`, `is_active` (default `false`), `notes`, timestamps.
- **Foreign keys:** `community_id -> communities(id)` SET NULL; `source_id -> geographic_sources(id)` SET NULL.
- **Constraints:** coordinate range/pair checks; `UNIQUE (source_id, source_record_id)`.
- **RLS/access:** Authenticated `SELECT` where `is_active = true AND verification_status = 'VERIFIED'`. Admin `FOR ALL`.
- **Status:** Schema only; no data and no confirmed frontend feature.

---

## 5. Functions and RPCs

| Function | Type | Purpose |
|---|---|---|
| `public.review_hazard_report(p_report_id uuid, p_new_status hazard_report_status, p_admin_note text default null)` returns `hazard_reports` | **RPC** (`security definer`) - `EXECUTE` revoked from PUBLIC, granted to `authenticated` | Admin-only status change. See [lifecycle](BACKEND_HANDOFF.md#4-hazard-report-lifecycle). |
| `public.is_admin()` returns boolean | Helper (`security definer`, stable) - granted to `authenticated` | True when the caller's profile role is `ADMIN`. Used in policies; also callable via RPC. |
| `public.handle_new_auth_user()` | Trigger fn (`security definer`) | Creates the `profiles` row for each new auth user. |
| `public.prepare_hazard_report_insert()` | Trigger fn (`security invoker`) | See 4.10. |
| `public.audit_hazard_report_status()` | Trigger fn (`security definer`) | Writes `report_status_history`. |
| `public.generate_hazard_reference_code()` | Helper | Returns `'FG-' || 10 uppercase hex chars`. No collision retry; collisions would hit the `UNIQUE` constraint. |
| `public.sync_community_location()` / `public.sync_shelter_location()` | Trigger fns | Derive `location` from latitude/longitude; set `updated_at`. |
| `public.set_updated_at()` / `public.touch_hazard_report_updated_at()` | Trigger fns | Set `updated_at`. |

There are **no** other RPCs. In particular, there is no RPC for writing risk assessments, creating alerts, or point-in-polygon matching (the SQL post-migration checklist mentions testing state/LGA point-in-polygon matching, but no such function exists in this migration).

## 6. Triggers

| Trigger | Table | Timing | Function |
|---|---|---|---|
| `trg_sync_community_location` | communities | BEFORE INSERT OR UPDATE OF latitude, longitude | `sync_community_location` |
| `on_auth_user_created_floodguard` | auth.users | AFTER INSERT | `handle_new_auth_user` |
| `trg_states_updated_at` / `trg_lgas_updated_at` / `trg_wards_updated_at` / `trg_profiles_updated_at` | states / lgas / wards / profiles | BEFORE UPDATE | `set_updated_at` |
| `trg_prepare_hazard_report_insert` | hazard_reports | BEFORE INSERT | `prepare_hazard_report_insert` |
| `trg_hazard_report_updated_at` | hazard_reports | BEFORE UPDATE | `touch_hazard_report_updated_at` |
| `trg_audit_hazard_report_status` | hazard_reports | AFTER UPDATE OF status | `audit_hazard_report_status` |
| `trg_alerts_updated_at` | alerts | BEFORE UPDATE | `set_updated_at` |
| `trg_sync_shelter_location` | shelters | BEFORE INSERT OR UPDATE OF latitude, longitude | `sync_shelter_location` |

`communities` and `shelters` have no generic `updated_at` trigger; their `updated_at` changes only when latitude/longitude change.

## 7. Indexes

- **Unique/regular:** `states_country_code_unique`, `lgas_state_code_unique`, `wards_lga_code_unique` (partial, `code is not null`).
- **Lookup:** `lgas_state_id_idx`, `wards_lga_id_idx`, `communities_lga_id_idx`, `communities_ward_id_idx`, `communities_active_name_idx (is_active, lower(name))`, `community_aliases_alias_idx`, `community_verifications_community_idx`, `profiles_preferred_community_idx`, `hazard_reports_community_status_created_idx`, `hazard_reports_reporter_created_idx`, `hazard_reports_status_created_idx`, `report_status_history_report_created_idx`, `risk_assessments_community_assessed_idx`, `risk_assessments_level_assessed_idx`, `alerts_community_expiry_created_idx`, `alerts_severity_created_idx`, `shelters_community_idx`.
- **Spatial (GiST):** `states_boundary_gix`, `lgas_boundary_gix`, `wards_boundary_gix`, `communities_location_gix`, `communities_boundary_gix`, `hazard_reports_location_gix`, `shelters_location_gix`.

## 8. Grants

From migration section 7 (and section 3/6 for column grants):

| Role | Privileges explicitly granted |
|---|---|
| `anon`, `authenticated` | `USAGE` on schema `public` |
| `authenticated` | `SELECT` on `geographic_sources`, `states`, `lgas`, `wards`, `communities`, `community_aliases`, `community_sources`, `community_verifications`, `profiles`, `hazard_reports`, `report_status_history`, `risk_assessments`, `alerts`, `shelters` |
| `authenticated` | `INSERT` on `hazard_reports` |
| `authenticated` | `UPDATE (full_name, preferred_community_id)` on `profiles` |
| `authenticated` | `UPDATE (photo_path)` on `hazard_reports` |
| `authenticated` | `EXECUTE` on `is_admin()` and `review_hazard_report(uuid, hazard_report_status, text)` |
| `anon` | **No** table grants in the migration. `UPDATE` revoked on `profiles` and `hazard_reports`. |

## 9. Storage bucket and policies

Bucket `report-images`: `public = false`, `file_size_limit = 5242880` (5 MB), `allowed_mime_types = image/jpeg, image/png, image/webp`.

Policies on `storage.objects` (all for role `authenticated`, all scoped to `bucket_id = 'report-images'`):

| Policy | Operation | Rule |
|---|---|---|
| Residents upload images for own reports | INSERT | First path folder = `auth.uid()`, **and** second folder is the id of a `hazard_reports` row whose `reporter_id = auth.uid()`. |
| Owners and admins read report images | SELECT | First path folder = `auth.uid()`, or `is_admin()`. |
| Owners and admins delete report images | DELETE | Same as SELECT. |

There is **no UPDATE policy**, so overwriting an existing object (upsert) is not permitted.

## 10. Access matrix (summary)

"RLS" = row-level security policy; "grant" = explicit privilege in the migration.

| Table | Anonymous | Resident | Admin |
|---|---|---|---|
| geographic_sources, states, lgas, wards | none | read all | read all; writes via trusted import |
| communities | none | read active | read all; manage (policy; grant **Needs confirmation**) |
| community_aliases / sources / verifications | none | read (active communities) | read all; manage (policy; grant **Needs confirmation**) |
| profiles | none | read own; update own `full_name`, `preferred_community_id` | read all; same column limits (role cannot be changed via API) |
| hazard_reports | none | insert own `PENDING`; read own + others' verified/in-progress/resolved in active communities; attach `photo_path` to own pending | read all; status via RPC only |
| report_status_history | none | none | read |
| risk_assessments | none | read (active communities) | read all; no client writes |
| alerts | none | read active/non-expired | read all; manage (policy; grant **Needs confirmation**) |
| shelters | none | read verified + active | read all; manage (policy; grant **Needs confirmation**) |

> **Anonymous behaviour:** Anonymous users have no policies on any table. Depending on Supabase default privileges, an anonymous request returns either an empty result set or a permission error - **Needs confirmation** which. Either way no rows must be returned. See [TESTING_GUIDE.md](TESTING_GUIDE.md).

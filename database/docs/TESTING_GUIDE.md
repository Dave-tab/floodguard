# FloodGuard AI - Testing Guide (Postman + Supabase SQL Editor)

Purpose: verify authentication, the report lifecycle, RLS isolation, Storage rules and role restrictions. Companion documents: [TEST_DATA.md](TEST_DATA.md) | [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

> **Secrets:** Never paste real access tokens, passwords, API keys or the service-role key into this repository, screenshots or shared Postman collections. Store them only in your local Postman environment (mark them "secret") and never commit exported environments.

> **Status:** Expected results below are derived from the migration. They have not been executed against a live project in preparing this package. Where behaviour depends on project settings, it is marked **Needs confirmation**.

> **Development data warning:** the existing records in [TEST_DATA.md](TEST_DATA.md) are shared development data. Create *new* test reports for destructive steps (review/reject) instead of changing the existing ones.

---

## 1. Postman setup

Create an environment with these variables (values supplied locally by the project owner):

| Variable | Description |
|---|---|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `ANON_KEY` | Publishable/anon key (same value as `VITE_SUPABASE_ANON_KEY`) |
| `COMMUNITY_ID` | `37463757-bb85-4887-99fc-f8062f1eff65` (Bodija, dev data) |
| `RESIDENT_A_TOKEN`, `RESIDENT_B_TOKEN`, `ADMIN_TOKEN` | Access tokens obtained in Test 1 (secret) |
| `RESIDENT_A_ID` | `6395d229-8d1e-4a65-818a-dd9eccffd098` |
| `RESIDENT_B_ID` | **Needs confirmation** - the value supplied in the brief is not a valid UUID (see TEST_DATA.md) |
| `ADMIN_ID` | `111eefb7-a2a5-4d38-a3d2-39b9273510fb` |
| `REPORT_ID` | Set by the test that creates a report |

**Common headers for REST/Storage calls:**

| Header | Value |
|---|---|
| `apikey` | `{{ANON_KEY}}` |
| `Authorization` | `Bearer {{RESIDENT_A_TOKEN}}` (or B / admin token). Omit or use the anon key to test anonymous access. |
| `Content-Type` | `application/json` (JSON bodies) |

`Prefer: return=representation` makes inserts/updates return the row.

The three accounts' credentials are held by the project owner; do not write them here.

---

## 2. Test cases

Endpoints are relative to `{{SUPABASE_URL}}`. "Resident A/B" refer to the development accounts.

### T01 - Authentication

| Step | Request | Expected |
|---|---|---|
| Sign in (password) | `POST /auth/v1/token?grant_type=password`<br>Headers: `apikey`, `Content-Type: application/json`<br>Body: `{ "email": "<email>", "password": "<password>" }` | `200` with `access_token`, `refresh_token`, `user.id`. Save the token to the matching variable. Repeat for Resident A, Resident B and Admin. |
| Sign up (optional, creates new data) | `POST /auth/v1/signup`<br>Body: `{ "email": "<email>", "password": "<password>", "data": { "full_name": "Test User" } }` | `200`. A `profiles` row with `role = RESIDENT` appears (check in SQL Editor). Email confirmation behaviour **Needs confirmation**. |
| Current user | `GET /auth/v1/user` with `apikey` + `Authorization: Bearer {{RESIDENT_A_TOKEN}}` | `200`, `id` equals `{{RESIDENT_A_ID}}`. |

Verify roles (T01b): `GET /rest/v1/profiles?select=id,full_name,role&id=eq.{{RESIDENT_A_ID}}` with A's token -> one row, `role: "RESIDENT"`. With the admin token and no `id` filter -> all profiles.

### T02 - Anonymous access restrictions

Use only `apikey: {{ANON_KEY}}` (no user token), or `Authorization: Bearer {{ANON_KEY}}`.

| Request | Expected |
|---|---|
| `GET /rest/v1/communities?select=id,name` | **No rows.** Either `200 []` or `401/403` permission error - which one **Needs confirmation**. |
| `GET /rest/v1/hazard_reports?select=id` | No rows (same note). |
| `GET /rest/v1/alerts?select=id` | No rows. |
| `GET /rest/v1/risk_assessments?select=id` | No rows. |
| `GET /rest/v1/states?select=id` | No rows. |
| `POST /rest/v1/hazard_reports` body `{ "community_id": "{{COMMUNITY_ID}}", "category": "FLOODING", "description": "anon test" }` | Rejected (`401/403`, code `42501`). |
| `POST /rest/v1/rpc/review_hazard_report` body `{ "p_report_id": "{{REPORT_ID}}", "p_new_status": "VERIFIED" }` | Rejected (permission denied for function). |

Pass criterion: no row data is ever returned.

### T03 - Resident creates a report

`POST /rest/v1/hazard_reports`
Headers: `apikey`, `Authorization: Bearer {{RESIDENT_A_TOKEN}}`, `Content-Type: application/json`, `Prefer: return=representation`
Body:
```json
{
  "community_id": "37463757-bb85-4887-99fc-f8062f1eff65",
  "category": "BLOCKED_DRAINAGE",
  "description": "TEST ONLY - blocked drainage near junction",
  "latitude": 7.4,
  "longitude": 3.9
}
```
Expected: `201`, array with one row: `status: "PENDING"`, `reference_code` like `FG-XXXXXXXXXX`, `reporter_id` = Resident A's id, `reviewed_by`/`admin_note` null. Save `id` as `REPORT_ID`. (Coordinates are arbitrary test values.)

Trigger override check: repeat with extra body fields `"status": "VERIFIED"` and `"reporter_id": "{{RESIDENT_B_ID}}"`. Expected: the row is still created with `status: PENDING` and `reporter_id` = A (the BEFORE INSERT trigger overwrites them).

Validation: blank description `"   "` -> `400`, code `23514`. Only `latitude` supplied -> `23514`.

### T04 - Inactive community restriction

1. In the SQL Editor, find an inactive community id (see section 3, query Q1). If none exists, create one only in a development project, never in production.
2. `POST /rest/v1/hazard_reports` with A's token and that `community_id`.
   Expected: `403`, code `42501`, "new row violates row-level security policy".
3. `GET /rest/v1/communities?id=eq.<inactive_id>` with A's token -> `[]`. With the admin token -> the row.
4. `GET /rest/v1/risk_assessments?community_id=eq.<inactive_id>` with A's token -> `[]`.

### T05 - Resident report visibility / Resident A vs Resident B isolation

| Request (token) | Expected |
|---|---|
| `GET /rest/v1/hazard_reports?select=id,reference_code,status,reporter_id&reporter_id=eq.{{RESIDENT_A_ID}}` (A) | A's own reports in all statuses (existing: `FG-0AB9B3574B` VERIFIED, `FG-982E82334C` PENDING, plus any created in T03). |
| `GET /rest/v1/hazard_reports?select=id,reference_code,status&id=eq.<A's PENDING report id>` (**B**) | `[]` - B cannot see A's pending report. |
| `GET /rest/v1/hazard_reports?select=id,reference_code,status&id=eq.5307b7fa-e34d-47bf-9eb4-9a8f6b997060` (**B**) | **One row** - A's report is `VERIFIED` in an active community, which any authenticated user may read (per the RLS policy). Confirm Bodija is active (**Needs confirmation**). |
| `GET /rest/v1/hazard_reports?select=id,reference_code,status&id=eq.bee9ef3a-af09-49bf-a01e-d91a352a1e75` (B) | One row (B's own `REJECTED` report). |
| Same URL as the previous row (**A**) | `[]` - A cannot see B's rejected report. |
| `GET /rest/v1/hazard_reports?select=reference_code,status` (B, no filter) | B's own reports + all verified/in-progress/resolved reports in active communities; never A's pending ones. |
| `GET /rest/v1/hazard_reports?select=reference_code,status` (admin) | All reports. |

### T06 - Admin report visibility

`GET /rest/v1/hazard_reports?select=id,reference_code,status,reporter_id,community_id&order=created_at.desc` with admin token -> reports from both residents including `PENDING` and `REJECTED`.
`GET /rest/v1/profiles?select=id,role` (admin) -> all profiles; same call with a resident token -> only the caller's row.

### T07 - Admin review (valid transitions)

Use a **new** report created in T03 (`REPORT_ID`).

`POST /rest/v1/rpc/review_hazard_report`
Headers: `apikey`, `Authorization: Bearer {{ADMIN_TOKEN}}`, `Content-Type: application/json`
Body:
```json
{ "p_report_id": "<REPORT_ID>", "p_new_status": "VERIFIED", "p_admin_note": "Confirmed by test admin" }
```
Expected `200`: the report row with `status: "VERIFIED"`, `reviewed_by` = admin id, `reviewed_at` set.

Continue the chain on the same report (each step a separate call):
`VERIFIED -> IN_PROGRESS` (ok) -> `RESOLVED` (ok). Then any further change, e.g. `RESOLVED -> VERIFIED` -> error (T08).

Negative role test: call the same RPC with `RESIDENT_A_TOKEN` -> `403`/`400`, code `42501`, message "Admin permission required".

### T08 - Invalid transitions and rejection-reason validation

Using fresh `PENDING` reports:

| Body | Expected |
|---|---|
| `PENDING -> RESOLVED` (`p_new_status: "RESOLVED"`) | Error code `22023`: "Invalid report status transition: PENDING -> RESOLVED" |
| `PENDING -> IN_PROGRESS` | Same `22023` |
| `PENDING -> REJECTED` with `p_admin_note` omitted | `22023`: "A rejection reason is required" |
| `PENDING -> REJECTED` with `"p_admin_note": "   "` | `22023` (blank after trim) |
| `PENDING -> REJECTED` with `"p_admin_note": "Duplicate report"` | `200`, `status: REJECTED`, `admin_note: "Duplicate report"` |
| Then `REJECTED -> VERIFIED` | `22023` (terminal) |
| Non-existent `p_report_id` (random UUID) | `P0002`: "Report not found" |
| Direct update `PATCH /rest/v1/hazard_reports?id=eq.<id>` body `{ "status": "VERIFIED" }` with the **admin** token | Rejected: `42501` permission denied (column privilege; only `photo_path` is updatable). Status must go through the RPC. |

### T09 - Status history auditing

Admin: `GET /rest/v1/report_status_history?select=previous_status,new_status,changed_by,note,created_at&report_id=eq.<REPORT_ID>&order=created_at.asc`
Expected for the T07 chain: rows `PENDING->VERIFIED`, `VERIFIED->IN_PROGRESS`, `IN_PROGRESS->RESOLVED`, exactly one row per change, `changed_by` = admin id.
Resident token on the same URL -> `[]` (no policy for residents).
Known behaviours to confirm: no row for creation; a `VERIFIED -> VERIFIED` review adds **no** row (status unchanged) but updates `admin_note`.

### T10 - Private Storage upload

Prerequisite: a report owned by Resident A (`REPORT_ID`, new `PENDING`) and a small JPEG/PNG/WebP file.

| Step | Request | Expected |
|---|---|---|
| Upload (A) | `POST /storage/v1/object/report-images/{{RESIDENT_A_ID}}/<REPORT_ID>/test1.jpg`<br>Headers: `apikey`, `Authorization: Bearer {{RESIDENT_A_TOKEN}}`, `Content-Type: image/jpeg`, `x-upsert: false`<br>Body: binary file | `200`, JSON with `Key`/`Id`. |
| Attach path (A) | `PATCH /rest/v1/hazard_reports?id=eq.<REPORT_ID>`<br>Headers as above + `Content-Type: application/json`, `Prefer: return=representation`<br>Body: `{ "photo_path": "<A_ID>/<REPORT_ID>/test1.jpg" }` | `200`, one row with `photo_path` set. |
| Signed URL (A) | `POST /storage/v1/object/sign/report-images/<A_ID>/<REPORT_ID>/test1.jpg`<br>Body: `{ "expiresIn": 60 }` | `200` with a `signedURL`. |
| Public URL attempt | `GET /storage/v1/object/public/report-images/<path>` (no auth) | Not served (bucket is private). |
| Admin read | Same sign request with the admin token | `200` (admins may read all report images). |

### T11 - Image ownership and upload restrictions

| Scenario | Expected |
|---|---|
| Resident B uploads to `report-images/{{RESIDENT_A_ID}}/<A's report>/x.jpg` | `403` (first folder is not B's uid). |
| Resident B uploads to `report-images/{{RESIDENT_B_ID}}/<A's report id>/x.jpg` | `403` (report is not owned by B). |
| Resident A uploads to a path whose second folder is a random UUID (no such report) | `403`. |
| Upload with `Content-Type: image/gif` or a PDF | Rejected (`415`/`400`; MIME not allowed by the bucket). |
| Upload a file larger than 5 MB | Rejected (`413`). |
| Re-upload to the same path with `x-upsert: true` | Rejected (no UPDATE policy). |
| Anonymous upload | Rejected. |
| Resident B requests a signed URL for A's image | Rejected / not found (SELECT policy: owner or admin). |
| Resident B `PATCH`es A's report `photo_path` | `200` with empty array `[]` (RLS filters the row; nothing is updated). |
| Resident A `PATCH`es own report that is no longer `PENDING` (e.g. VERIFIED `FG-0AB9B3574B`) | `200` with `[]`, no change. |
| Resident A `PATCH`es own report `description` or `status` | `403`, `42501` permission denied (column privilege). |

Exact HTTP codes for Storage errors vary by Supabase version; the pass criterion is that the action fails and no object/row changes.

### T12 - Role escalation and profile protection

`PATCH /rest/v1/profiles?id=eq.{{RESIDENT_A_ID}}` with A's token, body `{ "role": "ADMIN" }` -> `403`, `42501` permission denied (role is not an updatable column).
`PATCH` with body `{ "full_name": "Resident A (test)" }` -> `200` (allowed). Restore the original name afterwards.

### T13 - Alerts and risk assessments

| Request | Expected |
|---|---|
| `GET /rest/v1/alerts?select=id,title,severity,alert_type,community_id,expires_at` (A) | Includes alert `4193ce55-7714-4b11-819e-d748f9b41497` ("Flood Risk Advisory - Bodija") if not expired and Bodija active (**Needs confirmation**). |
| `POST /rest/v1/alerts` (A) | Rejected (`42501`). |
| `GET /rest/v1/risk_assessments?select=risk_level,score,confidence,assessed_at&community_id=eq.{{COMMUNITY_ID}}&order=assessed_at.desc&limit=1` (A) | Latest row, or `[]` if none exist (no risk writer is implemented; no dev assessment record was provided). |
| `POST /rest/v1/risk_assessments` (A or admin) | Rejected (`42501`); clients cannot write. |

---

## 3. Supabase SQL Editor checks

The SQL Editor runs with elevated database privileges and **bypasses RLS**. Use it to inspect data, not to prove RLS works. The read-only queries are in [`database/seed/inspect_test_data.sql`](../database/seed/inspect_test_data.sql).

**Q1 - find an inactive community (for T04):**
```sql
select id, name, is_active, verification_status
from public.communities
where is_active = false
limit 5;
```

**Q2 - confirm a role (after provisioning an admin):**
```sql
select id, role from public.profiles where id = '111eefb7-a2a5-4d38-a3d2-39b9273510fb';
```

**Q3 - exactly one history row per change (T09):**
```sql
select report_id, previous_status, new_status, changed_by, note, created_at
from public.report_status_history
where report_id = '<REPORT_ID>'
order by created_at;
```

### Optional: simulate RLS inside SQL (advanced)
A common pattern is to impersonate a user inside a transaction and roll back. It relies on Supabase's JWT-claim settings; confirm it works in your project (**Needs confirmation**) and never leave it uncommitted-open:

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"6395d229-8d1e-4a65-818a-dd9eccffd098","role":"authenticated"}', true);

  select id, reference_code, status from public.hazard_reports;   -- should respect RLS

rollback;
```
Postman tests against the real API remain the authoritative check.

---

## 4. Migration checklist coverage

The migration's own post-migration checklist items and where they are covered:

| Checklist item | Covered by |
|---|---|
| Test RLS with anonymous, resident A, resident B and admin | T02, T05, T06 |
| Test report lifecycle, image ownership, private bucket, invalid transitions | T07, T08, T10, T11 |
| One status history row per change | T09 |
| Point-in-polygon matching state/LGA | **Not testable** - no such function exists in the migration |
| Enable/configure Auth provider; create admins by trusted provisioning | T01; BACKEND_HANDOFF.md section 2 |

## 5. Cleanup

Test reports created in these tests remain in the development database (reports cannot be deleted by clients - there is no DELETE policy). Label them "TEST ONLY" in `description` so they can be identified, and remove them only via trusted SQL in the development project. Delete test images with `supabase.storage.from('report-images').remove([...])` as the owner, or as an admin.

# FloodGuard AI - API and Frontend Integration Guide

Audience: frontend developer (and BE2 where noted).
Schema reference: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Access rules: [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md).

> **Status of these examples:** They are written against the migration's table, column, enum and RPC names and use standard `@supabase/supabase-js` v2 patterns. They have **not been executed** against a live project in preparing this package. Run them against the development project and report any mismatch to BE1.

## How the API works (and what does not exist)

| Kind | Status |
|---|---|
| **Direct Supabase client queries** (`supabase.from(...)`, `supabase.auth...`, `supabase.storage...`) - these use Supabase's auto-generated REST/Auth/Storage endpoints, protected by RLS | **Implemented** |
| **RPC** `review_hazard_report` (and the helper `is_admin`) via `supabase.rpc(...)` | **Implemented** |
| Custom backend routes such as `/api/reports`, `/api/risk`, `/api/alerts` | **Not implemented.** Do not call them. |
| Edge Functions | **Not implemented** in this repo |
| Proposed (not built): risk-assessment write endpoint, admin alert-creation RPC, public-safe reports view, signed photo URLs for community reports | **Proposed** |

Security rules: use only the **publishable/anon key** in the frontend. Never use the service-role key in browser code. Never disable RLS.

---

## 1. Initialize Supabase

Install: `npm install @supabase/supabase-js`

Copy `.env.example` to `.env` and fill in values supplied by the project owner (never commit `.env`).

```js
// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

All later examples import `supabase` from this file. A small helper keeps error handling consistent:

```js
// src/lib/unwrap.js
export function unwrap({ data, error }) {
  if (error) {
    // error.code, error.message, error.details, error.hint come from PostgREST/Postgres
    throw error;
  }
  return data;
}
```

### Common error codes

| Code / message | Typical meaning here |
|---|---|
| `42501` + "new row violates row-level security policy" | An insert/update was blocked by RLS (for example inactive community, not your report). |
| `42501` + "permission denied for table ..." | Column/table privilege missing (for example trying to update `role` or `description`). |
| `42501` + "Admin permission required" | Non-admin called `review_hazard_report`. |
| `22023` | Invalid transition or missing rejection reason (RPC). |
| `P0002` | "Report not found" (RPC). |
| `PGRST116` | `.single()` matched 0 or more than 1 rows (also what you see when RLS hides the row). |
| `23503` | Foreign key violation (for example a non-existent `community_id`). |
| `23514` | Check constraint violation (for example blank `description`, latitude out of range). |

---

## 2. Sign up and sign in

**Auth state:** none required (these are the entry points). The sign-up screen is reachable by anonymous users; no database data is returned to them.

```js
import { supabase } from './supabaseClient';

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }, // read by the handle_new_auth_user() trigger
  });
  if (error) throw error;
  // data.user is the new user. data.session may be null if email confirmation is required
  // (Needs confirmation: depends on the project's Auth settings).
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data; // { user, session }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
```

**Expected result:** On sign-up, the database trigger creates a `profiles` row with `role = 'RESIDENT'`. On sign-in, a session with a JWT is stored by the client and sent automatically on later requests.
**RLS notes:** The role cannot be chosen at sign-up. Do not send `role` in metadata - it is ignored. Admin accounts are provisioned by an operator, never through the app.
**Provider note:** the examples assume email + password; which providers are enabled **Needs confirmation**.

---

## 3. Get the current authenticated user

**Auth state:** a session should exist; otherwise the result is `null`.

```js
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user; // null when not signed in
}
```

**Expected result:** the Auth user object (`id` is the UUID used everywhere as `auth.uid()`).
**Note:** `getUser()` validates the session with the Auth server. For route guards where speed matters, `supabase.auth.getSession()` reads the local session; `supabase.auth.onAuthStateChange(...)` can drive UI updates.

---

## 4. Read the user's profile and role

**Auth state:** signed in (resident or admin).

```js
export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, preferred_community_id')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data; // role is 'RESIDENT' or 'ADMIN'
}
```

**Expected result:** one row. Use `role === 'ADMIN'` only to decide which UI to show; the database re-checks every admin action.
**RLS notes:** Residents can read only their own profile; admins can read all. A new user whose profile was not created would get `PGRST116` (should not occur because of the trigger).

Updating the profile (allowed columns only):

```js
export async function updateMyProfile({ fullName, preferredCommunityId }) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, preferred_community_id: preferredCommunityId })
    .eq('id', user.id)
    .select('id, full_name, preferred_community_id')
    .single();
  if (error) throw error;
  return data;
}
// Updating `role` fails with 42501 "permission denied" by design.
```

---

## 5. Fetch permitted communities

**Auth state:** signed in. Anonymous users get no community data.

```js
export async function getActiveCommunities() {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      id, name, community_type, latitude, longitude, verification_status, lga_id, ward_id,
      lgas ( id, name, states ( id, name ) )
    `)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data;
}
```

**Expected result:** only configured pilot communities. The explicit `.eq('is_active', true)` matters for admins, who can otherwise also see inactive rows.
**RLS notes:** Residents only ever receive `is_active = true` rows. The nested `lgas(... states(...))` selection uses the foreign keys `communities.lga_id -> lgas` and `lgas.state_id -> states`; verify the embed against your project (**Needs confirmation**, not executed here).
**Tips:** use `latitude`/`longitude` for maps. The `location`/`boundary` columns are PostGIS types and are not convenient JSON.

Geography lists (all authenticated users can read all rows, including inactive):

```js
const { data: states } = await supabase.from('states').select('id, name, code').order('name');
const { data: lgas }   = await supabase.from('lgas').select('id, name, state_id').eq('state_id', stateId).order('name');
```

---

## 6. Create a hazard report

**Auth state:** signed in as any resident (admins can also insert; policy requires `reporter_id = auth.uid()`).

```js
// category must be one of: FLOODING, RISING_WATER, BLOCKED_DRAINAGE, FLOODED_ROAD,
// DRAINAGE_DAMAGE, EROSION, OTHER
export async function createHazardReport({ communityId, category, description, latitude, longitude }) {
  const { data, error } = await supabase
    .from('hazard_reports')
    .insert({
      community_id: communityId,
      category,
      description,
      latitude: latitude ?? null,   // supply both or neither
      longitude: longitude ?? null,
    })
    .select('id, reference_code, status, category, community_id, created_at')
    .single();

  if (error) throw error;
  return data; // keep data.id for the image upload
}
```

**Expected result:** one row with `status: 'PENDING'`, a generated `reference_code` such as `FG-XXXXXXXXXX`, and the new `id` (the **report UUID** needed for uploads).
**Do not send** `reporter_id`, `status`, `reference_code`, `admin_note`, `reviewed_by`, `reviewed_at` - the BEFORE INSERT trigger sets/overwrites them.
**RLS notes:** The insert is rejected (`42501`, row-level security) if the community is inactive. Blank `description` -> `23514`; non-existent community -> `23503`; only one of latitude/longitude -> `23514`.

---

## 7. Upload a report image

**Auth state:** signed in as the report's owner. The report must already exist.

```js
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matches bucket limit
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function uploadReportImage({ reportId, file }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  if (!ALLOWED[file.type]) throw new Error('Only JPEG, PNG or WebP images are allowed');
  if (file.size > MAX_BYTES) throw new Error('Image must be 5 MB or smaller');

  // Required path: <user_uuid>/<hazard_report_uuid>/<filename>
  const path = `${user.id}/${reportId}/${crypto.randomUUID()}.${ALLOWED[file.type]}`;

  const { data, error } = await supabase.storage
    .from('report-images')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;
  return data.path; // same as `path`; store this value in hazard_reports.photo_path
}
```

**Expected result:** the object path string.
**RLS/Storage notes:** The upload is rejected unless the first folder is your own user id **and** the second folder is a report you own. `upsert: true` fails (there is no Storage UPDATE policy), so use unique filenames. Files over 5 MB or other MIME types are rejected by the bucket configuration. The bucket is private - never expect a public URL.

Display an image (owner or admin only):

```js
export async function getReportImageUrl(photoPath, expiresInSeconds = 60) {
  const { data, error } = await supabase.storage
    .from('report-images')
    .createSignedUrl(photoPath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
```
Other residents cannot create signed URLs for your images, including for verified reports (known limitation).

---

## 8. Attach the image path

**Auth state:** signed in as the report owner; the report must still be `PENDING`.

```js
export async function attachImageToReport({ reportId, photoPath }) {
  const { data, error } = await supabase
    .from('hazard_reports')
    .update({ photo_path: photoPath })
    .eq('id', reportId)
    .select('id, photo_path, status')
    .single();

  if (error) {
    // PGRST116 => no row was updated: report not yours, or no longer PENDING
    throw error;
  }
  return data;
}
```

**Expected result:** the updated row with `photo_path` set.
**RLS notes:** The owner-only policy allows updates only while `status = 'PENDING'`, and only the `photo_path` column is writable. Trying to change `description`, `category`, `status` etc. fails with `42501 permission denied`. If an admin reviewed the report first, the update matches zero rows (RLS hides the row from the update) - without `.single()` you would get an empty array and no error, so keep `.select().single()` or check the returned rows.
**Full flow:**

```js
const report = await createHazardReport({ communityId, category, description, latitude, longitude });
const path = await uploadReportImage({ reportId: report.id, file });
await attachImageToReport({ reportId: report.id, photoPath: path });
```
If the upload succeeds but the attach fails, an orphaned object remains in the user's folder; the owner may delete it (`supabase.storage.from('report-images').remove([path])`).

---

## 9. Fetch the user's permitted reports

**Auth state:** signed in.

My own reports (any status):

```js
export async function getMyReports() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('hazard_reports')
    .select('id, reference_code, category, description, status, admin_note, photo_path, community_id, created_at, reviewed_at')
    .eq('reporter_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
```

Verified community reports (other residents' reports that RLS allows):

```js
export async function getCommunityReports(communityId) {
  const { data, error } = await supabase
    .from('hazard_reports')
    .select('id, reference_code, category, description, status, community_id, created_at')
    .eq('community_id', communityId)
    .in('status', ['VERIFIED', 'IN_PROGRESS', 'RESOLVED'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
```

**Expected result:** arrays of rows. **RLS notes:** A resident calling `.from('hazard_reports').select()` with no filter receives own reports **plus** all verified/in-progress/resolved reports in active communities - always filter explicitly as above. Another resident's `PENDING` or `REJECTED` reports are never returned. Admins receive all reports. `admin_note` is the rejection reason when status is `REJECTED`.
**Privacy note:** RLS returns whole rows, so selecting `reporter_id`/coordinates for community reports exposes them; select only the columns the screen needs.

---

## 10. Fetch permitted alerts

**Auth state:** signed in.

```js
export async function getActiveAlerts(communityId) {
  let query = supabase
    .from('alerts')
    .select('id, title, message, severity, alert_type, community_id, expires_at, created_at')
    .order('created_at', { ascending: false });

  if (communityId) {
    // community-specific alerts plus alerts with no community
    query = query.or(`community_id.eq.${communityId},community_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

**Expected result:** non-expired alerts whose community (if any) is active. **RLS notes:** Residents cannot see expired alerts; admins can. Residents cannot create or edit alerts. Alert creation by admins is policy-allowed but its client write path **Needs confirmation** (only `SELECT` is explicitly granted); no admin-alert example is provided for that reason. Alerts are also not scoped to a preferred community unless you filter as above.

---

## 11. Read risk assessments

**Auth state:** signed in. Read-only for all clients.

```js
export async function getLatestRiskAssessment(communityId) {
  const { data, error } = await supabase
    .from('risk_assessments')
    .select(`
      id, community_id, risk_level, score, confidence, explanation,
      recommended_actions, data_available, limitations, inputs_used, inputs_missing,
      input_summary, data_freshness, methodology_version,
      explanation_source, explanation_provider, assessed_at
    `)
    .eq('community_id', communityId)
    .order('assessed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data; // null when no assessment exists yet
}
```

**Expected result:** the latest row or `null`. Handle `risk_level === 'UNAVAILABLE'` (score is `null`) and `confidence === 'INSUFFICIENT'` explicitly; do not present these as a safe/low risk.
**RLS notes:** Only assessments of active communities are visible (admins: all). Clients cannot insert, update or delete. **No risk writer or scoring engine is implemented yet**, so expect `null` for most communities until BE2 provides one. The structure of `input_summary` / `data_freshness` **Needs confirmation** with BE2.

---

## 12. Review a report (administrator)

**Auth state:** signed in as an `ADMIN`. A resident gets `42501` "Admin permission required".

List the review queue:

```js
export async function getPendingReports() {
  const { data, error } = await supabase
    .from('hazard_reports')
    .select('id, reference_code, category, description, photo_path, community_id, reporter_id, created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
```

Review via RPC (argument names are exactly `p_report_id`, `p_new_status`, `p_admin_note`):

```js
// newStatus: 'VERIFIED' | 'REJECTED' | 'IN_PROGRESS' | 'RESOLVED'
export async function reviewHazardReport({ reportId, newStatus, adminNote = null }) {
  const { data, error } = await supabase.rpc('review_hazard_report', {
    p_report_id: reportId,
    p_new_status: newStatus,
    p_admin_note: adminNote,
  });

  if (error) {
    // 42501 not admin | P0002 report not found | 22023 invalid transition / rejection reason required
    throw error;
  }
  return data; // the updated hazard_reports row
}

// Examples
await reviewHazardReport({ reportId, newStatus: 'VERIFIED' });
await reviewHazardReport({ reportId, newStatus: 'REJECTED', adminNote: 'Duplicate of FG-0AB9B3574B' });
```

**Allowed transitions:** `PENDING -> VERIFIED|REJECTED`; `VERIFIED -> VERIFIED|IN_PROGRESS|RESOLVED`; `IN_PROGRESS -> RESOLVED`. `REJECTED` and `RESOLVED` are final. A rejection requires a non-blank `adminNote`.
**Expected result:** the updated report (including `reviewed_by`, `reviewed_at`, `admin_note`). Direct `.update({ status })` calls are blocked by column privileges - always use the RPC.
**Audit history (admin only):**

```js
export async function getReportHistory(reportId) {
  const { data, error } = await supabase
    .from('report_status_history')
    .select('id, previous_status, new_status, changed_by, note, created_at')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
```
Residents calling this receive an empty result. Remember: no history row exists for creation, nor for a `VERIFIED -> VERIFIED` re-save.

---

## Appendix: proposed (not implemented)

These are suggestions only; none exists in the migration:
- Edge Function or narrowly scoped RPC for BE2 to insert `risk_assessments`.
- RPC or view for admins to create alerts with `created_by` forced to the caller.
- A view/RPC exposing only public-safe columns of verified reports.
- Server-signed URLs for photos of verified community reports.

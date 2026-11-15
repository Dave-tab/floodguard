# FloodGuard AI - Existing Development Test Data

> **DEVELOPMENT / TEST DATA ONLY.** Every record below exists in the development Supabase project for testing. None of them is a real verified flood incident, a real emergency warning, or a real resident. Do not present them to the public as real events, and do not copy them into a production database.
>
> This file documents records that already exist. It is **not** a seed script and cannot recreate the environment. To inspect the live records, use the read-only queries in [`database/seed/inspect_test_data.sql`](../database/seed/inspect_test_data.sql). No passwords, emails, tokens or keys are recorded here; credentials are held by the project owner.

Related: [TESTING_GUIDE.md](TESTING_GUIDE.md) | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

---

## Data integrity notice - Resident B UUID (Needs confirmation)

The Resident B UUID provided for this handoff is **not a valid UUID**:

```text
69127755-d8b3-4032-981a-cdd9eccffd098
                         ^ last group has 13 characters; a UUID's last group has 12
```

The brief supplied this same string twice (the second time as the "correct" value), so it appears to be a copy/paste error that was repeated. It has **not** been "fixed" here because guessing a replacement could silently point tests at the wrong account. Before using Resident B in any query or Postman variable, copy the real id from Supabase (Authentication -> Users, or `select id, role from public.profiles;`) and update this file. Until then, this guide writes it as `<RESIDENT_B_UUID>`.

Note: using the invalid value in a query filter would fail with Postgres error `invalid input syntax for type uuid`.

---

## Community

| Field | Value |
|---|---|
| Name | Bodija |
| State | Oyo |
| LGA | Ibadan North |
| Community UUID | `37463757-bb85-4887-99fc-f8062f1eff65` |
| `is_active` / `verification_status` | Not provided - **Needs confirmation** (reports and alerts for this community are only visible to residents when `is_active = true`). |

## Accounts

| Account | UUID | Role |
|---|---|---|
| Admin | `111eefb7-a2a5-4d38-a3d2-39b9273510fb` | `ADMIN` |
| Resident A | `6395d229-8d1e-4a65-818a-dd9eccffd098` | `RESIDENT` |
| Resident B | `<RESIDENT_B_UUID>` - supplied value invalid, see notice above | `RESIDENT` |

## Hazard reports

All three are test reports. Community for each is presumed to be Bodija but was not stated - **Needs confirmation**.

| Reporter | Report UUID | Reference | Category | Status |
|---|---|---|---|---|
| Resident A | `5307b7fa-e34d-47bf-9eb4-9a8f6b997060` | `FG-0AB9B3574B` | `BLOCKED_DRAINAGE` | `VERIFIED` |
| Resident B | `bee9ef3a-af09-49bf-a01e-d91a352a1e75` | `FG-5BBC30203A` | `FLOODED_ROAD` | `REJECTED` |
| Resident A | *(UUID not provided)* | `FG-982E82334C` | `EROSION` | `PENDING` |

Expected visibility with the current RLS (see [TESTING_GUIDE.md](TESTING_GUIDE.md) T05):

| Report | Resident A | Resident B | Admin | Anonymous |
|---|---|---|---|---|
| `FG-0AB9B3574B` (VERIFIED) | yes (owner) | yes (verified in an active community) | yes | no |
| `FG-5BBC30203A` (REJECTED) | no | yes (owner) | yes | no |
| `FG-982E82334C` (PENDING) | yes (owner) | no | yes | no |

Whether a rejection reason (`admin_note`), status-history rows, or photos exist for these records was not provided - use the inspection queries to check.

## Alert

| Field | Value |
|---|---|
| UUID | `4193ce55-7714-4b11-819e-d748f9b41497` |
| Title | Flood Risk Advisory - Bodija |
| Severity | `HIGH` |
| Type | `FLOOD_WARNING` |
| Community | Bodija |
| `created_by`, `expires_at`, message | Not provided - **Needs confirmation** (an expired alert is hidden from residents) |

This is a development advisory. It is not an official or real flood warning.

## Not provided

- No risk assessment record was provided for Bodija. None is documented here; check with the inspection queries.
- No shelters, aliases or community verification records were provided.

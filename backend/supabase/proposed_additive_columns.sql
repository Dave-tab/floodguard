-- PROPOSAL ONLY - not applied. Needs approval from the database owner (AGENTS.md: no
-- schema changes without approval). Purely additive: existing columns, data and the admin
-- dashboard's queries are unaffected. The API detects these columns at start-up and starts
-- filling them once they exist; until then the full assessment is kept in the server cache.
--
-- Why: risk_assessments currently has no place for the validity window, the contributing
-- factors or the missing inputs, which the contracts require to be stored
-- (IMPLEMENTATION_CONTRACTS.md 6.4: inputs_json, missing_inputs, provider) and which the
-- lead's brief requires for expiry (validUntil / nextReviewAt).

alter table public.risk_assessments
  add column if not exists summary          text,
  add column if not exists status           text,          -- active | updated | insufficient_data | expired
  add column if not exists valid_until      timestamptz,
  add column if not exists next_review_at   timestamptz,
  add column if not exists factors          jsonb,         -- engine drivers
  add column if not exists missing_inputs   jsonb,
  add column if not exists inputs_json      jsonb,         -- evidence with source, freshness, provenance
  add column if not exists method_version   text,
  add column if not exists confidence_score numeric,
  add column if not exists provider         text;

create index if not exists risk_assessments_community_assessed_idx
  on public.risk_assessments (community_id, assessed_at desc);

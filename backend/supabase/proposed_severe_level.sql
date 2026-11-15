-- PROPOSAL FOR THE DATABASE OWNER - not applied by the API, needs approval (AGENTS.md: no
-- schema changes without approval). Live schema checked 2026-11-15.
--
-- 1. The approved severity scale is low / high / severe / critical (lead's brief), but the
--    risk_level enum is LOW | MODERATE | HIGH | CRITICAL | UNAVAILABLE. Without SEVERE, a
--    severe assessment cannot be stored: the API refuses to relabel it (HIGH would understate,
--    CRITICAL overstate) and keeps it in its own cache only, logging a warning.
--    Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres.
alter type public.risk_level add value if not exists 'SEVERE';

-- 2. Expiry is required ("expired never becomes Low"). Today the API puts validUntil and
--    nextReviewAt inside input_summary; dedicated columns make them queryable/indexable.
alter table public.risk_assessments
  add column if not exists valid_until    timestamptz,
  add column if not exists next_review_at timestamptz;

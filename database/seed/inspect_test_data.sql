-- =============================================================================
-- FloodGuard AI - READ-ONLY inspection queries
-- =============================================================================
-- This is an INSPECTION script, NOT a seed script.
--   * It contains SELECT statements only. It inserts, updates and deletes nothing.
--   * It cannot recreate the development environment or its test records.
--   * Run it in the Supabase SQL Editor (which bypasses RLS) to see what exists.
--     Results therefore show ALL rows, not what a resident would see through the API.
-- Run one section at a time. Contains no secrets and no credentials.
-- Development test data is documented in docs/TEST_DATA.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Profiles and roles
-- -----------------------------------------------------------------------------
select id, full_name, role, preferred_community_id, created_at
from public.profiles
order by role, created_at;

-- Count of profiles per role
select role, count(*) as profiles
from public.profiles
group by role;


-- -----------------------------------------------------------------------------
-- 2. States, LGAs, wards and communities
-- -----------------------------------------------------------------------------
select
  c.id            as community_id,
  c.name          as community,
  c.community_type,
  c.is_active,
  c.verification_status,
  l.name          as lga,
  s.name          as state,
  w.name          as ward,
  c.latitude,
  c.longitude
from public.communities c
join public.lgas   l on l.id = c.lga_id
join public.states s on s.id = l.state_id
left join public.wards w on w.id = c.ward_id
order by s.name, l.name, c.name;

-- Geography row counts
select
  (select count(*) from public.states) as states,
  (select count(*) from public.lgas)   as lgas,
  (select count(*) from public.wards)  as wards,
  (select count(*) from public.communities) as communities,
  (select count(*) from public.communities where is_active) as active_communities;

-- Communities that are active but not VERIFIED (not prevented by the schema)
select id, name, is_active, verification_status
from public.communities
where is_active and verification_status <> 'VERIFIED';

-- Aliases, sources and verification history
select a.community_id, a.alias, a.language_code from public.community_aliases a order by a.community_id, a.alias;
select * from public.community_verifications order by created_at desc;
select id, name, publisher, dataset_name, dataset_version from public.geographic_sources order by name;


-- -----------------------------------------------------------------------------
-- 3. Hazard reports and statuses
-- -----------------------------------------------------------------------------
select
  r.id, r.reference_code, r.status, r.category,
  r.reporter_id, p.role as reporter_role,
  r.community_id, c.name as community,
  r.photo_path,
  r.admin_note, r.reviewed_by, r.reviewed_at,
  r.created_at
from public.hazard_reports r
join public.profiles p on p.id = r.reporter_id
join public.communities c on c.id = r.community_id
order by r.created_at desc;

-- Reports per status
select status, count(*) as reports
from public.hazard_reports
group by status
order by status;

-- Rejected reports without a reason (should be none if the RPC was used)
select id, reference_code, status, admin_note
from public.hazard_reports
where status = 'REJECTED' and (admin_note is null or trim(admin_note) = '');


-- -----------------------------------------------------------------------------
-- 4. Report status history
-- -----------------------------------------------------------------------------
select
  h.created_at, r.reference_code,
  h.previous_status, h.new_status, h.changed_by, h.note
from public.report_status_history h
join public.hazard_reports r on r.id = h.report_id
order by h.created_at desc;

-- History rows per report (expect one per status change)
select r.reference_code, r.status as current_status, count(h.id) as history_rows
from public.hazard_reports r
left join public.report_status_history h on h.report_id = r.id
group by r.reference_code, r.status
order by r.reference_code;


-- -----------------------------------------------------------------------------
-- 5. Alerts
-- -----------------------------------------------------------------------------
select
  a.id, a.title, a.severity, a.alert_type,
  a.community_id, c.name as community,
  a.created_by, a.expires_at,
  (a.expires_at is null or a.expires_at > now()) as currently_visible_to_residents,
  a.created_at
from public.alerts a
left join public.communities c on c.id = a.community_id
order by a.created_at desc;


-- -----------------------------------------------------------------------------
-- 6. Risk assessments
-- -----------------------------------------------------------------------------
select
  ra.id, c.name as community, ra.risk_level, ra.score, ra.confidence,
  ra.data_available, ra.methodology_version, ra.explanation_source, ra.assessed_at
from public.risk_assessments ra
join public.communities c on c.id = ra.community_id
order by ra.assessed_at desc;

-- Latest assessment per community
select distinct on (community_id)
  community_id, risk_level, score, confidence, assessed_at
from public.risk_assessments
order by community_id, assessed_at desc;


-- -----------------------------------------------------------------------------
-- 7. Storage bucket configuration and objects
-- -----------------------------------------------------------------------------
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'report-images';
-- Expected per the migration: public = false, file_size_limit = 5242880,
-- allowed_mime_types = {image/jpeg,image/png,image/webp}

-- Uploaded objects (path format: <user_uuid>/<report_uuid>/<filename>)
select name, bucket_id, owner, created_at
from storage.objects
where bucket_id = 'report-images'
order by created_at desc;

-- Reports whose photo_path does not match an existing object
select r.reference_code, r.photo_path
from public.hazard_reports r
where r.photo_path is not null
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'report-images' and o.name = r.photo_path
  );


-- -----------------------------------------------------------------------------
-- 8. Policy inspection (optional, read-only catalog queries)
-- -----------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where (schemaname = 'public')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Tables in public with RLS enabled (expect all 14 FloodGuard tables)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

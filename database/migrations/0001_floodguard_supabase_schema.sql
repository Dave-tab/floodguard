-- FloodGuard AI — Supabase foundation
-- Version: 001
-- Scope: BE1 database foundation aligned with the FloodGuard AI Team Task Assignment.
-- Apply in a Supabase SQL migration. Review the notes below before production use.
--
-- IMPORTANT:
-- 1. Nationwide geography can be imported, but only communities with is_active=true
--    should be offered as configured FloodGuard pilot communities.
-- 2. All geographic/risk/verified-hazard reads require authentication, per the team's
--    agreed login requirement. Anonymous users do not receive general community data.
-- 3. Never put the Supabase service-role key in frontend code.
-- 4. Admin accounts must be provisioned by a trusted operator; never expose public
--    admin registration or allow users to change their own role.
-- 5. Shelters are optional/P2. Do not seed unverified shelter locations.
--
-- Recommended storage upload path:
--   <auth-user-uuid>/<hazard-report-uuid>/<filename>
--
-- Risk assessments are append-only. BE2 should write them through a trusted
-- server-side service / Edge Function / narrowly scoped RPC, not a browser client.

begin;

-- ---------------------------------------------------------------------------
-- 0. Extensions and enums
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

do $$ begin
  create type public.app_role as enum ('RESIDENT', 'ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.community_verification_status as enum
    ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hazard_report_status as enum
    ('PENDING', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hazard_category as enum
    ('FLOODING', 'RISING_WATER', 'BLOCKED_DRAINAGE', 'FLOODED_ROAD',
     'DRAINAGE_DAMAGE', 'EROSION', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.risk_level as enum
    ('LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNAVAILABLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.risk_confidence as enum
    ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.alert_severity as enum ('INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.alert_type as enum
    ('FLOOD_WARNING', 'WEATHER_NOTICE', 'SAFETY_ADVISORY', 'COMMUNITY_NOTICE', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.explanation_source as enum ('AI', 'FALLBACK', 'NONE');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1. Geographic source registry and administrative hierarchy
-- ---------------------------------------------------------------------------

create table if not exists public.geographic_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  publisher text,
  dataset_name text not null,
  dataset_version text,
  source_url text,
  license_name text,
  license_url text,
  attribution_text text,
  accessed_at timestamptz,
  published_at date,
  last_updated_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint geographic_sources_name_dataset_unique unique (name, dataset_name, dataset_version)
);

create table if not exists public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  country_code char(2) not null default 'NG',
  source_id uuid references public.geographic_sources(id) on delete set null,
  source_record_id text,
  boundary extensions.geometry(MultiPolygon, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint states_country_name_unique unique (country_code, name),
  constraint states_source_record_unique unique (source_id, source_record_id)
);

create unique index if not exists states_country_code_unique
  on public.states(country_code, upper(code)) where code is not null;
create index if not exists states_boundary_gix on public.states using gist (boundary);

create table if not exists public.lgas (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states(id) on delete restrict,
  name text not null,
  code text,
  source_id uuid references public.geographic_sources(id) on delete set null,
  source_record_id text,
  boundary extensions.geometry(MultiPolygon, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lgas_id_state_unique unique (id, state_id),
  constraint lgas_state_name_unique unique (state_id, name),
  constraint lgas_source_record_unique unique (source_id, source_record_id)
);

create unique index if not exists lgas_state_code_unique
  on public.lgas(state_id, upper(code)) where code is not null;
create index if not exists lgas_state_id_idx on public.lgas(state_id);
create index if not exists lgas_boundary_gix on public.lgas using gist (boundary);

create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id) on delete restrict,
  name text not null,
  code text,
  source_id uuid references public.geographic_sources(id) on delete set null,
  source_record_id text,
  boundary extensions.geometry(MultiPolygon, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wards_id_lga_unique unique (id, lga_id),
  constraint wards_lga_name_unique unique (lga_id, name),
  constraint wards_source_record_unique unique (source_id, source_record_id)
);

create unique index if not exists wards_lga_code_unique
  on public.wards(lga_id, upper(code)) where code is not null;
create index if not exists wards_lga_id_idx on public.wards(lga_id);
create index if not exists wards_boundary_gix on public.wards using gist (boundary);

-- A community/settlement is not a ward. ward_id is nullable because some source
-- records cannot be reliably assigned to a ward. The composite FK prevents a
-- community's ward from belonging to a different LGA.
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id) on delete restrict,
  ward_id uuid,
  name text not null,
  community_type text,
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326),
  boundary extensions.geometry(MultiPolygon, 4326),
  verification_status public.community_verification_status not null default 'UNVERIFIED',
  verification_notes text,
  is_active boolean not null default false,
  source_id uuid references public.geographic_sources(id) on delete set null,
  source_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communities_ward_same_lga_fk
    foreign key (ward_id, lga_id) references public.wards(id, lga_id) on delete restrict,
  constraint communities_latitude_valid check (latitude is null or latitude between -90 and 90),
  constraint communities_longitude_valid check (longitude is null or longitude between -180 and 180),
  constraint communities_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint communities_source_record_unique unique (source_id, source_record_id)
);

create index if not exists communities_lga_id_idx on public.communities(lga_id);
create index if not exists communities_ward_id_idx on public.communities(ward_id);
create index if not exists communities_active_name_idx on public.communities(is_active, lower(name));
create index if not exists communities_location_gix on public.communities using gist (location);
create index if not exists communities_boundary_gix on public.communities using gist (boundary);

-- Synchronise the point geography from latitude/longitude on inserts/updates.
create or replace function public.sync_community_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := extensions.ST_SetSRID(
      extensions.ST_MakePoint(new.longitude, new.latitude), 4326
    )::extensions.geography;
  else
    new.location := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_community_location on public.communities;
create trigger trg_sync_community_location
before insert or update of latitude, longitude on public.communities
for each row execute function public.sync_community_location();

create table if not exists public.community_aliases (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  alias text not null,
  language_code text,
  source_id uuid references public.geographic_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint community_aliases_unique unique (community_id, alias)
);
create index if not exists community_aliases_alias_idx
  on public.community_aliases(lower(alias));

create table if not exists public.community_sources (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  source_id uuid not null references public.geographic_sources(id) on delete restrict,
  source_record_id text,
  source_name text,
  source_confidence text,
  imported_at timestamptz not null default now(),
  notes text,
  constraint community_sources_unique unique (community_id, source_id, source_record_id)
);

create table if not exists public.community_verifications (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  verification_status public.community_verification_status not null,
  source_id uuid references public.geographic_sources(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  evidence_url text,
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_verifications_community_idx
  on public.community_verifications(community_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Profiles and role helpers
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'RESIDENT',
  preferred_community_id uuid references public.communities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_preferred_community_idx
  on public.profiles(preferred_community_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'RESIDENT'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_floodguard on auth.users;
create trigger on_auth_user_created_floodguard
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_states_updated_at on public.states;
create trigger trg_states_updated_at before update on public.states
for each row execute function public.set_updated_at();

drop trigger if exists trg_lgas_updated_at on public.lgas;
create trigger trg_lgas_updated_at before update on public.lgas
for each row execute function public.set_updated_at();

drop trigger if exists trg_wards_updated_at on public.wards;
create trigger trg_wards_updated_at before update on public.wards
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Hazard reports, reference codes and review history
-- ---------------------------------------------------------------------------

create table if not exists public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  community_id uuid not null references public.communities(id) on delete restrict,
  category public.hazard_category not null,
  description text not null,
  photo_path text,
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326),
  status public.hazard_report_status not null default 'PENDING',
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hazard_reports_description_nonempty check (length(trim(description)) > 0),
  constraint hazard_reports_latitude_valid check (latitude is null or latitude between -90 and 90),
  constraint hazard_reports_longitude_valid check (longitude is null or longitude between -180 and 180),
  constraint hazard_reports_coordinates_pair check ((latitude is null) = (longitude is null))
);

create index if not exists hazard_reports_community_status_created_idx
  on public.hazard_reports(community_id, status, created_at desc);
create index if not exists hazard_reports_reporter_created_idx
  on public.hazard_reports(reporter_id, created_at desc);
create index if not exists hazard_reports_status_created_idx
  on public.hazard_reports(status, created_at desc);
create index if not exists hazard_reports_location_gix
  on public.hazard_reports using gist (location);

create or replace function public.generate_hazard_reference_code()
returns text
language plpgsql
as $$
begin
  return 'FG-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
end;
$$;

create or replace function public.prepare_hazard_report_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  new.reporter_id := auth.uid();
  new.status := 'PENDING';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.admin_note := null;

  if new.reference_code is null or trim(new.reference_code) = '' then
    new.reference_code := public.generate_hazard_reference_code();
  end if;

  if new.latitude is not null and new.longitude is not null then
    new.location := extensions.ST_SetSRID(
      extensions.ST_MakePoint(new.longitude, new.latitude), 4326
    )::extensions.geography;
  else
    new.location := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_prepare_hazard_report_insert on public.hazard_reports;
create trigger trg_prepare_hazard_report_insert
before insert on public.hazard_reports
for each row execute function public.prepare_hazard_report_insert();

create or replace function public.touch_hazard_report_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_hazard_report_updated_at on public.hazard_reports;
create trigger trg_hazard_report_updated_at before update on public.hazard_reports
for each row execute function public.touch_hazard_report_updated_at();

create table if not exists public.report_status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.hazard_reports(id) on delete cascade,
  previous_status public.hazard_report_status,
  new_status public.hazard_report_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists report_status_history_report_created_idx
  on public.report_status_history(report_id, created_at desc);

-- Correctly record old/new status using a dedicated transition function trigger.
-- This trigger captures every status change, including calls from the RPC above.
create or replace function public.audit_hazard_report_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.report_status_history
      (report_id, previous_status, new_status, changed_by, note)
    values
      (new.id, old.status, new.status, coalesce(new.reviewed_by, auth.uid()), new.admin_note);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_hazard_report_status on public.hazard_reports;
create trigger trg_audit_hazard_report_status
after update of status on public.hazard_reports
for each row execute function public.audit_hazard_report_status();

-- The RPC should be the only authenticated route for changing report status.
-- Remove the manual history insert in the RPC by replacing it with this version.
create or replace function public.review_hazard_report(
  p_report_id uuid,
  p_new_status public.hazard_report_status,
  p_admin_note text default null
)
returns public.hazard_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.hazard_reports;
  v_allowed boolean := false;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;

  select * into v_report from public.hazard_reports
  where id = p_report_id for update;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  v_allowed :=
    (v_report.status = 'PENDING' and p_new_status in ('VERIFIED', 'REJECTED'))
    or (v_report.status = 'VERIFIED' and p_new_status in ('VERIFIED', 'IN_PROGRESS', 'RESOLVED'))
    or (v_report.status = 'IN_PROGRESS' and p_new_status = 'RESOLVED');

  if not v_allowed then
    raise exception 'Invalid report status transition: % -> %', v_report.status, p_new_status
      using errcode = '22023';
  end if;

  if p_new_status = 'REJECTED' and nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  update public.hazard_reports
  set status = p_new_status,
      admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.review_hazard_report(uuid, public.hazard_report_status, text) from public;
grant execute on function public.review_hazard_report(uuid, public.hazard_report_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Risk assessment history (BE2 owns calculations; BE1 owns persistence)
-- ---------------------------------------------------------------------------

create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete restrict,
  risk_level public.risk_level not null default 'UNAVAILABLE',
  score numeric(5,2),
  confidence public.risk_confidence not null default 'INSUFFICIENT',
  explanation text,
  recommended_actions text[] not null default '{}',
  data_available boolean not null default false,
  limitations text[] not null default '{}',
  inputs_used text[] not null default '{}',
  inputs_missing text[] not null default '{}',
  input_summary jsonb not null default '{}'::jsonb,
  data_freshness jsonb not null default '{}'::jsonb,
  methodology_version text,
  explanation_source public.explanation_source not null default 'NONE',
  explanation_provider text,
  explanation_generated_at timestamptz,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint risk_assessment_score_range check (score is null or score between 0 and 100),
  constraint risk_unavailable_score_null check (risk_level <> 'UNAVAILABLE' or score is null),
  constraint risk_available_requires_score check (risk_level = 'UNAVAILABLE' or score is not null)
);

create index if not exists risk_assessments_community_assessed_idx
  on public.risk_assessments(community_id, assessed_at desc);
create index if not exists risk_assessments_level_assessed_idx
  on public.risk_assessments(risk_level, assessed_at desc);

-- Append-only guard: normal clients cannot update/delete; table grants and RLS
-- below reinforce this. Trusted BE2 server-side persistence can insert records.

-- ---------------------------------------------------------------------------
-- 5. Alerts and optional shelters
-- ---------------------------------------------------------------------------

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  severity public.alert_severity not null,
  alert_type public.alert_type not null default 'COMMUNITY_NOTICE',
  community_id uuid references public.communities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alerts_title_nonempty check (length(trim(title)) > 0),
  constraint alerts_message_nonempty check (length(trim(message)) > 0),
  constraint alerts_expiry_after_creation check (expires_at is null or expires_at > created_at)
);
create index if not exists alerts_community_expiry_created_idx
  on public.alerts(community_id, expires_at, created_at desc);
create index if not exists alerts_severity_created_idx
  on public.alerts(severity, created_at desc);

drop trigger if exists trg_alerts_updated_at on public.alerts;
create trigger trg_alerts_updated_at before update on public.alerts
for each row execute function public.set_updated_at();

-- Optional/P2 only. Populate this table only from reliable, verified shelter data.
create table if not exists public.shelters (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references public.communities(id) on delete set null,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326),
  verification_status public.community_verification_status not null default 'UNVERIFIED',
  source_id uuid references public.geographic_sources(id) on delete set null,
  source_record_id text,
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shelters_latitude_valid check (latitude is null or latitude between -90 and 90),
  constraint shelters_longitude_valid check (longitude is null or longitude between -180 and 180),
  constraint shelters_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint shelters_source_record_unique unique (source_id, source_record_id)
);
create index if not exists shelters_community_idx on public.shelters(community_id);
create index if not exists shelters_location_gix on public.shelters using gist (location);

create or replace function public.sync_shelter_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := extensions.ST_SetSRID(
      extensions.ST_MakePoint(new.longitude, new.latitude), 4326
    )::extensions.geography;
  else
    new.location := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_shelter_location on public.shelters;
create trigger trg_sync_shelter_location
before insert or update of latitude, longitude on public.shelters
for each row execute function public.sync_shelter_location();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.geographic_sources enable row level security;
alter table public.states enable row level security;
alter table public.lgas enable row level security;
alter table public.wards enable row level security;
alter table public.communities enable row level security;
alter table public.community_aliases enable row level security;
alter table public.community_sources enable row level security;
alter table public.community_verifications enable row level security;
alter table public.profiles enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.report_status_history enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.alerts enable row level security;
alter table public.shelters enable row level security;

-- Geography and community catalogue are authenticated-only, not anonymous.
drop policy if exists "Authenticated users read geographic sources" on public.geographic_sources;
create policy "Authenticated users read geographic sources"
on public.geographic_sources for select to authenticated using (true);

drop policy if exists "Authenticated users read states" on public.states;
create policy "Authenticated users read states"
on public.states for select to authenticated using (true);

drop policy if exists "Authenticated users read LGAs" on public.lgas;
create policy "Authenticated users read LGAs"
on public.lgas for select to authenticated using (true);

drop policy if exists "Authenticated users read wards" on public.wards;
create policy "Authenticated users read wards"
on public.wards for select to authenticated using (true);

drop policy if exists "Authenticated users read active communities" on public.communities;
create policy "Authenticated users read active communities"
on public.communities for select to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "Admins manage communities" on public.communities;
create policy "Admins manage communities"
on public.communities for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users read aliases for active communities" on public.community_aliases;
create policy "Authenticated users read aliases for active communities"
on public.community_aliases for select to authenticated
using (exists (
  select 1 from public.communities c
  where c.id = community_id and (c.is_active = true or public.is_admin())
));

drop policy if exists "Admins manage community aliases" on public.community_aliases;
create policy "Admins manage community aliases"
on public.community_aliases for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users read community sources for active communities" on public.community_sources;
create policy "Authenticated users read community sources for active communities"
on public.community_sources for select to authenticated
using (exists (
  select 1 from public.communities c
  where c.id = community_id and (c.is_active = true or public.is_admin())
));

drop policy if exists "Admins manage community sources" on public.community_sources;
create policy "Admins manage community sources"
on public.community_sources for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users read verification status for active communities" on public.community_verifications;
create policy "Authenticated users read verification status for active communities"
on public.community_verifications for select to authenticated
using (exists (
  select 1 from public.communities c
  where c.id = community_id and (c.is_active = true or public.is_admin())
));

drop policy if exists "Admins manage community verifications" on public.community_verifications;
create policy "Admins manage community verifications"
on public.community_verifications for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Profiles: residents read their own row; admins may read all. Role is not user-editable.
drop policy if exists "Users read own profile or admins read all" on public.profiles;
create policy "Users read own profile or admins read all"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Users update own profile or admins update profiles" on public.profiles;
create policy "Users update own profile or admins update profiles"
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Column privileges prevent residents from changing role/id through direct table updates.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, preferred_community_id) on public.profiles to authenticated;

-- Reports: residents create for themselves and read only their own plus verified/active
-- community hazards. Admins can read all. Residents cannot update reports.
drop policy if exists "Residents and admins read permitted reports" on public.hazard_reports;
create policy "Residents and admins read permitted reports"
on public.hazard_reports for select to authenticated
using (
  reporter_id = auth.uid()
  or public.is_admin()
  or (
    status in ('VERIFIED', 'IN_PROGRESS', 'RESOLVED')
    and exists (select 1 from public.communities c
                where c.id = community_id and c.is_active = true)
  )
);

drop policy if exists "Residents submit own pending reports" on public.hazard_reports;
create policy "Residents submit own pending reports"
on public.hazard_reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'PENDING'
  and reviewed_by is null
  and reviewed_at is null
  and admin_note is null
  and exists (select 1 from public.communities c
              where c.id = community_id and c.is_active = true)
);

drop policy if exists "Admins update reports" on public.hazard_reports;
create policy "Admins update reports"
on public.hazard_reports for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Clients cannot directly update report status or review fields. Use RPC.
-- A resident may attach the optional image path to their own pending report after
-- uploading the object. The narrow column grant and owner-only policy prevent edits
-- to category, description, reporter, community, status or review metadata.
revoke update on public.hazard_reports from anon, authenticated;
grant update (photo_path) on public.hazard_reports to authenticated;

drop policy if exists "Residents attach image to own pending report" on public.hazard_reports;
create policy "Residents attach image to own pending report"
on public.hazard_reports for update to authenticated
using (reporter_id = auth.uid() and status = 'PENDING')
with check (reporter_id = auth.uid() and status = 'PENDING');

drop policy if exists "Admins read report status history" on public.report_status_history;
create policy "Admins read report status history"
on public.report_status_history for select to authenticated
using (public.is_admin());

-- BE2 writes through trusted server-side credentials / controlled RPC only.
drop policy if exists "Residents read risk assessments" on public.risk_assessments;
create policy "Residents read risk assessments"
on public.risk_assessments for select to authenticated
using (
  exists (select 1 from public.communities c
          where c.id = community_id and c.is_active = true)
  or public.is_admin()
);

-- No authenticated insert/update/delete policies for risk assessments.
-- Service-role/server-side writes bypass RLS. Never expose service_role to clients.

drop policy if exists "Authenticated users read active alerts" on public.alerts;
create policy "Authenticated users read active alerts"
on public.alerts for select to authenticated
using (
  (expires_at is null or expires_at > now())
  and (community_id is null or exists (
    select 1 from public.communities c
    where c.id = community_id and c.is_active = true
  ))
);

drop policy if exists "Admins manage alerts" on public.alerts;
create policy "Admins manage alerts"
on public.alerts for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users read verified active shelters" on public.shelters;
create policy "Authenticated users read verified active shelters"
on public.shelters for select to authenticated
using (is_active = true and verification_status = 'VERIFIED');

drop policy if exists "Admins manage shelters" on public.shelters;
create policy "Admins manage shelters"
on public.shelters for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Grants for Supabase API roles
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.geographic_sources, public.states, public.lgas, public.wards to authenticated;
grant select on public.communities, public.community_aliases,
  public.community_sources, public.community_verifications to authenticated;
grant select on public.profiles to authenticated;
grant insert on public.hazard_reports to authenticated;
grant select on public.hazard_reports to authenticated;
grant select on public.report_status_history to authenticated;
grant select on public.risk_assessments to authenticated;
grant select on public.alerts to authenticated;
grant select on public.shelters to authenticated;

-- Admin provisioning example (run manually in SQL editor after the user signs up):
-- update public.profiles
-- set role = 'ADMIN'
-- where id = '<AUTH_USER_UUID>';

-- ---------------------------------------------------------------------------
-- 8. Private Storage bucket and object policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-images',
  'report-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Residents upload images for own reports" on storage.objects;
create policy "Residents upload images for own reports"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.hazard_reports r
    where r.id::text = (storage.foldername(name))[2]
      and r.reporter_id = auth.uid()
  )
);

drop policy if exists "Owners and admins read report images" on storage.objects;
create policy "Owners and admins read report images"
on storage.objects for select to authenticated
using (
  bucket_id = 'report-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "Owners and admins delete report images" on storage.objects;
create policy "Owners and admins delete report images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

commit;

-- ---------------------------------------------------------------------------
-- 9. Post-migration checklist (run/test separately)
-- ---------------------------------------------------------------------------
-- [ ] Enable/configure the required Supabase Auth provider.
-- [ ] Create admin users by trusted provisioning only.
-- [ ] Import source registry rows before importing geographic records.
-- [ ] Import states, then LGAs, then wards, then communities.
-- [ ] Keep imported nationwide communities is_active=false until selected for
--     the configured pilot and their coordinates/data have been checked.
-- [ ] Verify every community's LGA/ward relationship; ward_id may be NULL.
-- [ ] Insert 2–3 configured pilot communities and clearly labelled demo reports.
-- [ ] Coordinate risk JSON shape, enums and write mechanism with BE2 before freeze.
-- [ ] Test RLS with anonymous, resident A, resident B and admin accounts.
-- [ ] Test report lifecycle, image ownership, private bucket and invalid transitions.
-- [ ] Confirm report status history trigger creates exactly one history row per change.
-- [ ] Test state/LGA point-in-polygon matching against known sample coordinates.
--
-- NOTE: For authenticated-only geographic reads, do not add anon SELECT policies.
-- NOTE: Public confirmed-hazard wording in the source document is overridden by the
-- team's explicit agreement that residents must log in before accessing general
-- reports and risk information.

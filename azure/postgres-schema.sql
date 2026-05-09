create extension if not exists pg_trgm;

create table if not exists public.clusters (
  hub_name text,
  cluster text,
  "Region_gen" text,
  "dock_#" text,
  backlogs integer not null default 0 check (backlogs >= 0),
  backlogs_ts timestamptz,
  check (coalesce(nullif(cluster, ''), nullif(hub_name, '')) is not null)
);

create table if not exists public.users (
  name text not null,
  ops_id text unique,
  email text unique,
  role text not null check (role in ('OPS_PIC', 'FTE_OPS', 'FTE_MM')),
  "is active" boolean not null default true,
  update_as_of timestamptz not null default now()
);

alter table public.clusters add column if not exists hub_name text;
alter table public.clusters add column if not exists cluster text;
alter table public.clusters add column if not exists "Region_gen" text;
alter table public.clusters add column if not exists "dock_#" text;
alter table public.clusters add column if not exists backlogs integer not null default 0;
alter table public.clusters add column if not exists backlogs_ts timestamptz;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clusters_backlogs_nonnegative'
      and conrelid = 'public.clusters'::regclass
  ) then
    alter table public.clusters
      add constraint clusters_backlogs_nonnegative check (backlogs >= 0) not valid;
  end if;
end;
$$;
alter table public.clusters validate constraint clusters_backlogs_nonnegative;

alter table public.users add column if not exists "is active" boolean not null default true;
alter table public.users add column if not exists update_as_of timestamptz not null default now();

create table if not exists public.requests (
  id text primary key,
  request_time timestamptz not null default now(),
  hub_cluster text not null,
  region text not null,
  dock_number text not null,
  backlogs integer not null default 0,
  lh_type text not null check (lh_type in ('6W', '10W', '6WF', '4WCV')),
  ops_pic_name text not null,
  ops_pic_id text not null,
  status text not null default 'PENDING_OPS' check (
    status in ('PENDING_OPS', 'APPROVED', 'REJECTED_OPS', 'PENDING_MM', 'CONFIRMED', 'REJECTED_MM')
  ),
  fte_ops_name text,
  fte_ops_timestamp timestamptz,
  fte_ops_remarks text,
  plate_number text,
  fte_mm_name text,
  fte_mm_timestamp timestamptz,
  fte_mm_remarks text,
  lh_trip text,
  is_docked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_events (
  id text primary key,
  event_type text not null,
  request_id text not null references public.requests(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_request_time_idx on public.requests (request_time desc);
create index if not exists idx_requests_status_request_time on public.requests (status, request_time desc);
create index if not exists idx_requests_ops_pic_id_request_time on public.requests (ops_pic_id, request_time desc);
create index if not exists idx_requests_plate_number on public.requests (plate_number);
create index if not exists idx_requests_plate_number_trgm on public.requests using gin (plate_number gin_trgm_ops);
create index if not exists idx_requests_hub_cluster_request_time on public.requests (hub_cluster, request_time desc);
create index if not exists idx_requests_hub_cluster_trgm on public.requests using gin (hub_cluster gin_trgm_ops);
create index if not exists idx_requests_id_trgm on public.requests using gin (id gin_trgm_ops);
create index if not exists idx_requests_region_request_time on public.requests (region, request_time desc);
create index if not exists clusters_hub_name_idx on public.clusters (hub_name);
create index if not exists clusters_cluster_idx on public.clusters (cluster);
create index if not exists clusters_region_gen_idx on public.clusters ("Region_gen");
create index if not exists clusters_backlogs_ts_idx on public.clusters (backlogs_ts desc);
create index if not exists users_is_active_idx on public.users ("is active");
create unique index if not exists users_ops_id_unique_idx on public.users (ops_id) where ops_id is not null;
create unique index if not exists users_email_unique_idx on public.users (email) where email is not null;
create index if not exists idx_request_events_request_id_occurred_at on public.request_events (request_id, occurred_at desc);
create index if not exists idx_request_events_processed_at_occurred_at on public.request_events (processed_at, occurred_at asc);
create index if not exists idx_request_events_occurred_at_id on public.request_events (occurred_at asc, id asc);
create index if not exists request_events_processed_at_idx on public.request_events (processed_at) where processed_at is null;

create or replace function public.set_user_update_as_of()
returns trigger
language plpgsql
as $$
begin
  new.update_as_of = now();
  return new;
end;
$$;

drop trigger if exists set_clusters_updated_at on public.clusters;
drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_user_update_as_of();

create or replace function public.set_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_requests_updated_at on public.requests;
create trigger set_requests_updated_at
before update on public.requests
for each row execute function public.set_request_updated_at();

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.clusters (
  id text primary key,
  name text not null,
  region text not null default 'Unknown',
  column_d text,
  column_e text,
  column_f text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

alter table public.clusters add column if not exists column_d text;
alter table public.clusters add column if not exists column_e text;
alter table public.clusters add column if not exists column_f text;

create table if not exists public.users (
  id text primary key,
  name text not null,
  ops_id text unique,
  email text unique,
  role text not null check (role in ('OPS_PIC', 'FTE_OPS', 'FTE_MM')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create index if not exists requests_status_request_time_idx on public.requests (status, request_time desc);
create index if not exists requests_ops_pic_id_request_time_idx on public.requests (ops_pic_id, request_time desc);
create index if not exists requests_plate_number_trgm_idx on public.requests using gin (plate_number gin_trgm_ops);
create index if not exists clusters_name_idx on public.clusters (name);
create index if not exists request_events_request_id_occurred_at_idx on public.request_events (request_id, occurred_at desc);
create index if not exists request_events_processed_at_idx on public.request_events (processed_at) where processed_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clusters_updated_at on public.clusters;
create trigger set_clusters_updated_at
before update on public.clusters
for each row execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_requests_updated_at on public.requests;
create trigger set_requests_updated_at
before update on public.requests
for each row execute function public.set_updated_at();

alter table public.clusters enable row level security;
alter table public.users enable row level security;
alter table public.requests enable row level security;
alter table public.request_events enable row level security;

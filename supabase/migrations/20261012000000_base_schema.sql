-- ============================================================================
-- Conquista Cálculo · Esquema base (migración 0)
-- Idempotente. Se ejecuta ANTES de 20261013000000_hardening_y_rpcs.sql.
--
-- Reproduce el esquema original del proyecto (tal como lo reconstruía
-- tests/sql/helpers/db.ts): las tablas rooms, teams, progress, attempts,
-- answers y room_secrets, con sus índices únicos y el índice de apoyo
-- rooms(created_at). A diferencia del original, rooms.status nace con
-- default 'lobby' (antes era 'active'; la migración 1 convergía a 'lobby').
--
-- Incluye la creación idempotente de los roles anon/authenticated para poder
-- ejecutar el bundle completo sobre un Postgres limpio (en Supabase ya existen
-- y este bloque no hace nada). No crea la publicación supabase_realtime: la
-- gestiona la migración 1.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles de Supabase (idempotente)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby',
  started_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  host_team_id uuid,
  current_step int4 not null default 0
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone text not null,
  status text not null default 'available',
  errors int not null default 0,
  conquered_at timestamptz,
  current_step int not null default 0,
  room_id uuid references public.rooms(id) on delete cascade
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone text not null,
  step int not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  room_id uuid references public.rooms(id) on delete cascade,
  response_index int
);

create table if not exists public.answers (
  zone text not null,
  step int not null,
  answer int not null,
  primary key (zone, step)
);

create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  host_token text not null
);

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
create unique index if not exists teams_room_name_uq on public.teams (room_id, lower(name));
create unique index if not exists progress_team_zone_uq on public.progress (team_id, zone);
create index if not exists rooms_created_at_idx on public.rooms (created_at);

-- ----------------------------------------------------------------------------
-- Permisos por defecto (los estrecha la migración 1)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

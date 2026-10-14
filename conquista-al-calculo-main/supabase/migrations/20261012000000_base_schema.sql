-- ============================================================================
-- Conquista Cálculo · Migración 0: esquema base
-- Ejecutar ANTES de 20261013000000_hardening_y_rpcs.sql.
--
-- Las migraciones siguientes asumen que estas tablas ya existen. Esta migración
-- las crea si faltan. Es segura en proyectos existentes: todo es
-- "create table if not exists", así que no toca tablas ya creadas.
-- (Las columnas teams.left_at, room_codes y team_secrets las añaden las
-- migraciones 1 y 2; los índices únicos y políticas RLS, la migración 1.)
-- ============================================================================

create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  status       text not null default 'lobby',
  started_at   timestamptz,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  host_team_id uuid,
  current_step int4 not null default 0
);

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text not null,
  color       text not null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.progress (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  zone         text not null,
  status       text not null default 'available',
  errors       int not null default 0,
  conquered_at timestamptz,
  current_step int not null default 0,
  room_id      uuid references public.rooms(id) on delete cascade
);

create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  zone           text not null,
  step           int not null,
  correct        boolean not null,
  created_at     timestamptz not null default now(),
  room_id        uuid references public.rooms(id) on delete cascade,
  response_index int
);

create table if not exists public.answers (
  zone   text not null,
  step   int not null,
  answer int not null,
  primary key (zone, step)
);

create table if not exists public.room_secrets (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  host_token text not null
);

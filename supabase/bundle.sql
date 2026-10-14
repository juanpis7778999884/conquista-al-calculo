-- ===========================================================================
-- Conquista Cálculo · bundle.sql (GENERADO, no editar a mano).
-- Regenerar con: pnpm sql:bundle
--
-- Orden de ejecución: base → hardening → ronda2 → ronda2_fase_c → ronda3.
-- Ejecuta SIEMPRE este archivo completo; nunca una migración suelta.
-- ===========================================================================

-- >>> 20261012000000_base_schema.sql >>>
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

-- >>> 20261013000000_hardening_y_rpcs.sql >>>
-- ============================================================================
-- Conquista Cálculo · Migración de endurecimiento + RPCs
-- Idempotente: se puede ejecutar varias veces sin errores.
--
-- Qué hace:
--   1. Saneamiento de datos y validación de constraints.
--   2. RLS: anon solo puede leer rooms/teams/progress. Se revocan escrituras.
--   3. Crea team_secrets (tokens de equipo) con RLS activo y sin políticas.
--   4. Añade llaves foráneas con on delete cascade (si faltan).
--   5. Índices de apoyo.
--   6. Funciones RPC (security definer) con tokens.
--   7. cleanup_old_rooms().
--
-- Ejecutar en el SQL Editor de Supabase ANTES de supabase/seed_answers.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Saneamiento
-- ----------------------------------------------------------------------------
update rooms set status = 'playing' where status = 'active';

-- Limpieza de duplicados que impedirían los índices únicos.
-- rooms.code
delete from rooms r
where exists (
  select 1 from rooms r2
  where r2.code = r.code
    and (
      r2.created_at < r.created_at
      or (r2.created_at = r.created_at and r2.ctid < r.ctid)
    )
);

-- teams(room_id, lower(name))
delete from teams t
where exists (
  select 1 from teams t2
  where t2.room_id = t.room_id
    and lower(t2.name) = lower(t.name)
    and (
      t2.created_at < t.created_at
      or (t2.created_at = t.created_at and t2.ctid < t.ctid)
    )
);

-- progress(team_id, zone)
delete from progress p
where exists (
  select 1 from progress p2
  where p2.team_id = p.team_id
    and p2.zone = p.zone
    and p2.ctid < p.ctid
);

-- Validar constraints que quedaron como NOT VALID.
alter table rooms drop constraint if exists rooms_status_check;
alter table rooms
  add constraint rooms_status_check
  check (status in ('lobby', 'playing', 'finished')) not valid;
alter table rooms validate constraint rooms_status_check;

alter table progress drop constraint if exists progress_status_check;
alter table progress
  add constraint progress_status_check
  check (status in ('available', 'in_progress', 'conquered')) not valid;
alter table progress validate constraint progress_status_check;

-- ----------------------------------------------------------------------------
-- 2. RLS y permisos
-- ----------------------------------------------------------------------------
alter table answers    enable row level security;
alter table attempts   enable row level security;
alter table room_secrets enable row level security;
alter table rooms      enable row level security;
alter table teams      enable row level security;
alter table progress   enable row level security;

-- Reafirmar las políticas de lectura públicas para anon (idempotentes).
drop policy if exists "leer salas"    on rooms;
drop policy if exists "leer equipos"  on teams;
drop policy if exists "leer progreso" on progress;
create policy "leer salas"    on rooms    for select to anon using (true);
create policy "leer equipos"  on teams    for select to anon using (true);
create policy "leer progreso" on progress for select to anon using (true);

-- anon/authenticated solo leen. Toda escritura pasa por RPC security definer.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. team_secrets
-- ----------------------------------------------------------------------------
create table if not exists public.team_secrets (
  team_id uuid primary key references public.teams(id) on delete cascade,
  token   text not null
);
alter table public.team_secrets enable row level security;
-- Sin políticas: nadie vía API puede leerla ni escribirla.
revoke all on public.team_secrets from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Llaves foráneas con on delete cascade (solo si faltan)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'teams'
      and kcu.column_name = 'room_id'
  ) then
    alter table public.teams
      add constraint teams_room_id_fkey
      foreign key (room_id) references public.rooms(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'progress'
      and kcu.column_name = 'team_id'
  ) then
    alter table public.progress
      add constraint progress_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'progress'
      and kcu.column_name = 'room_id'
  ) then
    alter table public.progress
      add constraint progress_room_id_fkey
      foreign key (room_id) references public.rooms(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'attempts'
      and kcu.column_name = 'team_id'
  ) then
    alter table public.attempts
      add constraint attempts_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'attempts'
      and kcu.column_name = 'room_id'
  ) then
    alter table public.attempts
      add constraint attempts_room_id_fkey
      foreign key (room_id) references public.rooms(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from information_schema.key_column_usage kcu
    join information_schema.table_constraints tc
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and kcu.table_name = 'rooms'
      and kcu.column_name = 'host_team_id'
  ) then
    alter table public.rooms
      add constraint rooms_host_team_id_fkey
      foreign key (host_team_id) references public.teams(id) on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Índices
-- ----------------------------------------------------------------------------
create unique index if not exists rooms_code_uq         on public.rooms (code);
create unique index if not exists teams_room_name_uq    on public.teams (room_id, lower(name));
create unique index if not exists progress_team_zone_uq on public.progress (team_id, zone);

create index if not exists progress_room_id_idx     on public.progress (room_id);
create index if not exists attempts_team_id_idx     on public.attempts (team_id);
create index if not exists attempts_room_id_idx     on public.attempts (room_id);
create index if not exists teams_room_created_idx   on public.teams (room_id, created_at);

-- ----------------------------------------------------------------------------
-- 6. Funciones RPC
-- ----------------------------------------------------------------------------

-- Firma antigua (nunca aplicada en producción, pero por si acaso).
drop function if exists public.submit_answer(uuid, uuid, text, int, int);
drop function if exists public.submit_answer(uuid, uuid, text, text, int, int);

-- create_room: crea sala + equipo anfitrión + tokens.
create or replace function public.create_room(p_team_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id      uuid;
  v_team_id      uuid;
  v_code         text;
  v_host_token   text;
  v_team_token   text;
  v_color        text;
  v_name         text;
  v_alphabet     text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_palette      text[] := array[
    '#e87852', '#63b6a2', '#d7ad54', '#9a80c5',
    '#5aa9d6', '#c96a8a', '#8fbf5a', '#b98a5a'
  ];
  v_attempt      int := 0;
  v_i            int;
begin
  v_name := btrim(regexp_replace(coalesce(p_team_name, ''), '\s+', ' ', 'g'));
  if length(v_name) = 0 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if length(v_name) > 24 then
    v_name := left(v_name, 24);
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into rooms (code, status, created_at)
      values (v_code, 'lobby', now())
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'codigo_agotado' using errcode = 'P0001';
      end if;
    end;
  end loop;

  v_color := v_palette[1];

  insert into teams (room_id, name, color, created_at)
  values (v_room_id, v_name, v_color, now())
  returning id into v_team_id;

  v_host_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_team_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into room_secrets (room_id, host_token) values (v_room_id, v_host_token);
  insert into team_secrets (team_id, token) values (v_team_id, v_team_token);

  update rooms set host_team_id = v_team_id where id = v_room_id;

  return json_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'team_id', v_team_id,
    'team_token', v_team_token,
    'host_token', v_host_token,
    'color', v_color,
    'server_now', now()
  );
end;
$$;

-- join_room: equipo anónimo se une a una sala en lobby.
create or replace function public.join_room(p_code text, p_team_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        rooms%rowtype;
  v_code        text;
  v_name        text;
  v_count       int;
  v_team_id     uuid;
  v_team_token  text;
  v_used        text[];
  v_color       text;
  v_palette     text[] := array[
    '#e87852', '#63b6a2', '#d7ad54', '#9a80c5',
    '#5aa9d6', '#c96a8a', '#8fbf5a', '#b98a5a'
  ];
begin
  v_name := btrim(regexp_replace(coalesce(p_team_name, ''), '\s+', ' ', 'g'));
  if length(v_name) = 0 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if length(v_name) > 24 then
    v_name := left(v_name, 24);
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if length(v_code) = 0 then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where code = v_code;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'sala_no_lobby' using errcode = 'P0001';
  end if;

  select count(*) into v_count from teams where room_id = v_room.id;
  if v_count >= 8 then
    raise exception 'sala_llena' using errcode = 'P0001';
  end if;

  if exists (select 1 from teams where room_id = v_room.id and lower(name) = lower(v_name)) then
    raise exception 'nombre_repetido' using errcode = 'P0001';
  end if;

  v_used := array(select color from teams where room_id = v_room.id);
  select c into v_color from unnest(v_palette) as c where not (c = any(v_used)) limit 1;
  if v_color is null then
    v_color := v_palette[1 + (v_count % array_length(v_palette, 1))];
  end if;

  insert into teams (room_id, name, color, created_at)
  values (v_room.id, v_name, v_color, now())
  returning id into v_team_id;

  v_team_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into team_secrets (team_id, token) values (v_team_id, v_team_token);

  return json_build_object(
    'room_id', v_room.id,
    'code', v_room.code,
    'team_id', v_team_id,
    'team_token', v_team_token,
    'color', v_color,
    'server_now', now()
  );
end;
$$;

-- rejoin: reanudar sesión con token en cualquier estado.
create or replace function public.rejoin(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
  v_room rooms%rowtype;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select * into v_team from teams where id = p_team_id and room_id = p_room_id;
  if not found then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  return json_build_object(
    'team_id', v_team.id,
    'room_id', v_room.id,
    'code', v_room.code,
    'status', v_room.status,
    'color', v_team.color,
    'name', v_team.name,
    'started_at', v_room.started_at,
    'finished_at', v_room.finished_at,
    'host_team_id', v_room.host_team_id,
    'server_now', now()
  );
end;
$$;

-- start_game: solo anfitrión, de lobby a playing, crea progress de 7 zonas.
create or replace function public.start_game(p_room_id uuid, p_host_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    rooms%rowtype;
  v_count   int;
  v_zones   int;
  v_started timestamptz;
begin
  if p_room_id is null or p_host_token is null then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from room_secrets where room_id = p_room_id and host_token = p_host_token) then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  select count(*) into v_count from teams where room_id = p_room_id;
  if v_count < 1 then
    raise exception 'pocos_equipos' using errcode = 'P0001';
  end if;

  select count(distinct zone) into v_zones from answers;
  if v_zones = 0 then
    raise exception 'sin_preguntas' using errcode = 'P0001';
  end if;

  update rooms set status = 'playing', started_at = now() where id = p_room_id
  returning started_at into v_started;

  insert into progress (team_id, room_id, zone, status, errors, current_step)
  select t.id, t.room_id, z.zone, 'available', 0, 0
  from teams t
  cross join (select distinct zone from answers) z
  where t.room_id = p_room_id
  on conflict (team_id, zone) do nothing;

  return json_build_object('status', 'playing', 'started_at', v_started, 'server_now', now());
end;
$$;

-- submit_answer: valida token, paso, zona, enfriamiento; registra intento.
create or replace function public.submit_answer(
  p_room_id uuid,
  p_team_id uuid,
  p_team_token text,
  p_zone text,
  p_step int,
  p_response int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room           rooms%rowtype;
  v_progress       progress%rowtype;
  v_answer         int;
  v_correct        bool;
  v_last_attempt   timestamptz;
  v_total_zones    int;
  v_conquered      int;
  v_team_finished  timestamptz;
  v_team_count     int;
  v_team_done      int;
  v_room_finished  boolean;
  v_has_next       boolean;
begin
  if p_room_id is null or p_team_id is null or p_zone is null
     or p_step is null or p_response is null or p_team_token is null then
    raise exception 'datos_invalidos' using errcode = 'P0001';
  end if;
  if p_step < 0 then
    raise exception 'paso_invalido:0' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from teams where id = p_team_id and room_id = p_room_id) then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from answers where zone = p_zone) then
    raise exception 'zona_invalida' using errcode = 'P0001';
  end if;

  select * into v_progress
  from progress
  where team_id = p_team_id and zone = p_zone
  for update;

  if not found then
    raise exception 'progreso_no_existe' using errcode = 'P0001';
  end if;
  if v_progress.status = 'conquered' then
    raise exception 'zona_conquistada' using errcode = 'P0001';
  end if;
  if p_step <> v_progress.current_step then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  select max(created_at) into v_last_attempt from attempts where team_id = p_team_id;
  if v_last_attempt is not null and now() - v_last_attempt < interval '1 second' then
    raise exception 'enfriamiento' using errcode = 'P0001';
  end if;

  select answer into v_answer from answers where zone = p_zone and step = p_step;
  if not found then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  v_correct := (v_answer = p_response);

  insert into attempts (team_id, zone, step, correct, created_at, room_id, response_index)
  values (p_team_id, p_zone, p_step, v_correct, now(), p_room_id, p_response);

  if v_correct then
    select exists (select 1 from answers where zone = p_zone and step > p_step) into v_has_next;
    if v_has_next then
      update progress
      set current_step = p_step + 1
      where team_id = p_team_id and zone = p_zone;
    else
      update progress
      set status = 'conquered', conquered_at = now(), current_step = 0
      where team_id = p_team_id and zone = p_zone;
    end if;
  else
    update progress
    set errors = errors + 1
    where team_id = p_team_id and zone = p_zone;
  end if;

  select * into v_progress from progress where team_id = p_team_id and zone = p_zone;

  -- ¿Terminó el equipo con las 7 zonas?
  select count(distinct zone) into v_total_zones from answers;
  select count(*) into v_conquered
  from progress
  where team_id = p_team_id and status = 'conquered';

  if v_conquered >= v_total_zones then
    update teams set finished_at = coalesce(finished_at, now()) where id = p_team_id;
  end if;

  select finished_at into v_team_finished from teams where id = p_team_id;

  -- ¿Terminó la sala (todos los equipos)?
  select count(*) into v_team_count from teams where room_id = p_room_id;
  select count(*) into v_team_done
  from teams
  where room_id = p_room_id and finished_at is not null;

  if v_team_count > 0 and v_team_done >= v_team_count then
    update rooms
    set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = p_room_id;
  end if;

  select (status = 'finished') into v_room_finished from rooms where id = p_room_id;

  return json_build_object(
    'correct', v_correct,
    'errors', v_progress.errors,
    'current_step', v_progress.current_step,
    'zone_status', v_progress.status,
    'team_finished', v_team_finished is not null,
    'room_finished', coalesce(v_room_finished, false)
  );
end;
$$;

-- finish_game: solo anfitrión cierra la sala.
create or replace function public.finish_game(p_room_id uuid, p_host_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  if p_room_id is null or p_host_token is null then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from room_secrets where room_id = p_room_id and host_token = p_host_token) then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  update rooms
  set status = 'finished', finished_at = coalesce(finished_at, now())
  where id = p_room_id;

  return json_build_object('status', 'finished', 'server_now', now());
end;
$$;

-- cleanup_old_rooms: borra salas con más de 24 h. No se programa aquí.
create or replace function public.cleanup_old_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from rooms where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ----------------------------------------------------------------------------
-- Permisos de ejecución de RPCs
-- ----------------------------------------------------------------------------
revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.rejoin(uuid, uuid, text) from public;
revoke all on function public.start_game(uuid, text) from public;
revoke all on function public.submit_answer(uuid, uuid, text, text, int, int) from public;
revoke all on function public.finish_game(uuid, text) from public;
revoke all on function public.cleanup_old_rooms() from public;

grant execute on function public.create_room(text) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.rejoin(uuid, uuid, text) to anon, authenticated;
grant execute on function public.start_game(uuid, text) to anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, text, int, int) to anon, authenticated;
grant execute on function public.finish_game(uuid, text) to anon, authenticated;
-- cleanup_old_rooms NO se otorga a anon: se ejecuta con pg_cron o service_role.

-- ----------------------------------------------------------------------------
-- Realtime: asegurar publicación de rooms, teams y progress.
-- (Si ya están, estos bloques no hacen nada.)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
    ) then
      alter publication supabase_realtime add table public.rooms;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams'
    ) then
      alter publication supabase_realtime add table public.teams;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress'
    ) then
      alter publication supabase_realtime add table public.progress;
    end if;
  end if;
end $$;

-- >>> 20261013010000_ronda2.sql >>>
-- ============================================================================
-- Conquista Cálculo · Ronda 2 (Fase A)
-- Idempotente: se puede ejecutar varias veces sin errores.
--
-- NO modifica la migración anterior (20261013000000_hardening_y_rpcs.sql), que
-- ya se ejecutó en producción. Todo lo nuevo va aquí.
--
-- Qué hace:
--   1. Default de rooms.current_step = 0 (la columna era NOT NULL sin default).
--   2. teams.left_at: marca de abandono.
--   3. Candado por sala (pg_advisory_xact_lock) en join_room, start_game,
--      leave_room, finish_game y el cierre de sala de submit_answer.
--   4. join_room revalida dentro del candado y traduce la clave duplicada a
--      'nombre_repetido'.
--   5. submit_answer crea la fila de progress si falta y solo aplica el
--      enfriamiento tras un fallo; el cierre de sala cuenta equipos activos.
--   6. Anfitrión por equipo: start_game/finish_game usan (room, team, token).
--   7. leave_room: abandono en partida, borrado en lobby, traspaso de anfitrión.
--   8. rejoin reactiva equipos que vuelven y devuelve left_at / is_host.
--   9. Códigos privados: room_codes + rooms.code opaco + resolve_room_code.
--  10. search_path = public, pg_temp en todas las funciones.
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de la migración 1.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Default de rooms.current_step
-- ----------------------------------------------------------------------------
alter table public.rooms alter column current_step set default 0;

-- ----------------------------------------------------------------------------
-- 2. teams.left_at
-- ----------------------------------------------------------------------------
alter table public.teams add column if not exists left_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. Códigos privados: tabla room_codes
--    rooms.code pasa a ser un valor opaco; el código de unión vive aquí.
-- ----------------------------------------------------------------------------
create table if not exists public.room_codes (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  code    text not null unique
);
alter table public.room_codes enable row level security;
-- Sin políticas: solo las funciones security definer pueden leerla.
revoke all on public.room_codes from anon, authenticated;

-- Backfill: conserva el código actual como código de unión antes de volver
-- opaco rooms.code. Idempotente (no pisa lo ya migrado).
insert into public.room_codes (room_id, code)
select id, code from public.rooms
on conflict do nothing;

-- rooms.code deja de servir para unirse. Valor opaco (md5, sin extensiones).
update public.rooms
set code = md5(random()::text || clock_timestamp()::text || id::text);

-- ----------------------------------------------------------------------------
-- 4. Firmas antiguas de anfitrión (por host_token). Se eliminan.
-- ----------------------------------------------------------------------------
drop function if exists public.start_game(uuid, text);
drop function if exists public.finish_game(uuid, text);

-- ----------------------------------------------------------------------------
-- 5. Funciones RPC
-- ----------------------------------------------------------------------------

-- create_room: crea sala + equipo anfitrión + token de equipo.
create or replace function public.create_room(p_team_name text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id    uuid;
  v_team_id    uuid;
  v_join_code  text;
  v_team_token text;
  v_color      text;
  v_name       text;
  v_alphabet   text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_palette    text[] := array[
    '#e87852', '#63b6a2', '#d7ad54', '#9a80c5',
    '#5aa9d6', '#c96a8a', '#8fbf5a', '#b98a5a'
  ];
  v_attempt    int := 0;
  v_i          int;
begin
  v_name := btrim(regexp_replace(coalesce(p_team_name, ''), '\s+', ' ', 'g'));
  if length(v_name) = 0 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if length(v_name) > 24 then
    v_name := left(v_name, 24);
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_join_code := '';
    for v_i in 1..6 loop
      v_join_code := v_join_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into rooms (code, status, created_at)
      values (
        md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text),
        'lobby',
        now()
      )
      returning id into v_room_id;

      insert into room_codes (room_id, code) values (v_room_id, v_join_code);
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'codigo_agotado' using errcode = 'P0001';
      end if;
    end;
  end loop;

  v_color := v_palette[1];

  insert into teams (room_id, name, color, created_at)
  values (v_room_id, v_name, v_color, now())
  returning id into v_team_id;

  v_team_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into team_secrets (team_id, token) values (v_team_id, v_team_token);

  update rooms set host_team_id = v_team_id where id = v_room_id;

  return json_build_object(
    'room_id', v_room_id,
    'code', v_join_code,
    'team_id', v_team_id,
    'team_token', v_team_token,
    'color', v_color,
    'server_now', now()
  );
end;
$$;

-- join_room: equipo anónimo se une a una sala en lobby.
-- Resuelve por room_codes.code, toma el candado de la sala y revalida.
create or replace function public.join_room(p_code text, p_team_name text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room        rooms%rowtype;
  v_room_id     uuid;
  v_code        text;
  v_name        text;
  v_count       int;
  v_team_id     uuid;
  v_team_token  text;
  v_used        text[];
  v_color       text;
  v_palette     text[] := array[
    '#e87852', '#63b6a2', '#d7ad54', '#9a80c5',
    '#5aa9d6', '#c96a8a', '#8fbf5a', '#b98a5a'
  ];
begin
  v_name := btrim(regexp_replace(coalesce(p_team_name, ''), '\s+', ' ', 'g'));
  if length(v_name) = 0 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if length(v_name) > 24 then
    v_name := left(v_name, 24);
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if length(v_code) = 0 then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;

  select room_id into v_room_id from room_codes where code = v_code;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || v_room_id::text, 0));

  select * into v_room from rooms where id = v_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'sala_no_lobby' using errcode = 'P0001';
  end if;

  select count(*) into v_count from teams where room_id = v_room_id and left_at is null;
  if v_count >= 8 then
    raise exception 'sala_llena' using errcode = 'P0001';
  end if;

  if exists (select 1 from teams where room_id = v_room_id and lower(name) = lower(v_name)) then
    raise exception 'nombre_repetido' using errcode = 'P0001';
  end if;

  v_used := array(select color from teams where room_id = v_room_id and left_at is null);
  select c into v_color from unnest(v_palette) as c where not (c = any(v_used)) limit 1;
  if v_color is null then
    v_color := v_palette[1 + (v_count % array_length(v_palette, 1))];
  end if;

  begin
    insert into teams (room_id, name, color, created_at)
    values (v_room_id, v_name, v_color, now())
    returning id into v_team_id;
  exception when unique_violation then
    raise exception 'nombre_repetido' using errcode = 'P0001';
  end;

  v_team_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into team_secrets (team_id, token) values (v_team_id, v_team_token);

  return json_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'team_id', v_team_id,
    'team_token', v_team_token,
    'color', v_color,
    'server_now', now()
  );
end;
$$;

-- rejoin: reanuda la sesión con token en cualquier estado.
create or replace function public.rejoin(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team teams%rowtype;
  v_room rooms%rowtype;
  v_code text;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select * into v_team from teams where id = p_team_id and room_id = p_room_id;
  if not found then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  -- Si el equipo había abandonado y la partida sigue, vuelve a estar activo.
  if v_room.status = 'playing' and v_team.left_at is not null then
    update teams set left_at = null where id = p_team_id returning * into v_team;
  end if;

  select rc.code into v_code from room_codes rc where rc.room_id = p_room_id;
  if v_code is null then
    v_code := '';
  end if;

  return json_build_object(
    'team_id', v_team.id,
    'room_id', v_room.id,
    'code', v_code,
    'status', v_room.status,
    'color', v_team.color,
    'name', v_team.name,
    'started_at', v_room.started_at,
    'finished_at', v_room.finished_at,
    'host_team_id', v_room.host_team_id,
    'is_host', (v_room.host_team_id = p_team_id),
    'left_at', v_team.left_at,
    'server_now', now()
  );
end;
$$;

-- resolve_room_code: traduce un código de unión a su room_id (vista proyector).
create or replace function public.resolve_room_code(p_code text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select room_id from room_codes where code = upper(btrim(coalesce(p_code, ''))) limit 1;
$$;

-- start_game: solo el equipo anfitrión, de lobby a playing, crea progress.
create or replace function public.start_game(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room    rooms%rowtype;
  v_count   int;
  v_zones   int;
  v_started timestamptz;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.host_team_id is distinct from p_team_id then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  select count(*) into v_count from teams where room_id = p_room_id and left_at is null;
  if v_count < 1 then
    raise exception 'pocos_equipos' using errcode = 'P0001';
  end if;

  select count(distinct zone) into v_zones from answers;
  if v_zones = 0 then
    raise exception 'sin_preguntas' using errcode = 'P0001';
  end if;

  update rooms set status = 'playing', started_at = now() where id = p_room_id
  returning started_at into v_started;

  insert into progress (team_id, room_id, zone, status, errors, current_step)
  select t.id, t.room_id, z.zone, 'available', 0, 0
  from teams t
  cross join (select distinct zone from answers) z
  where t.room_id = p_room_id and t.left_at is null
  on conflict (team_id, zone) do nothing;

  return json_build_object('status', 'playing', 'started_at', v_started, 'server_now', now());
end;
$$;

-- submit_answer: valida token, paso, zona, enfriamiento; registra el intento.
create or replace function public.submit_answer(
  p_room_id uuid,
  p_team_id uuid,
  p_team_token text,
  p_zone text,
  p_step int,
  p_response int
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room           rooms%rowtype;
  v_progress       progress%rowtype;
  v_answer         int;
  v_correct        bool;
  v_last_created   timestamptz;
  v_last_correct   bool;
  v_total_zones    int;
  v_conquered      int;
  v_team_finished  timestamptz;
  v_team_count     int;
  v_team_done      int;
  v_room_finished  boolean;
  v_has_next       boolean;
begin
  if p_room_id is null or p_team_id is null or p_zone is null
     or p_step is null or p_response is null or p_team_token is null then
    raise exception 'datos_invalidos' using errcode = 'P0001';
  end if;
  if p_step < 0 then
    raise exception 'paso_invalido:0' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from teams where id = p_team_id and room_id = p_room_id) then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from answers where zone = p_zone) then
    raise exception 'zona_invalida' using errcode = 'P0001';
  end if;

  select * into v_progress
  from progress
  where team_id = p_team_id and zone = p_zone
  for update;

  -- Equipo que entró en carrera al iniciar: crea su fila si falta.
  if not found then
    insert into progress (team_id, room_id, zone, status, errors, current_step)
    values (p_team_id, p_room_id, p_zone, 'available', 0, 0)
    on conflict (team_id, zone) do nothing;

    select * into v_progress
    from progress
    where team_id = p_team_id and zone = p_zone
    for update;
  end if;

  if not found then
    raise exception 'progreso_no_existe' using errcode = 'P0001';
  end if;
  if v_progress.status = 'conquered' then
    raise exception 'zona_conquistada' using errcode = 'P0001';
  end if;
  if p_step <> v_progress.current_step then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  -- Enfriamiento de 1 s SOLO si el último intento fue incorrecto.
  select created_at, correct into v_last_created, v_last_correct
  from attempts
  where team_id = p_team_id
  order by created_at desc
  limit 1;

  if found and v_last_correct = false and now() - v_last_created < interval '1 second' then
    raise exception 'enfriamiento' using errcode = 'P0001';
  end if;

  select answer into v_answer from answers where zone = p_zone and step = p_step;
  if not found then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  v_correct := (v_answer = p_response);

  insert into attempts (team_id, zone, step, correct, created_at, room_id, response_index)
  values (p_team_id, p_zone, p_step, v_correct, now(), p_room_id, p_response);

  if v_correct then
    select exists (select 1 from answers where zone = p_zone and step > p_step) into v_has_next;
    if v_has_next then
      update progress
      set current_step = p_step + 1
      where team_id = p_team_id and zone = p_zone;
    else
      update progress
      set status = 'conquered', conquered_at = now(), current_step = 0
      where team_id = p_team_id and zone = p_zone;
    end if;
  else
    update progress
    set errors = errors + 1
    where team_id = p_team_id and zone = p_zone;
  end if;

  select * into v_progress from progress where team_id = p_team_id and zone = p_zone;

  -- ¿Terminó el equipo con todas las zonas?
  select count(distinct zone) into v_total_zones from answers;
  select count(*) into v_conquered
  from progress
  where team_id = p_team_id and status = 'conquered';

  if v_conquered >= v_total_zones then
    update teams set finished_at = coalesce(finished_at, now()) where id = p_team_id;
  end if;

  select finished_at into v_team_finished from teams where id = p_team_id;

  -- Cierre de sala. Candado antes de contar equipos activos.
  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select count(*) into v_team_count
  from teams
  where room_id = p_room_id and left_at is null;

  select count(*) into v_team_done
  from teams
  where room_id = p_room_id and left_at is null and finished_at is not null;

  if v_team_count > 0 and v_team_done >= v_team_count then
    update rooms
    set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = p_room_id;
  end if;

  select (status = 'finished') into v_room_finished from rooms where id = p_room_id;

  return json_build_object(
    'correct', v_correct,
    'errors', v_progress.errors,
    'current_step', v_progress.current_step,
    'zone_status', v_progress.status,
    'team_finished', v_team_finished is not null,
    'room_finished', coalesce(v_room_finished, false)
  );
end;
$$;

-- finish_game: solo el equipo anfitrión, y solo desde playing.
create or replace function public.finish_game(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room rooms%rowtype;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.host_team_id is distinct from p_team_id then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  update rooms
  set status = 'finished', finished_at = coalesce(finished_at, now())
  where id = p_room_id;

  return json_build_object('status', 'finished', 'server_now', now());
end;
$$;

-- leave_room: salida del equipo. Lobby borra; playing marca left_at.
create or replace function public.leave_room(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room      rooms%rowtype;
  v_new_host  uuid;
  v_active    int;
  v_active_done int;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from teams where id = p_team_id and room_id = p_room_id) then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if v_room.status = 'finished' then
    return json_build_object('status', 'finished', 'server_now', now());
  end if;

  if v_room.status = 'lobby' then
    delete from teams where id = p_team_id;

    select id into v_new_host
    from teams
    where room_id = p_room_id and left_at is null
    order by created_at asc, id asc
    limit 1;

    if v_new_host is null then
      delete from rooms where id = p_room_id;
      return json_build_object('status', 'closed', 'server_now', now());
    end if;

    update rooms set host_team_id = v_new_host where id = p_room_id;
    return json_build_object('status', 'left', 'host_team_id', v_new_host, 'server_now', now());
  end if;

  -- playing: abandono sin borrar; traspaso de anfitrión si procede.
  update teams set left_at = now() where id = p_team_id;

  if v_room.host_team_id = p_team_id then
    select id into v_new_host
    from teams
    where room_id = p_room_id and left_at is null
    order by created_at asc, id asc
    limit 1;

    update rooms set host_team_id = v_new_host where id = p_room_id;
  end if;

  select count(*) into v_active
  from teams
  where room_id = p_room_id and left_at is null;

  if v_active = 0 then
    update rooms
    set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = p_room_id;
  else
    select count(*) into v_active_done
    from teams
    where room_id = p_room_id and left_at is null and finished_at is not null;

    if v_active_done >= v_active then
      update rooms
      set status = 'finished', finished_at = coalesce(finished_at, now())
      where id = p_room_id;
    end if;
  end if;

  return json_build_object('status', 'left', 'server_now', now());
end;
$$;

-- cleanup_old_rooms: borra salas con más de 24 h. Sin grant a anon.
create or replace function public.cleanup_old_rooms()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int;
begin
  delete from rooms where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Permisos de ejecución de RPCs
-- ----------------------------------------------------------------------------
revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.rejoin(uuid, uuid, text) from public;
revoke all on function public.resolve_room_code(text) from public;
revoke all on function public.start_game(uuid, uuid, text) from public;
revoke all on function public.submit_answer(uuid, uuid, text, text, int, int) from public;
revoke all on function public.finish_game(uuid, uuid, text) from public;
revoke all on function public.leave_room(uuid, uuid, text) from public;
revoke all on function public.cleanup_old_rooms() from public;

grant execute on function public.create_room(text) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.rejoin(uuid, uuid, text) to anon, authenticated;
grant execute on function public.resolve_room_code(text) to anon, authenticated;
grant execute on function public.start_game(uuid, uuid, text) to anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, text, int, int) to anon, authenticated;
grant execute on function public.finish_game(uuid, uuid, text) to anon, authenticated;
grant execute on function public.leave_room(uuid, uuid, text) to anon, authenticated;
-- cleanup_old_rooms NO se otorga a anon: se ejecuta con pg_cron o service_role.

-- ----------------------------------------------------------------------------
-- 7. Realtime: asegurar la publicación de rooms (por si falta).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
    ) then
      alter publication supabase_realtime add table public.rooms;
    end if;
  end if;
end $$;

-- >>> 20261013020000_ronda2_fase_c.sql >>>
-- ============================================================================
-- Conquista Cálculo · Ronda 2 (Fase C)
-- Idempotente. No modifica migraciones anteriores.
--
-- Qué añade:
--   1. reset_room: el anfitrión reinicia una sala terminada ("Jugar otra vez").
--   2. room_report: informe JSON de una sala terminada (para el proyector).
--
-- Ejecutar DESPUÉS de 20261013010000_ronda2.sql.
-- ============================================================================

-- reset_room: solo el anfitrión, solo desde 'finished'. Limpia progreso e
-- intentos, resucita la sala a 'lobby' y elimina equipos que habían abandonado.
create or replace function public.reset_room(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room rooms%rowtype;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if v_room.host_team_id is distinct from p_team_id then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'finished' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  delete from attempts where room_id = p_room_id;
  delete from progress where room_id = p_room_id;
  delete from teams where room_id = p_room_id and left_at is not null;
  update teams set finished_at = null where room_id = p_room_id;

  update rooms
  set status = 'lobby', started_at = null, finished_at = null
  where id = p_room_id;

  return json_build_object('status', 'lobby', 'server_now', now());
end;
$$;

-- room_report: informe de una sala terminada. Devuelve código, fechas y la
-- tabla de equipos ordenada como el ranking (zonas desc, tiempo asc, errores).
create or replace function public.room_report(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room rooms%rowtype;
  v_teams json;
begin
  if p_room_id is null then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if v_room.status <> 'finished' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'team_id', t.team_id,
        'name', t.name,
        'color', t.color,
        'left_at', t.left_at,
        'finished_at', t.finished_at,
        'zonas', t.zonas,
        'errores', t.errores,
        'segundos', t.segundos
      )
      order by t.zonas desc, t.segundos asc nulls last, t.errores asc, t.created_at asc
    ),
    '[]'::json
  )
  into v_teams
  from (
    select
      te.id as team_id,
      te.name,
      te.color,
      te.left_at,
      te.finished_at,
      te.created_at,
      count(*) filter (where pr.status = 'conquered') as zonas,
      coalesce(sum(pr.errors), 0) as errores,
      case
        when te.finished_at is not null and v_room.started_at is not null
          then round(
            extract(epoch from (te.finished_at - v_room.started_at))
            + 15 * coalesce(sum(pr.errors), 0)
          )
        else null
      end as segundos
    from teams te
    left join progress pr on pr.team_id = te.id and pr.room_id = te.room_id
    where te.room_id = p_room_id
    group by te.id, te.name, te.color, te.left_at, te.finished_at, te.created_at
  ) t;

  return json_build_object(
    'room_id', v_room.id,
    'code', (select code from room_codes where room_id = p_room_id),
    'started_at', v_room.started_at,
    'finished_at', v_room.finished_at,
    'teams', v_teams,
    'server_now', now()
  );
end;
$$;

-- Permisos
revoke all on function public.reset_room(uuid, uuid, text) from public;
revoke all on function public.room_report(uuid) from public;
grant execute on function public.reset_room(uuid, uuid, text) to anon, authenticated;
grant execute on function public.room_report(uuid) to anon, authenticated;

-- >>> 20261014000000_ronda3.sql >>>
-- ============================================================================
-- Conquista Cálculo · Ronda 3 (migración 4)
-- Idempotente. Se ejecuta DESPUÉS de 20261013020000_ronda2_fase_c.sql.
--
-- Este archivo termina con la definición canónica y FINAL de todas las RPC
-- (create or replace), de modo que es la última palabra aunque alguien
-- re-ejecute migraciones antiguas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columna explanation en answers
-- ----------------------------------------------------------------------------
alter table public.answers add column if not exists explanation text;

-- Backfill de explicaciones existentes (se actualizarán con el seed real)
update public.answers set explanation = '' where explanation is null;

-- ----------------------------------------------------------------------------
-- 2. Variante de preguntas: PK (zone, variant, step) y columnas en rooms
-- ----------------------------------------------------------------------------
-- Añadir columna variant con default 'A'
alter table public.answers add column if not exists variant text not null default 'A';

-- Migrar PK de (zone, step) a (zone, variant, step)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.answers'::regclass
      and contype = 'p'
      and conname = 'answers_pkey'
  ) then
    alter table public.answers drop constraint answers_pkey;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.answers'::regclass
      and contype = 'p'
      and conname = 'answers_zone_variant_step_pkey'
  ) then
    alter table public.answers add constraint answers_zone_variant_step_pkey primary key (zone, variant, step);
  end if;
end $$;

-- rooms.variant y rooms.round
alter table public.rooms add column if not exists variant text not null default 'A';
alter table public.rooms add column if not exists round int not null default 1;

-- ----------------------------------------------------------------------------
-- 3. start_game elige variante al azar entre las existentes
-- ----------------------------------------------------------------------------
create or replace function public.start_game(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room    rooms%rowtype;
  v_count   int;
  v_zones   int;
  v_started timestamptz;
  v_variant text;
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.host_team_id is distinct from p_team_id then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  select count(*) into v_count from teams where room_id = p_room_id and left_at is null;
  if v_count < 1 then
    raise exception 'pocos_equipos' using errcode = 'P0001';
  end if;

  select count(distinct zone) into v_zones from answers;
  if v_zones = 0 then
    raise exception 'sin_preguntas' using errcode = 'P0001';
  end if;

  -- Elegir variante al azar entre las que existan en answers
  select variant into v_variant
  from (
    select distinct variant from answers
  ) v
  order by random()
  limit 1;

  if v_variant is null then
    v_variant := 'A';
  end if;

  update rooms set status = 'playing', started_at = now(), variant = v_variant, round = 1 where id = p_room_id
  returning started_at into v_started;

  insert into progress (team_id, room_id, zone, status, errors, current_step)
  select t.id, t.room_id, z.zone, 'available', 0, 0
  from teams t
  cross join (select distinct zone from answers where variant = v_variant) z
  where t.room_id = p_room_id and t.left_at is null
  on conflict (team_id, zone) do nothing;

  return json_build_object('status', 'playing', 'started_at', v_started, 'variant', v_variant, 'round', 1, 'server_now', now());
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. submit_answer usa la variante de la sala y devuelve explanation solo si correcto
-- ----------------------------------------------------------------------------
create or replace function public.submit_answer(
  p_room_id uuid,
  p_team_id uuid,
  p_team_token text,
  p_zone text,
  p_step int,
  p_response int
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room           rooms%rowtype;
  v_progress       progress%rowtype;
  v_answer         int;
  v_explanation    text;
  v_correct        bool;
  v_last_created   timestamptz;
  v_last_correct   bool;
  v_total_zones    int;
  v_conquered      int;
  v_team_finished  timestamptz;
  v_team_count     int;
  v_team_done      int;
  v_room_finished  boolean;
  v_has_next       boolean;
begin
  if p_room_id is null or p_team_id is null or p_zone is null
     or p_step is null or p_response is null or p_team_token is null then
    raise exception 'datos_invalidos' using errcode = 'P0001';
  end if;
  if p_step < 0 then
    raise exception 'paso_invalido:0' using errcode = 'P0001';
  end if;

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from teams where id = p_team_id and room_id = p_room_id) then
    raise exception 'equipo_no_existe' using errcode = 'P0001';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  if not exists (select 1 from answers where zone = p_zone and variant = v_room.variant) then
    raise exception 'zona_invalida' using errcode = 'P0001';
  end if;

  select * into v_progress
  from progress
  where team_id = p_team_id and zone = p_zone
  for update;

  -- Equipo que entró en carrera al iniciar: crea su fila si falta.
  if not found then
    insert into progress (team_id, room_id, zone, status, errors, current_step)
    values (p_team_id, p_room_id, p_zone, 'available', 0, 0)
    on conflict (team_id, zone) do nothing;

    select * into v_progress
    from progress
    where team_id = p_team_id and zone = p_zone
    for update;
  end if;

  if not found then
    raise exception 'progreso_no_existe' using errcode = 'P0001';
  end if;
  if v_progress.status = 'conquered' then
    raise exception 'zona_conquistada' using errcode = 'P0001';
  end if;
  if p_step <> v_progress.current_step then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  -- Enfriamiento de 1 s SOLO si el último intento fue incorrecto.
  select created_at, correct into v_last_created, v_last_correct
  from attempts
  where team_id = p_team_id
  order by created_at desc
  limit 1;

  if found and v_last_correct = false and now() - v_last_created < interval '1 second' then
    raise exception 'enfriamiento' using errcode = 'P0001';
  end if;

  select answer, explanation into v_answer, v_explanation
  from answers where zone = p_zone and step = p_step and variant = v_room.variant;
  if not found then
    raise exception 'paso_invalido:%', v_progress.current_step using errcode = 'P0001';
  end if;

  v_correct := (v_answer = p_response);

  insert into attempts (team_id, zone, step, correct, created_at, room_id, response_index)
  values (p_team_id, p_zone, p_step, v_correct, now(), p_room_id, p_response);

  if v_correct then
    select exists (select 1 from answers where zone = p_zone and step > p_step and variant = v_room.variant) into v_has_next;
    if v_has_next then
      update progress
      set current_step = p_step + 1
      where team_id = p_team_id and zone = p_zone;
    else
      update progress
      set status = 'conquered', conquered_at = now(), current_step = 0
      where team_id = p_team_id and zone = p_zone;
    end if;
  else
    update progress
    set errors = errors + 1
    where team_id = p_team_id and zone = p_zone;
  end if;

  select * into v_progress from progress where team_id = p_team_id and zone = p_zone;

  -- ¿Terminó el equipo con todas las zonas?
  select count(distinct zone) into v_total_zones from answers where variant = v_room.variant;
  select count(*) into v_conquered
  from progress
  where team_id = p_team_id and status = 'conquered';

  if v_conquered >= v_total_zones then
    update teams set finished_at = coalesce(finished_at, now()) where id = p_team_id;
  end if;

  select finished_at into v_team_finished from teams where id = p_team_id;

  -- Cierre de sala. Candado antes de contar equipos activos.
  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select count(*) into v_team_count
  from teams
  where room_id = p_room_id and left_at is null;

  select count(*) into v_team_done
  from teams
  where room_id = p_room_id and left_at is null and finished_at is not null;

  if v_team_count > 0 and v_team_done >= v_team_count then
    update rooms
    set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = p_room_id;
  end if;

  select (status = 'finished') into v_room_finished from rooms where id = p_room_id;

  return json_build_object(
    'correct', v_correct,
    'errors', v_progress.errors,
    'current_step', v_progress.current_step,
    'zone_status', v_progress.status,
    'team_finished', v_team_finished is not null,
    'room_finished', coalesce(v_room_finished, false),
    'explanation', case when v_correct then v_explanation else null end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. reset_room incrementa round y elige variante distinta si hay más de una
-- ----------------------------------------------------------------------------
create or replace function public.reset_room(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room    rooms%rowtype;
  v_variant text;
  v_variants text[];
begin
  if p_room_id is null or p_team_id is null or p_team_token is null then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sala:' || p_room_id::text, 0));

  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'sala_no_existe' using errcode = 'P0001';
  end if;

  if not exists (select 1 from team_secrets where team_id = p_team_id and token = p_team_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  if v_room.host_team_id is distinct from p_team_id then
    raise exception 'no_anfitrion' using errcode = 'P0001';
  end if;

  if v_room.status <> 'finished' then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  -- Obtener variantes disponibles
  select array_agg(distinct variant) into v_variants
  from answers;

  -- Elegir variante distinta a la anterior si hay más de una
  if array_length(v_variants, 1) > 1 then
    select v into v_variant
    from unnest(v_variants) as v
    where v <> v_room.variant
    order by random()
    limit 1;
  else
    v_variant := v_variants[1];
  end if;

  delete from attempts where room_id = p_room_id;
  delete from progress where room_id = p_room_id;
  delete from teams where room_id = p_room_id and left_at is not null;
  update teams set finished_at = null where room_id = p_room_id;

  update rooms
  set status = 'lobby', started_at = null, finished_at = null, variant = v_variant, round = v_room.round + 1
  where id = p_room_id;

  return json_build_object('status', 'lobby', 'variant', v_variant, 'round', v_room.round + 1, 'server_now', now());
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Permisos de ejecución de RPCs (actualizados)
-- ----------------------------------------------------------------------------
revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.rejoin(uuid, uuid, text) from public;
revoke all on function public.resolve_room_code(text) from public;
revoke all on function public.start_game(uuid, uuid, text) from public;
revoke all on function public.submit_answer(uuid, uuid, text, text, int, int) from public;
revoke all on function public.finish_game(uuid, uuid, text) from public;
revoke all on function public.leave_room(uuid, uuid, text) from public;
revoke all on function public.reset_room(uuid, uuid, text) from public;
revoke all on function public.room_report(uuid) from public;
revoke all on function public.cleanup_old_rooms() from public;

grant execute on function public.create_room(text) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.rejoin(uuid, uuid, text) to anon, authenticated;
grant execute on function public.resolve_room_code(text) to anon, authenticated;
grant execute on function public.start_game(uuid, uuid, text) to anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, text, int, int) to anon, authenticated;
grant execute on function public.finish_game(uuid, uuid, text) to anon, authenticated;
grant execute on function public.leave_room(uuid, uuid, text) to anon, authenticated;
grant execute on function public.reset_room(uuid, uuid, text) to anon, authenticated;
grant execute on function public.room_report(uuid) to anon, authenticated;
-- cleanup_old_rooms NO se otorga a anon: se ejecuta con pg_cron o service_role.

-- ----------------------------------------------------------------------------
-- 7. Realtime: asegurar la publicación de rooms, teams, progress.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
    ) then
      alter publication supabase_realtime add table public.rooms;
    end if;
if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress'
    ) then
      alter publication supabase_realtime add table public.progress;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress'
    ) then
      alter publication supabase_realtime add table public.progress;
    end if;
  end if;
end $$;


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
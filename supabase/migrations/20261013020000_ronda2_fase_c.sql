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

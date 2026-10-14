-- ============================================================================
-- Conquista Cálculo · Ronda 3 (correcciones)
-- Idempotente. No modifica migraciones anteriores.
--
-- Qué corrige:
--   1. leave_room en sala 'finished': antes no hacía nada, así que quien salía
--      del podio seguía como equipo activo ("fantasma") y, si era el anfitrión,
--      dejaba la sala sin nadie que pudiera pulsar "Jugar otra vez".
--      Ahora marca left_at, traspasa el anfitrión y borra la sala si no queda
--      nadie. reset_room ya elimina los equipos con left_at.
--   2. cleanup_old_rooms: en Supabase las funciones nuevas reciben EXECUTE
--      directo para anon/authenticated, así que "revoke ... from public" no
--      basta. Se revoca explícitamente.
--
-- Ejecutar DESPUÉS de 20261013020000_ronda2_fase_c.sql.
-- ============================================================================

create or replace function public.leave_room(p_room_id uuid, p_team_id uuid, p_team_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room        rooms%rowtype;
  v_new_host    uuid;
  v_active      int;
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

  -- finished: el equipo sale del podio. Se marca como ausente (reset_room lo
  -- eliminará) y se traspasa el anfitrión si hacía falta.
  if v_room.status = 'finished' then
    update teams set left_at = coalesce(left_at, now()) where id = p_team_id;

    select count(*) into v_active
    from teams
    where room_id = p_room_id and left_at is null;

    if v_active = 0 then
      delete from rooms where id = p_room_id;
      return json_build_object('status', 'closed', 'server_now', now());
    end if;

    if v_room.host_team_id = p_team_id then
      select id into v_new_host
      from teams
      where room_id = p_room_id and left_at is null
      order by created_at asc, id asc
      limit 1;

      update rooms set host_team_id = v_new_host where id = p_room_id;
    end if;

    return json_build_object('status', 'finished', 'host_team_id', v_new_host, 'server_now', now());
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

revoke all on function public.leave_room(uuid, uuid, text) from public;
grant execute on function public.leave_room(uuid, uuid, text) to anon, authenticated;

-- cleanup_old_rooms: solo service_role / pg_cron.
revoke all on function public.cleanup_old_rooms() from public, anon, authenticated;

-- Opcional (endurecimiento global; descomenta si quieres que las funciones
-- futuras no queden expuestas por defecto):
-- alter default privileges in schema public revoke execute on functions from anon, authenticated;

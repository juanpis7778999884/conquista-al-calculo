-- ============================================================================
-- Conquista Cálculo · Verificación
-- Ejecutar en el SQL Editor después de las migraciones + seed.
-- Cada consulta devuelve lo que se espera; revisa "esperado" en cada bloque.
-- ============================================================================

-- 1. RLS activo en todas las tablas.
--    Esperado: rooms, teams, progress, attempts, answers, room_secrets,
--    team_secrets, room_codes con rls_activo = true.
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'rooms', 'teams', 'progress', 'attempts', 'answers',
    'room_secrets', 'team_secrets', 'room_codes'
  )
order by c.relname;

-- 2. Políticas existentes.
--    Esperado: solo "leer salas", "leer equipos", "leer progreso".
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Privilegios de tabla para anon.
--    Esperado: anon solo con SELECT en rooms, teams y progress.
--    No debe aparecer ninguna otra tabla (answers, attempts, room_secrets,
--    team_secrets, room_codes deben estar ausentes).
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;

-- 4. Columnas de control.
--    Esperado: rooms.current_step con default 0; teams.left_at tipo timestamp.
select table_name, column_name, column_default, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'rooms' and column_name = 'current_step')
    or (table_name = 'teams' and column_name = 'left_at')
  )
order by table_name, column_name;

-- 5. Funciones y sus grants.
--    Esperado: create_room, join_room, rejoin, resolve_room_code, start_game,
--    submit_answer, finish_game, leave_room, reset_room y room_report
--    ejecutables por anon; cleanup_old_rooms NO.
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_puede_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_room', 'join_room', 'rejoin', 'resolve_room_code', 'start_game',
    'submit_answer', 'finish_game', 'leave_room', 'reset_room', 'room_report',
    'cleanup_old_rooms'
  )
order by p.proname, argumentos;

-- 5b. Comprobación directa: anon NO puede ejecutar cleanup_old_rooms.
--     Esperado: false.
select has_function_privilege('anon', 'public.cleanup_old_rooms()', 'EXECUTE')
  as anon_puede_limpiar;

-- 6. Constraints de estado validadas.
--    Esperado: convalidated = true para rooms_status_check y progress_status_check.
select conrelid::regclass as tabla, conname as constraint, convalidated as validada
from pg_constraint
where connamespace = 'public'::regnamespace
  and conname in ('rooms_status_check', 'progress_status_check')
order by conname;

-- 7. Llaves foráneas con su acción de borrado.
--    Esperado: teams.room_id → rooms (c), progress.team_id/room_id → teams/rooms (c),
--    attempts.team_id/room_id → teams/rooms (c), rooms.host_team_id → teams (n),
--    room_codes.room_id → rooms (c).
select conrelid::regclass as tabla, conname as constraint, confdeltype as accion_borrado
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype = 'f'
order by conrelid::regclass::text, conname;

-- 8. Índices esperados.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'rooms_code_uq', 'teams_room_name_uq', 'progress_team_zone_uq',
    'progress_room_id_idx', 'attempts_team_id_idx', 'attempts_room_id_idx',
    'teams_room_created_idx', 'room_codes_code_key', 'room_codes_pkey'
  )
order by indexname;

-- 9. Códigos privados: cada sala tiene su código de unión y rooms.code ya no
--    coincide con room_codes.code (es opaco).
--    Esperado: mismo número de filas en rooms y room_codes; 'codigos_iguales' = 0.
select
  (select count(*) from rooms) as salas,
  (select count(*) from room_codes) as codigos,
  (select count(*) from rooms r join room_codes rc on rc.room_id = r.id where r.code = rc.code)
    as codigos_iguales;

-- 10. Respuestas cargadas.
--     Esperado: 21 filas, 7 zonas × 3 pasos.
select zone, count(*) as pasos
from answers
group by zone
order by zone;

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const MIGRATION_1 = read('../../../supabase/migrations/20261013000000_hardening_y_rpcs.sql')
const MIGRATION_2 = read('../../../supabase/migrations/20261013010000_ronda2.sql')
const MIGRATION_3 = read('../../../supabase/migrations/20261013020000_ronda2_fase_c.sql')
const SEED = read('../../../supabase/seed_answers.sql')

export type Row = Record<string, unknown>

export type DbOptions = {
  /** Si el esquema previo define `rooms.current_step` con default 0. */
  currentStepDefault?: boolean
}

/**
 * Reconstruye el esquema "previo a la migración" tal como está en Supabase:
 * roles anon/authenticated, tablas, índices únicos, políticas de lectura y
 * grant all a anon (Supabase da permisos amplios y RLS filtra).
 */
export async function createBaseDb(options: DbOptions = {}): Promise<PGlite> {
  const { currentStepDefault = true } = options
  const currentStep = currentStepDefault ? 'int4 not null default 0' : 'int4 not null'

  const db = new PGlite()

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
  `)

  await db.exec(`
    create table public.rooms (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      status text not null default 'active',
      started_at timestamptz,
      created_at timestamptz not null default now(),
      finished_at timestamptz,
      host_team_id uuid,
      current_step ${currentStep}
    );

    create table public.teams (
      id uuid primary key default gen_random_uuid(),
      room_id uuid not null references public.rooms(id) on delete cascade,
      name text not null,
      color text not null,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    );

    create table public.progress (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references public.teams(id) on delete cascade,
      zone text not null,
      status text not null default 'available',
      errors int not null default 0,
      conquered_at timestamptz,
      current_step int not null default 0,
      room_id uuid references public.rooms(id) on delete cascade
    );

    create table public.attempts (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references public.teams(id) on delete cascade,
      zone text not null,
      step int not null,
      correct boolean not null,
      created_at timestamptz not null default now(),
      room_id uuid references public.rooms(id) on delete cascade,
      response_index int
    );

    create table public.answers (
      zone text not null,
      step int not null,
      answer int not null,
      primary key (zone, step)
    );

    create table public.room_secrets (
      room_id uuid primary key references public.rooms(id) on delete cascade,
      host_token text not null
    );

    create unique index teams_room_name_uq on public.teams (room_id, lower(name));
    create unique index progress_team_zone_uq on public.progress (team_id, zone);
  `)

  // Políticas de lectura como en Supabase (la migración 1 las reafirma).
  await db.exec(`
    alter table public.rooms    enable row level security;
    alter table public.teams    enable row level security;
    alter table public.progress enable row level security;
    create policy "leer salas"    on public.rooms    for select to anon using (true);
    create policy "leer equipos"  on public.teams    for select to anon using (true);
    create policy "leer progreso" on public.progress for select to anon using (true);

    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
  `)

  // Publicación Realtime sin rooms, para que la migración la añada.
  await db.exec(`
    create publication supabase_realtime for table public.teams, public.progress;
  `)

  return db
}

/** Aplica las migraciones EN ORDEN, dos veces (prueba de idempotencia). */
export async function applyMigrations(db: PGlite): Promise<void> {
  for (let round = 0; round < 2; round += 1) {
    await db.exec(MIGRATION_1)
    await db.exec(MIGRATION_2)
    await db.exec(MIGRATION_3)
  }
}

/** Carga el seed de respuestas. */
export async function loadSeed(db: PGlite): Promise<void> {
  await db.exec(SEED)
}

/** Base + migraciones (x2) + seed: estado listo para usar. */
export async function createDb(options: DbOptions = {}): Promise<PGlite> {
  const db = await createBaseDb(options)
  await applyMigrations(db)
  await loadSeed(db)
  return db
}

/** Ejecuta `fn` con el rol anon (como lo hace el cliente real). */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role anon;')
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}

/** Llama a una RPC con argumentos nombrados y devuelve el JSON. */
export async function rpc(
  db: PGlite,
  name: string,
  args: Record<string, unknown>,
): Promise<Row | null> {
  const keys = Object.keys(args)
  const placeholders = keys.map((key, index) => `${key} => $${index + 1}`).join(', ')
  const values = keys.map((key) => args[key])
  const result = await db.query<{ r: Row | null }>(
    `select public.${name}(${placeholders}) as r`,
    values,
  )
  return result.rows[0]?.r ?? null
}

/** Llama a una RPC como anon. */
export function rpcAsAnon(
  db: PGlite,
  name: string,
  args: Record<string, unknown>,
): Promise<Row | null> {
  return asAnon(db, () => rpc(db, name, args))
}

/** Ejecuta y devuelve el mensaje de error (lanza si no hay error). */
export async function captureError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
    return message
  }
  throw new Error('Se esperaba un error y no ocurrió')
}

/** Extrae un campo de un JSON de RPC. */
export function field<T>(row: Row | null, key: string): T {
  if (!row || !(key in row)) {
    throw new Error(`Falta el campo ${key} en la respuesta`)
  }
  return row[key] as T
}

/** Primera fila de una consulta (como rol actual, normalmente postgres). */
export async function one<T extends Row = Row>(
  db: PGlite,
  sql: string,
  params?: unknown[],
): Promise<T | undefined> {
  const result = await db.query<T>(sql, params)
  return result.rows[0]
}

export type RoomSession = {
  roomId: string
  code: string
  teamId: string
  teamToken: string
}

export async function createRoom(db: PGlite, name: string): Promise<RoomSession> {
  const row = await rpcAsAnon(db, 'create_room', { p_team_name: name })
  return {
    roomId: field<string>(row, 'room_id'),
    code: field<string>(row, 'code'),
    teamId: field<string>(row, 'team_id'),
    teamToken: field<string>(row, 'team_token'),
  }
}

export async function joinRoom(db: PGlite, code: string, name: string): Promise<RoomSession> {
  const row = await rpcAsAnon(db, 'join_room', { p_code: code, p_team_name: name })
  return {
    roomId: field<string>(row, 'room_id'),
    code: field<string>(row, 'code'),
    teamId: field<string>(row, 'team_id'),
    teamToken: field<string>(row, 'team_token'),
  }
}

export async function startGame(db: PGlite, session: RoomSession): Promise<Row | null> {
  return rpcAsAnon(db, 'start_game', {
    p_room_id: session.roomId,
    p_team_id: session.teamId,
    p_team_token: session.teamToken,
  })
}

export async function finishGame(db: PGlite, session: RoomSession): Promise<Row | null> {
  return rpcAsAnon(db, 'finish_game', {
    p_room_id: session.roomId,
    p_team_id: session.teamId,
    p_team_token: session.teamToken,
  })
}

export async function leaveRoom(db: PGlite, session: RoomSession): Promise<Row | null> {
  return rpcAsAnon(db, 'leave_room', {
    p_room_id: session.roomId,
    p_team_id: session.teamId,
    p_team_token: session.teamToken,
  })
}

export async function resetRoom(db: PGlite, session: RoomSession): Promise<Row | null> {
  return rpcAsAnon(db, 'reset_room', {
    p_room_id: session.roomId,
    p_team_id: session.teamId,
    p_team_token: session.teamToken,
  })
}

export async function roomReport(db: PGlite, roomId: string): Promise<Row | null> {
  return rpcAsAnon(db, 'room_report', { p_room_id: roomId })
}

export async function submitAnswer(
  db: PGlite,
  session: RoomSession,
  zone: string,
  step: number,
  response: number,
): Promise<Row | null> {
  return rpcAsAnon(db, 'submit_answer', {
    p_room_id: session.roomId,
    p_team_id: session.teamId,
    p_team_token: session.teamToken,
    p_zone: zone,
    p_step: step,
    p_response: response,
  })
}

/** Respuestas correctas del seed, indexadas por zona. */
export async function correctAnswers(db: PGlite): Promise<Map<string, number[]>> {
  const rows = await db.query<{ zone: string; step: number; answer: number }>(
    'select zone, step, answer from answers order by zone, step',
  )
  const map = new Map<string, number[]>()
  for (const row of rows.rows) {
    const list = map.get(row.zone) ?? []
    list[row.step] = row.answer
    map.set(row.zone, list)
  }
  return map
}

/** Conquista todas las zonas de un equipo (responde correcto en cada paso). */
export async function conquerAll(db: PGlite, session: RoomSession): Promise<void> {
  const answers = await correctAnswers(db)
  for (const [zone, steps] of answers) {
    for (let step = 0; step < steps.length; step += 1) {
      await submitAnswer(db, session, zone, step, steps[step])
    }
  }
}

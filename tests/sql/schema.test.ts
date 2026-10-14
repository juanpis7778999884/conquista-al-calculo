import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { applyMigrations, createBaseDb, createDb, createRoom, loadSeed, one } from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

describe('esquema y migraciones', () => {
  it('aplica las dos migraciones dos veces y carga el seed (idempotente)', async () => {
    db = await createDb()
    const answers = await one<{ n: number }>(db, 'select count(*)::int as n from answers')
    expect(answers?.n).toBe(21)
  })

  it('rooms.current_step tiene default 0', async () => {
    db = await createDb()
    const column = await one<{ column_default: string | null }>(
      db,
      `select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'rooms' and column_name = 'current_step'`,
    )
    expect(column?.column_default).toContain('0')
  })

  it('teams.left_at existe y room_codes tiene una fila por sala', async () => {
    db = await createDb()
    const leftAt = await one(
      db,
      `select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'teams' and column_name = 'left_at'`,
    )
    expect(leftAt).toBeDefined()

    await createRoom(db, 'Alfa')
    await createRoom(db, 'Beta')
    const counts = await one<{ salas: number; codigos: number }>(
      db,
      `select (select count(*)::int from rooms) as salas,
              (select count(*)::int from room_codes) as codigos`,
    )
    expect(counts?.salas).toBe(2)
    expect(counts?.codigos).toBe(2)
  })

  it('rooms.code deja de coincidir con el código de unión', async () => {
    db = await createDb()
    const room = await createRoom(db, 'Alfa')
    const opaque = await one<{ code: string }>(db, 'select code from rooms where id = $1', [
      room.roomId,
    ])
    expect(opaque?.code).not.toBe(room.code)
    expect(opaque?.code).toHaveLength(32)

    const joinCode = await one<{ code: string }>(
      db,
      'select code from room_codes where room_id = $1',
      [room.roomId],
    )
    expect(joinCode?.code).toBe(room.code)
  })

  it('publica rooms en Realtime si falta', async () => {
    db = await createDb()
    const row = await one<{ n: number }>(
      db,
      `select count(*)::int as n from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'`,
    )
    expect(row?.n).toBe(1)
  })

  it('create_room funciona con el esquema previo SIN default de current_step', async () => {
    db = await createBaseDb({ currentStepDefault: false })
    await applyMigrations(db)
    await loadSeed(db)

    const room = await createRoom(db, 'Alfa')
    expect(room.roomId).toBeTruthy()

    const opaque = await one<{ code: string }>(db, 'select code from rooms where id = $1', [
      room.roomId,
    ])
    expect(opaque?.code).toHaveLength(32)
  })
})

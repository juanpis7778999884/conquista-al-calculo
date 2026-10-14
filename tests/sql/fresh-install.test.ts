import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ALL_MIGRATIONS_FROM_SCRATCH,
  createRoom,
  joinRoom,
  loadSeed,
  one,
  startGame,
} from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

describe('instalación desde cero', () => {
  it('las migraciones 0..4 crean todo en una base vacía y el juego arranca', async () => {
    db = new PGlite()
    await db.exec('create role anon nologin; create role authenticated nologin;')
    for (const sql of ALL_MIGRATIONS_FROM_SCRATCH) {
      await db.exec(sql)
    }
    await loadSeed(db)

    const host = await createRoom(db, 'A')
    await joinRoom(db, host.code, 'B')
    await startGame(db, host)

    const progress = await one<{ n: number }>(
      db,
      'select count(*)::int as n from progress where room_id = $1',
      [host.roomId],
    )
    expect(progress?.n).toBe(14) // 2 equipos × 7 zonas
  })
})

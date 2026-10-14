import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  captureError,
  conquerAll,
  createDb,
  createRoom,
  field,
  finishGame,
  joinRoom,
  one,
  resetRoom,
  roomReport,
  startGame,
} from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

describe('reset_room (Jugar otra vez)', () => {
  it('solo el anfitrión reinicia una sala terminada y limpia progreso e intentos', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)
    await finishGame(db, host)

    const denied = await captureError(() => resetRoom(db!, other))
    expect(denied).toBe('no_anfitrion')

    const result = await resetRoom(db, host)
    expect(field<string>(result, 'status')).toBe('lobby')

    const room = await one<{ status: string; started_at: string | null; finished_at: string | null }>(
      db,
      'select status, started_at, finished_at from rooms where id = $1',
      [host.roomId],
    )
    expect(room?.status).toBe('lobby')
    expect(room?.started_at).toBeNull()
    expect(room?.finished_at).toBeNull()

    const progress = await one<{ n: number }>(
      db,
      'select count(*)::int as n from progress where room_id = $1',
      [host.roomId],
    )
    expect(progress?.n).toBe(0)
    const attempts = await one<{ n: number }>(
      db,
      'select count(*)::int as n from attempts where room_id = $1',
      [host.roomId],
    )
    expect(attempts?.n).toBe(0)

    const unfinished = await one<{ n: number }>(
      db,
      'select count(*)::int as n from teams where room_id = $1 and finished_at is not null',
      [host.roomId],
    )
    expect(unfinished?.n).toBe(0)
  })
})

describe('room_report', () => {
  it('devuelve el informe de una sala terminada con zonas y tiempos', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await joinRoom(db, host.code, 'B')
    await startGame(db, host)
    await conquerAll(db, host)
    await finishGame(db, host)

    const report = await roomReport(db, host.roomId)
    expect(field<string>(report, 'code')).toBe(host.code)
    const teams = field<Array<{ name: string; zonas: number; segundos: number | null }>>(
      report,
      'teams',
    )
    expect(teams).toHaveLength(2)
    expect(teams[0].name).toBe('A')
    expect(teams[0].zonas).toBe(7)
    expect(teams[0].segundos).not.toBeNull()
  })

  it('solo funciona en salas terminadas', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')

    const lobbyError = await captureError(() => roomReport(db!, host.roomId))
    expect(lobbyError).toBe('estado_invalido')

    const missing = await captureError(() =>
      roomReport(db!, '00000000-0000-0000-0000-000000000000'),
    )
    expect(missing).toBe('sala_no_existe')
  })
})

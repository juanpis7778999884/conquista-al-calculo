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
  rpcAsAnon,
  startGame,
  submitAnswer,
} from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

async function ageAttempts(source: PGlite, seconds: number): Promise<void> {
  await source.exec(`update attempts set created_at = now() - interval '${seconds} seconds'`)
}

describe('start_game y finish_game (anfitrión por equipo)', () => {
  it('solo el anfitrión inicia y se crea progress para cada equipo activo', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')

    const denied = await captureError(() => startGame(db!, other))
    expect(denied).toBe('no_anfitrion')

    await startGame(db, host)
    const room = await one<{ status: string; started_at: string | null }>(
      db,
      'select status, started_at from rooms where id = $1',
      [host.roomId],
    )
    expect(room?.status).toBe('playing')
    expect(room?.started_at).not.toBeNull()

    const progress = await one<{ n: number }>(
      db,
      'select count(*)::int as n from progress where room_id = $1',
      [host.roomId],
    )
    expect(progress?.n).toBe(14) // 2 equipos × 7 zonas

    const again = await captureError(() => startGame(db!, host))
    expect(again).toBe('estado_invalido')
  })

  it('finish_game falla desde el lobby', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const message = await captureError(() => finishGame(db!, host))
    expect(message).toBe('estado_invalido')
  })

  it('finish_game solo lo hace el anfitrión', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)

    const denied = await captureError(() => finishGame(db!, other))
    expect(denied).toBe('no_anfitrion')

    const done = await finishGame(db, host)
    expect(field<string>(done, 'status')).toBe('finished')
  })
})

describe('submit_answer', () => {
  it('un fallo suma error; el enfriamiento solo aplica tras un fallo', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)

    const wrong = await submitAnswer(db, host, 'limite', 0, 3)
    expect(field<boolean>(wrong, 'correct')).toBe(false)
    expect(field<number>(wrong, 'errors')).toBe(1)

    const cooled = await captureError(() => submitAnswer(db!, host, 'limite', 0, 0))
    expect(cooled).toBe('enfriamiento')

    await ageAttempts(db, 2)
    const fixed = await submitAnswer(db, host, 'limite', 0, 0)
    expect(field<boolean>(fixed, 'correct')).toBe(true)
    expect(field<number>(fixed, 'current_step')).toBe(1)

    // Acierto tras acierto sin esperar: no hay enfriamiento.
    const next = await submitAnswer(db, host, 'limite', 1, 1)
    expect(field<boolean>(next, 'correct')).toBe(true)
  })

  it('rechaza un paso saltado con paso_invalido:N', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)
    await submitAnswer(db, host, 'limite', 0, 0)
    const message = await captureError(() => submitAnswer(db!, host, 'limite', 0, 0))
    expect(message).toBe('paso_invalido:1')
  })

  it('conquista la zona y luego no permite repetir', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)

    await submitAnswer(db, host, 'limite', 0, 0)
    await submitAnswer(db, host, 'limite', 1, 1)
    const conquered = await submitAnswer(db, host, 'limite', 2, 1)
    expect(field<string>(conquered, 'zone_status')).toBe('conquered')

    const repeat = await captureError(() => submitAnswer(db!, host, 'limite', 0, 0))
    expect(repeat).toBe('zona_conquistada')
  })

  it('termina el equipo y la sala cuando todos los activos terminan', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)

    await conquerAll(db, host)
    const afterA = await one<{ status: string; finished: string | null }>(
      db,
      `select r.status as status,
              (select finished_at from teams where id = $2)::text as finished
       from rooms r where r.id = $1`,
      [host.roomId, host.teamId],
    )
    expect(afterA?.finished).not.toBeNull()
    expect(afterA?.status).toBe('playing')

    await conquerAll(db, other)
    const room = await one<{ status: string }>(db, 'select status from rooms where id = $1', [
      host.roomId,
    ])
    expect(room?.status).toBe('finished')

    const afterFinished = await captureError(() => submitAnswer(db!, host, 'limite', 0, 0))
    expect(afterFinished).toBe('estado_invalido')
  })

  it('rechaza un token falso', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)

    const message = await captureError(() =>
      rpcAsAnon(db!, 'submit_answer', {
        p_room_id: host.roomId,
        p_team_id: host.teamId,
        p_team_token: 'falso',
        p_zone: 'limite',
        p_step: 0,
        p_response: 0,
      }),
    )
    expect(message).toBe('token_invalido')
  })
})

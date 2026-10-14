import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  captureError,
  createDb,
  createRoom,
  field,
  joinRoom,
  one,
  rpcAsAnon,
  startGame,
} from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

describe('create_room y join_room', () => {
  it('crea una sala en lobby con anfitrión y token', async () => {
    db = await createDb()
    const room = await createRoom(db, '  Alfa  Equipo  ')

    const row = await one<{ status: string; host_team_id: string; current_step: number }>(
      db,
      'select status, host_team_id, current_step from rooms where id = $1',
      [room.roomId],
    )
    expect(row?.status).toBe('lobby')
    expect(row?.current_step).toBe(0)
    expect(row?.host_team_id).toBe(room.teamId)

    const team = await one<{ name: string; color: string }>(
      db,
      'select name, color from teams where id = $1',
      [room.teamId],
    )
    expect(team?.name).toBe('Alfa Equipo')
    expect(team?.color).toBeTruthy()
  })

  it('rechaza un nombre vacío', async () => {
    db = await createDb()
    const message = await captureError(() =>
      rpcAsAnon(db!, 'create_room', { p_team_name: '   ' }),
    )
    expect(message).toBe('nombre_invalido')
  })

  it('rechaza unirte a una sala inexistente', async () => {
    db = await createDb()
    const message = await captureError(() => joinRoom(db!, 'ZZZZZZ', 'Beta'))
    expect(message).toBe('sala_no_existe')
  })

  it('rechaza un nombre repetido (insensible a mayúsculas)', async () => {
    db = await createDb()
    const room = await createRoom(db, 'Alfa')
    const message = await captureError(() => joinRoom(db!, room.code, 'aLFA'))
    expect(message).toBe('nombre_repetido')
  })

  it('asigna colores distintos a cada equipo', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    for (const name of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      await joinRoom(db, host.code, name)
    }
    const colors = await db.query<{ color: string }>('select color from teams')
    const unique = new Set(colors.rows.map((row) => row.color))
    expect(colors.rows).toHaveLength(8)
    expect(unique.size).toBe(8)
  })

  it('llena la sala a los 8 equipos y rechaza al noveno', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    for (const name of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      await joinRoom(db, host.code, name)
    }
    const message = await captureError(() => joinRoom(db!, host.code, 'I'))
    expect(message).toBe('sala_llena')
  })

  it('no permite unirse tras iniciar la partida', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)
    const message = await captureError(() => joinRoom(db!, host.code, 'B'))
    expect(message).toBe('sala_no_lobby')
  })

  it('rejoin válido devuelve is_host, left_at y code; falla con token falso', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)

    const ok = await rpcAsAnon(db, 'rejoin', {
      p_room_id: host.roomId,
      p_team_id: host.teamId,
      p_team_token: host.teamToken,
    })
    expect(field<boolean>(ok, 'is_host')).toBe(true)
    expect(field<unknown>(ok, 'left_at')).toBeNull()
    expect(field<string>(ok, 'code')).toBe(host.code)

    const bad = await captureError(() =>
      rpcAsAnon(db!, 'rejoin', {
        p_room_id: host.roomId,
        p_team_id: host.teamId,
        p_team_token: 'malo',
      }),
    )
    expect(bad).toBe('token_invalido')
  })
})

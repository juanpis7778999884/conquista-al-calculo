import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  captureError,
  conquerAll,
  createDb,
  createRoom,
  field,
  joinRoom,
  leaveRoom,
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

describe('leave_room', () => {
  it('en lobby borra el equipo y traspasa el anfitrión', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')

    const result = await leaveRoom(db, host)
    expect(field<string>(result, 'status')).toBe('left')

    const room = await one<{ host_team_id: string }>(
      db,
      'select host_team_id from rooms where id = $1',
      [host.roomId],
    )
    expect(room?.host_team_id).toBe(other.teamId)

    const gone = await one<{ n: number }>(db, 'select count(*)::int as n from teams where id = $1', [
      host.teamId,
    ])
    expect(gone?.n).toBe(0)
  })

  it('si el último equipo sale en lobby, borra la sala', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const result = await leaveRoom(db, host)
    expect(field<string>(result, 'status')).toBe('closed')

    const gone = await one<{ n: number }>(db, 'select count(*)::int as n from rooms where id = $1', [
      host.roomId,
    ])
    expect(gone?.n).toBe(0)
  })

  it('en playing marca left_at y traspasa el anfitrión sin borrar el equipo', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)

    await leaveRoom(db, host)

    const leftTeam = await one<{ left_at: string | null; n: number }>(
      db,
      `select (select left_at from teams where id = $1)::text as left_at,
              (select count(*)::int from teams where id = $1) as n`,
      [host.teamId],
    )
    expect(leftTeam?.n).toBe(1)
    expect(leftTeam?.left_at).not.toBeNull()

    const room = await one<{ host_team_id: string; status: string }>(
      db,
      'select host_team_id, status from rooms where id = $1',
      [host.roomId],
    )
    expect(room?.host_team_id).toBe(other.teamId)
    expect(room?.status).toBe('playing')
  })

  it('cierra la sala si tras abandonar solo quedan equipos ya terminados', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)

    await conquerAll(db, other)
    await leaveRoom(db, host)

    const room = await one<{ status: string }>(db, 'select status from rooms where id = $1', [
      host.roomId,
    ])
    expect(room?.status).toBe('finished')
  })

  it('en finished marca left_at y traspasa el anfitrión', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const other = await joinRoom(db, host.code, 'B')
    await startGame(db, host)
    await conquerAll(db, host)
    await conquerAll(db, other)

    const result = await leaveRoom(db, host)
    expect(field<string>(result, 'status')).toBe('finished')

    const room = await one<{ status: string; host_team_id: string }>(
      db,
      'select status, host_team_id from rooms where id = $1',
      [host.roomId],
    )
    expect(room?.status).toBe('finished')
    expect(room?.host_team_id).toBe(other.teamId)

    const team = await one<{ left_at: string | null }>(
      db,
      'select left_at from teams where id = $1',
      [host.teamId],
    )
    expect(team?.left_at).not.toBeNull()
  })

  it('en finished, si sale el último equipo, borra la sala', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    await startGame(db, host)
    await conquerAll(db, host)

    const result = await leaveRoom(db, host)
    expect(field<string>(result, 'status')).toBe('closed')
    const room = await one<{ n: number }>(db, 'select count(*)::int as n from rooms where id = $1', [
      host.roomId,
    ])
    expect(room?.n).toBe(0)
  })
})

describe('códigos privados', () => {
  it('rooms.code ya no sirve para unirse; el código de room_codes sí', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const opaque = await one<{ code: string }>(db, 'select code from rooms where id = $1', [
      host.roomId,
    ])

    const byOpaque = await captureError(() => joinRoom(db!, opaque!.code, 'B'))
    expect(byOpaque).toBe('sala_no_existe')

    const joined = await joinRoom(db, host.code, 'B')
    expect(joined.roomId).toBe(host.roomId)
  })

  it('resolve_room_code traduce el código al room_id', async () => {
    db = await createDb()
    const host = await createRoom(db, 'A')
    const resolved = await rpcAsAnon(db, 'resolve_room_code', { p_code: host.code.toLowerCase() })
    expect(resolved).toBe(host.roomId)

    const unknown = await rpcAsAnon(db, 'resolve_room_code', { p_code: 'ZZZZZZ' })
    expect(unknown).toBeNull()
  })
})

describe('cleanup_old_rooms', () => {
  it('borra salas viejas con cascada', async () => {
    db = await createDb()

    const room = await one<{ id: string }>(
      db,
      `insert into rooms (code, status, created_at, current_step)
       values ('vieja', 'playing', now() - interval '25 hours', 0)
       returning id`,
    )
    const team = await one<{ id: string }>(
      db,
      `insert into teams (room_id, name, color) values ($1, 'X', '#000') returning id`,
      [room!.id],
    )
    await db.exec(`
      insert into progress (team_id, room_id, zone) values ('${team!.id}', '${room!.id}', 'z');
      insert into attempts (team_id, room_id, zone, step, correct)
        values ('${team!.id}', '${room!.id}', 'z', 0, true);
      insert into team_secrets (team_id, token) values ('${team!.id}', 'tok');
      insert into room_secrets (room_id, host_token) values ('${room!.id}', 'h');
      insert into room_codes (room_id, code) values ('${room!.id}', 'ABC123');
    `)

    const deleted = await one<{ n: number }>(db, 'select public.cleanup_old_rooms() as n')
    expect(deleted?.n).toBe(1)

    const counts = await one<{
      rooms: number
      teams: number
      progress: number
      attempts: number
      secrets: number
      codes: number
    }>(
      db,
      `select
        (select count(*)::int from rooms) as rooms,
        (select count(*)::int from teams) as teams,
        (select count(*)::int from progress) as progress,
        (select count(*)::int from attempts) as attempts,
        (select count(*)::int from team_secrets) as secrets,
        (select count(*)::int from room_codes) as codes`,
    )
    expect(counts).toEqual({ rooms: 0, teams: 0, progress: 0, attempts: 0, secrets: 0, codes: 0 })
  })
})

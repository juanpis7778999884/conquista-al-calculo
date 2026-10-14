import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asAnon, captureError, createDb, createRoom, one, rpcAsAnon } from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

async function countAsAnon(source: PGlite, table: string): Promise<number> {
  const row = await asAnon(source, () =>
    one<{ n: number }>(source, `select count(*)::int as n from public.${table}`),
  )
  return row?.n ?? -1
}

describe('permisos de anon', () => {
  it('no puede escribir en rooms (ni insert, ni update, ni delete)', async () => {
    db = await createDb()
    const { roomId } = await createRoom(db, 'Alfa')

    const insert = await captureError(() =>
      asAnon(db!, () => db!.exec("insert into rooms (code, status, current_step) values ('x', 'lobby', 0)")),
    )
    expect(insert).toMatch(/permission denied|denegado/i)

    const update = await captureError(() =>
      asAnon(db!, () => db!.exec(`update rooms set status = 'finished' where id = '${roomId}'`)),
    )
    expect(update).toMatch(/permission denied|denegado/i)

    const remove = await captureError(() =>
      asAnon(db!, () => db!.exec('delete from rooms')),
    )
    expect(remove).toMatch(/permission denied|denegado/i)
  })

  it('no puede escribir en teams ni progress', async () => {
    db = await createDb()
    const { roomId } = await createRoom(db, 'Alfa')

    const teams = await captureError(() =>
      asAnon(db!, () =>
        db!.exec(
          `insert into teams (room_id, name, color) values ('${roomId}', 'X', '#000')`,
        ),
      ),
    )
    expect(teams).toMatch(/permission denied|denegado/i)

    const progress = await captureError(() =>
      asAnon(db!, () =>
        db!.exec(`insert into progress (team_id, zone) values (gen_random_uuid(), 'z')`),
      ),
    )
    expect(progress).toMatch(/permission denied|denegado/i)
  })

  it('no ve answers, attempts ni room_secrets (RLS sin políticas)', async () => {
    db = await createDb()
    await createRoom(db, 'Alfa')

    expect(await countAsAnon(db, 'answers')).toBe(0)
    expect(await countAsAnon(db, 'attempts')).toBe(0)
    expect(await countAsAnon(db, 'room_secrets')).toBe(0)
  })

  it('no puede leer team_secrets ni room_codes (sin privilegio)', async () => {
    db = await createDb()
    await createRoom(db, 'Alfa')

    const secrets = await captureError(() => countAsAnon(db!, 'team_secrets'))
    expect(secrets).toMatch(/permission denied|denegado/i)

    const codes = await captureError(() => countAsAnon(db!, 'room_codes'))
    expect(codes).toMatch(/permission denied|denegado/i)
  })

  it('solo lee rooms, teams y progress', async () => {
    db = await createDb()
    const { roomId } = await createRoom(db, 'Alfa')

    const rooms = await asAnon(db, () =>
      one<{ n: number }>(db!, 'select count(*)::int as n from rooms where id = $1', [roomId]),
    )
    expect(rooms?.n).toBe(1)

    const teams = await asAnon(db, () => one<{ n: number }>(db!, 'select count(*)::int as n from teams'))
    expect(teams?.n).toBe(1)
  })

  it('no puede ejecutar cleanup_old_rooms', async () => {
    db = await createDb()
    const message = await captureError(() =>
      asAnon(db!, () => db!.exec('select public.cleanup_old_rooms()')),
    )
    expect(message).toMatch(/permission denied|denegado/i)
  })

  it('no puede ejecutar una RPC con token falso', async () => {
    db = await createDb()
    const room = await createRoom(db, 'Alfa')
    const message = await captureError(() =>
      rpcAsAnon(db!, 'start_game', {
        p_room_id: room.roomId,
        p_team_id: room.teamId,
        p_team_token: 'falso',
      }),
    )
    expect(message).toBe('no_anfitrion')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

import { BUNDLE, SEED, createDbFromScratch, one } from './helpers/db'

let db: PGlite | null = null

afterEach(async () => {
  if (db) {
    await db.close()
    db = null
  }
})

describe('arranque desde una base vacía', () => {
  it('aplica base + migraciones 1→4 + seed y carga el fixture', async () => {
    db = await createDbFromScratch()
    const answers = await one<{ n: number }>(db, 'select count(*)::int as n from answers')
    expect(answers?.n).toBe(21)
  })

  it('aplica el bundle completo dos veces seguidas sin fallar', async () => {
    db = new PGlite()
    await db.exec(BUNDLE)
    await db.exec(BUNDLE)
    await db.exec(SEED)

    const answers = await one<{ n: number }>(db, 'select count(*)::int as n from answers')
    expect(answers?.n).toBe(21)

    const fn = await one<{ n: number }>(
      db,
      `select count(*)::int as n from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'create_room'`,
    )
    expect(fn?.n).toBe(1)
  })

  it('el bundle incluye la definición canónica de submit_answer', async () => {
    db = new PGlite()
    await db.exec(BUNDLE)
    const fn = await one<{ def: string }>(
      db,
      `select pg_get_functiondef('public.submit_answer(uuid,uuid,text,text,int,int)'::regprocedure) as def`,
    )
    expect(fn?.def).toBeTruthy()
  })
})

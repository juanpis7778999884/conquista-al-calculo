// Construye UNA sola vez la base de datos de pruebas (esquema base +
// migraciones 1→4 x2 + seed) y guarda un volcado de PGlite en tests/.tmp.
// Cada prueba restaura una copia rápida de ese volcado (ver helpers/db.ts).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DUMP_PATH, applyMigrations, createBaseDb, loadSeed } from './helpers/db'

export default async function setup() {
  const db = await createBaseDb()
  await applyMigrations(db)
  await loadSeed(db)

  const dump = await db.dumpDataDir()
  const buffer = Buffer.from(await dump.arrayBuffer())
  mkdirSync(dirname(DUMP_PATH), { recursive: true })
  writeFileSync(DUMP_PATH, buffer)
  await db.close()
}

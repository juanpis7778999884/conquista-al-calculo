// Concatena las migraciones en orden en supabase/bundle.sql.
//
// Ejecuta SIEMPRE supabase/bundle.sql completo en el SQL Editor de Supabase:
// nunca una migración suelta. El bundle es idempotente y termina con la
// definición canónica de todas las RPC (migración 4).
//
// Uso: node scripts/build-sql-bundle.mjs  (o pnpm sql:bundle)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = resolve(root, 'supabase', 'migrations')
const bundlePath = resolve(root, 'supabase', 'bundle.sql')

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

if (files.length === 0) {
  throw new Error(`No hay migraciones en ${migrationsDir}`)
}

const parts = [
  '-- ===========================================================================',
  '-- Conquista Cálculo · bundle.sql (GENERADO, no editar a mano).',
  '-- Regenerar con: pnpm sql:bundle',
  '--',
  '-- Orden de ejecución: base → hardening → ronda2 → ronda2_fase_c → ronda3.',
  '-- Ejecuta SIEMPRE este archivo completo; nunca una migración suelta.',
  '-- ===========================================================================',
  '',
]

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  parts.push(`-- >>> ${file} >>>`)
  parts.push(sql.trimEnd())
  parts.push('')
}

writeFileSync(bundlePath, `${parts.join('\n')}\n`)
console.log(`bundle.sql generado con ${files.length} migraciones:`)
for (const file of files) console.log(`  - ${file}`)

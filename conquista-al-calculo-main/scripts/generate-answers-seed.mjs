// Genera scripts/answers.source.json y supabase/seed_answers.sql.
//
// Fuentes de verdad (en orden de prioridad):
//   1. Si data/questions.ts todavía contiene `answer:`, se extraen de ahí
//      y se reescribe scripts/answers.source.json.
//   2. Si no, se usan las respuestas guardadas en scripts/answers.source.json.
//
// Uso: node scripts/generate-answers-seed.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const questionsPath = resolve(root, 'data', 'questions.ts')
const sourcePath = resolve(root, 'scripts', 'answers.source.json')
const seedPath = resolve(root, 'supabase', 'seed_answers.sql')

function parseAnswersFromQuestions(ts) {
  const byZone = {}
  const segments = ts.split(/\{\s*id:\s*'/).slice(1)
  for (const segment of segments) {
    const idMatch = segment.match(/^([A-Za-z0-9_-]+)'/)
    if (!idMatch) continue
    const answers = [...segment.matchAll(/answer:\s*(\d+)/g)].map((m) => Number(m[1]))
    if (answers.length > 0) {
      byZone[idMatch[1]] = answers
    }
  }
  return byZone
}

function loadAnswers() {
  let answers = null
  if (existsSync(sourcePath)) {
    answers = JSON.parse(readFileSync(sourcePath, 'utf8'))
  }

  const parsed = parseAnswersFromQuestions(readFileSync(questionsPath, 'utf8'))
  if (Object.keys(parsed).length > 0) {
    answers = parsed
    writeFileSync(sourcePath, `${JSON.stringify(answers, null, 2)}\n`)
    console.log(`answers.source.json actualizado desde data/questions.ts (${Object.keys(answers).length} zonas)`)
  }

  if (!answers) {
    throw new Error('No se encontraron respuestas ni en data/questions.ts ni en scripts/answers.source.json')
  }
  return answers
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function buildSeed(answers) {
  const rows = []
  for (const [zone, steps] of Object.entries(answers)) {
    steps.forEach((answer, step) => {
      rows.push(`  (${sqlLiteral(zone)}, ${step}, ${Number(answer)})`)
    })
  }

  return [
    '-- Generado por scripts/generate-answers-seed.mjs. No editar a mano.',
    '-- Ejecutar en el SQL Editor de Supabase DESPUÉS de la migración.',
    'insert into answers (zone, step, answer) values',
    rows.join(',\n'),
    'on conflict (zone, step) do update set answer = excluded.answer;',
    '',
  ].join('\n')
}

const answers = loadAnswers()
mkdirSync(dirname(seedPath), { recursive: true })
writeFileSync(seedPath, buildSeed(answers))
const total = Object.values(answers).reduce((sum, steps) => sum + steps.length, 0)
console.log(`seed_answers.sql generado con ${total} respuestas`)

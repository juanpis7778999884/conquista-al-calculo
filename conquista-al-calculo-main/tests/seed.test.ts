import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { zones } from '@/data/questions'

const answersSource = JSON.parse(
  readFileSync(fileURLToPath(new URL('../scripts/answers.source.json', import.meta.url)), 'utf8'),
) as Record<string, number[]>

const seedSql = readFileSync(
  fileURLToPath(new URL('../supabase/seed_answers.sql', import.meta.url)),
  'utf8',
)

function parseSeedRows(sql: string): Map<string, number> {
  const rows = new Map<string, number>()
  const pattern = /\('([^']+)',\s*(\d+),\s*(\d+)\)/g
  let match = pattern.exec(sql)
  while (match !== null) {
    rows.set(`${match[1]}:${match[2]}`, Number(match[3]))
    match = pattern.exec(sql)
  }
  return rows
}

describe('supabase/seed_answers.sql', () => {
  const seedRows = parseSeedRows(seedSql)

  it('coincide con scripts/answers.source.json', () => {
    for (const [zone, answers] of Object.entries(answersSource)) {
      answers.forEach((answer, step) => {
        expect(seedRows.get(`${zone}:${step}`)).toBe(answer)
      })
    }
    expect(seedRows.size).toBe(Object.values(answersSource).reduce((n, a) => n + a.length, 0))
  })

  it('cada zona tiene 3 pasos y una respuesta por paso', () => {
    for (const zone of zones) {
      expect(zone.steps).toHaveLength(3)
      expect(answersSource[zone.id]).toHaveLength(3)
    }
  })

  it('cada respuesta apunta a una opción existente', () => {
    for (const zone of zones) {
      const answers = answersSource[zone.id]
      expect(answers).toBeDefined()
      zone.steps.forEach((step, index) => {
        const answer = answers[index]
        expect(answer).toBeGreaterThanOrEqual(0)
        expect(answer).toBeLessThan(step.options.length)
      })
    }
  })
})

import { describe, expect, it } from 'vitest'

import { zones } from '@/data/questions'

describe('contenido de las zonas', () => {
  it('cada paso tiene una explicación no vacía', () => {
    for (const zone of zones) {
      for (const [index, step] of zone.steps.entries()) {
        expect(step.explanation, `${zone.id} paso ${index}`).toBeTruthy()
        expect(step.explanation.trim().length, `${zone.id} paso ${index}`).toBeGreaterThan(10)
      }
    }
  })

  it('cada paso tiene al menos dos opciones y un enunciado', () => {
    for (const zone of zones) {
      for (const [index, step] of zone.steps.entries()) {
        expect(step.options.length, `${zone.id} paso ${index}`).toBeGreaterThanOrEqual(2)
        expect(step.prompt.trim().length, `${zone.id} paso ${index}`).toBeGreaterThan(0)
      }
    }
  })
})

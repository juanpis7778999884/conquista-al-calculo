import { describe, expect, it } from 'vitest'

import {
  buildRanking,
  computeEffectiveSeconds,
  formatTime,
  shuffledOrder,
} from '@/lib/game'
import type { ProgressRow, TeamRow } from '@/lib/supabase/client'

function makeTeam(overrides: Partial<TeamRow> & { id: string }): TeamRow {
  return {
    id: overrides.id,
    room_id: overrides.room_id ?? 'r1',
    name: overrides.name ?? overrides.id,
    color: overrides.color ?? '#ffffff',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    finished_at: overrides.finished_at ?? null,
  }
}

function makeProgress(
  teamId: string,
  zone: string,
  status: string,
  errors = 0,
): ProgressRow {
  return {
    id: `${teamId}-${zone}`,
    team_id: teamId,
    room_id: 'r1',
    zone,
    status,
    errors,
    conquered_at: status === 'conquered' ? '2026-01-01T00:05:00.000Z' : null,
    current_step: 0,
  }
}

describe('computeEffectiveSeconds', () => {
  it('suma la penalización de 15 s por error', () => {
    const seconds = computeEffectiveSeconds(
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:01:40.000Z',
      2,
    )
    expect(seconds).toBe(130)
  })

  it('devuelve null si el equipo no ha terminado', () => {
    expect(computeEffectiveSeconds('2026-01-01T00:00:00.000Z', null, 3)).toBeNull()
    expect(computeEffectiveSeconds(null, null, 0)).toBeNull()
  })
})

describe('formatTime', () => {
  it('formatea minutos y segundos', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65)).toBe('01:05')
  })

  it('incluye horas cuando hace falta', () => {
    expect(formatTime(3661)).toBe('1:01:01')
  })
})

describe('shuffledOrder', () => {
  it('es determinista para la misma semilla', () => {
    expect(shuffledOrder(5, 'equipo:zona:0')).toEqual(shuffledOrder(5, 'equipo:zona:0'))
  })

  it('devuelve una permutación de los índices', () => {
    const order = shuffledOrder(6, 'equipo:zona:1')
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('cambia con la semilla', () => {
    const a = shuffledOrder(8, 'equipoA:zona:0')
    const b = shuffledOrder(8, 'equipoB:zona:0')
    expect(a).not.toEqual(b)
  })
})

describe('buildRanking', () => {
  const startedAt = '2026-01-01T00:00:00.000Z'

  it('ordena por zonas conquistadas, luego por tiempo efectivo', () => {
    const teams = [
      makeTeam({ id: 'A', created_at: '2026-01-01T00:00:01.000Z' }),
      makeTeam({
        id: 'B',
        created_at: '2026-01-01T00:00:02.000Z',
        finished_at: '2026-01-01T00:02:00.000Z',
      }),
      makeTeam({ id: 'C' }),
    ]
    const progress = [
      makeProgress('A', 'z1', 'conquered'),
      makeProgress('A', 'z2', 'conquered'),
      makeProgress('B', 'z1', 'conquered'),
      makeProgress('B', 'z2', 'conquered'),
      makeProgress('C', 'z1', 'conquered'),
      makeProgress('C', 'z2', 'conquered'),
      makeProgress('C', 'z3', 'conquered'),
    ]

    const ranking = buildRanking(teams, progress, startedAt)
    expect(ranking.map((stat) => stat.teamId)).toEqual(['C', 'B', 'A'])
  })

  it('desempata por errores y luego por fecha de creación', () => {
    const teams = [
      makeTeam({ id: 'A', created_at: '2026-01-01T00:00:02.000Z' }),
      makeTeam({ id: 'B', created_at: '2026-01-01T00:00:01.000Z' }),
    ]
    const progress = [
      makeProgress('A', 'z1', 'conquered', 2),
      makeProgress('B', 'z1', 'conquered', 0),
    ]

    const ranking = buildRanking(teams, progress, startedAt)
    expect(ranking.map((stat) => stat.teamId)).toEqual(['B', 'A'])
  })
})

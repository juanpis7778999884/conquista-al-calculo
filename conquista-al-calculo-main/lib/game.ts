import { zones } from '@/data/questions'
import type { ProgressRow, TeamRow } from './supabase/client'

export const ERROR_PENALTY_SECONDS = 15
export const TOTAL_ZONES = zones.length
export const STEPS_PER_ZONE = zones.length > 0 ? zones[0].steps.length : 0
export const MAX_TEAMS = 8

export type TeamStat = {
  teamId: string
  name: string
  color: string
  createdAt: string
  finishedAt: string | null
  leftAt: string | null
  conquered: number
  errors: number
  effectiveSeconds: number | null
  lastConqueredAt: string | null
}

export function normalizeTeamName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, 24)
}

export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
}

export function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffleSeed(teamId: string, zone: string, step: number): string {
  return `${teamId}:${zone}:${step}`
}

export function shuffledOrder(count: number, seed: string): number[] {
  const order = Array.from({ length: count }, (_, index) => index)
  const random = mulberry32(hashString(seed))
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order
}

export function computeEffectiveSeconds(
  startedAt: string | null,
  finishedAt: string | null,
  errors: number,
): number | null {
  if (!startedAt || !finishedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, Math.round((end - start) / 1000)) + ERROR_PENALTY_SECONDS * errors
}

export function liveElapsedSeconds(
  startedAt: string | null,
  finishedAt: string | null,
  errors: number,
  nowMs: number,
): number | null {
  if (!startedAt) return null
  if (finishedAt) return computeEffectiveSeconds(startedAt, finishedAt, errors)
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return null
  return Math.max(0, Math.round((nowMs - start) / 1000)) + ERROR_PENALTY_SECONDS * errors
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`
  }
  return `${paddedMinutes}:${paddedSeconds}`
}

export function totalErrors(progress: ProgressRow[], teamId: string): number {
  return progress.reduce((sum, row) => (row.team_id === teamId ? sum + row.errors : sum), 0)
}

export function conqueredZones(progress: ProgressRow[], teamId: string): string[] {
  return progress
    .filter((row) => row.team_id === teamId && row.status === 'conquered')
    .map((row) => row.zone)
}

export function buildRanking(
  teams: TeamRow[],
  progress: ProgressRow[],
  startedAt: string | null,
): TeamStat[] {
  const stats = teams.map<TeamStat>((team) => {
    const own = progress.filter((row) => row.team_id === team.id)
    const errors = own.reduce((sum, row) => sum + row.errors, 0)
    const conqueredTimes = own
      .filter((row) => row.status === 'conquered' && row.conquered_at)
      .map((row) => row.conquered_at as string)
    const lastConqueredAt =
      conqueredTimes.length > 0 ? conqueredTimes.reduce((max, value) => (value > max ? value : max)) : null
    return {
      teamId: team.id,
      name: team.name,
      color: team.color,
      createdAt: team.created_at,
      finishedAt: team.finished_at,
      leftAt: team.left_at,
      conquered: own.filter((row) => row.status === 'conquered').length,
      errors,
      effectiveSeconds: computeEffectiveSeconds(startedAt, team.finished_at, errors),
      lastConqueredAt,
    }
  })

  const timestamp = (value: string | null): number =>
    value ? new Date(value).getTime() : Number.POSITIVE_INFINITY

  stats.sort((a, b) => {
    if (b.conquered !== a.conquered) return b.conquered - a.conquered
    const timeA = a.effectiveSeconds ?? Number.POSITIVE_INFINITY
    const timeB = b.effectiveSeconds ?? Number.POSITIVE_INFINITY
    if (timeA !== timeB) return timeA - timeB
    const lastA = timestamp(a.lastConqueredAt)
    const lastB = timestamp(b.lastConqueredAt)
    if (lastA !== lastB) return lastA - lastB
    if (a.errors !== b.errors) return a.errors - b.errors
    if (a.createdAt < b.createdAt) return -1
    if (a.createdAt > b.createdAt) return 1
    return 0
  })

  return stats
}

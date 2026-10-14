'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { formatTime, buildRanking, TOTAL_ZONES } from '@/lib/game'
import {
  getSupabase,
  isSupabaseConfigured,
  type ProgressRow,
  type RoomReport,
  type RoomRow,
  type TeamRow,
} from '@/lib/supabase/client'

type Phase = 'loading' | 'missing' | 'notfound' | 'ready' | 'error'

export default function ProyectorPage() {
  const supabase = useMemo(() => getSupabase(), [])
  const configured = isSupabaseConfigured()
  const [phase, setPhase] = useState<Phase>('loading')
  const [code, setCode] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [report, setReport] = useState<RoomReport | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const value = (params.get('sala') ?? '').trim().toUpperCase()
    if (!value) {
      setPhase('missing')
      return
    }
    setCode(value)
  }, [])

  const load = useCallback(
    async (id: string) => {
      if (!supabase) return
      const [roomResult, teamsResult, progressResult] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', id).maybeSingle(),
        supabase.from('teams').select('*').eq('room_id', id),
        supabase.from('progress').select('*').eq('room_id', id),
      ])
      if (roomResult.error || !roomResult.data) {
        setPhase('error')
        return
      }
      setRoom(roomResult.data)
      setTeams(teamsResult.data ?? [])
      setProgress(progressResult.data ?? [])
      if (roomResult.data.status === 'finished') {
        const reportResult = await supabase.rpc('room_report', { p_room_id: id })
        setReport(reportResult.data ?? null)
      } else {
        setReport(null)
      }
      setPhase('ready')
    },
    [supabase],
  )

  useEffect(() => {
    if (!supabase || !code) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('resolve_room_code', { p_code: code })
      if (cancelled) return
      if (error || !data) {
        setPhase('notfound')
        return
      }
      setRoomId(data)
      await load(data)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, code, load])

  useEffect(() => {
    if (!roomId) return
    const interval = window.setInterval(() => {
      void load(roomId)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [roomId, load])

  const ranking = useMemo(
    () => buildRanking(teams, progress, room?.started_at ?? null),
    [teams, progress, room?.started_at],
  )

  if (!configured || !supabase) {
    return (
      <main className="min-h-dvh bg-fondo text-crema flex items-center justify-center p-10 text-center">
        <p className="text-tenue">Falta configurar Supabase.</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-fondo text-crema px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <header className="text-center border-b border-linea pb-6">
          <p className="text-oro uppercase tracking-[.35em] text-sm">Conquista Cálculo</p>
          <h1 className="font-serif text-5xl sm:text-6xl text-oro-claro mt-2">
            {code || 'Proyector'}
          </h1>
          <p className="mt-3 text-tenue">
            {phase === 'ready' && room
              ? room.status === 'lobby'
                ? 'Sala en el campamento'
                : room.status === 'playing'
                  ? 'Partida en curso'
                  : 'Partida terminada'
              : phase === 'missing'
                ? 'Añade ?sala=CODIGO a la URL'
                : phase === 'notfound'
                  ? 'No existe ninguna sala con ese código'
                  : phase === 'error'
                    ? 'No se pudo cargar la sala'
                    : 'Cargando…'}
          </p>
        </header>

        {phase === 'ready' && room?.status === 'finished' && report ? (
          <section className="mt-8">
            <h2 className="font-serif text-3xl text-oro-claro mb-4">Resultado final</h2>
            <table className="w-full border-collapse text-lg">
              <thead>
                <tr className="text-tenue text-sm uppercase tracking-widest">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">Equipo</th>
                  <th className="text-right py-2">Zonas</th>
                  <th className="text-right py-2">Errores</th>
                  <th className="text-right py-2">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((team, index) => (
                  <tr key={team.team_id} className="border-b border-linea">
                    <td className="py-3 font-serif text-2xl text-oro">{index + 1}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-3">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        {team.name}
                        {team.left_at !== null && team.finished_at === null && (
                          <span className="text-xs text-aviso">Abandonó</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {team.zonas}/{TOTAL_ZONES}
                    </td>
                    <td className="py-3 text-right">{team.errores}</td>
                    <td className="py-3 text-right font-mono">
                      {team.segundos === null ? 'Sin terminar' : formatTime(team.segundos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : phase === 'ready' && room ? (
          <section className="mt-8">
            <h2 className="font-serif text-3xl text-oro-claro mb-4">
              {room.status === 'lobby' ? 'Equipos' : 'Ranking en vivo'}
            </h2>
            <ol className="grid gap-3">
              {ranking.map((team, index) => (
                <li
                  key={team.teamId}
                  className="border border-linea bg-panel px-5 py-4 flex items-center gap-5"
                >
                  <span className="font-serif text-3xl text-oro w-10">{index + 1}</span>
                  <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                  <span className="flex-1 font-semibold text-xl">{team.name}</span>
                  <span className="font-mono text-xl text-oro-claro">
                    {team.conquered}/{TOTAL_ZONES}
                  </span>
                </li>
              ))}
              {ranking.length === 0 && <li className="text-tenue">Todavía no hay equipos.</li>}
            </ol>
          </section>
        ) : null}

        <p className="mt-10 text-center text-xs text-tenue">
          Vista de proyector · se actualiza sola cada 5 segundos
        </p>
      </div>
    </main>
  )
}

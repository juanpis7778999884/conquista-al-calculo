'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { zones } from '@/data/questions'
import { ConnectionBadge } from '@/components/connection-badge'
import { MapSvg } from '@/components/map-svg'
import { QuestionModal } from '@/components/question-modal'
import { Ranking } from '@/components/ranking'
import { parseRpcError } from '@/lib/errors'
import {
  buildRanking,
  conqueredZones,
  formatTime,
  liveElapsedSeconds,
  shuffleSeed,
  shuffledOrder,
  totalErrors,
  TOTAL_ZONES,
} from '@/lib/game'
import type { Session } from '@/lib/session'
import type { ConnectionState } from '@/hooks/use-room'
import type { Database, ProgressRow, RoomRow, TeamRow } from '@/lib/supabase/client'

type GameScreenProps = {
  supabase: SupabaseClient<Database>
  room: RoomRow
  teams: TeamRow[]
  progress: ProgressRow[]
  session: Session
  isHost: boolean
  connection: ConnectionState
  serverOffsetMs: number
  refresh: () => Promise<void>
  onLeave: (message?: string) => void
}

function Timer({ seconds }: { seconds: number | null }) {
  return (
    <span className="tabular-nums">{seconds === null ? '--:--' : formatTime(seconds)}</span>
  )
}

export function GameScreen({
  supabase,
  room,
  teams,
  progress,
  session,
  isHost,
  connection,
  serverOffsetMs,
  refresh,
  onLeave,
}: GameScreenProps) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const busyRef = useRef(false)

  const ownTeamId = session.teamId
  const ranking = useMemo(
    () => buildRanking(teams, progress, room.started_at),
    [teams, progress, room.started_at],
  )
  const ownTeam = teams.find((team) => team.id === ownTeamId) ?? null
  const ownStat = ranking.find((stat) => stat.teamId === ownTeamId) ?? null
  const ownConquered = useMemo(() => conqueredZones(progress, ownTeamId), [progress, ownTeamId])
  const ownErrors = useMemo(() => totalErrors(progress, ownTeamId), [progress, ownTeamId])

  const liveSeconds = useMemo(() => {
    return liveElapsedSeconds(room.started_at, ownTeam?.finished_at ?? null, ownErrors, nowMs)
  }, [room.started_at, ownTeam, ownErrors, nowMs])

  useEffect(() => {
    const tick = () => setNowMs(Date.now() + serverOffsetMs)
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [serverOffsetMs])

  const selectedZoneData = selectedZone ? zones.find((zone) => zone.id === selectedZone) : undefined
  const selectedProgress: ProgressRow | undefined = selectedZone
    ? progress.find((row) => row.team_id === ownTeamId && row.zone === selectedZone)
    : undefined
  const currentStep = selectedProgress?.current_step ?? 0
  const stepData = selectedZoneData?.steps[currentStep]
  const displayOrder =
    stepData && selectedZoneData
      ? shuffledOrder(
          stepData.options.length,
          shuffleSeed(ownTeamId, selectedZoneData.id, currentStep),
        )
      : []
  const onCooldown = nowMs < cooldownUntil

  function handleSelectZone(zoneId: string) {
    if (conqueredZones(progress, ownTeamId).includes(zoneId)) return
    setFeedback('')
    setLiveMessage('')
    setSelectedZone(zoneId)
  }

  function closeModal() {
    setSelectedZone(null)
    setFeedback('')
  }

  async function handleSubmitAnswer(originalIndex: number) {
    if (!selectedZone || busyRef.current) return
    const zone = selectedZone
    busyRef.current = true
    setBusy(true)
    const currentProgress = progress.find(
      (row) => row.team_id === ownTeamId && row.zone === zone,
    )
    const step = currentProgress?.current_step ?? 0
    const { data, error } = await supabase.rpc('submit_answer', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
      p_zone: zone,
      p_step: step,
      p_response: originalIndex,
    })
    busyRef.current = false
    setBusy(false)

    if (error || !data) {
      const parsed = parseRpcError(error)
      if (
        parsed.code === 'token_invalido' ||
        parsed.code === 'equipo_no_existe' ||
        parsed.code === 'sala_no_existe'
      ) {
        onLeave(parsed.message)
        return
      }
      if (parsed.code === 'paso_invalido') {
        setFeedback(parsed.message)
        setLiveMessage(parsed.message)
        await refresh()
        return
      }
      if (parsed.code === 'enfriamiento') {
        setCooldownUntil(Date.now() + 1000)
        setFeedback(parsed.message)
        setLiveMessage(parsed.message)
        return
      }
      setFeedback(parsed.message)
      setLiveMessage(parsed.message)
      return
    }

    if (!data.correct) {
      setCooldownUntil(Date.now() + 1000)
      setFeedback('Respuesta incorrecta: +15 segundos. Revisa el concepto e inténtalo de nuevo.')
      setLiveMessage('Respuesta incorrecta. Se suman 15 segundos.')
    } else if (data.zone_status === 'conquered') {
      setLiveMessage('Zona conquistada.')
      closeModal()
    } else {
      setFeedback('Correcto.')
      setLiveMessage('Correcto.')
    }
    await refresh()
  }

  async function handleFinishGame() {
    if (!session.hostToken) return
    if (!window.confirm('¿Terminar la partida para todos? No se podrá continuar.')) return
    setBusy(true)
    const { error } = await supabase.rpc('finish_game', {
      p_room_id: session.roomId,
      p_host_token: session.hostToken,
    })
    setBusy(false)
    if (error) {
      setFeedback(parseRpcError(error).message)
      return
    }
    await refresh()
  }

  const ownPosition = ranking.findIndex((stat) => stat.teamId === ownTeamId) + 1

  return (
    <main className="min-h-dvh bg-fondo text-crema px-4 py-5">
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-center gap-4 justify-between border-b border-linea pb-4">
          <div>
            <p className="text-oro uppercase tracking-[.25em] text-xs">
              Conquista Cálculo · {room.code}
            </p>
            <h1 className="font-serif text-3xl text-oro-claro">{ownTeam?.name ?? 'Tu equipo'}</h1>
            <ConnectionBadge state={connection} />
          </div>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-tenue">Tiempo</p>
              <p className="font-mono text-2xl text-oro-claro">
                <Timer seconds={liveSeconds} />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-tenue">Zonas</p>
              <p className="font-mono text-2xl text-aviso">
                {ownConquered.length}/{TOTAL_ZONES}
              </p>
            </div>
          </div>
        </header>
        <div className="flex flex-wrap gap-3 justify-end mt-4">
          {isHost && (
            <button
              type="button"
              onClick={() => void handleFinishGame()}
              disabled={busy}
              className="border border-aviso px-4 py-2 text-sm text-aviso disabled:opacity-50"
            >
              Terminar partida
            </button>
          )}
          <button
            type="button"
            onClick={() => onLeave()}
            className="border border-marco px-4 py-2 text-sm text-tenue"
          >
            Salir de la sala
          </button>
        </div>
        <div className="grid lg:grid-cols-[1fr_280px] gap-6 mt-6">
          <section className="border border-marco bg-panel p-2 sm:p-5">
            <MapSvg conquered={ownConquered} active={selectedZone} onSelect={handleSelectZone} />
            <div className="flex gap-5 text-xs text-tenue justify-center border-t border-linea pt-4">
              <span>Disponible</span>
              <span>Conquistada</span>
            </div>
          </section>
          <Ranking stats={ranking} ownTeamId={ownTeamId} />
        </div>
      </div>

      {selectedZoneData && stepData && (
        <QuestionModal
          zone={selectedZoneData}
          step={currentStep}
          optionOrder={displayOrder}
          feedback={feedback}
          busy={busy}
          cooldown={onCooldown}
          onAnswer={(index) => void handleSubmitAnswer(index)}
          onClose={closeModal}
        />
      )}

      {ownTeam?.finished_at && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-panel border border-mapa-trazo p-8 text-center max-w-md">
            <p className="text-oro uppercase tracking-widest text-xs">Partida terminada</p>
            <h2 className="font-serif text-4xl text-oro-claro mt-3">¡Conquista completada!</h2>
            <p className="mt-4 text-tenue">
              {ownTeam.name} ha conquistado las {TOTAL_ZONES} zonas en{' '}
              <Timer seconds={ownStat?.effectiveSeconds ?? null} />.
            </p>
            <p className="mt-2 text-tenue">
              Posición actual: {ownPosition} de {teams.length}.
            </p>
            <button
              type="button"
              onClick={() => onLeave()}
              className="mt-6 w-full bg-boton py-3 font-bold text-[#182a29]"
            >
              Salir de la sala
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

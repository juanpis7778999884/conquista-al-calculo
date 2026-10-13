'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { zones } from '@/data/questions'
import { useRoom } from '@/hooks/use-room'
import { useSession } from '@/hooks/use-session'
import { parseRpcError } from '@/lib/errors'
import {
  buildRanking,
  conqueredZones,
  formatTime,
  liveElapsedSeconds,
  normalizeRoomCode,
  normalizeTeamName,
  shuffleSeed,
  shuffledOrder,
  totalErrors,
  type TeamStat,
} from '@/lib/game'
import {
  getSupabase,
  isSupabaseConfigured,
  type ProgressRow,
} from '@/lib/supabase/client'

const TOTAL_ZONES = zones.length
const MAX_TEAMS = 8

function Timer({ seconds }: { seconds: number | null }) {
  return <span className="tabular-nums">{seconds === null ? '--:--' : formatTime(seconds)}</span>
}

function MapSVG({
  conquered,
  active,
  onSelect,
}: {
  conquered: string[]
  active: string | null
  onSelect: (id: string) => void
}) {
  return (
    <svg
      viewBox="0 0 700 380"
      className="w-full"
      role="img"
      aria-label="Mapa de las zonas de Conquista Cálculo"
    >
      <path
        d="M30 250 Q30 125 145 40 Q270 -10 410 30 Q585 20 670 180 Q700 290 615 350 Q410 390 210 350 Q60 340 30 250Z"
        fill="#142c2d"
        stroke="#b9955b"
        strokeWidth="3"
      />
      {zones.map((zone) => {
        const won = conquered.includes(zone.id)
        const selected = active === zone.id
        const x = zone.labelX ?? 350
        const y = zone.labelY ?? 220
        return (
          <g
            key={zone.id}
            role="button"
            tabIndex={0}
            aria-label={`${zone.name}${won ? ', conquistada' : ', disponible'}`}
            onClick={() => onSelect(zone.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(zone.id)
              }
            }}
            className="cursor-pointer outline-none"
          >
            <path
              d={zone.path}
              fill={won ? '#bc704d' : selected ? '#536e64' : '#294446'}
              stroke={selected ? '#f3cd76' : won ? '#e3b86c' : '#78918a'}
              strokeWidth={selected ? 4 : 2}
            />
            {won && (
              <path
                d={`M${x - 12} ${y + 12} l8 8 16-20`}
                fill="none"
                stroke="#f6e5bd"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )}
            <text
              x={x}
              y={y}
              textAnchor="middle"
              fill="#f6e5bd"
              fontSize="12"
              fontFamily="Georgia"
              fontWeight="bold"
            >
              {zone.theme}
            </text>
          </g>
        )
      })}
      <text
        x="350"
        y="28"
        textAnchor="middle"
        fill="#e3b86c"
        fontSize="11"
        letterSpacing="4"
        fontFamily="Georgia"
      >
        LAS TIERRAS DEL CÁLCULO
      </text>
    </svg>
  )
}

function Ranking({ stats, ownTeamId }: { stats: TeamStat[]; ownTeamId: string | null }) {
  return (
    <aside className="border border-[#365451] p-5">
      <h2 className="font-serif text-2xl text-[#f4d892]">Ranking en vivo</h2>
      {stats.map((team, index) => (
        <div
          key={team.teamId}
          className={`border-b border-[#365451] py-3 flex items-center gap-3 ${team.teamId === ownTeamId ? 'bg-[#1d3a3a]' : ''}`}
        >
          <span className="font-serif text-xl text-[#e3b86c]">{index + 1}</span>
          <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {team.name}
              {team.teamId === ownTeamId && <span className="ml-2 text-xs text-[#e3b86c]">(tú)</span>}
            </p>
            <p className="text-xs text-[#a9c0b6]">
              {team.conquered}/{TOTAL_ZONES} zonas · {team.errors} errores
              {team.effectiveSeconds !== null && ` · ${formatTime(team.effectiveSeconds)}`}
            </p>
          </div>
        </div>
      ))}
    </aside>
  )
}

function ConnectionBadge({ state }: { state: 'connecting' | 'connected' | 'reconnecting' }) {
  if (state === 'connected') return null
  return (
    <p role="status" className="text-xs text-[#e3b86c]">
      {state === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}
    </p>
  )
}

export default function Page() {
  const supabase = useMemo(() => getSupabase(), [])
  const configured = isSupabaseConfigured()
  const { session, hydrated, setSession, clear } = useSession()
  const { room, teams, progress, connection, serverOffsetMs, refresh, calibrate } = useRoom(
    supabase,
    session?.roomId ?? null,
  )

  const [teamName, setTeamName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [homeFeedback, setHomeFeedback] = useState('')
  const [notice, setNotice] = useState('')
  const [lobbyNotice, setLobbyNotice] = useState('')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [gameFeedback, setGameFeedback] = useState('')
  const [answerBusy, setAnswerBusy] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [finalView, setFinalView] = useState<'podio' | 'mapa'>('podio')
  const [rejoinChecked, setRejoinChecked] = useState(false)
  const busyRef = useRef(false)
  const selectedZoneRef = useRef<string | null>(null)

  useEffect(() => {
    selectedZoneRef.current = selectedZone
  }, [selectedZone])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('sala')
    if (code) setRoomCode(normalizeRoomCode(code))
  }, [])

  const handleLeave = useCallback(
    (message = '') => {
      clear()
      setSelectedZone(null)
      setGameFeedback('')
      setRoomCode('')
      setTeamName('')
      setNotice(message)
    },
    [clear],
  )

  useEffect(() => {
    if (!hydrated || !supabase) return
    if (!session) {
      setRejoinChecked(true)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('rejoin', {
        p_room_id: session.roomId,
        p_team_id: session.teamId,
        p_team_token: session.teamToken,
      })
      if (cancelled) return
      if (error || !data) {
        handleLeave('Tu sesión anterior ya no es válida. Vuelve a entrar a la sala.')
      } else {
        calibrate(data.server_now)
      }
      setRejoinChecked(true)
    })()
    return () => {
      cancelled = true
    }
  }, [hydrated, supabase, session, calibrate, handleLeave])

  const ranking = useMemo(
    () => buildRanking(teams, progress, room?.started_at ?? null),
    [teams, progress, room?.started_at],
  )
  const ownTeamId = session?.teamId ?? null
  const ownTeam = teams.find((team) => team.id === ownTeamId) ?? null
  const ownStat = ranking.find((stat) => stat.teamId === ownTeamId) ?? null
  const ownConquered = useMemo(
    () => (ownTeamId ? conqueredZones(progress, ownTeamId) : []),
    [progress, ownTeamId],
  )
  const ownErrors = useMemo(
    () => (ownTeamId ? totalErrors(progress, ownTeamId) : 0),
    [progress, ownTeamId],
  )
  const isHost = Boolean(session?.hostToken && room?.host_team_id === ownTeamId)

  const liveSeconds = useMemo(() => {
    if (!room) return null
    if (room.status === 'finished') {
      return ownStat?.effectiveSeconds ?? null
    }
    return liveElapsedSeconds(room.started_at, ownTeam?.finished_at ?? null, ownErrors, nowMs)
  }, [room, ownStat, ownTeam, ownErrors, nowMs])

  useEffect(() => {
    if (!room || room.status !== 'playing') return
    const tick = () => setNowMs(Date.now() + serverOffsetMs)
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [room, serverOffsetMs])

  async function handleCreate() {
    if (!supabase) return
    const name = normalizeTeamName(teamName)
    if (!name) {
      setHomeFeedback('Escribe un nombre de equipo.')
      return
    }
    setBusy(true)
    setHomeFeedback('')
    setNotice('')
    const { data, error } = await supabase.rpc('create_room', { p_team_name: name })
    setBusy(false)
    if (error || !data) {
      setHomeFeedback(parseRpcError(error).message)
      return
    }
    calibrate(data.server_now)
    setSession({
      roomId: data.room_id,
      teamId: data.team_id,
      teamToken: data.team_token,
      hostToken: data.host_token,
    })
  }

  async function handleJoin() {
    if (!supabase) return
    const name = normalizeTeamName(teamName)
    if (!name) {
      setHomeFeedback('Escribe un nombre de equipo.')
      return
    }
    const code = normalizeRoomCode(roomCode)
    if (!code) {
      setHomeFeedback('Escribe el código de la sala.')
      return
    }
    setBusy(true)
    setHomeFeedback('')
    setNotice('')
    const { data, error } = await supabase.rpc('join_room', {
      p_code: code,
      p_team_name: name,
    })
    setBusy(false)
    if (error || !data) {
      setHomeFeedback(parseRpcError(error).message)
      return
    }
    calibrate(data.server_now)
    setSession({ roomId: data.room_id, teamId: data.team_id, teamToken: data.team_token })
  }

  async function handleStartGame() {
    if (!supabase || !session?.hostToken || !session.roomId) return
    setBusy(true)
    setLobbyNotice('')
    const { error } = await supabase.rpc('start_game', {
      p_room_id: session.roomId,
      p_host_token: session.hostToken,
    })
    setBusy(false)
    if (error) {
      setLobbyNotice(parseRpcError(error).message)
      return
    }
    await refresh()
  }

  async function handleFinishGame() {
    if (!supabase || !session?.hostToken || !session.roomId) return
    if (!window.confirm('¿Terminar la partida para todos? No se podrá continuar.')) return
    setBusy(true)
    const { error } = await supabase.rpc('finish_game', {
      p_room_id: session.roomId,
      p_host_token: session.hostToken,
    })
    setBusy(false)
    if (error) {
      setGameFeedback(parseRpcError(error).message)
      return
    }
    await refresh()
  }

  async function handleCopy() {
    if (!room) return
    const link = `${window.location.origin}/?sala=${room.code}`
    try {
      await navigator.clipboard.writeText(link)
      setLobbyNotice('Enlace copiado al portapapeles.')
    } catch {
      setLobbyNotice(`Comparte el código: ${room.code}`)
    }
  }

  function handleSelectZone(zoneId: string) {
    if (conqueredZones(progress, ownTeamId ?? '').includes(zoneId)) return
    setGameFeedback('')
    setSelectedZone(zoneId)
  }

  function closeModal() {
    setSelectedZone(null)
    setGameFeedback('')
  }

  async function handleSubmitAnswer(originalIndex: number) {
    if (!supabase || !session || !selectedZone || busyRef.current) return
    const movedZone = selectedZoneRef.current
    if (!movedZone) return
    busyRef.current = true
    setAnswerBusy(true)
    const progressRow = progress.find(
      (row) => row.team_id === session.teamId && row.zone === movedZone,
    )
    const step = progressRow?.current_step ?? 0
    const { data, error } = await supabase.rpc('submit_answer', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
      p_zone: movedZone,
      p_step: step,
      p_response: originalIndex,
    })
    busyRef.current = false
    setAnswerBusy(false)

    if (error || !data) {
      const parsed = parseRpcError(error)
      if (parsed.code === 'token_invalido' || parsed.code === 'equipo_no_existe' || parsed.code === 'sala_no_existe') {
        handleLeave(parsed.message)
        return
      }
      if (parsed.code === 'paso_invalido') {
        setGameFeedback(parsed.message)
        await refresh()
        return
      }
      if (parsed.code === 'enfriamiento') {
        setCooldownUntil(Date.now() + 1000)
        setGameFeedback(parsed.message)
        return
      }
      setGameFeedback(parsed.message)
      return
    }

    if (!data.correct) {
      setCooldownUntil(Date.now() + 1000)
      setGameFeedback('Respuesta incorrecta: +15 segundos. Revisa el concepto e inténtalo de nuevo.')
    } else if (data.zone_status === 'conquered') {
      setGameFeedback('Zona conquistada.')
      setSelectedZone(null)
    } else {
      setGameFeedback('Correcto.')
    }
    await refresh()
  }

  if (!hydrated || (session && !rejoinChecked)) {
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] flex items-center justify-center">
        <p>Reanudando sesión…</p>
      </main>
    )
  }

  if (!configured || !supabase) {
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-6 py-16 flex items-center justify-center text-center">
        <section className="max-w-lg border border-[#806744] bg-[#183233] p-8">
          <h1 className="font-serif text-3xl text-[#f4d892]">Falta configurar Supabase</h1>
          <p className="mt-4 text-[#a9c0b6] leading-relaxed">
            Define las variables <code>NEXT_PUBLIC_SUPABASE_URL</code> y la clave pública
            (<code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> o{' '}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>) en un archivo{' '}
            <code>.env.local</code> y vuelve a cargar la página.
          </p>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-5 py-10 flex items-center justify-center">
        <section className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
          <div>
            <p className="text-[#e3b86c] uppercase tracking-[.25em] text-sm mb-3">
              Una carrera de ingenio
            </p>
            <h1 className="font-serif text-6xl sm:text-8xl leading-[.85] text-[#f4d892]">
              Conquista
              <br />
              <i className="text-[#e48661]">Cálculo</i>
            </h1>
            <p className="mt-8 max-w-md text-[#a9c0b6] leading-relaxed">
              {TOTAL_ZONES} territorios. Tres desafíos por zona. Una partida real para equipos
              que compiten en la misma sala.
            </p>
            <form
              className="mt-10 grid gap-3 max-w-md"
              onSubmit={(event) => {
                event.preventDefault()
                if (roomCode) void handleJoin()
                else void handleCreate()
              }}
            >
              <input
                aria-label="Nombre del equipo"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                maxLength={24}
                autoComplete="off"
                placeholder="Nombre de tu equipo"
                className="bg-[#183233] border border-[#806744] px-4 py-3"
              />
              <input
                aria-label="Código de sala"
                value={roomCode}
                onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
                placeholder="Código para unirte (opcional)"
                className="bg-[#183233] border border-[#806744] px-4 py-3 uppercase"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-[#d87855] px-7 py-4 font-bold text-[#182a29] disabled:opacity-50"
                >
                  {busy ? 'Conectando…' : roomCode ? 'Unirme a la sala' : 'Crear sala'}
                </button>
              </div>
              {(homeFeedback || notice) && (
                <p role="alert" className="text-[#e48661] text-sm">
                  {homeFeedback || notice}
                </p>
              )}
            </form>
          </div>
          <div className="border border-[#806744] bg-[#183233] p-4 rotate-1">
            <div className="bg-[#e3b86c] text-[#182a29] px-3 py-1 text-xs uppercase tracking-widest inline-block">
              Mapa de campaña
            </div>
            <MapSVG conquered={[]} active={null} onSelect={() => {}} />
            <div className="flex justify-between border-t border-[#44615d] pt-3 text-xs text-[#a9c0b6]">
              <span>
                {TOTAL_ZONES} zonas · {zones.reduce((sum, zone) => sum + zone.steps.length, 0)} retos
              </span>
              <span>Datos sincronizados</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] flex items-center justify-center">
        <p>Cargando la sala…</p>
      </main>
    )
  }

  if (room.status === 'lobby') {
    const orderedTeams = [...teams].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-5 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="border-b border-[#365451] pb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[#e3b86c] tracking-[.25em] uppercase text-xs">
                Sala de expedición
              </p>
              <h1 className="font-serif text-4xl text-[#f4d892]">El campamento</h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ConnectionBadge state={connection} />
              <button
                type="button"
                onClick={() => handleLeave()}
                className="border border-[#806744] px-3 py-1 text-xs text-[#a9c0b6]"
              >
                Salir de la sala
              </button>
            </div>
          </header>
          <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 mt-10">
            <div className="border border-[#806744] bg-[#183233] p-7 text-center">
              <p className="text-xs uppercase tracking-widest text-[#a9c0b6]">Código de sala</p>
              <p className="font-mono text-6xl tracking-[.25em] text-[#f4d892] mt-3">
                {room.code}
              </p>
              <p className="text-sm text-[#a9c0b6] mt-4">
                Comparte este código con los demás equipos.
              </p>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="mt-4 border border-[#806744] px-4 py-2 text-sm"
              >
                Copiar código/enlace
              </button>
            </div>
            <div>
              <p className="text-sm text-[#a9c0b6] mb-3">
                Equipos preparados{' '}
                <span className="text-[#f4d892]">
                  {teams.length}/{MAX_TEAMS}
                </span>
              </p>
              {orderedTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center gap-3 border-b border-[#365451] py-4"
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                  <span className="font-semibold">{team.name}</span>
                  {team.id === room.host_team_id && (
                    <span className="text-xs text-[#e3b86c]">Anfitrión</span>
                  )}
                  {team.id === ownTeamId && <span className="text-xs text-[#a9c0b6]">(tú)</span>}
                  <span className="ml-auto text-xs text-[#a9c0b6]">
                    {team.id === ownTeamId ? 'Tú' : 'Listo'}
                  </span>
                </div>
              ))}
              {isHost ? (
                <button
                  type="button"
                  onClick={() => void handleStartGame()}
                  disabled={busy}
                  className="mt-8 w-full bg-[#d87855] py-4 font-bold text-[#182a29] disabled:opacity-50"
                >
                  {busy ? 'Iniciando…' : 'Iniciar partida'}
                </button>
              ) : (
                <p className="mt-8 w-full border border-[#365451] py-4 text-center text-[#a9c0b6]">
                  Esperando al anfitrión…
                </p>
              )}
              {lobbyNotice && (
                <p role="status" className="mt-4 text-sm text-[#e3b86c]">
                  {lobbyNotice}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (room.status === 'finished') {
    return (
      <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-5 py-10">
        <div className="max-w-3xl mx-auto">
          <header className="text-center border-b border-[#365451] pb-6">
            <p className="text-[#e3b86c] uppercase tracking-widest text-xs">Partida terminada</p>
            <h1 className="font-serif text-5xl text-[#f4d892] mt-2">Podio de la conquista</h1>
          </header>
          <div className="mt-8 flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => setFinalView('podio')}
              className={`px-4 py-2 border ${finalView === 'podio' ? 'border-[#f4d892] text-[#f4d892]' : 'border-[#365451]'}`}
            >
              Podio
            </button>
            <button
              type="button"
              onClick={() => setFinalView('mapa')}
              className={`px-4 py-2 border ${finalView === 'mapa' ? 'border-[#f4d892] text-[#f4d892]' : 'border-[#365451]'}`}
            >
              Ver mapa
            </button>
          </div>
          {finalView === 'podio' ? (
            <ol className="mt-8 grid gap-3">
              {ranking.map((team, index) => (
                <li
                  key={team.teamId}
                  className={`border p-4 flex items-center gap-4 ${team.teamId === ownTeamId ? 'border-[#f4d892] bg-[#1d3a3a]' : 'border-[#365451]'}`}
                >
                  <span className="font-serif text-3xl text-[#e3b86c] w-10">{index + 1}</span>
                  <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                  <div className="flex-1">
                    <p className="font-semibold">{team.name}</p>
                    <p className="text-sm text-[#a9c0b6]">
                      {team.conquered}/{TOTAL_ZONES} zonas · {team.errors} errores
                    </p>
                  </div>
                  <span className="font-mono text-xl text-[#f4d892]">
                    {team.effectiveSeconds === null ? 'Sin terminar' : formatTime(team.effectiveSeconds)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-8 border border-[#806744] bg-[#183233] p-2 sm:p-5">
              <MapSVG conquered={ownConquered} active={null} onSelect={() => {}} />
            </div>
          )}
          <button
            type="button"
            onClick={() => handleLeave()}
            className="mt-8 w-full bg-[#d87855] py-4 font-bold text-[#182a29]"
          >
            Jugar de nuevo
          </button>
        </div>
      </main>
    )
  }

  const selectedZoneData = selectedZone ? zones.find((zone) => zone.id === selectedZone) : undefined
  const selectedProgress: ProgressRow | undefined = selectedZone
    ? progress.find((row) => row.team_id === ownTeamId && row.zone === selectedZone)
    : undefined
  const currentStep = selectedProgress?.current_step ?? 0
  const stepData =
    selectedZoneData && selectedZoneData.steps[currentStep]
      ? selectedZoneData.steps[currentStep]
      : undefined
  const displayOrder =
    stepData && ownTeamId && selectedZoneData
      ? shuffledOrder(stepData.options.length, shuffleSeed(ownTeamId, selectedZoneData.id, currentStep))
      : []
  const onCooldown = nowMs < cooldownUntil
  const zoneDone = selectedProgress?.status === 'conquered'

  return (
    <main className="min-h-screen bg-[#102526] text-[#f6e5bd] px-4 py-5">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap items-center gap-4 justify-between border-b border-[#365451] pb-4">
          <div>
            <p className="text-[#e3b86c] uppercase tracking-[.25em] text-xs">
              Conquista Cálculo · {room.code}
            </p>
            <h1 className="font-serif text-3xl text-[#f4d892]">{ownTeam?.name ?? 'Tu equipo'}</h1>
            <ConnectionBadge state={connection} />
          </div>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#a9c0b6]">Tiempo</p>
              <p className="font-mono text-2xl text-[#f4d892]">
                <Timer seconds={liveSeconds} />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#a9c0b6]">Zonas</p>
              <p className="font-mono text-2xl text-[#e48661]">
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
              className="border border-[#e48661] px-4 py-2 text-sm text-[#e48661] disabled:opacity-50"
            >
              Terminar partida
            </button>
          )}
          <button
            type="button"
            onClick={() => handleLeave()}
            className="border border-[#806744] px-4 py-2 text-sm text-[#a9c0b6]"
          >
            Salir de la sala
          </button>
        </div>
        <div className="grid lg:grid-cols-[1fr_280px] gap-6 mt-6">
          <section className="border border-[#806744] bg-[#183233] p-2 sm:p-5">
            <MapSVG
              conquered={ownConquered}
              active={selectedZone}
              onSelect={handleSelectZone}
            />
            <div className="flex gap-5 text-xs text-[#a9c0b6] justify-center border-t border-[#365451] pt-4">
              <span>Disponible</span>
              <span>Conquistada</span>
            </div>
          </section>
          <Ranking stats={ranking} ownTeamId={ownTeamId} />
        </div>
      </div>

      {selectedZoneData && stepData && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="question-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeModal()
          }}
        >
          <div className="bg-[#183233] border border-[#b9955b] max-w-xl w-full p-7">
            <div className="flex justify-between">
              <div>
                <p className="text-[#e3b86c] uppercase text-xs tracking-widest">
                  {selectedZoneData.theme} · Reto {currentStep + 1}/{selectedZoneData.steps.length}
                </p>
                <h2 id="question-title" className="font-serif text-3xl text-[#f4d892] mt-2">
                  {selectedZoneData.question}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => closeModal()}
                className="text-2xl"
              >
                ×
              </button>
            </div>
            <p className="mt-8 text-lg">{stepData.prompt}</p>
            <div className="grid gap-3 mt-5">
              {displayOrder.map((originalIndex) => (
                <button
                  key={originalIndex}
                  type="button"
                  disabled={answerBusy || onCooldown || zoneDone}
                  onClick={() => void handleSubmitAnswer(originalIndex)}
                  className="border border-[#44615d] px-4 py-3 text-left hover:border-[#f4d892] disabled:opacity-50"
                >
                  {stepData.options[originalIndex]}
                </button>
              ))}
            </div>
            {gameFeedback && (
              <p role="status" className="mt-5 text-[#e3b86c]">
                {gameFeedback}
              </p>
            )}
            {onCooldown && (
              <p role="status" className="mt-2 text-xs text-[#e48661]">
                Espera un segundo…
              </p>
            )}
          </div>
        </div>
      )}

      {ownTeam?.finished_at && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#183233] border border-[#b9955b] p-8 text-center max-w-md">
            <p className="text-[#e3b86c] uppercase tracking-widest text-xs">Partida terminada</p>
            <h2 className="font-serif text-4xl text-[#f4d892] mt-3">¡Conquista completada!</h2>
            <p className="mt-4 text-[#a9c0b6]">
              {ownTeam.name} ha conquistado las {TOTAL_ZONES} zonas en{' '}
              <Timer seconds={ownStat?.effectiveSeconds ?? null} />.
            </p>
            <p className="mt-2 text-[#a9c0b6]">
              Posición actual: {ranking.findIndex((stat) => stat.teamId === ownTeamId) + 1} de{' '}
              {teams.length}.
            </p>
            <button
              type="button"
              onClick={() => handleLeave()}
              className="mt-6 w-full bg-[#d87855] py-3 font-bold text-[#182a29]"
            >
              Salir de la sala
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

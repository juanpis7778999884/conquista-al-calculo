'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConfigScreen } from '@/components/config-screen'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FinalScreen } from '@/components/final-screen'
import { GameScreen } from '@/components/game-screen'
import { HomeScreen } from '@/components/home-screen'
import { LobbyScreen } from '@/components/lobby-screen'
import { OfflineScreen } from '@/components/offline-screen'
import { useRoom } from '@/hooks/use-room'
import { useSession } from '@/hooks/use-session'
import { classifyRejoinError, parseRpcError } from '@/lib/errors'
import { buildRanking, conqueredZones } from '@/lib/game'
import type { Session } from '@/lib/session'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

function LoadingScreen() {
  return (
    <main className="min-h-dvh bg-fondo text-crema flex items-center justify-center">
      <p>Reanudando sesión…</p>
    </main>
  )
}

type RejoinStatus = 'checking' | 'ok' | 'offline'
type ConfirmAction = 'leave' | 'finish'

export default function Page() {
  const supabase = useMemo(() => getSupabase(), [])
  const configured = isSupabaseConfigured()
  const { session, hydrated, setSession, clear } = useSession()
  const { room, teams, progress, connection, serverOffsetMs, refresh, calibrate } = useRoom(
    supabase,
    session?.roomId ?? null,
  )

  const [notice, setNotice] = useState('')
  const [lobbyNotice, setLobbyNotice] = useState('')
  const [gameNotice, setGameNotice] = useState('')
  const [lobbyBusy, setLobbyBusy] = useState(false)
  const [rejoinStatus, setRejoinStatus] = useState<RejoinStatus>('checking')
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const checkedKeyRef = useRef<string | null>(null)

  const handleLeave = useCallback(
    (message = '') => {
      clear()
      setLobbyNotice('')
      setGameNotice('')
      setNotice(message)
    },
    [clear],
  )

  const handleSession = useCallback(
    (next: Session, serverNow: string) => {
      calibrate(serverNow)
      checkedKeyRef.current = `${next.roomId}:${next.teamId}:${next.teamToken}`
      setRejoinStatus('ok')
      setNotice('')
      setSession(next)
    },
    [calibrate, setSession],
  )

  const performRejoin = useCallback(async (): Promise<RejoinStatus> => {
    if (!supabase || !session) return 'offline'
    const { data, error } = await supabase.rpc('rejoin', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
    })
    if (data && !error) {
      if (data.code && data.code !== session.code) {
        setSession({ ...session, code: data.code })
      }
      calibrate(data.server_now)
      return 'ok'
    }
    if (classifyRejoinError(error) === 'clear') {
      handleLeave('Tu sesión anterior ya no es válida. Vuelve a entrar a la sala.')
      return 'ok'
    }
    return 'offline'
  }, [supabase, session, calibrate, setSession, handleLeave])

  useEffect(() => {
    if (!hydrated || !supabase || !session) return
    const key = `${session.roomId}:${session.teamId}:${session.teamToken}`
    if (checkedKeyRef.current === key) return
    checkedKeyRef.current = key
    let cancelled = false
    setRejoinStatus('checking')
    void performRejoin().then((result) => {
      if (!cancelled) setRejoinStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [hydrated, supabase, session, performRejoin])

  useEffect(() => {
    if (rejoinStatus !== 'offline') return
    const interval = window.setInterval(() => {
      void performRejoin().then((result) => {
        if (result === 'ok') setRejoinStatus('ok')
      })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [rejoinStatus, performRejoin])

  const ranking = useMemo(
    () => buildRanking(teams, progress, room?.started_at ?? null),
    [teams, progress, room?.started_at],
  )
  const ownConquered = useMemo(
    () => (session ? conqueredZones(progress, session.teamId) : []),
    [progress, session],
  )

  async function handleStartGame() {
    if (!supabase || !session) return
    setLobbyBusy(true)
    setLobbyNotice('')
    const { error } = await supabase.rpc('start_game', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
    })
    setLobbyBusy(false)
    if (error) {
      setLobbyNotice(parseRpcError(error).message)
      return
    }
    await refresh()
  }

  async function handleCopy() {
    if (!session?.code) return
    const link = `${window.location.origin}/?sala=${session.code}`
    try {
      await navigator.clipboard.writeText(link)
      setLobbyNotice('Enlace copiado al portapapeles.')
    } catch {
      setLobbyNotice(`Comparte el código: ${session.code}`)
    }
  }

  async function confirmLeave() {
    setConfirm(null)
    if (supabase && session) {
      await supabase.rpc('leave_room', {
        p_room_id: session.roomId,
        p_team_id: session.teamId,
        p_team_token: session.teamToken,
      })
    }
    handleLeave()
  }

  async function confirmFinish() {
    setConfirm(null)
    if (!supabase || !session) return
    setLobbyBusy(true)
    const { error } = await supabase.rpc('finish_game', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
    })
    setLobbyBusy(false)
    if (error) {
      setGameNotice(parseRpcError(error).message)
      return
    }
    setGameNotice('')
    await refresh()
  }

  async function handleReset() {
    if (!supabase || !session) return
    setLobbyBusy(true)
    setGameNotice('')
    const { error } = await supabase.rpc('reset_room', {
      p_room_id: session.roomId,
      p_team_id: session.teamId,
      p_team_token: session.teamToken,
    })
    setLobbyBusy(false)
    if (error) {
      setGameNotice(parseRpcError(error).message)
      return
    }
    setGameNotice('')
    await refresh()
  }

  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      tone="danger"
      title={confirm === 'finish' ? 'Terminar la partida' : 'Salir de la sala'}
      message={
        confirm === 'finish'
          ? 'Se terminará la partida para todos los equipos y se mostrará el podio. No se puede deshacer.'
          : room?.status === 'finished'
            ? 'Saldrás de la sala y tu equipo no aparecerá en la próxima partida.'
            : 'Perderás tu equipo y no podrás volver a esta partida. La partida seguirá para los demás equipos.'
      }
      confirmLabel={confirm === 'finish' ? 'Terminar' : 'Salir'}
      onConfirm={() => void (confirm === 'finish' ? confirmFinish() : confirmLeave())}
      onCancel={() => setConfirm(null)}
    />
  )

  if (!hydrated) {
    return <LoadingScreen />
  }

  if (!configured || !supabase) {
    return <ConfigScreen />
  }

  if (!session) {
    return (
      <>
        <HomeScreen supabase={supabase} notice={notice} onSession={handleSession} />
        {dialog}
      </>
    )
  }

  if (rejoinStatus === 'checking') {
    return <LoadingScreen />
  }

  if (rejoinStatus === 'offline') {
    return (
      <OfflineScreen
        onRetry={() => {
          setRejoinStatus('checking')
          void performRejoin().then((result) => setRejoinStatus(result))
        }}
      />
    )
  }

  if (!room) {
    return <LoadingScreen />
  }

  const isHost = room.host_team_id === session.teamId

  if (room.status === 'lobby') {
    return (
      <>
        <LobbyScreen
          room={room}
          code={session.code}
          teams={teams}
          ownTeamId={session.teamId}
          isHost={isHost}
          busy={lobbyBusy}
          connection={connection}
          notice={lobbyNotice}
          onStart={() => void handleStartGame()}
          onRequestLeave={() => setConfirm('leave')}
          onCopy={() => void handleCopy()}
        />
        {dialog}
      </>
    )
  }

  if (room.status === 'finished') {
    return (
      <>
        <FinalScreen
          ranking={ranking}
          ownTeamId={session.teamId}
          ownConquered={ownConquered}
          isHost={isHost}
          busy={lobbyBusy}
          notice={gameNotice}
          onReset={() => void handleReset()}
          onLeave={() => setConfirm('leave')}
        />
        {dialog}
      </>
    )
  }

  return (
    <>
      <GameScreen
        supabase={supabase}
        room={room}
        teams={teams}
        progress={progress}
        session={session}
        isHost={isHost}
        connection={connection}
        serverOffsetMs={serverOffsetMs}
        refresh={refresh}
        notice={gameNotice}
        onLeave={handleLeave}
        onRequestLeave={() => setConfirm('leave')}
        onRequestFinish={() => setConfirm('finish')}
      />
      {dialog}
    </>
  )
}

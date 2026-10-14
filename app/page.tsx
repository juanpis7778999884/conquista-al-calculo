'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfigScreen } from '@/components/config-screen'
import { FinalScreen } from '@/components/final-screen'
import { GameScreen } from '@/components/game-screen'
import { HomeScreen } from '@/components/home-screen'
import { LobbyScreen } from '@/components/lobby-screen'
import { useRoom } from '@/hooks/use-room'
import { useSession } from '@/hooks/use-session'
import { parseRpcError } from '@/lib/errors'
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
  const [lobbyBusy, setLobbyBusy] = useState(false)
  const [rejoinChecked, setRejoinChecked] = useState(false)

  const handleLeave = useCallback(
    (message = '') => {
      clear()
      setLobbyNotice('')
      setNotice(message)
    },
    [clear],
  )

  const handleSession = useCallback(
    (next: Session, serverNow: string) => {
      calibrate(serverNow)
      setNotice('')
      setSession(next)
    },
    [calibrate, setSession],
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
  const ownConquered = useMemo(
    () => (session ? conqueredZones(progress, session.teamId) : []),
    [progress, session],
  )

  async function handleStartGame() {
    if (!supabase || !session?.hostToken) return
    setLobbyBusy(true)
    setLobbyNotice('')
    const { error } = await supabase.rpc('start_game', {
      p_room_id: session.roomId,
      p_host_token: session.hostToken,
    })
    setLobbyBusy(false)
    if (error) {
      setLobbyNotice(parseRpcError(error).message)
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

  if (!hydrated || (session && !rejoinChecked)) {
    return <LoadingScreen />
  }

  if (!configured || !supabase) {
    return <ConfigScreen />
  }

  if (!session) {
    return <HomeScreen supabase={supabase} notice={notice} onSession={handleSession} />
  }

  if (!room) {
    return <LoadingScreen />
  }

  if (room.status === 'lobby') {
    const isHost = Boolean(session.hostToken && room.host_team_id === session.teamId)
    return (
      <LobbyScreen
        room={room}
        teams={teams}
        ownTeamId={session.teamId}
        isHost={isHost}
        busy={lobbyBusy}
        connection={connection}
        notice={lobbyNotice}
        onStart={() => void handleStartGame()}
        onLeave={() => handleLeave()}
        onCopy={() => void handleCopy()}
      />
    )
  }

  if (room.status === 'finished') {
    return (
      <FinalScreen
        ranking={ranking}
        ownTeamId={session.teamId}
        ownConquered={ownConquered}
        onLeave={() => handleLeave()}
      />
    )
  }

  const isHost = Boolean(session.hostToken && room.host_team_id === session.teamId)
  return (
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
      onLeave={handleLeave}
    />
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

import type { Database, ProgressRow, RoomRow, TeamRow } from '@/lib/supabase/client'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting'

export type UseRoom = {
  room: RoomRow | null
  teams: TeamRow[]
  progress: ProgressRow[]
  connection: ConnectionState
  serverOffsetMs: number
  refresh: () => Promise<void>
  calibrate: (serverNow: string) => void
}

const POLL_INTERVAL_MS = 10000

export function useRoom(
  supabase: SupabaseClient<Database> | null,
  roomId: string | null,
): UseRoom {
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [serverOffsetMs, setServerOffsetMs] = useState(0)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const debounceRef = useRef<number | null>(null)
  const subscribedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || !roomId) return
    const [roomResult, teamsResult, progressResult] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase
        .from('teams')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true }),
      supabase
        .from('progress')
        .select('*')
        .eq('room_id', roomId)
        .order('team_id', { ascending: true })
        .order('zone', { ascending: true }),
    ])

    if (roomResult.error || teamsResult.error || progressResult.error) {
      setConnection('reconnecting')
      return
    }

    if (roomResult.data) setRoom(roomResult.data)
    setTeams(teamsResult.data ?? [])
    setProgress(progressResult.data ?? [])
  }, [supabase, roomId])

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      void refresh()
    }, 250)
  }, [refresh])

  const calibrate = useCallback((serverNow: string) => {
    const serverMs = new Date(serverNow).getTime()
    if (!Number.isFinite(serverMs)) return
    setServerOffsetMs(serverMs - Date.now())
  }, [])

  useEffect(() => {
    if (!supabase || !roomId) {
      setRoom(null)
      setTeams([])
      setProgress([])
      setConnection('connecting')
      return
    }

    void refresh()

    const channel = supabase
      .channel(`sala-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${roomId}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress', filter: `room_id=eq.${roomId}` },
        debouncedRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true
          setConnection('connected')
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          subscribedRef.current = false
          setConnection('reconnecting')
        }
      })

    channelRef.current = channel

    return () => {
      subscribedRef.current = false
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
      void supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [supabase, roomId, refresh, debouncedRefresh])

  useEffect(() => {
    if (!supabase || !roomId) return
    const interval = window.setInterval(() => {
      if (!subscribedRef.current) {
        void refresh()
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [supabase, roomId, refresh])

  return useMemo(
    () => ({ room, teams, progress, connection, serverOffsetMs, refresh, calibrate }),
    [room, teams, progress, connection, serverOffsetMs, refresh, calibrate],
  )
}

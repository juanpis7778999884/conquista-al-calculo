'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { zones } from '@/data/questions'
import { MapSvg } from '@/components/map-svg'
import { parseRpcError } from '@/lib/errors'
import { normalizeRoomCode, normalizeTeamName, STEPS_PER_ZONE, TOTAL_ZONES } from '@/lib/game'
import type { Session } from '@/lib/session'
import type { Database } from '@/lib/supabase/client'

const TOTAL_STEPS = zones.reduce((sum, zone) => sum + zone.steps.length, 0)

type HomeScreenProps = {
  supabase: SupabaseClient<Database>
  notice: string
  onSession: (session: Session, serverNow: string) => void
}

export function HomeScreen({ supabase, notice, onSession }: HomeScreenProps) {
  const [teamName, setTeamName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('sala')
    if (code) setRoomCode(normalizeRoomCode(code))
  }, [])

  async function handleCreate() {
    const name = normalizeTeamName(teamName)
    if (!name) {
      setFeedback('Escribe un nombre de equipo.')
      return
    }
    setBusy(true)
    setFeedback('')
    const { data, error } = await supabase.rpc('create_room', { p_team_name: name })
    setBusy(false)
    if (error || !data) {
      setFeedback(parseRpcError(error).message)
      return
    }
    onSession(
      {
        roomId: data.room_id,
        teamId: data.team_id,
        teamToken: data.team_token,
        hostToken: data.host_token,
      },
      data.server_now,
    )
  }

  async function handleJoin() {
    const name = normalizeTeamName(teamName)
    if (!name) {
      setFeedback('Escribe un nombre de equipo.')
      return
    }
    const code = normalizeRoomCode(roomCode)
    if (!code) {
      setFeedback('Escribe el código de la sala.')
      return
    }
    setBusy(true)
    setFeedback('')
    const { data, error } = await supabase.rpc('join_room', {
      p_code: code,
      p_team_name: name,
    })
    setBusy(false)
    if (error || !data) {
      setFeedback(parseRpcError(error).message)
      return
    }
    onSession(
      { roomId: data.room_id, teamId: data.team_id, teamToken: data.team_token },
      data.server_now,
    )
  }

  return (
    <main className="min-h-dvh bg-fondo text-crema px-5 py-10 flex items-center justify-center">
      <section className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
        <div>
          <p className="text-oro uppercase tracking-[.25em] text-sm mb-3">Una carrera de ingenio</p>
          <h1 className="font-serif text-6xl sm:text-8xl leading-[.85] text-oro-claro">
            Conquista
            <br />
            <i className="text-aviso">Cálculo</i>
          </h1>
          <p className="mt-8 max-w-md text-tenue leading-relaxed">
            {TOTAL_ZONES} territorios. {STEPS_PER_ZONE} desafíos por zona. Una partida real
            para equipos que compiten en la misma sala.
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
              className="bg-panel border border-marco px-4 py-3"
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
              className="bg-panel border border-marco px-4 py-3 uppercase"
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={busy}
                className="bg-boton px-7 py-4 font-bold text-[#182a29] disabled:opacity-50"
              >
                {busy ? 'Conectando…' : roomCode ? 'Unirme a la sala' : 'Crear sala'}
              </button>
            </div>
            {(feedback || notice) && (
              <p role="alert" className="text-aviso text-sm">
                {feedback || notice}
              </p>
            )}
          </form>
        </div>
        <div className="border border-marco bg-panel p-4 rotate-1">
          <div className="bg-oro text-[#182a29] px-3 py-1 text-xs uppercase tracking-widest inline-block">
            Mapa de campaña
          </div>
          <MapSvg conquered={[]} active={null} onSelect={() => {}} />
          <div className="flex justify-between border-t border-linea-clara pt-3 text-xs text-tenue">
            <span>
              {TOTAL_ZONES} zonas · {TOTAL_STEPS} retos
            </span>
            <span>Datos sincronizados</span>
          </div>
        </div>
      </section>
    </main>
  )
}

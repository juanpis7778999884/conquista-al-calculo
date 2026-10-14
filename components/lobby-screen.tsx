'use client'

import { ConnectionBadge } from '@/components/connection-badge'
import { MAX_TEAMS } from '@/lib/game'
import type { ConnectionState } from '@/hooks/use-room'
import type { RoomRow, TeamRow } from '@/lib/supabase/client'

type LobbyScreenProps = {
  room: RoomRow
  teams: TeamRow[]
  ownTeamId: string | null
  isHost: boolean
  busy: boolean
  connection: ConnectionState
  notice: string
  onStart: () => void
  onLeave: () => void
  onCopy: () => void
}

export function LobbyScreen({
  room,
  teams,
  ownTeamId,
  isHost,
  busy,
  connection,
  notice,
  onStart,
  onLeave,
  onCopy,
}: LobbyScreenProps) {
  const orderedTeams = [...teams].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

  return (
    <main className="min-h-dvh bg-fondo text-crema px-5 py-8">
      <div className="max-w-4xl mx-auto">
        <header className="border-b border-linea pb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-oro tracking-[.25em] uppercase text-xs">Sala de expedición</p>
            <h1 className="font-serif text-4xl text-oro-claro">El campamento</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ConnectionBadge state={connection} />
            <button
              type="button"
              onClick={onLeave}
              className="border border-marco px-3 py-1 text-xs text-tenue"
            >
              Salir de la sala
            </button>
          </div>
        </header>
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 mt-10">
          <div className="border border-marco bg-panel p-7 text-center">
            <p className="text-xs uppercase tracking-widest text-tenue">Código de sala</p>
            <p className="font-mono text-6xl tracking-[.25em] text-oro-claro mt-3">{room.code}</p>
            <p className="text-sm text-tenue mt-4">Comparte este código con los demás equipos.</p>
            <button
              type="button"
              onClick={onCopy}
              className="mt-4 border border-marco px-4 py-2 text-sm"
            >
              Copiar código/enlace
            </button>
          </div>
          <div>
            <p className="text-sm text-tenue mb-3">
              Equipos preparados{' '}
              <span className="text-oro-claro">
                {teams.length}/{MAX_TEAMS}
              </span>
            </p>
            {orderedTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-3 border-b border-linea py-4">
                <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                <span className="font-semibold">{team.name}</span>
                {team.id === room.host_team_id && (
                  <span className="text-xs text-oro">Anfitrión</span>
                )}
                {team.id === ownTeamId && <span className="text-xs text-tenue">(tú)</span>}
                <span className="ml-auto text-xs text-tenue">
                  {team.id === ownTeamId ? 'Tú' : 'Listo'}
                </span>
              </div>
            ))}
            {isHost ? (
              <button
                type="button"
                onClick={onStart}
                disabled={busy}
                className="mt-8 w-full bg-boton py-4 font-bold text-[#182a29] disabled:opacity-50"
              >
                {busy ? 'Iniciando…' : 'Iniciar partida'}
              </button>
            ) : (
              <p className="mt-8 w-full border border-linea py-4 text-center text-tenue">
                Esperando al anfitrión…
              </p>
            )}
            {notice && (
              <p role="status" className="mt-4 text-sm text-oro">
                {notice}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

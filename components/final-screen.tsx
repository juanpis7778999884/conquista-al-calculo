'use client'

import { useState } from 'react'

import { MapSvg } from '@/components/map-svg'
import { formatTime, TOTAL_ZONES, type TeamStat } from '@/lib/game'

type FinalScreenProps = {
  ranking: TeamStat[]
  ownTeamId: string | null
  ownConquered: string[]
  isHost: boolean
  busy: boolean
  notice: string
  onReset: () => void
  onLeave: () => void
}

export function FinalScreen({
  ranking,
  ownTeamId,
  ownConquered,
  isHost,
  busy,
  notice,
  onReset,
  onLeave,
}: FinalScreenProps) {
  const [view, setView] = useState<'podio' | 'mapa'>('podio')

  return (
    <main className="min-h-dvh bg-fondo text-crema px-5 py-10">
      <div className="max-w-3xl mx-auto">
        <header className="text-center border-b border-linea pb-6">
          <p className="text-oro uppercase tracking-widest text-xs">Partida terminada</p>
          <h1 className="font-serif text-5xl text-oro-claro mt-2">Podio de la conquista</h1>
        </header>
        <div className="mt-8 flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => setView('podio')}
            className={`px-4 py-2 border ${
              view === 'podio' ? 'border-oro-claro text-oro-claro' : 'border-linea'
            }`}
          >
            Podio
          </button>
          <button
            type="button"
            onClick={() => setView('mapa')}
            className={`px-4 py-2 border ${
              view === 'mapa' ? 'border-oro-claro text-oro-claro' : 'border-linea'
            }`}
          >
            Ver mapa
          </button>
        </div>
        {view === 'podio' ? (
          <ol className="mt-8 grid gap-3">
            {ranking.map((team, index) => (
              <li
                key={team.teamId}
                className={`border p-4 flex items-center gap-4 ${
                  team.teamId === ownTeamId ? 'border-oro-claro bg-panel-eco' : 'border-linea'
                }`}
              >
                <span className="font-serif text-3xl text-oro w-10">{index + 1}</span>
                <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                <div className="flex-1">
                  <p className="font-semibold">
                    {team.name}
                    {team.leftAt !== null && team.finishedAt === null && (
                      <span className="ml-2 text-xs text-aviso">Abandonó</span>
                    )}
                  </p>
                  <p className="text-sm text-tenue">
                    {team.conquered}/{TOTAL_ZONES} zonas · {team.errors} errores
                  </p>
                </div>
                <span className="font-mono text-xl text-oro-claro">
                  {team.effectiveSeconds === null
                    ? 'Sin terminar'
                    : formatTime(team.effectiveSeconds)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-8 border border-marco bg-panel p-2 sm:p-5">
            <MapSvg conquered={ownConquered} active={null} onSelect={() => {}} />
          </div>
        )}
        {isHost ? (
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            className="mt-8 w-full bg-boton py-4 font-bold text-[#182a29] disabled:opacity-50"
          >
            {busy ? 'Reiniciando…' : 'Jugar otra vez'}
          </button>
        ) : (
          <p className="mt-8 w-full border border-linea py-4 text-center text-tenue">
            Esperando al anfitrión para otra partida…
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-center text-sm text-oro">
            {notice}
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="mt-3 w-full border border-marco py-3 text-sm text-tenue"
        >
          Salir de la sala
        </button>
      </div>
    </main>
  )
}

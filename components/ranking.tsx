'use client'

import { formatTime, TOTAL_ZONES, type TeamStat } from '@/lib/game'

type RankingProps = {
  stats: TeamStat[]
  ownTeamId: string | null
}

export function Ranking({ stats, ownTeamId }: RankingProps) {
  return (
    <aside className="border border-linea p-5">
      <h2 className="font-serif text-2xl text-oro-claro">Ranking en vivo</h2>
      {stats.map((team, index) => (
        <div
          key={team.teamId}
          className={`border-b border-linea py-3 flex items-center gap-3 ${
            team.teamId === ownTeamId ? 'bg-panel-eco' : ''
          }`}
        >
          <span className="font-serif text-xl text-oro">{index + 1}</span>
          <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {team.name}
              {team.teamId === ownTeamId && <span className="ml-2 text-xs text-oro">(tú)</span>}
            </p>
            <p className="text-xs text-tenue">
              {team.conquered}/{TOTAL_ZONES} zonas · {team.errors} errores
              {team.effectiveSeconds !== null && ` · ${formatTime(team.effectiveSeconds)}`}
            </p>
          </div>
        </div>
      ))}
    </aside>
  )
}

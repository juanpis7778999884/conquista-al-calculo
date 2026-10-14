'use client'

import { useState } from 'react'

import { zones } from '@/data/questions'

type MapSvgProps = {
  conquered: string[]
  active: string | null
  onSelect: (id: string) => void
}

export function MapSvg({ conquered, active, onSelect }: MapSvgProps) {
  const [focused, setFocused] = useState<string | null>(null)

  return (
    <>
      <ul className="grid gap-3 sm:hidden" aria-label="Mapa de las zonas de Conquista Cálculo">
        {zones.map((zone) => {
          const won = conquered.includes(zone.id)
          const highlighted = active === zone.id
          return (
            <li key={zone.id}>
              <button
                type="button"
                onClick={() => onSelect(zone.id)}
                aria-pressed={highlighted}
                aria-label={`${zone.name}${won ? ', conquistada' : ', disponible'}`}
                className={
                  'w-full flex items-center justify-between gap-3 border px-4 py-3 text-left ' +
                  (highlighted
                    ? 'border-oro-claro bg-mapa-activa'
                    : won
                      ? 'border-mapa-borde-oro bg-mapa-conquistada'
                      : 'border-mapa-borde bg-mapa-zona')
                }
              >
                <span className="flex flex-col">
                  <span className="font-serif text-lg text-mapa-marca">{zone.name}</span>
                  <span className="text-xs text-tenue">{zone.theme}</span>
                </span>
                <span
                  className={
                    'shrink-0 text-sm font-bold ' + (won ? 'text-mapa-marca' : 'text-tenue')
                  }
                >
                  {won ? '✓ Conquistada' : 'Disponible'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <svg
        viewBox="0 0 700 380"
        className="hidden w-full sm:block"
        role="group"
        aria-label="Mapa de las zonas de Conquista Cálculo"
      >
        <path
          d="M30 250 Q30 125 145 40 Q270 -10 410 30 Q585 20 670 180 Q700 290 615 350 Q410 390 210 350 Q60 340 30 250Z"
          fill="var(--color-mapa-base)"
          stroke="var(--color-mapa-trazo)"
          strokeWidth="3"
        />
        {zones.map((zone) => {
          const won = conquered.includes(zone.id)
          const highlighted = active === zone.id || focused === zone.id
          const x = zone.labelX ?? 350
          const y = zone.labelY ?? 220
          return (
            <g
              key={zone.id}
              id={`zona-${zone.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${zone.name}${won ? ', conquistada' : ', disponible'}`}
              onClick={() => onSelect(zone.id)}
              onFocus={() => setFocused(zone.id)}
              onBlur={() => setFocused(null)}
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
                fill={
                  won
                    ? 'var(--color-mapa-conquistada)'
                    : highlighted
                      ? 'var(--color-mapa-activa)'
                      : 'var(--color-mapa-zona)'
                }
                stroke={
                  highlighted
                    ? 'var(--color-oro-claro)'
                    : won
                      ? 'var(--color-mapa-borde-oro)'
                      : 'var(--color-mapa-borde)'
                }
                strokeWidth={highlighted ? 4 : 2}
              />
              {won && (
                <path
                  d={`M${x - 34} ${y - 2} l6 6 12-14`}
                  fill="none"
                  stroke="var(--color-mapa-marca)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                fill="var(--color-mapa-marca)"
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
          fill="var(--color-oro)"
          fontSize="11"
          letterSpacing="4"
          fontFamily="Georgia"
        >
          LAS TIERRAS DEL CÁLCULO
        </text>
      </svg>
    </>
  )
}

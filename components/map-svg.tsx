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
    <svg
      viewBox="0 0 700 380"
      className="w-full"
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
                d={`M${x - 12} ${y + 12} l8 8 16-20`}
                fill="none"
                stroke="var(--color-mapa-marca)"
                strokeWidth="4"
                strokeLinecap="round"
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
  )
}

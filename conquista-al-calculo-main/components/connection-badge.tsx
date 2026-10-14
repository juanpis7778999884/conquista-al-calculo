'use client'

type ConnectionBadgeProps = {
  state: 'connecting' | 'connected' | 'reconnecting'
}

export function ConnectionBadge({ state }: ConnectionBadgeProps) {
  if (state === 'connected') return null
  return (
    <p role="status" className="text-xs text-oro">
      {state === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}
    </p>
  )
}

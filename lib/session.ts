export type Session = {
  roomId: string
  teamId: string
  teamToken: string
  hostToken?: string
}

const STORAGE_KEY = 'conquista-calculo:sesion'

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.roomId === 'string' &&
    typeof candidate.teamId === 'string' &&
    typeof candidate.teamToken === 'string' &&
    (candidate.hostToken === undefined || typeof candidate.hostToken === 'string')
  )
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // localStorage no disponible (modo privado, etc.). La sesión dura lo que la pestaña.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nada que limpiar
  }
}

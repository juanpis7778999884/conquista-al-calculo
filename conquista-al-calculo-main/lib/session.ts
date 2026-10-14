export type Session = {
  roomId: string
  teamId: string
  teamToken: string
  code: string
}

const STORAGE_KEY = 'conquista-calculo:sesion'

function coerceSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.roomId !== 'string' ||
    typeof candidate.teamId !== 'string' ||
    typeof candidate.teamToken !== 'string'
  ) {
    return null
  }
  // Sesiones antiguas guardaban hostToken y no guardaban code: se ignoran /
  // se completan a ''. El servidor devuelve el code en rejoin.
  return {
    roomId: candidate.roomId,
    teamId: candidate.teamId,
    teamToken: candidate.teamToken,
    code: typeof candidate.code === 'string' ? candidate.code : '',
  }
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return coerceSession(JSON.parse(raw))
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

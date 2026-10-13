'use client'

import { useCallback, useEffect, useState } from 'react'

import { clearSession, loadSession, saveSession, type Session } from '@/lib/session'

export type UseSession = {
  session: Session | null
  hydrated: boolean
  setSession: (session: Session) => void
  clear: () => void
}

export function useSession(): UseSession {
  const [session, setSessionState] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSessionState(loadSession())
    setHydrated(true)
  }, [])

  const setSession = useCallback((next: Session) => {
    saveSession(next)
    setSessionState(next)
  }, [])

  const clear = useCallback(() => {
    clearSession()
    setSessionState(null)
  }, [])

  return { session, hydrated, setSession, clear }
}

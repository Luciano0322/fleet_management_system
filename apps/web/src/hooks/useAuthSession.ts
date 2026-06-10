import { useEffect } from 'react'

import type { AuthSession } from '../lib/authStorage'
import {
  initializeAuthSessionStore,
  useAuthSessionStore,
} from '../stores/authSessionStore'

export function useAuthSession(): {
  hydrated: boolean
  session: AuthSession | null
} {
  const hydrated = useAuthSessionStore((state) => state.hydrated)
  const session = useAuthSessionStore((state) => state.session)

  useEffect(() => {
    return initializeAuthSessionStore()
  }, [])

  return { hydrated, session }
}

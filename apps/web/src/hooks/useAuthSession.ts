import { useEffect, useState } from 'react'

import {
  readAuthSession,
  subscribeAuthSession,
  type AuthSession,
} from '../lib/authStorage'

export function useAuthSession(): {
  hydrated: boolean
  session: AuthSession | null
} {
  const [hydrated, setHydrated] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    const syncSession = () => {
      setSession(readAuthSession())
      setHydrated(true)
    }

    syncSession()
    return subscribeAuthSession(syncSession)
  }, [])

  return { hydrated, session }
}

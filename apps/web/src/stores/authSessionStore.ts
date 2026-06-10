import { create } from 'zustand'

import {
  clearAuthSession,
  readAuthSession,
  subscribeAuthSession,
  writeAuthSession,
  type AuthSession,
} from '@/lib/authStorage'

type AuthSessionState = {
  hydrated: boolean
  session: AuthSession | null
  clearSession: () => void
  setSession: (session: AuthSession) => void
  syncFromStorage: () => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  hydrated: false,
  session: null,
  clearSession: () => {
    clearAuthSession()
    set({ hydrated: true, session: null })
  },
  setSession: (session) => {
    writeAuthSession(session)
    set({ hydrated: true, session })
  },
  syncFromStorage: () => {
    set({ hydrated: true, session: readAuthSession() })
  },
}))

let unsubscribeAuthStorage: (() => void) | null = null

export function initializeAuthSessionStore(): () => void {
  useAuthSessionStore.getState().syncFromStorage()

  if (!unsubscribeAuthStorage) {
    unsubscribeAuthStorage = subscribeAuthSession(() => {
      useAuthSessionStore.getState().syncFromStorage()
    })
  }

  return () => {
    unsubscribeAuthStorage?.()
    unsubscribeAuthStorage = null
  }
}

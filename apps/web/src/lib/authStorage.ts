import type { User } from './api'

const storageKey = 'fms.auth.session'
const sessionChangedEvent = 'fms-auth-session-changed'

export type AuthSession = {
  accessToken: string
  refreshToken: string
  user: User
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function notifySessionChanged(): void {
  if (isBrowser()) {
    window.dispatchEvent(new Event(sessionChangedEvent))
  }
}

export function readAuthSession(): AuthSession | null {
  if (!isBrowser()) {
    return null
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      parsed.user &&
      typeof parsed.user.account === 'string'
    ) {
      return parsed
    }
  } catch {
    window.localStorage.removeItem(storageKey)
  }

  return null
}

export function writeAuthSession(session: AuthSession): void {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(session))
  notifySessionChanged()
}

export function clearAuthSession(): void {
  if (!isBrowser()) {
    return
  }

  window.localStorage.removeItem(storageKey)
  notifySessionChanged()
}

export function subscribeAuthSession(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => undefined
  }

  const notify = () => listener()
  window.addEventListener(sessionChangedEvent, notify)
  window.addEventListener('storage', notify)

  return () => {
    window.removeEventListener(sessionChangedEvent, notify)
    window.removeEventListener('storage', notify)
  }
}

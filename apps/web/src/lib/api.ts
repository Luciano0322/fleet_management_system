import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSession,
} from './authStorage'

export type User = {
  id: string
  account: string
  role: string
  status: string
}

export type Vehicle = {
  id: string
  plate_number: string
  name: string | null
  status: string
}

export type LatestLocation = {
  vehicle_id: string
  plate_number: string
  driver_user_id: string
  driver_account: string
  online_status: string
  latitude: number | null
  longitude: number | null
  speed: number | null
  heading: number | null
  recorded_at: string | null
  last_seen_at: string | null
}

export type LoginResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export type MonitoringSnapshot = {
  users: User[]
  vehicles: Vehicle[]
  latestLocations: LatestLocation[]
}

type ApiRequestOptions = RequestInit & {
  auth?: boolean
  retryOnUnauthorized?: boolean
}

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AuthExpiredError extends Error {
  constructor(message = 'Authentication expired') {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

let refreshInFlight: Promise<AuthSession> | null = null

function jsonHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  headers.set('Accept', 'application/json')
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

function sessionFromResponse(payload: LoginResponse): AuthSession {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: payload.user,
  }
}

async function parseError(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return await response.text()
  }
}

function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.length > 0) {
    return detail
  }
  if (
    detail &&
    typeof detail === 'object' &&
    'detail' in detail &&
    typeof detail.detail === 'string'
  ) {
    return detail.detail
  }
  return fallback
}

async function refreshAuthSession(): Promise<AuthSession> {
  const current = readAuthSession()
  if (!current?.refreshToken) {
    clearAuthSession()
    throw new AuthExpiredError()
  }

  refreshInFlight ??= fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        clearAuthSession()
        throw new AuthExpiredError()
      }
      const payload = (await response.json()) as LoginResponse
      const nextSession = sessionFromResponse(payload)
      writeAuthSession(nextSession)
      return nextSession
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

async function request<T>(
  path: string,
  { auth = true, retryOnUnauthorized = true, ...init }: ApiRequestOptions = {},
): Promise<T> {
  const headers = jsonHeaders(init.headers)
  const session = readAuthSession()

  if (auth) {
    if (!session?.accessToken) {
      throw new AuthExpiredError()
    }
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })

  if (response.status === 401 && auth && retryOnUnauthorized) {
    await refreshAuthSession()
    return request<T>(path, {
      ...init,
      auth,
      retryOnUnauthorized: false,
    })
  }

  if (!response.ok) {
    const detail = await parseError(response)
    throw new ApiError(
      errorMessage(detail, `Request failed with status ${response.status}`),
      response.status,
      detail,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function login(
  account: string,
  password: string,
): Promise<AuthSession> {
  const payload = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ account, password }),
  })
  const session = sessionFromResponse(payload)
  writeAuthSession(session)
  return session
}

export async function logout(): Promise<void> {
  const session = readAuthSession()
  try {
    if (session?.refreshToken) {
      await request<{ status: string }>('/auth/logout', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      })
    }
  } finally {
    clearAuthSession()
  }
}

export function getUsers(signal?: AbortSignal): Promise<User[]> {
  return request<User[]>('/users', { signal })
}

export function getVehicles(signal?: AbortSignal): Promise<Vehicle[]> {
  return request<Vehicle[]>('/vehicles', { signal })
}

export function getLatestLocations(
  signal?: AbortSignal,
): Promise<LatestLocation[]> {
  return request<LatestLocation[]>('/vehicles/latest-locations', { signal })
}

export async function loadMonitoringSnapshot(
  signal?: AbortSignal,
): Promise<MonitoringSnapshot> {
  const [users, vehicles, latestLocations] = await Promise.all([
    getUsers(signal),
    getVehicles(signal),
    getLatestLocations(signal),
  ])

  return {
    users,
    vehicles,
    latestLocations,
  }
}

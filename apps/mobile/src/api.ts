import { config } from './config'
import type { AuthSession, DeviceBinding, LoginResponse } from './types'

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

function headers(accessToken?: string): Headers {
  const nextHeaders = new Headers()
  nextHeaders.set('Accept', 'application/json')
  nextHeaders.set('Content-Type', 'application/json')
  if (accessToken) {
    nextHeaders.set('Authorization', `Bearer ${accessToken}`)
  }
  return nextHeaders
}

async function parseError(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return await response.text()
  }
}

function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail) {
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

async function request<T>(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: headers(accessToken),
  })

  if (!response.ok) {
    const detail = await parseError(response)
    throw new ApiError(
      errorMessage(detail, `Request failed with status ${response.status}`),
      response.status,
      detail,
    )
  }

  return (await response.json()) as T
}

function sessionFromLogin(payload: LoginResponse): AuthSession {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: payload.user,
  }
}

export async function login(
  account: string,
  password: string,
): Promise<AuthSession> {
  const payload = await request<LoginResponse>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    },
  )
  return sessionFromLogin(payload)
}

export async function refreshSession(
  session: AuthSession,
): Promise<AuthSession> {
  const payload = await request<LoginResponse>(
    '/auth/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    },
  )
  return sessionFromLogin(payload)
}

export async function logout(session: AuthSession): Promise<void> {
  await request<{ status: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
}

export async function getDeviceBinding(
  session: AuthSession,
): Promise<DeviceBinding> {
  return request<DeviceBinding>(
    '/me/device-binding',
    {
      method: 'GET',
    },
    session.accessToken,
  )
}

import type { LatestLocation, User, Vehicle } from './api'

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error' | 'cancelled'
export type Freshness = 'empty' | 'fresh' | 'stale'
export type RefreshSource = 'initial' | 'poll' | 'manual'

export type MonitoringRuntimeState = {
  users: User[]
  vehicles: Vehicle[]
  latestLocations: LatestLocation[]
  status: AsyncStatus
  freshness: Freshness
  refreshSource: RefreshSource | null
  error: unknown | null
  lastUpdatedAt: string | null
}

export const initialMonitoringState: MonitoringRuntimeState = {
  users: [],
  vehicles: [],
  latestLocations: [],
  status: 'idle',
  freshness: 'empty',
  refreshSource: null,
  error: null,
  lastUpdatedAt: null,
}

export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Request failed'
}

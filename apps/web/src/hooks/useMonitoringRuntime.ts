import { useEffect, useMemo } from 'react'

import type { MonitoringRuntimeState } from '../lib/monitoringRuntime'
import { useMonitoringStore } from '../stores/monitoringStore'

export function useMonitoringRuntime(enabled: boolean): {
  state: MonitoringRuntimeState
  refreshNow: () => void
} {
  const users = useMonitoringStore((state) => state.users)
  const vehicles = useMonitoringStore((state) => state.vehicles)
  const latestLocations = useMonitoringStore((state) => state.latestLocations)
  const status = useMonitoringStore((state) => state.status)
  const freshness = useMonitoringStore((state) => state.freshness)
  const refreshSource = useMonitoringStore((state) => state.refreshSource)
  const error = useMonitoringStore((state) => state.error)
  const lastUpdatedAt = useMonitoringStore((state) => state.lastUpdatedAt)
  const refreshNow = useMonitoringStore((state) => state.refreshNow)
  const start = useMonitoringStore((state) => state.start)
  const stop = useMonitoringStore((state) => state.stop)

  useEffect(() => {
    if (!enabled) {
      stop()
      return undefined
    }

    start()

    return () => {
      stop()
    }
  }, [enabled, start, stop])

  const state = useMemo(
    () => ({
      users,
      vehicles,
      latestLocations,
      status,
      freshness,
      refreshSource,
      error,
      lastUpdatedAt,
    }),
    [
      users,
      vehicles,
      latestLocations,
      status,
      freshness,
      refreshSource,
      error,
      lastUpdatedAt,
    ],
  )

  return {
    state,
    refreshNow,
  }
}

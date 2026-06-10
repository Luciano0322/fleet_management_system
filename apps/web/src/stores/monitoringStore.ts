import { create } from 'zustand'

import {
  getLatestLocations,
  loadMonitoringSnapshot,
} from '@/lib/api'
import {
  initialMonitoringState,
  type MonitoringRuntimeState,
  type RefreshSource,
} from '@/lib/monitoringRuntime'

type MonitoringStore = MonitoringRuntimeState & {
  refreshNow: () => void
  start: () => void
  stop: () => void
}

let intervalId: number | null = null
let activeController: AbortController | null = null
let requestToken = 0

export const useMonitoringStore = create<MonitoringStore>(() => ({
  ...initialMonitoringState,
  refreshNow: () => loadLatest('manual'),
  start: () => startMonitoring(),
  stop: () => stopMonitoring(),
}))

function startMonitoring(): void {
  if (typeof window === 'undefined' || intervalId !== null) {
    return
  }

  loadInitial()
  intervalId = window.setInterval(() => {
    loadLatest('poll')
  }, 5000)
}

function stopMonitoring(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }

  cancelActiveRequest()
  requestToken += 1
  useMonitoringStore.setState(initialMonitoringState)
}

function hasData(): boolean {
  const state = useMonitoringStore.getState()
  return (
    state.users.length > 0 ||
    state.vehicles.length > 0 ||
    state.latestLocations.length > 0
  )
}

function cancelActiveRequest(): void {
  activeController?.abort('superseded')
  activeController = null
}

function beginRequest(source: RefreshSource): {
  controller: AbortController
  token: number
} {
  cancelActiveRequest()

  const controller = new AbortController()
  const token = ++requestToken
  activeController = controller

  useMonitoringStore.setState({
    status: 'pending',
    freshness: hasData() ? 'stale' : 'empty',
    refreshSource: source,
    error: null,
  })

  return { controller, token }
}

function completeRequest(
  token: number,
  nextState: Partial<MonitoringRuntimeState>,
): void {
  if (token !== requestToken) {
    return
  }

  activeController = null
  useMonitoringStore.setState(nextState)
}

function loadInitial(): void {
  const { controller, token } = beginRequest('initial')
  void loadMonitoringSnapshot(controller.signal)
    .then((snapshot) => {
      completeRequest(token, {
        ...snapshot,
        status: 'success',
        freshness: 'fresh',
        refreshSource: null,
        error: null,
        lastUpdatedAt: new Date().toISOString(),
      })
    })
    .catch((error: unknown) => {
      handleRequestError(token, error)
    })
}

function loadLatest(source: RefreshSource): void {
  const { controller, token } = beginRequest(source)
  void getLatestLocations(controller.signal)
    .then((latestLocations) => {
      completeRequest(token, {
        latestLocations,
        status: 'success',
        freshness: 'fresh',
        refreshSource: null,
        error: null,
        lastUpdatedAt: new Date().toISOString(),
      })
    })
    .catch((error: unknown) => {
      handleRequestError(token, error)
    })
}

function handleRequestError(token: number, error: unknown): void {
  if (token !== requestToken) {
    return
  }

  activeController = null

  if (error instanceof DOMException && error.name === 'AbortError') {
    useMonitoringStore.setState({
      status: 'cancelled',
      freshness: hasData() ? 'stale' : 'empty',
      refreshSource: null,
      error: null,
    })
    return
  }

  useMonitoringStore.setState({
    status: 'error',
    freshness: hasData() ? 'stale' : 'empty',
    refreshSource: null,
    error,
  })
}

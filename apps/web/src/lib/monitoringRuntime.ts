import {
  getLatestLocations,
  loadMonitoringSnapshot,
  type LatestLocation,
  type User,
  type Vehicle,
} from './api'

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

type Listener = (state: MonitoringRuntimeState) => void

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

export class MonitoringRuntime {
  private state: MonitoringRuntimeState = initialMonitoringState
  private listeners = new Set<Listener>()
  private intervalId: number | null = null
  private activeController: AbortController | null = null
  private requestToken = 0

  getState(): MonitoringRuntimeState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(): void {
    this.loadInitial()
    this.intervalId = window.setInterval(() => {
      this.loadLatest('poll')
    }, 5000)
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.cancelActiveRequest('runtime-stopped')
  }

  refreshNow(): void {
    this.loadLatest('manual')
  }

  private setState(next: MonitoringRuntimeState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private hasData(): boolean {
    return (
      this.state.users.length > 0 ||
      this.state.vehicles.length > 0 ||
      this.state.latestLocations.length > 0
    )
  }

  private cancelActiveRequest(reason: string): void {
    if (this.activeController !== null) {
      this.activeController.abort(reason)
      this.activeController = null
    }
  }

  private beginRequest(source: RefreshSource): {
    controller: AbortController
    token: number
  } {
    this.cancelActiveRequest('superseded')
    const controller = new AbortController()
    const token = ++this.requestToken
    this.activeController = controller
    this.setState({
      ...this.state,
      status: 'pending',
      freshness: this.hasData() ? 'stale' : 'empty',
      refreshSource: source,
      error: null,
    })
    return { controller, token }
  }

  private completeRequest(
    token: number,
    nextState: Partial<MonitoringRuntimeState>,
  ): void {
    if (token !== this.requestToken) {
      return
    }
    this.activeController = null
    this.setState({
      ...this.state,
      ...nextState,
    })
  }

  private loadInitial(): void {
    const { controller, token } = this.beginRequest('initial')
    void loadMonitoringSnapshot(controller.signal)
      .then((snapshot) => {
        this.completeRequest(token, {
          ...snapshot,
          status: 'success',
          freshness: 'fresh',
          refreshSource: null,
          error: null,
          lastUpdatedAt: new Date().toISOString(),
        })
      })
      .catch((error: unknown) => {
        this.handleRequestError(token, error)
      })
  }

  private loadLatest(source: RefreshSource): void {
    const { controller, token } = this.beginRequest(source)
    void getLatestLocations(controller.signal)
      .then((latestLocations) => {
        this.completeRequest(token, {
          latestLocations,
          status: 'success',
          freshness: 'fresh',
          refreshSource: null,
          error: null,
          lastUpdatedAt: new Date().toISOString(),
        })
      })
      .catch((error: unknown) => {
        this.handleRequestError(token, error)
      })
  }

  private handleRequestError(token: number, error: unknown): void {
    if (token !== this.requestToken) {
      return
    }

    this.activeController = null

    if (error instanceof DOMException && error.name === 'AbortError') {
      this.setState({
        ...this.state,
        status: 'cancelled',
        freshness: this.hasData() ? 'stale' : 'empty',
        refreshSource: null,
        error: null,
      })
      return
    }

    this.setState({
      ...this.state,
      status: 'error',
      freshness: this.hasData() ? 'stale' : 'empty',
      refreshSource: null,
      error,
    })
  }
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

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { useAuthSession } from '../hooks/useAuthSession'
import { useMonitoringRuntime } from '../hooks/useMonitoringRuntime'
import { logout } from '../lib/api'
import { errorToMessage } from '../lib/monitoringRuntime'

export const Route = createFileRoute('/monitoring')({
  component: MonitoringPage,
})

type FleetRow = {
  vehicleId: string
  plateNumber: string
  name: string | null
  vehicleStatus: string
  driverAccount: string | null
  onlineStatus: string
  latitude: number | null
  longitude: number | null
  speed: number | null
  heading: number | null
  recordedAt: string | null
  lastSeenAt: string | null
}

function MonitoringPage() {
  const navigate = Route.useNavigate()
  const { hydrated, session } = useAuthSession()
  const { state, refreshNow } = useMonitoringRuntime(Boolean(session))
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    if (hydrated && !session) {
      void navigate({ to: '/login', replace: true })
    }
  }, [hydrated, navigate, session])

  const fleetRows = useMemo(() => {
    const latestByVehicle = new Map(
      state.latestLocations.map((location) => [location.vehicle_id, location]),
    )

    const rowsFromVehicles = state.vehicles.map((vehicle) => {
      const latest = latestByVehicle.get(vehicle.id)
      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plate_number,
        name: vehicle.name,
        vehicleStatus: vehicle.status,
        driverAccount: latest?.driver_account ?? null,
        onlineStatus: latest?.online_status ?? 'offline',
        latitude: latest?.latitude ?? null,
        longitude: latest?.longitude ?? null,
        speed: latest?.speed ?? null,
        heading: latest?.heading ?? null,
        recordedAt: latest?.recorded_at ?? null,
        lastSeenAt: latest?.last_seen_at ?? null,
      } satisfies FleetRow
    })

    const knownVehicleIds = new Set(rowsFromVehicles.map((row) => row.vehicleId))
    const latestOnlyRows = state.latestLocations
      .filter((location) => !knownVehicleIds.has(location.vehicle_id))
      .map(
        (location) =>
          ({
            vehicleId: location.vehicle_id,
            plateNumber: location.plate_number,
            name: null,
            vehicleStatus: 'active',
            driverAccount: location.driver_account,
            onlineStatus: location.online_status,
            latitude: location.latitude,
            longitude: location.longitude,
            speed: location.speed,
            heading: location.heading,
            recordedAt: location.recorded_at,
            lastSeenAt: location.last_seen_at,
          }) satisfies FleetRow,
      )

    return [...rowsFromVehicles, ...latestOnlyRows].sort((a, b) =>
      a.plateNumber.localeCompare(b.plateNumber),
    )
  }, [state.latestLocations, state.vehicles])

  useEffect(() => {
    if (fleetRows.length === 0) {
      setSelectedVehicleId(null)
      return
    }
    if (!selectedVehicleId || !fleetRows.some((row) => row.vehicleId === selectedVehicleId)) {
      setSelectedVehicleId(fleetRows[0].vehicleId)
    }
  }, [fleetRows, selectedVehicleId])

  const selectedVehicle =
    fleetRows.find((row) => row.vehicleId === selectedVehicleId) ?? null

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
      void navigate({ to: '/login', replace: true })
    }
  }

  if (!hydrated || !session) {
    return (
      <main className="center-shell">
        <div className="loading-mark" aria-live="polite">
          Loading session
        </div>
      </main>
    )
  }

  const isInitialLoading =
    state.status === 'pending' && state.freshness === 'empty'
  const errorMessage = state.error ? errorToMessage(state.error) : null

  return (
    <main className="monitor-shell">
      <header className="monitor-header">
        <div>
          <p className="eyebrow">Fleet Monitor</p>
          <h1>Live vehicle status</h1>
        </div>
        <div className="session-actions">
          <div className="session-user">
            <span>{session.user.account}</span>
            <strong>{session.user.role}</strong>
          </div>
          <button
            className="secondary-button"
            disabled={isLoggingOut}
            onClick={handleLogout}
          >
            {isLoggingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </header>

      <section className="monitor-toolbar" aria-label="Monitoring status">
        <div className={`status-pill status-${state.freshness}`}>
          <span>{state.freshness}</span>
          <strong>{state.status}</strong>
        </div>
        <div className="toolbar-copy">
          <span>Last updated</span>
          <strong>{formatDateTime(state.lastUpdatedAt)}</strong>
        </div>
        <button
          className="secondary-button"
          disabled={state.status === 'pending'}
          onClick={refreshNow}
        >
          {state.status === 'pending' ? 'Refreshing' : 'Refresh'}
        </button>
      </section>

      {errorMessage ? (
        <div className="error-banner" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="monitor-layout">
        <aside className="scope-panel" aria-labelledby="scope-title">
          <div className="panel-heading">
            <h2 id="scope-title">Visible users</h2>
            <span>{state.users.length}</span>
          </div>
          {state.users.length > 0 ? (
            <ul className="user-list">
              {state.users.map((user) => (
                <li key={user.id}>
                  <span>{user.account}</span>
                  <strong>{user.role}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">No visible users</p>
          )}
        </aside>

        <section className="vehicle-panel" aria-labelledby="vehicles-title">
          <div className="panel-heading">
            <h2 id="vehicles-title">Vehicles</h2>
            <span>{fleetRows.length}</span>
          </div>
          {isInitialLoading ? (
            <div className="table-state">Loading fleet data</div>
          ) : fleetRows.length > 0 ? (
            <div className="vehicle-table" role="table">
              <div className="vehicle-row vehicle-row-head" role="row">
                <span>Vehicle</span>
                <span>Driver</span>
                <span>Status</span>
                <span>Coordinates</span>
                <span>Recorded</span>
              </div>
              {fleetRows.map((row) => (
                <button
                  key={row.vehicleId}
                  className={
                    row.vehicleId === selectedVehicleId
                      ? 'vehicle-row vehicle-row-active'
                      : 'vehicle-row'
                  }
                  onClick={() => setSelectedVehicleId(row.vehicleId)}
                  role="row"
                >
                  <span>
                    <strong>{row.plateNumber}</strong>
                    <small>{row.name ?? 'Unnamed vehicle'}</small>
                  </span>
                  <span>{row.driverAccount ?? 'Unassigned'}</span>
                  <span>
                    <StatusBadge status={row.onlineStatus} />
                  </span>
                  <span>{formatCoordinates(row.latitude, row.longitude)}</span>
                  <span>{formatDateTime(row.recordedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="table-state">No vehicles in scope</div>
          )}
        </section>

        <aside className="detail-panel" aria-labelledby="detail-title">
          <div className="panel-heading">
            <h2 id="detail-title">Selected vehicle</h2>
          </div>
          {selectedVehicle ? (
            <VehicleDetail row={selectedVehicle} />
          ) : (
            <p className="empty-copy">No vehicle selected</p>
          )}
        </aside>
      </div>
    </main>
  )
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return <span className={`fleet-status fleet-status-${status}`}>{status}</span>
}

function VehicleDetail({ row }: Readonly<{ row: FleetRow }>) {
  return (
    <dl className="detail-list">
      <div>
        <dt>Plate</dt>
        <dd>{row.plateNumber}</dd>
      </div>
      <div>
        <dt>Driver</dt>
        <dd>{row.driverAccount ?? 'Unassigned'}</dd>
      </div>
      <div>
        <dt>Online status</dt>
        <dd>
          <StatusBadge status={row.onlineStatus} />
        </dd>
      </div>
      <div>
        <dt>Latitude</dt>
        <dd>{formatNumber(row.latitude)}</dd>
      </div>
      <div>
        <dt>Longitude</dt>
        <dd>{formatNumber(row.longitude)}</dd>
      </div>
      <div>
        <dt>Speed</dt>
        <dd>{row.speed === null ? 'No data' : `${row.speed.toFixed(1)} km/h`}</dd>
      </div>
      <div>
        <dt>Heading</dt>
        <dd>{row.heading === null ? 'No data' : `${row.heading.toFixed(0)} deg`}</dd>
      </div>
      <div>
        <dt>Recorded at</dt>
        <dd>{formatDateTime(row.recordedAt)}</dd>
      </div>
      <div>
        <dt>Last seen at</dt>
        <dd>{formatDateTime(row.lastSeenAt)}</dd>
      </div>
    </dl>
  )
}

function formatCoordinates(
  latitude: number | null,
  longitude: number | null,
): string {
  if (latitude === null || longitude === null) {
    return 'No location'
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

function formatNumber(value: number | null): string {
  return value === null ? 'No data' : value.toFixed(6)
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'No data'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

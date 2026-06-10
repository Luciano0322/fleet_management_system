import { createFileRoute } from '@tanstack/react-router'
import { Check, Copy, LogOut, RefreshCw } from 'lucide-react'
import {
  type MouseEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
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
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [copiedVehicleId, setCopiedVehicleId] = useState<string | null>(null)

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

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
      void navigate({ to: '/login', replace: true })
    }
  }

  async function handleCopyCoordinates(row: FleetRow) {
    const coordinates = formatCoordinates(row.latitude, row.longitude)
    if (!hasCoordinates(row)) {
      return
    }

    await copyTextToClipboard(coordinates)
    setCopiedVehicleId(row.vehicleId)
    window.setTimeout(() => {
      setCopiedVehicleId((current) =>
        current === row.vehicleId ? null : current,
      )
    }, 1800)
  }

  if (!hydrated || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-sm font-medium text-muted-foreground" aria-live="polite">
          Loading session
        </div>
      </main>
    )
  }

  const isInitialLoading =
    state.status === 'pending' && state.freshness === 'empty'
  const errorMessage = state.error ? errorToMessage(state.error) : null

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto grid max-w-screen-2xl gap-4">
        <header className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Fleet Monitor
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Live tracking status
            </h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid gap-0.5 text-left sm:text-right">
              <span className="text-sm font-medium">{session.user.account}</span>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {session.user.role}
              </span>
            </div>
            <Button
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
              variant="outline"
            >
              <LogOut />
              {isLoggingOut ? 'Signing out' : 'Sign out'}
            </Button>
          </div>
        </header>

        <section
          className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-xs md:flex-row md:items-center"
          aria-label="Monitoring status"
        >
          <Badge className={freshnessBadgeClass(state.freshness)}>
            {state.freshness}
            <span className="ml-1 opacity-80">{state.status}</span>
          </Badge>
          <div className="mr-auto grid gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">
              Last updated
            </span>
            <strong className="text-sm font-semibold">
              {formatDateTime(state.lastUpdatedAt)}
            </strong>
          </div>
          <Button
            disabled={state.status === 'pending'}
            onClick={refreshNow}
            type="button"
            variant="secondary"
          >
            <RefreshCw
              className={cn(state.status === 'pending' && 'animate-spin')}
            />
            {state.status === 'pending' ? 'Refreshing' : 'Refresh'}
          </Button>
        </section>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Visible accounts
                <Badge variant="secondary">{state.users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {state.users.length > 0 ? (
                <ul className="grid gap-2">
                  {state.users.map((user) => (
                    <li
                      className="grid gap-1 rounded-md border bg-background p-3"
                      key={user.id}
                    >
                      <span className="text-sm font-medium">{user.account}</span>
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {user.role}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No visible users</p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center justify-between">
                Tracked users
                <Badge variant="secondary">{fleetRows.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isInitialLoading ? (
                <VehicleTableSkeleton />
              ) : fleetRows.length > 0 ? (
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Tracking ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Speed</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fleetRows.map((row) => (
                      <TableRow key={row.vehicleId}>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium">
                              {row.driverAccount ?? 'Unassigned'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {row.name ?? row.plateNumber}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.plateNumber}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.onlineStatus} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="cursor-text font-mono text-xs">
                              {formatCoordinates(row.latitude, row.longitude)}
                            </span>
                            <CopyCoordinatesButton
                              copied={copiedVehicleId === row.vehicleId}
                              disabled={!hasCoordinates(row)}
                              onCopy={(event) => {
                                event.stopPropagation()
                                void handleCopyCoordinates(row)
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.speed === null ? 'No data' : `${row.speed.toFixed(1)} km/h`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(row.lastSeenAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  No tracked users in scope
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const online = status === 'online'
  return (
    <Badge
      className={cn(
        'uppercase',
        online
          ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
          : 'border-neutral-200 bg-neutral-100 text-neutral-600',
      )}
      variant="outline"
    >
      {status}
    </Badge>
  )
}

function CopyCoordinatesButton({
  copied,
  disabled,
  onCopy,
}: Readonly<{
  copied: boolean
  disabled: boolean
  onCopy: (event: MouseEvent<HTMLButtonElement>) => void
}>) {
  return (
    <Button
      aria-label={copied ? 'Coordinates copied' : 'Copy coordinates'}
      className={cn(
        'size-8',
        copied && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
      )}
      disabled={disabled}
      onClick={onCopy}
      onKeyDown={(event) => event.stopPropagation()}
      title={copied ? 'Coordinates copied' : 'Copy coordinates'}
      type="button"
      variant="ghost"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

function VehicleTableSkeleton() {
  return (
    <div className="grid gap-3 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton className="h-12 w-full" key={index} />
      ))}
    </div>
  )
}

function freshnessBadgeClass(freshness: string): string {
  if (freshness === 'fresh') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-800'
  }
  if (freshness === 'stale') {
    return 'border-amber-200 bg-amber-100 text-amber-800'
  }
  return 'border-neutral-200 bg-neutral-100 text-neutral-700'
}

function hasCoordinates(row: FleetRow): boolean {
  return row.latitude !== null && row.longitude !== null
}

function formatCoordinates(
  latitude: number | null,
  longitude: number | null,
): string {
  if (latitude === null || longitude === null) {
    return 'No location'
  }
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
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

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back for non-secure local URLs and browsers with stricter clipboard rules.
    }
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.left = '-9999px'
  textArea.style.position = 'fixed'
  textArea.style.top = '0'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textArea)
  }
}

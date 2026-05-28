import * as Location from 'expo-location'

import type { AuthSession, DeviceBinding, GpsPayload } from './types'

export async function requestForegroundLocationPermission(): Promise<boolean> {
  const permission = await Location.requestForegroundPermissionsAsync()
  return permission.status === Location.PermissionStatus.GRANTED
}

export async function buildGpsPayload(
  session: AuthSession,
  binding: DeviceBinding,
): Promise<GpsPayload> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })

  const speedKmh =
    location.coords.speed === null || location.coords.speed < 0
      ? null
      : Number((location.coords.speed * 3.6).toFixed(2))
  const heading =
    location.coords.heading === null || location.coords.heading < 0
      ? null
      : Number(location.coords.heading.toFixed(2))

  return {
    user_id: session.user.id,
    vehicle_id: binding.vehicle_id,
    device_identifier: binding.device_identifier,
    latitude: Number(location.coords.latitude.toFixed(7)),
    longitude: Number(location.coords.longitude.toFixed(7)),
    speed: speedKmh,
    heading,
    recorded_at: new Date(location.timestamp).toISOString(),
  }
}

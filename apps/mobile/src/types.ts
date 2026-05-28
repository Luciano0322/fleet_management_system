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

export type DeviceBinding = {
  id: string
  user_id: string
  vehicle_id: string
  device_identifier: string
  status: string
  last_seen_at: string | null
  vehicle: Vehicle
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  user: User
}

export type LoginResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export type GpsPayload = {
  user_id: string
  vehicle_id: string
  device_identifier: string
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  recorded_at: string
}

export type UploadStatus =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'running'
  | 'publishing'
  | 'stopped'
  | 'error'

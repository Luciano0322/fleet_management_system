import { Platform } from 'react-native'

declare const process: {
  env: Record<string, string | undefined>
}

const androidHost = '10.0.2.2'
const localHost = Platform.OS === 'android' ? androidHost : 'localhost'

function readPublicEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

export const config = {
  apiBaseUrl: readPublicEnv(
    'EXPO_PUBLIC_API_BASE_URL',
    `http://${localHost}:8000`,
  ).replace(/\/$/, ''),
  mqttWsUrl: readPublicEnv(
    'EXPO_PUBLIC_MQTT_WS_URL',
    `ws://${localHost}:9001`,
  ),
  mqttUsername: readPublicEnv('EXPO_PUBLIC_MQTT_USERNAME', 'fms_demo'),
  mqttPassword: readPublicEnv(
    'EXPO_PUBLIC_MQTT_PASSWORD',
    'fms_demo_password',
  ),
  uploadIntervalMs: 10_000,
}

import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { getDeviceBinding, login, logout, refreshSession } from './src/api'
import { config } from './src/config'
import {
  buildGpsPayload,
  requestForegroundLocationPermission,
} from './src/location'
import { connectGpsMqttClient, publishGpsPayload } from './src/mqtt'
import type {
  AuthSession,
  DeviceBinding,
  GpsPayload,
  UploadStatus,
} from './src/types'

export default function App() {
  const [account, setAccount] = useState('driver001')
  const [password, setPassword] = useState('password123')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [binding, setBinding] = useState<DeviceBinding | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestPayload, setLatestPayload] = useState<GpsPayload | null>(null)
  const [latestPublishedAt, setLatestPublishedAt] = useState<string | null>(null)

  const mqttClientRef = useRef<Awaited<
    ReturnType<typeof connectGpsMqttClient>
  > | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionRef = useRef<AuthSession | null>(null)
  const bindingRef = useRef<DeviceBinding | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    bindingRef.current = binding
  }, [binding])

  useEffect(() => {
    return () => {
      stopUpload()
    }
  }, [])

  async function handleLogin() {
    setIsLoading(true)
    setError(null)

    try {
      const nextSession = await login(account.trim(), password)
      const deviceBinding = await getDeviceBinding(nextSession)
      setSession(nextSession)
      setBinding(deviceBinding)
      setUploadStatus('stopped')
    } catch (loginError) {
      setError(errorMessage(loginError))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleRefreshBinding() {
    if (!session) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const deviceBinding = await getDeviceBinding(session)
      setBinding(deviceBinding)
    } catch (bindingError) {
      setError(errorMessage(bindingError))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLogout() {
    stopUpload()
    if (session) {
      try {
        await logout(session)
      } catch {
        // Local sign-out should still complete if token revocation fails.
      }
    }
    setSession(null)
    setBinding(null)
    setLatestPayload(null)
    setLatestPublishedAt(null)
    setUploadStatus('idle')
  }

  async function startUpload() {
    if (!session || !binding) {
      setError('Login and device binding are required before uploading.')
      return
    }

    setError(null)
    setUploadStatus('requesting-permission')

    const permissionGranted = await requestForegroundLocationPermission()
    if (!permissionGranted) {
      setUploadStatus('error')
      setError('Foreground location permission was denied.')
      return
    }

    setUploadStatus('connecting')

    try {
      const client = await connectGpsMqttClient()
      mqttClientRef.current = client
      setUploadStatus('running')

      await publishOnce()
      intervalRef.current = setInterval(() => {
        void publishOnce()
      }, config.uploadIntervalMs)
    } catch (startError) {
      stopUpload()
      setUploadStatus('error')
      setError(errorMessage(startError))
    }
  }

  function stopUpload() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (mqttClientRef.current) {
      mqttClientRef.current.end(false)
      mqttClientRef.current = null
    }
    setUploadStatus((current) => (current === 'idle' ? 'idle' : 'stopped'))
  }

  async function publishOnce() {
    const currentSession = sessionRef.current
    const currentBinding = bindingRef.current
    const client = mqttClientRef.current

    if (!currentSession || !currentBinding || !client) {
      return
    }

    setUploadStatus('publishing')

    try {
      const payload = await buildGpsPayload(currentSession, currentBinding)
      await publishGpsPayload(client, payload)
      setLatestPayload(payload)
      setLatestPublishedAt(new Date().toISOString())
      setError(null)
      setUploadStatus('running')
    } catch (publishError) {
      setUploadStatus('error')
      setError(errorMessage(publishError))
    }
  }

  async function handleRefreshToken() {
    if (!session) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const nextSession = await refreshSession(session)
      setSession(nextSession)
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setIsLoading(false)
    }
  }

  const isAuthenticated = session !== null
  const isUploading =
    uploadStatus === 'running' ||
    uploadStatus === 'publishing' ||
    uploadStatus === 'connecting' ||
    uploadStatus === 'requesting-permission'

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Fleet GPS Uploader</Text>
          <Text style={styles.title}>Mobile vehicle location</Text>
        </View>

        {!isAuthenticated ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver login</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setAccount}
              placeholder="Account"
              style={styles.input}
              value={account}
            />
            <TextInput
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <PrimaryButton
              disabled={isLoading}
              label={isLoading ? 'Signing in' : 'Sign in'}
              onPress={handleLogin}
            />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.sectionTitle}>{session.user.account}</Text>
                  <Text style={styles.mutedText}>{session.user.role}</Text>
                </View>
                <SecondaryButton label="Sign out" onPress={handleLogout} />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Device binding</Text>
                <SecondaryButton
                  disabled={isLoading}
                  label="Reload"
                  onPress={handleRefreshBinding}
                />
              </View>
              <InfoRow
                label="Vehicle"
                value={binding?.vehicle.plate_number ?? 'No binding'}
              />
              <InfoRow label="Name" value={binding?.vehicle.name ?? 'No data'} />
              <InfoRow
                label="Device"
                value={binding?.device_identifier ?? 'No data'}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Uploader</Text>
                <StatusBadge status={uploadStatus} />
              </View>
              <InfoRow label="Backend" value={config.apiBaseUrl} />
              <InfoRow label="MQTT" value={config.mqttWsUrl} />
              <InfoRow
                label="Latest publish"
                value={formatDateTime(latestPublishedAt)}
              />
              <View style={styles.buttonRow}>
                <PrimaryButton
                  disabled={isUploading || !binding}
                  label={isUploading ? 'Uploading' : 'Start upload'}
                  onPress={startUpload}
                />
                <SecondaryButton
                  disabled={!isUploading}
                  label="Stop"
                  onPress={stopUpload}
                />
              </View>
              <SecondaryButton
                disabled={isLoading}
                label="Refresh access token"
                onPress={handleRefreshToken}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Latest GPS payload</Text>
              <InfoRow
                label="Latitude"
                value={latestPayload?.latitude.toString() ?? 'No data'}
              />
              <InfoRow
                label="Longitude"
                value={latestPayload?.longitude.toString() ?? 'No data'}
              />
              <InfoRow
                label="Speed"
                value={
                  latestPayload?.speed === null || latestPayload?.speed === undefined
                    ? 'No data'
                    : `${latestPayload.speed} km/h`
                }
              />
              <InfoRow
                label="Recorded"
                value={formatDateTime(latestPayload?.recorded_at ?? null)}
              />
            </View>
          </>
        )}

        {isLoading ? <ActivityIndicator color="#1f6f8b" /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: Readonly<{
  disabled?: boolean
  label: string
  onPress: () => void
}>) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles.primaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({
  disabled,
  label,
  onPress,
}: Readonly<{
  disabled?: boolean
  label: string
  onPress: () => void
}>) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles.secondaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function InfoRow({
  label,
  value,
}: Readonly<{
  label: string
  value: string
}>) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function StatusBadge({ status }: Readonly<{ status: UploadStatus }>) {
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusBadgeText}>{status}</Text>
    </View>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error'
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

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f5f7f4',
    flex: 1,
  },
  container: {
    gap: 16,
    padding: 20,
  },
  header: {
    gap: 6,
    paddingTop: 8,
  },
  eyebrow: {
    color: '#38617b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#17211c',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#d9dfd8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  sectionTitle: {
    color: '#17211c',
    fontSize: 17,
    fontWeight: '800',
  },
  mutedText: {
    color: '#637168',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#c9d1c8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211c',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    backgroundColor: '#1f6f8b',
  },
  secondaryButton: {
    backgroundColor: '#e6ebe6',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#1f2c25',
    fontWeight: '800',
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    color: '#637168',
    fontSize: 12,
    fontWeight: '800',
  },
  infoValue: {
    color: '#17211c',
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#dff1df',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: '#235d2b',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  errorText: {
    backgroundColor: '#fff4f1',
    borderColor: '#e1a292',
    borderRadius: 8,
    borderWidth: 1,
    color: '#8a2f1a',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    padding: 12,
  },
})

import 'react-native-url-polyfill/auto'

import { Buffer } from 'buffer'
import mqtt, {
  type IClientOptions,
  type IClientPublishOptions,
  type MqttClient,
} from 'mqtt/dist/mqtt'

import { config } from './config'
import type { GpsPayload } from './types'

const globalWithBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
}

if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer
}

export function connectGpsMqttClient(): Promise<MqttClient> {
  const clientId = `fms-mobile-${Math.random().toString(16).slice(2)}`
  const options: IClientOptions = {
    clientId,
    clean: true,
    connectTimeout: 8000,
    keepalive: 30,
    password: config.mqttPassword,
    protocolVersion: 4,
    reconnectPeriod: 3000,
    username: config.mqttUsername,
  }

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(config.mqttWsUrl, options)
    const timeoutId = setTimeout(() => {
      client.end(true)
      reject(new Error('MQTT connection timed out'))
    }, options.connectTimeout)

    client.once('connect', () => {
      clearTimeout(timeoutId)
      resolve(client)
    })

    client.once('error', (error) => {
      clearTimeout(timeoutId)
      client.end(true)
      reject(error)
    })
  })
}

export function publishGpsPayload(
  client: MqttClient,
  payload: GpsPayload,
): Promise<void> {
  const topic = `gps/${payload.vehicle_id}`
  const options: IClientPublishOptions = {
    qos: 1,
    retain: false,
  }

  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), options, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

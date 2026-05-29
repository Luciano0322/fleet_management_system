import mqtt, {
  type IClientOptions,
  type IClientPublishOptions,
  type MqttClient,
} from 'mqtt/dist/mqtt.esm'

import { config } from './config'
import type { GpsPayload } from './types'

export function connectGpsMqttClient(): Promise<MqttClient> {
  const clientId = `fms-mobile-${Math.random().toString(16).slice(2)}`
  const options: IClientOptions = {
    clientId,
    clean: true,
    connectTimeout: 8000,
    forceNativeWebSocket: true,
    keepalive: 30,
    password: config.mqttPassword,
    protocolVersion: 4,
    reconnectPeriod: 3000,
    username: config.mqttUsername,
  }

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(config.mqttWsUrl, options)
    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      client.end(true)
      reject(new Error(`MQTT connection timed out: ${config.mqttWsUrl}`))
    }, options.connectTimeout)

    client.once('connect', () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      resolve(client)
    })

    client.once('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      client.end(true)
      reject(new Error(`MQTT WebSocket error: ${error.message}`))
    })

    client.once('close', () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      reject(
        new Error(
          `MQTT WebSocket closed before CONNECT: ${config.mqttWsUrl}`,
        ),
      )
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

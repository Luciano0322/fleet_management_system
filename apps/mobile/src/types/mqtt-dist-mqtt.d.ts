declare module 'mqtt/dist/mqtt.esm' {
  import type { IClientOptions, IClientPublishOptions, MqttClient } from 'mqtt'

  const mqtt: {
    connect: (brokerUrl: string, opts?: IClientOptions) => MqttClient
  }

  export type { IClientOptions, IClientPublishOptions, MqttClient }
  export default mqtt
}

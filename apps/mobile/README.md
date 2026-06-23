# Mobile GPS Uploader

Expo SDK 54 managed React Native app for Phase 4. SDK 54 is used so the app can
run in the currently available Expo Go version.

## Local Setup

```sh
cd apps/mobile
cp .env.example .env
npm install
npm run start
```

Use the seed driver account:

```text
driver001 / password123
```

## Local Connectivity

The app talks to:

```text
Backend HTTP: http://localhost:8000
MQTT over WebSocket: ws://localhost:9001
```

For Android emulator, the defaults fall back to:

```text
http://10.0.2.2:8000
ws://10.0.2.2:9001
```

For a physical device, replace both values in `.env` with your computer's LAN
IP address.

## Phase 4 Scope

The app supports foreground-only uploads:

- login against FastAPI
- fetch the current driver's active device binding
- request foreground location permission
- publish GPS payloads to `gps/{vehicle_id}` every 10 seconds through MQTT over WebSocket
- display current tracking binding, upload status, latest publish time, and latest error

Background tracking and offline queues are intentionally out of scope for this
phase.

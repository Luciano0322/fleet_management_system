# Fleet Management System

General-purpose real-time GPS tracking platform MVP.

## Phase 0 Runtime

Phase 0 provides the platform-side scaffold:

- FastAPI backend health endpoint
- TanStack Start web login and monitoring shell
- Expo mobile foreground GPS uploader
- PostgreSQL
- Mosquitto MQTT broker with local demo credentials
- docker-compose orchestration

The Expo mobile app is not containerized in this MVP.

## Prerequisites

- Docker
- Docker Compose v2

## First Run

```sh
cp .env.example .env
docker compose up --build
```

The default local endpoints are:

- Backend health: `http://localhost:8000/health`
- Backend OpenAPI docs: `http://localhost:8000/docs`
- Web: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- MQTT: `localhost:1883`
- MQTT over WebSocket: `localhost:9001`

## MQTT Demo Credentials

The compose broker creates a local demo user on startup:

```text
username: fms_demo
password: fms_demo_password
```

These values are only for local development and demo usage.

## Phase 1 Backend Setup

After the compose services are running, initialize the backend schema and seed data:

```sh
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

Seed web/API accounts all use `password123`:

```text
admin001
operator001
driver001
```

The seed relationship is `operator001 -> driver001`, with one active tracking
reference `ABC-1234` and device binding `demo-device-001`.

Auth returns an access / refresh token pair:

- `POST /auth/login` issues `access_token` and `refresh_token`.
- `POST /auth/refresh` rotates a valid refresh token and returns a new pair.
- `POST /auth/logout` revokes the submitted refresh token.

## Phase 2 GPS Ingestion Demo

The backend subscribes to MQTT topic `gps/+` in compose and validates each GPS
message against the registered driver, tracking reference, and active device
binding.

Publish one demo GPS message:

```sh
sh infra/scripts/publish-demo-gps.sh
```

Then log in as the operator and query the latest location:

```sh
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"operator001","password":"password123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s http://localhost:8000/vehicles/latest-locations \
  -H "Authorization: Bearer $TOKEN"
```

The seed tracking target should report the published latitude / longitude and
become `online` for 30 seconds after ingestion.

## Phase 3 Web Monitoring

Open the web app and sign in with one of the seeded accounts:

```text
http://localhost:3000
```

The monitoring page uses the backend HTTP API only. It stores the MVP
access / refresh token pair in browser local storage, refreshes expired access
tokens through `/auth/refresh`, and revokes the refresh token on sign-out.

The page displays:

- visible users within the current JWT user's scope
- tracked users / mobile tracking targets
- tracking reference labels for the current MVP data key
- latest latitude / longitude
- latest recorded time
- backend-derived online / offline status

Latest locations are polled every 5 seconds through the web monitoring runtime
adapter under `apps/web/src/lib/monitoringRuntime.ts`.

The first-version UI does not provide vehicle switching. The `vehicle_id` /
plate number values are still present because the current API and MQTT topic use
them as tracking reference keys.

## Phase 4 Mobile GPS Uploader

The mobile app is an Expo managed app under `apps/mobile`. It logs in as a
driver, fetches `/me/device-binding`, requests foreground location permission,
and publishes GPS messages every 10 seconds through MQTT over WebSocket.

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

The default mobile MQTT path is:

```text
ws://localhost:9001
```

For Android emulator the app falls back to `10.0.2.2`. For a physical device,
set `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_MQTT_WS_URL` in
`apps/mobile/.env` to your computer's LAN IP address.

## Phase 5 Domain / UI / Presence Cleanup

The monitoring UI is driver/mobile-centric:

- tracked users are the primary list
- table rows are display rows, not row-level buttons
- coordinate copy is an explicit button
- web auth session and monitoring polling state are managed with Zustand
- shadcn/ui components are the web UI baseline

The current online/offline result is still computed by the backend snapshot from
`last_seen_at`. The planned presence path is explicit mobile offline events for
graceful stops, MQTT Last Will for abnormal disconnects, and timeout fallback
for missing signals.

## Docker Web Development Notes

The web service bind-mounts local source/config files for development, so normal
changes under `apps/web/src` should hot reload in the running container.

If package dependencies or Dockerfile inputs change, rebuild and recreate the web
container:

```sh
docker compose up -d --build --force-recreate web
```

If the browser appears stale, confirm the container has the expected source:

```sh
docker compose exec web grep -n "Live tracking status" /app/src/routes/monitoring.tsx
```

## Useful Commands

```sh
docker compose ps
docker compose logs -f backend
docker compose logs -f web
docker compose logs -f mqtt
docker compose exec -e MQTT_INGESTION_ENABLED=false backend pytest
cd apps/web
npm run typecheck
npm run build
cd ../..
cd apps/mobile
npm run typecheck
cd ../..
docker compose down
```

## Runtime Verification

After `docker compose up --build`:

```sh
curl http://localhost:8000/health
```

Then open:

```text
http://localhost:3000
```

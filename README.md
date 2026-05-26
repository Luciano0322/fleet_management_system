# Fleet Management System

General-purpose real-time GPS vehicle location platform MVP.

## Phase 0 Runtime

Phase 0 provides the platform-side scaffold:

- FastAPI backend health endpoint
- TanStack Start web login and monitoring shell
- PostgreSQL
- Mosquitto MQTT broker with local demo credentials
- docker-compose orchestration

The React Native mobile app is represented by a placeholder under `apps/mobile`.
It is not containerized in this MVP.

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

The seed relationship is `operator001 -> driver001`, with one active vehicle
`ABC-1234` and device binding `demo-device-001`.

Auth returns an access / refresh token pair:

- `POST /auth/login` issues `access_token` and `refresh_token`.
- `POST /auth/refresh` rotates a valid refresh token and returns a new pair.
- `POST /auth/logout` revokes the submitted refresh token.

## Phase 2 GPS Ingestion Demo

The backend subscribes to MQTT topic `gps/+` in compose and validates each GPS
message against the registered driver, vehicle, and active device binding.

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

The seed vehicle should report the published latitude / longitude and become
`online` for 30 seconds after ingestion.

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
- visible vehicles
- latest latitude / longitude
- latest recorded time
- backend-derived online / offline status
- selected vehicle details

Latest locations are polled every 5 seconds through the web monitoring runtime
adapter under `apps/web/src/lib/monitoringRuntime.ts`.

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

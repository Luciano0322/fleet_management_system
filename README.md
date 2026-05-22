# Fleet Management System

General-purpose real-time GPS vehicle location platform MVP.

## Phase 0 Runtime

Phase 0 provides the platform-side scaffold:

- FastAPI backend health endpoint
- TanStack Start web placeholder
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

## Useful Commands

```sh
docker compose ps
docker compose logs -f backend
docker compose logs -f web
docker compose logs -f mqtt
docker compose exec -e MQTT_INGESTION_ENABLED=false backend pytest
docker compose down
```

## Phase 0 Verification

After `docker compose up --build`:

```sh
curl http://localhost:8000/health
```

Then open:

```text
http://localhost:3000
```

# Implementation Plan: Real-Time GPS Tracking Platform MVP

**Source RFC**: [rfc-fms-design_en.md](./rfc-fms-design_en.md)  
**Status**: Draft  
**Planning Goal**: Convert the RFC into staged, verifiable implementation work that can be executed incrementally.

---

## 1. Delivery Principles

This plan follows the RFC's vertical tracer bullet rule:

* each phase must leave the system startable
* each phase must add one demonstrable capability
* each phase must include verification steps
* FastAPI remains the only business backend
* JWT auth controls both identity and visibility scope
* basic `user_relationships` define which driver users an operator can monitor
* the MVP monitoring subject is the driver / mobile app tracking target
* `vehicles` remains a temporary tracking reference table and API compatibility layer
* TanStack Start is used for the web shell, routing, auth guard, and UI rendering only
* `signal-kernel / async-runtime` manages web monitoring polling, cancellation, stale / fresh / error state, and refresh lifecycle
* shadcn/ui provides the web component baseline
* Zustand manages web-side auth session state and monitoring runtime state
* TanStack Query is a valid production-standard alternative, but it is not the primary polling runtime for this MVP
* Redis, WebSocket, SSE, multi-tenancy, dispatching, reports, and production-grade background mobile tracking stay out of the MVP

The critical path is:

```text
compose scaffold
  -> backend auth + database
  -> MQTT ingestion
  -> web monitoring
  -> mobile uploader
  -> domain / UI / presence cleanup
  -> full demo hardening
```

---

## 2. Phase Overview

| Phase | Name | Main Outcome | Depends On |
| ----- | ---- | ------------ | ---------- |
| 0 | Repository and Runtime Scaffold | Platform-side services can boot through compose | None |
| 1 | Backend Foundation | Login, seed data, migrations, and read interfaces work | Phase 0 |
| 2 | GPS Ingestion | MQTT messages write `gps_history`, upsert `gps_latest`, and update `last_seen_at` | Phase 1 |
| 3 | TanStack Start Monitoring Web | Web login and latest-location polling work | Phase 1, Phase 2 for live data |
| 4 | React Native Mobile Uploader | Mobile can log in and publish GPS every 10 seconds | Phase 1, Phase 2 |
| 5 | Domain / UI / Presence Cleanup | Driver/mobile-centered UI, presence direction, and stable web dev workflow are aligned | Phases 0-4 |
| 6 | Integration and Demo Hardening | Full mobile -> MQTT -> backend -> DB -> web flow is demoable | Phase 5 |
| 7 | Post-MVP Evolution Gate | Decide whether to introduce Redis, push updates, or higher-frequency uploads | Phase 6 |

---

## 3. Phase 0: Repository and Runtime Scaffold

### Goal

Create the monorepo structure and the platform-side runtime skeleton.

### Tasks

* Create `apps/backend`, `apps/web`, `apps/mobile`, `infra/docker`, and `infra/scripts`.
* Add root `docker-compose.yml` with `postgres`, `mqtt`, `backend`, and `web`.
* Add `infra/docker/mosquitto/mosquitto.conf`.
* Add `.env.example` with backend, database, MQTT, web, and mobile-facing variables.
* Add a minimal FastAPI health endpoint.
* Add a minimal TanStack Start page.
* Add Dockerfiles for backend and web.
* Update README with local startup commands.

### Acceptance Criteria

* `docker compose up --build` starts `postgres`, `mqtt`, `backend`, and `web`.
* Backend health check responds from the host.
* Web app responds from the host.
* Mosquitto accepts connections inside the compose network.
* README contains a first-run path for a new developer.

### Verification

* `docker compose up --build`
* `curl http://localhost:<backend-port>/health`
* Open the web app URL in a browser.
* Use an MQTT client from the host or compose network to confirm broker reachability.

### Do Not Do Yet

* Do not implement auth.
* Do not create the final UI.
* Do not add Redis.
* Do not containerize the mobile app.

---

## 4. Phase 1: Backend Foundation

### Goal

Build the backend spine: database schema, migrations, seed data, authentication, and read interfaces.

### Tasks

* Create FastAPI app structure under `apps/backend/app`.
* Configure SQLAlchemy 2.x, asyncpg, and Alembic.
* Create models and migrations for:
  * `users`
  * `vehicles`
  * `device_bindings`
  * `user_relationships`
  * `gps_latest`
  * `gps_history`
* Add indexes:
  * `gps_history(vehicle_id, recorded_at desc)`
  * `device_bindings(user_id, vehicle_id, device_identifier, status)`
  * `user_relationships(parent_user_id, child_user_id, status)`
* Add seed data:
  * one admin
  * one operator
  * one driver
  * one active `operator -> driver` monitoring relationship
  * one active vehicle
  * one active device binding for the driver and vehicle
* Implement password hashing.
* Implement JWT access token and opaque refresh token login through `POST /auth/login`.
* Store only refresh token hashes in the database.
* Implement refresh token rotation through `POST /auth/refresh`.
* Implement refresh token revocation through `POST /auth/logout`.
* Implement authenticated current-user dependency.
* Implement visibility scope resolution:
  * admin can see all active users and vehicles
  * operator can see assigned driver users through active `user_relationships`
  * driver can see only self and own device binding
* Implement:
  * `GET /users`
  * `GET /vehicles`
  * `GET /vehicles/latest-locations`
  * `GET /vehicles/{vehicle_id}/history`
  * `GET /me/device-binding`
* Add backend tests for auth, seed visibility, relationship-scoped queries, empty latest-location query, and protected-route behavior.

### Acceptance Criteria

* Alembic migrations can create the schema from an empty database.
* Seed users can log in.
* Login returns a JWT access token, opaque refresh token, and basic user payload.
* Refresh returns a rotated access / refresh token pair.
* A rotated or logged-out refresh token cannot be reused.
* Admin can see all seed users.
* Operator can see only driver users assigned through active relationships.
* Driver can see only self through `GET /users`.
* `GET /me/device-binding` returns the seed driver's active binding.
* `GET /vehicles/latest-locations` returns an empty or null-location result before GPS data exists.
* FastAPI OpenAPI docs are available at `/docs`.

### Verification

* Run backend test suite.
* Run migrations against the compose Postgres service.
* Log in with seed credentials through `curl` or API docs.
* Query protected vehicle endpoints with and without a token.
* Query `/users` and `/vehicles/latest-locations` as admin, operator, and driver to confirm visibility scope.

### Do Not Do Yet

* Do not implement MQTT ingestion in this phase.
* Do not introduce role-specific authorization beyond the minimum needed to protect endpoints.
* Do not add tenant modeling.

---

## 5. Phase 2: GPS Ingestion

### Goal

Turn MQTT GPS payloads into durable database state.

### Tasks

* Add MQTT client configuration to backend.
* Attach MQTT subscriber through FastAPI lifespan or equivalent startup flow.
* Keep local/demo backend runtime to a single Uvicorn worker.
* Subscribe to `gps/+`.
* Parse `vehicle_id` from the topic.
* Validate GPS payload with Pydantic:
  * required fields
  * latitude range `-90..90`
  * longitude range `-180..180`
  * speed nullable and `>= 0`
  * heading nullable and `0..360`
* Reject messages where topic `vehicle_id` does not match payload `vehicle_id`.
* Reject messages where payload `user_id` does not map to an active registered driver.
* Reject messages where `user_id + vehicle_id + device_identifier` does not map to an active `device_bindings` row.
* In one transaction:
  * insert `gps_history`
  * upsert `gps_latest`
  * update `device_bindings.last_seen_at`
* Add structured logging for accepted and rejected MQTT messages.
* Add a simple manual publish script or documented command for demo data.
* Add tests for valid ingestion and rejection cases.

### Acceptance Criteria

* Publishing a valid MQTT message creates one `gps_history` row.
* Publishing a valid MQTT message upserts `gps_latest`.
* Publishing a valid MQTT message updates `device_bindings.last_seen_at`.
* `GET /vehicles/latest-locations` returns the new location.
* Topic / payload vehicle mismatch is rejected without DB writes.
* Unknown, inactive, or non-driver payload user is rejected without DB writes.
* Missing or inactive device binding is rejected without DB writes.
* Invalid coordinate values are rejected without DB writes.

### Verification

* Run backend test suite.
* Start compose services.
* Publish a valid GPS payload to `gps/{vehicle_id}`.
* Query `GET /vehicles/latest-locations`.
* Publish invalid payloads for the negative cases and confirm no DB writes.

### Do Not Do Yet

* Do not add Redis.
* Do not add batch write buffering.
* Do not add broker ACL synchronization.
* Do not split ingestion into a separate worker unless single-process ingestion blocks the MVP.

### Reserved Redis Evolution Path

Phase 2 should keep the direct-write MVP simple, but the code boundary should
not prevent a later Redis worker topology:

```text
MQTT subscriber
  -> Redis Stream / queue
  -> ingestion worker
  -> PostgreSQL
```

Redis would sit before database writes and act as a buffer, backpressure layer,
and pending-message tracker. It would not perform scheduling or persistence by
itself. A worker would still be required to consume messages, validate active
driver and active device binding state, batch insert `gps_history`, coalesce
`gps_latest` upserts, update `device_bindings.last_seen_at`, and ack Redis
messages only after the DB commit succeeds.

---

## 6. Phase 3: TanStack Start Monitoring Web

### Goal

Build the web monitoring experience on top of FastAPI HTTP interfaces.

### Tasks

* Create TanStack Start app under `apps/web`.
* Configure TanStack Router routes:
  * login route
  * protected monitoring route
* Wire `signal-kernel / async-runtime` into the monitoring route.
* Build a minimal FastAPI client for:
  * `POST /auth/login`
  * `POST /auth/refresh`
  * `POST /auth/logout`
  * `GET /users`
  * `GET /vehicles`
  * `GET /vehicles/latest-locations`
* Store and refresh the access / refresh token pair in a simple MVP-safe client-side mechanism.
* Add auth guard that redirects unauthenticated users to login.
* Build monitoring page:
  * visible registered users
  * tracked driver / mobile tracking target list
  * tracking reference label for the current MVP data key
  * latest latitude / longitude
  * latest recorded time
  * online / offline status
  * no selected vehicle detail panel or vehicle row selection interaction
* Poll `GET /vehicles/latest-locations` every 5 seconds through `signal-kernel / async-runtime`.
* Model request cancellation, stale / fresh / error state, and manual refresh lifecycle explicitly.
* Add loading, empty, and error states.
* Ensure the web service runs in docker-compose.

### Acceptance Criteria

* User can log in through the web app.
* Unauthenticated users cannot access the monitoring route.
* Operators see only registered users, tracking references, and latest locations inside their visibility scope.
* Monitoring page presents tracked drivers / mobile tracking targets from FastAPI data.
* Latest locations refresh every 5 seconds.
* Online / offline status follows the 30-second rule from backend data.
* The web runtime does not directly connect to Postgres or MQTT.

### Verification

* Run web lint/typecheck/build.
* Start compose services.
* Log in through the browser.
* Publish a GPS message through MQTT.
* Confirm the monitoring page updates after polling.

### Phase 3 Implementation Notes

* Implemented routes:
  * `/login`
  * `/monitoring`
  * `/` redirects to the correct route after client auth hydration
* The web client stores the MVP access / refresh token pair in browser local storage.
* `401` responses from protected API calls trigger one `/auth/refresh` attempt before retrying the original request.
* `/auth/logout` is called during sign-out and the local session is cleared afterward.
* The monitoring page polls `/vehicles/latest-locations` every 5 seconds.
* The polling lifecycle is isolated behind `apps/web/src/lib/monitoringRuntime.ts`.
* This local runtime adapter models the intended `signal-kernel / async-runtime` boundary for cancellation, stale / fresh / error state, manual refresh, and future package replacement.
* Backend CORS now allows the local web origin through `CORS_ORIGINS`.

### Do Not Do Yet

* Do not implement WebSocket or SSE.
* Do not use TanStack Start server functions for core business mutations.
* Do not use TanStack Query as the primary polling runtime.
* Do not add polished map playback.
* Do not generate TypeScript clients from OpenAPI yet unless handwritten clients become a blocker.

---

## 7. Phase 4: React Native Mobile Uploader

### Goal

Build the mobile foreground GPS uploader that proves the real device-side path.

### Tasks

* Create Expo managed React Native app under `apps/mobile`.
* Configure TypeScript.
* Add `.env` support for:
  * `EXPO_PUBLIC_API_BASE_URL`
  * `EXPO_PUBLIC_MQTT_WS_URL`
  * `EXPO_PUBLIC_MQTT_USERNAME`
  * `EXPO_PUBLIC_MQTT_PASSWORD`
* Build login screen.
* Call `POST /auth/login`.
* Fetch `GET /me/device-binding` after login.
* Request location permission.
* Read foreground location every 10 seconds.
* Publish GPS payload to `gps/{vehicle_id}` through MQTT over WebSocket.
* Display:
  * current active tracking binding
  * upload enabled / disabled state
  * latest upload time
  * latest publish success / failure
* Add simple retry for transient publish failures.

### Acceptance Criteria

* Mobile app can log in against the compose backend.
* Mobile app can fetch the active device binding.
* Mobile app asks for location permission.
* Mobile app publishes GPS payload every 10 seconds while active.
* Backend accepts valid mobile GPS messages.
* Web monitoring page shows changing driver / mobile tracking target data.
* Mosquitto exposes TCP MQTT on `1883` and MQTT over WebSocket on `9001`.

### Verification

* Run mobile typecheck/tests if available.
* Run app on simulator or device.
* Start compose services.
* Log in with seed driver.
* Confirm backend logs accepted MQTT messages.
* Confirm web monitoring updates.

### Phase 4 Implementation Notes

* Implemented Expo SDK 54 managed app under `apps/mobile` for Expo Go compatibility.
* The mobile MQTT path uses MQTT.js over WebSocket, not a native TCP MQTT module.
* Mosquitto now exposes:
  * `1883` for backend subscriber and CLI publishing
  * `9001` for Expo / React Native MQTT over WebSocket
* Mobile env values use Expo public env names:
  * `EXPO_PUBLIC_API_BASE_URL`
  * `EXPO_PUBLIC_MQTT_WS_URL`
  * `EXPO_PUBLIC_MQTT_USERNAME`
  * `EXPO_PUBLIC_MQTT_PASSWORD`
* GPS publishes use QoS 1 to avoid losing the message during short-lived or unstable mobile connections.
* Upload remains foreground-only; background mode is still deferred.

### Do Not Do Yet

* Do not implement full background tracking.
* Do not implement complex offline queues.
* Do not solve every iOS / Android platform edge case.
* Do not containerize the mobile app.

---

## 8. Phase 5: Domain / UI / Presence Cleanup

### Goal

Align the MVP domain language and web UI so the first version is clearly a
driver / mobile tracking system, not a vehicle-switching or in-vehicle-device
system.

### Tasks

* Shift documentation and UI copy from vehicle-centric to driver/mobile-centric language.
* Make tracked drivers / mobile tracking targets the primary web monitoring list.
* Remove selected vehicle detail and vehicle row selection interactions from the web UI.
* Keep `vehicle_id` as the MVP tracking reference key, but document that it is temporary.
* Integrate shadcn/ui as the web UI component baseline.
* Integrate Zustand for web-side auth session state and monitoring runtime state.
* Document the device presence direction:
  * explicit offline event for graceful mobile stop / sign-out
  * MQTT Last Will for abnormal MQTT disconnect
  * timeout fallback based on `last_seen_at`
* Improve the Docker web development workflow so local source changes do not require guessing whether the container is stale.

### Acceptance Criteria

* Web UI no longer implies vehicle switching.
* Monitoring page clearly presents tracked driver / mobile tracking target status.
* Table rows are passive display rows; only explicit controls such as refresh, sign-out, and coordinate copy are buttons.
* Auth session and monitoring polling state are managed through Zustand.
* shadcn/ui components are available as the web component baseline.
* README and implementation plan describe `vehicle_id` as a tracking reference, not a first-version vehicle switching target.
* Device presence has a documented near-term path beyond the current timeout-only rule.
* Docker compose web development mounts local source/config so ordinary UI edits hot reload.

### Verification

* Run web typecheck/build.
* Start or refresh compose web service.
* Confirm `/monitoring` shows tracked users instead of vehicle selection.
* Confirm coordinate copy remains the only row-level action.
* Update docs and README references.
* Run `docker compose config` after compose changes.

### Phase 5 Implementation Notes

* The web UI now uses shadcn/ui primitives under `apps/web/src/components/ui`.
* Auth state is held in `apps/web/src/stores/authSessionStore.ts`.
* Monitoring state is held in `apps/web/src/stores/monitoringStore.ts`.
* `apps/web/src/lib/monitoringRuntime.ts` now keeps only runtime types and helpers.
* The monitoring table is centered on tracked users and tracking references.
* The table does not use row-level buttons or selection state.
* The copy coordinates button is the explicit interaction for coordinate values.
* The Docker web service bind-mounts local `src`, `components.json`, `tsconfig.json`, and `vite.config.ts` for dev hot reload.
* Package or dependency changes still require a web image rebuild and container recreation.

### Presence Direction

The current backend online status remains timeout-based: if the latest
`last_seen_at` is within the configured threshold, the tracking target is
`online`; otherwise it is `offline`.

The next presence iteration should layer explicit signals on top of this rule:

```text
mobile graceful stop / sign-out
  -> explicit offline event

MQTT abnormal disconnect
  -> broker Last Will offline event

missing events or dropped network
  -> timeout fallback from last_seen_at
```

The API should continue to return a snapshot status to the web client. The web
client should not own the source-of-truth online/offline decision; it should poll
or refetch backend snapshots.

### Do Not Do Yet

* Do not rename backend tables or endpoints only for presentation.
* Do not implement production MQTT ACL synchronization.
* Do not replace polling with WebSocket / SSE in this phase.
* Do not add Redis just for presence.

---

## 9. Phase 6: Integration and Demo Hardening

### Goal

Make the MVP reliable enough for a new developer or stakeholder demo.

### Tasks

* Complete README with:
  * prerequisites
  * env setup
  * compose startup
  * backend migration and seed commands
  * web login flow
  * manual MQTT publish flow
  * mobile connection notes
* Complete `.env.example`.
* Add demo seed credentials and tracking reference identifiers.
* Add smoke scripts for:
  * backend health
  * login
  * latest-location query
  * manual MQTT publish
* Add basic error handling and visible failure states.
* Add a short demo checklist.
* Verify clean startup from a fresh checkout.

### Acceptance Criteria

* A new developer can start platform-side services from README.
* Backend migrations and seed data can be applied repeatably.
* Manual MQTT publish produces visible data in the web monitoring page.
* Mobile can publish into the same pipeline.
* All core tests pass.
* Demo checklist can be completed without undocumented steps.

### Verification

* Fresh clone / clean working tree rehearsal if possible.
* `docker compose up --build`
* Run backend tests.
* Run web lint/typecheck/build.
* Complete manual demo checklist.

### Phase 6 Implementation Notes

* Added `infra/scripts/setup-demo-data.sh` for repeatable Alembic migration and seed setup.
* Added `infra/scripts/smoke-demo.sh` for platform-side health, login, latest-location, MQTT publish, and post-publish latest-location checks.
* `infra/scripts/publish-demo-gps.sh` supports MQTT host / port overrides while keeping seed defaults.
* `.env.example` now includes demo account, user ID, tracking reference, and device identifier values.
* README now includes the fastest demo path, smoke command, and manual demo checklist.

### Do Not Do Yet

* Do not add production observability stack.
* Do not add Redis.
* Do not optimize for 1-second uploads.

---

## 10. Phase 7: Post-MVP Evolution Gate

### Goal

Make an explicit decision after the MVP is working, instead of adding future architecture early.

### Candidate Follow-Ups

* Redis latest-location cache.
* Redis Stream / queue before PostgreSQL writes.
* Ingestion worker consumer group for retry, batching, dead-letter handling, and DB commit / ack coordination.
* WebSocket or SSE invalidation signals that trigger HTTP snapshot refetch.
* OpenAPI-generated TypeScript clients.
* Per-device MQTT credentials or broker ACL synchronization.
* Background location mode and offline queue for mobile.
* Higher-frequency uploads, first 5 seconds, then 1 second.
* Multi-driver / multi-tracking-target demo load testing.

### Decision Criteria

Consider these only after Phase 6 is complete:

* number of tracked drivers / tracking targets in target demos
* acceptable location latency
* observed Postgres write pressure
* number of pending or retried GPS messages during load tests
* whether direct DB transactions from the MQTT subscriber create unacceptable backpressure
* mobile battery behavior
* operational need for live invalidation instead of polling
* security requirements for production MQTT access

### Phase 7 Implementation Notes

* Added [post-mvp-evolution-gate_en.md](./post-mvp-evolution-gate_en.md) and [post-mvp-evolution-gate_zhTW.md](./post-mvp-evolution-gate_zhTW.md).
* Current gate decision: keep the MVP architecture unchanged.
* Defer Redis, WebSocket / SSE, one-second uploads, broker ACL synchronization, and background mobile queues.
* Prioritize presence hardening next: explicit offline event, MQTT Last Will, timeout fallback.
* Require a repeatable load baseline before introducing Redis Stream, ingestion workers, or high-frequency uploads.

---

## 11. Suggested First Implementation Slice

The first implementation slice should be:

1. Create `apps/backend`, `apps/web`, `infra/docker`, `docker-compose.yml`, and `.env.example`.
2. Start Postgres, Mosquitto, backend health endpoint, and TanStack Start placeholder page through compose.
3. Document the startup path in README.

This proves the repo and runtime shape before investing in auth, database migrations, MQTT ingestion, or mobile integration.

---

## 12. Open Questions Before Coding

These do not block Phase 0, but should be resolved before or during Phase 1:

* Which Python dependency manager should the backend use?
* Which Node package manager should the monorepo use?
* Should seed credentials be committed only as demo values in `.env.example`, or generated by a seed command?
* What local ports should backend, web, postgres, and mqtt use?
* Should `GET /vehicles/latest-locations` return vehicles without GPS data, or only vehicles with known latest locations?
* For MVP auth storage in the web app, is local storage acceptable, or should the web app use an HTTP-only cookie pattern?

# Post-MVP Evolution Gate

**Status**: Accepted  
**Date**: 2026-06-23  
**Related RFC**: [rfc-fms-design_en.md](./rfc-fms-design_en.md)  
**Related Plan**: [implementation-plan_en.md](./implementation-plan_en.md)

---

## 1. Purpose

Phase 7 exists to prevent premature architecture expansion after the MVP becomes
demo-stable. The goal is to decide which post-MVP paths are justified now, which
ones are deferred, and which signals should trigger a later upgrade.

This is a decision gate, not a Redis / WebSocket / background-tracking
implementation phase.

---

## 2. Current Baseline

The current MVP baseline is:

* tracking subject: driver / mobile app tracking target
* compatibility key: `vehicle_id` remains the MVP tracking reference key
* mobile upload cadence: foreground GPS publish every 10 seconds
* transport: mobile publishes MQTT over WebSocket to `gps/{vehicle_id}`
* ingestion: backend MQTT subscriber validates and writes directly to PostgreSQL
* persistence: insert `gps_history`, upsert `gps_latest`, update `device_bindings.last_seen_at`
* web update model: HTTP polling of `/vehicles/latest-locations` every 5 seconds
* presence model: backend snapshot status from `last_seen_at` timeout
* demo readiness: Phase 6 smoke script verifies health, login, MQTT publish, and latest-location update

The Phase 6 verification passed for the current local demo pipeline.

---

## 3. Gate Result

For the current MVP, keep the existing architecture:

```text
mobile
  -> MQTT over WebSocket
  -> backend MQTT subscriber
  -> PostgreSQL
  -> web HTTP polling snapshot
```

Do not introduce Redis, WebSocket / SSE, one-second upload cadence, broker ACL
synchronization, or background mobile queues yet.

The next post-MVP implementation should be **presence hardening**, because it
solves the known online/offline drift problem without requiring a heavier
throughput architecture.

Recommended next order:

1. Presence hardening: explicit offline event, MQTT Last Will, timeout fallback.
2. Demo/load baseline: measure multi-driver publish and polling behavior.
3. OpenAPI client generation if API drift starts slowing frontend/mobile work.
4. Redis Stream + ingestion worker only if measured write pressure or backpressure appears.
5. WebSocket / SSE invalidation only if polling latency or redundant polling becomes a product problem.
6. Background tracking and offline queue only when field tracking becomes a real requirement.

---

## 4. Decision Matrix

| Candidate | Decision | Why | Upgrade Trigger |
| --- | --- | --- | --- |
| Presence events | Do next | Current timeout-only offline state can lag during disconnects. This is a correctness issue, not a throughput issue. | Any demo where disconnect state must update faster than timeout fallback. |
| Redis latest-location cache | Defer | Current read path is simple and adequate for MVP demos. | Latest-location endpoint becomes slow under multiple dashboards or repeated polling. |
| Redis Stream / queue before DB writes | Defer | Direct writes are easier to reason about and have passed the current demo path. | MQTT subscriber creates DB backpressure, drops messages, or cannot keep up in load tests. |
| Ingestion worker consumer group | Defer with Redis Stream | Useful only after queued ingestion exists. | Redis Stream is introduced, or retry / dead-letter behavior becomes necessary. |
| WebSocket / SSE invalidation | Defer | Five-second polling is enough for the current product feel and keeps web state simple. | Operators require lower perceived latency or many clients create redundant polling load. |
| OpenAPI-generated clients | Optional later | Handwritten clients are still small. | Endpoint surface grows enough that frontend/mobile type drift becomes costly. |
| Per-device MQTT credentials / ACL | Defer until external-device demos | Current broker credentials are local-demo only. | Devices are untrusted, shared outside local development, or require revocation. |
| Background location / offline queue | Defer | Foreground upload is enough for the MVP and easier to demo. | Real field tracking requires uploads while the app is backgrounded or temporarily offline. |
| 5-second or 1-second uploads | Defer until measured | Higher cadence affects battery, ingestion load, and demo stability. | Product requires higher fidelity and load/battery tests show it is acceptable. |
| Multi-driver load test | Do before scaling work | It gives evidence for or against Redis / worker / push architecture. | Before any Redis, high-frequency upload, or many-driver demo commitment. |

---

## 5. Presence Hardening Direction

Presence should remain backend-owned. The web client should display a backend
snapshot and should not derive source-of-truth online/offline state locally.

Recommended event sources:

```text
mobile graceful stop / sign-out
  -> explicit offline event

MQTT abnormal disconnect
  -> broker Last Will offline event

missing events or dropped network
  -> timeout fallback from last_seen_at
```

Recommended data shape:

```text
device_presence_events
  id
  user_id
  vehicle_id
  device_identifier
  event_type          # online | offline | heartbeat
  source              # mobile_api | mqtt_lwt | mqtt_ingestion | timeout
  occurred_at
  created_at
  metadata_json
```

The latest API can then compute status from:

1. latest explicit offline event
2. latest accepted GPS / heartbeat event
3. timeout fallback from `device_bindings.last_seen_at`

For the next implementation slice, it is acceptable to start with an explicit
mobile offline endpoint or MQTT message and a Last Will message before adding
every event-table refinement.

---

## 6. Load Baseline Before Redis

Before introducing Redis, run a repeatable local load baseline with:

* number of tracking targets
* upload cadence
* accepted MQTT messages per second
* rejected MQTT messages per second
* latest-location API latency
* Postgres write latency or transaction time
* dropped / delayed message count, if observable

Redis is justified only when direct database writes or polling snapshots become a
measured bottleneck.

---

## 7. Final Decision

Phase 7 closes with this decision:

* Keep the MVP architecture unchanged.
* Treat Redis, WebSocket / SSE, high-frequency upload, ACL synchronization, and background queues as deferred evolution paths.
* Implement presence hardening first if development continues.
* Measure load before adding Redis or ingestion workers.

# Post-MVP Evolution Gate

**狀態**：已接受  
**日期**：2026-06-23  
**相關 RFC**：[rfc-fms-design_zhTW.md](./rfc-fms-design_zhTW.md)  
**相關計畫**：[implementation-plan_en.md](./implementation-plan_en.md)

---

## 1. 目的

Phase 7 的目的，是在 MVP 已經可以穩定 demo 後，避免太早加入過重的架構。
這個階段要明確決定哪些演進現在值得做、哪些應延後，以及未來需要看到
哪些訊號才升級。

這是一個決策關卡，不是 Redis / WebSocket / 背景定位的實作階段。

---

## 2. 目前基準

目前 MVP 基準如下：

* 監控主體：driver / mobile app tracking target
* 相容 key：`vehicle_id` 仍作為 MVP tracking reference key
* mobile 上拋頻率：前景每 10 秒 publish 一次 GPS
* 傳輸：mobile 透過 MQTT over WebSocket publish 到 `gps/{vehicle_id}`
* ingestion：backend MQTT subscriber 驗證後直接寫 PostgreSQL
* persistence：insert `gps_history`、upsert `gps_latest`、update `device_bindings.last_seen_at`
* web 更新模式：每 5 秒 HTTP polling `/vehicles/latest-locations`
* presence 模型：backend 依 `last_seen_at` timeout 計算 snapshot status
* demo readiness：Phase 6 smoke script 已驗證 health、login、MQTT publish 與 latest-location update

Phase 6 驗證已通過目前本機 demo pipeline。

---

## 3. Gate 結果

目前 MVP 保持既有架構：

```text
mobile
  -> MQTT over WebSocket
  -> backend MQTT subscriber
  -> PostgreSQL
  -> web HTTP polling snapshot
```

現階段不引入 Redis、WebSocket / SSE、1 秒上拋、broker ACL synchronization、
或 mobile background queue。

下一個最值得實作的 post-MVP 項目是 **presence hardening**，因為它直接解決
已知 online/offline drift 問題，而且不需要先導入更重的 throughput 架構。

建議後續順序：

1. Presence hardening：explicit offline event、MQTT Last Will、timeout fallback。
2. Demo/load baseline：量測多 driver publish 與 polling 行為。
3. 如果 API drift 開始拖慢 frontend/mobile，再導入 OpenAPI client generation。
4. 只有在量測出 write pressure 或 backpressure 時，才導入 Redis Stream + ingestion worker。
5. 只有 polling latency 或重複 polling 成為產品問題時，才導入 WebSocket / SSE invalidation。
6. 只有真的需要 field tracking 時，才導入 background tracking 與 offline queue。

---

## 4. 決策矩陣

| 候選項目 | 決策 | 原因 | 升級觸發條件 |
| --- | --- | --- | --- |
| Presence events | 下一步優先 | 目前 timeout-only 離線狀態在斷線時可能延遲，這是正確性問題，不是吞吐問題。 | demo 需要比 timeout fallback 更快反映斷線。 |
| Redis latest-location cache | 延後 | 目前 read path 對 MVP demo 仍足夠簡單。 | 多個 dashboard 或頻繁 polling 讓 latest-location endpoint 變慢。 |
| Redis Stream / queue before DB writes | 延後 | 直接寫 DB 更容易推理，目前 demo path 已通過。 | MQTT subscriber 造成 DB backpressure、掉訊息、或 load test 追不上。 |
| Ingestion worker consumer group | 隨 Redis Stream 延後 | 有 queue 後 worker 才有明確價值。 | 導入 Redis Stream，或需要 retry / dead-letter 行為。 |
| WebSocket / SSE invalidation | 延後 | 5 秒 polling 對目前產品感受足夠，也讓 web state 保持簡單。 | operator 需要更低感知延遲，或多 client 造成重複 polling 負載。 |
| OpenAPI-generated clients | 可後續導入 | handwritten clients 目前仍小。 | endpoint surface 變大，frontend/mobile type drift 開始變貴。 |
| Per-device MQTT credentials / ACL | 外部裝置 demo 前延後 | 目前 broker credential 僅供本機 demo。 | 裝置不可信、離開本機開發環境、或需要撤銷個別裝置權限。 |
| Background location / offline queue | 延後 | Foreground upload 足以完成 MVP，且較容易 demo。 | 真實 field tracking 需要 app 在背景或暫時離線時仍能上拋。 |
| 5 秒或 1 秒上拋 | 量測後再決定 | 更高頻率會影響電量、ingestion load 與 demo 穩定性。 | 產品需要更高軌跡精細度，且 load/battery test 可接受。 |
| Multi-driver load test | scaling 前先做 | 它能提供是否需要 Redis / worker / push 架構的證據。 | 在承諾 Redis、高頻上拋或多 driver demo 前。 |

---

## 5. Presence Hardening 方向

Presence 應維持 backend-owned。Web client 應只呈現 backend snapshot，不應在
client 端自行判斷 source-of-truth online/offline 狀態。

建議事件來源：

```text
mobile graceful stop / sign-out
  -> explicit offline event

MQTT abnormal disconnect
  -> broker Last Will offline event

missing events or dropped network
  -> timeout fallback from last_seen_at
```

建議資料形狀：

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

latest API 可依序從以下來源計算狀態：

1. 最新 explicit offline event
2. 最新 accepted GPS / heartbeat event
3. `device_bindings.last_seen_at` timeout fallback

下一個實作 slice 可以先從 explicit mobile offline endpoint 或 MQTT message
與 Last Will message 開始，不需要一次把 event table refinement 全部完成。

---

## 6. Redis 前的 Load Baseline

引入 Redis 前，應先用可重跑的本機 load baseline 量測：

* tracking targets 數量
* upload cadence
* accepted MQTT messages per second
* rejected MQTT messages per second
* latest-location API latency
* Postgres write latency 或 transaction time
* dropped / delayed message count，如果可觀測

只有當 direct database writes 或 polling snapshots 成為可量測瓶頸時，Redis 才值得導入。

---

## 7. 最終決策

Phase 7 以此決策收斂：

* 保持 MVP 架構不變。
* Redis、WebSocket / SSE、高頻上拋、ACL synchronization、background queues 全部列為延後演進路徑。
* 若繼續開發，先做 presence hardening。
* 導入 Redis 或 ingestion workers 前，先做 load measurement。

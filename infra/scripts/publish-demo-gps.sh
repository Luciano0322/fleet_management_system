#!/usr/bin/env sh
set -eu

VEHICLE_ID="${VEHICLE_ID:-00000000-0000-0000-0000-000000000101}"
USER_ID="${USER_ID:-00000000-0000-0000-0000-000000000003}"
DEVICE_IDENTIFIER="${DEVICE_IDENTIFIER:-demo-device-001}"
LATITUDE="${LATITUDE:-25.033}"
LONGITUDE="${LONGITUDE:-121.5654}"
SPEED="${SPEED:-42.5}"
HEADING="${HEADING:-178}"
RECORDED_AT="${RECORDED_AT:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
MQTT_USERNAME="${MQTT_USERNAME:-fms_demo}"
MQTT_PASSWORD="${MQTT_PASSWORD:-fms_demo_password}"
MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"

PAYLOAD=$(printf '{"user_id":"%s","vehicle_id":"%s","device_identifier":"%s","latitude":%s,"longitude":%s,"speed":%s,"heading":%s,"recorded_at":"%s"}' \
  "$USER_ID" \
  "$VEHICLE_ID" \
  "$DEVICE_IDENTIFIER" \
  "$LATITUDE" \
  "$LONGITUDE" \
  "$SPEED" \
  "$HEADING" \
  "$RECORDED_AT")

docker compose exec -T mqtt mosquitto_pub \
  -h "$MQTT_HOST" \
  -p "$MQTT_PORT" \
  -u "$MQTT_USERNAME" \
  -P "$MQTT_PASSWORD" \
  -t "gps/$VEHICLE_ID" \
  -m "$PAYLOAD"

printf '%s\n' "$PAYLOAD"

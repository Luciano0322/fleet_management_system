#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

API_BASE_URL="${API_BASE_URL:-http://localhost:${BACKEND_PORT:-8000}}"
RUN_SETUP="${RUN_SETUP:-true}"
SMOKE_RETRIES="${SMOKE_RETRIES:-12}"
SMOKE_SLEEP_SECONDS="${SMOKE_SLEEP_SECONDS:-1}"

DEMO_OPERATOR_ACCOUNT="${DEMO_OPERATOR_ACCOUNT:-operator001}"
DEMO_DRIVER_ACCOUNT="${DEMO_DRIVER_ACCOUNT:-driver001}"
DEMO_PASSWORD="${DEMO_PASSWORD:-password123}"
DEMO_TRACKING_REF_LABEL="${DEMO_TRACKING_REF_LABEL:-ABC-1234}"
DEMO_LATITUDE="${LATITUDE:-25.033}"
DEMO_LONGITUDE="${LONGITUDE:-121.5654}"

fail() {
  printf 'Smoke check failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
}

require_command curl
require_command python3
require_command docker

if [ "$RUN_SETUP" = "true" ]; then
  sh "$SCRIPT_DIR/setup-demo-data.sh"
fi

printf 'Checking backend health at %s/health...\n' "$API_BASE_URL"
curl -fsS "$API_BASE_URL/health" >/dev/null ||
  fail "backend health endpoint did not respond"

printf 'Logging in as %s...\n' "$DEMO_OPERATOR_ACCOUNT"
LOGIN_RESPONSE=$(
  curl -fsS -X POST "$API_BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"account\":\"$DEMO_OPERATOR_ACCOUNT\",\"password\":\"$DEMO_PASSWORD\"}"
) || fail "login request failed"

ACCESS_TOKEN=$(
  printf '%s' "$LOGIN_RESPONSE" | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
token = payload.get("access_token")
if not token:
    raise SystemExit("login response did not include access_token")
print(token)
'
) || fail "could not parse access token"

printf 'Checking latest-location visibility before publish...\n'
LATEST_RESPONSE=$(
  curl -fsS "$API_BASE_URL/vehicles/latest-locations" \
    -H "Authorization: Bearer $ACCESS_TOKEN"
) || fail "latest-location query failed"

printf '%s' "$LATEST_RESPONSE" | python3 -c '
import json
import sys

expected_driver = sys.argv[1]
expected_ref = sys.argv[2]
rows = json.load(sys.stdin)
row = next(
    (
        item
        for item in rows
        if item.get("driver_account") == expected_driver
        and item.get("plate_number") == expected_ref
    ),
    None,
)
if row is None:
    raise SystemExit(
        f"expected demo row for {expected_driver} / {expected_ref}, got {rows!r}"
    )
print(
    "Found demo row before publish: status={status} lat={lat} lon={lon}".format(
        status=row.get("online_status"),
        lat=row.get("latitude"),
        lon=row.get("longitude"),
    )
)
' "$DEMO_DRIVER_ACCOUNT" "$DEMO_TRACKING_REF_LABEL" ||
  fail "demo latest-location row was not visible"

printf 'Publishing demo GPS payload through MQTT...\n'
sh "$SCRIPT_DIR/publish-demo-gps.sh" >/dev/null ||
  fail "demo GPS publish failed"

attempt=1
while [ "$attempt" -le "$SMOKE_RETRIES" ]; do
  LATEST_RESPONSE=$(
    curl -fsS "$API_BASE_URL/vehicles/latest-locations" \
      -H "Authorization: Bearer $ACCESS_TOKEN"
  ) || fail "latest-location query failed after publish"

  if printf '%s' "$LATEST_RESPONSE" | python3 -c '
import json
import math
import sys

expected_driver = sys.argv[1]
expected_ref = sys.argv[2]
expected_lat = float(sys.argv[3])
expected_lon = float(sys.argv[4])
rows = json.load(sys.stdin)
row = next(
    (
        item
        for item in rows
        if item.get("driver_account") == expected_driver
        and item.get("plate_number") == expected_ref
    ),
    None,
)
if row is None:
    raise SystemExit(2)

lat = row.get("latitude")
lon = row.get("longitude")
if lat is None or lon is None:
    raise SystemExit(3)

if not math.isclose(float(lat), expected_lat, abs_tol=0.000001):
    raise SystemExit(4)
if not math.isclose(float(lon), expected_lon, abs_tol=0.000001):
    raise SystemExit(5)
if row.get("online_status") != "online":
    raise SystemExit(6)

print(
    "Latest location accepted: driver={driver} tracking_ref={tracking_ref} "
    "status={status} lat={lat} lon={lon}".format(
        driver=row.get("driver_account"),
        tracking_ref=row.get("plate_number"),
        status=row.get("online_status"),
        lat=lat,
        lon=lon,
    )
)
' "$DEMO_DRIVER_ACCOUNT" "$DEMO_TRACKING_REF_LABEL" "$DEMO_LATITUDE" "$DEMO_LONGITUDE"; then
    printf 'Smoke demo passed.\n'
    exit 0
  fi

  attempt=$((attempt + 1))
  sleep "$SMOKE_SLEEP_SECONDS"
done

fail "latest-location snapshot did not reflect the demo publish after $SMOKE_RETRIES attempts"

#!/usr/bin/env sh
set -eu

printf 'Applying backend migrations...\n'
docker compose exec -T backend alembic upgrade head

printf 'Seeding demo users, relationship, tracking reference, and device binding...\n'
docker compose exec -T backend python -m app.seed

printf 'Demo data is ready.\n'

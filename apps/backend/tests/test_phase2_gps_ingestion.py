from __future__ import annotations

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import get_session
from app.gps_ingestion import ingest_gps_message
from app.main import app
from app.models import Base, DeviceBinding, GpsHistory, GpsLatest, User
from app.seed import (
    ADMIN_ID,
    DRIVER_ID,
    SEED_DEVICE_IDENTIFIER,
    SEED_PASSWORD,
    VEHICLE_ID,
    seed_database,
)


@dataclass(frozen=True)
class SeededDatabase:
    session_factory: async_sessionmaker[AsyncSession]


@pytest.fixture()
def seeded_db() -> Iterator[SeededDatabase]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup_database() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            await seed_database(session)

    asyncio.run(setup_database())
    yield SeededDatabase(session_factory=session_factory)
    asyncio.run(engine.dispose())


@pytest.fixture()
def client(seeded_db: SeededDatabase) -> Iterator[TestClient]:
    async def override_get_session():
        async with seeded_db.session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def gps_payload(**overrides) -> dict[str, object]:
    payload: dict[str, object] = {
        "user_id": str(DRIVER_ID),
        "vehicle_id": str(VEHICLE_ID),
        "device_identifier": SEED_DEVICE_IDENTIFIER,
        "latitude": 25.033,
        "longitude": 121.5654,
        "speed": 42.5,
        "heading": 178.0,
        "recorded_at": "2026-05-22T08:30:00Z",
    }
    payload.update(overrides)
    return payload


async def ingest_payload(
    seeded_db: SeededDatabase,
    payload: dict[str, object],
    topic_vehicle_id: UUID = VEHICLE_ID,
):
    async with seeded_db.session_factory() as session:
        return await ingest_gps_message(
            session,
            f"gps/{topic_vehicle_id}",
            json_bytes(payload),
        )


def json_bytes(payload: dict[str, object]) -> bytes:
    import json

    return json.dumps(payload).encode()


async def gps_history_count(seeded_db: SeededDatabase) -> int:
    async with seeded_db.session_factory() as session:
        return await session.scalar(select(func.count()).select_from(GpsHistory)) or 0


def auth_headers(client: TestClient, account: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={"account": account, "password": SEED_PASSWORD},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_valid_mqtt_payload_writes_history_latest_and_last_seen(
    seeded_db: SeededDatabase,
    client: TestClient,
) -> None:
    result = asyncio.run(ingest_payload(seeded_db, gps_payload()))

    assert result.accepted is True
    assert result.reason == "accepted"

    async def assert_database_state() -> None:
        async with seeded_db.session_factory() as session:
            histories = (
                await session.execute(select(GpsHistory).order_by(GpsHistory.recorded_at))
            ).scalars().all()
            latest = await session.get(GpsLatest, VEHICLE_ID)
            binding = (
                await session.execute(
                    select(DeviceBinding).where(DeviceBinding.user_id == DRIVER_ID)
                )
            ).scalar_one()

            assert len(histories) == 1
            assert histories[0].latitude == 25.033
            assert histories[0].source == "mqtt"
            assert latest is not None
            assert latest.latitude == 25.033
            assert latest.longitude == 121.5654
            assert binding.last_seen_at is not None

    asyncio.run(assert_database_state())

    latest_response = client.get(
        "/vehicles/latest-locations",
        headers=auth_headers(client, "operator001"),
    )
    assert latest_response.status_code == 200
    latest_payload = latest_response.json()[0]
    assert latest_payload["latitude"] == 25.033
    assert latest_payload["longitude"] == 121.5654
    assert latest_payload["online_status"] == "online"


def test_valid_mqtt_payload_upserts_latest_location(
    seeded_db: SeededDatabase,
) -> None:
    asyncio.run(ingest_payload(seeded_db, gps_payload(latitude=25.0, speed=10.0)))
    result = asyncio.run(
        ingest_payload(
            seeded_db,
            gps_payload(
                latitude=26.0,
                longitude=122.0,
                speed=20.0,
                recorded_at="2026-05-22T08:31:00Z",
            ),
        )
    )

    assert result.accepted is True

    async def assert_database_state() -> None:
        async with seeded_db.session_factory() as session:
            history_count = (
                await session.scalar(select(func.count()).select_from(GpsHistory))
            )
            latest = await session.get(GpsLatest, VEHICLE_ID)

            assert history_count == 2
            assert latest is not None
            assert latest.latitude == 26.0
            assert latest.longitude == 122.0
            assert latest.speed == 20.0

    asyncio.run(assert_database_state())


@pytest.mark.parametrize(
    ("payload", "topic_vehicle_id", "expected_reason"),
    [
        (gps_payload(vehicle_id=str(uuid4())), VEHICLE_ID, "topic_payload_mismatch"),
        (gps_payload(latitude=99), VEHICLE_ID, "invalid_payload"),
        (gps_payload(speed=-1), VEHICLE_ID, "invalid_payload"),
        (gps_payload(heading=361), VEHICLE_ID, "invalid_payload"),
        (
            gps_payload(device_identifier="missing-device"),
            VEHICLE_ID,
            "binding_not_active",
        ),
    ],
)
def test_invalid_or_untrusted_payloads_are_rejected_without_writes(
    seeded_db: SeededDatabase,
    payload: dict[str, object],
    topic_vehicle_id: UUID,
    expected_reason: str,
) -> None:
    result = asyncio.run(ingest_payload(seeded_db, payload, topic_vehicle_id))

    assert result.accepted is False
    assert result.reason == expected_reason
    assert asyncio.run(gps_history_count(seeded_db)) == 0


def test_unknown_payload_user_is_rejected_without_writes(
    seeded_db: SeededDatabase,
) -> None:
    result = asyncio.run(ingest_payload(seeded_db, gps_payload(user_id=str(uuid4()))))

    assert result.accepted is False
    assert result.reason == "user_not_active_driver"
    assert asyncio.run(gps_history_count(seeded_db)) == 0


def test_inactive_driver_is_rejected_without_writes(
    seeded_db: SeededDatabase,
) -> None:
    async def deactivate_driver() -> None:
        async with seeded_db.session_factory() as session:
            driver = await session.get(User, DRIVER_ID)
            assert driver is not None
            driver.status = "inactive"
            await session.commit()

    asyncio.run(deactivate_driver())

    result = asyncio.run(ingest_payload(seeded_db, gps_payload()))

    assert result.accepted is False
    assert result.reason == "user_not_active_driver"
    assert asyncio.run(gps_history_count(seeded_db)) == 0


def test_non_driver_payload_user_is_rejected_without_writes(
    seeded_db: SeededDatabase,
) -> None:
    result = asyncio.run(ingest_payload(seeded_db, gps_payload(user_id=str(ADMIN_ID))))

    assert result.accepted is False
    assert result.reason == "user_not_active_driver"
    assert asyncio.run(gps_history_count(seeded_db)) == 0


def test_invalid_topic_is_rejected_without_writes(
    seeded_db: SeededDatabase,
) -> None:
    async def ingest_invalid_topic():
        async with seeded_db.session_factory() as session:
            return await ingest_gps_message(session, "bad-topic", json_bytes(gps_payload()))

    result = asyncio.run(ingest_invalid_topic())

    assert result.accepted is False
    assert result.reason == "invalid_topic"
    assert asyncio.run(gps_history_count(seeded_db)) == 0

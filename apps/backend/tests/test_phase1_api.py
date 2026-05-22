from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import get_session
from app.main import app
from app.models import Base
from app.seed import SEED_DEVICE_IDENTIFIER, SEED_PASSWORD, seed_database


@pytest.fixture()
def client() -> Iterator[TestClient]:
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

    async def override_get_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def auth_headers(client: TestClient, account: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={"account": account, "password": SEED_PASSWORD},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_jwt_and_user_payload(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"account": "operator001", "password": SEED_PASSWORD},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]
    assert payload["refresh_token"]
    assert payload["user"]["account"] == "operator001"
    assert payload["user"]["role"] == "operator"


def test_login_rejects_invalid_password(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"account": "operator001", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_protected_routes_require_token(client: TestClient) -> None:
    response = client.get("/users")

    assert response.status_code == 401


def test_refresh_token_rotates_and_new_access_token_works(client: TestClient) -> None:
    login_response = client.post(
        "/auth/login",
        json={"account": "operator001", "password": SEED_PASSWORD},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": login_payload["refresh_token"]},
    )

    assert refresh_response.status_code == 200
    refresh_payload = refresh_response.json()
    assert refresh_payload["access_token"]
    assert refresh_payload["refresh_token"]
    assert refresh_payload["refresh_token"] != login_payload["refresh_token"]
    assert refresh_payload["user"]["account"] == "operator001"

    reuse_response = client.post(
        "/auth/refresh",
        json={"refresh_token": login_payload["refresh_token"]},
    )
    assert reuse_response.status_code == 401

    users_response = client.get(
        "/users",
        headers={"Authorization": f"Bearer {refresh_payload['access_token']}"},
    )
    assert users_response.status_code == 200
    assert [user["account"] for user in users_response.json()] == ["driver001"]


def test_refresh_token_cannot_be_used_as_access_token(client: TestClient) -> None:
    login_response = client.post(
        "/auth/login",
        json={"account": "operator001", "password": SEED_PASSWORD},
    )
    assert login_response.status_code == 200

    response = client.get(
        "/users",
        headers={
            "Authorization": f"Bearer {login_response.json()['refresh_token']}",
        },
    )

    assert response.status_code == 401


def test_logout_revokes_refresh_token(client: TestClient) -> None:
    login_response = client.post(
        "/auth/login",
        json={"account": "operator001", "password": SEED_PASSWORD},
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["refresh_token"]

    logout_response = client.post(
        "/auth/logout",
        json={"refresh_token": refresh_token},
    )
    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert logout_response.status_code == 200
    assert logout_response.json() == {"status": "ok"}
    assert refresh_response.status_code == 401


def test_user_visibility_scope(client: TestClient) -> None:
    admin_response = client.get("/users", headers=auth_headers(client, "admin001"))
    operator_response = client.get(
        "/users",
        headers=auth_headers(client, "operator001"),
    )
    driver_response = client.get("/users", headers=auth_headers(client, "driver001"))

    assert admin_response.status_code == 200
    assert [user["account"] for user in admin_response.json()] == [
        "admin001",
        "driver001",
        "operator001",
    ]

    assert operator_response.status_code == 200
    assert [user["account"] for user in operator_response.json()] == ["driver001"]

    assert driver_response.status_code == 200
    assert [user["account"] for user in driver_response.json()] == ["driver001"]


def test_driver_can_read_own_device_binding(client: TestClient) -> None:
    response = client.get(
        "/me/device-binding",
        headers=auth_headers(client, "driver001"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["device_identifier"] == SEED_DEVICE_IDENTIFIER
    assert payload["status"] == "active"
    assert payload["vehicle"]["plate_number"] == "ABC-1234"


def test_operator_vehicle_scope_and_empty_latest_location(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "operator001")

    vehicles_response = client.get("/vehicles", headers=headers)
    latest_response = client.get("/vehicles/latest-locations", headers=headers)

    assert vehicles_response.status_code == 200
    assert [vehicle["plate_number"] for vehicle in vehicles_response.json()] == [
        "ABC-1234"
    ]

    assert latest_response.status_code == 200
    latest_locations = latest_response.json()
    assert len(latest_locations) == 1
    assert latest_locations[0]["plate_number"] == "ABC-1234"
    assert latest_locations[0]["driver_account"] == "driver001"
    assert latest_locations[0]["online_status"] == "offline"
    assert latest_locations[0]["latitude"] is None
    assert latest_locations[0]["longitude"] is None


def test_vehicle_history_is_scoped_and_empty_before_ingestion(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "operator001")
    vehicle_id = client.get("/vehicles", headers=headers).json()[0]["id"]

    response = client.get(f"/vehicles/{vehicle_id}/history", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

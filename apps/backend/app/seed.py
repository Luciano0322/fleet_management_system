from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal
from app.models import DeviceBinding, User, UserRelationship, Vehicle, utcnow
from app.security import hash_password

ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")
OPERATOR_ID = UUID("00000000-0000-0000-0000-000000000002")
DRIVER_ID = UUID("00000000-0000-0000-0000-000000000003")
VEHICLE_ID = UUID("00000000-0000-0000-0000-000000000101")
BINDING_ID = UUID("00000000-0000-0000-0000-000000000201")
RELATIONSHIP_ID = UUID("00000000-0000-0000-0000-000000000301")

SEED_PASSWORD = "password123"
SEED_DEVICE_IDENTIFIER = "demo-device-001"


async def ensure_user(
    session: AsyncSession,
    user_id: UUID,
    account: str,
    role: str,
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        user = User(
            id=user_id,
            account=account,
            password_hash=hash_password(SEED_PASSWORD),
            role=role,
            status="active",
        )
        session.add(user)
        return user

    user.account = account
    user.role = role
    user.status = "active"
    user.updated_at = utcnow()
    return user


async def seed_database(session: AsyncSession) -> None:
    await ensure_user(session, ADMIN_ID, "admin001", "admin")
    await ensure_user(session, OPERATOR_ID, "operator001", "operator")
    await ensure_user(session, DRIVER_ID, "driver001", "driver")

    vehicle = await session.get(Vehicle, VEHICLE_ID)
    if vehicle is None:
        vehicle = Vehicle(
            id=VEHICLE_ID,
            plate_number="ABC-1234",
            name="Demo Vehicle",
            status="active",
        )
        session.add(vehicle)
    else:
        vehicle.status = "active"

    relationship = await session.get(UserRelationship, RELATIONSHIP_ID)
    if relationship is None:
        relationship = UserRelationship(
            id=RELATIONSHIP_ID,
            parent_user_id=OPERATOR_ID,
            child_user_id=DRIVER_ID,
            relationship_type="monitors",
            status="active",
        )
        session.add(relationship)
    else:
        relationship.status = "active"

    result = await session.execute(
        select(DeviceBinding).where(DeviceBinding.id == BINDING_ID)
    )
    binding = result.scalar_one_or_none()
    if binding is None:
        binding = DeviceBinding(
            id=BINDING_ID,
            user_id=DRIVER_ID,
            vehicle_id=VEHICLE_ID,
            device_identifier=SEED_DEVICE_IDENTIFIER,
            status="active",
        )
        session.add(binding)
    else:
        binding.user_id = DRIVER_ID
        binding.vehicle_id = VEHICLE_ID
        binding.device_identifier = SEED_DEVICE_IDENTIFIER
        binding.status = "active"

    await session.commit()


async def main() -> None:
    async with SessionLocal() as session:
        await seed_database(session)


if __name__ == "__main__":
    asyncio.run(main())

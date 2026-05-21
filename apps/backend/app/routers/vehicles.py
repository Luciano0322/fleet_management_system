from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.deps import get_current_user
from app.models import DeviceBinding, GpsHistory, GpsLatest, User, Vehicle
from app.schemas import GpsHistoryOut, LatestLocationOut, VehicleOut
from app.visibility import visible_driver_ids

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def online_status(last_seen_at: datetime | None, now: datetime) -> str:
    if last_seen_at is None:
        return "offline"
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=UTC)
    return "online" if (now - last_seen_at).total_seconds() <= 30 else "offline"


async def visible_vehicle_query(
    session: AsyncSession,
    current_user: User,
) -> Select:
    driver_ids = await visible_driver_ids(session, current_user)
    return (
        select(Vehicle)
        .join(DeviceBinding, DeviceBinding.vehicle_id == Vehicle.id)
        .where(
            DeviceBinding.user_id.in_(driver_ids or [UUID(int=0)]),
            DeviceBinding.status == "active",
            Vehicle.status == "active",
        )
        .distinct()
        .order_by(Vehicle.plate_number)
    )


@router.get("", response_model=list[VehicleOut])
async def list_vehicles(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Vehicle]:
    result = await session.execute(await visible_vehicle_query(session, current_user))
    return list(result.scalars())


@router.get("/latest-locations", response_model=list[LatestLocationOut])
async def latest_locations(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[LatestLocationOut]:
    driver_ids = await visible_driver_ids(session, current_user)
    query = (
        select(Vehicle, DeviceBinding, User, GpsLatest)
        .join(DeviceBinding, DeviceBinding.vehicle_id == Vehicle.id)
        .join(User, User.id == DeviceBinding.user_id)
        .outerjoin(GpsLatest, GpsLatest.vehicle_id == Vehicle.id)
        .where(
            DeviceBinding.user_id.in_(driver_ids or [UUID(int=0)]),
            DeviceBinding.status == "active",
            Vehicle.status == "active",
            User.status == "active",
            User.role == "driver",
        )
        .order_by(Vehicle.plate_number)
    )
    rows = (await session.execute(query)).all()
    now = datetime.now(UTC)
    return [
        LatestLocationOut(
            vehicle_id=vehicle.id,
            plate_number=vehicle.plate_number,
            driver_user_id=driver.id,
            driver_account=driver.account,
            online_status=online_status(binding.last_seen_at, now),
            latitude=latest.latitude if latest else None,
            longitude=latest.longitude if latest else None,
            speed=latest.speed if latest else None,
            heading=latest.heading if latest else None,
            recorded_at=latest.recorded_at if latest else None,
            last_seen_at=binding.last_seen_at,
        )
        for vehicle, binding, driver, latest in rows
    ]


@router.get("/{vehicle_id}/history", response_model=list[GpsHistoryOut])
async def vehicle_history(
    vehicle_id: UUID,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[GpsHistory]:
    visible_vehicle_ids = [
        vehicle.id
        for vehicle in (await session.execute(await visible_vehicle_query(session, current_user))).scalars()
    ]
    if vehicle_id not in visible_vehicle_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )

    query = select(GpsHistory).where(GpsHistory.vehicle_id == vehicle_id)
    if from_ is not None:
        query = query.where(GpsHistory.recorded_at >= from_)
    if to is not None:
        query = query.where(GpsHistory.recorded_at <= to)
    query = query.order_by(GpsHistory.recorded_at)

    result = await session.execute(query)
    return list(result.scalars())

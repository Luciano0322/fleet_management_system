from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeviceBinding, GpsHistory, GpsLatest, User, Vehicle, utcnow

logger = logging.getLogger(__name__)


class GpsPayload(BaseModel):
    user_id: UUID
    vehicle_id: UUID
    device_identifier: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed: float | None = Field(default=None, ge=0)
    heading: float | None = Field(default=None, ge=0, le=360)
    recorded_at: datetime

    model_config = ConfigDict(extra="forbid")

    @field_validator("recorded_at")
    @classmethod
    def normalize_recorded_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


@dataclass(frozen=True)
class IngestionResult:
    accepted: bool
    reason: str
    vehicle_id: UUID | None = None
    user_id: UUID | None = None


def parse_gps_topic(topic: str) -> UUID:
    parts = topic.split("/")
    if len(parts) != 2 or parts[0] != "gps" or not parts[1]:
        raise ValueError("topic must use gps/{vehicle_id}")
    return UUID(parts[1])


def reject(
    reason: str,
    topic: str,
    payload: GpsPayload | None = None,
    error: Exception | None = None,
) -> IngestionResult:
    logger.warning(
        "gps_message_rejected",
        extra={
            "reason": reason,
            "topic": topic,
            "vehicle_id": str(payload.vehicle_id) if payload else None,
            "user_id": str(payload.user_id) if payload else None,
            "error": str(error) if error else None,
        },
    )
    return IngestionResult(
        accepted=False,
        reason=reason,
        vehicle_id=payload.vehicle_id if payload else None,
        user_id=payload.user_id if payload else None,
    )


async def ingest_gps_message(
    session: AsyncSession,
    topic: str,
    raw_payload: bytes | str,
) -> IngestionResult:
    try:
        topic_vehicle_id = parse_gps_topic(topic)
    except (TypeError, ValueError) as exc:
        return reject("invalid_topic", topic, error=exc)

    try:
        payload = GpsPayload.model_validate_json(raw_payload)
    except ValidationError as exc:
        return reject("invalid_payload", topic, error=exc)

    if payload.vehicle_id != topic_vehicle_id:
        return reject("topic_payload_mismatch", topic, payload)

    received_at = utcnow()
    async with session.begin():
        user = await session.get(User, payload.user_id)
        if user is None or user.status != "active" or user.role != "driver":
            return reject("user_not_active_driver", topic, payload)

        binding_result = await session.execute(
            select(DeviceBinding)
            .join(Vehicle, Vehicle.id == DeviceBinding.vehicle_id)
            .where(
                DeviceBinding.user_id == payload.user_id,
                DeviceBinding.vehicle_id == payload.vehicle_id,
                DeviceBinding.device_identifier == payload.device_identifier,
                DeviceBinding.status == "active",
                Vehicle.status == "active",
            )
        )
        binding = binding_result.scalar_one_or_none()
        if binding is None:
            return reject("binding_not_active", topic, payload)

        session.add(
            GpsHistory(
                vehicle_id=payload.vehicle_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                speed=payload.speed,
                heading=payload.heading,
                recorded_at=payload.recorded_at,
                source="mqtt",
            )
        )

        latest = await session.get(GpsLatest, payload.vehicle_id)
        if latest is None:
            session.add(
                GpsLatest(
                    vehicle_id=payload.vehicle_id,
                    latitude=payload.latitude,
                    longitude=payload.longitude,
                    speed=payload.speed,
                    heading=payload.heading,
                    recorded_at=payload.recorded_at,
                    updated_at=received_at,
                )
            )
        else:
            latest.latitude = payload.latitude
            latest.longitude = payload.longitude
            latest.speed = payload.speed
            latest.heading = payload.heading
            latest.recorded_at = payload.recorded_at
            latest.updated_at = received_at

        binding.last_seen_at = received_at

    logger.info(
        "gps_message_accepted",
        extra={
            "topic": topic,
            "vehicle_id": str(payload.vehicle_id),
            "user_id": str(payload.user_id),
            "device_identifier": payload.device_identifier,
            "recorded_at": payload.recorded_at.isoformat(),
        },
    )
    return IngestionResult(
        accepted=True,
        reason="accepted",
        vehicle_id=payload.vehicle_id,
        user_id=payload.user_id,
    )

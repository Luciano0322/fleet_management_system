from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    id: UUID
    account: str
    role: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    account: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class VehicleOut(BaseModel):
    id: UUID
    plate_number: str
    name: str | None
    status: str

    model_config = ConfigDict(from_attributes=True)


class DeviceBindingOut(BaseModel):
    id: UUID
    user_id: UUID
    vehicle_id: UUID
    device_identifier: str
    status: str
    last_seen_at: datetime | None
    vehicle: VehicleOut

    model_config = ConfigDict(from_attributes=True)


class LatestLocationOut(BaseModel):
    vehicle_id: UUID
    plate_number: str
    driver_user_id: UUID
    driver_account: str
    online_status: str
    latitude: float | None
    longitude: float | None
    speed: float | None
    heading: float | None
    recorded_at: datetime | None
    last_seen_at: datetime | None


class GpsHistoryOut(BaseModel):
    id: UUID
    vehicle_id: UUID
    latitude: float
    longitude: float
    speed: float | None
    heading: float | None
    recorded_at: datetime
    source: str

    model_config = ConfigDict(from_attributes=True)

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.deps import get_current_user
from app.models import DeviceBinding, User
from app.schemas import DeviceBindingOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/device-binding", response_model=DeviceBindingOut)
async def get_my_device_binding(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DeviceBinding:
    result = await session.execute(
        select(DeviceBinding)
        .options(selectinload(DeviceBinding.vehicle))
        .where(
            DeviceBinding.user_id == current_user.id,
            DeviceBinding.status == "active",
        )
        .order_by(DeviceBinding.created_at.desc())
        .limit(1)
    )
    binding = result.scalar_one_or_none()
    if binding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active device binding not found",
        )
    return binding

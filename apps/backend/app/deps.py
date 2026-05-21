from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import User
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = UUID(str(payload.get("sub")))
    except (InvalidTokenError, TypeError, ValueError):
        raise credentials_error from None

    user = await session.get(User, user_id)
    if user is None or user.status != "active":
        raise credentials_error
    return user


async def get_active_user_by_account(
    session: AsyncSession,
    account: str,
) -> User | None:
    result = await session.execute(
        select(User).where(User.account == account, User.status == "active")
    )
    return result.scalar_one_or_none()

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.deps import get_active_user_by_account
from app.models import AuthRefreshToken, User
from app.schemas import (
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshTokenRequest,
    TokenPairResponse,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    refresh_token_expires_at,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def invalid_refresh_token_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )


def create_token_pair(user: User) -> tuple[str, str, AuthRefreshToken]:
    refresh_token = create_refresh_token()
    session = AuthRefreshToken(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=refresh_token_expires_at(),
    )
    return create_access_token(user.id, user.role), refresh_token, session


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> LoginResponse:
    user = await get_active_user_by_account(session, request.account)
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account or password",
        )

    access_token, refresh_token, refresh_session = create_token_pair(user)
    session.add(refresh_session)
    await session.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPairResponse:
    refresh_hash = hash_refresh_token(request.refresh_token)
    result = await session.execute(
        select(AuthRefreshToken)
        .options(selectinload(AuthRefreshToken.user))
        .where(AuthRefreshToken.refresh_token_hash == refresh_hash)
    )
    stored_token = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        stored_token is None
        or stored_token.revoked_at is not None
        or normalize_utc(stored_token.expires_at) <= now
        or stored_token.user.status != "active"
    ):
        raise invalid_refresh_token_error()

    new_access_token, new_refresh_token, new_session = create_token_pair(
        stored_token.user
    )
    new_session.id = uuid4()
    session.add(new_session)
    await session.flush()

    stored_token.revoked_at = now
    stored_token.last_used_at = now
    stored_token.replaced_by_token_id = new_session.id
    await session.commit()

    return TokenPairResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user=stored_token.user,
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_session),
) -> LogoutResponse:
    refresh_hash = hash_refresh_token(request.refresh_token)
    result = await session.execute(
        select(AuthRefreshToken).where(
            AuthRefreshToken.refresh_token_hash == refresh_hash
        )
    )
    stored_token = result.scalar_one_or_none()
    if stored_token is not None and stored_token.revoked_at is None:
        now = datetime.now(UTC)
        stored_token.revoked_at = now
        stored_token.last_used_at = now
        await session.commit()

    return LogoutResponse()

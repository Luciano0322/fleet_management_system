from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserRelationship


async def visible_users(session: AsyncSession, current_user: User) -> list[User]:
    if current_user.role == "admin":
        result = await session.execute(
            select(User).where(User.status == "active").order_by(User.account)
        )
        return list(result.scalars())

    if current_user.role == "operator":
        result = await session.execute(
            select(User)
            .join(UserRelationship, UserRelationship.child_user_id == User.id)
            .where(
                UserRelationship.parent_user_id == current_user.id,
                UserRelationship.status == "active",
                UserRelationship.relationship_type == "monitors",
                User.status == "active",
                User.role == "driver",
            )
            .order_by(User.account)
        )
        return list(result.scalars())

    return [current_user]


async def visible_driver_ids(session: AsyncSession, current_user: User) -> list[UUID]:
    users = await visible_users(session, current_user)
    return [user.id for user in users if user.role == "driver"]

"""backend foundation

Revision ID: 0001_backend_foundation
Revises:
Create Date: 2026-05-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_backend_foundation"
down_revision = None
branch_labels = None
depends_on = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account"),
    )

    op.create_table(
        "vehicles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plate_number", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plate_number"),
    )

    op.create_table(
        "device_bindings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("device_identifier", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_device_bindings_payload_validation",
        "device_bindings",
        ["user_id", "vehicle_id", "device_identifier", "status"],
    )

    op.create_table(
        "user_relationships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("parent_user_id", sa.Uuid(), nullable=False),
        sa.Column("child_user_id", sa.Uuid(), nullable=False),
        sa.Column("relationship_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["child_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_relationships_visibility_scope",
        "user_relationships",
        ["parent_user_id", "child_user_id", "status"],
    )

    op.create_table(
        "gps_latest",
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("speed", sa.Float(), nullable=True),
        sa.Column("heading", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("vehicle_id"),
    )

    op.create_table(
        "gps_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("speed", sa.Float(), nullable=True),
        sa.Column("heading", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_gps_history_vehicle_recorded_at",
        "gps_history",
        ["vehicle_id", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_gps_history_vehicle_recorded_at", table_name="gps_history")
    op.drop_table("gps_history")
    op.drop_table("gps_latest")
    op.drop_index(
        "ix_user_relationships_visibility_scope",
        table_name="user_relationships",
    )
    op.drop_table("user_relationships")
    op.drop_index(
        "ix_device_bindings_payload_validation",
        table_name="device_bindings",
    )
    op.drop_table("device_bindings")
    op.drop_table("vehicles")
    op.drop_table("users")

from __future__ import annotations

import os


def bool_from_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./dev.db",
    )
    jwt_secret: str = os.getenv(
        "JWT_SECRET",
        "phase-1-development-secret-change-me-32-bytes",
    )
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_minutes: int = int(os.getenv("ACCESS_TOKEN_MINUTES", "1440"))
    mqtt_ingestion_enabled: bool = bool_from_env("MQTT_INGESTION_ENABLED", False)
    mqtt_host: str = os.getenv("MQTT_HOST", "localhost")
    mqtt_port: int = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_username: str | None = os.getenv("MQTT_USERNAME")
    mqtt_password: str | None = os.getenv("MQTT_PASSWORD")
    mqtt_topic_filter: str = os.getenv("MQTT_TOPIC_FILTER", "gps/+")
    mqtt_client_id: str = os.getenv("MQTT_CLIENT_ID", "fms-backend-ingestion")


settings = Settings()

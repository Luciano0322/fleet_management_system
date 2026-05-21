from __future__ import annotations

import os


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


settings = Settings()

from datetime import UTC, datetime

from fastapi import FastAPI

from app.routers import auth, me, users, vehicles


app = FastAPI(
    title="Fleet Management GPS Platform",
    version="0.1.0",
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(users.router)
app.include_router(vehicles.router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "backend",
        "timestamp": datetime.now(UTC).isoformat(),
    }

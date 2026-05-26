import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.mqtt_subscriber import MqttGpsSubscriber
from app.routers import auth, me, users, vehicles


@asynccontextmanager
async def lifespan(_app: FastAPI):
    subscriber: MqttGpsSubscriber | None = None
    if settings.mqtt_ingestion_enabled:
        subscriber = MqttGpsSubscriber(settings, asyncio.get_running_loop())
        subscriber.start()
    try:
        yield
    finally:
        if subscriber is not None:
            subscriber.stop()


app = FastAPI(
    title="Fleet Management GPS Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

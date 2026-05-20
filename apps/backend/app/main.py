from datetime import UTC, datetime

from fastapi import FastAPI


app = FastAPI(
    title="Fleet Management GPS Platform",
    version="0.1.0",
)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "backend",
        "timestamp": datetime.now(UTC).isoformat(),
    }

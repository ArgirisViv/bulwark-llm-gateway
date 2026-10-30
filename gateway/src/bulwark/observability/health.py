"""Liveness and readiness endpoints."""

from typing import cast

from fastapi import APIRouter, HTTPException, Request, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from bulwark.storage.audit import AuditRepository

router = APIRouter(tags=["ops"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness: the process is up and serving."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> dict[str, str]:
    """Readiness: database and Redis are reachable."""
    audit = cast(AuditRepository, request.app.state.audit_repository)
    redis = cast(Redis, request.app.state.redis)
    try:
        async with audit.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        await redis.ping()
    except (SQLAlchemyError, RedisError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A required dependency is unavailable.",
        ) from exc
    return {"status": "ok"}

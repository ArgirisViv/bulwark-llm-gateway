from __future__ import annotations

from typing import cast

from redis.asyncio import Redis
from sqlalchemy import select

from bulwark.storage.audit import AuditRepository
from bulwark.storage.models import ProxyRequest
from bulwark.storage.rate_limit import RateLimiter, RateLimitExceeded


async def test_audit_persists_metadata_without_request_or_response_bodies() -> None:
    repository = AuditRepository("sqlite+aiosqlite:///:memory:")
    try:
        await repository.record(
            request_id="request-id",
            application_id="default",
            model="test-model",
            decision="allowed",
            latency_ms=12.5,
            upstream_latency_ms=8.0,
            tokens_in=4,
            tokens_out=7,
            findings=[],
        )
        async with repository.engine.connect() as connection:
            result = await connection.execute(select(ProxyRequest.__table__))
            request = result.mappings().one()

        assert request.application_id == "default"
        assert request.model == "test-model"
        assert request.tokens_in == 4
        assert request.tokens_out == 7
        assert "prompt" not in request
        assert "response" not in request
    finally:
        await repository.aclose()


class _MemoryPipeline:
    def __init__(self, value: int) -> None:
        self.value = value

    async def __aenter__(self) -> _MemoryPipeline:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def incr(self, key: str) -> _MemoryPipeline:
        return self

    def expire(self, key: str, seconds: int, *, nx: bool) -> _MemoryPipeline:
        return self

    async def execute(self) -> list[int]:
        return [self.value, 1]


class _MemoryRedis:
    def __init__(self, value: int) -> None:
        self.value = value

    def pipeline(self, *, transaction: bool) -> _MemoryPipeline:
        return _MemoryPipeline(self.value)


async def test_redis_rate_limiter_rejects_counter_over_limit() -> None:
    limiter = RateLimiter(cast(Redis, _MemoryRedis(value=4)), requests_per_minute=3)

    try:
        await limiter.check("default")
    except RateLimitExceeded:
        pass
    else:
        raise AssertionError("Expected the rate limiter to reject an over-limit counter.")

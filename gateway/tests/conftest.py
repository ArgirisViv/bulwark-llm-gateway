from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from bulwark.config import Settings
from bulwark.main import create_app
from bulwark.storage.rate_limit import RateLimiter


class StubRedisClient:
    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


class AllowAllRateLimiter(RateLimiter):
    def __init__(self) -> None:
        pass

    async def check(self, application_id: str) -> None:
        return None


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="test",
        log_level="WARNING",
        gateway_api_key="test-dashboard-key",
        database_url="sqlite+aiosqlite:///:memory:",
    )


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[FastAPI]:
    app = create_app(
        settings,
        rate_limiter=AllowAllRateLimiter(),
        redis_client=StubRedisClient(),  # type: ignore[arg-type]
    )
    await app.state.audit_repository.initialize()
    yield app
    await app.state.provider.aclose()
    await app.state.audit_repository.aclose()
    await app.state.redis.aclose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

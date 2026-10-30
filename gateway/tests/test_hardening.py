import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from bulwark.config import Settings
from bulwark.main import create_app
from tests.conftest import AllowAllRateLimiter, StubRedisClient


def _build(**overrides: object) -> FastAPI:
    values: dict[str, object] = {
        "env": "test",
        "log_level": "WARNING",
        "gateway_api_key": "test-dashboard-key",
        "database_url": "sqlite+aiosqlite:///:memory:",
        **overrides,
    }
    settings = Settings(**values)  # type: ignore[arg-type]
    return create_app(
        settings,
        rate_limiter=AllowAllRateLimiter(),
        redis_client=StubRedisClient(),  # type: ignore[arg-type]
    )


async def test_security_headers_are_set(client: AsyncClient) -> None:
    response = await client.get("/healthz")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"


async def test_oversized_body_is_rejected_before_parsing(client: AsyncClient) -> None:
    app: FastAPI = client._transport.app  # type: ignore[attr-defined]
    limit = app.state.settings.max_request_bytes

    response = await client.post(
        "/v1/chat/completions",
        content=b"x" * (limit + 1),
        headers={"Authorization": "Bearer test-dashboard-key"},
    )

    assert response.status_code == 413


async def test_invalid_content_length_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/chat/completions", content=b"{}", headers={"Content-Length": "abc"}
    )

    assert response.status_code in {400, 413}


async def test_chunked_upload_without_content_length_is_rejected(client: AsyncClient) -> None:
    async def body() -> object:
        yield b"{}"

    response = await client.post("/v1/chat/completions", content=body())  # type: ignore[arg-type]

    assert response.status_code == 411


@pytest.mark.parametrize("path", ["/metrics"])
async def test_metrics_require_token_when_configured(path: str) -> None:
    app = _build(metrics_token="scrape-secret")  # noqa: S106
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get(path)
        wrong = await client.get(path, headers={"Authorization": "Bearer nope"})
        allowed = await client.get(path, headers={"Authorization": "Bearer scrape-secret"})

    assert denied.status_code == 401
    assert wrong.status_code == 401
    assert allowed.status_code == 200
    await app.state.provider.aclose()
    await app.state.audit_repository.aclose()
    await app.state.redis.aclose()


async def test_openapi_and_docs_disabled_in_production() -> None:
    app = _build(env="production")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        docs = await client.get("/docs")
        schema = await client.get("/openapi.json")

    assert docs.status_code == 404
    assert schema.status_code == 404
    await app.state.provider.aclose()
    await app.state.audit_repository.aclose()
    await app.state.redis.aclose()

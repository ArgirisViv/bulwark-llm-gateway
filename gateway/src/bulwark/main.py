"""Application factory and ASGI entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import RequestResponseEndpoint

from bulwark import __version__
from bulwark.config import Settings, get_settings
from bulwark.detectors import (
    CanaryDetector,
    HeuristicInjectionDetector,
    PiiDetector,
    SecretDetector,
)
from bulwark.observability.audit import router as audit_router
from bulwark.observability.health import router as health_router
from bulwark.observability.logging import configure_logging
from bulwark.observability.metrics import metrics, observe_request
from bulwark.observability.request_id import RequestIdMiddleware
from bulwark.providers.base import UpstreamProvider
from bulwark.providers.openai_compatible import OllamaProvider, OpenAICompatibleProvider
from bulwark.proxy.routes import router as proxy_router
from bulwark.storage.audit import AuditRepository
from bulwark.storage.rate_limit import RateLimiter


def create_app(
    settings: Settings | None = None,
    provider: UpstreamProvider | None = None,
    audit_repository: AuditRepository | None = None,
    rate_limiter: RateLimiter | None = None,
    redis_client: Redis | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    if provider is not None:
        upstream = provider
    elif settings.upstream_provider == "ollama":
        upstream = OllamaProvider(
            str(settings.upstream_base_url),
            None,
            settings.upstream_timeout_seconds,
        )
    else:
        upstream = OpenAICompatibleProvider(
            str(settings.upstream_base_url),
            settings.upstream_api_key,
            settings.upstream_timeout_seconds,
        )
    audit = audit_repository or AuditRepository(settings.database_url)
    redis = redis_client or Redis.from_url(settings.redis_url, decode_responses=True)
    limiter = rate_limiter or RateLimiter(redis, settings.requests_per_minute)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            await audit.initialize()
            yield
        finally:
            await upstream.aclose()
            await audit.aclose()
            await redis.aclose()

    app = FastAPI(
        title="Bulwark",
        version=__version__,
        # Interactive docs only outside production.
        docs_url=None if settings.env == "production" else "/docs",
        openapi_url=None if settings.env == "production" else "/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.provider = upstream
    app.state.audit_repository = audit
    app.state.rate_limiter = limiter
    app.state.redis = redis
    app.state.detectors = (
        HeuristicInjectionDetector(),
        PiiDetector(),
        SecretDetector(),
        CanaryDetector(),
    )

    @app.middleware("http")
    async def limit_request_size(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.method in {"POST", "PUT", "PATCH"}:
            declared = request.headers.get("content-length")
            if declared is None:
                if "transfer-encoding" in request.headers:
                    return JSONResponse({"detail": "Content-Length is required."}, status_code=411)
            elif not declared.isdigit():
                return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
            elif int(declared) > settings.max_request_bytes:
                return JSONResponse({"detail": "Request body too large."}, status_code=413)
        return await call_next(request)

    @app.middleware("http")
    async def add_security_headers(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    @app.middleware("http")
    async def collect_http_metrics(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        started = perf_counter()
        response = await call_next(request)
        if request.url.path != "/metrics":
            observe_request(request, response.status_code, perf_counter() - started)
        return response

    app.add_middleware(RequestIdMiddleware)
    app.include_router(health_router)
    app.include_router(audit_router)
    app.include_router(proxy_router)
    app.add_api_route("/metrics", metrics, methods=["GET"], include_in_schema=False)
    return app


app = create_app()

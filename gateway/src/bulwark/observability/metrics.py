"""Prometheus HTTP request metrics."""

import hmac

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from starlette.requests import Request
from starlette.responses import Response

registry = CollectorRegistry()
KNOWN_ENDPOINTS = {
    "/healthz",
    "/readyz",
    "/metrics",
    "/v1/chat/completions",
    "/v1/models",
    "/v1/audit/recent",
    "/v1/audit/summary",
}
http_requests = Counter(
    "bulwark_http_requests",
    "HTTP requests served by Bulwark",
    ("method", "endpoint", "status"),
    registry=registry,
)
http_request_duration = Histogram(
    "bulwark_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ("method", "endpoint"),
    registry=registry,
)


def observe_request(request: Request, status_code: int, duration_seconds: float) -> None:
    route = request.scope.get("route")
    endpoint = getattr(route, "path", None)
    if not isinstance(endpoint, str):
        endpoint = request.url.path if request.url.path in KNOWN_ENDPOINTS else "unmatched"
    http_requests.labels(request.method, endpoint, str(status_code)).inc()
    http_request_duration.labels(request.method, endpoint).observe(duration_seconds)


async def metrics(request: Request) -> Response:
    token = request.app.state.settings.metrics_token
    if token is not None and token.get_secret_value():
        expected = "Bearer " + token.get_secret_value()
        provided = request.headers.get("authorization", "")
        if not hmac.compare_digest(provided.encode(), expected.encode()):
            return Response(
                "Invalid or missing metrics token.",
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)

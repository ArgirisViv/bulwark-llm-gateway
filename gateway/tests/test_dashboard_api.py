from fastapi import FastAPI
from httpx import AsyncClient

from bulwark.detectors.base import Direction, Finding, Severity
from bulwark.policy.evaluator import FindingDecision
from bulwark.policy.schema import PolicyAction

AUTH_HEADERS = {"Authorization": "Bearer test-dashboard-key"}


async def test_audit_dashboard_requires_gateway_key(client: AsyncClient) -> None:
    response = await client.get("/v1/audit/recent")

    assert response.status_code == 401


async def test_audit_dashboard_returns_recent_metadata_and_summary(
    app: FastAPI,
    client: AsyncClient,
) -> None:
    await app.state.audit_repository.record(
        request_id="dashboard-request-1",
        application_id="default",
        model="test-model",
        decision="blocked",
        latency_ms=27.2,
        upstream_latency_ms=None,
        tokens_in=None,
        tokens_out=None,
        findings=[
            FindingDecision(
                finding=Finding(
                    detector="pii",
                    category="email",
                    severity=Severity.MEDIUM,
                    confidence=1.0,
                    direction=Direction.REQUEST,
                ),
                configured_action=PolicyAction.REDACT,
                action=PolicyAction.REDACT,
            )
        ],
    )

    recent = await client.get("/v1/audit/recent", headers=AUTH_HEADERS)
    summary = await client.get("/v1/audit/summary?hours=24", headers=AUTH_HEADERS)

    assert recent.status_code == 200
    request = recent.json()["data"][0]
    assert request["id"] == "dashboard-request-1"
    assert request["decision"] == "blocked"
    assert "prompt" not in request
    assert "response" not in request
    assert summary.status_code == 200
    assert summary.json()["requests"] == 1
    assert summary.json()["decisions"] == {"blocked": 1}
    assert summary.json()["findings"] == [
        {"category": "email", "severity": "medium", "action": "redact", "count": 1}
    ]


async def test_audit_dashboard_bounds_query_parameters(client: AsyncClient) -> None:
    recent = await client.get("/v1/audit/recent?limit=101", headers=AUTH_HEADERS)
    summary = await client.get("/v1/audit/summary?hours=721", headers=AUTH_HEADERS)

    assert recent.status_code == 422
    assert summary.status_code == 422


async def test_prometheus_metrics_count_http_requests(client: AsyncClient) -> None:
    await client.get("/healthz")
    response = await client.get("/metrics")

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert any(
        line.startswith("bulwark_http_requests_total{")
        and 'endpoint="/healthz"' in line
        and 'status="200"' in line
        for line in response.text.splitlines()
    )

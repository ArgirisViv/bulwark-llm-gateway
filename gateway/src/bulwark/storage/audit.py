"""Durable audit writes containing security metadata, never prompt text."""

import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from bulwark.policy.evaluator import FindingDecision
from bulwark.storage.models import Base, FindingRecord, ProxyRequest

logger = logging.getLogger(__name__)


class AuditRepository:
    def __init__(self, database_url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(database_url, pool_pre_ping=True)
        self._sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self._initialized = False

    async def initialize(self) -> None:
        if self.engine.dialect.name == "sqlite" and not self._initialized:
            async with self.engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            self._initialized = True

    async def record(
        self,
        *,
        request_id: str,
        application_id: str,
        model: str,
        decision: str,
        latency_ms: float,
        upstream_latency_ms: float | None,
        tokens_in: int | None,
        tokens_out: int | None,
        findings: Sequence[FindingDecision],
    ) -> None:
        await self.initialize()
        request = ProxyRequest(
            id=request_id or uuid.uuid4().hex,
            application_id=application_id,
            model=model,
            decision=decision,
            latency_ms=latency_ms,
            upstream_latency_ms=upstream_latency_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            findings=[
                FindingRecord(
                    detector=item.finding.detector,
                    category=item.finding.category,
                    severity=item.finding.severity.name.lower(),
                    confidence=item.finding.confidence,
                    direction=item.finding.direction.value,
                    action=item.action.value,
                    spans=[{"start": span.start, "end": span.end} for span in item.finding.spans],
                )
                for item in findings
            ],
        )
        try:
            async with self._sessions.begin() as session:
                session.add(request)
        except Exception:
            logger.exception("Failed to persist request audit record")
            raise

    async def recent(self, limit: int) -> list[dict[str, Any]]:
        async with self._sessions() as session:
            result = await session.scalars(
                select(ProxyRequest)
                .options(selectinload(ProxyRequest.findings))
                .order_by(ProxyRequest.created_at.desc())
                .limit(limit)
            )
            requests = result.all()
        return [
            {
                "id": request.id,
                "application_id": request.application_id,
                "model": request.model,
                "decision": request.decision,
                "latency_ms": request.latency_ms,
                "upstream_latency_ms": request.upstream_latency_ms,
                "tokens_in": request.tokens_in,
                "tokens_out": request.tokens_out,
                "created_at": request.created_at.isoformat(),
                "findings": [
                    {
                        "detector": finding.detector,
                        "category": finding.category,
                        "severity": finding.severity,
                        "action": finding.action,
                        "direction": finding.direction,
                    }
                    for finding in request.findings
                ],
            }
            for request in requests
        ]

    async def summary(self, hours: int) -> dict[str, Any]:
        since = datetime.now(UTC) - timedelta(hours=hours)
        async with self._sessions() as session:
            decisions = await session.execute(
                select(ProxyRequest.decision, func.count())
                .where(ProxyRequest.created_at >= since)
                .group_by(ProxyRequest.decision)
            )
            finding_groups = await session.execute(
                select(
                    FindingRecord.category,
                    FindingRecord.severity,
                    FindingRecord.action,
                    func.count(),
                )
                .join(ProxyRequest, FindingRecord.request_id == ProxyRequest.id)
                .where(ProxyRequest.created_at >= since)
                .group_by(
                    FindingRecord.category,
                    FindingRecord.severity,
                    FindingRecord.action,
                )
                .order_by(func.count().desc())
                .limit(10)
            )
        decision_counts = {decision: count for decision, count in decisions}
        return {
            "window_hours": hours,
            "requests": sum(decision_counts.values()),
            "decisions": decision_counts,
            "findings": [
                {
                    "category": category,
                    "severity": severity,
                    "action": action,
                    "count": count,
                }
                for category, severity, action, count in finding_groups
            ],
        }

    async def aclose(self) -> None:
        await self.engine.dispose()

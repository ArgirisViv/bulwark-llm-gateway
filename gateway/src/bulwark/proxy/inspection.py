"""Run detectors, apply policy actions, and redact text while preserving structure."""

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

from bulwark.detectors.base import Detector, Direction, Finding, InspectionContext, Severity
from bulwark.detectors.normalization import normalize_text
from bulwark.policy.evaluator import FindingDecision, PolicyEvaluator
from bulwark.policy.schema import PolicyAction

logger = logging.getLogger(__name__)


async def inspect_text(
    text: str,
    *,
    app_id: str,
    direction: Direction,
    detectors: tuple[Detector, ...],
    timeout_seconds: float,
    metadata: dict[str, str],
) -> list[Finding]:
    context = InspectionContext(
        app_id=app_id,
        direction=direction,
        text=text,
        metadata=metadata,
        normalized=normalize_text(text),
    )
    findings: list[Finding] = []
    for detector in detectors:
        try:
            async with asyncio.timeout(timeout_seconds):
                findings.extend(await detector.inspect(context))
        except TimeoutError:
            logger.warning(
                "Detector timed out",
                extra={
                    "detector": detector.id,
                    "category": "detector_error",
                    "severity": Severity.HIGH.name.lower(),
                    "action": "pending_policy",
                    "direction": direction.value,
                    "app_id": app_id,
                },
            )
            findings.append(
                Finding(
                    detector=detector.id,
                    category="detector_error",
                    severity=Severity.HIGH,
                    confidence=1.0,
                    direction=direction,
                )
            )
    return findings


def _redact(text: str, spans: list[tuple[int, int]]) -> str:
    merged: list[tuple[int, int]] = []
    for start, end in sorted(spans):
        if not 0 <= start < end <= len(text):
            raise ValueError(f"redaction span [{start}, {end}) is outside text")
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    output = text
    for start, end in reversed(merged):
        output = output[:start] + "[REDACTED]" + output[end:]
    return output


async def inspect_and_transform(
    value: Any,
    *,
    app_id: str,
    direction: Direction,
    detectors: tuple[Detector, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    metadata: dict[str, str],
) -> tuple[Any, list[FindingDecision]]:
    if isinstance(value, str):
        findings = await inspect_text(
            value,
            app_id=app_id,
            direction=direction,
            detectors=detectors,
            timeout_seconds=timeout_seconds,
            metadata=metadata,
        )
        finding_decisions = evaluator.evaluate(findings)
        redactions: list[tuple[int, int]] = []
        for decision in finding_decisions:
            finding = decision.finding
            logger.info(
                "Security finding",
                extra={
                    "detector": finding.detector,
                    "category": finding.category,
                    "severity": finding.severity.name.lower(),
                    "action": decision.action.value,
                    "direction": finding.direction.value,
                    "app_id": app_id,
                },
            )
            if decision.action == PolicyAction.BLOCK:
                raise SecurityBlock(direction, finding.detector, finding.category)
            if decision.action == PolicyAction.REDACT:
                redactions.extend((span.start, span.end) for span in finding.spans)
        return _redact(value, redactions), list(finding_decisions)

    if isinstance(value, list):
        updated: list[Any] = []
        child_decisions: list[FindingDecision] = []
        for item in value:
            transformed, item_decisions = await inspect_and_transform(
                item,
                app_id=app_id,
                direction=direction,
                detectors=detectors,
                evaluator=evaluator,
                timeout_seconds=timeout_seconds,
                metadata=metadata,
            )
            updated.append(transformed)
            child_decisions.extend(item_decisions)
        return updated, child_decisions

    if isinstance(value, Mapping):
        updated_mapping: dict[str, Any] = {}
        nested_decisions: list[FindingDecision] = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("message object keys must be strings")
            transformed, item_decisions = await inspect_and_transform(
                item,
                app_id=app_id,
                direction=direction,
                detectors=detectors,
                evaluator=evaluator,
                timeout_seconds=timeout_seconds,
                metadata=metadata,
            )
            updated_mapping[key] = transformed
            nested_decisions.extend(item_decisions)
        return updated_mapping, nested_decisions

    return value, []


class SecurityBlock(Exception):
    def __init__(self, direction: Direction, detector: str, category: str) -> None:
        super().__init__(f"{direction.value} blocked by {detector} ({category}).")
        self.direction = direction
        self.detector = detector
        self.category = category

"""Run detectors, apply policy actions, and redact text while preserving structure."""

import asyncio
import logging
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from bulwark.detectors.base import Detector, Direction, Finding, InspectionContext, Severity
from bulwark.detectors.normalization import normalize_text
from bulwark.policy.evaluator import FindingDecision, PolicyEvaluator
from bulwark.policy.schema import PolicyAction

logger = logging.getLogger(__name__)

# Detectors are CPU-bound, so an asyncio timeout alone could never interrupt them.
# Running each one on a dedicated pool lets the event loop enforce the time budget.
# A detector that overruns keeps its worker until it finishes (threads cannot be
# killed), but the request is no longer held up by it and the policy's
# on_detector_error setting decides what happens.
_DETECTOR_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="bulwark-detector")


def _run_detector(detector: Detector, context: InspectionContext) -> list[Finding]:
    result = detector.inspect(context)
    if not isinstance(result, list):
        close = getattr(result, "close", None)
        if callable(close):
            close()  # an un-awaited coroutine; avoid a "never awaited" warning
        raise TypeError(f"detector {detector.id!r} must synchronously return a list of findings")
    return result


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
    if not detectors:
        return []
    # Start every detector at once and wait for them together: one event-loop round
    # trip instead of one per detector, and each still gets the full time budget.
    loop = asyncio.get_running_loop()
    futures = [
        loop.run_in_executor(_DETECTOR_POOL, _run_detector, detector, context)
        for detector in detectors
    ]
    await asyncio.wait(futures, timeout=timeout_seconds)

    findings: list[Finding] = []
    for detector, future in zip(detectors, futures, strict=True):
        if future.done():
            findings.extend(future.result())
        else:
            future.cancel()  # only detaches the waiter; the worker runs to completion
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
            if decision.action == PolicyAction.REDACT:
                redactions.extend((span.start, span.end) for span in finding.spans)
        for decision in finding_decisions:
            if decision.action == PolicyAction.BLOCK:
                raise SecurityBlock(
                    direction,
                    decision.finding.detector,
                    decision.finding.category,
                    list(finding_decisions),
                )
        return _redact(value, redactions), list(finding_decisions)

    if isinstance(value, list):
        updated: list[Any] = []
        child_decisions: list[FindingDecision] = []
        for item in value:
            try:
                transformed, item_decisions = await inspect_and_transform(
                    item,
                    app_id=app_id,
                    direction=direction,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    metadata=metadata,
                )
            except SecurityBlock as exc:
                exc.decisions[:0] = child_decisions
                raise
            updated.append(transformed)
            child_decisions.extend(item_decisions)
        return updated, child_decisions

    if isinstance(value, Mapping):
        updated_mapping: dict[str, Any] = {}
        nested_decisions: list[FindingDecision] = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("message object keys must be strings")
            try:
                transformed, item_decisions = await inspect_and_transform(
                    item,
                    app_id=app_id,
                    direction=direction,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    metadata=metadata,
                )
            except SecurityBlock as exc:
                exc.decisions[:0] = nested_decisions
                raise
            updated_mapping[key] = transformed
            nested_decisions.extend(item_decisions)
        return updated_mapping, nested_decisions

    return value, []


class SecurityBlock(Exception):
    """Raised on a block decision. Carries every decision made so far so the audit
    record explains *why* the request or response was blocked."""

    def __init__(
        self,
        direction: Direction,
        detector: str,
        category: str,
        decisions: list[FindingDecision] | None = None,
    ) -> None:
        super().__init__(f"{direction.value} blocked by {detector} ({category}).")
        self.direction = direction
        self.detector = detector
        self.category = category
        self.decisions: list[FindingDecision] = decisions if decisions is not None else []

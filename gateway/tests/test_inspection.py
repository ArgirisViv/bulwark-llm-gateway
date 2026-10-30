import asyncio
from pathlib import Path

import pytest

from bulwark.detectors.base import Direction, Finding, InspectionContext
from bulwark.detectors.injection import HeuristicInjectionDetector
from bulwark.detectors.pii import PiiDetector
from bulwark.policy.evaluator import PolicyEvaluator
from bulwark.policy.loader import load_policy
from bulwark.proxy.inspection import (
    SecurityBlock,
    _redact,
    inspect_and_transform,
    inspect_text,
)


class SlowDetector:
    id = "test.slow"

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        await asyncio.sleep(0.02)
        return []


def _evaluator(*, on_error: str = "allow") -> PolicyEvaluator:
    from bulwark.policy.schema import Policy

    return PolicyEvaluator(
        Policy(
            app="test",
            version=1,
            mode="enforce",
            rules=[{"detector": "*", "action": "log"}],
            on_detector_error=on_error,
        )
    )


async def test_detector_timeout_becomes_policy_finding() -> None:
    findings = await inspect_text(
        "text",
        app_id="test",
        direction=Direction.REQUEST,
        detectors=(SlowDetector(),),
        timeout_seconds=0.001,
        metadata={},
    )

    assert len(findings) == 1
    assert findings[0].category == "detector_error"


async def test_detector_timeout_can_be_configured_to_block() -> None:
    findings = await inspect_text(
        "text",
        app_id="test",
        direction=Direction.REQUEST,
        detectors=(SlowDetector(),),
        timeout_seconds=0.001,
        metadata={},
    )
    evaluator = _evaluator(on_error="block")
    value = {"content": "text"}

    with pytest.raises(SecurityBlock):
        await inspect_and_transform(
            value,
            app_id="test",
            direction=Direction.REQUEST,
            detectors=(SlowDetector(),),
            evaluator=evaluator,
            timeout_seconds=0.001,
            metadata={},
        )
    assert findings[0].category == "detector_error"


def test_redaction_merges_overlapping_spans() -> None:
    assert _redact("abcdefgh", [(1, 4), (3, 6)]) == "a[REDACTED]gh"


async def test_nested_content_is_redacted_without_mutating_input() -> None:
    policy_path = Path(__file__).parents[1] / "policies" / "default.yaml"
    policy = load_policy(policy_path)
    source = {"content": [{"type": "text", "text": "email alice@example.com"}]}

    transformed, decisions = await inspect_and_transform(
        source,
        app_id="default",
        direction=Direction.REQUEST,
        detectors=(HeuristicInjectionDetector(), PiiDetector()),
        evaluator=PolicyEvaluator(policy),
        timeout_seconds=0.1,
        metadata={},
    )

    assert source["content"][0]["text"] == "email alice@example.com"
    assert transformed["content"][0]["text"] == "email [REDACTED]"
    assert len(decisions) == 1

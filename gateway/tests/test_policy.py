from pathlib import Path

import pytest

from bulwark.detectors.base import Direction, Finding, Severity
from bulwark.policy.evaluator import PolicyEvaluator
from bulwark.policy.loader import PolicyLoadError, load_policy
from bulwark.policy.schema import PolicyAction

POLICY_YAML = """\
app: support-bot
version: 3
mode: enforce
rules:
  - detector: injection.*
    min_severity: high
    action: block
  - detector: pii
    action: redact
  - detector: "*"
    action: log
on_detector_error: allow
"""


def _finding(detector: str, severity: Severity) -> Finding:
    return Finding(detector, "test", severity, 0.9, Direction.REQUEST)


def test_policy_loads_and_first_matching_rule_wins(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text(POLICY_YAML, encoding="utf-8")
    evaluator = PolicyEvaluator(load_policy(path))

    decisions = evaluator.evaluate(
        [
            _finding("injection.heuristic", Severity.HIGH),
            _finding("pii", Severity.MEDIUM),
            _finding("secrets", Severity.HIGH),
        ]
    )

    assert [decision.action for decision in decisions] == [
        PolicyAction.BLOCK,
        PolicyAction.REDACT,
        PolicyAction.LOG,
    ]


def test_monitor_policy_records_would_block_without_enforcing(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text(POLICY_YAML.replace("mode: enforce", "mode: monitor"), encoding="utf-8")
    decision = PolicyEvaluator(load_policy(path)).evaluate(
        [_finding("injection.heuristic", Severity.CRITICAL)]
    )[0]

    assert decision.configured_action == PolicyAction.BLOCK
    assert decision.action == PolicyAction.LOG


def test_invalid_policy_is_rejected_against_schema(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text("app: invalid\nversion: 0\n", encoding="utf-8")

    with pytest.raises(PolicyLoadError, match="does not match"):
        load_policy(path)


def test_missing_policy_is_reported(tmp_path: Path) -> None:
    with pytest.raises(PolicyLoadError, match="Unable to read"):
        load_policy(tmp_path / "missing.yaml")


def test_policy_file_changes_are_visible_on_next_load(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text(POLICY_YAML, encoding="utf-8")
    first = load_policy(path)
    path.write_text(POLICY_YAML.replace("version: 3", "version: 4"), encoding="utf-8")

    second = load_policy(path)

    assert first.version == 3
    assert second.version == 4


def test_invalid_yaml_is_reported(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text("app: [unclosed", encoding="utf-8")

    with pytest.raises(PolicyLoadError, match="invalid YAML"):
        load_policy(path)

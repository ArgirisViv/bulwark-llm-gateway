"""First-match-wins policy evaluation; detectors never enforce their own findings."""

from dataclasses import dataclass
from fnmatch import fnmatchcase

from bulwark.detectors.base import Finding
from bulwark.policy.schema import DetectorErrorAction, Policy, PolicyAction, PolicyMode


@dataclass(frozen=True, slots=True)
class FindingDecision:
    finding: Finding
    configured_action: PolicyAction
    action: PolicyAction


class PolicyEvaluator:
    def __init__(self, policy: Policy) -> None:
        self.policy = policy

    def evaluate(self, findings: list[Finding]) -> tuple[FindingDecision, ...]:
        decisions: list[FindingDecision] = []
        for finding in findings:
            configured_action = self._action_for(finding)
            enforced_action = (
                PolicyAction.LOG if self.policy.mode == PolicyMode.MONITOR else configured_action
            )
            decisions.append(FindingDecision(finding, configured_action, enforced_action))
        return tuple(decisions)

    def _action_for(self, finding: Finding) -> PolicyAction:
        if finding.category == "detector_error":
            return (
                PolicyAction.BLOCK
                if self.policy.on_detector_error == DetectorErrorAction.BLOCK
                else PolicyAction.ALLOW
            )

        for rule in self.policy.rules:
            if (
                fnmatchcase(finding.detector, rule.detector)
                and finding.severity >= rule.severity_threshold
            ):
                return rule.action
        return PolicyAction.ALLOW

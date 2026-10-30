"""Validated policy types and the JSON Schema used at load time."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from bulwark.detectors.base import Severity


class PolicyMode(StrEnum):
    ENFORCE = "enforce"
    MONITOR = "monitor"


class PolicyAction(StrEnum):
    ALLOW = "allow"
    REDACT = "redact"
    BLOCK = "block"
    LOG = "log"


class DetectorErrorAction(StrEnum):
    ALLOW = "allow"
    BLOCK = "block"


class PolicyRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detector: str = Field(min_length=1)
    min_severity: str = Field(
        default="low",
        pattern=r"^(low|medium|high|critical)$",
    )
    action: PolicyAction

    @property
    def severity_threshold(self) -> Severity:
        return {
            "low": Severity.LOW,
            "medium": Severity.MEDIUM,
            "high": Severity.HIGH,
            "critical": Severity.CRITICAL,
        }[self.min_severity]


class Policy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    app: str = Field(min_length=1)
    version: int = Field(ge=1)
    mode: PolicyMode
    rules: list[PolicyRule] = Field(min_length=1)
    on_detector_error: DetectorErrorAction

"""Core types shared by all detectors (see design doc, 'Detector contract')."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum, StrEnum
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from bulwark.detectors.normalization import NormalizedText


class Severity(IntEnum):
    """Ordered so policies can say 'min_severity: high'."""

    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


class Direction(StrEnum):
    REQUEST = "request"
    RESPONSE = "response"


@dataclass(frozen=True, slots=True)
class Span:
    """Half-open character range [start, end) in the ORIGINAL (un-normalized) text."""

    start: int
    end: int

    def __post_init__(self) -> None:
        if not 0 <= self.start <= self.end:
            raise ValueError(f"invalid span [{self.start}, {self.end})")


@dataclass(frozen=True, slots=True)
class Finding:
    detector: str
    category: str
    severity: Severity
    confidence: float
    direction: Direction
    spans: tuple[Span, ...] = ()

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be in [0, 1], got {self.confidence}")


@dataclass(frozen=True, slots=True)
class InspectionContext:
    """Original input plus a normalized view whose spans map back to source text."""

    app_id: str
    direction: Direction
    text: str
    metadata: dict[str, str] = field(default_factory=dict)
    normalized: NormalizedText | None = None

    @property
    def view(self) -> NormalizedText:
        if self.normalized is not None:
            return self.normalized
        from bulwark.detectors.normalization import normalize_text

        return normalize_text(self.text)


class Detector(Protocol):
    id: str

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        """Must be side-effect free and respect the per-detector timeout."""
        ...

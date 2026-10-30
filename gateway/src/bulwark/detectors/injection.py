"""Low-cost heuristic detection for common direct and indirect injections."""

import re

from bulwark.detectors.base import Direction, Finding, InspectionContext, Severity

_PATTERNS = (
    re.compile(
        r"\b(?:ignore|disregard|forget|override|bypass)\b"
        r"(?:[\W_]+\w+){0,5}[\W_]+(?:previous|above|prior|all|earlier)"
        r"(?:[\W_]+\w+){0,4}[\W_]+(?:instructions?|rules?|prompts?)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:reveal|repeat|print|show|expose|leak)\b"
        r"(?:[\W_]+\w+){0,4}[\W_]+(?:system|hidden|secret)"
        r"(?:[\W_]+\w+){0,3}[\W_]+(?:prompt|instructions?|message)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:act|behave|respond)\b[\W_]+(?:as|like)\b"
        r"(?:[\W_]+\w+){0,5}[\W_]+(?:without|ignore|disregard)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bDAN\s+mode\b|\bdeveloper\s+mode\s+enabled\b", re.IGNORECASE),
    re.compile(r"<\s*/?\s*system\s*>", re.IGNORECASE),
)


class HeuristicInjectionDetector:
    id = "injection.heuristic"

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        if ctx.direction != Direction.REQUEST:
            return []

        view = ctx.view
        findings: list[Finding] = []
        seen: set[tuple[int, int]] = set()
        for pattern in _PATTERNS:
            for match in pattern.finditer(view.text):
                key = (match.start(), match.end())
                if key in seen:
                    continue
                seen.add(key)
                findings.append(
                    Finding(
                        detector=self.id,
                        category="prompt_injection",
                        severity=Severity.HIGH,
                        confidence=0.85,
                        direction=ctx.direction,
                        spans=(view.map_span(*key),),
                    )
                )
        return findings

"""Detect provider keys, private keys, JWTs, and high-entropy tokens."""

import math
import re
from collections import Counter

from bulwark.detectors.base import Finding, InspectionContext, Severity

_PATTERNS: tuple[tuple[str, re.Pattern[str], float], ...] = (
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), 1.0),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b"), 0.95),
    ("openai_api_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"), 0.9),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), 0.95),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), 0.95),
)
_HIGH_ENTROPY_TOKEN = re.compile(r"(?<![A-Za-z0-9_+/=-])[A-Za-z0-9_+/=-]{40,}(?![A-Za-z0-9_+/=-])")


def _entropy(value: str) -> float:
    frequencies = (count / len(value) for count in Counter(value).values())
    return -sum(probability * math.log2(probability) for probability in frequencies)


class SecretDetector:
    id = "secrets"

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        view = ctx.view
        matches: dict[tuple[int, int], tuple[str, float]] = {}
        for category, pattern, confidence in _PATTERNS:
            for match in pattern.finditer(view.text):
                matches[(match.start(), match.end())] = (category, confidence)

        for match in _HIGH_ENTROPY_TOKEN.finditer(view.text):
            token = match.group()
            if (
                len(set(token)) >= 12
                and _entropy(token) >= 4.2
                and any(character.islower() for character in token)
                and any(character.isupper() for character in token)
                and any(character.isdigit() for character in token)
            ):
                matches.setdefault((match.start(), match.end()), ("high_entropy_token", 0.75))

        return [
            Finding(
                detector=self.id,
                category=category,
                severity=Severity.HIGH,
                confidence=confidence,
                direction=ctx.direction,
                spans=(view.map_span(start, end),),
            )
            for (start, end), (category, confidence) in sorted(matches.items())
        ]

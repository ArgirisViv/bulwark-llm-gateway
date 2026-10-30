"""Pattern-based PII recognizers, including checksum-validated Greek identifiers."""

import re
import sys
from datetime import date
from typing import Any

from bulwark.detectors.base import Finding, InspectionContext, Severity

_PATTERNS: tuple[tuple[str, re.Pattern[str], float], ...] = (
    (
        "email_address",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        0.9,
    ),
    (
        "phone_number",
        re.compile(
            r"(?<!\w)(?:\+\d{1,3}[ .-]?)?"
            r"(?:\(?\d{2,4}\)?[ .-]\d{3}[ .-]\d{4}|\d{10})(?!\w)"
        ),
        0.7,
    ),
    ("credit_card", re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)"), 0.7),
    ("gr_afm", re.compile(r"(?<!\d)\d{9}(?!\d)"), 0.75),
    ("gr_amka", re.compile(r"(?<!\d)\d{11}(?!\d)"), 0.75),
)
_IBAN_PREFIX = re.compile(r"(?<![A-Z0-9])[A-Z]{2}\d{2}", re.IGNORECASE)
_IBAN_GROUP = re.compile(r"[A-Z0-9]+", re.IGNORECASE)
_IBAN_LENGTHS = {
    "AT": 20,
    "BE": 16,
    "CH": 21,
    "DE": 22,
    "ES": 24,
    "FR": 27,
    "GB": 22,
    "GR": 27,
    "IT": 27,
    "NL": 18,
}
_PRESIDIO_ENTITIES = {
    "email_address": "EMAIL_ADDRESS",
    "phone_number": "PHONE_NUMBER",
    "credit_card": "CREDIT_CARD",
    "gr_afm": "GR_AFM",
    "gr_amka": "GR_AMKA",
}


def _build_presidio_analyzer() -> Any | None:
    if sys.platform == "win32":
        return None

    from presidio_analyzer import (
        AnalyzerEngine,
        Pattern,
        PatternRecognizer,
        RecognizerRegistry,
    )
    from presidio_analyzer.nlp_engine import NoOpNlpEngine

    registry = RecognizerRegistry(supported_languages=["en"])
    for category, pattern, score in _PATTERNS:
        registry.add_recognizer(
            PatternRecognizer(
                supported_entity=_PRESIDIO_ENTITIES[category],
                patterns=[Pattern(name=f"{category}_pattern", regex=pattern.pattern, score=score)],
                supported_language="en",
            )
        )
    return AnalyzerEngine(
        registry=registry,
        nlp_engine=NoOpNlpEngine(models=[{"lang_code": "en", "model_name": "no_op"}]),
        supported_languages=["en"],
    )


def _luhn_valid(value: str) -> bool:
    digits = [int(character) for character in value if character.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    checksum = 0
    for index, digit in enumerate(reversed(digits)):
        if index % 2:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def _iban_valid(value: str) -> bool:
    compact = "".join(character for character in value.upper() if character.isalnum())
    if len(compact) < 15 or len(compact) > 34:
        return False
    rearranged = compact[4:] + compact[:4]
    remainder = 0
    for character in rearranged:
        digits = str(ord(character) - ord("A") + 10) if character.isalpha() else character
        for digit in digits:
            remainder = (remainder * 10 + int(digit)) % 97
    return remainder == 1


def _iban_matches(text: str) -> list[tuple[int, int]]:
    matches: list[tuple[int, int]] = []
    for prefix in _IBAN_PREFIX.finditer(text):
        country = prefix.group()[:2].upper()
        expected_length = _IBAN_LENGTHS.get(country)
        compact = ""
        last_end = prefix.start()
        for group in _IBAN_GROUP.finditer(text, prefix.start()):
            if group.start() > last_end and not text[last_end : group.start()].isspace():
                break
            if len(compact) + len(group.group()) > 34:
                break
            compact += group.group()
            last_end = group.end()
            if expected_length is not None and len(compact) > expected_length:
                break
            if expected_length == len(compact):
                if _iban_valid(compact):
                    matches.append((prefix.start(), group.end()))
                break
            if expected_length is None and 15 <= len(compact) <= 34 and _iban_valid(compact):
                matches.append((prefix.start(), group.end()))
                break
    return matches


def _greek_afm_valid(value: str) -> bool:
    if len(value) != 9:
        return False
    checksum = 0
    for index, character in enumerate(value[:8]):
        checksum += int(character) * 2 ** (8 - index)
    check_digit = int(checksum % 11 % 10)
    return check_digit == int(value[8])


def _greek_amka_valid(value: str) -> bool:
    if len(value) != 11:
        return False
    day, month, year = int(value[:2]), int(value[2:4]), int(value[4:6])
    for century in (2000, 1900):
        try:
            date(century + year, month, day)
            return True
        except ValueError:
            continue
    return False


def _is_valid(category: str, value: str) -> bool:
    if category == "credit_card":
        return _luhn_valid(value)
    if category == "iban":
        return _iban_valid(value)
    if category == "gr_afm":
        return _greek_afm_valid(value)
    if category == "gr_amka":
        return _greek_amka_valid(value)
    return True


class PiiDetector:
    id = "pii"

    def __init__(self) -> None:
        self._analyzer = _build_presidio_analyzer()

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        view = ctx.view
        findings: list[Finding] = []
        if self._analyzer is None:
            results = (
                (category, match.start(), match.end(), confidence, match.group())
                for category, pattern, confidence in _PATTERNS
                for match in pattern.finditer(view.text)
            )
        else:
            results = (
                (
                    category,
                    result.start,
                    result.end,
                    float(result.score),
                    view.text[result.start : result.end],
                )
                for result in self._analyzer.analyze(
                    text=view.text,
                    language="en",
                    entities=list(_PRESIDIO_ENTITIES.values()),
                )
                for category, entity in _PRESIDIO_ENTITIES.items()
                if entity == result.entity_type
            )

        seen: set[tuple[int, int, str]] = set()
        for category, start, end, confidence, matched_text in results:
            key = (start, end, category)
            if key in seen or not _is_valid(category, matched_text):
                continue
            seen.add(key)
            findings.append(
                Finding(
                    detector=self.id,
                    category=category,
                    severity=Severity.MEDIUM,
                    confidence=confidence,
                    direction=ctx.direction,
                    spans=(view.map_span(start, end),),
                )
            )
        for start, end in _iban_matches(view.text):
            findings.append(
                Finding(
                    detector=self.id,
                    category="iban",
                    severity=Severity.MEDIUM,
                    confidence=0.8,
                    direction=ctx.direction,
                    spans=(view.map_span(start, end),),
                )
            )
        return findings

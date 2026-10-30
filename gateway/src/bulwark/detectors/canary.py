"""Detect exact or near-exact disclosure of a request-scoped canary."""

import re
from difflib import SequenceMatcher

from bulwark.detectors.base import Direction, Finding, InspectionContext, Severity


class CanaryDetector:
    id = "canary"

    async def inspect(self, ctx: InspectionContext) -> list[Finding]:
        if ctx.direction != Direction.RESPONSE:
            return []
        token = ctx.metadata.get("canary_token")
        if not token:
            return []

        view = ctx.view
        compact_token = re.sub(r"[^A-Za-z0-9]", "", token).casefold()
        compact_text = re.sub(r"[^A-Za-z0-9]", "", view.text).casefold()
        token_length = len(compact_token)
        if token_length == 0:
            return []

        start = 0
        while True:
            exact = compact_text.find(compact_token, start)
            if exact < 0:
                break
            original = self._map_compact_span(view.text, exact, exact + token_length)
            return [
                Finding(
                    self.id,
                    "system_prompt_leak",
                    Severity.CRITICAL,
                    1.0,
                    ctx.direction,
                    (view.map_span(*original),),
                )
            ]
        if token_length < 12:
            return []

        for offset in range(max(0, len(compact_text) - token_length + 2)):
            for candidate_length in (token_length - 1, token_length, token_length + 1):
                end = offset + candidate_length
                if end > len(compact_text):
                    continue
                candidate = compact_text[offset:end]
                if SequenceMatcher(None, compact_token, candidate).ratio() >= 0.94:
                    original = self._map_compact_span(view.text, offset, end)
                    return [
                        Finding(
                            self.id,
                            "system_prompt_leak",
                            Severity.CRITICAL,
                            0.94,
                            ctx.direction,
                            (view.map_span(*original),),
                        )
                    ]
        return []

    @staticmethod
    def _map_compact_span(text: str, start: int, end: int) -> tuple[int, int]:
        positions = [index for index, character in enumerate(text) if character.isalnum()]
        return positions[start], positions[end - 1] + 1

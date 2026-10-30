"""Unicode and common-encoding normalization with source-span preservation."""

import base64
import binascii
import html
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import unquote_to_bytes

from bulwark.detectors.base import Span

_HTML_ENTITY = re.compile(r"&(?:#[xX][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]+);")
_PERCENT_BYTES = re.compile(r"(?:%[0-9A-Fa-f]{2})+")
_BASE64_TOKEN = re.compile(r"(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{20,}={0,2}(?![A-Za-z0-9+/_-])")
_CONFUSABLES = str.maketrans(
    {
        chr(0x0410): "A",
        chr(0x0430): "a",
        chr(0x0412): "B",
        chr(0x0432): "b",
        chr(0x0415): "E",
        chr(0x0435): "e",
        chr(0x041A): "K",
        chr(0x043A): "k",
        chr(0x041C): "M",
        chr(0x043C): "m",
        chr(0x041D): "H",
        chr(0x043D): "h",
        chr(0x041E): "O",
        chr(0x043E): "o",
        chr(0x0420): "P",
        chr(0x0440): "p",
        chr(0x0421): "C",
        chr(0x0441): "c",
        chr(0x0422): "T",
        chr(0x0442): "t",
        chr(0x0423): "Y",
        chr(0x0443): "y",
        chr(0x0425): "X",
        chr(0x0445): "x",
        chr(0x0406): "I",
        chr(0x0456): "i",
        chr(0x0391): "A",
        chr(0x03B1): "a",
        chr(0x0392): "B",
        chr(0x03B2): "b",
        chr(0x0395): "E",
        chr(0x03B5): "e",
        chr(0x0399): "I",
        chr(0x03B9): "i",
        chr(0x039A): "K",
        chr(0x03BA): "k",
        chr(0x039C): "M",
        chr(0x03BC): "m",
        chr(0x039D): "N",
        chr(0x03BD): "v",
        chr(0x039F): "O",
        chr(0x03BF): "o",
        chr(0x03A1): "P",
        chr(0x03C1): "p",
        chr(0x03A4): "T",
        chr(0x03C4): "t",
        chr(0x03A5): "Y",
        chr(0x03C5): "y",
        chr(0x03A7): "X",
        chr(0x03C7): "x",
    }
)


@dataclass(frozen=True, slots=True)
class NormalizedText:
    original: str
    text: str
    source_spans: tuple[Span, ...]

    def __post_init__(self) -> None:
        if len(self.text) != len(self.source_spans):
            raise ValueError("normalized characters must have one source span each")

    def map_span(self, start: int, end: int) -> Span:
        if not 0 <= start < end <= len(self.text):
            raise ValueError(f"invalid normalized span [{start}, {end})")
        spans = self.source_spans[start:end]
        return Span(min(span.start for span in spans), max(span.end for span in spans))


def _is_hidden(character: str) -> bool:
    codepoint = ord(character)
    return unicodedata.category(character) == "Cf" or 0xE0000 <= codepoint <= 0xE007F


def _initial_normalization(text: str) -> tuple[str, list[Span]]:
    output: list[str] = []
    spans: list[Span] = []
    index = 0
    while index < len(text):
        end = index + 1
        while end < len(text) and unicodedata.combining(text[end]):
            end += 1
        cluster = text[index:end]
        source_span = Span(index, end)
        for character in unicodedata.normalize("NFKC", cluster).translate(_CONFUSABLES):
            if not _is_hidden(character):
                output.append(character)
                spans.append(source_span)
        index = end
    return "".join(output), spans


def _replace_matches(
    text: str,
    spans: list[Span],
    pattern: re.Pattern[str],
    decoder: Callable[[str], str | None],
) -> tuple[str, list[Span]]:
    chunks: list[str] = []
    mapped: list[Span] = []
    previous_end = 0
    for match in pattern.finditer(text):
        if match.start() < previous_end:
            continue
        chunks.append(text[previous_end : match.start()])
        mapped.extend(spans[previous_end : match.start()])
        replacement = decoder(match.group())
        if replacement is None or replacement == match.group():
            chunks.append(match.group())
            mapped.extend(spans[match.start() : match.end()])
        else:
            chunks.append(replacement)
            source = spans[match.start() : match.end()]
            source_span = Span(
                min(span.start for span in source),
                max(span.end for span in source),
            )
            mapped.extend(source_span for _ in replacement)
        previous_end = match.end()
    chunks.append(text[previous_end:])
    mapped.extend(spans[previous_end:])
    return "".join(chunks), mapped


def _decode_html(value: str) -> str | None:
    decoded = html.unescape(value)
    return decoded if decoded != value else None


def _decode_percent(value: str) -> str | None:
    try:
        decoded = unquote_to_bytes(value).decode("utf-8")
    except UnicodeDecodeError:
        return None
    return decoded if decoded != value else None


def _decode_base64(value: str) -> str | None:
    try:
        padded = value + "=" * (-len(value) % 4)
        raw = base64.b64decode(padded, altchars=b"-_", validate=True)
        decoded = raw.decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    if not decoded or sum(character.isprintable() for character in decoded) / len(decoded) < 0.9:
        return None
    if not any(character.isalpha() for character in decoded):
        return None
    return decoded


def normalize_text(text: str) -> NormalizedText:
    normalized, spans = _initial_normalization(text)
    normalized, spans = _replace_matches(normalized, spans, _HTML_ENTITY, _decode_html)
    normalized, spans = _replace_matches(normalized, spans, _PERCENT_BYTES, _decode_percent)
    normalized, spans = _replace_matches(normalized, spans, _BASE64_TOKEN, _decode_base64)
    return NormalizedText(text, normalized, tuple(spans))

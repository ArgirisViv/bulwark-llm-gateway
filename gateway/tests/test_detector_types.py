import pytest

from bulwark.detectors.base import Direction, Finding, Severity, Span


def test_severity_is_ordered() -> None:
    assert Severity.LOW < Severity.MEDIUM < Severity.HIGH < Severity.CRITICAL


@pytest.mark.parametrize(("start", "end"), [(-1, 3), (5, 2)])
def test_invalid_span_rejected(start: int, end: int) -> None:
    with pytest.raises(ValueError, match="invalid span"):
        Span(start, end)


@pytest.mark.parametrize("confidence", [-0.1, 1.5])
def test_confidence_out_of_range_rejected(confidence: float) -> None:
    with pytest.raises(ValueError, match="confidence"):
        Finding("secrets", "api_key", Severity.HIGH, confidence, Direction.REQUEST)


def test_valid_finding() -> None:
    f = Finding("secrets", "api_key", Severity.HIGH, 0.9, Direction.REQUEST, (Span(0, 4),))
    assert f.spans[0].end == 4

import json
import logging

from bulwark.observability.logging import JsonFormatter
from bulwark.providers.base import UpstreamError


def test_json_formatter_emits_valid_json() -> None:
    record = logging.LogRecord("bulwark", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    line = json.loads(JsonFormatter().format(record))
    assert line["msg"] == "hello world"
    assert line["level"] == "INFO"
    assert "request_id" in line


def test_upstream_error_keeps_status() -> None:
    err = UpstreamError(502, "bad gateway")
    assert err.status_code == 502
    assert str(err) == "bad gateway"

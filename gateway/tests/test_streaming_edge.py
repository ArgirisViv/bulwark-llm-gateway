import json
from typing import Any

from httpx import ASGITransport, AsyncClient

from bulwark.providers.base import UpstreamError
from tests.test_proxy import AUTH_HEADERS, VALID_BODY, StubProvider, _app


def _sse(payload: dict[str, Any]) -> list[str]:
    return ["data: " + json.dumps(payload), ""]


async def _stream(provider: StubProvider) -> str:
    app = _app(provider)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/chat/completions", headers=AUTH_HEADERS, json={**VALID_BODY, "stream": True}
        )
    assert response.status_code == 200
    return response.text


async def test_stream_redacts_refusal_field() -> None:
    provider = StubProvider()
    provider.stream_lines = [
        *_sse({"choices": [{"index": 0, "delta": {"refusal": "Ask bob@example.com instead"}}]}),
        "data: [DONE]",
        "",
    ]

    text = await _stream(provider)

    assert "bob@example.com" not in text
    assert "[REDACTED]" in text


async def test_stream_redacts_legacy_function_call() -> None:
    provider = StubProvider()
    provider.stream_lines = [
        *_sse(
            {
                "choices": [
                    {
                        "index": 0,
                        "delta": {
                            "function_call": {
                                "name": "send",
                                "arguments": '{"to":"carol@example.com"}',
                            }
                        },
                    }
                ]
            }
        ),
        "data: [DONE]",
        "",
    ]

    text = await _stream(provider)

    assert "carol@example.com" not in text
    assert "[REDACTED]" in text


async def test_stream_joins_multiple_data_lines_of_one_event() -> None:
    provider = StubProvider()
    provider.stream_lines = [
        'data: {"choices":[{"index":0,',
        'data: "delta":{"content":"split event"}}]}',
        "",
        "data: [DONE]",
        "",
    ]

    text = await _stream(provider)

    assert '"content":"split event"' in text


async def test_stream_ignores_comments_and_unknown_fields() -> None:
    provider = StubProvider()
    provider.stream_lines = [
        ": keep-alive",
        "event: ping",
        "",
        *_sse({"choices": [{"index": 0, "delta": {"content": "ok"}}]}),
        "data: [DONE]",
        "",
    ]

    text = await _stream(provider)

    assert '"content":"ok"' in text
    assert "keep-alive" not in text


async def test_stream_secret_split_across_events_is_redacted() -> None:
    provider = StubProvider()
    provider.stream_lines = [
        *_sse({"choices": [{"index": 0, "delta": {"content": "key AKIAIOSF"}}]}),
        *_sse({"choices": [{"index": 0, "delta": {"content": "ODNN7EXAMPLE end"}}]}),
        "data: [DONE]",
        "",
    ]

    text = await _stream(provider)

    assert "AKIAIOSFODNN7EXAMPLE" not in text
    assert "[REDACTED]" in text


async def test_stream_upstream_error_before_first_event_yields_error_event() -> None:
    provider = StubProvider()
    provider.error = UpstreamError(502, "boom")

    text = await _stream(provider)

    assert '"type":"upstream_error"' in text
    assert "boom" not in text
    assert text.rstrip().endswith("data: [DONE]")


async def test_stream_non_dict_event_is_rejected() -> None:
    provider = StubProvider()
    provider.stream_lines = ['data: ["not","an","object"]', ""]

    text = await _stream(provider)

    assert '"code":"invalid_upstream_stream"' in text

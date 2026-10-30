import httpx
import pytest
from pydantic import SecretStr

from bulwark.providers.base import UpstreamError
from bulwark.providers.openai_compatible import OpenAICompatibleProvider


async def test_provider_sends_chat_request_and_returns_json() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://upstream.test/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer" + chr(32) + "upstream-key"
        assert request.read() == b'{"model":"test-model","messages":[]}'
        return httpx.Response(200, json={"id": "chatcmpl-test"})

    provider = OpenAICompatibleProvider(
        "https://upstream.test/v1/",
        SecretStr("upstream-key"),
        10,
        transport=httpx.MockTransport(handler),
    )

    try:
        result = await provider.chat_completion({"model": "test-model", "messages": []})
    finally:
        await provider.aclose()

    assert result == {"id": "chatcmpl-test"}


async def test_provider_lists_models_from_upstream() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url) == "https://upstream.test/v1/models"
        return httpx.Response(200, json={"object": "list", "data": []})

    provider = OpenAICompatibleProvider(
        "https://upstream.test/v1",
        None,
        10,
        transport=httpx.MockTransport(handler),
    )

    try:
        result = await provider.list_models()
    finally:
        await provider.aclose()

    assert result == {"object": "list", "data": []}


async def test_provider_streams_complete_sse_lines() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept"] == "text/event-stream"
        return httpx.Response(
            200,
            text='data: {"choices":[]}\n\ndata: [DONE]\n\n',
            headers={"content-type": "text/event-stream"},
        )

    provider = OpenAICompatibleProvider(
        "https://upstream.test/v1",
        None,
        10,
        transport=httpx.MockTransport(handler),
    )
    try:
        lines = [
            line
            async for line in provider.stream_chat_completion(
                {"model": "test-model", "messages": []}
            )
        ]
    finally:
        await provider.aclose()

    assert lines == ['data: {"choices":[]}', "", "data: [DONE]", ""]


@pytest.mark.parametrize(
    ("response", "expected_status"),
    [
        (httpx.Response(401), 502),
        (httpx.Response(200, text="not json"), 502),
        (httpx.Response(200, json=[]), 502),
    ],
)
async def test_provider_rejects_invalid_upstream_responses(
    response: httpx.Response,
    expected_status: int,
) -> None:
    provider = OpenAICompatibleProvider(
        "https://upstream.test/v1",
        None,
        10,
        transport=httpx.MockTransport(lambda _: response),
    )

    try:
        with pytest.raises(UpstreamError) as error:
            await provider.chat_completion({"model": "test-model", "messages": []})
    finally:
        await provider.aclose()

    assert error.value.status_code == expected_status


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (httpx.ReadTimeout("timed out"), 504),
        (httpx.ConnectError("unavailable"), 502),
    ],
)
async def test_provider_maps_transport_errors(
    error: httpx.RequestError,
    expected_status: int,
) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise error

    provider = OpenAICompatibleProvider(
        "https://upstream.test/v1",
        None,
        10,
        transport=httpx.MockTransport(handler),
    )

    try:
        with pytest.raises(UpstreamError) as upstream_error:
            await provider.chat_completion({"model": "test-model", "messages": []})
    finally:
        await provider.aclose()

    assert upstream_error.value.status_code == expected_status

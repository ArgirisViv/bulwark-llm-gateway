"""Adapter for OpenAI Chat Completions-compatible upstreams."""

from collections.abc import AsyncIterator
from typing import Any

import httpx
from pydantic import SecretStr

from bulwark.providers.base import UpstreamError


class OpenAICompatibleProvider:
    name = "openai-compatible"

    def __init__(
        self,
        base_url: str,
        api_key: SecretStr | None,
        timeout_seconds: float,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=timeout_seconds, transport=transport)

    async def chat_completion(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"{self._base_url}/chat/completions",
            payload,
        )

    async def list_models(self) -> dict[str, Any]:
        return await self._request_json("GET", f"{self._base_url}/models")

    async def stream_chat_completion(self, payload: dict[str, Any]) -> AsyncIterator[str]:
        headers: dict[str, str] = {"Accept": "text/event-stream"}
        if self._api_key is not None:
            headers["Authorization"] = "Bearer" + chr(32) + self._api_key.get_secret_value()

        try:
            async with self._client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=headers,
            ) as response:
                if not response.is_success:
                    raise UpstreamError(502, "The upstream provider rejected the request.")
                async for line in response.aiter_lines():
                    yield line
        except httpx.TimeoutException as exc:
            raise UpstreamError(504, "The upstream provider timed out.") from exc
        except httpx.RequestError as exc:
            raise UpstreamError(502, "The upstream provider is unavailable.") from exc

    async def _request_json(
        self,
        method: str,
        url: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {}
        if self._api_key is not None:
            headers["Authorization"] = "Bearer" + chr(32) + self._api_key.get_secret_value()

        try:
            response = await self._client.request(
                method,
                url,
                json=payload,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            raise UpstreamError(504, "The upstream provider timed out.") from exc
        except httpx.RequestError as exc:
            raise UpstreamError(502, "The upstream provider is unavailable.") from exc

        if not response.is_success:
            raise UpstreamError(502, "The upstream provider rejected the request.")

        try:
            result = response.json()
        except ValueError as exc:
            raise UpstreamError(502, "The upstream provider returned an invalid response.") from exc

        if not isinstance(result, dict):
            raise UpstreamError(502, "The upstream provider returned an invalid response.")
        return result

    async def aclose(self) -> None:
        await self._client.aclose()


class OllamaProvider(OpenAICompatibleProvider):
    """Local Ollama adapter using its OpenAI-compatible API surface."""

    name = "ollama"

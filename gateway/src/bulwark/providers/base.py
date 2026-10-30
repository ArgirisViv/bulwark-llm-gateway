"""The contract every upstream provider adapter implements."""

from collections.abc import AsyncIterator
from typing import Any, Protocol


class UpstreamError(Exception):
    """Raised when the upstream provider fails or returns an error status."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class UpstreamProvider(Protocol):
    name: str

    async def chat_completion(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Send an OpenAI-format chat completion and return the OpenAI-format response."""
        ...

    async def list_models(self) -> dict[str, Any]:
        """Return the upstream OpenAI-format model list."""
        ...

    def stream_chat_completion(self, payload: dict[str, Any]) -> AsyncIterator[str]:
        """Yield complete SSE lines from an OpenAI-format streaming response."""
        ...

    async def aclose(self) -> None:
        """Release network resources (HTTP connection pool)."""
        ...

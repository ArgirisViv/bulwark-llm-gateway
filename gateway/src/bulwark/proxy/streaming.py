"""SSE response inspection with a bounded holdback buffer."""

import json
from collections.abc import AsyncIterator
from typing import Any

from bulwark.detectors.base import Direction
from bulwark.policy.evaluator import FindingDecision, PolicyEvaluator
from bulwark.policy.schema import PolicyAction
from bulwark.providers.base import UpstreamProvider
from bulwark.proxy.inspection import SecurityBlock, inspect_and_transform

PendingKey = tuple[int, str, int | None]


class MalformedStreamData(Exception):
    pass


def _event(payload: dict[str, Any]) -> str:
    return "data: " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n\n"


def _error_event(message: str, *, code: str) -> str:
    return _event(
        {
            "error": {
                "message": message,
                "type": "security_error",
                "code": code,
            }
        }
    )


def _decision_key(item: FindingDecision) -> tuple[str, str, str, tuple[tuple[int, int], ...]]:
    finding = item.finding
    return (
        finding.detector,
        finding.category,
        finding.direction.value,
        tuple((span.start, span.end) for span in finding.spans),
    )


async def _inspect_pending(
    pending: str,
    *,
    app_id: str,
    detectors: tuple[Any, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    metadata: dict[str, str],
    decisions: list[FindingDecision],
) -> str:
    transformed, found = await inspect_and_transform(
        pending,
        app_id=app_id,
        direction=Direction.RESPONSE,
        detectors=detectors,
        evaluator=evaluator,
        timeout_seconds=timeout_seconds,
        metadata=metadata,
    )
    existing = {_decision_key(item) for item in decisions}
    for item in found:
        key = _decision_key(item)
        if key not in existing:
            decisions.append(item)
            existing.add(key)
    if any(item.action == PolicyAction.BLOCK for item in found):
        raise SecurityBlock(
            Direction.RESPONSE,
            found[0].finding.detector,
            found[0].finding.category,
        )
    return str(transformed)


async def _buffer_field(
    text: str,
    key: PendingKey,
    pending: dict[PendingKey, str],
    *,
    app_id: str,
    detectors: tuple[Any, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    tail_buffer_chars: int,
    metadata: dict[str, str],
    findings: list[FindingDecision],
) -> str:
    held = await _inspect_pending(
        pending.get(key, "") + text,
        app_id=app_id,
        detectors=detectors,
        evaluator=evaluator,
        timeout_seconds=timeout_seconds,
        metadata=metadata,
        decisions=findings,
    )
    safe_length = max(0, len(held) - tail_buffer_chars)
    if held[safe_length:]:
        pending[key] = held[safe_length:]
    else:
        pending.pop(key, None)
    return held[:safe_length]


async def _process_data_event(
    data: str,
    pending: dict[PendingKey, str],
    *,
    app_id: str,
    detectors: tuple[Any, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    tail_buffer_chars: int,
    metadata: dict[str, str],
    findings: list[FindingDecision],
    usage: dict[str, Any],
) -> str:
    try:
        event_data = json.loads(data)
    except json.JSONDecodeError as exc:
        raise MalformedStreamData("Malformed upstream SSE payload") from exc
    if not isinstance(event_data, dict):
        raise MalformedStreamData("Invalid upstream SSE payload")

    event_usage = event_data.get("usage")
    if isinstance(event_usage, dict):
        usage.update(event_usage)

    choices = event_data.get("choices", [])
    for choice_position, choice in enumerate(choices if isinstance(choices, list) else []):
        if not isinstance(choice, dict):
            continue
        choice_index = choice.get("index", choice_position)
        if not isinstance(choice_index, int):
            choice_index = choice_position
        delta = choice.get("delta")
        if not isinstance(delta, dict):
            continue
        for field in ("content", "refusal"):
            text = delta.get(field)
            if isinstance(text, str):
                key: PendingKey = (choice_index, field, None)
                delta[field] = await _buffer_field(
                    text,
                    key,
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    tail_buffer_chars=tail_buffer_chars,
                    metadata=metadata,
                    findings=findings,
                )

        calls = delta.get("tool_calls")
        if isinstance(calls, list):
            for call_position, call in enumerate(calls):
                if not isinstance(call, dict):
                    continue
                tool_index = call.get("index", call_position)
                if not isinstance(tool_index, int):
                    tool_index = call_position
                function = call.get("function")
                if not isinstance(function, dict):
                    continue
                for field in ("name", "arguments"):
                    text = function.get(field)
                    if not isinstance(text, str):
                        continue
                    key = (choice_index, "tool_" + field, tool_index)
                    function[field] = await _buffer_field(
                        text,
                        key,
                        pending,
                        app_id=app_id,
                        detectors=detectors,
                        evaluator=evaluator,
                        timeout_seconds=timeout_seconds,
                        tail_buffer_chars=tail_buffer_chars,
                        metadata=metadata,
                        findings=findings,
                    )

        old_function_call = delta.get("function_call")
        if isinstance(old_function_call, dict):
            for field in ("name", "arguments"):
                text = old_function_call.get(field)
                if not isinstance(text, str):
                    continue
                key = (choice_index, "function_" + field, None)
                old_function_call[field] = await _buffer_field(
                    text,
                    key,
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    tail_buffer_chars=tail_buffer_chars,
                    metadata=metadata,
                    findings=findings,
                )
    return _event(event_data)


async def _flush_pending(
    pending: dict[PendingKey, str],
    *,
    app_id: str,
    detectors: tuple[Any, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    metadata: dict[str, str],
    findings: list[FindingDecision],
) -> list[str]:
    events: list[str] = []
    for (choice_index, field, tool_index), text in pending.items():
        safe = await _inspect_pending(
            text,
            app_id=app_id,
            detectors=detectors,
            evaluator=evaluator,
            timeout_seconds=timeout_seconds,
            metadata=metadata,
            decisions=findings,
        )
        if not safe:
            continue
        if field in {"content", "refusal"}:
            delta: dict[str, Any] = {field: safe}
        elif field in {"tool_name", "tool_arguments"}:
            function_field = "name" if field == "tool_name" else "arguments"
            delta = {"tool_calls": [{"index": tool_index, "function": {function_field: safe}}]}
        elif field in {"function_name", "function_arguments"}:
            function_field = "name" if field == "function_name" else "arguments"
            delta = {"function_call": {function_field: safe}}
        else:
            delta = {"function_call": {"arguments": safe}}
        events.append(_event({"choices": [{"index": choice_index, "delta": delta}]}))
    pending.clear()
    return events


async def stream_inspected_response(
    provider: UpstreamProvider,
    payload: dict[str, Any],
    *,
    app_id: str,
    detectors: tuple[Any, ...],
    evaluator: PolicyEvaluator,
    timeout_seconds: float,
    tail_buffer_chars: int,
    metadata: dict[str, str],
    findings: list[FindingDecision],
    usage: dict[str, Any],
    outcome: dict[str, Any],
) -> AsyncIterator[str]:
    pending: dict[PendingKey, str] = {}
    data_lines: list[str] = []
    try:
        async for line in provider.stream_chat_completion(payload):
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
                continue
            if line != "":
                continue

            data, data_lines = "\n".join(data_lines), []
            if not data:
                continue
            if data == "[DONE]":
                for event in await _flush_pending(
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    metadata=metadata,
                    findings=findings,
                ):
                    yield event
                yield "data: [DONE]\n\n"
                return

            try:
                serialized = await _process_data_event(
                    data,
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    tail_buffer_chars=tail_buffer_chars,
                    metadata=metadata,
                    findings=findings,
                    usage=usage,
                )
            except MalformedStreamData:
                outcome["decision"] = "upstream_error"
                yield _error_event(
                    "The upstream provider returned malformed SSE data.",
                    code="invalid_upstream_stream",
                )
                yield "data: [DONE]\n\n"
                return
            yield serialized

        if data_lines:
            data = "\n".join(data_lines)
            if data == "[DONE]":
                for event in await _flush_pending(
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    metadata=metadata,
                    findings=findings,
                ):
                    yield event
                yield "data: [DONE]\n\n"
                return
            try:
                serialized = await _process_data_event(
                    data,
                    pending,
                    app_id=app_id,
                    detectors=detectors,
                    evaluator=evaluator,
                    timeout_seconds=timeout_seconds,
                    tail_buffer_chars=tail_buffer_chars,
                    metadata=metadata,
                    findings=findings,
                    usage=usage,
                )
            except MalformedStreamData:
                outcome["decision"] = "upstream_error"
                yield _error_event(
                    "The upstream provider returned malformed SSE data.",
                    code="invalid_upstream_stream",
                )
                yield "data: [DONE]\n\n"
                return
            yield serialized

        for event in await _flush_pending(
            pending,
            app_id=app_id,
            detectors=detectors,
            evaluator=evaluator,
            timeout_seconds=timeout_seconds,
            metadata=metadata,
            findings=findings,
        ):
            yield event
        yield "data: [DONE]\n\n"
    except SecurityBlock:
        outcome["decision"] = "blocked"
        yield _error_event(
            "The upstream response was blocked by the security policy.",
            code="response_blocked",
        )
        yield "data: [DONE]\n\n"

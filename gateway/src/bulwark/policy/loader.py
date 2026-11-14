"""Load and validate YAML policies, re-reading a file only when it changes on disk."""

from pathlib import Path
from threading import Lock
from typing import Any

import yaml
from jsonschema import ValidationError as JsonSchemaValidationError
from jsonschema import validate
from pydantic import ValidationError

from bulwark.policy.schema import Policy


class PolicyLoadError(Exception):
    """Raised when a configured policy cannot be read or validated."""


# path -> ((st_mtime_ns, st_size), policy). A stat() per request is cheap; parsing
# and schema validation only happen when the file's mtime or size changes, so edits
# still take effect immediately without a restart.
_cache: dict[Path, tuple[tuple[int, int], Policy]] = {}
_lock = Lock()


def load_policy(path: Path) -> Policy:
    try:
        stat = path.stat()
    except OSError as exc:
        raise PolicyLoadError(f"Unable to read policy file '{path}'.") from exc
    signature = (stat.st_mtime_ns, stat.st_size)

    cached = _cache.get(path)
    if cached is not None and cached[0] == signature:
        return cached[1]

    policy = _parse_policy(path)
    with _lock:
        _cache[path] = (signature, policy)
    return policy


def clear_policy_cache() -> None:
    with _lock:
        _cache.clear()


def _parse_policy(path: Path) -> Policy:
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PolicyLoadError(f"Unable to read policy file '{path}'.") from exc

    try:
        raw: Any = yaml.safe_load(source)
    except yaml.YAMLError as exc:
        raise PolicyLoadError(f"Policy file '{path}' contains invalid YAML.") from exc

    try:
        validate(instance=raw, schema=Policy.model_json_schema())
        return Policy.model_validate(raw)
    except (JsonSchemaValidationError, ValidationError, TypeError, ValueError) as exc:
        raise PolicyLoadError(f"Policy file '{path}' does not match the policy schema.") from exc

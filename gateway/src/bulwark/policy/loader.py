"""Load and validate YAML policies on demand so edits take effect immediately."""

from pathlib import Path
from typing import Any

import yaml
from jsonschema import ValidationError as JsonSchemaValidationError
from jsonschema import validate
from pydantic import ValidationError

from bulwark.policy.schema import Policy


class PolicyLoadError(Exception):
    """Raised when a configured policy cannot be read or validated."""


def load_policy(path: Path) -> Policy:
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

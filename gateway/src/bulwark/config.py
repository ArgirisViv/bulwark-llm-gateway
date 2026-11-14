"""Runtime configuration, loaded from environment variables prefixed with BULWARK_."""

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BULWARK_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Operator key: accepted on the proxy (as the default application, using
    # policy_path) and the only key accepted by the dashboard audit API.
    gateway_api_key: SecretStr | None = None
    policy_path: Path = Path(__file__).resolve().parents[2] / "policies" / "default.yaml"
    # Per-application client keys, e.g. BULWARK_APP_KEYS='{"support":"key-1"}'.
    # A request made with an application key is rate-limited and audited under that
    # application id and uses <policy_dir>/<app>.yaml when it exists, otherwise
    # policy_path.
    app_keys: dict[str, SecretStr] = Field(default_factory=dict)
    policy_dir: Path | None = None
    # Inject a per-request canary into the system prompt to detect prompt leakage.
    canary_enabled: bool = True
    detector_timeout_seconds: float = Field(default=0.1, gt=0)
    response_tail_buffer_chars: int = Field(default=256, ge=64, le=4096)
    requests_per_minute: int = Field(default=60, gt=0)
    max_request_bytes: int = Field(default=1_048_576, gt=0)
    # When set, GET /metrics requires "Authorization: Bearer <token>".
    metrics_token: SecretStr | None = None
    upstream_base_url: HttpUrl = HttpUrl("https://api.openai.com/v1")
    upstream_provider: Literal["openai-compatible", "ollama"] = "openai-compatible"
    # SecretStr keeps the key out of logs and reprs.
    upstream_api_key: SecretStr | None = None
    upstream_timeout_seconds: float = 60.0
    database_url: str = "postgresql+asyncpg://bulwark:bulwark@localhost:5432/bulwark"
    redis_url: str = "redis://localhost:6379/0"

    @field_validator("app_keys")
    @classmethod
    def _validate_app_keys(cls, value: dict[str, SecretStr]) -> dict[str, SecretStr]:
        for app_id, key in value.items():
            # App ids become file names under policy_dir, so keep them path-safe.
            if not _APP_ID.fullmatch(app_id):
                raise ValueError(f"invalid application id {app_id!r}")
            if len(key.get_secret_value()) < 16:
                raise ValueError(f"key for application {app_id!r} must be at least 16 chars")
        return value


_APP_ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,62}")


@lru_cache
def get_settings() -> Settings:
    return Settings()

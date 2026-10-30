"""Runtime configuration, loaded from environment variables prefixed with BULWARK_."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BULWARK_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    gateway_api_key: SecretStr | None = None
    policy_path: Path = Path(__file__).resolve().parents[2] / "policies" / "default.yaml"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Environment-driven configuration for the QuantumFlow API."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Explicit origins plus a regex for local dev servers and Figma Make previews.
    cors_origins: list[str] = field(
        default_factory=lambda: _list("QF_CORS_ORIGINS", ["http://localhost:5173", "http://localhost:8443"])
    )
    cors_origin_regex: str | None = os.getenv(
        "QF_CORS_ORIGIN_REGEX",
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://([a-z0-9-]+\.)*figma\.(com|site)",
    )
    # "auto" tries yfinance first and falls back to seeded synthetic data; "synthetic" is fully offline.
    data_mode: str = os.getenv("QF_DATA_MODE", "auto")
    max_workers: int = int(os.getenv("QF_MAX_WORKERS", "2"))
    # Caps the number of training windows so QRC training stays interactive.
    max_training_windows: int = int(os.getenv("QF_MAX_TRAINING_WINDOWS", "500"))
    qbraid_api_key: str | None = os.getenv("QBRAID_API_KEY")
    job_poll_timeout_s: int = int(os.getenv("QF_JOB_TIMEOUT_S", "900"))


settings = Settings()

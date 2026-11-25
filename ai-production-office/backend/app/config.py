"""Runtime configuration, read from environment variables (.env supported)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _path(name: str, default: str) -> Path:
    p = Path(os.getenv(name) or default)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass
class Settings:
    model: str = field(default_factory=lambda: os.getenv("AGENT_MODEL") or "claude-opus-5-5")
    effort: str = field(default_factory=lambda: os.getenv("AGENT_EFFORT") or "medium")
    director_effort: str = field(default_factory=lambda: os.getenv("DIRECTOR_EFFORT") or "high")
    max_concurrent: int = field(default_factory=lambda: _int("MAX_CONCURRENT_AGENTS", 4))
    max_steps: int = field(default_factory=lambda: _int("MAX_AGENT_STEPS", 12))
    max_revisions: int = field(default_factory=lambda: _int("MAX_REVISIONS", 2))
    max_tokens: int = field(default_factory=lambda: _int("AGENT_MAX_TOKENS", 32000))
    enable_web_search: bool = field(default_factory=lambda: _bool("ENABLE_WEB_SEARCH", True))
    enable_fallback: bool = field(default_factory=lambda: _bool("ENABLE_FALLBACK", True))
    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL") or f"sqlite:///{BACKEND_DIR / 'data' / 'office.db'}"
    )
    workspace_dir: Path = field(default_factory=lambda: _path("WORKSPACE_DIR", "./workspace"))
    frontend_origin: str = field(default_factory=lambda: os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000")

    @property
    def api_key_configured(self) -> bool:
        # The SDK also resolves ANTHROPIC_AUTH_TOKEN / `ant auth login` profiles,
        # so a missing ANTHROPIC_API_KEY is only a hint, not a hard failure.
        return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


settings = Settings()

if settings.database_url.startswith("sqlite:///./"):
    settings.database_url = f"sqlite:///{(BACKEND_DIR / settings.database_url[len('sqlite:///./'):]).resolve()}"

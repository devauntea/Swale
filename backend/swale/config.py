"""Settings, read from SWALE_* environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_URL = f"surrealkv://{BACKEND_DIR / 'var' / 'swale.db'}"
DEFAULT_CORS = ("http://localhost:5173", "http://localhost:3000")


@dataclass(frozen=True)
class Settings:
    db_url: str = DEFAULT_DB_URL
    cors_origins: tuple[str, ...] = DEFAULT_CORS
    dev_map: bool = True
    socrata_app_token: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        load_env_file()
        env = os.environ
        origins = env.get("SWALE_CORS_ORIGINS")
        return cls(
            db_url=env.get("SWALE_DB_URL", DEFAULT_DB_URL),
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()) if origins else DEFAULT_CORS,
            dev_map=env.get("SWALE_DEV_MAP", "1").lower() not in ("0", "false", "no"),
            socrata_app_token=env.get("SWALE_SOCRATA_APP_TOKEN") or None,
        )


def load_env_file(path: Path = BACKEND_DIR / ".env") -> None:
    """Load KEY=VALUE lines from backend/.env (never committed) without overriding variables already set."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        if key.strip() and value:
            os.environ.setdefault(key.strip(), value)

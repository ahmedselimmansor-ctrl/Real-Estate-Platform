"""Shared test configuration.

Every test runs **keyless and offline**: the environment is pinned before any
application module is imported, so the provider factories select their
deterministic fallbacks and nothing ever touches the network or a database.
"""

from __future__ import annotations

import os
from pathlib import Path


# --- pin the environment before `app.*` is imported ------------------------
def _repo_root() -> Path:
    """Walk up to the directory holding `seed/`, falling back to the checkout root.

    `parents[3]` assumed the on-disk layout `<repo>/apps/<svc>/tests/`. That
    breaks the moment the service is mounted somewhere shallower (a container at
    `/work`, CI at `/src`), raising IndexError before a single test can run.
    """
    here = Path(__file__).resolve()
    for candidate in here.parents:
        if (candidate / "seed" / "properties.json").is_file():
            return candidate
    return here.parents[min(3, len(here.parents) - 1)]


REPO_ROOT = _repo_root()

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ["DASHSCOPE_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ.setdefault("JWT_ACCESS_SECRET", "test-access-secret-min-32-chars-long-000")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-internal-token")
os.environ.setdefault("FRONTEND_URL", "https://localhost")
os.environ.setdefault("SEED_DIR", str(REPO_ROOT / "seed"))

import pytest  # noqa: E402
from app.core.config import Settings, get_settings  # noqa: E402
from app.core.tokens import TokenCounter  # noqa: E402


@pytest.fixture(scope="session")
def settings() -> Settings:
    return get_settings()


@pytest.fixture(scope="session")
def seed_dir(settings: Settings) -> Path:
    return settings.seed_path


@pytest.fixture(scope="session")
def token_counter() -> TokenCounter:
    return TokenCounter()


@pytest.fixture(scope="session")
def seed_available(seed_dir: Path) -> bool:
    return (seed_dir / "properties.json").is_file()

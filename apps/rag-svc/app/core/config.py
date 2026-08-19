"""Typed configuration for rag-svc.

Every environment variable name here comes from ``docs/CONTRACT.md`` §7 — do not
rename them. Extra knobs that the contract does not define are prefixed with
``RAG_`` so they cannot collide with another service's variables.

The service is designed to **boot without any model provider API key**: missing
keys are reported loudly through :meth:`Settings.startup_warnings` and the
provider layer transparently degrades to deterministic offline implementations.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _ancestor(path: Path, levels: int) -> Path:
    """`path.parents[levels]`, clamped to the filesystem root.

    On a developer machine this file is at
    ``apps/rag-svc/app/core/config.py`` (4 levels below the repo root), but in
    the container it is ``/app/app/core/config.py`` — only 3 levels deep. Asking
    for a parent that does not exist raises ``IndexError``, which would take the
    service down at import time.
    """
    parents = path.resolve().parents
    return parents[min(levels, len(parents) - 1)]


_HERE = Path(__file__)
# apps/rag-svc/app/core/config.py -> app/core -> app -> rag-svc -> apps -> repo
_REPO_ROOT = _ancestor(_HERE, 4)
_SERVICE_ROOT = _ancestor(_HERE, 2)

#: Dimension of the ``rag_chunks.embedding`` column. Fixed by CONTRACT §2.
VECTOR_DIM = 1024

SERVICE_NAME = "rag-svc"
SERVICE_VERSION = "1.0.0"


def _default_seed_dir() -> str:
    """Locate the shared ``seed/`` dataset (mounted at /app/seed in docker)."""
    candidates = [
        Path("/app/seed"),
        _REPO_ROOT / "seed",
        _SERVICE_ROOT / "seed",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return str(candidate)
    return "/app/seed"


class Settings(BaseSettings):
    """All rag-svc configuration, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _SERVICE_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- shared -----------------------------------------------------------
    app_env: Literal["development", "test", "staging", "production"] = "development"
    node_env: str = "development"
    port: int = 8001
    frontend_url: str = "https://localhost"
    public_api_url: str = "https://localhost/api/v1"
    internal_service_token: str = ""
    log_level: str = "INFO"

    # --- auth (CONTRACT §5) ----------------------------------------------
    jwt_access_secret: str = ""
    jwt_issuer: str = "topchoice-api"
    jwt_audience: str = "topchoice-clients"

    # --- postgres (CONTRACT §2 — database topchoice_rag) -----------------------
    rag_database_url: str = (
        "postgresql+asyncpg://topchoice:topchoice_password@postgres:5432/topchoice_rag"
    )
    rag_database_url_sync: str = (
        "postgresql://topchoice:topchoice_password@postgres:5432/topchoice_rag"
    )
    rag_db_pool_size: int = 5
    rag_db_max_overflow: int = 10
    rag_db_pool_timeout: int = 30
    rag_db_echo: bool = False
    #: Create the database/extension/tables at boot when they are missing.
    rag_auto_migrate: bool = True

    # --- mongo (read-only mirror of the canonical listings) ---------------
    mongo_uri: str = "mongodb://mongo:27017/topchoice"
    mongo_timeout_ms: int = 3000

    # --- redis ------------------------------------------------------------
    redis_url: str = "redis://redis:6379"
    redis_ttl_default: int = 300

    # --- DashScope (embeddings + rerank) ----------------------------------
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    dashscope_native_base_url: str = "https://dashscope-intl.aliyuncs.com/api/v1"
    embedding_model: str = "tongyi-embedding-vision-flash"
    embedding_dim: int = VECTOR_DIM
    rerank_model: str = "qwen3-rerank"

    # --- OpenAI (generation) ---------------------------------------------
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    generation_model: str = "gpt-5.6-luna"
    #: Only sent to the provider when explicitly configured — newer models
    #: reject sampling parameters they do not support.
    generation_temperature: float | None = None
    generation_max_tokens: int | None = None

    # --- retrieval knobs (CONTRACT §7) ------------------------------------
    rag_top_k: int = 20
    rag_rerank_top_n: int = 6
    rag_max_context_tokens: int = 6000
    rag_memory_window: int = 10
    rag_rrf_k: int = 60
    rag_rrf_weight_vector: float = 1.0
    rag_rrf_weight_text: float = 1.0
    rag_rerank_candidates: int = 40
    rag_rerank_max_documents: int = 50
    rag_rerank_max_chars: int = 3000
    rag_min_score: float = 0.0

    # --- chunking ---------------------------------------------------------
    rag_chunk_tokens: int = 500
    rag_chunk_overlap_tokens: int = 80
    rag_chunk_min_tokens: int = 40
    rag_use_tiktoken: bool = True
    rag_tiktoken_encoding: str = "cl100k_base"

    # --- ingestion --------------------------------------------------------
    seed_dir: str = Field(default_factory=_default_seed_dir)
    rag_embedding_batch_size: int = 10
    rag_embedding_concurrency: int = 4
    rag_ingest_progress_every: int = 25
    rag_ingest_url_max_bytes: int = 4_000_000
    rag_ingest_allow_private_urls: bool = False

    # --- http -------------------------------------------------------------
    rag_http_timeout: float = 30.0
    rag_generation_timeout: float = 120.0
    rag_http_max_retries: int = 4
    rag_http_backoff_seconds: float = 0.5
    rag_http_max_connections: int = 32

    # --- rate limiting (CONTRACT §10.4) -----------------------------------
    rag_rate_limit_enabled: bool = True
    rag_rate_limit_chat: int = 30
    rag_rate_limit_chat_window: int = 60
    rag_rate_limit_ingest: int = 10
    rag_rate_limit_ingest_window: int = 60

    # --- internal service urls -------------------------------------------
    api_core_url: str = "http://api-core:4000"
    search_svc_url: str = "http://search-svc:8000"
    rag_svc_url: str = "http://rag-svc:8001"
    reports_svc_url: str = "http://reports-svc:4567"

    # ------------------------------------------------------------------ ---
    @field_validator(
        "dashscope_base_url",
        "dashscope_native_base_url",
        "openai_base_url",
        "frontend_url",
        "api_core_url",
        "search_svc_url",
        "rag_svc_url",
        "reports_svc_url",
    )
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("log_level")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()

    # --- derived ----------------------------------------------------------
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def seed_path(self) -> Path:
        return Path(self.seed_dir)

    @property
    def dashscope_enabled(self) -> bool:
        return bool(self.dashscope_api_key.strip())

    @property
    def openai_enabled(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def alembic_database_url(self) -> str:
        """Sync URL for Alembic, forced onto the psycopg (v3) driver."""
        url = self.rag_database_url_sync
        if url.startswith("postgresql+"):
            return url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        return url

    @property
    def async_database_url(self) -> str:
        """Async URL, forced onto the asyncpg driver."""
        url = self.rag_database_url
        if url.startswith("postgresql+"):
            return url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.frontend_url}
        if not self.is_production:
            origins.update(
                {
                    "http://localhost:3000",
                    "https://localhost:3000",
                    "http://localhost",
                    "https://localhost",
                }
            )
        return sorted(o for o in origins if o)

    # --- validation -------------------------------------------------------
    def startup_warnings(self) -> list[str]:
        """Non-fatal configuration problems, logged loudly at boot."""
        warnings: list[str] = []

        if not self.dashscope_enabled:
            warnings.append(
                "DASHSCOPE_API_KEY is not set — embeddings fall back to the deterministic "
                "offline hash provider and reranking falls back to lexical scoring. "
                "Retrieval quality will be degraded."
            )
        if not self.openai_enabled:
            warnings.append(
                "OPENAI_API_KEY is not set — answers are generated by the offline extractive "
                "template provider instead of "
                f"{self.generation_model}."
            )
        if not self.jwt_access_secret:
            warnings.append(
                "JWT_ACCESS_SECRET is not set — authenticated chat is disabled and every "
                "request is treated as a guest."
            )
        elif len(self.jwt_access_secret) < 32:
            warnings.append("JWT_ACCESS_SECRET is shorter than 32 characters (CONTRACT §7).")
        if not self.internal_service_token:
            warnings.append(
                "INTERNAL_SERVICE_TOKEN is not set — service-to-service endpoints "
                "(POST /api/chat/ingest) will reject every request."
            )
        if self.embedding_dim != VECTOR_DIM:
            warnings.append(
                f"EMBEDDING_DIM={self.embedding_dim} but rag_chunks.embedding is "
                f"vector({VECTOR_DIM}) per CONTRACT §2 — embeddings will be rejected on write."
            )
        if not self.seed_path.is_dir():
            warnings.append(
                f"Seed directory {self.seed_dir} does not exist — file-backed ingestion "
                "sources (faq, areas, compounds, developers) will fail."
            )
        if self.rag_chunk_overlap_tokens >= self.rag_chunk_tokens:
            warnings.append(
                "RAG_CHUNK_OVERLAP_TOKENS must be smaller than RAG_CHUNK_TOKENS; "
                "falling back to 20% overlap."
            )
        if self.is_production and self.internal_service_token == "change-me-internal-token":
            warnings.append("INTERNAL_SERVICE_TOKEN still holds its example value in production.")
        return warnings

    def provider_status(self) -> dict[str, str]:
        """Config-presence view of the model providers (no network calls)."""
        return {
            "dashscope": "configured" if self.dashscope_enabled else "fallback",
            "openai": "configured" if self.openai_enabled else "fallback",
        }


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton."""
    return Settings()


settings = get_settings()

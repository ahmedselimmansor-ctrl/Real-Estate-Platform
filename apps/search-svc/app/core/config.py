"""Typed configuration for search-svc.

Every name here comes from `docs/CONTRACT.md` §7 (or is a service-local tuning
knob with a safe default). Unknown environment variables are ignored on purpose:
docker compose injects the whole shared `.env` into every container.
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRETS: frozenset[str] = frozenset(
    {
        "change-me-access-secret-min-32-chars-long",
        "change-me-access-secret-min-32-chars-long-0000",
        "change-me-internal-token",
    }
)

#: Public route prefix owned by this service (nginx routes `/api/search/*` here).
API_PREFIX = "/api/search"


class Settings(BaseSettings):
    """Validated environment configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- service identity ---------------------------------------------------
    SERVICE_NAME: str = "search-svc"
    SERVICE_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    NODE_ENV: str = "development"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True

    # --- shared -------------------------------------------------------------
    FRONTEND_URL: str = "https://localhost"
    PUBLIC_API_URL: str = "https://localhost/api/v1"
    INTERNAL_SERVICE_TOKEN: str = "change-me-internal-token"

    # --- auth (CONTRACT §5 — verified locally, never over the network) ------
    JWT_ACCESS_SECRET: str = "change-me-access-secret-min-32-chars-long-0000"
    JWT_ISSUER: str = "nawy-api"
    JWT_AUDIENCE: str = "nawy-clients"
    JWT_ALGORITHM: str = "HS256"
    JWT_LEEWAY_SECONDS: int = 10

    # --- elasticsearch ------------------------------------------------------
    ELASTICSEARCH_URL: str = "http://elasticsearch:9200"
    ELASTICSEARCH_USERNAME: str = ""
    ELASTICSEARCH_PASSWORD: str = ""
    ES_INDEX: str = "properties"
    ES_INDEX_VERSION: str = "properties_v1"
    ES_NUMBER_OF_SHARDS: int = 1
    ES_NUMBER_OF_REPLICAS: int = 0
    ES_REQUEST_TIMEOUT: int = 30
    ES_BULK_TIMEOUT: int = 120
    ES_MAX_RETRIES: int = 3
    ES_BULK_CHUNK_SIZE: int = 500
    ES_STARTUP_MAX_WAIT_SECONDS: int = 120

    # --- mongodb (read-only mirror source; owned by api-core) ---------------
    MONGO_URI: str = "mongodb://mongo:27017/nawy"
    MONGO_PROPERTIES_COLLECTION: str = "properties"
    MONGO_TIMEOUT_MS: int = 5000

    # --- redis --------------------------------------------------------------
    REDIS_URL: str = "redis://redis:6379"
    REDIS_TTL_DEFAULT: int = 300
    SEARCH_CACHE_TTL: int = 60
    CACHE_ENABLED: bool = True

    # --- rate limiting (CONTRACT §10.4) ------------------------------------
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_SEARCH_MAX: int = 120
    RATE_LIMIT_SEARCH_WINDOW: int = 60
    RATE_LIMIT_ADMIN_MAX: int = 60
    RATE_LIMIT_ADMIN_WINDOW: int = 60

    # --- media --------------------------------------------------------------
    S3_PUBLIC_BASE_URL: str = "https://nawy-clone-media.s3.eu-central-1.amazonaws.com"
    CLOUDFRONT_DOMAIN: str = ""

    # --- internal service urls ---------------------------------------------
    API_CORE_URL: str = "http://api-core:4000"
    SEARCH_SVC_URL: str = "http://search-svc:8000"

    # --- seed / bootstrap ---------------------------------------------------
    SEED_DIR: str = "/app/seed"
    BOOTSTRAP_ON_STARTUP: bool = True
    BOOTSTRAP_FROM_SEED: bool = True

    # --- pagination (CONTRACT §4) ------------------------------------------
    DEFAULT_PAGE_SIZE: int = Field(default=20, ge=1, le=100)
    MAX_PAGE_SIZE: int = Field(default=100, ge=1, le=1000)

    # ------------------------------------------------------------------ misc

    @field_validator("LOG_LEVEL")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}:
            return "INFO"
        return level

    @field_validator("ELASTICSEARCH_URL", "MONGO_URI", "REDIS_URL", "FRONTEND_URL")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip().rstrip("/") if value.startswith("http") else value.strip()

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"production", "prod", "staging"}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def mongo_db_name(self) -> str:
        """Database name embedded in `MONGO_URI` (defaults to `nawy`)."""
        path = urlparse(self.MONGO_URI).path.lstrip("/")
        name = path.split("?", 1)[0].strip()
        return name or "nawy"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def media_base_url(self) -> str:
        """Public base URL used to expand S3 object keys into browsable URLs."""
        if self.CLOUDFRONT_DOMAIN:
            domain = self.CLOUDFRONT_DOMAIN
            if not domain.startswith("http"):
                domain = f"https://{domain}"
            return domain.rstrip("/")
        return self.S3_PUBLIC_BASE_URL.rstrip("/")

    @property
    def cors_origins(self) -> list[str]:
        """CORS allow-list — `FRONTEND_URL` plus the usual local dev origins."""
        origins = [self.FRONTEND_URL]
        if not self.is_production:
            origins += [
                "https://localhost",
                "http://localhost",
                "http://localhost:3000",
                "https://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        seen: set[str] = set()
        unique: list[str] = []
        for origin in origins:
            cleaned = origin.rstrip("/")
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                unique.append(cleaned)
        return unique

    @property
    def elasticsearch_basic_auth(self) -> tuple[str, str] | None:
        if self.ELASTICSEARCH_USERNAME and self.ELASTICSEARCH_PASSWORD:
            return (self.ELASTICSEARCH_USERNAME, self.ELASTICSEARCH_PASSWORD)
        return None

    def assert_production_ready(self) -> None:
        """Fail fast if placeholder secrets leak into a non-development deploy."""
        if not self.is_production:
            return
        problems: list[str] = []
        if self.JWT_ACCESS_SECRET in PLACEHOLDER_SECRETS or len(self.JWT_ACCESS_SECRET) < 32:
            problems.append("JWT_ACCESS_SECRET must be a real secret of at least 32 characters")
        if self.INTERNAL_SERVICE_TOKEN in PLACEHOLDER_SECRETS:
            problems.append("INTERNAL_SERVICE_TOKEN must not use the placeholder value")
        if problems:
            raise RuntimeError("Insecure configuration: " + "; ".join(problems))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton."""
    return Settings()


settings = get_settings()

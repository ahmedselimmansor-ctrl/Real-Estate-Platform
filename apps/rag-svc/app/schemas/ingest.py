"""Schemas for POST /api/chat/ingest and GET /api/chat/ingest/status/{runId}."""

from __future__ import annotations

from typing import Any, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.ingestion.loaders import DEFAULT_LANGS
from app.ingestion.loaders.base import IngestOptions

IngestSource = Literal["properties", "faq", "compounds", "developers", "areas", "url", "all"]

Language = Literal["en", "ar"]


class IngestRequest(BaseModel):
    """Body of ``POST /api/chat/ingest`` (CONTRACT §6)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source: IngestSource = Field(
        default="all",
        description="Which corpus to (re)ingest. 'all' fans out to every seed-backed source.",
    )
    ids: list[str] = Field(
        default_factory=list,
        max_length=500,
        description="Restrict the run to these record ids/slugs (properties, faq, catalogue).",
    )
    urls: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Pages to fetch when source='url'.",
    )
    langs: list[Language] = Field(
        default_factory=lambda: list(cast(tuple[Language, ...], DEFAULT_LANGS)),
        description="Language variants to render.",
    )
    limit: int | None = Field(
        default=None, ge=1, le=10_000, description="Cap the number of source records."
    )
    force: bool = Field(
        default=False, description="Re-embed even when the document checksum is unchanged."
    )
    prune: bool = Field(
        default=False,
        description="Delete stored documents the source no longer produces (full runs only).",
    )

    @field_validator("ids", "urls", mode="before")
    @classmethod
    def _drop_blanks(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return value

    @field_validator("langs")
    @classmethod
    def _unique_langs(cls, value: list[str]) -> list[str]:
        return [lang for lang in DEFAULT_LANGS if lang in set(value)] or list(DEFAULT_LANGS)

    @model_validator(mode="after")
    def _urls_required_for_url_source(self) -> IngestRequest:
        if self.source == "url" and not self.urls:
            raise ValueError("source='url' requires a non-empty 'urls' array")
        if self.source != "url" and self.urls:
            raise ValueError("'urls' is only valid with source='url'")
        return self

    def to_options(self) -> IngestOptions:
        return IngestOptions(
            ids=list(self.ids),
            urls=list(self.urls),
            langs=tuple(self.langs),
            limit=self.limit,
            force=self.force,
            prune=self.prune,
        )


class IngestAccepted(BaseModel):
    """202 payload — the run id to poll."""

    runId: str
    source: IngestSource
    status: str
    statusUrl: str
    acceptedAt: str


class IngestRunStatus(BaseModel):
    """GET /api/chat/ingest/status/{runId} payload."""

    runId: str
    source: str
    status: str
    stats: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    startedAt: str | None = None
    finishedAt: str | None = None
    corpus: dict[str, int] | None = None

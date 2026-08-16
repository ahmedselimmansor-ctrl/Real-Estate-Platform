"""Schemas for the internal index-administration endpoints."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

IndexSource = Literal["auto", "mongo", "seed"]


class ReindexRequest(BaseModel):
    """Body of `POST /api/search/reindex`.

    * `{"full": true}` (or an empty body) rebuilds the whole index
    * `{"ids": ["..."]}` refreshes only those listings
    * `{"full": true, "zeroDowntime": true}` builds `properties_v2`, swaps the
      alias atomically and drops the old index
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    full: bool = Field(default=False, description="Rebuild every document")
    ids: list[str] | None = Field(default=None, description="Explicit listing ids to refresh")
    zeroDowntime: bool = Field(
        default=False,
        description="Rebuild into a new index version and swap the alias atomically",
    )
    source: IndexSource = Field(
        default="auto",
        description="Where documents are read from (auto falls back to the seed corpus)",
    )
    prune: bool = Field(
        default=True,
        description="Delete documents that the run did not refresh (full runs only)",
    )

    @field_validator("ids")
    @classmethod
    def _clean_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return cleaned or None

    @property
    def is_partial(self) -> bool:
        return bool(self.ids)


class ReindexAccepted(BaseModel):
    """202 payload returned while the run executes in the background."""

    runId: str
    status: str = "queued"
    mode: str = "full"
    source: str = "auto"
    requested: int | None = None
    zeroDowntime: bool = False
    statusUrl: str | None = None


class IndexActionResult(BaseModel):
    """Result of a single-document upsert or delete."""

    id: str
    action: Literal["indexed", "deleted", "not_found"]
    index: str | None = None
    deleted: bool | None = None


class IndexHealth(BaseModel):
    """`GET /api/search/index/health` payload."""

    model_config = ConfigDict(extra="allow")

    ready: bool
    alias: str
    index: str | None = None
    exists: bool = False
    documents: int = 0
    deletedDocuments: int = 0
    sizeBytes: int = 0
    sizeMb: float = 0.0
    health: str = "unknown"
    mappedFields: int = 0
    indexVersion: str | None = None
    mongoDocuments: int | None = None
    lastRun: dict[str, Any] | None = None

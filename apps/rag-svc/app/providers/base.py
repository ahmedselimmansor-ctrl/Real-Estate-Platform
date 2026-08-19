"""Model-provider interfaces.

Everything the service knows about embeddings, reranking and generation is
expressed here. Concrete implementations (DashScope, OpenAI, offline fallbacks)
live next to this module, so swapping a model or an endpoint is an env change —
no call site outside ``app/providers`` performs provider HTTP.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

Role = Literal["system", "user", "assistant", "tool"]


@dataclass(slots=True)
class ChatMessage:
    """A message in the generation request."""

    role: Role
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass(slots=True)
class EmbeddingResult:
    """Vectors plus provider bookkeeping for one embedding call batch."""

    vectors: list[list[float]]
    model: str
    provider: str
    total_tokens: int = 0
    degraded: bool = False

    @property
    def dim(self) -> int:
        return len(self.vectors[0]) if self.vectors else 0


@dataclass(slots=True)
class RerankResult:
    """A reranked candidate, mapped back onto the caller's index."""

    index: int
    score: float


@dataclass(slots=True)
class RerankResponse:
    results: list[RerankResult]
    model: str
    provider: str
    degraded: bool = False


@dataclass(slots=True)
class GenerationUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "promptTokens": self.prompt_tokens,
            "completionTokens": self.completion_tokens,
            "totalTokens": self.total_tokens,
        }


@dataclass(slots=True)
class GenerationResult:
    text: str
    model: str
    provider: str
    usage: GenerationUsage = field(default_factory=GenerationUsage)
    finish_reason: str | None = None
    degraded: bool = False


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Turns text into unit-norm vectors of :attr:`dim` dimensions."""

    name: str
    model: str
    dim: int
    available: bool

    async def embed_documents(self, texts: Sequence[str]) -> EmbeddingResult: ...

    async def embed_query(self, text: str) -> list[float]: ...

    async def aclose(self) -> None: ...


@runtime_checkable
class RerankProvider(Protocol):
    """Scores candidate documents against a query."""

    name: str
    model: str
    available: bool

    async def rerank(self, query: str, documents: Sequence[str], top_n: int) -> RerankResponse: ...

    async def aclose(self) -> None: ...


@runtime_checkable
class GenerationProvider(Protocol):
    """Produces the assistant answer, streaming or buffered."""

    name: str
    model: str
    available: bool

    async def generate(
        self, messages: Sequence[ChatMessage], **options: Any
    ) -> GenerationResult: ...

    def stream(self, messages: Sequence[ChatMessage], **options: Any) -> AsyncIterator[str]: ...

    async def aclose(self) -> None: ...

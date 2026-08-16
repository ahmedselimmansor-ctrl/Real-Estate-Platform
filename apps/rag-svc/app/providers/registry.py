"""Provider bundle: one place that decides *which* implementation is live.

Selection is purely config-driven (presence of ``DASHSCOPE_API_KEY`` /
``OPENAI_API_KEY``), so a missing key degrades the service instead of breaking
it, and switching models or endpoints never touches call sites.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.providers.base import EmbeddingProvider, GenerationProvider, RerankProvider
from app.providers.embeddings import build_embedding_provider
from app.providers.generation import build_generation_provider
from app.providers.rerank import build_rerank_provider

logger = get_logger("rag-svc.providers")


@dataclass(slots=True)
class ProviderBundle:
    """The three model providers used by retrieval and the chat graph."""

    embeddings: EmbeddingProvider
    rerank: RerankProvider
    generation: GenerationProvider

    def describe(self) -> dict[str, dict[str, object]]:
        return {
            "embeddings": {
                "provider": self.embeddings.name,
                "model": self.embeddings.model,
                "dim": self.embeddings.dim,
                "live": self.embeddings.available,
            },
            "rerank": {
                "provider": self.rerank.name,
                "model": self.rerank.model,
                "live": self.rerank.available,
            },
            "generation": {
                "provider": self.generation.name,
                "model": self.generation.model,
                "live": self.generation.available,
            },
        }

    async def aclose(self) -> None:
        for provider in (self.embeddings, self.rerank, self.generation):
            try:
                await provider.aclose()
            except Exception as exc:  # noqa: BLE001 - shutdown must not raise
                logger.warning(
                    "provider_close_failed", provider=provider.name, error=str(exc)
                )


def build_providers(settings: Settings | None = None) -> ProviderBundle:
    """Instantiate the provider bundle for the current configuration."""
    cfg = settings or get_settings()
    bundle = ProviderBundle(
        embeddings=build_embedding_provider(cfg),
        rerank=build_rerank_provider(cfg),
        generation=build_generation_provider(cfg),
    )
    logger.info("providers_ready", **{key: value for key, value in bundle.describe().items()})
    return bundle

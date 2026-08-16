"""Model providers — every provider HTTP call in the service lives here."""

from app.providers.base import (
    ChatMessage,
    EmbeddingProvider,
    EmbeddingResult,
    GenerationProvider,
    GenerationResult,
    GenerationUsage,
    RerankProvider,
    RerankResponse,
    RerankResult,
)
from app.providers.embeddings import (
    DashScopeEmbeddingProvider,
    HashEmbeddingProvider,
    build_embedding_provider,
)
from app.providers.generation import (
    OpenAIGenerationProvider,
    TemplateGenerationProvider,
    build_generation_provider,
)
from app.providers.registry import ProviderBundle, build_providers
from app.providers.rerank import (
    DashScopeRerankProvider,
    LexicalRerankProvider,
    build_rerank_provider,
)

__all__ = [
    "ChatMessage",
    "DashScopeEmbeddingProvider",
    "DashScopeRerankProvider",
    "EmbeddingProvider",
    "EmbeddingResult",
    "GenerationProvider",
    "GenerationResult",
    "GenerationUsage",
    "HashEmbeddingProvider",
    "LexicalRerankProvider",
    "OpenAIGenerationProvider",
    "ProviderBundle",
    "RerankProvider",
    "RerankResponse",
    "RerankResult",
    "TemplateGenerationProvider",
    "build_embedding_provider",
    "build_generation_provider",
    "build_providers",
    "build_rerank_provider",
]

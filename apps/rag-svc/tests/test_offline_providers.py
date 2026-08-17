"""The keyless fallbacks: hash embeddings, BM25 rerank, extractive answers.

These are what keeps `docker compose up` useful with an empty `.env`, so they
are held to the same bar as the real providers: deterministic, correctly shaped
and never raising.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings, get_settings
from app.providers.base import ChatMessage
from app.providers.embeddings import (
    DashScopeEmbeddingProvider,
    HashEmbeddingProvider,
    build_embedding_provider,
    tokenize,
)
from app.providers.generation import (
    OpenAIGenerationProvider,
    TemplateGenerationProvider,
    build_generation_provider,
)
from app.providers.registry import build_providers
from app.providers.rerank import (
    DashScopeRerankProvider,
    LexicalRerankProvider,
    build_rerank_provider,
)
from app.providers.vectors import cosine_similarity, fit_dimension, l2_normalize

POOL_DOC = "Palm Hills New Cairo has a swimming pool, a gym and 24/7 security."
FINANCE_DOC = "The down payment is 10 percent with instalments over eight years."
ARABIC_DOC = "بالم هيلز القاهرة الجديدة به حمام سباحة وجيم وأمن على مدار اليوم."


# --- provider selection ----------------------------------------------------
def test_providers_fall_back_without_api_keys(settings: Settings) -> None:
    assert not settings.dashscope_enabled
    assert not settings.openai_enabled

    bundle = build_providers(settings)
    assert isinstance(bundle.embeddings, HashEmbeddingProvider)
    assert isinstance(bundle.rerank, LexicalRerankProvider)
    assert isinstance(bundle.generation, TemplateGenerationProvider)

    described = bundle.describe()
    assert described["embeddings"]["live"] is False
    assert described["embeddings"]["dim"] == settings.embedding_dim
    assert described["generation"]["live"] is False


def test_providers_select_live_implementations_when_keys_exist() -> None:
    configured = get_settings().model_copy(
        update={"dashscope_api_key": "sk-test", "openai_api_key": "sk-test"}
    )
    assert isinstance(build_embedding_provider(configured), DashScopeEmbeddingProvider)
    assert isinstance(build_rerank_provider(configured), DashScopeRerankProvider)
    assert isinstance(build_generation_provider(configured), OpenAIGenerationProvider)


def test_provider_status_is_configuration_only(settings: Settings) -> None:
    assert settings.provider_status() == {"dashscope": "fallback", "openai": "fallback"}


def test_startup_warnings_mention_every_missing_key(settings: Settings) -> None:
    warnings = " ".join(settings.startup_warnings())
    assert "DASHSCOPE_API_KEY" in warnings
    assert "OPENAI_API_KEY" in warnings


# --- hash embeddings -------------------------------------------------------
async def test_hash_embeddings_are_deterministic_and_normalised(settings: Settings) -> None:
    provider = HashEmbeddingProvider(settings)
    result = await provider.embed_documents([POOL_DOC, FINANCE_DOC, ARABIC_DOC])

    assert result.degraded is True
    assert len(result.vectors) == 3
    for vector in result.vectors:
        assert len(vector) == settings.embedding_dim
        assert sum(value * value for value in vector) == pytest.approx(1.0, abs=1e-5)

    again = await provider.embed_documents([POOL_DOC])
    assert again.vectors[0] == result.vectors[0]


async def test_hash_embeddings_rank_related_text_higher(settings: Settings) -> None:
    provider = HashEmbeddingProvider(settings)
    query = await provider.embed_query("Does the compound have a swimming pool and a gym?")
    related = provider.encode(POOL_DOC)
    unrelated = provider.encode(FINANCE_DOC)
    assert cosine_similarity(query, related) > cosine_similarity(query, unrelated)


async def test_hash_embeddings_handle_empty_and_arabic_text(settings: Settings) -> None:
    provider = HashEmbeddingProvider(settings)
    empty = await provider.embed_query("")
    assert len(empty) == settings.embedding_dim
    assert not any(empty)

    arabic = provider.encode(ARABIC_DOC)
    assert len(arabic) == settings.embedding_dim
    assert any(arabic)


def test_tokenizer_keeps_arabic_and_lowercases_latin() -> None:
    assert tokenize("Palm HILLS") == ["palm", "hills"]
    assert "سباحة" in tokenize(ARABIC_DOC)


def test_vector_helpers() -> None:
    assert l2_normalize([0.0, 0.0]) == [0.0, 0.0]
    assert sum(value**2 for value in l2_normalize([3.0, 4.0])) == pytest.approx(1.0, abs=1e-6)
    assert fit_dimension([1.0, 2.0], 4) == [1.0, 2.0, 0.0, 0.0]
    assert fit_dimension([1.0, 2.0, 3.0], 2) == [1.0, 2.0]
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([], [1.0]) == 0.0


# --- lexical rerank --------------------------------------------------------
async def test_lexical_rerank_orders_by_relevance() -> None:
    provider = LexicalRerankProvider()
    documents = [FINANCE_DOC, POOL_DOC, "Delivery is scheduled for June 2027."]
    response = await provider.rerank("swimming pool and gym", documents, top_n=2)

    assert response.degraded is True
    assert len(response.results) == 2
    assert response.results[0].index == 1
    assert response.results[0].score >= response.results[1].score


async def test_lexical_rerank_handles_no_overlap() -> None:
    provider = LexicalRerankProvider()
    response = await provider.rerank("mortgage rates", [POOL_DOC, FINANCE_DOC], top_n=2)
    assert len(response.results) == 2
    assert all(result.score == 0.0 for result in response.results)


def test_bm25_scores_are_normalised() -> None:
    scores = LexicalRerankProvider().score("pool gym", [POOL_DOC, FINANCE_DOC])
    assert max(scores) == pytest.approx(1.0)
    assert min(scores) >= 0.0
    assert LexicalRerankProvider().score("", [POOL_DOC]) == [0.0]


# --- extractive generation -------------------------------------------------
def _messages(question: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content="You are the TopChoice assistant."),
        ChatMessage(role="user", content=question),
    ]


async def test_template_generation_quotes_the_supplied_sources() -> None:
    provider = TemplateGenerationProvider()
    sources = [
        {"title": "Palm Hills New Cairo", "content": POOL_DOC},
        {"title": "Payment plans", "content": FINANCE_DOC},
    ]
    result = await provider.generate(
        _messages("Does Palm Hills New Cairo have a swimming pool?"), sources=sources
    )

    assert result.degraded is True
    assert result.provider == "offline-extractive"
    assert "swimming pool" in result.text.lower()
    assert result.usage.total_tokens > 0


async def test_template_generation_answers_in_arabic_for_arabic_questions() -> None:
    provider = TemplateGenerationProvider()
    result = await provider.generate(
        _messages("هل يوجد حمام سباحة في بالم هيلز؟"),
        sources=[{"title": "بالم هيلز", "content": ARABIC_DOC}],
    )
    assert "توب تشويس" in result.text


async def test_template_generation_without_sources_explains_the_gap() -> None:
    provider = TemplateGenerationProvider()
    result = await provider.generate(_messages("What is the price of a villa?"))
    assert "could not find" in result.text.lower()


async def test_template_stream_matches_the_buffered_answer() -> None:
    provider = TemplateGenerationProvider()
    messages = _messages("Does Palm Hills New Cairo have a gym?")
    sources = [{"title": "Palm Hills New Cairo", "content": POOL_DOC}]

    buffered = await provider.generate(messages, sources=sources)
    streamed = "".join([piece async for piece in provider.stream(messages, sources=sources)])
    assert streamed == buffered.text

"""Chunker: token budgets, sentence/heading boundaries and overlap."""

from __future__ import annotations

import pytest

from app.core.tokens import TokenCounter, estimate_tokens
from app.ingestion.chunker import TokenAwareChunker, iter_sections, split_sentences

ENGLISH_SENTENCES = [
    f"Unit {index} is a three bedroom apartment in Palm Hills New Cairo priced at "
    f"{7_000_000 + index * 100_000} EGP with a ten percent down payment over eight years."
    for index in range(40)
]

ARABIC_SENTENCES = [
    f"الوحدة رقم {index} شقة ثلاث غرف في بالم هيلز القاهرة الجديدة بسعر "
    f"{7_000_000 + index * 100_000} جنيه بمقدم عشرة بالمئة على ثماني سنوات."
    for index in range(40)
]


def build_chunker(**overrides) -> TokenAwareChunker:
    defaults = {"chunk_tokens": 120, "overlap_tokens": 30, "min_tokens": 10}
    defaults.update(overrides)
    return TokenAwareChunker(**defaults)


# --- sentence splitting ----------------------------------------------------
def test_split_sentences_handles_english_terminators() -> None:
    sentences = split_sentences("First one. Second one! Third one? Fourth.")
    assert sentences == ["First one.", "Second one!", "Third one?", "Fourth."]


def test_split_sentences_handles_arabic_question_mark() -> None:
    sentences = split_sentences("ما هو المقدم؟ المقدم عشرة بالمئة. التقسيط ثماني سنوات.")
    assert len(sentences) == 3
    assert sentences[0].endswith("؟")


def test_split_sentences_collapses_whitespace() -> None:
    assert split_sentences("  a   b  \t c  ") == ["a b c"]


# --- section boundaries ----------------------------------------------------
def test_iter_sections_tracks_heading_path() -> None:
    text = "# Guide\nIntro sentence here.\n## Payment\nDown payment is ten percent."
    sections = list(iter_sections(text))
    assert [path for path, _ in sections] == [("Guide",), ("Guide", "Payment")]
    assert sections[1][1] == ["Down payment is ten percent."]


def test_headings_are_hard_chunk_boundaries() -> None:
    text = "# Alpha\nSentence about alpha.\n# Beta\nSentence about beta."
    chunks = build_chunker().split(text)
    assert len(chunks) == 2
    assert chunks[0].heading == "Alpha"
    assert chunks[1].heading == "Beta"
    assert "beta" not in chunks[0].content.lower()
    assert chunks[0].content.startswith("Alpha")  # heading path is prepended


def test_ordinals_are_sequential_and_zero_based() -> None:
    chunks = build_chunker().split(" ".join(ENGLISH_SENTENCES))
    assert [chunk.ordinal for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk.metadata["ordinal"] == chunk.ordinal for chunk in chunks)


# --- budgets ---------------------------------------------------------------
@pytest.mark.parametrize("sentences", [ENGLISH_SENTENCES, ARABIC_SENTENCES])
def test_every_chunk_respects_the_token_budget(sentences: list[str]) -> None:
    chunker = build_chunker()
    chunks = chunker.split(" ".join(sentences))
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_count <= chunker.chunk_tokens
        assert chunk.content.strip()


def test_overlap_repeats_trailing_sentences() -> None:
    chunker = build_chunker(chunk_tokens=120, overlap_tokens=60)
    chunks = chunker.split(" ".join(ENGLISH_SENTENCES))
    assert len(chunks) > 2

    for previous, current in zip(chunks, chunks[1:], strict=False):
        previous_sentences = set(split_sentences(previous.content))
        current_sentences = set(split_sentences(current.content))
        assert previous_sentences & current_sentences, "adjacent chunks must overlap"


def test_zero_overlap_produces_disjoint_chunks() -> None:
    chunker = build_chunker(chunk_tokens=120, overlap_tokens=0)
    chunks = chunker.split(" ".join(ENGLISH_SENTENCES))
    for previous, current in zip(chunks, chunks[1:], strict=False):
        assert not set(split_sentences(previous.content)) & set(split_sentences(current.content))


def test_overlap_is_clamped_below_half_the_budget() -> None:
    chunker = TokenAwareChunker(chunk_tokens=100, overlap_tokens=500, min_tokens=10)
    assert chunker.overlap_tokens <= chunker.chunk_tokens // 2


def test_oversized_sentence_is_hard_split_on_word_boundaries() -> None:
    sentence = " ".join(["word"] * 600) + "."
    chunker = build_chunker(chunk_tokens=64, overlap_tokens=8)
    chunks = chunker.split(sentence)
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_count <= chunker.chunk_tokens
    assert all(part == "word" or part == "word." for part in chunks[0].content.split())


def test_short_document_is_a_single_chunk() -> None:
    chunks = build_chunker().split("A short listing description in New Cairo.")
    assert len(chunks) == 1
    assert chunks[0].ordinal == 0


def test_empty_document_produces_no_chunks() -> None:
    assert build_chunker().split("") == []
    assert build_chunker().split("   \n\n  ") == []


# --- metadata + determinism ------------------------------------------------
def test_metadata_is_copied_into_every_chunk() -> None:
    metadata = {"type": "property", "propertyId": "abc", "price": 8_500_000}
    chunks = build_chunker().split(" ".join(ENGLISH_SENTENCES), metadata=metadata)
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.metadata["type"] == "property"
        assert chunk.metadata["propertyId"] == "abc"
        assert chunk.metadata["price"] == 8_500_000
    # The caller's dict must not be mutated with per-chunk keys.
    assert "ordinal" not in metadata


def test_chunking_is_deterministic() -> None:
    text = " ".join(ENGLISH_SENTENCES)
    first = build_chunker().split(text)
    second = build_chunker().split(text)
    assert [chunk.content for chunk in first] == [chunk.content for chunk in second]


# --- token counting --------------------------------------------------------
def test_estimate_tokens_is_script_aware() -> None:
    assert estimate_tokens("") == 0
    latin = estimate_tokens("a" * 400)
    arabic = estimate_tokens("ا" * 400)
    assert arabic > latin > 0


def test_token_counter_truncates_to_budget(token_counter: TokenCounter) -> None:
    text = " ".join(ENGLISH_SENTENCES)
    truncated = token_counter.truncate(text, 50)
    assert token_counter.count(truncated) <= 50
    assert truncated
    assert token_counter.truncate(text, 0) == ""

"""Reciprocal Rank Fusion ordering, weighting and tie-breaking."""

from __future__ import annotations

import pytest

from app.retrieval.fusion import rank_positions, reciprocal_rank_fusion


def keys(fused: list[tuple[str, float]]) -> list[str]:
    return [key for key, _ in fused]


def test_empty_input_returns_empty_list() -> None:
    assert reciprocal_rank_fusion([]) == []
    assert reciprocal_rank_fusion([[], []]) == []


def test_single_ranking_preserves_order() -> None:
    fused = reciprocal_rank_fusion([["a", "b", "c"]], k=60)
    assert keys(fused) == ["a", "b", "c"]
    assert fused[0][1] > fused[1][1] > fused[2][1]


def test_document_in_both_rankings_outranks_a_single_list_leader() -> None:
    vector = ["a", "shared", "c"]
    lexical = ["d", "shared", "f"]
    fused = reciprocal_rank_fusion([vector, lexical], k=60)
    assert keys(fused)[0] == "shared"
    # "shared" is 2nd in both: 2 * 1/62 > 1/61 (the leaders of each list).
    assert fused[0][1] == pytest.approx(2 / 62)


def test_scores_use_the_rrf_formula() -> None:
    fused = dict(reciprocal_rank_fusion([["a", "b"], ["b"]], k=10))
    assert fused["a"] == pytest.approx(1 / 11)
    assert fused["b"] == pytest.approx(1 / 12 + 1 / 11)


def test_weights_bias_towards_a_ranking() -> None:
    vector = ["v", "shared"]
    lexical = ["l", "shared"]

    balanced = keys(reciprocal_rank_fusion([vector, lexical], k=1, weights=[1.0, 1.0]))
    assert balanced[0] == "shared"

    vector_heavy = keys(reciprocal_rank_fusion([vector, lexical], k=1, weights=[8.0, 0.1]))
    assert vector_heavy[0] == "v"
    assert vector_heavy.index("shared") < vector_heavy.index("l")


def test_zero_weight_ranking_is_ignored() -> None:
    fused = dict(reciprocal_rank_fusion([["a"], ["b"]], k=60, weights=[1.0, 0.0]))
    assert fused["a"] > 0
    assert fused["b"] == 0.0


def test_duplicate_ids_within_one_ranking_are_counted_once() -> None:
    fused = dict(reciprocal_rank_fusion([["a", "a", "b"]], k=60))
    assert fused["a"] == pytest.approx(1 / 61)
    assert fused["b"] == pytest.approx(1 / 62)


def test_ties_break_on_best_rank_then_first_appearance() -> None:
    # Both appear once at rank 1 of their own ranking -> identical scores.
    fused = reciprocal_rank_fusion([["first"], ["second"]], k=60)
    assert fused[0][1] == pytest.approx(fused[1][1])
    assert keys(fused) == ["first", "second"]


def test_mismatched_weight_count_is_rejected() -> None:
    with pytest.raises(ValueError, match="one entry per ranking"):
        reciprocal_rank_fusion([["a"], ["b"]], weights=[1.0])


def test_fusion_is_deterministic() -> None:
    rankings = [["a", "b", "c", "d"], ["d", "c", "x", "a"]]
    assert reciprocal_rank_fusion(rankings) == reciprocal_rank_fusion(rankings)


def test_rank_positions_are_one_based_and_first_wins() -> None:
    assert rank_positions(["a", "b", "a"]) == {"a": 1, "b": 2}
    assert rank_positions([]) == {}

"""The LangGraph state passed between nodes.

A ``TypedDict`` with ``total=False`` so every node can return a partial update
and LangGraph merges it, while type checkers still catch typos in key names.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

Route = Literal["smalltalk", "knowledge", "listing_search", "web", "handoff"]

#: How many rewrite → retrieve → grade loops a single turn may run.
MAX_ITERATIONS = 2


class GraphState(TypedDict, total=False):
    """Everything one chat turn accumulates."""

    # --- input -----------------------------------------------------------
    #: The user's raw message this turn.
    question: str
    #: Prior turns as ``{"role", "content"}`` dicts, oldest first.
    messages: list[dict[str, str]]
    thread_id: str | None
    user_id: str | None
    user_name: str | None
    user_email: str | None
    access_token: str | None
    request_id: str | None
    locale: str

    # --- memory ----------------------------------------------------------
    #: Rolling LLM summary of everything older than the memory window.
    summary: str | None
    #: Inferred cross-thread preferences (budget, areas, property type).
    profile: dict[str, Any]

    # --- routing / rewriting ---------------------------------------------
    route: Route
    route_confidence: float
    #: History-aware standalone query used for retrieval.
    rewritten_query: str
    #: Structured filters parsed out of the question (budget, bedrooms, area).
    filters: dict[str, Any]

    # --- retrieval -------------------------------------------------------
    #: Reranked chunks, already trimmed to ``RAG_RERANK_TOP_N``.
    retrieved: list[dict[str, Any]]
    #: Citation cards for the SSE ``sources`` event.
    sources: list[dict[str, Any]]
    context_sufficient: bool
    grade_reason: str
    needs_web: bool
    retrieval_stats: dict[str, Any]

    # --- tools -----------------------------------------------------------
    tool_results: list[dict[str, Any]]
    #: Set when the user has explicitly confirmed a side-effecting tool.
    confirmed: bool

    # --- output ----------------------------------------------------------
    answer: str
    #: Blocked by the guard — `answer` already holds the canned reply.
    guarded: bool
    degraded: bool
    iteration: int
    error: str | None
    usage: dict[str, int]


def initial_state(
    *,
    question: str,
    messages: list[dict[str, str]] | None = None,
    thread_id: str | None = None,
    user_id: str | None = None,
    user_name: str | None = None,
    user_email: str | None = None,
    access_token: str | None = None,
    request_id: str | None = None,
    locale: str = "en",
) -> GraphState:
    """Build the state a turn starts from, with every collection non-None."""
    return GraphState(
        question=question,
        messages=messages or [],
        thread_id=thread_id,
        user_id=user_id,
        user_name=user_name,
        user_email=user_email,
        access_token=access_token,
        request_id=request_id,
        locale=locale,
        summary=None,
        profile={},
        route="knowledge",
        route_confidence=0.0,
        rewritten_query=question,
        filters={},
        retrieved=[],
        sources=[],
        context_sufficient=False,
        grade_reason="",
        needs_web=False,
        retrieval_stats={},
        tool_results=[],
        confirmed=False,
        answer="",
        guarded=False,
        degraded=False,
        iteration=0,
        error=None,
        usage={},
    )


__all__ = ["MAX_ITERATIONS", "GraphState", "Route", "initial_state"]

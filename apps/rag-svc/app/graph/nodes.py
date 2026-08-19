"""The chat agent's nodes.

Each function takes the :class:`~app.graph.state.GraphState` and returns a
partial update. They are written as plain async functions with their
dependencies injected through :class:`NodeDeps`, so every one is unit-testable
without LangGraph and without network access.

Flow (see ``builder.py`` for the wiring):

    guard ─► route ─┬─ smalltalk ──────────────────────────────► generate
                    ├─ knowledge ─► rewrite ─► retrieve ─► rerank
                    │                  ▲                    │
                    │                  └── grade (retry ≤2) ─┤
                    │                                        ├─► generate
                    ├─ listing_search ─► call_tools ─────────┤
                    ├─ web ───────────► call_tools ──────────┤
                    └─ handoff ───────► call_tools ──────────┘
                                                              └─► persist ─► END
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.graph.prompts import (
    GRADE_PROMPT,
    REWRITE_PROMPT,
    ROUTE_VALUES,
    ROUTER_PROMPT,
    SMALLTALK_PROMPT,
    build_system_prompt,
    detect_locale,
    format_context_block,
    format_history,
    format_tool_block,
    guard_reply,
    keyword_route,
    looks_like_injection,
    looks_out_of_scope,
)
from app.graph.state import MAX_ITERATIONS, GraphState
from app.memory.thread_memory import MemoryStore
from app.providers.base import ChatMessage as ProviderMessage
from app.providers.registry import ProviderBundle
from app.retrieval.hybrid_search import HybridSearcher
from app.tools.base import ToolContext
from app.tools.registry import ToolRegistry

logger = get_logger("rag-svc.graph")

#: Longest user message accepted. Anything more is a paste, not a question.
MAX_QUESTION_CHARS = 4000

#: Phrases that count as the user confirming a side-effecting tool.
CONFIRMATION_PATTERNS = (
    "yes",
    "yes please",
    "go ahead",
    "please do",
    "book it",
    "confirm",
    "that's right",
    "correct",
    "sure",
    "ok",
    "okay",
    "نعم",
    "أيوة",
    "ايوه",
    "تمام",
    "موافق",
    "احجز",
    "أكيد",
)


@dataclass(slots=True)
class NodeDeps:
    """Collaborators the nodes need. Swapped for fakes in tests."""

    providers: ProviderBundle
    retriever: HybridSearcher
    tools: ToolRegistry
    memory: MemoryStore
    settings: Settings

    @classmethod
    def build(
        cls,
        providers: ProviderBundle,
        retriever: HybridSearcher,
        tools: ToolRegistry,
        memory: MemoryStore,
        settings: Settings | None = None,
    ) -> NodeDeps:
        return cls(
            providers=providers,
            retriever=retriever,
            tools=tools,
            memory=memory,
            settings=settings or get_settings(),
        )


# --------------------------------------------------------------------- utils


def _extract_json(text: str) -> dict[str, Any]:
    """Best-effort JSON object out of a model reply that may wrap it in prose."""
    candidate = (text or "").strip()

    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?|```$", "", candidate, flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", candidate, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    return {}


def _is_confirmation(text: str) -> bool:
    normalised = " ".join((text or "").lower().split()).strip(" .!؟?")
    return normalised in CONFIRMATION_PATTERNS or normalised.startswith(
        ("yes ", "yes,", "نعم", "أيوة", "ايوه")
    )


# --------------------------------------------------------------------- nodes


async def load_memory(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Pull the recent window, rolling summary and buyer profile for the thread."""
    memory = await deps.memory.load(state.get("thread_id"))
    question = state.get("question", "")

    return {
        "messages": memory.messages,
        "summary": memory.summary,
        "profile": deps.memory.update_profile(memory.profile, question),
        "locale": state.get("locale") or detect_locale(question),
        "confirmed": _is_confirmation(question),
    }


async def guard(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Cheap input checks before anything expensive runs."""
    question = (state.get("question") or "").strip()
    locale = state.get("locale", "en")

    if not question:
        return {
            "guarded": True,
            "answer": guard_reply(locale),
            "error": "EMPTY_MESSAGE",
        }

    if len(question) > MAX_QUESTION_CHARS:
        return {
            "guarded": True,
            "answer": (
                "That message is too long for me to read reliably — could you ask it "
                "in a sentence or two?"
                if locale != "ar"
                else "الرسالة طويلة جدًا — من فضلك اسأل في جملة أو اثنتين."
            ),
            "error": "MESSAGE_TOO_LONG",
        }

    if looks_like_injection(question):
        logger.warning(
            "prompt_injection_blocked",
            thread_id=state.get("thread_id"),
            preview=question[:120],
        )
        return {"guarded": True, "answer": guard_reply(locale)}

    # A support agent declines what it is not for, rather than retrieving
    # property FAQs at someone asking about a headache.
    if looks_out_of_scope(question):
        logger.info(
            "out_of_scope_declined",
            thread_id=state.get("thread_id"),
            preview=question[:120],
        )
        return {"guarded": True, "answer": guard_reply(locale)}

    return {"guarded": False}


async def route(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Classify the turn. Falls back to keywords when generation is unavailable."""
    question = state.get("question", "")

    if not deps.providers.generation.available:
        selected = keyword_route(question)
        return {"route": selected, "route_confidence": 0.35}

    history = format_history(state.get("messages", []), limit=4)
    user_content = (
        f"Conversation so far:\n{history or '(new conversation)'}\n\n"
        f"Latest message:\n{question}"
    )

    try:
        result = await deps.providers.generation.generate(
            [
                ProviderMessage(role="system", content=ROUTER_PROMPT),
                ProviderMessage(role="user", content=user_content),
            ],
            max_tokens=60,
        )
        parsed = _extract_json(result.text)
        selected = str(parsed.get("route", "")).strip()
        confidence = float(parsed.get("confidence", 0.5) or 0.5)
    except Exception as exc:
        logger.warning("route_failed", error=str(exc))
        return {"route": keyword_route(question), "route_confidence": 0.3}

    if selected not in ROUTE_VALUES:
        selected = keyword_route(question)
        confidence = min(confidence, 0.4)

    logger.info("routed", route=selected, confidence=round(confidence, 2))
    return {"route": selected, "route_confidence": confidence}


async def rewrite_query(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Turn a follow-up into a standalone query and extract structured filters."""
    question = state.get("question", "")
    history = state.get("messages", [])

    rewritten = question

    # Only worth a model call when there is history to resolve against.
    if history and deps.providers.generation.available:
        try:
            result = await deps.providers.generation.generate(
                [
                    ProviderMessage(role="system", content=REWRITE_PROMPT),
                    ProviderMessage(
                        role="user",
                        content=(
                            f"Conversation so far:\n{format_history(history, limit=6)}\n\n"
                            f"Latest message:\n{question}"
                        ),
                    ),
                ],
                max_tokens=120,
            )
            candidate = (result.text or "").strip().strip('"')
            # Guard against a model that "helpfully" answers instead of rewriting.
            if candidate and len(candidate) <= max(240, len(question) * 6):
                rewritten = candidate
        except Exception as exc:
            logger.warning("rewrite_failed", error=str(exc))

    from app.retrieval.filters import parse_query_filters

    filters = parse_query_filters(rewritten)

    logger.info(
        "query_rewritten",
        changed=rewritten != question,
        chars=len(rewritten),
        filters={k: v for k, v in filters.as_dict().items() if v},
    )

    return {"rewritten_query": rewritten, "filters": filters.as_dict()}


async def retrieve(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Hybrid search (pgvector + full text → RRF) with metadata prefilters."""
    query = state.get("rewritten_query") or state.get("question", "")

    result = await deps.retriever.search(query, rerank=True)

    return {
        "retrieved": [
            {
                "chunkId": chunk.chunk_id,
                "documentId": chunk.document_id,
                "content": chunk.content,
                "title": chunk.title,
                "uri": chunk.uri,
                "sourceType": chunk.source_type,
                "sourceId": chunk.source_id,
                "score": chunk.score,
                "metadata": chunk.metadata,
            }
            for chunk in result.chunks
        ],
        "sources": result.as_sources(),
        "retrieval_stats": result.describe(),
        "degraded": result.degraded,
        "iteration": state.get("iteration", 0) + 1,
    }


async def grade_context(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Decide whether the retrieved context can actually answer the question."""
    retrieved = state.get("retrieved", [])

    if not retrieved:
        return {
            "context_sufficient": False,
            "grade_reason": "nothing retrieved",
            "needs_web": True,
        }

    if not deps.providers.generation.available:
        # Without a judge, trust retrieval: the reranker already filtered.
        return {"context_sufficient": True, "grade_reason": "grading unavailable"}

    context = format_context_block(
        [{"title": item["title"], "content": item["content"][:800]} for item in retrieved]
    )

    try:
        result = await deps.providers.generation.generate(
            [
                ProviderMessage(role="system", content=GRADE_PROMPT),
                ProviderMessage(
                    role="user",
                    content=(
                        f"QUESTION:\n{state.get('rewritten_query') or state.get('question')}\n\n"
                        f"{context}"
                    ),
                ),
            ],
            max_tokens=80,
        )
        parsed = _extract_json(result.text)
        sufficient = bool(parsed.get("sufficient", True))
        reason = str(parsed.get("reason", ""))[:120]
    except Exception as exc:
        logger.warning("grade_failed", error=str(exc))
        return {"context_sufficient": True, "grade_reason": "grading errored"}

    logger.info("context_graded", sufficient=sufficient, reason=reason)

    return {
        "context_sufficient": sufficient,
        "grade_reason": reason,
        # Only escalate to the web once the retry budget is spent.
        "needs_web": not sufficient and state.get("iteration", 0) >= MAX_ITERATIONS,
    }


#: Profile keys that describe *what* the buyer wants, so they survive a
#: follow-up. `statedPrice` is deliberately absent: it is a financing figure,
#: not a listing filter, and carrying it would cap every later search.
_CARRIED_FILTER_KEYS = frozenset(
    {"minPrice", "maxPrice", "bedrooms", "propertyType", "area", "areaId", "compound"}
)


async def call_tools(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Let the model pick tools for this route, then execute what it asked for."""
    selected_route = state.get("route", "knowledge")
    question = state.get("rewritten_query") or state.get("question", "")

    # `listing_search`, `web` and `handoff` reach this node straight from
    # `classify`, skipping `rewrite_query` where filters are normally parsed.
    # Without this the one route that most needs budget/bedroom/area filters
    # would arrive with none of them.
    filters = state.get("filters") or {}
    if not filters and question:
        from app.retrieval.filters import parse_query_filters

        filters = parse_query_filters(question).as_dict()

    # Overlay this turn on what the buyer already told us, so "what about
    # townhouses instead?" keeps the area and the budget from two turns ago
    # rather than searching all of Egypt.
    profile = state.get("profile") or {}
    if profile:
        carried = {
            key: value
            for key, value in profile.items()
            if key in _CARRIED_FILTER_KEYS and value not in (None, "", [], {})
        }
        this_turn = {
            key: value for key, value in filters.items() if value not in (None, "", [], {})
        }
        filters = {**carried, **this_turn}

    state = {**state, "filters": filters}

    schemas = deps.tools.schemas(selected_route)
    if not schemas:
        return {"tool_results": state.get("tool_results", [])}

    context = ToolContext(
        thread_id=state.get("thread_id"),
        user_id=state.get("user_id"),
        user_name=state.get("user_name"),
        user_email=state.get("user_email"),
        locale=state.get("locale", "en"),
        access_token=state.get("access_token"),
        request_id=state.get("request_id"),
        confirmed=bool(state.get("confirmed")),
    )

    requests = await _plan_tool_calls(state, deps, schemas, question, selected_route)

    results: list[dict[str, Any]] = list(state.get("tool_results", []))
    sources: list[dict[str, Any]] = list(state.get("sources", []))

    for request in requests:
        result = await deps.tools.invoke(
            request.get("name", ""), request.get("arguments", {}), context
        )
        results.append(result.as_dict())
        sources.extend(result.sources)

    # The next turn needs to know what this one did: "and over 10 years?"
    # carries no financing word of its own and is only a mortgage question
    # because the turn before it was.
    used = [request.get("name", "") for request in requests if request.get("name")]
    next_profile = {**profile, "lastTools": used}

    return {
        "tool_results": results,
        "sources": sources,
        "filters": filters,
        "profile": next_profile,
    }


async def _plan_tool_calls(
    state: GraphState,
    deps: NodeDeps,
    schemas: list[dict[str, Any]],
    question: str,
    selected_route: str,
) -> list[dict[str, Any]]:
    """Ask the model which tools to run; fall back to a sensible default."""
    if not deps.providers.generation.available:
        return _default_tool_calls(state, selected_route, question)

    instruction = (
        "Decide which tools to call to answer the user. Respond with a JSON object "
        '{"calls": [{"name": "<tool>", "arguments": {…}}]} and nothing else. '
        "Return an empty list if no tool is needed. Never invent contact details."
    )
    catalogue = "\n".join(
        f"- {schema['function']['name']}: {schema['function']['description']}\n"
        f"  parameters: {json.dumps(schema['function']['parameters'].get('properties', {}))}"
        for schema in schemas
    )

    try:
        result = await deps.providers.generation.generate(
            [
                ProviderMessage(role="system", content=f"{instruction}\n\nTools:\n{catalogue}"),
                ProviderMessage(
                    role="user",
                    content=(
                        f"Conversation:\n{format_history(state.get('messages', []), limit=4)}\n\n"
                        f"Latest message:\n{question}"
                    ),
                ),
            ],
            max_tokens=300,
        )
        parsed = _extract_json(result.text)
        calls = parsed.get("calls", [])
    except Exception as exc:
        logger.warning("tool_planning_failed", error=str(exc))
        return _default_tool_calls(state, selected_route, question)

    allowed = {schema["function"]["name"] for schema in schemas}
    planned = [call for call in calls if isinstance(call, dict) and call.get("name") in allowed][:3]

    return planned or _default_tool_calls(state, selected_route, question)


_YEARS_RE = re.compile(
    r"(\d{1,2})\s*(?:years?|yrs?|\u0633\u0646\u0629|\u0633\u0646\u0648\u0627\u062a)", re.IGNORECASE
)
#: A follow-up that only restates the repayment term, e.g. "and over 10 years?"
_TERM_ONLY_RE = re.compile(
    r"(?:and|what about|\u0648|\u0645\u0627\u0630\u0627 \u0639\u0646)?\s*"
    r"(?:over|for|\u0639\u0644\u0649|\u0644\u0645\u062f\u0629)?\s*"
    r"\d{1,2}\s*(?:years?|yrs?|\u0633\u0646\u0629|\u0633\u0646\u0648\u0627\u062a)\s*\??",
    re.IGNORECASE,
)

_MORTGAGE_TERMS = (
    "monthly",
    "per month",
    "instal",
    "mortgage",
    "repay",
    "afford",
    "down payment",
    "payment plan",
    "\u0634\u0647\u0631\u064a",
    "\u0642\u0633\u0637",
    "\u062a\u0642\u0633\u064a\u0637",
    "\u0645\u0642\u062f\u0645",
)


def _mortgage_arguments(
    question: str, filters: dict[str, Any], profile: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    """Arguments for `calculate_mortgage`, or None when this is not that ask."""
    normalised = " ".join((question or "").lower().split())
    profile = profile or {}

    if not any(term in normalised for term in _MORTGAGE_TERMS):
        # No financing word. Still a mortgage turn if the last one was and this
        # message does nothing but change the term ("and over 10 years?").
        followed_on = "calculate_mortgage" in (profile.get("lastTools") or [])
        if not (followed_on and _TERM_ONLY_RE.fullmatch(normalised)):
            return None

    from app.retrieval.filters import parse_stated_amount

    # This turn first, then what the buyer already told us: "and over 10 years?"
    # carries no figure of its own but is plainly still about the same amount.
    price = (
        parse_stated_amount(normalised)
        or filters.get("maxPrice")
        or filters.get("minPrice")
        or (profile or {}).get("statedPrice")
    )
    if not price:
        return None

    arguments: dict[str, Any] = {"price": int(price)}
    years = _YEARS_RE.search(normalised)
    if years:
        term = int(years.group(1))
        if 1 <= term <= 30:
            arguments["years"] = term
    return arguments


def wants_mortgage_calculation(state: GraphState) -> bool:
    """True when the turn is arithmetic the retriever cannot do."""
    question = state.get("rewritten_query") or state.get("question", "")
    return (
        _mortgage_arguments(
            question, state.get("filters", {}) or {}, state.get("profile", {}) or {}
        )
        is not None
    )


def _default_tool_calls(
    state: GraphState, selected_route: str, question: str
) -> list[dict[str, Any]]:
    """Deterministic tool choice used when the planner is unavailable."""
    filters = state.get("filters", {}) or {}

    if selected_route == "listing_search":
        arguments: dict[str, Any] = {"limit": 5}
        if filters.get("minPrice"):
            arguments["minPrice"] = filters["minPrice"]
        if filters.get("maxPrice"):
            arguments["maxPrice"] = filters["maxPrice"]
        if filters.get("bedrooms") is not None:
            arguments["bedrooms"] = filters["bedrooms"]
        if filters.get("propertyType"):
            arguments["propertyType"] = filters["propertyType"]
        if filters.get("area"):
            arguments["areaName"] = filters["area"]
        if filters.get("compound"):
            arguments["compoundName"] = filters["compound"]

        # Only fall back to the raw sentence when nothing structured came out
        # of it. "Show me 4 bedroom villas under 30 million" as a text query
        # matches no listing verbatim and buries the filters that would.
        if len(arguments) == 1:
            arguments["query"] = question
        return [{"name": "search_listings", "arguments": arguments}]

    # The `knowledge` route may also reach `calculate_mortgage`. Offline there
    # is no planner to notice that, so a question carrying a price and a term
    # gets the calculation rather than a generic financing FAQ.
    if selected_route == "knowledge":
        mortgage = _mortgage_arguments(question, filters, state.get("profile", {}) or {})
        if mortgage:
            return [{"name": "calculate_mortgage", "arguments": mortgage}]
        return []

    if selected_route == "web":
        return [{"name": "web_search", "arguments": {"query": question}}]

    if selected_route == "handoff":
        return [
            {
                "name": "escalate_to_human",
                "arguments": {"reason": "user requested a human", "summary": question[:500]},
            }
        ]

    return []


def answer_sources(state: GraphState) -> list[dict[str, Any]]:
    """Grounding material for this turn, as `{title, content}` records.

    Retrieved chunks *and* tool output both count: on the `listing_search`,
    `web` and `handoff` routes nothing is retrieved, so passing only
    `state["retrieved"]` left the offline provider with no passages and it
    answered "I could not find anything" while citing five sources.
    """
    records: list[dict[str, Any]] = [
        {"title": item.get("title", ""), "content": item.get("content", "")}
        for item in state.get("retrieved", [])
        if item.get("content")
    ]

    for result in state.get("tool_results", []):
        summary = result.get("summary")
        if result.get("ok") and summary:
            records.append({"title": str(result.get("name", "tool")), "content": str(summary)})

    return records


def build_generation_messages(state: GraphState) -> list[ProviderMessage]:
    """Assemble the exact message list sent to the generation model.

    Exposed separately so the streaming route can reuse it verbatim — the
    streamed answer and the buffered one must come from the same prompt.
    """
    selected_route = state.get("route", "knowledge")
    locale = state.get("locale", "en")
    sources = state.get("sources", [])
    tool_results = state.get("tool_results", [])
    has_context = bool(sources or tool_results)

    if selected_route == "smalltalk":
        system = (
            f"{build_system_prompt(locale=locale, include_few_shot=False)}\n\n{SMALLTALK_PROMPT}"
        )
    else:
        system = build_system_prompt(locale=locale, has_context=has_context)

    messages: list[ProviderMessage] = [ProviderMessage(role="system", content=system)]
    messages.extend(MemoryStore.as_prompt_messages(state))

    blocks: list[str] = []
    if state.get("retrieved"):
        blocks.append(
            format_context_block(
                [
                    {
                        "title": item.get("title"),
                        "content": item.get("content"),
                        "uri": item.get("uri"),
                    }
                    for item in state["retrieved"]
                ]
            )
        )
    if tool_results:
        blocks.append(format_tool_block(tool_results))

    user_content = state.get("question", "")
    if blocks:
        user_content = "\n\n".join(blocks) + f"\n\nQUESTION: {user_content}"

    messages.append(ProviderMessage(role="user", content=user_content))
    return messages


async def generate(state: GraphState, deps: NodeDeps) -> dict[str, Any]:
    """Produce the final answer (buffered — the SSE route streams the same prompt)."""
    if state.get("guarded"):
        return {"answer": state.get("answer", "")}

    started = time.perf_counter()
    messages = build_generation_messages(state)

    try:
        result = await deps.providers.generation.generate(
            messages,
            # `sources` is what the offline extractive provider reads; the
            # OpenAI provider ignores unknown options.
            sources=answer_sources(state),
            question=state.get("question", ""),
        )
    except Exception as exc:
        logger.error("generation_failed", error=str(exc))
        return {
            "answer": (
                "Sorry — I could not put together an answer just then. Please try again."
                if state.get("locale") != "ar"
                else "عذرًا، لم أتمكن من تكوين إجابة الآن. من فضلك حاول مرة أخرى."
            ),
            "error": "GENERATION_FAILED",
        }

    logger.info(
        "generated",
        provider=result.provider,
        model=result.model,
        degraded=result.degraded,
        latency_ms=round((time.perf_counter() - started) * 1000, 2),
    )

    return {
        "answer": result.text,
        "degraded": state.get("degraded", False) or result.degraded,
        "usage": result.usage.as_dict(),
    }


__all__ = [
    "MAX_QUESTION_CHARS",
    "NodeDeps",
    "answer_sources",
    "build_generation_messages",
    "call_tools",
    "generate",
    "grade_context",
    "guard",
    "load_memory",
    "retrieve",
    "rewrite_query",
    "route",
]

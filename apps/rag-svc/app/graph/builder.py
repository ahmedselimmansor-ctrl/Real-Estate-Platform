"""Assembles the LangGraph agent and exposes it as :class:`ChatAgent`.

The graph is the decision structure; :class:`ChatAgent` is what the HTTP layer
talks to. It offers two entry points that share **exactly** the same prompt
construction:

* :meth:`ChatAgent.answer` — buffered, returns the whole reply.
* :meth:`ChatAgent.stream` — runs every node up to generation, then streams
  tokens, emitting the CONTRACT §6 SSE events along the way.

LangGraph is optional at runtime: if the package is missing the same nodes run
through a small sequential fallback, so the service still answers.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.repositories.chat import ChatRepository
from app.graph import nodes as node_module
from app.graph.nodes import NodeDeps, answer_sources, build_generation_messages
from app.graph.state import MAX_ITERATIONS, GraphState, initial_state
from app.memory.thread_memory import MemoryStore
from app.providers.registry import ProviderBundle
from app.retrieval.hybrid_search import HybridSearcher
from app.tools.registry import ToolRegistry, build_tool_registry

logger = get_logger("rag-svc.graph.builder")

try:  # pragma: no cover - exercised by the import, not by tests
    from langgraph.graph import END, START, StateGraph

    LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover
    LANGGRAPH_AVAILABLE = False
    END = START = None  # type: ignore[assignment]
    StateGraph = None  # type: ignore[assignment]


# ------------------------------------------------------------------- routing


def _after_guard(state: GraphState) -> str:
    return "end" if state.get("guarded") else "route"


def _after_route(state: GraphState) -> str:
    """Map the classified route onto the next node."""
    selected = state.get("route", "knowledge")

    if selected == "smalltalk":
        return "generate"
    if selected == "knowledge":
        # A calculation is arithmetic, not a lookup. Retrieval answers "how do
        # instalments work" with financing prose when the user asked for a
        # number, so the arithmetic goes to the tools instead.
        if node_module.wants_mortgage_calculation(state):
            return "call_tools"
        return "rewrite_query"
    # listing_search, web and handoff are all tool-first.
    return "call_tools"


def _after_grade(state: GraphState) -> str:
    """Retry retrieval once or twice, then fall through to tools or generation."""
    if state.get("context_sufficient"):
        return "generate"

    if state.get("iteration", 0) < MAX_ITERATIONS:
        return "rewrite_query"

    # Retrieval is exhausted — let the tools try (web search, listings lookup).
    return "call_tools"


# --------------------------------------------------------------------- graph


def build_graph(deps: NodeDeps, checkpointer: Any | None = None):
    """Compile the StateGraph. Returns ``None`` when LangGraph is unavailable."""
    if not LANGGRAPH_AVAILABLE:
        logger.warning("langgraph_unavailable", detail="falling back to sequential execution")
        return None

    def _node(function):
        async def wrapped(state: GraphState) -> dict[str, Any]:
            return await function(state, deps)

        wrapped.__name__ = function.__name__
        return wrapped

    graph = StateGraph(GraphState)

    graph.add_node("load_memory", _node(node_module.load_memory))
    graph.add_node("guard", _node(node_module.guard))
    # NOTE: the node cannot be called "route" — LangGraph rejects a node name
    # that collides with a state key, and `GraphState.route` holds its verdict.
    graph.add_node("classify", _node(node_module.route))
    graph.add_node("rewrite_query", _node(node_module.rewrite_query))
    graph.add_node("retrieve", _node(node_module.retrieve))
    graph.add_node("grade_context", _node(node_module.grade_context))
    graph.add_node("call_tools", _node(node_module.call_tools))
    graph.add_node("generate", _node(node_module.generate))

    graph.add_edge(START, "load_memory")
    graph.add_edge("load_memory", "guard")
    graph.add_conditional_edges("guard", _after_guard, {"route": "classify", "end": END})
    graph.add_conditional_edges(
        "classify",
        _after_route,
        {"rewrite_query": "rewrite_query", "call_tools": "call_tools", "generate": "generate"},
    )
    # Reranking happens inside `retrieve` (HybridSearcher.search already
    # reranks), so the graph goes straight from retrieval to grading.
    graph.add_edge("rewrite_query", "retrieve")
    graph.add_edge("retrieve", "grade_context")
    graph.add_conditional_edges(
        "grade_context",
        _after_grade,
        {"generate": "generate", "rewrite_query": "rewrite_query", "call_tools": "call_tools"},
    )
    graph.add_edge("call_tools", "generate")
    graph.add_edge("generate", END)

    compiled = graph.compile(checkpointer=checkpointer)
    logger.info("graph_compiled", nodes=8, checkpointer=type(checkpointer).__name__ if checkpointer else None)
    return compiled


def build_checkpointer() -> Any | None:
    """In-memory checkpointer when LangGraph provides one, else ``None``."""
    if not LANGGRAPH_AVAILABLE:
        return None

    try:  # pragma: no cover - depends on the installed langgraph version
        from langgraph.checkpoint.memory import MemorySaver

        return MemorySaver()
    except ImportError:
        logger.info("checkpointer_unavailable", detail="running without conversation checkpoints")
        return None


async def _run_sequential(state: GraphState, deps: NodeDeps) -> GraphState:
    """Fallback executor mirroring the graph edges exactly."""
    state.update(await node_module.load_memory(state, deps))
    state.update(await node_module.guard(state, deps))
    if state.get("guarded"):
        return state

    state.update(await node_module.route(state, deps))
    branch = _after_route(state)

    if branch == "rewrite_query":
        while True:
            state.update(await node_module.rewrite_query(state, deps))
            state.update(await node_module.retrieve(state, deps))
            state.update(await node_module.grade_context(state, deps))

            next_node = _after_grade(state)
            if next_node == "rewrite_query":
                continue
            if next_node == "call_tools":
                state.update(await node_module.call_tools(state, deps))
            break
    elif branch == "call_tools":
        state.update(await node_module.call_tools(state, deps))

    state.update(await node_module.generate(state, deps))
    return state


# ----------------------------------------------------------------- the agent


@dataclass(slots=True)
class AgentTurn:
    """Everything one completed turn produced."""

    thread_id: str
    answer: str
    sources: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    route: str
    degraded: bool
    latency_ms: float
    user_message_id: str | None = None
    assistant_message_id: str | None = None
    usage: dict[str, int] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "threadId": self.thread_id,
            "messageId": self.assistant_message_id,
            "answer": self.answer,
            "sources": self.sources,
            "toolCalls": self.tool_results,
            "route": self.route,
            "degraded": self.degraded,
            "latencyMs": round(self.latency_ms, 2),
            "usage": self.usage or {},
        }


class ChatAgent:
    """Runs a chat turn end to end, including persistence."""

    def __init__(
        self,
        *,
        providers: ProviderBundle,
        retriever: HybridSearcher,
        tools: ToolRegistry | None = None,
        repository: ChatRepository | None = None,
        memory: MemoryStore | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._providers = providers
        self._repository = repository or ChatRepository()
        self._memory = memory or MemoryStore(providers=providers, settings=self._settings)
        self._deps = NodeDeps.build(
            providers=providers,
            retriever=retriever,
            tools=tools or build_tool_registry(self._settings),
            memory=self._memory,
            settings=self._settings,
        )
        self._graph = build_graph(self._deps, build_checkpointer())

    # ------------------------------------------------------------------ api

    @property
    def uses_langgraph(self) -> bool:
        return self._graph is not None

    def describe(self) -> dict[str, Any]:
        return {
            "engine": "langgraph" if self.uses_langgraph else "sequential",
            "tools": self._deps.tools.names(),
            "providers": self._providers.describe(),
        }

    async def answer(self, **kwargs: Any) -> AgentTurn:
        """Run a full turn and persist it."""
        started = time.perf_counter()
        state = await self._execute(initial_state(**kwargs))
        return await self._persist(state, started)

    async def stream(self, **kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        """Run the turn, yielding CONTRACT §6 SSE events as they happen."""
        started = time.perf_counter()
        state = initial_state(**kwargs)

        # Everything up to generation runs buffered — those nodes have no
        # partial output to stream, and the client wants `sources` before tokens.
        state.update(await node_module.load_memory(state, self._deps))
        state.update(await node_module.guard(state, self._deps))

        if state.get("guarded"):
            yield {"event": "token", "data": {"text": state.get("answer", "")}}
            turn = await self._persist(state, started)
            yield {"event": "done", "data": turn.as_dict()}
            return

        state.update(await node_module.route(self._as_state(state), self._deps))
        branch = _after_route(state)

        if branch == "rewrite_query":
            while True:
                state.update(await node_module.rewrite_query(state, self._deps))
                state.update(await node_module.retrieve(state, self._deps))
                state.update(await node_module.grade_context(state, self._deps))

                next_node = _after_grade(state)
                if next_node == "rewrite_query":
                    continue
                if next_node == "call_tools":
                    async for event in self._stream_tools(state):
                        yield event
                break
        elif branch == "call_tools":
            async for event in self._stream_tools(state):
                yield event

        if state.get("sources"):
            yield {"event": "sources", "data": {"sources": state["sources"]}}

        # --- the actual token stream ---------------------------------------
        chunks: list[str] = []
        messages = build_generation_messages(state)

        try:
            async for piece in self._providers.generation.stream(
                messages,
                sources=answer_sources(state),
                question=state.get("question", ""),
            ):
                if piece:
                    chunks.append(piece)
                    yield {"event": "token", "data": {"text": piece}}
        except Exception as exc:  # noqa: BLE001 - the client must still get an end
            logger.error("stream_failed", error=str(exc))
            yield {
                "event": "error",
                "data": {"code": "GENERATION_FAILED", "message": "Could not generate a reply"},
            }
            state["answer"] = "".join(chunks)
            turn = await self._persist(state, started)
            yield {"event": "done", "data": turn.as_dict()}
            return

        state["answer"] = "".join(chunks)
        turn = await self._persist(state, started)
        yield {"event": "done", "data": turn.as_dict()}

    # -------------------------------------------------------------- internals

    async def _stream_tools(self, state: GraphState) -> AsyncIterator[dict[str, Any]]:
        """Run `call_tools`, bracketing it with `tool_start` / `tool_end`."""
        before = len(state.get("tool_results", []))

        yield {
            "event": "tool_start",
            "data": {"route": state.get("route", "knowledge")},
        }

        state.update(await node_module.call_tools(state, self._deps))

        for result in state.get("tool_results", [])[before:]:
            yield {
                "event": "tool_end",
                "data": {
                    "name": result.get("name"),
                    "ok": result.get("ok"),
                    "error": result.get("error"),
                    "latencyMs": result.get("latencyMs"),
                },
            }

    async def _execute(self, state: GraphState) -> GraphState:
        if self._graph is None:
            return await _run_sequential(state, self._deps)

        config = {"configurable": {"thread_id": state.get("thread_id") or "anonymous"}}
        result = await self._graph.ainvoke(state, config=config)
        return self._as_state(result)

    @staticmethod
    def _as_state(value: Any) -> GraphState:
        return value if isinstance(value, dict) else dict(value)  # type: ignore[return-value]

    async def _persist(self, state: GraphState, started: float) -> AgentTurn:
        """Write the turn to Postgres. Persistence failures never fail the reply."""
        latency_ms = (time.perf_counter() - started) * 1000
        thread_id = state.get("thread_id")

        turn = AgentTurn(
            thread_id=str(thread_id or ""),
            answer=state.get("answer", ""),
            sources=state.get("sources", []),
            tool_results=state.get("tool_results", []),
            route=state.get("route", "knowledge"),
            degraded=bool(state.get("degraded")),
            latency_ms=latency_ms,
            usage=state.get("usage"),
        )

        if not thread_id:
            return turn

        try:
            user_message = await self._repository.add_message(
                thread_id=thread_id, role="user", content=state.get("question", "")
            )
            assistant_message = await self._repository.add_message(
                thread_id=thread_id,
                role="assistant",
                content=turn.answer,
                sources=turn.sources,
                tool_calls=turn.tool_results,
                tokens=(turn.usage or {}).get("totalTokens"),
                latency_ms=int(latency_ms),
            )

            turn.user_message_id = (user_message or {}).get("id")
            turn.assistant_message_id = (assistant_message or {}).get("id")

            if turn.tool_results:
                await self._repository.record_tool_calls(
                    thread_id=thread_id,
                    message_id=turn.assistant_message_id,
                    results=turn.tool_results,
                )

            # First user message doubles as the thread title.
            title = (state.get("question") or "").strip()[:80] or None
            existing = await self._repository.get_thread(thread_id)
            await self._repository.touch_thread(
                thread_id, title=None if (existing or {}).get("title") else title
            )

            await self._memory.persist_profile(thread_id, state.get("profile", {}))

            history = list(state.get("messages", [])) + [
                {"role": "user", "content": state.get("question", "")},
                {"role": "assistant", "content": turn.answer},
            ]
            memory = await self._memory.load(thread_id)
            if self._memory.should_summarise(memory.message_count):
                await self._memory.refresh_summary(thread_id, history, state.get("summary"))

        except Exception as exc:  # noqa: BLE001 - never fail a reply on persistence
            logger.error("persist_failed", thread_id=str(thread_id), error=str(exc))

        return turn


__all__ = [
    "LANGGRAPH_AVAILABLE",
    "AgentTurn",
    "ChatAgent",
    "build_checkpointer",
    "build_graph",
]

"""Tool-calling foundation.

Every tool exposes an OpenAI-style JSON schema so the generation model can
request it, validates its arguments with Pydantic, and **contains its own
failures**: a tool that errors returns a :class:`ToolResult` with ``error`` set
rather than raising, so a flaky downstream service degrades the answer instead
of killing the stream.
"""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.logging import get_logger

logger = get_logger("rag-svc.tools")

#: Hard ceiling on any single tool call, regardless of the tool's own timeout.
DEFAULT_TOOL_TIMEOUT = 12.0


@dataclass(slots=True)
class ToolResult:
    """The outcome of one tool invocation."""

    name: str
    ok: bool
    #: One-line rendering the model reads in the TOOL RESULTS block.
    summary: str = ""
    #: Structured payload, kept for persistence and the UI.
    output: Any = None
    #: Citation cards merged into the SSE `sources` event.
    sources: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    latency_ms: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "ok": self.ok,
            "summary": self.summary,
            "output": self.output,
            "error": self.error,
            "latencyMs": round(self.latency_ms, 2),
        }


class Tool(ABC):
    """Base class for an agent tool."""

    #: Function name the model calls.
    name: str = ""
    #: One-sentence description shown to the model.
    description: str = ""
    #: Pydantic model validating the arguments.
    args_model: type[BaseModel]
    #: Per-tool timeout; falls back to :data:`DEFAULT_TOOL_TIMEOUT`.
    timeout: float = DEFAULT_TOOL_TIMEOUT
    #: Tools with side effects require explicit user confirmation first.
    requires_confirmation: bool = False

    @abstractmethod
    async def run(self, args: BaseModel, context: "ToolContext") -> ToolResult:
        """Execute the tool. Implementations may raise; `invoke` contains it."""

    # ------------------------------------------------------------------ api

    def schema(self) -> dict[str, Any]:
        """OpenAI `tools[]` entry for this tool."""
        parameters = self.args_model.model_json_schema()
        # Providers reject `$defs`/`title` noise in some schema modes; the
        # inlined form below is what every current OpenAI-compatible API accepts.
        parameters.pop("title", None)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": parameters,
            },
        }

    async def invoke(self, raw_args: dict[str, Any], context: "ToolContext") -> ToolResult:
        """Validate, run and time the tool, converting every failure to a result."""
        started = time.perf_counter()

        try:
            args = self.args_model.model_validate(raw_args or {})
        except ValidationError as exc:
            detail = "; ".join(
                f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                for error in exc.errors()[:3]
            )
            logger.warning("tool_bad_arguments", tool=self.name, detail=detail)
            return ToolResult(
                name=self.name,
                ok=False,
                error=f"invalid arguments ({detail})",
                latency_ms=(time.perf_counter() - started) * 1000,
            )

        try:
            result = await asyncio.wait_for(self.run(args, context), timeout=self.timeout)
        except asyncio.TimeoutError:
            logger.warning("tool_timeout", tool=self.name, timeout=self.timeout)
            return ToolResult(
                name=self.name,
                ok=False,
                error=f"timed out after {self.timeout:.0f}s",
                latency_ms=(time.perf_counter() - started) * 1000,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - a tool must never break the turn
            logger.warning("tool_failed", tool=self.name, error=str(exc))
            return ToolResult(
                name=self.name,
                ok=False,
                error=str(exc)[:200],
                latency_ms=(time.perf_counter() - started) * 1000,
            )

        result.latency_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "tool_completed", tool=self.name, ok=result.ok, latency_ms=result.latency_ms
        )
        return result


@dataclass(slots=True)
class ToolContext:
    """Per-turn information a tool may need."""

    thread_id: str | None = None
    user_id: str | None = None
    user_name: str | None = None
    user_email: str | None = None
    locale: str = "en"
    #: Access token of the calling user, forwarded to api-core when present.
    access_token: str | None = None
    request_id: str | None = None
    #: Set by the graph once the user has explicitly confirmed a side effect.
    confirmed: bool = False


__all__ = ["DEFAULT_TOOL_TIMEOUT", "Tool", "ToolContext", "ToolResult"]

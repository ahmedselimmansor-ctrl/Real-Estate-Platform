"""Conversation memory: recent turns, a rolling summary, and a buyer profile.

Three layers, cheapest first:

1. **Window** — the last ``RAG_MEMORY_WINDOW`` turns verbatim.
2. **Summary** — everything older, compressed by the generation model into
   ``chat_summaries`` and refreshed every ``SUMMARY_EVERY`` turns.
3. **Profile** — budget / areas / property type inferred from what the user has
   said, stored on ``chat_threads.metadata`` and reused across their threads so
   a returning visitor does not have to repeat themselves.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from sqlalchemy import desc, select

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.models.chat import ChatMessage, ChatSummary, ChatThread
from app.db.session import Database, get_database
from app.graph.prompts import SUMMARY_PROMPT, format_history
from app.providers.base import ChatMessage as ProviderMessage
from app.providers.registry import ProviderBundle
from app.retrieval.filters import parse_query_filters, parse_stated_amount

logger = get_logger("rag-svc.memory")

#: Re-summarise once the thread has grown by this many messages.
SUMMARY_EVERY = 8
#: Never feed the summariser more than this many characters of transcript.
SUMMARY_INPUT_CHARS = 8000


@dataclass(slots=True)
class ThreadMemory:
    """What the graph loads before answering."""

    messages: list[dict[str, str]] = field(default_factory=list)
    summary: str | None = None
    profile: dict[str, Any] = field(default_factory=dict)
    message_count: int = 0

    def as_state(self) -> dict[str, Any]:
        return {
            "messages": self.messages,
            "summary": self.summary,
            "profile": self.profile,
        }


class MemoryStore:
    """Reads and writes the three memory layers."""

    def __init__(
        self,
        database: Database | None = None,
        providers: ProviderBundle | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._database = database or get_database()
        self._providers = providers

    # ------------------------------------------------------------------ load

    async def load(self, thread_id: str | uuid.UUID | None) -> ThreadMemory:
        """Recent turns + rolling summary + profile for a thread."""
        if not thread_id:
            return ThreadMemory()

        try:
            identifier = uuid.UUID(str(thread_id))
        except (TypeError, ValueError):
            return ThreadMemory()

        window = max(1, self._settings.rag_memory_window)

        async with self._database.session() as session:
            rows = (
                (
                    await session.execute(
                        select(ChatMessage)
                        .where(
                            ChatMessage.thread_id == identifier,
                            ChatMessage.role.in_(("user", "assistant")),
                        )
                        .order_by(desc(ChatMessage.created_at))
                        # `window` turns ≈ 2×window messages.
                        .limit(window * 2)
                    )
                )
                .scalars()
                .all()
            )

            total = (
                (
                    await session.execute(
                        select(ChatMessage.id).where(ChatMessage.thread_id == identifier)
                    )
                )
                .scalars()
                .all()
            )

            summary_row = (
                await session.execute(
                    select(ChatSummary)
                    .where(ChatSummary.thread_id == identifier)
                    .order_by(desc(ChatSummary.created_at))
                    .limit(1)
                )
            ).scalar_one_or_none()

            thread = await session.get(ChatThread, identifier)

        messages = [
            {"role": row.role, "content": row.content} for row in reversed(rows) if row.content
        ]

        return ThreadMemory(
            messages=messages,
            summary=summary_row.summary if summary_row else None,
            profile=dict((thread.meta or {}).get("profile", {})) if thread else {},
            message_count=len(total),
        )

    # --------------------------------------------------------------- profile

    def update_profile(self, profile: dict[str, Any], question: str) -> dict[str, Any]:
        """Fold newly stated constraints into the buyer profile.

        Reuses the same deterministic parser the retriever uses for metadata
        prefilters, so "profile" and "filters" can never disagree about what the
        user asked for.
        """
        parsed = parse_query_filters(question or "").as_dict()
        updated = dict(profile)

        for key in ("minPrice", "maxPrice", "bedrooms", "propertyType", "area", "compound"):
            value = parsed.get(key)
            if value not in (None, "", [], {}):
                updated[key] = value

        # A financing question states a bare figure that `parse_query_filters`
        # ignores because it carries no "under"/"from" cue. Remembering it is
        # what lets "and over 10 years?" recalculate the same amount.
        stated = parse_stated_amount(question or "")
        if stated:
            updated["statedPrice"] = stated

        return updated

    async def persist_profile(self, thread_id: str | uuid.UUID, profile: dict[str, Any]) -> None:
        if not profile:
            return

        try:
            identifier = uuid.UUID(str(thread_id))
        except (TypeError, ValueError):
            return

        try:
            async with self._database.session() as session:
                thread = await session.get(ChatThread, identifier)
                if thread is None:
                    return
                meta = dict(thread.meta or {})
                meta["profile"] = profile
                # Assign through the ORM attribute. `values(metadata=...)`
                # resolves to SQLAlchemy's own `MetaData` on the declarative
                # class, not to the column, and raises `_bulk_update_tuples` —
                # which this method's best-effort `except` then swallowed, so
                # the profile silently never persisted between turns.
                thread.meta = meta
                await session.commit()
        except Exception as exc:
            logger.warning("profile_persist_failed", thread_id=str(thread_id), error=str(exc))

    # --------------------------------------------------------------- summary

    def should_summarise(self, message_count: int) -> bool:
        """Re-summarise every `SUMMARY_EVERY` messages past the window."""
        window = max(1, self._settings.rag_memory_window)
        return message_count > window * 2 and message_count % SUMMARY_EVERY == 0

    async def refresh_summary(
        self,
        thread_id: str | uuid.UUID,
        messages: list[dict[str, str]],
        previous: str | None = None,
    ) -> str | None:
        """Compress the thread into `chat_summaries`. Never raises."""
        if not messages or self._providers is None:
            return previous

        try:
            identifier = uuid.UUID(str(thread_id))
        except (TypeError, ValueError):
            return previous

        transcript = format_history(messages, limit=40)[:SUMMARY_INPUT_CHARS]
        user_content = (
            f"Previous summary:\n{previous or '(none)'}\n\nRecent conversation:\n{transcript}"
        )

        try:
            result = await self._providers.generation.generate(
                [
                    ProviderMessage(role="system", content=SUMMARY_PROMPT),
                    ProviderMessage(role="user", content=user_content),
                ],
                max_tokens=320,
            )
            summary = (result.text or "").strip()
        except Exception as exc:
            logger.warning("summary_failed", thread_id=str(thread_id), error=str(exc))
            return previous

        if not summary:
            return previous

        try:
            async with self._database.session() as session:
                session.add(ChatSummary(thread_id=identifier, summary=summary))
                await session.commit()
        except Exception as exc:
            logger.warning("summary_persist_failed", thread_id=str(thread_id), error=str(exc))
            return previous

        logger.info("summary_refreshed", thread_id=str(thread_id), chars=len(summary))
        return summary

    # ----------------------------------------------------------- prompt view

    @staticmethod
    def as_prompt_messages(
        memory: ThreadMemory | Mapping[str, Any],
    ) -> list[ProviderMessage]:
        """Render memory as provider messages placed before the current turn."""
        if isinstance(memory, ThreadMemory):
            summary = memory.summary
            profile = memory.profile
            messages = memory.messages
        else:
            summary = memory.get("summary")
            profile = memory.get("profile") or {}
            messages = memory.get("messages") or []

        rendered: list[ProviderMessage] = []

        if summary:
            rendered.append(
                ProviderMessage(
                    role="system", content=f"Summary of the conversation so far:\n{summary}"
                )
            )

        if profile:
            readable = ", ".join(f"{key}={value}" for key, value in profile.items())
            rendered.append(
                ProviderMessage(
                    role="system",
                    content=(
                        f"What this buyer has told us previously: {readable}. "
                        "Use it to personalise, but never state it as fact about a listing."
                    ),
                )
            )

        for message in messages:
            role = message.get("role")
            if role in {"user", "assistant"} and message.get("content"):
                # The membership test above is the guarantee; mypy cannot
                # narrow a `str` to a Literal from an `in` check.
                rendered.append(
                    ProviderMessage(
                        role=cast(Literal["user", "assistant"], role),
                        content=message["content"],
                    )
                )

        return rendered


__all__ = ["SUMMARY_EVERY", "MemoryStore", "ThreadMemory"]

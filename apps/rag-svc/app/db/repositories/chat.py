"""Persistence for threads, messages, summaries and tool calls (CONTRACT §2)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, desc, func, select, update

from app.core.logging import get_logger
from app.db.models.chat import ChatMessage, ChatSummary, ChatThread, ToolCall
from app.db.session import Database, get_database

logger = get_logger("rag-svc.repo.chat")


def _as_uuid(value: str | uuid.UUID | None) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ChatRepository:
    """All reads and writes for the conversation tables."""

    def __init__(self, database: Database | None = None) -> None:
        self._database = database or get_database()

    # ---------------------------------------------------------------- threads

    async def create_thread(
        self,
        *,
        user_id: str | None = None,
        locale: str = "en",
        title: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with self._database.session() as session:
            thread = ChatThread(
                user_id=_as_uuid(user_id),
                locale=locale,
                title=title,
                meta=metadata or {},
            )
            session.add(thread)
            await session.commit()
            await session.refresh(thread)

        return self._thread_dict(thread)

    async def get_thread(self, thread_id: str | uuid.UUID) -> dict[str, Any] | None:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return None

        async with self._database.session() as session:
            thread = await session.get(ChatThread, identifier)
            return self._thread_dict(thread) if thread else None

    async def touch_thread(
        self, thread_id: str | uuid.UUID, *, title: str | None = None
    ) -> None:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return

        values: dict[str, Any] = {"last_message_at": datetime.now(timezone.utc)}
        if title:
            values["title"] = title

        async with self._database.session() as session:
            await session.execute(
                update(ChatThread).where(ChatThread.id == identifier).values(**values)
            )
            await session.commit()

    async def list_threads(
        self, *, user_id: str | None, limit: int = 20, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        owner = _as_uuid(user_id)

        async with self._database.session() as session:
            condition = ChatThread.user_id == owner if owner else ChatThread.user_id.is_(None)

            total = (
                await session.execute(
                    select(func.count()).select_from(ChatThread).where(condition)
                )
            ).scalar_one()

            rows = (
                await session.execute(
                    select(ChatThread)
                    .where(condition)
                    .order_by(desc(ChatThread.last_message_at))
                    .limit(limit)
                    .offset(offset)
                )
            ).scalars().all()

        return [self._thread_dict(row) for row in rows], int(total)

    # --------------------------------------------------------------- messages

    async def add_message(
        self,
        *,
        thread_id: str | uuid.UUID,
        role: str,
        content: str,
        sources: list[dict[str, Any]] | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        tokens: int | None = None,
        latency_ms: int | None = None,
    ) -> dict[str, Any] | None:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return None

        async with self._database.session() as session:
            message = ChatMessage(
                thread_id=identifier,
                role=role,
                content=content or "",
                sources=sources or None,
                tool_calls=tool_calls or None,
                tokens=tokens,
                latency_ms=latency_ms,
            )
            session.add(message)
            await session.commit()
            await session.refresh(message)

        return self._message_dict(message)

    async def list_messages(
        self, thread_id: str | uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return [], 0

        async with self._database.session() as session:
            total = (
                await session.execute(
                    select(func.count())
                    .select_from(ChatMessage)
                    .where(ChatMessage.thread_id == identifier)
                )
            ).scalar_one()

            rows = (
                await session.execute(
                    select(ChatMessage)
                    .where(
                        ChatMessage.thread_id == identifier,
                        ChatMessage.role.in_(("user", "assistant")),
                    )
                    .order_by(ChatMessage.created_at)
                    .limit(limit)
                    .offset(offset)
                )
            ).scalars().all()

        return [self._message_dict(row) for row in rows], int(total)

    async def rate_message(
        self, message_id: str | uuid.UUID, *, rating: int, feedback: str | None = None
    ) -> bool:
        identifier = _as_uuid(message_id)
        if identifier is None:
            return False

        async with self._database.session() as session:
            result = await session.execute(
                update(ChatMessage)
                .where(ChatMessage.id == identifier)
                .values(rating=rating, feedback=feedback)
            )
            await session.commit()

        return result.rowcount > 0

    async def message_thread_id(self, message_id: str | uuid.UUID) -> str | None:
        identifier = _as_uuid(message_id)
        if identifier is None:
            return None

        async with self._database.session() as session:
            row = (
                await session.execute(
                    select(ChatMessage.thread_id).where(ChatMessage.id == identifier)
                )
            ).scalar_one_or_none()

        return str(row) if row else None

    # ------------------------------------------------------------- tool calls

    async def record_tool_calls(
        self,
        *,
        thread_id: str | uuid.UUID,
        message_id: str | uuid.UUID | None,
        results: list[dict[str, Any]],
    ) -> None:
        if not results:
            return

        thread = _as_uuid(thread_id)
        message = _as_uuid(message_id)

        async with self._database.session() as session:
            for result in results:
                session.add(
                    ToolCall(
                        thread_id=thread,
                        message_id=message,
                        name=str(result.get("name", "unknown"))[:64],
                        arguments=result.get("arguments") or {},
                        result=result.get("output"),
                        status="succeeded" if result.get("ok") else "failed",
                        error=result.get("error"),
                        latency_ms=int(result.get("latencyMs") or 0),
                    )
                )
            await session.commit()

    # ----------------------------------------------------------------- delete

    async def delete_thread(self, thread_id: str | uuid.UUID) -> bool:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return False

        async with self._database.session() as session:
            result = await session.execute(
                delete(ChatThread).where(ChatThread.id == identifier)
            )
            await session.commit()

        return result.rowcount > 0

    async def latest_summary(self, thread_id: str | uuid.UUID) -> str | None:
        identifier = _as_uuid(thread_id)
        if identifier is None:
            return None

        async with self._database.session() as session:
            row = (
                await session.execute(
                    select(ChatSummary.summary)
                    .where(ChatSummary.thread_id == identifier)
                    .order_by(desc(ChatSummary.created_at))
                    .limit(1)
                )
            ).scalar_one_or_none()

        return row

    # ---------------------------------------------------------------- mapping

    @staticmethod
    def _thread_dict(thread: ChatThread) -> dict[str, Any]:
        return {
            "id": str(thread.id),
            "userId": str(thread.user_id) if thread.user_id else None,
            "title": thread.title,
            "locale": thread.locale,
            "createdAt": thread.created_at.isoformat() if thread.created_at else None,
            "lastMessageAt": (
                thread.last_message_at.isoformat() if thread.last_message_at else None
            ),
            "metadata": thread.meta or {},
        }

    @staticmethod
    def _message_dict(message: ChatMessage) -> dict[str, Any]:
        return {
            "id": str(message.id),
            "threadId": str(message.thread_id),
            "role": message.role,
            "content": message.content,
            "sources": message.sources or [],
            "toolCalls": message.tool_calls or [],
            "tokens": message.tokens,
            "latencyMs": message.latency_ms,
            "rating": message.rating,
            "createdAt": message.created_at.isoformat() if message.created_at else None,
        }


__all__ = ["ChatRepository"]

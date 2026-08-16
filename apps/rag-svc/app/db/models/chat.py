"""Conversation tables: threads, messages, summaries and tool calls (CONTRACT §2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, created_at_column, uuid_pk

#: ``chat_messages.role`` values.
MESSAGE_ROLES = ("user", "assistant", "system", "tool")

#: ``tool_calls.status`` values.
TOOL_CALL_STATUSES = ("pending", "succeeded", "failed")


class ChatThread(Base):
    """One conversation. ``user_id`` is NULL for guest visitors."""

    __tablename__ = "chat_threads"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    created_at: Mapped[datetime] = created_at_column()
    last_message_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )

    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
        order_by="ChatMessage.created_at",
    )

    __table_args__ = (
        Index("ix_chat_threads_user_id", "user_id"),
        Index("ix_chat_threads_last_message_at", "last_message_at"),
    )


class ChatMessage(Base):
    """A single turn: user question, assistant answer, system or tool output."""

    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sources: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    tool_calls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    thread: Mapped[ChatThread] = relationship(back_populates="messages", lazy="raise")

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant', 'system', 'tool')", name="role"),
        CheckConstraint("rating IS NULL OR rating BETWEEN -1 AND 5", name="rating"),
        Index("ix_chat_messages_thread_id_created_at", "thread_id", "created_at"),
    )


class ChatSummary(Base):
    """Rolling summary of a thread beyond the ``RAG_MEMORY_WINDOW`` messages."""

    __tablename__ = "chat_summaries"

    id: Mapped[uuid.UUID] = uuid_pk()
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    up_to_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (Index("ix_chat_summaries_thread_id_created_at", "thread_id", "created_at"),)


class ToolCall(Base):
    """A tool invocation performed by the agent while answering a message."""

    __tablename__ = "tool_calls"

    id: Mapped[uuid.UUID] = uuid_pk()
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=True
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    arguments: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'succeeded', 'failed')", name="status"),
        Index("ix_tool_calls_thread_id", "thread_id"),
        Index("ix_tool_calls_message_id", "message_id"),
    )

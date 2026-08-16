"""Request/response models for ``/api/chat`` (CONTRACT §6)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

MAX_MESSAGE_CHARS = 4000


class CreateThreadRequest(BaseModel):
    locale: Literal["en", "ar"] = "en"
    title: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ThreadResponse(BaseModel):
    threadId: str
    locale: str = "en"
    title: str | None = None
    createdAt: str | None = None
    lastMessageAt: str | None = None
    #: Bearer-style token letting a guest re-open the thread they created.
    guestToken: str | None = None


class MessageRequest(BaseModel):
    """`POST /api/chat/message`."""

    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    threadId: str | None = Field(
        default=None, description="Omit to start a new thread — the id comes back in the response"
    )
    stream: bool = Field(default=False, description="Return text/event-stream instead of JSON")
    locale: Literal["en", "ar"] | None = None
    #: Guest thread token, when the caller is not authenticated.
    guestToken: str | None = None

    @field_validator("message")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("message cannot be blank")
        return cleaned


class SourceCard(BaseModel):
    type: str = "document"
    title: str | None = None
    url: str | None = None
    snippet: str | None = None
    score: float | None = None
    id: str | None = None
    slug: str | None = None
    price: int | None = None
    image: str | None = None
    domain: str | None = None


class MessageResponse(BaseModel):
    threadId: str
    messageId: str | None = None
    answer: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    route: str = "knowledge"
    degraded: bool = False
    latencyMs: float = 0.0
    usage: dict[str, int] = Field(default_factory=dict)


class MessageListItem(BaseModel):
    id: str
    threadId: str
    role: str
    content: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    rating: int | None = None
    createdAt: str | None = None


class FeedbackRequest(BaseModel):
    messageId: str
    rating: int = Field(ge=-1, le=5, description="-1 thumbs down, 1 thumbs up, or a 0-5 score")
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackResponse(BaseModel):
    messageId: str
    recorded: bool


__all__ = [
    "MAX_MESSAGE_CHARS",
    "CreateThreadRequest",
    "FeedbackRequest",
    "FeedbackResponse",
    "MessageListItem",
    "MessageRequest",
    "MessageResponse",
    "SourceCard",
    "ThreadResponse",
]

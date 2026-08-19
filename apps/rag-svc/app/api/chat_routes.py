"""Chat endpoints (CONTRACT §6).

    POST /api/chat/threads                 -> {threadId, guestToken?}
    GET  /api/chat/threads/{id}/messages   -> paginated transcript
    POST /api/chat/message                 -> JSON, or text/event-stream when stream=true
    GET  /api/chat/stream/{threadId}       -> SSE replay of an in-flight generation
    POST /api/chat/feedback                -> 👍/👎 on an assistant message

Guests are first-class: a thread created without a bearer token gets a signed
``guestToken`` which is the only way to read that thread back, so one visitor
cannot enumerate another's conversation.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import time
from collections.abc import AsyncIterator
from typing import Annotated, Any

import orjson
from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import ORJSONResponse, StreamingResponse

from app.core.config import Settings, get_settings
from app.core.envelope import envelope, paginated
from app.core.errors import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.core.redis import get_redis_manager
from app.core.security import AuthUser, optional_user
from app.db.repositories.chat import ChatRepository
from app.db.session import get_database
from app.graph.builder import ChatAgent
from app.graph.prompts import detect_locale
from app.schemas.chat import (
    CreateThreadRequest,
    FeedbackRequest,
    MessageRequest,
)

logger = get_logger("rag-svc.api.chat")

router = APIRouter(tags=["chat"])

#: How long a resumable stream buffer lives in Redis (CONTRACT §2).
STREAM_TTL_SECONDS = 3600
#: Heartbeat so proxies do not idle out a slow generation.
SSE_KEEPALIVE_SECONDS = 15.0


# ------------------------------------------------------------------ helpers


def _agent(request: Request) -> ChatAgent:
    agent = getattr(request.app.state, "agent", None)
    if agent is None:  # pragma: no cover - only before lifespan completes
        raise NotFoundError("Chat agent is not initialised", code="SERVICE_STARTING")
    return agent


def _repository(request: Request) -> ChatRepository:
    return ChatRepository(getattr(request.app.state, "database", None) or get_database())


def _guest_token(thread_id: str, settings: Settings) -> str:
    """HMAC binding a guest to the thread they created."""
    secret = (settings.jwt_access_secret or settings.internal_service_token or "topchoice").encode()
    return hmac.new(secret, f"thread:{thread_id}".encode(), hashlib.sha256).hexdigest()[:32]


def _authorise_thread(
    thread: dict[str, Any], user: AuthUser | None, guest_token: str | None, settings: Settings
) -> None:
    """Owner-only access: the signed-in owner, or the guest who created it."""
    owner_id = thread.get("userId")

    if owner_id:
        if user is None or str(user.id) != str(owner_id):
            raise ForbiddenError("This conversation belongs to another account")
        return

    expected = _guest_token(thread["id"], settings)
    if not guest_token or not hmac.compare_digest(guest_token, expected):
        raise ForbiddenError("A guest token is required to read this conversation")


def _sse(event: str, data: Any) -> bytes:
    """One SSE frame. Event names are fixed by CONTRACT §6."""
    payload = orjson.dumps(data).decode() if not isinstance(data, str) else data
    return f"event: {event}\ndata: {payload}\n\n".encode()


# ------------------------------------------------------------------- threads


@router.post(
    "/threads",
    status_code=status.HTTP_201_CREATED,
    response_class=ORJSONResponse,
    summary="Start a conversation",
    dependencies=[Depends(rate_limit("chat:threads", limit=30, window=60))],
)
async def create_thread(
    request: Request,
    payload: CreateThreadRequest,
    user: Annotated[AuthUser | None, Depends(optional_user)] = None,
) -> ORJSONResponse:
    settings = get_settings()
    thread = await _repository(request).create_thread(
        user_id=str(user.id) if user else None,
        locale=payload.locale,
        title=payload.title,
        metadata=payload.metadata,
    )

    body = {
        "threadId": thread["id"],
        "locale": thread["locale"],
        "title": thread["title"],
        "createdAt": thread["createdAt"],
        "lastMessageAt": thread["lastMessageAt"],
    }
    if not user:
        body["guestToken"] = _guest_token(thread["id"], settings)

    logger.info("thread_created", thread_id=thread["id"], guest=user is None)
    return ORJSONResponse(envelope(body), status_code=status.HTTP_201_CREATED)


@router.get(
    "/threads/{thread_id}/messages",
    response_class=ORJSONResponse,
    summary="Read a conversation transcript",
)
async def list_messages(
    request: Request,
    thread_id: Annotated[str, Path()],
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    guest_token: Annotated[str | None, Query(alias="guestToken")] = None,
    user: Annotated[AuthUser | None, Depends(optional_user)] = None,
) -> ORJSONResponse:
    repository = _repository(request)
    thread = await repository.get_thread(thread_id)

    if thread is None:
        raise NotFoundError(f"Thread '{thread_id}' was not found", code="THREAD_NOT_FOUND")

    _authorise_thread(thread, user, guest_token, get_settings())

    messages, total = await repository.list_messages(
        thread_id, limit=limit, offset=(page - 1) * limit
    )

    return ORJSONResponse(paginated(messages, page=page, limit=limit, total=total))


# ------------------------------------------------------------------- message


@router.post(
    "/message",
    response_class=ORJSONResponse,
    summary="Ask the assistant",
    dependencies=[Depends(rate_limit("chat:message"))],
)
async def post_message(
    request: Request,
    payload: MessageRequest,
    user: Annotated[AuthUser | None, Depends(optional_user)] = None,
):
    settings = get_settings()
    repository = _repository(request)
    agent = _agent(request)

    locale = payload.locale or detect_locale(payload.message)

    # --- resolve or create the thread ------------------------------------
    if payload.threadId:
        thread = await repository.get_thread(payload.threadId)
        if thread is None:
            raise NotFoundError(
                f"Thread '{payload.threadId}' was not found", code="THREAD_NOT_FOUND"
            )
        _authorise_thread(thread, user, payload.guestToken, settings)
        guest_token = None if thread.get("userId") else payload.guestToken
    else:
        thread = await repository.create_thread(
            user_id=str(user.id) if user else None, locale=locale
        )
        guest_token = None if user else _guest_token(thread["id"], settings)

    turn_kwargs: dict[str, Any] = {
        "question": payload.message,
        "thread_id": thread["id"],
        "user_id": str(user.id) if user else None,
        "user_name": user.name if user else None,
        "user_email": user.email if user else None,
        "access_token": _bearer(request),
        "request_id": getattr(request.state, "request_id", None),
        "locale": locale,
    }

    if not payload.stream:
        turn = await agent.answer(**turn_kwargs)
        body = turn.as_dict()
        if guest_token:
            body["guestToken"] = guest_token
        return ORJSONResponse(envelope(body))

    return StreamingResponse(
        _event_stream(request, agent, turn_kwargs, thread["id"], guest_token),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # nginx must not buffer this — see infra/nginx proxy-sse.inc.
            "X-Accel-Buffering": "no",
        },
    )


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else None


async def _event_stream(
    request: Request,
    agent: ChatAgent,
    turn_kwargs: dict[str, Any],
    thread_id: str,
    guest_token: str | None,
) -> AsyncIterator[bytes]:
    """Bridge the agent's event iterator onto the wire, buffering for resume."""
    redis = get_redis_manager()
    buffer_key = f"chat:stream:{thread_id}"
    frames: list[dict[str, Any]] = []
    started = time.perf_counter()

    if guest_token:
        yield _sse("meta", {"threadId": thread_id, "guestToken": guest_token})

    try:
        async for event in agent.stream(**turn_kwargs):
            if await request.is_disconnected():
                logger.info("stream_client_disconnected", thread_id=thread_id)
                break

            frames.append(event)
            yield _sse(event["event"], event["data"])

    except asyncio.CancelledError:  # pragma: no cover - client aborted
        logger.info("stream_cancelled", thread_id=thread_id)
        raise
    except Exception as exc:
        logger.error("stream_error", thread_id=thread_id, error=str(exc))
        yield _sse(
            "error",
            {"code": "STREAM_FAILED", "message": "The assistant could not finish that reply"},
        )
    finally:
        # Keep the frames briefly so `GET /stream/{threadId}` can replay them.
        # Best effort: a replay buffer that fails to save is not worth an error.
        with contextlib.suppress(Exception):
            await redis.set_json(buffer_key, {"frames": frames}, ttl=STREAM_TTL_SECONDS)

        logger.info(
            "stream_completed",
            thread_id=thread_id,
            frames=len(frames),
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )


@router.get(
    "/stream/{thread_id}",
    summary="Replay the most recent streamed answer",
)
async def replay_stream(
    request: Request,
    thread_id: Annotated[str, Path()],
    guest_token: Annotated[str | None, Query(alias="guestToken")] = None,
    user: Annotated[AuthUser | None, Depends(optional_user)] = None,
) -> StreamingResponse:
    repository = _repository(request)
    thread = await repository.get_thread(thread_id)

    if thread is None:
        raise NotFoundError(f"Thread '{thread_id}' was not found", code="THREAD_NOT_FOUND")

    _authorise_thread(thread, user, guest_token, get_settings())

    buffered = await get_redis_manager().get_json(f"chat:stream:{thread_id}")
    frames = (buffered or {}).get("frames", [])

    async def _replay() -> AsyncIterator[bytes]:
        if not frames:
            yield _sse(
                "error",
                {"code": "NO_ACTIVE_STREAM", "message": "There is nothing to replay"},
            )
            return
        for frame in frames:
            yield _sse(frame.get("event", "token"), frame.get("data", {}))

    return StreamingResponse(
        _replay(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ feedback


@router.post(
    "/feedback",
    response_class=ORJSONResponse,
    summary="Rate an assistant answer",
    dependencies=[Depends(rate_limit("chat:feedback", limit=60, window=60))],
)
async def submit_feedback(
    request: Request,
    payload: FeedbackRequest,
    guest_token: Annotated[str | None, Query(alias="guestToken")] = None,
    user: Annotated[AuthUser | None, Depends(optional_user)] = None,
) -> ORJSONResponse:
    repository = _repository(request)

    thread_id = await repository.message_thread_id(payload.messageId)
    if thread_id is None:
        raise NotFoundError(
            f"Message '{payload.messageId}' was not found", code="MESSAGE_NOT_FOUND"
        )

    thread = await repository.get_thread(thread_id)
    if thread is None:
        raise NotFoundError("Thread was not found", code="THREAD_NOT_FOUND")

    _authorise_thread(thread, user, guest_token, get_settings())

    recorded = await repository.rate_message(
        payload.messageId, rating=payload.rating, feedback=payload.comment
    )

    logger.info(
        "feedback_recorded",
        message_id=payload.messageId,
        rating=payload.rating,
        has_comment=bool(payload.comment),
    )

    return ORJSONResponse(envelope({"messageId": payload.messageId, "recorded": recorded}))


__all__ = ["router"]

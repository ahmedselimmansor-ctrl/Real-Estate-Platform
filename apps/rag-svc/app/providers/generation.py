"""Generation providers.

Primary: ``GENERATION_MODEL`` (``gpt-5.6-luna``) over ``OPENAI_BASE_URL`` with
streaming, through the official OpenAI async client.

Fallback: :class:`TemplateGenerationProvider`, a deterministic **extractive**
answerer used only when ``OPENAI_API_KEY`` is absent. It selects the sentences
in the retrieved context that best match the question and renders them as a
short, sourced answer in the language of the question, so the chatbot remains
useful — and the whole stack runs keyless — in development.
"""

from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator, Sequence
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    RateLimitError,
)
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.core.config import Settings, get_settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from app.core.tokens import get_token_counter
from app.providers.base import ChatMessage, GenerationResult, GenerationUsage

logger = get_logger("rag-svc.provider.generation")

_RETRYABLE = (APIConnectionError, APITimeoutError, RateLimitError)

_ARABIC_RE = re.compile("[؀-ۿ]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?؟۔…])\s+")


class OpenAIGenerationProvider:
    """Chat completions against ``OPENAI_BASE_URL``."""

    name = "openai"

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model = cfg.generation_model
        self.available = True
        self._client = AsyncOpenAI(
            api_key=cfg.openai_api_key,
            base_url=cfg.openai_base_url,
            timeout=cfg.rag_generation_timeout,
            max_retries=0,  # retries are owned by tenacity below
        )
        self._max_retries = max(1, cfg.rag_http_max_retries)
        self._backoff = cfg.rag_http_backoff_seconds

    # --- helpers ----------------------------------------------------------
    def _payload(self, messages: Sequence[ChatMessage], options: dict[str, Any]) -> dict:
        payload: dict[str, Any] = {
            "model": options.get("model") or self.model,
            "messages": [message.as_dict() for message in messages],
        }
        temperature = options.get("temperature", self._settings.generation_temperature)
        if temperature is not None:
            payload["temperature"] = temperature
        max_tokens = options.get("max_tokens", self._settings.generation_max_tokens)
        if max_tokens is not None:
            payload["max_completion_tokens"] = max_tokens
        if options.get("response_format") is not None:
            payload["response_format"] = options["response_format"]
        if options.get("tools"):
            payload["tools"] = options["tools"]
            payload["tool_choice"] = options.get("tool_choice", "auto")
        return payload

    def _retrying(self) -> AsyncRetrying:
        return AsyncRetrying(
            stop=stop_after_attempt(self._max_retries),
            wait=wait_exponential_jitter(initial=self._backoff, max=8.0),
            retry=retry_if_exception_type(_RETRYABLE),
            reraise=True,
        )

    # --- public API -------------------------------------------------------
    async def generate(
        self, messages: Sequence[ChatMessage], **options: Any
    ) -> GenerationResult:
        payload = self._payload(messages, options)
        started = time.perf_counter()
        completion: Any = None
        try:
            async for attempt in self._retrying():
                with attempt:
                    completion = await self._client.chat.completions.create(**payload)
        except _RETRYABLE as exc:
            raise UpstreamError(
                f"Generation model unavailable: {exc}",
                code="GENERATION_UNAVAILABLE",
                status_code=503,
            ) from exc
        except APIStatusError as exc:
            raise UpstreamError(
                f"Generation model rejected the request ({exc.status_code})",
                code="GENERATION_REQUEST_FAILED",
            ) from exc

        if completion is None:  # pragma: no cover - reraise=True makes this rare
            raise UpstreamError(
                "Generation model returned no completion",
                code="GENERATION_UNAVAILABLE",
                status_code=503,
            )

        choice = completion.choices[0] if completion.choices else None
        text = (choice.message.content if choice and choice.message else None) or ""
        usage = GenerationUsage(
            prompt_tokens=getattr(completion.usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(completion.usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(completion.usage, "total_tokens", 0) or 0,
        )
        logger.info(
            "generation_completed",
            provider=self.name,
            model=payload["model"],
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return GenerationResult(
            text=text,
            model=str(payload["model"]),
            provider=self.name,
            usage=usage,
            finish_reason=getattr(choice, "finish_reason", None) if choice else None,
        )

    async def stream(
        self, messages: Sequence[ChatMessage], **options: Any
    ) -> AsyncIterator[str]:
        payload = self._payload(messages, options)
        payload["stream"] = True
        started = time.perf_counter()
        emitted = 0
        try:
            stream = await self._client.chat.completions.create(**payload)
            async for event in stream:
                if not event.choices:
                    continue
                delta = event.choices[0].delta
                piece = getattr(delta, "content", None)
                if piece:
                    emitted += len(piece)
                    yield piece
        except _RETRYABLE as exc:
            raise UpstreamError(
                f"Generation model unavailable: {exc}",
                code="GENERATION_UNAVAILABLE",
                status_code=503,
            ) from exc
        except APIStatusError as exc:
            raise UpstreamError(
                f"Generation model rejected the request ({exc.status_code})",
                code="GENERATION_REQUEST_FAILED",
            ) from exc
        finally:
            logger.info(
                "generation_streamed",
                provider=self.name,
                model=payload["model"],
                characters=emitted,
                latency_ms=round((time.perf_counter() - started) * 1000, 2),
            )

    async def aclose(self) -> None:
        await self._client.close()


class TemplateGenerationProvider:
    """Deterministic extractive answers — used when no OpenAI key is present."""

    name = "offline-extractive"

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model = "offline-extractive-v1"
        self.available = False
        self._tokens = get_token_counter()

    async def generate(
        self, messages: Sequence[ChatMessage], **options: Any
    ) -> GenerationResult:
        text = self.compose(messages, options.get("sources"))
        usage = GenerationUsage(
            prompt_tokens=self._tokens.count(
                "\n".join(message.content for message in messages)
            ),
            completion_tokens=self._tokens.count(text),
        )
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens
        logger.info(
            "generation_completed_offline",
            provider=self.name,
            characters=len(text),
        )
        return GenerationResult(
            text=text,
            model=self.model,
            provider=self.name,
            usage=usage,
            finish_reason="stop",
            degraded=True,
        )

    async def stream(
        self, messages: Sequence[ChatMessage], **options: Any
    ) -> AsyncIterator[str]:
        text = self.compose(messages, options.get("sources"))
        for piece in _stream_pieces(text):
            yield piece

    async def aclose(self) -> None:
        return None

    # --- composition ------------------------------------------------------
    def compose(
        self, messages: Sequence[ChatMessage], sources: Sequence[Any] | None = None
    ) -> str:
        question = _last_user_message(messages)
        arabic = bool(_ARABIC_RE.search(question))
        passages = _passages(messages, sources)

        if not passages:
            return (
                "لم أعثر على معلومات كافية في قاعدة معرفة ناوي للإجابة على هذا السؤال. "
                "جرّب صياغة السؤال بذكر المنطقة أو الكومباوند أو الميزانية، "
                "أو اطلب التحدث مع مستشار عقاري."
                if arabic
                else "I could not find anything in the Nawy knowledge base that answers "
                "that. Try naming an area, a compound or a budget, or ask to speak "
                "with a property consultant."
            )

        selected = _best_sentences(question, passages, limit=4)
        header = (
            "إليك ما وجدته في بيانات ناوي:"
            if arabic
            else "Here is what the Nawy knowledge base says:"
        )
        footer = (
            "هذه إجابة مستخرجة من المصادر أعلاه (وضع بدون مفتاح توليد). "
            "للحصول على تفاصيل محدثة تواصل مع مستشار ناوي."
            if arabic
            else "This answer was extracted directly from the sources above "
            "(no generation key configured). A Nawy consultant can confirm live "
            "availability and pricing."
        )
        body = "\n".join(f"- {sentence}" for sentence in selected)
        return f"{header}\n{body}\n\n{footer}"


# --------------------------------------------------------------------------
def _last_user_message(messages: Sequence[ChatMessage]) -> str:
    """The user's actual question, stripped of the CONTEXT block prepended to it."""
    for message in reversed(messages):
        if message.role == "user":
            content = message.content
            # `build_generation_messages` renders "<CONTEXT…>\n\nQUESTION: <q>".
            marker = content.rfind("QUESTION: ")
            return content[marker + len("QUESTION: ") :].strip() if marker != -1 else content
    return messages[-1].content if messages else ""


def _passages(
    messages: Sequence[ChatMessage], sources: Sequence[Any] | None
) -> list[str]:
    """Collect candidate context text from explicit sources or the prompt."""
    passages: list[str] = []
    for source in sources or []:
        if isinstance(source, str):
            passages.append(source)
        elif isinstance(source, dict):
            content = source.get("content") or source.get("text") or ""
            title = source.get("title") or ""
            if content:
                passages.append(f"{title}: {content}" if title else content)
        else:  # dataclass / pydantic object exposing .content
            content = getattr(source, "content", "")
            if content:
                title = getattr(source, "title", "") or ""
                passages.append(f"{title}: {content}" if title else content)
    if passages:
        return passages

    # No explicit sources: fall back to the CONTEXT block the graph prepends to
    # the user message, and to tool output.
    #
    # `system` is deliberately excluded. It holds the agent's own instructions,
    # and echoing those back was leaking the system prompt into answers whenever
    # no generation key was configured.
    for message in messages:
        if message.role == "tool" and len(message.content) > 80:
            passages.append(message.content)

        if message.role == "user" and "CONTEXT" in message.content:
            block = message.content
            marker = block.rfind("QUESTION: ")
            if marker != -1:
                block = block[:marker]
            # Entries look like "[1] Title (uri)\n<body>", separated by blank lines.
            for entry in block.split("\n\n")[1:]:
                cleaned = entry.strip()
                if cleaned:
                    passages.append(cleaned)

    return passages


def _best_sentences(question: str, passages: Sequence[str], limit: int = 4) -> list[str]:
    """Pick the sentences with the strongest lexical overlap with the question."""
    from app.providers.rerank import LexicalRerankProvider

    sentences: list[str] = []
    for passage in passages:
        for raw in _SENTENCE_SPLIT_RE.split(passage):
            sentence = " ".join(raw.split())
            if len(sentence) >= 40:
                sentences.append(sentence)
    if not sentences:
        return [" ".join(passage.split())[:400] for passage in passages[:limit]]

    scorer = LexicalRerankProvider()
    scores = scorer.score(question, sentences)
    ranked = sorted(zip(sentences, scores, strict=True), key=lambda item: item[1], reverse=True)

    chosen: list[str] = []
    seen: set[str] = set()
    for sentence, score in ranked:
        key = sentence[:80].lower()
        if key in seen:
            continue
        seen.add(key)
        chosen.append(sentence if len(sentence) <= 400 else sentence[:397] + "…")
        if len(chosen) >= limit:
            break
        if score <= 0 and len(chosen) >= 2:
            break
    return chosen


def _stream_pieces(text: str, group: int = 6) -> list[str]:
    """Split rendered text into small deltas so the SSE contract still applies."""
    words = text.split(" ")
    pieces: list[str] = []
    for index in range(0, len(words), group):
        piece = " ".join(words[index : index + group])
        if index + group < len(words):
            piece += " "
        pieces.append(piece)
    return pieces


def build_generation_provider(settings: Settings | None = None):
    """OpenAI when a key is configured, otherwise the extractive template."""
    cfg = settings or get_settings()
    if cfg.openai_enabled:
        logger.info(
            "generation_provider_selected", provider="openai", model=cfg.generation_model
        )
        return OpenAIGenerationProvider(cfg)
    logger.warning(
        "generation_provider_fallback",
        provider="offline-extractive",
        reason="OPENAI_API_KEY is not configured",
    )
    return TemplateGenerationProvider(cfg)

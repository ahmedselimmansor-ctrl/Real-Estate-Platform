"""Web search, backed by the OpenAI Responses API's built-in `web_search` tool.

Used for questions the knowledge base cannot answer by construction: today's
mortgage rates, market news, a developer announcement. When `OPENAI_API_KEY` is
absent the tool returns a structured "no web access" result so the agent can say
so honestly instead of hallucinating.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.tools.base import Tool, ToolContext, ToolResult

logger = get_logger("rag-svc.tools.web")

MAX_SNIPPET_CHARS = 400


class WebSearchArgs(BaseModel):
    query: str = Field(
        min_length=3,
        max_length=400,
        description="The search query, phrased as you would type it into a search engine",
    )
    recency: str | None = Field(
        default=None,
        description="Optional hint: 'day', 'week', 'month' or 'year' for recent results",
    )


class WebSearchTool(Tool[WebSearchArgs]):
    name = "web_search"
    description = (
        "Search the public web for current information that the TopChoice property "
        "catalogue does not contain — mortgage interest rates, market news, "
        "developer announcements, economic figures. Do not use it for questions "
        "about specific TopChoice listings."
    )
    args_model = WebSearchArgs
    timeout = 25.0

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def available(self) -> bool:
        return self._settings.openai_enabled

    async def run(self, args: WebSearchArgs, context: ToolContext) -> ToolResult:
        if not self.available:
            return ToolResult(
                name=self.name,
                ok=False,
                error=(
                    "web access is not configured on this deployment — tell the user "
                    "you cannot look up live external information right now"
                ),
            )

        payload: dict[str, Any] = {
            "model": self._settings.generation_model,
            "tools": [{"type": "web_search"}],
            "tool_choice": {"type": "web_search"},
            "input": self._input_text(args),
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self._settings.openai_base_url}/responses",
                headers={
                    "authorization": f"Bearer {self._settings.openai_api_key}",
                    "content-type": "application/json",
                },
                json=payload,
            )

            if response.status_code >= 400:
                detail = response.text[:200]
                logger.warning("web_search_failed", status=response.status_code, detail=detail)
                return ToolResult(
                    name=self.name,
                    ok=False,
                    error=f"web search unavailable (HTTP {response.status_code})",
                )

            body = response.json()

        text, citations = self._extract(body)

        if not text and not citations:
            return ToolResult(
                name=self.name,
                ok=True,
                summary="The web search returned nothing useful.",
                output={"query": args.query, "results": []},
            )

        sources = [
            {
                "type": "web",
                "title": citation.get("title") or urlparse(citation["url"]).netloc,
                "url": citation["url"],
                "domain": urlparse(citation["url"]).netloc,
                "snippet": (citation.get("snippet") or "")[:MAX_SNIPPET_CHARS],
            }
            for citation in citations
            if citation.get("url")
        ]

        summary = (
            text[:1500]
            if text
            else "\n".join(
                f"- {source['title']} ({source['domain']}): {source['snippet']}"
                for source in sources[:5]
            )
        )

        return ToolResult(
            name=self.name,
            ok=True,
            summary=summary,
            output={"query": args.query, "text": text, "results": sources},
            sources=sources[:5],
        )

    # ----------------------------------------------------------------- utils

    def _input_text(self, args: WebSearchArgs) -> str:
        instruction = f"Search the web and answer concisely, with sources: {args.query}"
        if args.recency:
            instruction += f" (prioritise results from the last {args.recency})"
        return instruction

    def _extract(self, body: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        """Pull the answer text and URL citations out of a Responses payload."""
        # `output_text` is the convenience field; fall back to walking `output`
        # so the tool keeps working if the provider drops it.
        text = str(body.get("output_text") or "").strip()
        citations: list[dict[str, Any]] = []
        seen: set[str] = set()

        for item in body.get("output", []) or []:
            for content in item.get("content", []) or []:
                if not text and content.get("type") in {"output_text", "text"}:
                    text = str(content.get("text") or "").strip()

                for annotation in content.get("annotations", []) or []:
                    url = annotation.get("url")
                    if url and url not in seen:
                        seen.add(url)
                        citations.append(
                            {
                                "url": url,
                                "title": annotation.get("title"),
                                "snippet": annotation.get("text") or "",
                            }
                        )

        # Some responses only put links inline in the prose.
        if not citations and text:
            for url in dict.fromkeys(re.findall(r"https?://[^\s)\]]+", text)):
                citations.append({"url": url, "title": None, "snippet": ""})

        return text, citations[:8]


__all__ = ["WebSearchTool"]

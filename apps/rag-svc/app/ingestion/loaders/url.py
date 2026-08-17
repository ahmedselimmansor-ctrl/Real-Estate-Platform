"""Arbitrary web pages -> markdown documents.

Fetch with httpx, strip chrome (nav/script/footer) with BeautifulSoup, convert
the remaining article to markdown with markdownify, and let the chunker use the
markdown headings as section boundaries.

The endpoint that reaches this loader is service-token protected (CONTRACT §5),
and requests are additionally guarded against SSRF: private, loopback and
link-local destinations are refused unless ``RAG_INGEST_ALLOW_PRIVATE_URLS`` is
explicitly enabled for local development.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify

from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.logging import get_logger
from app.ingestion.documents import RawDocument, document_metadata
from app.ingestion.loaders.base import IngestOptions

logger = get_logger("rag-svc.loader.url")

SOURCE = "url"
SOURCE_TYPE = "url"

#: Elements that never carry answerable content.
_STRIP_TAGS = (
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "form",
    "nav",
    "header",
    "footer",
    "aside",
    "template",
)

#: Most-specific-first candidates for the main content container.
_CONTENT_SELECTORS = ("main", "article", "[role=main]", "#content", ".content", "body")

_BLANK_LINES_RE = re.compile(r"\n{3,}")
_TRAILING_SPACE_RE = re.compile(r"[ \t]+\n")


class UrlNotAllowedError(ApiError):
    def __init__(self, url: str, reason: str) -> None:
        super().__init__(
            "URL_NOT_ALLOWED",
            f"Refusing to ingest {url}: {reason}",
            status_code=422,
        )


def _is_public_host(host: str) -> bool:
    """Resolve ``host`` and require every address to be globally routable."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        address = info[4][0]
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:  # pragma: no cover - getaddrinfo always returns IPs
            return False
        if (
            parsed.is_private
            or parsed.is_loopback
            or parsed.is_link_local
            or parsed.is_reserved
            or parsed.is_multicast
        ):
            return False
    return True


def validate_url(url: str, settings: Settings | None = None) -> str:
    """Return a normalised URL or raise :class:`UrlNotAllowedError`."""
    cfg = settings or get_settings()
    candidate = (url or "").strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https"):
        raise UrlNotAllowedError(candidate, "only http(s) URLs can be ingested")
    if not parsed.hostname:
        raise UrlNotAllowedError(candidate, "the URL has no host")
    if not cfg.rag_ingest_allow_private_urls and not _is_public_host(parsed.hostname):
        raise UrlNotAllowedError(
            candidate,
            "the host resolves to a private or unroutable address "
            "(set RAG_INGEST_ALLOW_PRIVATE_URLS=true to allow it in development)",
        )
    return candidate


def html_to_markdown(html: str) -> tuple[str, str]:
    """Return ``(title, markdown)`` for a fetched HTML page."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(list(_STRIP_TAGS)):
        tag.decompose()

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        heading = soup.find("h1")
        title = heading.get_text(strip=True) if heading else ""

    container: Any = None
    for selector in _CONTENT_SELECTORS:
        container = soup.select_one(selector)
        if container is not None:
            break
    markup = str(container) if container is not None else str(soup)

    markdown = markdownify(markup, heading_style="ATX", strip=["a", "img"])
    markdown = _TRAILING_SPACE_RE.sub("\n", markdown)
    markdown = _BLANK_LINES_RE.sub("\n\n", markdown).strip()
    return title, markdown


async def fetch_page(url: str, settings: Settings | None = None) -> tuple[str, str, str]:
    """Fetch ``url``; returns ``(final_url, content_type, body)``."""
    cfg = settings or get_settings()
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(cfg.rag_http_timeout, connect=10.0),
        follow_redirects=True,
        max_redirects=3,
        headers={
            "User-Agent": "topchoice-rag-svc/1.0 (+knowledge-base ingestion)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        body = response.text
        if len(body.encode("utf-8", errors="ignore")) > cfg.rag_ingest_url_max_bytes:
            body = body[: cfg.rag_ingest_url_max_bytes]
            logger.warning("url_body_truncated", url=url, limit=cfg.rag_ingest_url_max_bytes)
        return str(response.url), content_type, body


def build_document(
    url: str, final_url: str, content_type: str, body: str
) -> RawDocument | None:
    if "html" in content_type.lower() or body.lstrip().startswith("<"):
        title, text = html_to_markdown(body)
    else:
        title, text = "", body.strip()
    if not text:
        return None

    source_id = hashlib.sha256(final_url.encode("utf-8")).hexdigest()[:32]
    lang = "ar" if _looks_arabic(text) else "en"
    return RawDocument(
        source_type=SOURCE_TYPE,
        source_id=source_id,
        title=title or final_url,
        text=text,
        lang=lang,
        uri=final_url,
        metadata=document_metadata(
            type="url",
            url=final_url,
            requestedUrl=url if url != final_url else None,
            title=title or final_url,
            contentType=content_type or None,
            lang=lang,
            recordId=source_id,
        ),
    )


def _looks_arabic(text: str) -> bool:
    sample = text[:4000]
    arabic = sum(1 for char in sample if "؀" <= char <= "ۿ")
    return arabic > len(sample) * 0.2


class UrlLoader:
    """Fetches the URLs supplied in the ingest request."""

    source = SOURCE
    source_type = SOURCE_TYPE
    #: Never prune: the URL corpus is whatever operators have ingested so far.
    prunable = False

    async def load(self, options: IngestOptions) -> list[RawDocument]:
        settings = get_settings()
        targets = [validate_url(url, settings) for url in options.urls if url]
        if not targets:
            raise ApiError(
                "URL_REQUIRED",
                "Ingesting the 'url' source requires at least one entry in 'urls'",
                status_code=422,
            )

        documents: list[RawDocument] = []
        for url in targets:
            try:
                final_url, content_type, body = await fetch_page(url, settings)
            except httpx.HTTPStatusError as exc:
                logger.warning("url_fetch_status", url=url, status=exc.response.status_code)
                continue
            except (httpx.HTTPError, OSError) as exc:
                logger.warning("url_fetch_failed", url=url, error=str(exc))
                continue

            document = build_document(url, final_url, content_type, body)
            if document is None:
                logger.warning("url_empty_after_extraction", url=url)
                continue
            documents.append(document)

        logger.info("urls_loaded", requested=len(targets), documents=len(documents))
        return documents

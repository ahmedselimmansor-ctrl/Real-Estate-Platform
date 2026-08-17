# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# apps/rag-svc — TopChoice RAG chat service
# Multi-stage, non-root, uvicorn on 0.0.0.0:8001 (docs/CONTRACT.md §1, §10.2)
# ---------------------------------------------------------------------------

# ------------------------------------------------------------- builder -----
FROM python:3.14-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TIKTOKEN_CACHE_DIR=/opt/tiktoken

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY requirements.txt ./
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt

# Warm the tiktoken BPE cache at build time so the container never needs
# network access to count tokens. Failure is tolerated: the chunker falls back
# to a deterministic heuristic counter when the encoding cannot be loaded.
RUN mkdir -p "${TIKTOKEN_CACHE_DIR}" \
    && python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')" || true

# ------------------------------------------------------------- runtime -----
FROM python:3.14-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PATH="/opt/venv/bin:${PATH}" \
    TIKTOKEN_CACHE_DIR=/opt/tiktoken \
    PORT=8001

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 topchoice \
    && useradd --uid 10001 --gid topchoice --create-home --shell /usr/sbin/nologin topchoice

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder --chown=topchoice:topchoice /opt/tiktoken /opt/tiktoken

WORKDIR /app

COPY --chown=topchoice:topchoice alembic.ini ./alembic.ini
COPY --chown=topchoice:topchoice alembic ./alembic
COPY --chown=topchoice:topchoice docker/entrypoint.sh /usr/local/bin/rag-entrypoint
COPY --chown=topchoice:topchoice app ./app

RUN chmod +x /usr/local/bin/rag-entrypoint \
    && mkdir -p /app/seed \
    && chown -R topchoice:topchoice /app

USER topchoice

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health').status==200 else 1)"

ENTRYPOINT ["rag-entrypoint"]
CMD ["uvicorn"]

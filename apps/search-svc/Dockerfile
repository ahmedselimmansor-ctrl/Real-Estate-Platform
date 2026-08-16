# =============================================================================
# search-svc — Python 3.12 / FastAPI / Elasticsearch 8
# Multi-stage, non-root, uvicorn on 0.0.0.0:8000 (--reload when APP_ENV=development)
# =============================================================================

# --------------------------------------------------------------------- base --
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# ------------------------------------------------------------------ builder --
FROM base AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv "$VIRTUAL_ENV"

COPY requirements.txt requirements-dev.txt ./

# INSTALL_DEV=true also installs pytest/ruff/mypy (used by CI images).
ARG INSTALL_DEV=false
RUN python -m pip install --upgrade pip setuptools wheel \
 && python -m pip install -r requirements.txt \
 && if [ "$INSTALL_DEV" = "true" ]; then python -m pip install -r requirements-dev.txt; fi

# ------------------------------------------------------------------ runtime --
FROM base AS runtime

# curl is handy for debugging ES connectivity from inside the container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1001 nawy \
 && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash nawy

COPY --from=builder --chown=nawy:nawy /opt/venv /opt/venv

COPY --chown=nawy:nawy pyproject.toml ./
COPY --chown=nawy:nawy docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chown=nawy:nawy app ./app
COPY --chown=nawy:nawy tests ./tests

# /app/seed is bind-mounted read-only by docker compose (./seed:/app/seed:ro).
RUN mkdir -p /app/seed \
 && chmod +x /app/docker-entrypoint.sh \
 && chown -R nawy:nawy /app

USER nawy

ENV PORT=8000 \
    APP_ENV=development \
    SEED_DIR=/app/seed

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]

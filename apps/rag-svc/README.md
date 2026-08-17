# rag-svc — TopChoice customer-support agent

LangGraph RAG agent behind `/api/chat`. Retrieval is hybrid (pgvector + Postgres
full-text, fused with RRF, then reranked); generation streams over SSE; the agent
can call tools against the other TopChoice services and the public web.

```
POST /api/chat/threads                 → {threadId, guestToken?}
GET  /api/chat/threads/{id}/messages   → transcript (paginated)
POST /api/chat/message                 → JSON, or text/event-stream when stream=true
GET  /api/chat/stream/{threadId}       → replay the last streamed answer
POST /api/chat/feedback                → 👍 / 👎 on an assistant message
POST /api/chat/ingest                  [X-Service-Token] → {runId}
GET  /api/chat/ingest/status/{runId}   [X-Service-Token]
GET  /health, /health/ready
```

## The graph

```
                     ┌──────────────┐
   question ───────► │ load_memory  │  window + rolling summary + buyer profile
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐  empty / too long / prompt injection
                     │    guard     │ ──────────────────────────────► END
                     └──────┬───────┘                         (canned reply)
                            ▼
                     ┌──────────────┐
                     │    route     │  smalltalk │ knowledge │ listing_search │ web │ handoff
                     └──┬────┬───┬──┘
          smalltalk     │    │   │      listing_search / web / handoff
        ┌───────────────┘    │   └──────────────────────────┐
        │                    ▼ knowledge                    ▼
        │            ┌───────────────┐              ┌──────────────┐
        │            │ rewrite_query │◄─── retry ───│ call_tools   │
        │            └───────┬───────┘   (≤2)       └──────┬───────┘
        │                    ▼                             │
        │            ┌───────────────┐                     │
        │            │   retrieve    │ pgvector + FTS      │
        │            │  (+ rerank)   │ → RRF → qwen3-rerank│
        │            └───────┬───────┘                     │
        │                    ▼                             │
        │            ┌───────────────┐  insufficient ──────┘
        │            │ grade_context │
        │            └───────┬───────┘
        │                    ▼ sufficient
        └──────────────►┌──────────┐     ┌─────────┐
                        │ generate │────►│ persist │────► END
                        └──────────┘     └─────────┘
```

`grade_context` is what stops the bot answering from thin context: if the
retrieved chunks do not actually contain the answer it re-runs
`rewrite_query → retrieve` (capped at 2 iterations by `MAX_ITERATIONS`), and only
then falls through to tools.

LangGraph is optional. If the package is missing, `_run_sequential` executes the
same nodes along the same edges — the service still answers.

## Model matrix

| Stage | Model | Provider | Env |
|---|---|---|---|
| Embeddings | `tongyi-embedding-vision-flash` | Alibaba Cloud Model Studio (DashScope, OpenAI-compatible `/embeddings`) | `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIM` |
| Reranking | `qwen3-rerank` | DashScope native `/services/rerank/text-rerank/text-rerank` | `DASHSCOPE_API_KEY`, `DASHSCOPE_NATIVE_BASE_URL`, `RERANK_MODEL` |
| Generation | `gpt-5.6-luna` | OpenAI `/chat/completions` (streaming) | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `GENERATION_MODEL` |
| Web search | `gpt-5.6-luna` + built-in `web_search` tool | OpenAI `/responses` | `OPENAI_API_KEY` |

All provider HTTP lives in `app/providers/` and `app/tools/web_search.py` — no
call site anywhere else talks to a model API, so swapping a model or an endpoint
is an env change.

> **Verify `GENERATION_MODEL`.** It defaults to the `gpt-5.6-luna` string from the
> project brief. If your OpenAI account exposes a different id, set
> `GENERATION_MODEL` in `.env`; nothing else changes.

### Running without API keys

Every provider degrades instead of failing, so `docker compose up` works with an
empty `.env`:

| Missing key | What happens |
|---|---|
| `DASHSCOPE_API_KEY` | Embeddings become deterministic hash vectors; reranking becomes lexical overlap scoring. Retrieval still returns *something*, ranked worse. |
| `OPENAI_API_KEY` | Generation becomes an extractive template that quotes the retrieved chunks; routing/rewriting/grading fall back to deterministic keyword logic; `web_search` returns a structured "web access is not configured" result the agent narrates honestly. |
| `JWT_ACCESS_SECRET` | Every caller is treated as a guest. |
| `INTERNAL_SERVICE_TOKEN` | `POST /ingest` rejects everything. |

The startup log prints exactly which of these are active.

## Tools

| Tool | Calls | Notes |
|---|---|---|
| `search_listings` | search-svc `GET /api/search` | Returns property cards that become citation sources |
| `get_property_details` | api-core `GET /api/v1/properties/:idOrSlug` | Full record for one unit |
| `calculate_mortgage` | reports-svc `POST /api/reports/mortgage/calculate` | Monthly payment + total interest |
| `create_lead` | api-core `POST /api/v1/leads` | **Requires explicit user confirmation** (`requires_confirmation`) |
| `escalate_to_human` | — | Records a handoff and points at `/contact` |
| `web_search` | OpenAI Responses API | Live external facts only |

`ROUTE_TOOLS` narrows the menu per route so the model cannot web-search a
listings question. Every tool contains its own failures: `Tool.invoke` converts
timeouts, bad arguments and upstream errors into a `ToolResult` with `error` set,
which the agent narrates rather than crashing the stream.

## Memory

Three layers (`app/memory/thread_memory.py`):

1. **Window** — last `RAG_MEMORY_WINDOW` turns verbatim.
2. **Summary** — older turns compressed into `chat_summaries`, refreshed every 8 messages.
3. **Profile** — budget / area / bedrooms / property type parsed from what the
   user said, stored on `chat_threads.metadata` and reused across their threads.

## Ingestion

```bash
curl -X POST http://localhost:8001/api/chat/ingest \
  -H "X-Service-Token: $INTERNAL_SERVICE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"source": "all"}'
```

Sources: `properties` (MongoDB, falling back to `seed/properties.json`), `faq`
(`seed/faq.json`, EN + AR as separate chunks), `compounds`/`developers`/`areas`,
and `url` for arbitrary pages. Chunks are ~500 tokens with ~80 overlap, upserted
by checksum so re-ingestion is idempotent.

## Trying it

```bash
curl -sX POST http://localhost:8001/api/chat/message \
  -H 'content-type: application/json' \
  -d '{"message":"What payment plans are available in New Cairo?"}' | jq
```

Streaming (SSE events: `token`, `tool_start`, `tool_end`, `sources`, `done`, `error`):

```bash
curl -N -X POST http://localhost:8001/api/chat/message \
  -H 'content-type: application/json' \
  -d '{"message":"Show me 3-bedroom villas under 15M EGP","stream":true}'
```

## Tests

```bash
pytest
```

`tests/conftest.py` blanks every API key before importing the app, so the suite
runs fully offline against the deterministic fallbacks.

## Privacy note

`chat_threads.user_id` is NULL for guests, and a guest can only re-read their own
thread with the HMAC `guestToken` returned when it was created — thread ids alone
are not readable.

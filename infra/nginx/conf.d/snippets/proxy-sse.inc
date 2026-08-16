# -----------------------------------------------------------------------------
# Server-Sent Events tuning (rag-svc chat streaming, CONTRACT §6 `/api/chat`).
#
# Without every one of these, tokens pile up in an nginx buffer and the user
# sees the whole answer at once — or the connection dies mid-answer.
# Include AFTER proxy-common.inc (which intentionally leaves buffering and the
# read/send timeouts unset so this file can own them).
# -----------------------------------------------------------------------------

# Never buffer the response body: each `data: ...` frame is flushed immediately.
proxy_buffering         off;
proxy_request_buffering off;
proxy_cache             off;

# Keep the chunked framing that FastAPI's StreamingResponse emits.
chunked_transfer_encoding on;

# Belt and braces: tell any intermediary (and echo to the client) not to buffer.
proxy_set_header X-Accel-Buffering no;
add_header       X-Accel-Buffering no always;

# gzip would coalesce frames — SSE must stay uncompressed.
gzip off;

# A long RAG answer with tool calls can legitimately stream for minutes.
proxy_read_timeout 600s;
proxy_send_timeout 600s;

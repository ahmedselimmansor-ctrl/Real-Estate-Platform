# -----------------------------------------------------------------------------
# Shared proxy behaviour for every backend location.
#
# Two deliberate omissions, because nginx rejects duplicate directives inside a
# single block and each location needs its own value:
#   * `Connection`  -> `""` for upstream keep-alive (APIs) or
#                      `$connection_upgrade` for WebSocket passthrough (HMR).
#   * `proxy_read_timeout` / `proxy_send_timeout` / `proxy_buffering`
#                   -> short for APIs, long and unbuffered for SSE and HMR.
# -----------------------------------------------------------------------------

proxy_http_version 1.1;

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;
# CONTRACT §4 — correlation id, minted here when the client omits it.
proxy_set_header X-Request-Id      $req_id;

proxy_connect_timeout 5s;

proxy_buffer_size       32k;
proxy_buffers           16 16k;
proxy_busy_buffers_size 64k;
proxy_temp_file_write_size 128k;

# Let backend-generated 4xx/5xx bodies (the JSON error envelope) reach the
# client untouched; only nginx-generated errors hit `error_page`.
proxy_intercept_errors off;
proxy_redirect         off;

# Idempotent requests only — nginx never replays POST/PATCH unless
# `non_idempotent` is listed, which it deliberately is not.
proxy_next_upstream         error timeout http_502 http_503 http_504;
proxy_next_upstream_tries   2;
proxy_next_upstream_timeout 10s;

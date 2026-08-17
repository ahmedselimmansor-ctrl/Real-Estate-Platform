# -----------------------------------------------------------------------------
# nginx-generated errors, rendered in the contract's error envelope
# (CONTRACT §4) so a client never has to parse an HTML error page:
#   {"success":false,"error":{"code":"...","message":"...","details":[]}}
#
# Included once inside the HTTPS server block; referenced from the /api/*
# locations via `error_page ... = @name;`.
# -----------------------------------------------------------------------------

location @error_rate_limited {
    default_type application/json;
    include /etc/nginx/conf.d/snippets/security-headers.inc;
    add_header Cache-Control "no-store" always;
    add_header Retry-After   "60"       always;
    return 429 '{"success":false,"error":{"code":"RATE_LIMITED","message":"Too many requests. Please slow down and retry shortly.","details":[]}}';
}

location @error_payload_too_large {
    default_type application/json;
    include /etc/nginx/conf.d/snippets/security-headers.inc;
    add_header Cache-Control "no-store" always;
    return 413 '{"success":false,"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body exceeds the 25 MB limit.","details":[]}}';
}

location @error_service_unavailable {
    default_type application/json;
    include /etc/nginx/conf.d/snippets/security-headers.inc;
    add_header Cache-Control "no-store" always;
    add_header Retry-After   "10"       always;
    return 503 '{"success":false,"error":{"code":"SERVICE_UNAVAILABLE","message":"Upstream service is starting up or unreachable. Check `make ps` / `make health`.","details":[]}}';
}

location @error_gateway_timeout {
    default_type application/json;
    include /etc/nginx/conf.d/snippets/security-headers.inc;
    add_header Cache-Control "no-store" always;
    add_header Retry-After   "10"       always;
    # Covers both "took too long to answer" and "container is down, so the TCP
    # connect itself timed out" — nginx reports both as 504.
    return 504 '{"success":false,"error":{"code":"GATEWAY_TIMEOUT","message":"Upstream service did not answer in time (it may still be starting). Check `make ps` / `make health`.","details":[]}}';
}

# Friendly HTML for the web app while the Next.js container is still booting.
location @web_unavailable {
    default_type text/html;
    include /etc/nginx/conf.d/snippets/security-headers.inc;
    add_header Retry-After   "5"        always;
    add_header Cache-Control "no-store" always;
    return 503 '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>TopChoice — starting up</title><style>html{color-scheme:light dark}body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b1220;color:#e6edf7}main{max-width:34rem;padding:2rem;text-align:center}h1{color:#00A3E0;font-size:1.5rem;margin:0 0 .75rem}code{background:#16203a;padding:.15rem .4rem;border-radius:.3rem}</style></head><body><main><h1>TopChoice is starting up</h1><p>The <code>web</code> container is not answering yet. This page refreshes every 5 seconds.</p><p>Still stuck? Run <code>make health</code> or <code>make logs-web</code>.</p></main></body></html>';
}

# -----------------------------------------------------------------------------
# Security response headers.
#
# `add_header` does NOT inherit into a location that declares its own headers,
# so this snippet is included in *every* location rather than once per server.
# All headers use `always` so they survive error responses too.
# -----------------------------------------------------------------------------

# HSTS: the whole stack is HTTPS-only behind this proxy (port 80 just redirects).
# `preload` is intentionally omitted — never preload a self-signed localhost host.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

add_header X-Content-Type-Options    "nosniff"                        always;
add_header X-Frame-Options           "SAMEORIGIN"                     always;
add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection          "0"                              always;
add_header Permissions-Policy        "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin"                   always;
add_header Content-Security-Policy   $topchoice_csp                        always;

# Echo the correlation id back so the browser/network tab can be matched to logs.
add_header X-Request-Id              $req_id                          always;

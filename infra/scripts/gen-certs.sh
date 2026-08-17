#!/usr/bin/env bash
# =============================================================================
# gen-certs.sh — self-signed TLS certificate for the local nginx edge.
#
#   ./infra/scripts/gen-certs.sh            # create if missing / expiring soon
#   ./infra/scripts/gen-certs.sh --force    # always regenerate
#   ./infra/scripts/gen-certs.sh --days 365
#
# Writes infra/nginx/certs/localhost.{crt,key} — the exact paths mounted into
# the nginx container by docker-compose.yml.
#
# SANs: DNS:localhost, DNS:*.localhost, DNS:nginx, IP:127.0.0.1, IP:::1
# =============================================================================
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

DAYS=825          # max accepted by Apple platforms for server certs
FORCE=0
RENEW_WINDOW_DAYS=30
QUIET=0

usage() {
  cat <<EOF
${C_BOLD}gen-certs.sh${C_RESET} — generate the self-signed localhost certificate.

Usage: infra/scripts/gen-certs.sh [options]

Options:
  --force            Regenerate even if a valid certificate already exists
  --days <n>         Validity in days (default: ${DAYS}, Apple caps this at 825)
  --quiet            Only print errors
  -h, --help         Show this help

Output:
  ${CERT_CRT}
  ${CERT_KEY}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)  FORCE=1; shift ;;
    --quiet)  QUIET=1; shift ;;
    --days)   DAYS="${2:?--days requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

say() { [[ "$QUIET" -eq 1 ]] || log "$@"; }
say_ok() { [[ "$QUIET" -eq 1 ]] || ok "$@"; }

require_cmd openssl "Install it with: sudo apt-get install openssl | brew install openssl"

mkdir -p "$CERT_DIR"

# --------------------------------------------------------------- idempotency -
if [[ "$FORCE" -eq 0 && -s "$CERT_CRT" && -s "$CERT_KEY" ]]; then
  if openssl x509 -in "$CERT_CRT" -noout -checkend $((RENEW_WINDOW_DAYS * 86400)) >/dev/null 2>&1; then
    # Make sure the key actually belongs to the certificate.
    crt_mod="$(openssl x509 -noout -modulus -in "$CERT_CRT" 2>/dev/null | openssl md5 || true)"
    key_mod="$(openssl rsa  -noout -modulus -in "$CERT_KEY" 2>/dev/null | openssl md5 || true)"
    if [[ -n "$crt_mod" && "$crt_mod" == "$key_mod" ]]; then
      expiry="$(openssl x509 -in "$CERT_CRT" -noout -enddate | cut -d= -f2)"
      say_ok "Certificate already valid until ${C_BOLD}${expiry}${C_RESET} — nothing to do."
      say    "  ${C_DIM}(use --force to regenerate)${C_RESET}"
      exit 0
    fi
    warn "Certificate and key do not match — regenerating."
  else
    warn "Certificate missing, unreadable or expiring within ${RENEW_WINDOW_DAYS} days — regenerating."
  fi
fi

# ------------------------------------------------------------------ generate -
say "Generating a self-signed certificate for ${C_BOLD}localhost${C_RESET} (${DAYS} days)..."

openssl_cnf="$(mktemp)"
trap 'rm -f "$openssl_cnf"' EXIT

# A config file (rather than -addext) keeps this working on LibreSSL/macOS and
# on OpenSSL 1.1.1 through 3.x alike.
cat >"$openssl_cnf" <<'EOF'
[ req ]
default_bits        = 2048
default_md          = sha256
prompt              = no
encrypt_key         = no
distinguished_name  = dn
x509_extensions     = v3_server

[ dn ]
C  = EG
ST = Cairo
L  = Cairo
O  = TopChoice (development)
OU = Platform
CN = localhost

[ v3_server ]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectKeyIdentifier   = hash
subjectAltName         = @alt_names

[ alt_names ]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = nginx
DNS.4 = topchoice.localhost
IP.1  = 127.0.0.1
IP.2  = ::1
EOF

tmp_key="${CERT_KEY}.tmp.$$"
tmp_crt="${CERT_CRT}.tmp.$$"
trap 'rm -f "$openssl_cnf" "$tmp_key" "$tmp_crt"' EXIT

openssl req -x509 \
  -newkey rsa:2048 \
  -nodes \
  -sha256 \
  -days "$DAYS" \
  -keyout "$tmp_key" \
  -out "$tmp_crt" \
  -config "$openssl_cnf" \
  -extensions v3_server >/dev/null 2>&1 ||
  die "openssl failed to generate the certificate. Run the same command without >/dev/null to see why."

chmod 600 "$tmp_key"
chmod 644 "$tmp_crt"
mv "$tmp_key" "$CERT_KEY"
mv "$tmp_crt" "$CERT_CRT"

say_ok "Wrote ${C_BOLD}${CERT_CRT}${C_RESET}"
say_ok "Wrote ${C_BOLD}${CERT_KEY}${C_RESET}"

if [[ "$QUIET" -eq 0 ]]; then
  fingerprint="$(openssl x509 -in "$CERT_CRT" -noout -fingerprint -sha256 | cut -d= -f2)"
  expiry="$(openssl x509 -in "$CERT_CRT" -noout -enddate | cut -d= -f2)"
  log ""
  log "  SHA-256 fingerprint : ${C_DIM}${fingerprint}${C_RESET}"
  log "  Valid until         : ${C_DIM}${expiry}${C_RESET}"
  log "  SANs                : localhost, *.localhost, nginx, topchoice.localhost, 127.0.0.1, ::1"
  log ""
  cat <<EOF
${C_BOLD}Browsers will warn until you trust this certificate.${C_RESET} Pick one:

  ${C_DIM}# just click through${C_RESET}
  Chrome/Edge : "Advanced" -> "Proceed to localhost (unsafe)"
  Firefox     : "Advanced" -> "Accept the Risk and Continue"

  ${C_DIM}# Linux (Debian/Ubuntu) - trust it system-wide${C_RESET}
  sudo cp "${CERT_CRT}" /usr/local/share/ca-certificates/topchoice-localhost.crt
  sudo update-ca-certificates

  ${C_DIM}# Linux (Fedora/RHEL)${C_RESET}
  sudo cp "${CERT_CRT}" /etc/pki/ca-trust/source/anchors/topchoice-localhost.crt
  sudo update-ca-trust extract

  ${C_DIM}# macOS - add to the login keychain and mark as trusted${C_RESET}
  sudo security add-trusted-cert -d -r trustRoot \\
    -k /Library/Keychains/System.keychain "${CERT_CRT}"

  ${C_DIM}# Firefox keeps its own store: Settings -> Privacy & Security ->${C_RESET}
  ${C_DIM}# Certificates -> View Certificates -> Authorities -> Import${C_RESET}

Restart the browser afterwards. Re-run this script with --force after the
certificate expires (${DAYS} days).
EOF
fi

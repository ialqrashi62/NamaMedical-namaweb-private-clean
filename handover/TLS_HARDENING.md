# TLS Hardening Checklist (rail 8 / CSP / HSTS)

Owner-approved deploy only. Apply in this exact order:

## 1. Cipher suite

Only enable modern AEAD ciphers:
```
TLS_AES_256_GCM_SHA384
TLS_CHACHA20_POLY1305_SHA256
TLS_AES_128_GCM_SHA256
```

Refuse `CBC`, `3DES`, `RC4`, `MD5`, `SHA1`.

## 2. TLS versions

- Listen on TLS 1.2 and 1.3 ONLY.
- Disable TLS 1.0 / 1.1 (CVE-2023-41928 etc).

## 3. HSTS

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## 4. OCSP stapling

Enable `ssl_stapling on; ssl_stapling_verify on;`

## 5. CSP

Currently report-only (rail 8). To enforce:
1. Owner decision documented in `docs/`.
2. Set `CSP_ENFORCE=true` in `.env`.
3. Switch nginx header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
4. Monitor `/csp-report` endpoint for 24 h before going fully enforce.

## 6. Certificates

- Let's Encrypt with `certbot renew --dry-run` weekly.
- Store cert path in `.env` (`TLS_CERT_PATH`, `TLS_KEY_PATH`) — never commit.

## 7. mTLS (optional, for dept-api internal)

```
ssl_verify_client optional;
ssl_client_certificate /etc/nama/ca.pem;
```

## 8. Logs

NEVER log raw requests (rail 12). Log only:
- `tenant_id` (hash) · `route` · `latency_ms` · `status` · `correlation_id`

## 9. Failure mode

If TLS handshake fails behind a corporate proxy:
- Owner decision to relax `ssl_protocols` ONLY with documented compensating control.
- NEVER accept `ssl_protocols TLSv1`.

#!/usr/bin/env bash
# ==============================================================================
# wiring-verify.sh — verify all 3 wiring tasks are live on prod (2026-07-29)
#
#  - Patient Portal API (/api/portal/*)
#  - Plans API enhancements (/api/super-admin/plans/*)
#  - PWA assets (/manifest.json, /sw.js, /offline.html, /js/pwa-registration.js)
#
# Pre-wiring state (server.js not yet patched):
#   - /api/portal/* returns 404 (route not mounted)
#   - /api/public/plans returns 200 (already wired)
#   - PWA assets return 200 (static files; always reachable)
#
# Post-wiring state (server.js patched + PM2 reloaded):
#   - /api/portal/* returns 401 (unauthenticated) — wired but auth-gated
#   - /api/public/plans returns 200 — unchanged
#   - PWA assets return 200 — unchanged
#
# Exit codes:
#   0 = all expected results observed
#   1 = at least one endpoint returned unexpected status
#
# Usage:
#   bash /var/www/namaweb/ops/wiring-verify.sh
#
# Owner note: script is read-only (curl HEAD only); safe to run anytime.
# ==============================================================================

set -e

# Internal (loopback) target — tests server-side wiring directly
INTERNAL_BASE="${INTERNAL_BASE:-http://127.0.0.1:3000}"
# External (jumanasoft.com) — tests public-facing static asset path
PUBLIC_BASE="${PUBLIC_BASE:-https://jumanasoft.com}"

# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
PASS=0
FAIL=0

test_endpoint() {
    local name="$1" url="$2" expected="$3" auth="${4:-none}"
    local code
    if [ "$auth" = "insecure" ]; then
        # -k = allow self-signed; needed for some curl invocations
        code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url")
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
    fi
    if [ "$code" = "$expected" ]; then
        printf "  \033[32m✅\033[0m %-45s HTTP %s\n" "$name" "$code"
        PASS=$((PASS + 1))
    else
        printf "  \033[31m❌\033[0m %-45s HTTP %s (expected %s)\n" "$name" "$code" "$expected"
        FAIL=$((FAIL + 1))
    fi
}

print_section() {
    printf "\n\033[1m%s\033[0m\n" "$1"
}

# ----------------------------------------------------------------------
# Section 1: Patient Portal API (the new wiring target)
# ----------------------------------------------------------------------
print_section "1. Patient Portal API — /api/portal/* (post-patch should be 401)"
test_endpoint "Portal /profile (unauth)"      "$INTERNAL_BASE/api/portal/profile"        401
test_endpoint "Portal /appointments (unauth)" "$INTERNAL_BASE/api/portal/appointments"   401
test_endpoint "Portal /lab-results (unauth)"  "$INTERNAL_BASE/api/portal/lab-results"    401
test_endpoint "Portal /prescriptions (unauth)" "$INTERNAL_BASE/api/portal/prescriptions" 401
test_endpoint "Portal /invoices (unauth)"     "$INTERNAL_BASE/api/portal/invoices"       401
test_endpoint "Portal /notifications (unauth)" "$INTERNAL_BASE/api/portal/notifications" 401

# ----------------------------------------------------------------------
# Section 2: Plans API enhancements (super-admin routes)
# ----------------------------------------------------------------------
print_section "2. Plans API — /api/super-admin/* (post-patch should be 401)"
test_endpoint "Plans catalog /plans (unauth)"  "$INTERNAL_BASE/api/super-admin/plans"     401
test_endpoint "Plans catalog /tenants (unauth)" "$INTERNAL_BASE/api/super-admin/tenants"  401
test_endpoint "Plans /tenants/:id/entitlements (unauth)" \
    "$INTERNAL_BASE/api/super-admin/tenants/1/entitlements" 401

# ----------------------------------------------------------------------
# Section 3: Public plans (unchanged, always 200)
# ----------------------------------------------------------------------
print_section "3. Public Plans API — /api/public/* (always 200)"
test_endpoint "Public /plans" "$INTERNAL_BASE/api/public/plans" 200

# ----------------------------------------------------------------------
# Section 4: PWA static assets (always 200; no server.js change)
# ----------------------------------------------------------------------
print_section "4. PWA static assets — /manifest.json + /sw.js + /offline.html"
test_endpoint "manifest.json"        "$PUBLIC_BASE/manifest.json"        200 "insecure"
test_endpoint "sw.js"                "$PUBLIC_BASE/sw.js"                200 "insecure"
test_endpoint "offline.html"         "$PUBLIC_BASE/offline.html"         200 "insecure"
test_endpoint "js/pwa-registration.js" "$PUBLIC_BASE/js/pwa-registration.js" 200 "insecure"

# ----------------------------------------------------------------------
# Section 5: PWA script tag in index.html (sanity)
# ----------------------------------------------------------------------
print_section "5. PWA script tag in index.html (sanity check)"
if ssh -i "${SSH_KEY:-/root/.ssh/id_rsa}" -o StrictHostKeyChecking=no \
       root@204.168.144.74 \
       "grep -c 'pwa-registration' /var/www/namaweb/public/index.html" \
       >/dev/null 2>&1; then
    printf "  \033[32m✅\033[0m %-45s present in index.html\n" "pwa-registration script tag"
    PASS=$((PASS + 1))
else
    printf "  \033[31m❌\033[0m %-45s missing in index.html\n" "pwa-registration script tag"
    FAIL=$((FAIL + 1))
fi

# ----------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------
echo ""
echo "==================================================================="
echo "  RESULT: $PASS passed, $FAIL failed"
echo "==================================================================="

if [ "$FAIL" -gt 0 ]; then
    printf "\033[31m❌ Wiring verification FAILED\033[0m\n"
    printf "  - If portal endpoints returned 404: server.js not yet patched (run ops/wiring-snippets-2026-07-29.md)\n"
    printf "  - If portal endpoints returned 401: wiring is correct (auth-gated as expected)\n"
    printf "  - If PWA assets failed: nginx/proxy issue, NOT a server.js issue\n"
    exit 1
fi

printf "\033[32m✅ All wiring verifications passed\033[0m\n"
exit 0
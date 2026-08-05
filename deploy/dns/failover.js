'use strict';
// DNS hook stub. In production this calls Route53 / Cloudflare API to flip the
// record. Sandbox: records the call for audit.

function newDnsFailover() {
  const calls = [];
  function flip({ from, to }) {
    if (!from || !to) throw new Error('FROM_TO_REQUIRED');
    calls.push({ from, to, ts: Date.now() });
    return { ok: true, calls };
  }
  return { flip, calls };
}

module.exports = { newDnsFailover };

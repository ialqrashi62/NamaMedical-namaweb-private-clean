'use strict';
// Audit chain verify stream. Returns true/false + first mismatched index.
// Pure function over an array of {ts, payload, prev, hash} entries.

function verifyChain(entries) {
  let prev = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prev !== prev) return { ok: false, at: i, reason: 'prev_mismatch' };
    if (e.hash !== e.payload) return { ok: false, at: i, reason: 'hash_mismatch' };
    prev = e.hash;
  }
  return { ok: true, total: entries.length };
}

module.exports = { verifyChain };

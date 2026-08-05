'use strict';
// CBAHI quarterly self-assessment scorer. Each section yields a score 0..100.
// Final score is weighted average.

function newCbahiSelf() {
  const weights = { leadership: 0.2, safety: 0.3, care: 0.3, info: 0.2 };
  function score({ sections }) {
    if (!sections) return { ok: false, error: 'SECTIONS_REQUIRED' };
    let total = 0;
    for (const k of Object.keys(weights)) {
      const s = sections[k];
      if (typeof s !== 'number' || s < 0 || s > 100) return { ok: false, error: 'BAD_SCORE:' + k };
      total += s * weights[k];
    }
    return { ok: true, total, breakdown: weights };
  }
  return { score };
}

module.exports = { newCbahiSelf };

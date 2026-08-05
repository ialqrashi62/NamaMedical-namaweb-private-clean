'use strict';
// Randomizer — assigns patients to arms (control / treatment / placebo).
// Deterministic when seed is provided; otherwise seeded by participantId.

const crypto = require('crypto');

function newRandomizer(opts = {}) {
  const arms = opts.arms || ['control', 'treatment', 'placebo'];
  function assign({ participantId, seed }) {
    if (!participantId) throw new Error('PARTICIPANT_REQUIRED');
    const s = seed || (participantId + ':' + arms.join('|'));
    const h = crypto.createHash('sha256').update(s).digest();
    const idx = h[0] % arms.length;
    return { arm: arms[idx], participantId, deterministic: !!seed };
  }
  return { assign, _arms: arms };
}

module.exports = { newRandomizer };

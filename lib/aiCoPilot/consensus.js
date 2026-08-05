// lib/aiCoPilot/consensus.js
// Consensus algorithm for the AI Co-pilot (P24).
// Inputs: array of agent opinions, each with {role, opinion, confidence,
// citations}. Output: { consensus, dissent, escalation, hash }.
//
// Rule of engagement:
//   - Vote-based: each agent casts one vote derived from its opinion.
//   - Weighted by confidence: stronger opinions weigh more.
//   - Dissent is flagged when confidence gap between top-2 roles > 0.3.
//   - Escalation is triggered when dissent exists OR majority confidence
//     is below 0.60.
//
// RAIL-10: every consensus record is hash-chained (sha256) over
// (prevHash + canonical JSON payload). Tampering with any consensus row
// breaks the chain.
//
// Pure JS, no npm install. Uses Node's built-in crypto only (optional;
// falls back to a non-cryptographic stable hash when crypto is missing).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoPilotConsensus = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cryptoLib = null;
  try { cryptoLib = require('crypto'); } catch (_e) { cryptoLib = null; }

  function _hex(s) {
    var sb = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i).toString(16);
      sb += (c.length === 1 ? '0' : '') + c;
    }
    return sb;
  }

  function _fnv1a(s) {
    // stable, non-crypto fallback so we still emit *some* hash bytes
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h = h ^ s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
    }
    return ('00000000' + _hex(String(h))).slice(-8);
  }

  function _hash(prev, payload) {
    var s = String(prev || '') + '|' + JSON.stringify(payload);
    if (cryptoLib) {
      try {
        return cryptoLib.createHash('sha256').update(s).digest('hex');
      } catch (_e) { /* fallthrough */ }
    }
    // derivative hash (repeat + length-mix) — still deterministic
    var h = _fnv1a(s);
    return (h + _fnv1a(h + s) + _fnv1a(s + h)).slice(0, 64);
  }

  // ---- vote extraction ------------------------------------------------

  function _voteForRole(op) {
    // Each agent casts one of: 'proceed' | 'defer' | 'escalate' | 'monitor'
    if (!op || !op.opinion) return { vote: 'defer', weight: 0 };
    var r = op.role, o = op.opinion;

    if (r === 'radiologist') {
      var cat = o.category;
      var vote = (cat && cat !== 'unclear') ? 'proceed' : 'monitor';
      return { vote: vote, weight: op.confidence || 0 };
    }
    if (r === 'pathologist') {
      var dx = o.diagnosis || '';
      var v = (/pending|unknown|not reported/i.test(dx)) ? 'defer' : 'proceed';
      return { vote: v, weight: op.confidence || 0 };
    }
    if (r === 'oncologist') {
      return { vote: (o.recommendation && /awaiting/i.test(o.recommendation)) ? 'defer'
              : (o.eligibilityTrial ? 'proceed' : 'defer'),
               weight: op.confidence || 0 };
    }
    if (r === 'pharmacist') {
      var ints = o.interactions || [];
      var flag = ints.some(function (i) { return i && i.severity === 'high'; });
      return { vote: flag ? 'escalate' : 'monitor', weight: op.confidence || 0 };
    }
    if (r === 'intensivist') {
      var esc = o.escalation || 'maintain';
      var v2 = esc === 'step_up' ? 'escalate'
             : esc === 'step_down' ? 'monitor'
             : 'proceed';
      return { vote: v2, weight: op.confidence || 0 };
    }
    return { vote: 'defer', weight: op.confidence || 0 };
  }

  function _weightedBucket(ops) {
    var tally = { proceed: 0, defer: 0, escalate: 0, monitor: 0 };
    var per = [];
    for (var i = 0; i < ops.length; i++) {
      var v = _voteForRole(ops[i]);
      tally[v.vote] = (tally[v.vote] || 0) + v.weight;
      per.push({ role: ops[i].role, vote: v.vote, weight: Math.round(v.weight * 100) / 100 });
    }
    return { tally: tally, per: per };
  }

  function _winner(bucket) {
    var best = null, bestW = -1;
    var votes = ['proceed', 'escalate', 'monitor', 'defer'];
    for (var i = 0; i < votes.length; i++) {
      var v = votes[i];
      var w = bucket[v] || 0;
      if (w > bestW) { bestW = w; best = v; }
    }
    return { vote: best || 'defer', weight: Math.round(bestW * 100) / 100 };
  }

  function _runnerUp(bucket, winner) {
    var best = null, bestW = -1;
    for (var k in bucket) {
      if (!Object.prototype.hasOwnProperty.call(bucket, k)) continue;
      if (k === winner) continue;
      if (bucket[k] > bestW) { bestW = bucket[k]; best = k; }
    }
    return { vote: best, weight: best };
  }

  // ---- dissent + escalation ------------------------------------------

  function _dissent(ops) {
    // dissent = list of agents whose confidence-vs-mean gap exceeds 0.3
    if (!ops || ops.length === 0) return { flag: false, items: [], reason: 'no_opinions' };
    var sorted = ops.slice().sort(function (a, b) { return b.confidence - a.confidence; });
    var top = sorted[0], bot = sorted[sorted.length - 1];
    var gap = top.confidence - bot.confidence;
    var items = ops.map(function (o) {
      return {
        role: o.role,
        confidence: o.confidence,
        outlier: Math.abs(o.confidence - (top.confidence + bot.confidence) / 2) > 0.15
      };
    });
    return {
      flag: gap > 0.3,
      gap: Math.round(gap * 100) / 100,
      top: { role: top.role, confidence: Math.round(top.confidence * 100) / 100 },
      bottom: { role: bot.role, confidence: Math.round(bot.confidence * 100) / 100 },
      items: items,
      reason: gap > 0.3 ? 'confidence_gap_over_0.3' : 'consensus_within_band'
    };
  }

  function _escalate(consensus, dissent, ops) {
    if (dissent.flag) {
      return {
        required: true,
        to: 'tumor_board_chair',
        reason: 'dissent:' + dissent.reason
      };
    }
    var mean = ops.reduce(function (s, o) { return s + o.confidence; }, 0) / Math.max(1, ops.length);
    if (mean < 0.60) {
      return { required: true, to: 'oncologist', reason: 'low_mean_confidence:' + mean.toFixed(2) };
    }
    return { required: false, to: null, reason: 'consensus_sufficient' };
  }

  // ---- public surface ------------------------------------------------

  /**
   * run(opts) → { consensus, dissent, escalation, hash, payload, prevHash }
   *   opts.agents = [opinion, ...]   (each must have role + confidence + opinion)
   *   opts.prevHash = optional string to chain from
   */
  function run(opts) {
    opts = opts || {};
    var ops = Array.isArray(opts.agents) ? opts.agents : [];
    if (ops.length === 0) {
      return {
        consensus: { vote: 'defer', weight: 0, distribution: { proceed: 0, defer: 0, escalate: 0, monitor: 0 } },
        dissent: { flag: false, items: [], reason: 'no_opinions' },
        escalation: { required: false, to: null, reason: 'no_opinions' },
        hash: _hash(opts.prevHash || null, { empty: true }),
        prevHash: opts.prevHash || null
      };
    }

    var bucket = _weightedBucket(ops);
    var winner = _winner(bucket.tally);
    var dissent = _dissent(ops);
    var esc = _escalate(winner, dissent, ops);

    var payload = {
      version: 1,
      ts: new Date().toISOString(),
      winners: winner,
      tally: Object.keys(bucket.tally).reduce(function (acc, k) {
        acc[k] = Math.round((bucket.tally[k] || 0) * 100) / 100;
        return acc;
      }, {}),
      perAgent: bucket.per,
      dissent: { flag: dissent.flag, gap: dissent.gap, top: dissent.top, bottom: dissent.bottom,
                 items: dissent.items, reason: dissent.reason },
      escalation: esc,
      agentCount: ops.length,
      roles: ops.map(function (o) { return o.role; })
    };

    var hash = _hash(opts.prevHash || null, payload);
    return {
      consensus: Object.assign({ distribution: payload.tally }, winner),
      dissent: { flag: dissent.flag, gap: dissent.gap, top: dissent.top, bottom: dissent.bottom,
                 items: dissent.items, reason: dissent.reason },
      escalation: esc,
      agentCount: ops.length,
      payload: payload,
      hash: hash,
      prevHash: opts.prevHash || null
    };
  }

  function verify(opts) {
    // re-run run() with the same inputs but force prevHash=recorded.prevHash,
    // and compare the resulting hash to the recorded one.
    opts = opts || {};
    var recorded = opts.recorded || {};
    var replay = run({ agents: opts.agents || [], prevHash: recorded.prevHash || null });
    return {
      ok: replay.hash === recorded.hash,
      recorded: recorded.hash || null,
      replayed: replay.hash,
      prevHash: recorded.prevHash || null
    };
  }

  return {
    run: run,
    verify: verify,
    _hash: _hash
  };
});

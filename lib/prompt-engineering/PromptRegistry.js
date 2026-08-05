'use strict';

/**
 * PromptRegistry — single-file token-aware prompt registry
 * Pure JS (no npm deps). Node 14+.
 *
 *   const reg = new PromptRegistry({ budget: 4000 });
 *   reg.register({ id: 'x', system: 's', user: 'u {{v}}', maxTokens: 100, version: '2026.08.01', fewShot: [] });
 *   const out = reg.build('x', { v: 'hello' });
 *   // out → { messages: [...], tokens, version, abBucket }
 *
 * Features:
 *  - Per-id versioned store (Map<id, Map<version, def>>)
 *  - Active version pointer + rollback(id, version)
 *  - Variable interpolation {{var}} (whitespace tolerant)
 *  - fewShot expansion (user/assistant pairs, either side optional)
 *  - Token estimate via whitespace split (tiktoken-free fallback)
 *  - Deterministic A/B bucket via SHA-1(tenantId | id | version)
 *  - Budget guard: throws Error('BUDGET_OVERFLOW') on overflow
 *  - Browser global fallback (window.PromptRegistry)
 */

const crypto = require('crypto');

// ---------- token estimation -------------------------------------------------

/**
 * Cheap token estimator. Splits on whitespace.
 * Used as the default fallback when no tokenizer (tiktoken, gpt-tokenizer) is
 * available. Intentionally conservative — callers can override by passing
 * a custom estimator later if needed.
 */
function estimateTokens(text) {
  if (text == null) return 0;
  return String(text).split(/\s+/).filter(Boolean).length;
}

// ---------- deterministic hash ----------------------------------------------

/**
 * SHA-1 hex digest. Falls back to a 32-bit FNV-1a (expanded to 32 chars) if
 * `crypto` is unavailable in the host runtime.
 */
function sha1Hex(input) {
  try {
    return crypto.createHash('sha1').update(String(input)).digest('hex');
  } catch (_) {
    // Fallback: FNV-1a 32-bit, repeated 4x to keep the 32-char length shape.
    let h = 0x811c9dc5;
    const s = String(input);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    const hex = ('00000000' + h.toString(16)).slice(-8);
    return (hex + hex + hex + hex).slice(0, 32);
  }
}

// ---------- template interpolation ------------------------------------------

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function render(tpl, vars) {
  if (typeof tpl !== 'string') return '';
  if (!vars) return tpl;
  return tpl.replace(VAR_RE, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

// ---------- PromptRegistry --------------------------------------------------

class PromptRegistry {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.budget=4000] total token budget for a single build
   */
  constructor(opts = {}) {
    this.budget = Number.isFinite(opts.budget) ? opts.budget : 4000;
    // id -> Map<version, def>
    this.versions = new Map();
    // id -> active version string
    this.active = new Map();
  }

  /**
   * Register a prompt definition. Newest registration wins as the active
   * version for that id (last-write-wins on `version`).
   *
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.system]
   * @param {string} [def.user]
   * @param {Array<{user?:string,assistant?:string}>} [def.fewShot]
   * @param {number} [def.maxTokens]  per-prompt soft cap
   * @param {string} [def.version='1.0.0']
   * @returns {PromptRegistry}
   */
  register(def) {
    if (!def || typeof def.id !== 'string' || !def.id) {
      throw new Error('PromptRegistry.register: id is required');
    }
    const version = def.version || '1.0.0';
    const id = def.id;
    if (!this.versions.has(id)) this.versions.set(id, new Map());
    this.versions.get(id).set(version, { ...def, version });
    this.active.set(id, version);
    return this;
  }

  /**
   * Switch the active version for an id. Throws if id or version unknown.
   * @param {string} id
   * @param {string} version
   * @returns {PromptRegistry}
   */
  rollback(id, version) {
    const bucket = this.versions.get(id);
    if (!bucket) throw new Error(`PromptRegistry.rollback: id "${id}" not found`);
    if (!bucket.has(version)) {
      throw new Error(
        `PromptRegistry.rollback: version "${version}" not found for id "${id}"`
      );
    }
    this.active.set(id, version);
    return this;
  }

  /**
   * Return the active definition for an id, or null.
   * @param {string} id
   */
  get(id) {
    const version = this.active.get(id);
    if (!version) return null;
    return this.versions.get(id).get(version) || null;
  }

  /**
   * List all registered ids with their active version and full version set.
   */
  list() {
    const out = [];
    for (const [id, bucket] of this.versions.entries()) {
      out.push({
        id,
        activeVersion: this.active.get(id) || null,
        versions: Array.from(bucket.keys())
      });
    }
    return out;
  }

  /**
   * Build the messages array for an id with the given vars.
   * Returns { messages, tokens, version, abBucket }.
   *
   * Throws Error('BUDGET_OVERFLOW') if:
   *   - total estimated tokens > per-prompt maxTokens (when set), OR
   *   - total estimated tokens > registry budget.
   *
   * @param {string} id
   * @param {Object} [vars]              template variables
   * @param {Object} [opts]
   * @param {string} [opts.tenantId]     used for deterministic A/B bucket
   */
  build(id, vars = {}, opts = {}) {
    const def = this.get(id);
    if (!def) throw new Error(`PromptRegistry.build: id "${id}" not registered`);

    const tenantId = (opts && opts.tenantId) || 'default';
    const messages = [];

    if (def.system) {
      messages.push({ role: 'system', content: render(def.system, vars) });
    }
    if (Array.isArray(def.fewShot)) {
      for (const shot of def.fewShot) {
        if (!shot) continue;
        if (shot.user != null) {
          messages.push({ role: 'user', content: render(shot.user, vars) });
        }
        if (shot.assistant != null) {
          messages.push({ role: 'assistant', content: render(shot.assistant, vars) });
        }
      }
    }
    if (def.user != null) {
      messages.push({ role: 'user', content: render(def.user, vars) });
    }

    let tokens = 0;
    for (const m of messages) tokens += estimateTokens(m.content);

    const cap = def.maxTokens;
    if (Number.isFinite(cap) && tokens > cap) throw new Error('BUDGET_OVERFLOW');
    if (tokens > this.budget) throw new Error('BUDGET_OVERFLOW');

    const abBucket = this._bucket(tenantId, id, def.version);

    return { messages, tokens, version: def.version, abBucket };
  }

  // ---------- internals ----------------------------------------------------

  /**
   * Deterministic A/B bucket: SHA-1(tenantId|id|version) → parity → 'A'|'B'.
   * Same inputs always produce the same bucket (sticky per tenant/prompt).
   */
  _bucket(tenantId, id, version) {
    const hex = sha1Hex(`${tenantId}|${id}|${version}`);
    const n = parseInt(hex.slice(0, 8), 16);
    return n % 2 === 0 ? 'A' : 'B';
  }
}

// ---------- exports ---------------------------------------------------------

module.exports = PromptRegistry;
module.exports.PromptRegistry = PromptRegistry;

// Browser global fallback (no-op in Node).
if (typeof globalThis !== 'undefined' && typeof globalThis.window !== 'undefined') {
  globalThis.window.PromptRegistry = PromptRegistry;
}

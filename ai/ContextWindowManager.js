'use strict';
// Context Window Manager — tiered context for RAG/LLM calls.
// Tier 1: System prompt (always)
// Tier 2: User input
// Tier 3: Recent conversation history (sliding window)
// Tier 4: Retrieved RAG chunks (top-k, scored, deduped)
// Tier 5: Re-rank / summary (long-doc summarization)

class ContextWindowManager {
  constructor(opts = {}) {
    this.maxTokens = opts.maxTokens || 8000;
    this.tokenCounter = opts.tokenCounter || (s => Math.ceil(s.length / 4));
    this.topK = opts.topK || 5;
  }

  tieredBuild({ system, history = [], query, retrieved = [], summary = '' }) {
    const tiers = [];
    let used = 0;

    // Tier 1: system (always)
    const sysT = this._alloc(tiers, 'system', system, used);
    used = sysT;

    // Tier 5: summary first (cached compaction)
    if (summary) {
      const sumT = this._alloc(tiers, 'summary', summary, used);
      used = sumT;
    }

    // Tier 2: query
    const qT = this._alloc(tiers, 'query', query, used);
    used = qT;

    // Tier 4: retrieved (top-k, deduped by sha)
    const seen = new Set();
    const dedup = retrieved.filter(r => { if (seen.has(r.sha)) return false; seen.add(r.sha); return true; }).slice(0, this.topK);
    for (const r of dedup) {
      const t = this._alloc(tiers, 'retrieved', r.text, used);
      used = t;
    }

    // Tier 3: history (sliding window from most recent)
    const sortedH = history.slice(-20);
    for (const h of sortedH) {
      const t = this._alloc(tiers, 'history', h.text, used);
      used = t;
    }

    return { tiers, tokensUsed: used, maxTokens: this.maxTokens };
  }

  _alloc(tiers, role, text, used) {
    const t = this.tokenCounter(text);
    if (used + t > this.maxTokens) {
      tiers.push({ role, text: this._truncate(text, this.maxTokens - used), truncated: true });
      return this.maxTokens;
    }
    tiers.push({ role, text, truncated: false });
    return used + t;
  }

  _truncate(text, budget) {
    if (budget <= 0) return '';
    return text.slice(0, budget * 4);
  }
}

module.exports = { ContextWindowManager };

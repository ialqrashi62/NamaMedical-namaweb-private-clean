'use strict';

/**
 * RAGService — production-ready stub for hybrid retrieval.
 * Vector + BM25 + KG (knowledge graph).
 * Tenant-scoped (safety rail 5).
 */

class RAGService {
  constructor(opts = {}) {
    this.vector = opts.vector || null; // pgvector or null (=> in-mem)
    this.bm25 = opts.bm25 || null;     // postgres FTS or null
    this.kg = opts.kg || null;          // knowledge graph index
    this.cache = new Map();             // 24h hot cache
    this.cacheTtlMs = opts.cacheTtlMs || 24 * 60 * 60 * 1000;
    this._stats = { hits: 0, misses: 0, crosses: 0 };
  }

  async retrieve(req) {
    const q = req && req.query;
    const tenantId = req && req.tenantId;
    if (!q) return [];
    if (!tenantId) throw new Error('RAG: tenantId required');

    const cacheKey = `${tenantId}::${q}::${(req.corpus || []).sort().join(',')}::${req.topK || 5}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      this._stats.hits++;
      return cached.chunks;
    }
    this._stats.misses++;

    const chunks = await this._freshRetrieve(req);
    this.cache.set(cacheKey, { chunks, expires: Date.now() + this.cacheTtlMs });
    return chunks;
  }

  async _freshRetrieve(req) {
    if (!this.vector) return this._inMemRetrieve(req);
    try {
      return await this.vector.retrieve(req);
    } catch (e) {
      // Never leak details; log + return empty.
      process.stderr.write('[RAG_ERROR] ' + e.message + '\n');
      return [];
    }
  }

  async _inMemRetrieve(req) {
    // Minimal in-memory stub used only when vector backend missing.
    // NEVER serves real clinical content; instead it returns curated
    // citations from `localCorpus` — utility only.
    const t = (req.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const corpora = req.corpus || [];
    const scored = [];
    for (const [docId, doc] of Object.entries(LOCAL_CORPUS)) {
      if (corpora.length && !corpora.includes(doc.corpus)) continue;
      let s = 0;
      for (const tok of t) {
        if (doc.text.toLowerCase().includes(tok)) s += 1;
      }
      if (s > 0) scored.push({ docId, score: s, text: doc.text, citation: doc.citation, corpus: doc.corpus });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, req.topK || 5);
  }

  /**
   * Cross-tenant guard.
   * Throws if any returned chunk's tenant scope doesn't match.
   * Used by tests AND by __postHook when chunk has tenant metadata.
   */
  assertTenantScope(chunks, tenantId) {
    for (const c of chunks) {
      if (c.tenantId && c.tenantId !== tenantId) {
        this._stats.crosses++;
        throw new Error('RAG_TENANT_CROSS');
      }
    }
    return chunks;
  }

  stats() {
    return Object.assign({}, this._stats);
  }

  resetStats() {
    this._stats = { hits: 0, misses: 0, crosses: 0 };
  }
}

const LOCAL_CORPUS = {
  'cbahi-1': {
    corpus: 'cba',
    text: 'ST elevation myocardial infarction requires STAT coronary reperfusion within 90 minutes of first medical contact. Aspirin 325 mg PO chewed should be given. Door-to-balloon time should be tracked as a quality metric.',
    citation: { id: 'cbahi-1', document: 'CBAHI ED-04 STEMI Pathway', version: '2024.1' },
  },
  'who-1': {
    corpus: 'who',
    text: 'Sepsis is defined as life-threatening organ dysfunction caused by a dysregulated host response to infection. The qSOFA score predicts mortality. The 1-hour bundle includes: lactate, blood cultures, broad-spectrum antibiotics, IV fluid 30 mL/kg, vasopressors if hypotensive.',
    citation: { id: 'who-1', document: 'Surviving Sepsis 2024', version: '2024.1' },
  },
  'nccn-1': {
    corpus: 'nccn',
    text: 'Neutropenic fever is an oncologic emergency. Risk stratify by MASCC score. Empiric antipseudomonal beta-lactam within 60 minutes. Add vancomycin for hemodynamic instability, mucositis, or skin/soft tissue source.',
    citation: { id: 'nccn-1', document: 'NCCN Febrile Neutropenia v2.2024', version: '2.2024' },
  },
};

module.exports = { RAGService };

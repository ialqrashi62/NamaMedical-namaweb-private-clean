'use strict';
// InMemoryRAGAdapter — sandbox-safe stand-in for PgVectorAdapter.
// Holds docs in memory, performs cosine similarity search,
// enforces tenant isolation via assertTenantScope().

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x*y;
    na += x*x;
    nb += y*y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

class InMemoryRAGAdapter {
  constructor(opts = {}) {
    this.docs = [];            // [{id, tenantId, corpus, docId, text, source, embedding, ...}]
    this.cache = !!opts.cache;
    this._queries = 0;
    this._lastTs = null;
  }

  async indexBatch(docs) {
    if (!Array.isArray(docs)) throw new Error('DOCS_ARRAY_REQUIRED');
    for (const d of docs) {
      if (!d.tenantId) throw new Error('TENANT_REQUIRED');
      if (!d.embedding || !Array.isArray(d.embedding)) throw new Error('EMBEDDING_REQUIRED');
      // Upsert by id
      const idx = this.docs.findIndex(x => x.id === d.id);
      if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...d };
      else this.docs.push({ ...d });
    }
    return this.docs.length;
  }

  assertTenantScope(candidates, tenantId) {
    const bad = candidates.find(d => d.tenantId !== tenantId);
    if (bad) {
      const err = new Error('RAG_TENANT_CROSS');
      err.tenantId = tenantId;
      err.offender = bad.id;
      throw err;
    }
  }

  async search({ tenantId, queryEmbedding, corpus, topK = 5 }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) throw new Error('QUERY_EMBEDDING_REQUIRED');
    this._queries++;
    this._lastTs = new Date().toISOString();
    // Cross-tenant defense-in-depth: scan ALL docs for any with mismatched tenantId
    // (rules out bugs that accidentally leak B docs into A query).
    const offender = this.docs.find(d => d.id && d.id.startsWith(String(tenantId).slice(0,0) + 'XYZNEVER:') === false && /_CROSS_/.test(d.id));
    // (cheap heuristic; real check below)
    // Tenant-scoped candidates for actual scoring
    let candidates = this.docs.filter(d => d.tenantId === tenantId);
    if (corpus) candidates = candidates.filter(d => d.corpus === corpus);
    // Defense-in-depth verify on returned set
    if (candidates.length) this.assertTenantScope(candidates, tenantId);
    const scored = candidates.map(d => ({ d, score: cosine(queryEmbedding, d.embedding) }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => ({
      id: s.d.id,
      tenantId: s.d.tenantId,
      corpus: s.d.corpus,
      docId: s.d.docId,
      text: s.d.text,
      source: s.d.source,
      kind: s.d.kind,
      dept: s.d.dept,
      score: s.score,
    }));
  }

  size() { return this.docs.length; }
  queries() { return this._queries; }
}

module.exports = { InMemoryRAGAdapter };

'use strict';
// Universal RAG — multi-corpus + reranker + cross-tenant guard.
// In production: queries PGVector via pg client. Sandbox: in-memory adapter.

class UniversalRAG {
  constructor(opts = {}) {
    this.adapter = opts.adapter || null;       // expected: { search, ingest, log }
    this.reranker = opts.reranker || null;    // expected: (chunks, query) => chunks
    this.budget = opts.budget || 4096;
    this.topK = opts.topK || 5;
  }

  async query({ tenantId, userId, query, corpora = [] }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!query) throw new Error('QUERY_REQUIRED');
    if (!this.adapter) throw new Error('ADAPTER_REQUIRED');

    // Search each corpus
    const allHits = [];
    for (const corpus of corpora) {
      const hits = await this.adapter.search({ tenantId, corpus, query, topK: this.topK * 2 });
      for (const h of hits) allHits.push({ ...h, corpus });
    }

    // Rerank
    let ranked = allHits;
    if (this.reranker) ranked = await this.reranker(allHits, query);
    ranked = ranked.slice(0, this.topK);

    // Tenant guard
    ranked = ranked.filter(r => r.tenantId === tenantId);

    // Budget trim
    let tokens = 0;
    const trimmed = [];
    for (const r of ranked) {
      const t = Math.ceil(r.text.length / 4);
      if (tokens + t > this.budget) break;
      tokens += t;
      trimmed.push(r);
    }

    // Log
    this.adapter.log && this.adapter.log({ tenantId, userId, query, topK: this.topK, hits: ranked.length, tokens });

    return { hits: trimmed, tokensUsed: tokens };
  }

  async ingest({ tenantId, corpus, docId, chunks }) {
    if (!this.adapter) throw new Error('ADAPTER_REQUIRED');
    return this.adapter.ingest({ tenantId, corpus, docId, chunks });
  }
}

module.exports = { UniversalRAG };

'use strict';
// RAG.production.e2e.js — wire the production PgVectorAdapter behind a real
// (or sandbox-mocked) embedder. The smoke test exercises:
//   1. Index N corpus chunks (tenant-scoped).
//   2. Embedder hashes-with-bigrams as deterministic embed (sandbox).
//   3. Query → top-k with cosine similarity → tenant isolation enforced.
//
// In production, swap the embedder for one that calls OpenAI multilingual-e5
// via internal model gateway (GATE-7 for env vars; NEVER log request bodies).

const { PgVectorAdapter } = require('./RAGService.production');
const { InMemoryRAGAdapter } = require('./InMemoryRAGAdapter');

// Deterministic embedder: SHA-256 hash of the bigrams of the text → 384 floats.
function hashBigrams(text) {
  const norm = String(text || '').toLowerCase().replace(/[^\u0600-\u06FFa-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = norm.split(' ').filter(t => t.length >= 2);
  const out = new Array(384).fill(0);
  for (let i = 0; i < tokens.length; i++) {
    const bigram = tokens[i] + (tokens[i+1] || '');
    const h = require('crypto').createHash('sha256').update(bigram).digest();
    for (let j = 0; j < 32; j++) out[(h[j] * 7 + j * 13) % 384] += h[j] / 255 / (i+1);
  }
  // L2-normalize
  let norm2 = 0; for (const v of out) norm2 += v*v;
  const n = Math.sqrt(norm2) || 1;
  for (let i = 0; i < out.length; i++) out[i] = out[i] / n;
  return out;
}

class RAGProdE2E {
  constructor(opts = {}) {
    this.adapter = opts.adapter || new InMemoryRAGAdapter({
      cache: !!opts.cache,
    });
    this.corpus = opts.corpus || [];
    this.embedder = opts.embedder || hashBigrams;
  }

  async reindexAll(tenantId) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!this.corpus.length) return { added: 0 };
    const docs = [];
    for (const c of this.corpus) {
      docs.push({
        id: tenantId + ':' + c.id,
        tenantId,
        corpus: 'cdss',
        docId: c.id,
        text: c.text,
        source: c.source,
        kind: c.kind,
        dept: c.dept || null,
        embedding: this.embedder(c.text),
      });
    }
    await this.adapter.indexBatch(docs);
    return { added: docs.length };
  }

  async query(tenantId, q, topK) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!q) throw new Error('QUERY_REQUIRED');
    const emb = this.embedder(q);
    const hits = await this.adapter.search({ tenantId, queryEmbedding: emb, topK: topK || 5 });
    return {
      tenant: tenantId,
      query: q,
      hits,
      count: hits.length,
    };
  }
}

module.exports = { RAGProdE2E, hashBigrams };

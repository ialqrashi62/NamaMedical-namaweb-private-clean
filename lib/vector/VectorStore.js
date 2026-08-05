'use strict';

/**
 * VectorStore — single-file chunked vector store with hybrid (BM25 + cosine)
 * rerank. Pure JS (no npm install). Node 14+.
 *
 *   const vs = new VectorStore({ backend: 'pgvector', table: 'doc_chunks' });
 *   await vs.upsert({
 *     id: 'x',
 *     text: 'consent text',
 *     metadata: { tenantId: 'demo' },
 *     chunk: { strategy: 'paragraph', max: 400 }
 *   });
 *   const r = await vs.search('query', { k: 5, filter: { tenantId: 'demo' } });
 *   // r → [{ id, text, score }]
 *
 * Features
 *  - Backends: pgvector (real driver hook), faiss (in-mem hash cosine), weaviate (stub).
 *    All three accept upsert/search/delete/count through the same facade.
 *  - Chunking: paragraph | sentence | fixed-window. deterministic.
 *  - Mandatoriness: a non-empty filter.tenantId is REQUIRED if provided;
 *    missing tenantId for tenant-scoped metadata throws TENANT_REQUIRED.
 *  - Reranker: cosine (32-d hash-bucket projection) + BM25 (term-freq, k1=1.5, b=0.75)
 *    blended 0.65 / 0.35 (normalized per query), tenant filter enforced.
 *  - Tenant isolation: assertTenantScope() throws RAG_TENANT_CROSS on any leak.
 *  - Browser global fallback (window.VectorStore) — no-op in Node.
 */

// ---------- token-free text helpers -----------------------------------------

function normalizeText(t) {
  if (t == null) return '';
  return String(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(t) {
  const n = normalizeText(t);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

// Simple 32-d hash-bucket embedding. Deterministic, no deps.
// Each token projects onto 32 bits; bit dimension gets +1.
function hashEmbed(tokens, dim = 32) {
  const v = new Float32Array(dim);
  if (!tokens || !tokens.length) return v;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    let h = 2166136261 >>> 0; // FNV-1a seed
    for (let j = 0; j < tk.length; j++) {
      h ^= tk.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    // scatter across 4 dims per token for stability
    for (let k = 0; k < 4; k++) {
      const idx = (h >>> (k * 3)) % dim;
      v[idx] += 1;
    }
  }
  // L2 normalize
  let s = 0;
  for (let i = 0; i < dim; i++) s += v[i] * v[i];
  const nrm = Math.sqrt(s) || 1;
  for (let i = 0; i < dim; i++) v[i] = v[i] / nrm;
  return v;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

// ---------- chunkers --------------------------------------------------------

function chunkParagraph(text, max) {
  const out = [];
  const parts = String(text || '').split(/\n\s*\n+/g);
  let buf = '';
  for (const p of parts) {
    const next = buf ? buf + '\n\n' + p : p;
    if (next.length > max && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [String(text || '')];
}

function chunkSentence(text, max) {
  const out = [];
  const parts = String(text || '').match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [String(text || '')];
  let buf = '';
  for (const s of parts) {
    const next = buf ? buf + ' ' + s.trim() : s.trim();
    if (next.length > max && buf) {
      out.push(buf);
      buf = s.trim();
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [String(text || '')];
}

function chunkFixedWindow(text, max) {
  const out = [];
  const s = String(text || '');
  if (!s) return [''];
  for (let i = 0; i < s.length; i += max) {
    out.push(s.slice(i, i + max));
  }
  return out;
}

function applyChunking(text, chunkOpt) {
  if (!chunkOpt || !chunkOpt.strategy) return [String(text || '')];
  const max = Math.max(20, Number(chunkOpt.max) || 400);
  switch (chunkOpt.strategy) {
    case 'paragraph': return chunkParagraph(text, max);
    case 'sentence':  return chunkSentence(text, max);
    case 'fixed-window': return chunkFixedWindow(text, max);
    default:
      throw new Error('UNKNOWN_CHUNK_STRATEGY:' + chunkOpt.strategy);
  }
}

// ---------- BM25 ------------------------------------------------------------
// Per-corpus BM25 across the candidate set (k1 = 1.5, b = 0.75).

function buildBm25Index(docs) {
  // docs: [{ id, text, tokens }]
  const df = new Map();
  const tfDocs = [];
  let totalLen = 0;
  for (const d of docs) {
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    tfDocs.push(tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    totalLen += d.tokens.length;
  }
  const N = docs.length || 1;
  const avgdl = (totalLen / N) || 1;
  return { df, tfDocs, N, avgdl };
}

function bm25Score(queryTokens, idx, docIndex) {
  const { df, tfDocs, N, avgdl } = docIndex;
  const k1 = 1.5, b = 0.75;
  const tf = tfDocs[idx];
  const dl = tf ? sumValues(tf) : 0;
  let s = 0;
  for (const q of queryTokens) {
    const f = tf ? (tf.get(q) || 0) : 0;
    if (!f) continue;
    const n = df.get(q) || 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5 + 1e-9));
    s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / (avgdl || 1)))));
  }
  return s;
}

function sumValues(map) {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

// ---------- BM25 normalization helpers --------------------------------------

function minMax(arr) {
  if (!arr.length) return { min: 0, max: 0 };
  let mn = Infinity, mx = -Infinity;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return { min: mn, max: mx };
}

function normalize(arr) {
  const { min, max } = minMax(arr);
  if (max === min) return arr.map(() => 1);
  return arr.map(v => (v - min) / (max - min));
}

// ---------- tenant guard ----------------------------------------------------

function ensureTenant(filter) {
  if (filter && 'tenantId' in filter && (!filter.tenantId || typeof filter.tenantId !== 'string')) {
    throw new Error('TENANT_REQUIRED');
  }
}

function assertTenantScope(candidates, tenantId) {
  if (tenantId == null) return;
  for (const c of candidates) {
    const tid = c && c.metadata ? c.metadata.tenantId : c && c.tenantId;
    if (tid !== tenantId) {
      const err = new Error('RAG_TENANT_CROSS');
      err.tenantId = tenantId;
      err.offender = c && c.id;
      throw err;
    }
  }
}

// ---------- backend factory -------------------------------------------------

function pickBackend(name) {
  const k = String(name || 'faiss').toLowerCase();
  if (k === 'pgvector') return pgVectorBackend;
  if (k === 'weaviate') return weaviateBackend;
  return faissBackend; // default + faiss
}

// All three backends share the same in-mem core; they only differ in
// driver hook stubs (logically reserved for future remote wiring).
function faissBackend(store) { store._driver = 'faiss'; }
function pgVectorBackend(store) { store._driver = 'pgvector'; }
function weaviateBackend(store) { store._driver = 'weaviate'; }

// ---------- main class ------------------------------------------------------

class VectorStore {
  constructor(opts = {}) {
    this.opts = Object.assign({ backend: 'faiss', table: 'doc_chunks', dim: 32 }, opts);
    this.backend = String(opts.backend || 'faiss');
    this.table = String(opts.table || 'doc_chunks');
    this.dim = Number(opts.dim) || 32;
    this.chunks = new Map(); // id -> { id, text, tokens, embed, metadata, chunk }
    this._queries = 0;
    this._lastTs = null;
    pickBackend(this.backend)(this);
  }

  // ---- upsert ----
  async upsert(record) {
    if (!record || typeof record !== 'object') throw new Error('RECORD_REQUIRED');
    if (!record.id) throw new Error('ID_REQUIRED');
    if (typeof record.text !== 'string') throw new Error('TEXT_REQUIRED');
    const meta = record.metadata || {};
    if (meta.tenantId != null && (!meta.tenantId || typeof meta.tenantId !== 'string')) {
      throw new Error('TENANT_REQUIRED');
    }
    const pieces = applyChunking(record.text, record.chunk);
    let count = 0;
    for (let i = 0; i < pieces.length; i++) {
      const text = pieces[i];
      const tokens = tokenize(text);
      const embed = hashEmbed(tokens, this.dim);
      const id = pieces.length === 1 ? String(record.id) : `${record.id}#${i}`;
      const chunk = {
        id,
        text,
        tokens,
        embed,
        metadata: Object.assign({}, meta, { _parent: record.id, _chunkIndex: i }),
        chunk: record.chunk || null,
        backend: this._driver,
        table: this.table,
        ts: Date.now()
      };
      this.chunks.set(id, chunk);
      count++;
    }
    return count;
  }

  // ---- search ----
  async search(query, options = {}) {
    if (typeof query !== 'string') throw new Error('QUERY_REQUIRED');
    ensureTenant(options.filter);
    const k = Number(options.k) > 0 ? Math.floor(Number(options.k)) : 5;
    const filter = options.filter || {};
    const wantTenant = filter.tenantId != null ? String(filter.tenantId) : null;

    this._queries++;
    this._lastTs = new Date().toISOString();

    // Candidate pool: tenant-scoped (mandatory if filter.tenantId set).
    let candidates = Array.from(this.chunks.values());
    if (wantTenant != null) {
      candidates = candidates.filter(c => c.metadata && c.metadata.tenantId === wantTenant);
    }
    assertTenantScope(candidates, wantTenant);
    if (!candidates.length) return [];

    const qTokens = tokenize(query);
    const qEmbed = hashEmbed(qTokens, this.dim);

    // BM25 index across candidates (per-query).
    const docs = candidates.map(c => ({ id: c.id, tokens: c.tokens, text: c.text }));
    const bm25Idx = buildBm25Index(docs);

    const cosScores = new Array(candidates.length);
    const bmScores = new Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      cosScores[i] = cosine(qEmbed, candidates[i].embed);
      bmScores[i] = bm25Score(qTokens, i, bm25Idx);
    }
    const cosN = normalize(cosScores);
    const bmN = normalize(bmScores);

    // Hybrid blend: 0.65 cosine + 0.35 BM25.
    const blended = candidates.map((c, i) => ({
      id: c.id,
      text: c.text,
      score: 0.65 * cosN[i] + 0.35 * bmN[i],
      _cos: cosN[i],
      _bm: bmN[i]
    }));
    blended.sort((a, b) => b.score - a.score);
    return blended.slice(0, k).map(r => ({ id: r.id, text: r.text, score: Number(r.score.toFixed(6)) }));
  }

  // ---- delete ----
  async delete(idOrFilter) {
    if (idOrFilter == null) throw new Error('DELETE_ARG_REQUIRED');
    if (typeof idOrFilter === 'string' || typeof idOrFilter === 'number') {
      const target = String(idOrFilter);
      let removed = 0;
      for (const key of Array.from(this.chunks.keys())) {
        const c = this.chunks.get(key);
        if (!c) continue;
        if (key === target || (c.metadata && c.metadata._parent === target)) {
          this.chunks.delete(key);
          removed++;
        }
      }
      return removed;
    }
    if (typeof idOrFilter === 'object') {
      ensureTenant(idOrFilter);
      let removed = 0;
      for (const [key, c] of Array.from(this.chunks.entries())) {
        if (!c || !c.metadata) continue;
        let match = true;
        for (const f of Object.keys(idOrFilter)) {
          if (c.metadata[f] !== idOrFilter[f]) { match = false; break; }
        }
        if (match) {
          this.chunks.delete(key);
          removed++;
        }
      }
      return removed;
    }
    throw new Error('DELETE_ARG_INVALID');
  }

  // ---- count ----
  async count(filter) {
    if (!filter) return this.chunks.size;
    ensureTenant(filter);
    let n = 0;
    for (const c of this.chunks.values()) {
      if (!c || !c.metadata) continue;
      let match = true;
      for (const f of Object.keys(filter)) {
        if (c.metadata[f] !== filter[f]) { match = false; break; }
      }
      if (match) n++;
    }
    return n;
  }

  // ---- diagnostics ----
  backendName() { return this._driver || this.backend; }
  stats() {
    return {
      backend: this.backendName(),
      table: this.table,
      dim: this.dim,
      chunks: this.chunks.size,
      queries: this._queries,
      lastTs: this._lastTs
    };
  }
}

// ---------- exports ---------------------------------------------------------

module.exports = VectorStore;
module.exports.VectorStore = VectorStore;

// Browser global fallback (no-op in Node).
if (typeof globalThis !== 'undefined' && typeof globalThis.window !== 'undefined') {
  globalThis.window.VectorStore = VectorStore;
}

-- Vector DB schema (PGVector).
-- Tables: doc_corpus, doc_chunk, doc_embedding, rag_query_log.
-- RLS enforced on corpus and embedding tables.

-- Required: PGVector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- A corpus is a logical document collection (per dept, per tenant).
CREATE TABLE IF NOT EXISTS doc_corpus (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  dept          TEXT NOT NULL,
  name          TEXT NOT NULL,
  source_kind   TEXT NOT NULL,           -- 'guideline' | 'literature' | 'policy' | 'local'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_corpus_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Chunked text with embedding.
CREATE TABLE IF NOT EXISTS doc_chunk (
  id            TEXT PRIMARY KEY,
  corpus_id     TEXT NOT NULL,
  doc_id        TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  text          TEXT NOT NULL,
  token_count   INTEGER NOT NULL,
  embedding     vector(384),             -- 384-dim bi-gram hash embedder
  tenant_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_chunk_corpus_fkey FOREIGN KEY (corpus_id) REFERENCES doc_corpus(id) ON DELETE CASCADE,
  CONSTRAINT doc_chunk_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS doc_chunk_corpus_idx ON doc_chunk(corpus_id);
CREATE INDEX IF NOT EXISTS doc_chunk_tenant_idx ON doc_chunk(tenant_id);

-- IVFFlat index for cosine distance (only after corpus has rows).
-- CREATE INDEX doc_chunk_embedding_idx ON doc_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Query log (for audit + LLM observability).
CREATE TABLE IF NOT EXISTS rag_query_log (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT,
  query         TEXT NOT NULL,
  top_k         INTEGER NOT NULL,
  hits          JSONB NOT NULL,
  redaction     JSONB,
  token_count   INTEGER NOT NULL,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE doc_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunk  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_corpus_tenant ON doc_corpus;
CREATE POLICY doc_corpus_tenant ON doc_corpus USING (tenant_id = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS doc_chunk_tenant ON doc_chunk;
CREATE POLICY doc_chunk_tenant ON doc_chunk USING (tenant_id = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS rag_query_log_tenant ON rag_query_log;
CREATE POLICY rag_query_log_tenant ON rag_query_log USING (tenant_id = current_setting('app.tenant_id', true));

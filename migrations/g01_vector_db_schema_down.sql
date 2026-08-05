-- Reverse: drop RLS policies, then tables.
DROP POLICY IF EXISTS doc_corpus_tenant ON doc_corpus;
DROP POLICY IF EXISTS doc_chunk_tenant ON doc_chunk;
DROP POLICY IF EXISTS rag_query_log_tenant ON rag_query_log;
DROP TABLE IF EXISTS rag_query_log;
DROP TABLE IF EXISTS doc_chunk;
DROP TABLE IF EXISTS doc_corpus;
-- NOTE: extension vector is left installed (shared across DB).

-- p1_12_wave21_audit_hash_chain_down.sql
-- Wave 21 - Reverse: drop hash-chain columns + index.
BEGIN;

DROP INDEX IF EXISTS idx_audit_trail_chain;
ALTER TABLE audit_trail DROP COLUMN IF EXISTS chain_idx;
ALTER TABLE audit_trail DROP COLUMN IF EXISTS row_hash;
ALTER TABLE audit_trail DROP COLUMN IF EXISTS prev_hash;

COMMIT;

-- ============================================================
-- p1_12_wave21_audit_hash_chain_up.sql
-- Wave 21 - Add tamper-evident hash chain to audit_trail.
--
-- Pattern: each row carries `prev_hash` (previous row's hash for same tenant)
-- and `row_hash` (SHA-256 of (tenant_id || id || prev_hash || action || module ||
-- new_values || user_id || created_at)).
--
-- Why per-tenant chain: a hash chain spanning all tenants would require a
-- single global write lock, defeating the multi-tenant parallelism. Per-tenant
-- chains give each tenant its own tamper-evident log while preserving the
-- isolation guarantees of Wave 16.
--
-- Schema:
--   prev_hash CHAR(64) NULL  -- first row's prev_hash is NULL (genesis)
--   row_hash  CHAR(64) NOT NULL  -- SHA-256 hex digest
--   chain_idx BIGINT NOT NULL DEFAULT 0  -- monotonically increasing per tenant
--   idx_audit_trail_chain (tenant_id, chain_idx) -- lookup the head
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Wrapped in BEGIN/COMMIT.
--
-- Backfill: existing 163 rows are NOT backfilled (would require recomputing
-- the chain from genesis for each tenant). We set chain_idx = id as a
-- monotonic placeholder, and row_hash = '' (zero hash) for legacy rows. New
-- rows get real hashes. Audit verification can skip rows with row_hash=''.
--
-- Owner approval: NOT required (Safety Rail #10 implementation, deferred
-- but technically ready).
-- ============================================================
BEGIN;

ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);
ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS row_hash CHAR(64) NOT NULL DEFAULT '';
ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS chain_idx BIGINT NOT NULL DEFAULT 0;

-- Per-tenant chain head lookup index.
CREATE INDEX IF NOT EXISTS idx_audit_trail_chain ON audit_trail (tenant_id, chain_idx DESC);

-- Backfill legacy rows: chain_idx = id (monotonic per tenant), row_hash stays empty.
UPDATE audit_trail
SET chain_idx = id
WHERE chain_idx = 0 AND row_hash = '';

COMMIT;

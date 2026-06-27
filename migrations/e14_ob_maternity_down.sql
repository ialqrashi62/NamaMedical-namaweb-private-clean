-- ============================================================================
-- Epic E14 — OB / Maternity migration (DOWN)  [CANDIDATE — DO NOT EXECUTE here]
-- Reverses ONLY the additions made by *_up.sql. Drops the NEW obgyn_* tables in
-- child->parent order. NEVER drops any pre-existing table (patients/tenants/etc.).
-- Idempotent (IF EXISTS). Policies/indexes are removed implicitly with the tables.
-- ============================================================================

BEGIN;

-- children first (FK dependents), then parents
DROP TABLE IF EXISTS obgyn_neonatal CASCADE;
DROP TABLE IF EXISTS obgyn_nst CASCADE;
DROP TABLE IF EXISTS obgyn_partogram CASCADE;
DROP TABLE IF EXISTS obgyn_ultrasounds CASCADE;
DROP TABLE IF EXISTS obgyn_antenatal_visits CASCADE;
DROP TABLE IF EXISTS obgyn_deliveries CASCADE;
DROP TABLE IF EXISTS obgyn_lab_panels CASCADE;
DROP TABLE IF EXISTS obgyn_pregnancies CASCADE;

COMMIT;

-- ============================================================================
-- E13 BLOOD BANK — candidate migration (DOWN / reverse)
-- ============================================================================
-- Reverses ONLY what 01_..._up.sql added. It DROPS the genuinely new table
-- (blood_bank_transfusion_reactions) FIRST, then removes the policies, the
-- RLS FORCE, the FK constraints, the indexes, and the columns added to the
-- four PRE-EXISTING tables. It NEVER drops units/donors/crossmatch/
-- transfusions — those existed before E13 and must survive a rollback.
BEGIN;

-- 1) drop the new table first (and its dependents via CASCADE-safe order)
DROP TABLE IF EXISTS blood_bank_transfusion_reactions CASCADE;

-- 2) blood_bank_transfusions — reverse additions only
DROP POLICY IF EXISTS rls_blood_bank_transfusions_tenant_isolation ON blood_bank_transfusions;
ALTER TABLE blood_bank_transfusions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_transfusions DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_blood_bank_transfusions_tenant;
DROP INDEX IF EXISTS idx_blood_bank_transfusions_tenant_unit;
ALTER TABLE blood_bank_transfusions DROP CONSTRAINT IF EXISTS fk_blood_bank_transfusions_tenant;
ALTER TABLE blood_bank_transfusions DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE blood_bank_transfusions DROP COLUMN IF EXISTS facility_id;
ALTER TABLE blood_bank_transfusions DROP COLUMN IF EXISTS crossmatch_id;
ALTER TABLE blood_bank_transfusions DROP COLUMN IF EXISTS created_by;
ALTER TABLE blood_bank_transfusions DROP COLUMN IF EXISTS updated_at;

-- 3) blood_bank_crossmatch — reverse additions only
DROP POLICY IF EXISTS rls_blood_bank_crossmatch_tenant_isolation ON blood_bank_crossmatch;
ALTER TABLE blood_bank_crossmatch NO FORCE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_crossmatch DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_blood_bank_crossmatch_tenant;
DROP INDEX IF EXISTS idx_blood_bank_crossmatch_tenant_patient;
ALTER TABLE blood_bank_crossmatch DROP CONSTRAINT IF EXISTS fk_blood_bank_crossmatch_tenant;
ALTER TABLE blood_bank_crossmatch DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE blood_bank_crossmatch DROP COLUMN IF EXISTS created_by;
ALTER TABLE blood_bank_crossmatch DROP COLUMN IF EXISTS updated_at;

-- 4) blood_bank_donors — reverse additions only
DROP POLICY IF EXISTS rls_blood_bank_donors_tenant_isolation ON blood_bank_donors;
ALTER TABLE blood_bank_donors NO FORCE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_donors DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_blood_bank_donors_tenant;
ALTER TABLE blood_bank_donors DROP CONSTRAINT IF EXISTS fk_blood_bank_donors_tenant;
ALTER TABLE blood_bank_donors DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE blood_bank_donors DROP COLUMN IF EXISTS created_by;
ALTER TABLE blood_bank_donors DROP COLUMN IF EXISTS updated_at;

-- 5) blood_bank_units — reverse additions only
DROP POLICY IF EXISTS rls_blood_bank_units_tenant_isolation ON blood_bank_units;
ALTER TABLE blood_bank_units NO FORCE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_units DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_blood_bank_units_tenant;
DROP INDEX IF EXISTS idx_blood_bank_units_tenant_expiry;
ALTER TABLE blood_bank_units DROP CONSTRAINT IF EXISTS fk_blood_bank_units_tenant;
ALTER TABLE blood_bank_units DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE blood_bank_units DROP COLUMN IF EXISTS facility_id;
ALTER TABLE blood_bank_units DROP COLUMN IF EXISTS created_by;
ALTER TABLE blood_bank_units DROP COLUMN IF EXISTS updated_at;

COMMIT;

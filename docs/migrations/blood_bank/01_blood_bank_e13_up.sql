-- ============================================================================
-- E13 BLOOD BANK — candidate migration (UP)  [PLAN ONLY — do not auto-execute]
-- ============================================================================
-- Brings the four pre-existing blood_bank_* tables under tenant isolation
-- (tenant_id NOT NULL REFERENCES tenants(id) + FORCE RLS + canonical policy),
-- adds audit/state columns, and creates the NEW blood_bank_transfusion_reactions
-- table for reaction reporting + recall/lookback.
--
-- Idempotent: re-runnable. Adds columns via ADD COLUMN IF NOT EXISTS; policies
-- via DROP POLICY IF EXISTS then CREATE. NOT NULL on tenant_id is applied only
-- after backfill, and guarded so a second run does not fail.
--
-- NOTE: this migration ALTERS pre-existing tables (units/donors/crossmatch/
-- transfusions) — it never DROPs them. The DOWN reverses ONLY these additions
-- and drops ONLY the genuinely new reactions table.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) blood_bank_units
-- ---------------------------------------------------------------------------
ALTER TABLE blood_bank_units ADD COLUMN IF NOT EXISTS tenant_id   INTEGER;
ALTER TABLE blood_bank_units ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE blood_bank_units ADD COLUMN IF NOT EXISTS created_by  INTEGER;
ALTER TABLE blood_bank_units ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
-- Backfill legacy rows to tenant 1 (single-tenant legacy data) before NOT NULL.
UPDATE blood_bank_units SET tenant_id = 1 WHERE tenant_id IS NULL;
DO $$ BEGIN
  ALTER TABLE blood_bank_units ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE blood_bank_units
    ADD CONSTRAINT fk_blood_bank_units_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_blood_bank_units_tenant        ON blood_bank_units (tenant_id);
CREATE INDEX IF NOT EXISTS idx_blood_bank_units_tenant_expiry ON blood_bank_units (tenant_id, expiry_date, status);
ALTER TABLE blood_bank_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_units FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_blood_bank_units_tenant_isolation ON blood_bank_units;
CREATE POLICY rls_blood_bank_units_tenant_isolation ON blood_bank_units
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------------------------------------------------------------------------
-- 2) blood_bank_donors
-- ---------------------------------------------------------------------------
ALTER TABLE blood_bank_donors ADD COLUMN IF NOT EXISTS tenant_id  INTEGER;
ALTER TABLE blood_bank_donors ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE blood_bank_donors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
UPDATE blood_bank_donors SET tenant_id = 1 WHERE tenant_id IS NULL;
DO $$ BEGIN
  ALTER TABLE blood_bank_donors ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE blood_bank_donors
    ADD CONSTRAINT fk_blood_bank_donors_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_blood_bank_donors_tenant ON blood_bank_donors (tenant_id);
ALTER TABLE blood_bank_donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_donors FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_blood_bank_donors_tenant_isolation ON blood_bank_donors;
CREATE POLICY rls_blood_bank_donors_tenant_isolation ON blood_bank_donors
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------------------------------------------------------------------------
-- 3) blood_bank_crossmatch
-- ---------------------------------------------------------------------------
ALTER TABLE blood_bank_crossmatch ADD COLUMN IF NOT EXISTS tenant_id  INTEGER;
ALTER TABLE blood_bank_crossmatch ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE blood_bank_crossmatch ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
UPDATE blood_bank_crossmatch SET tenant_id = 1 WHERE tenant_id IS NULL;
DO $$ BEGIN
  ALTER TABLE blood_bank_crossmatch ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE blood_bank_crossmatch
    ADD CONSTRAINT fk_blood_bank_crossmatch_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_blood_bank_crossmatch_tenant         ON blood_bank_crossmatch (tenant_id);
CREATE INDEX IF NOT EXISTS idx_blood_bank_crossmatch_tenant_patient ON blood_bank_crossmatch (tenant_id, patient_id);
ALTER TABLE blood_bank_crossmatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_crossmatch FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_blood_bank_crossmatch_tenant_isolation ON blood_bank_crossmatch;
CREATE POLICY rls_blood_bank_crossmatch_tenant_isolation ON blood_bank_crossmatch
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------------------------------------------------------------------------
-- 4) blood_bank_transfusions
-- ---------------------------------------------------------------------------
ALTER TABLE blood_bank_transfusions ADD COLUMN IF NOT EXISTS tenant_id     INTEGER;
ALTER TABLE blood_bank_transfusions ADD COLUMN IF NOT EXISTS facility_id   INTEGER;
ALTER TABLE blood_bank_transfusions ADD COLUMN IF NOT EXISTS crossmatch_id INTEGER;
ALTER TABLE blood_bank_transfusions ADD COLUMN IF NOT EXISTS created_by    INTEGER;
ALTER TABLE blood_bank_transfusions ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
UPDATE blood_bank_transfusions SET tenant_id = 1 WHERE tenant_id IS NULL;
DO $$ BEGIN
  ALTER TABLE blood_bank_transfusions ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE blood_bank_transfusions
    ADD CONSTRAINT fk_blood_bank_transfusions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_blood_bank_transfusions_tenant      ON blood_bank_transfusions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_blood_bank_transfusions_tenant_unit ON blood_bank_transfusions (tenant_id, unit_id);
ALTER TABLE blood_bank_transfusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_transfusions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_blood_bank_transfusions_tenant_isolation ON blood_bank_transfusions;
CREATE POLICY rls_blood_bank_transfusions_tenant_isolation ON blood_bank_transfusions
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------------------------------------------------------------------------
-- 5) blood_bank_transfusion_reactions  (NEW TABLE — created by E13)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blood_bank_transfusion_reactions (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfusion_id  INTEGER NOT NULL REFERENCES blood_bank_transfusions(id) ON DELETE CASCADE,
  unit_id         INTEGER,
  patient_id      INTEGER,
  reaction_type   TEXT DEFAULT '',
  severity        TEXT DEFAULT 'Mild',
  reaction_details TEXT DEFAULT '',
  vital_signs_after TEXT DEFAULT '',
  action_taken    TEXT DEFAULT '',
  reported_by     TEXT DEFAULT '',
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bb_reactions_tenant      ON blood_bank_transfusion_reactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bb_reactions_tenant_unit ON blood_bank_transfusion_reactions (tenant_id, unit_id);
ALTER TABLE blood_bank_transfusion_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_bank_transfusion_reactions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_blood_bank_transfusion_reactions_tenant_isolation ON blood_bank_transfusion_reactions;
CREATE POLICY rls_blood_bank_transfusion_reactions_tenant_isolation ON blood_bank_transfusion_reactions
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

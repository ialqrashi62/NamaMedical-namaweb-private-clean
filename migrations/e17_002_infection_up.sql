-- ============================================================================
-- Epic E17 — Infection Control: HAI isolation tracking + antimicrobial stewardship
-- Candidate migration (UP). Idempotent. DO NOT auto-execute in production.
-- Adds 2 new tables (hai_isolation, ams_flags) with FORCE RLS + canonical tenant
-- policy. Both reference patients(id). The down migration drops only these tables.
-- ============================================================================
BEGIN;

-- ---- HAI isolation tracking (precaution start/stop per patient) ----
CREATE TABLE IF NOT EXISTS hai_isolation (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT DEFAULT '',
    surveillance_id INTEGER,                            -- optional link to infection_surveillance
    precaution_type TEXT NOT NULL DEFAULT 'contact',    -- standard|contact|droplet|airborne|protective
    hai_category TEXT DEFAULT '',                       -- CLABSI|CAUTI|VAP|SSI|... (empty = community)
    organism TEXT DEFAULT '',
    ward TEXT DEFAULT '',
    bed TEXT DEFAULT '',
    effective_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'Active',              -- Active | Resolved | Discontinued
    notes TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE hai_isolation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hai_isolation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hai_isolation_tenant_isolation ON hai_isolation;
CREATE POLICY rls_hai_isolation_tenant_isolation ON hai_isolation
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_hai_isolation_tenant_facility ON hai_isolation (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_hai_isolation_patient ON hai_isolation (patient_id);
CREATE INDEX IF NOT EXISTS idx_hai_isolation_tenant_status ON hai_isolation (tenant_id, status);

-- ---- Antimicrobial stewardship flags (review of antibiotic orders) ----
CREATE TABLE IF NOT EXISTS ams_flags (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT DEFAULT '',
    antibiotic TEXT NOT NULL DEFAULT '',
    flag_reason TEXT NOT NULL DEFAULT '',               -- restricted|de-escalation|duration|duplicate|IV-to-PO
    severity TEXT NOT NULL DEFAULT 'Advisory',          -- Advisory | Action Required | Critical
    flagged_by TEXT DEFAULT '',
    reviewed_by TEXT DEFAULT '',
    reviewed_at TIMESTAMP,
    review_outcome TEXT DEFAULT '',                     -- approved|modified|stopped
    status TEXT NOT NULL DEFAULT 'Open',                -- Open | Reviewed | Closed
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE ams_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ams_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_ams_flags_tenant_isolation ON ams_flags;
CREATE POLICY rls_ams_flags_tenant_isolation ON ams_flags
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_ams_flags_tenant_facility ON ams_flags (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_ams_flags_patient ON ams_flags (patient_id);
CREATE INDEX IF NOT EXISTS idx_ams_flags_tenant_status ON ams_flags (tenant_id, status);

COMMIT;

-- ============================================================================
-- Epic E17 — Quality / Incidents / CAPA + Risk Register
-- Candidate migration (UP). Idempotent. DO NOT auto-execute in production.
-- Adds 2 new tables (quality_capa, quality_risk_register) with FORCE RLS +
-- canonical tenant policy, and REVERSIBLY extends the pre-existing
-- quality_incidents table with E17 incident-management columns
-- (harm_level, near_miss, confidential, encounter_id, visit_id, capa state).
-- The down migration drops the 2 NEW tables and removes ONLY the added columns;
-- it never drops quality_incidents itself.
-- ============================================================================
BEGIN;

-- ---- Extend pre-existing quality_incidents (additions are reversed by down) ----
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS harm_level TEXT NOT NULL DEFAULT 'None';
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS near_miss INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS confidential INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS encounter_id INTEGER;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS visit_id INTEGER;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS workflow_state TEXT NOT NULL DEFAULT 'Open';
CREATE INDEX IF NOT EXISTS idx_quality_incidents_tenant ON quality_incidents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quality_incidents_tenant_state ON quality_incidents (tenant_id, workflow_state);

-- ---- CAPA: corrective / preventive actions with owner, due date, state machine ----
CREATE TABLE IF NOT EXISTS quality_capa (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    incident_id INTEGER NOT NULL REFERENCES quality_incidents(id) ON DELETE CASCADE,
    capa_type TEXT NOT NULL DEFAULT 'Corrective',     -- Corrective | Preventive
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    root_cause TEXT DEFAULT '',
    owner_user_id INTEGER,
    owner_name TEXT DEFAULT '',
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'Pending',            -- Pending | InProgress | Completed | Verified | Cancelled
    completion_notes TEXT DEFAULT '',
    completion_date DATE,
    verified_by TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE quality_capa ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_capa FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_capa_tenant_isolation ON quality_capa;
CREATE POLICY rls_quality_capa_tenant_isolation ON quality_capa
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_quality_capa_tenant_facility ON quality_capa (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_quality_capa_incident ON quality_capa (incident_id);
CREATE INDEX IF NOT EXISTS idx_quality_capa_tenant_status ON quality_capa (tenant_id, status);

-- ---- Risk register: indicators / targets / trend, optionally linked to incident ----
CREATE TABLE IF NOT EXISTS quality_risk_register (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    incident_id INTEGER REFERENCES quality_incidents(id) ON DELETE SET NULL,
    risk_title TEXT NOT NULL DEFAULT '',
    category TEXT DEFAULT '',
    likelihood INTEGER NOT NULL DEFAULT 1,             -- 1..5
    impact INTEGER NOT NULL DEFAULT 1,                 -- 1..5
    risk_score INTEGER NOT NULL DEFAULT 1,             -- likelihood*impact (server-computed)
    risk_level TEXT NOT NULL DEFAULT 'Low',            -- Low | Medium | High | Extreme (server-computed)
    control_measure TEXT DEFAULT '',
    residual_likelihood INTEGER,
    residual_impact INTEGER,
    residual_score INTEGER,
    owner_name TEXT DEFAULT '',
    review_date DATE,
    status TEXT NOT NULL DEFAULT 'Open',               -- Open | Mitigating | Closed
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE quality_risk_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_risk_register FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_risk_register_tenant_isolation ON quality_risk_register;
CREATE POLICY rls_quality_risk_register_tenant_isolation ON quality_risk_register
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_quality_risk_tenant_facility ON quality_risk_register (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_quality_risk_tenant_status ON quality_risk_register (tenant_id, status);

COMMIT;

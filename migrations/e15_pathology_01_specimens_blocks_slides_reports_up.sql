-- ============================================================================
-- E15 PATHOLOGY — UP (candidate; idempotent; FORCE RLS + canonical tenant policy)
-- Creates the specimen -> block -> slide hierarchy + structured signed reports.
-- Every table: tenant_id NOT NULL REFERENCES tenants(id), FORCE RLS, canonical
-- policy tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::integer
-- DO NOT execute manually. Reviewed/applied via the controlled migration runner.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. path_specimens  (accessioned specimen; unique accession per tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS path_specimens (
    id                SERIAL PRIMARY KEY,
    tenant_id         INTEGER NOT NULL REFERENCES tenants(id),
    facility_id       INTEGER,
    patient_id        INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_id          INTEGER REFERENCES visits(id),
    accession_number  TEXT NOT NULL,
    specimen_type     TEXT,
    site              TEXT,
    clinical_details  TEXT,
    priority          TEXT NOT NULL DEFAULT 'routine'
                       CHECK (priority IN ('routine','urgent','stat')),
    state             TEXT NOT NULL DEFAULT 'Received'
                       CHECK (state IN ('Received','Grossing','Processing','Reported','SignedOut')),
    received_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blocks_count      INTEGER NOT NULL DEFAULT 0,
    created_by        INTEGER,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_path_specimen_accession UNIQUE (tenant_id, accession_number)
);
ALTER TABLE path_specimens ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_specimens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS path_specimens_tenant_isolation ON path_specimens;
CREATE POLICY path_specimens_tenant_isolation ON path_specimens
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_path_specimens_tenant ON path_specimens (tenant_id, patient_id);

-- ---------------------------------------------------------------------------
-- 2. path_blocks  (cassettes embedded from a specimen)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS path_blocks (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
    specimen_id     INTEGER NOT NULL REFERENCES path_specimens(id) ON DELETE CASCADE,
    block_no        TEXT NOT NULL,
    cassette_label  TEXT,
    embedding_type  TEXT DEFAULT 'paraffin',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE path_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_blocks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS path_blocks_tenant_isolation ON path_blocks;
CREATE POLICY path_blocks_tenant_isolation ON path_blocks
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_path_blocks_specimen ON path_blocks (tenant_id, specimen_id);

-- ---------------------------------------------------------------------------
-- 3. path_slides  (stained slides cut from a block)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS path_slides (
    id           SERIAL PRIMARY KEY,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
    block_id     INTEGER NOT NULL REFERENCES path_blocks(id) ON DELETE CASCADE,
    specimen_id  INTEGER NOT NULL REFERENCES path_specimens(id) ON DELETE CASCADE,
    slide_no     TEXT NOT NULL,
    stain_type   TEXT DEFAULT 'H&E',
    cut_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE path_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_slides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS path_slides_tenant_isolation ON path_slides;
CREATE POLICY path_slides_tenant_isolation ON path_slides
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_path_slides_block ON path_slides (tenant_id, block_id);

-- ---------------------------------------------------------------------------
-- 4. path_reports  (structured report; SNOMED; state machine; sign-out)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS path_reports (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
    facility_id     INTEGER,
    specimen_id     INTEGER NOT NULL REFERENCES path_specimens(id) ON DELETE CASCADE,
    pathologist_id  INTEGER,
    gross_text      TEXT,
    micro_text      TEXT,
    diagnosis       TEXT,
    snomed_codes    JSONB DEFAULT '[]'::jsonb,
    icd10_codes     JSONB DEFAULT '[]'::jsonb,
    malignancy_flag BOOLEAN NOT NULL DEFAULT FALSE,
    critical_flag   BOOLEAN NOT NULL DEFAULT FALSE,
    state           TEXT NOT NULL DEFAULT 'Received'
                     CHECK (state IN ('Received','Grossing','Processing','Reported','SignedOut')),
    signed_at       TIMESTAMP,
    signed_by       INTEGER,
    addendum_count  INTEGER NOT NULL DEFAULT 0,
    addenda         JSONB DEFAULT '[]'::jsonb,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_path_report_specimen UNIQUE (tenant_id, specimen_id)
);
ALTER TABLE path_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS path_reports_tenant_isolation ON path_reports;
CREATE POLICY path_reports_tenant_isolation ON path_reports
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_path_reports_specimen ON path_reports (tenant_id, specimen_id);

COMMIT;

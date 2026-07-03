-- ============================================================
-- p1_04_pricing_overrides_up.sql
-- Creates tenant-specific pricing overrides tables with RLS enabled.
-- ============================================================

-- Medical Services Overrides
CREATE TABLE IF NOT EXISTS tenant_service_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES medical_services(id) ON DELETE CASCADE,
    custom_price REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_service UNIQUE (tenant_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_svc_overrides ON tenant_service_overrides (tenant_id, service_id);
ALTER TABLE tenant_service_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_service_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_service_overrides_tenant_isolation ON tenant_service_overrides;
CREATE POLICY rls_tenant_service_overrides_tenant_isolation ON tenant_service_overrides
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Lab Tests Overrides
CREATE TABLE IF NOT EXISTS tenant_lab_test_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    test_id INTEGER NOT NULL REFERENCES lab_tests_catalog(id) ON DELETE CASCADE,
    custom_price REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_lab_test UNIQUE (tenant_id, test_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_lab_overrides ON tenant_lab_test_overrides (tenant_id, test_id);
ALTER TABLE tenant_lab_test_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_lab_test_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_lab_test_overrides_tenant_isolation ON tenant_lab_test_overrides;
CREATE POLICY rls_tenant_lab_test_overrides_tenant_isolation ON tenant_lab_test_overrides
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Radiology Overrides
CREATE TABLE IF NOT EXISTS tenant_radiology_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    radiology_id INTEGER NOT NULL REFERENCES radiology_catalog(id) ON DELETE CASCADE,
    custom_price REAL NOT NULL,
    custom_template TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_radiology UNIQUE (tenant_id, radiology_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_rad_overrides ON tenant_radiology_overrides (tenant_id, radiology_id);
ALTER TABLE tenant_radiology_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_radiology_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_radiology_overrides_tenant_isolation ON tenant_radiology_overrides;
CREATE POLICY rls_tenant_radiology_overrides_tenant_isolation ON tenant_radiology_overrides
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Grant privileges
GRANT ALL PRIVILEGES ON TABLE tenant_service_overrides TO nama_medical_app;
GRANT ALL PRIVILEGES ON TABLE tenant_lab_test_overrides TO nama_medical_app;
GRANT ALL PRIVILEGES ON TABLE tenant_radiology_overrides TO nama_medical_app;
GRANT USAGE, SELECT ON SEQUENCE tenant_service_overrides_id_seq TO nama_medical_app;
GRANT USAGE, SELECT ON SEQUENCE tenant_lab_test_overrides_id_seq TO nama_medical_app;
GRANT USAGE, SELECT ON SEQUENCE tenant_radiology_overrides_id_seq TO nama_medical_app;

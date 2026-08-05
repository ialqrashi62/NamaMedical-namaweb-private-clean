BEGIN;
CREATE TABLE IF NOT EXISTS csp_reports (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INT,
    document_uri TEXT,
    directive TEXT,
    blocked_uri TEXT,
    source_ip TEXT,
    user_agent TEXT,
    raw_body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS csp_reports_tenant_created_idx ON csp_reports (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS csp_reports_created_idx ON csp_reports (created_at DESC);
ALTER TABLE csp_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE csp_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_csp_reports_tenant_isolation ON csp_reports;
CREATE POLICY rls_csp_reports_tenant_isolation ON csp_reports
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
GRANT SELECT, INSERT ON csp_reports TO nama_medical_app;
GRANT USAGE, SELECT ON SEQUENCE csp_reports_id_seq TO nama_medical_app;
COMMIT;
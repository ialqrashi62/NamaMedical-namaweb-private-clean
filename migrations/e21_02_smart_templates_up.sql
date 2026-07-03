-- e21_02_smart_templates_up.sql
-- Migration to add clinical_smart_templates table for Dot Phrases (Phase F2)

CREATE TABLE IF NOT EXISTS clinical_smart_templates (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    shortcut VARCHAR(50) NOT NULL,
    template_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doctor_shortcut UNIQUE (tenant_id, doctor_id, shortcut)
);

-- Enable Row Level Security
ALTER TABLE clinical_smart_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_smart_templates FORCE ROW LEVEL SECURITY;

-- Create Tenant isolation policy
DROP POLICY IF EXISTS rls_clinical_smart_templates ON clinical_smart_templates;
CREATE POLICY rls_clinical_smart_templates ON clinical_smart_templates
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Grant privileges to nama_medical_app
GRANT ALL PRIVILEGES ON TABLE clinical_smart_templates TO nama_medical_app;

-- Migration: e77_rad_extensions_up.sql
-- Description: Adds specialized tables for Advanced Radiology and Nuclear Medicine.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS radiology_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    modality VARCHAR(50), -- CT, MRI, PET, XRAY
    study_uid VARCHAR(255),
    image_path TEXT, -- Path to phi_vault/
    contrast_used BOOLEAN DEFAULT FALSE,
    radiation_dose_msv FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_rad FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_rad FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT la_radiology_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    findings TEXT,
    impression TEXT,
    status VARCHAR(50), -- Draft, Final, Critical
    radiologist_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_rep FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_scan_rep FOREIGN KEY (scan_id) REFERENCES radiology_scans(id) ON DELETE CASCADE
);

ALTER TABLE radiology_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_radiology_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON radiology_scans USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON la_radiology_reports USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;

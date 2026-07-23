-- Migration: e101_interventional_cardiology_up.sql
-- Description: Specialized tables for Interventional Cardiology (Cath Lab) with Tenant Isolation

BEGIN;

-- 1. PCI Sessions Table
CREATE TABLE IF NOT EXISTS pci_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    access_site VARCHAR(50), -- Radial, Femoral, etc.
    contrast_volume_ml DECIMAL(10,2),
    fluoroscopy_time_min DECIMAL(10,2),
    door_to_balloon_min INTEGER,
    status VARCHAR(50), -- Scheduled, In-Progress, Completed, Complication
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Stent Registry Table
CREATE TABLE IF NOT EXISTS stent_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    session_id UUID REFERENCES pci_sessions(id) ON DELETE CASCADE,
    vessel_segment VARCHAR(100), -- LAD, LCx, RCA
    stent_brand VARCHAR(100),
    diameter_mm DECIMAL(4,2),
    length_mm DECIMAL(4,2),
    material VARCHAR(50), -- DES, BMS, Bioresorbable
    pressure_post_dilation DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Hemodynamics Log (High Frequency)
CREATE TABLE IF NOT EXISTS pci_hemodynamics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    session_id UUID REFERENCES pci_sessions(id) ON DELETE CASCADE,
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    heart_rate INTEGER,
    mean_ap INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE pci_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pci_hemodynamics ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
CREATE POLICY tenant_isolation_pci ON pci_sessions USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_stents ON stent_registry USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_hemo ON pci_hemodynamics USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE INDEX idx_pci_patient ON pci_sessions(patient_id);
CREATE INDEX idx_stent_session ON stent_registry(session_id);
CREATE INDEX idx_hemo_session ON pci_hemodynamics(session_id);

COMMIT;

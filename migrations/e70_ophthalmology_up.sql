-- Migration: e70_ophthalmology_up.sql
-- Purpose: Implement specialized tables for Ophthalmology

BEGIN;

-- 1. Ophthalmic Surgical Logs
CREATE TABLE IF NOT EXISTS ophthalmic_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., Phacoemulsification, Vitrectomy, Keratoplasty
    eye_side VARCHAR(10), -- Left, Right, Bilateral
    duration_minutes INTEGER,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. IOL (Intraocular Lens) Registry
CREATE TABLE IF NOT EXISTS iol_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID REFERENCES ophthalmic_surgical_logs(id),
    lens_type VARCHAR(50), -- Monofocal, Multifocal, Toric
    lens_power FLOAT, -- Diopters
    lens_brand VARCHAR(100),
    lens_serial_number VARCHAR(100),
    calculated_power FLOAT,
    actual_power FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Glaucoma & IOP Metrics
CREATE TABLE IF NOT EXISTS glaucoma_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    iop_value FLOAT, -- mmHg
    drainage_device VARCHAR(100), -- e.g., Ahmed Valve, Baervat
    cup_to_disc_ratio FLOAT,
    visual_field_loss_percent FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE ophthalmic_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE iol_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE glaucoma_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY ophthalmic_surgical_logs_tenant_policy ON ophthalmic_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY iol_registry_tenant_policy ON iol_registry 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY glaucoma_metrics_tenant_policy ON glaucoma_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;

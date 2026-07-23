-- Migration: e68_neurosurgery_spine_up.sql
-- Purpose: Implement specialized tables for Neurosurgery and Spine Surgery

BEGIN;

-- 1. Neurosurgical Intervention Logs
CREATE TABLE IF NOT EXISTS neuro_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., Craniotomy, Laminectomy, Ventriculostomy
    approach VARCHAR(100), -- e.g., Pterional, Midline, Posterior
    side VARCHAR(10), -- Left, Right, Bilateral
    duration_minutes INTEGER,
    blood_loss_ml INTEGER,
    intraop_findings TEXT,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Intracranial Pressure (ICP) & Cerebral Perfusion Pressure (CPP) Logs
CREATE TABLE IF NOT EXISTS intracranial_pressure_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    icp_value FLOAT, -- mmHg
    map_value FLOAT, -- Mean Arterial Pressure (mmHg)
    cpp_value FLOAT, -- Cerebral Perfusion Pressure (MAP - ICP)
    gcs_score INTEGER, -- Glasgow Coma Scale
    pupil_status TEXT,
    nurse_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Spine Stability & ASIA Metrics
CREATE TABLE IF NOT EXISTS spine_stability_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    assessment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    spinal_level VARCHAR(20), -- e.g., C5-C6, T12-L1
    asia_impairment_grade VARCHAR(10), -- A, B, C, D, E
    motor_score INTEGER,
    sensory_score INTEGER,
    stability_grade VARCHAR(50), -- Stable, Unstable
    fusion_recommended BOOLEAN DEFAULT FALSE,
    surgeon_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE neuro_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intracranial_pressure_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spine_stability_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY neuro_surgical_logs_tenant_policy ON neuro_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY intracranial_pressure_logs_tenant_policy ON intracranial_pressure_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY spine_stability_metrics_tenant_policy ON spine_stability_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;

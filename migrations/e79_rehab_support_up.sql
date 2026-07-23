-- Migration: e79_rehab_support_up.sql
-- Purpose: Implement specialized tables for Rehab & Support (Wave 6)

BEGIN;

-- 1. Physical Therapy Logs
CREATE TABLE IF NOT EXISTS rehab_physical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    joint_name VARCHAR(100),
    rom_degrees FLOAT, -- Range of Motion
    mmt_grade INTEGER, -- Manual Muscle Testing (0-5)
    gait_status VARCHAR(50), -- e.g., Independent, Assisted, Non-ambulatory
    balance_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Occupational Therapy Logs
CREATE TABLE IF NOT EXISTS rehab_occupational_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    adl_score INTEGER, -- Activities of Daily Living score
    adaptive_equipment_needed TEXT,
    cognitive_function_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Speech & Language Pathology Logs
CREATE TABLE IF NOT EXISTS rehab_speech_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    dysphagia_grade INTEGER, -- 0-4
    communication_level VARCHAR(50),
    voice_quality VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Psychosocial Support Logs
CREATE TABLE IF NOT EXISTS psychosocial_support_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    phq9_score INTEGER, -- Depression
    gad7_score INTEGER, -- Anxiety
    sdoh_markers TEXT, -- Social Determinants of Health
    support_system_grade VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE rehab_physical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehab_occupational_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehab_speech_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychosocial_support_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY rehab_physical_logs_tenant_policy ON rehab_physical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY rehab_occupational_logs_tenant_policy ON rehab_occupational_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY rehab_speech_logs_tenant_policy ON rehab_speech_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY psychosocial_support_logs_tenant_policy ON psychosocial_support_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;

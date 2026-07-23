-- Migration: e70_cardio_thoracic_extensions_up.sql
-- Description: Adds specialized tables for Cardiothoracic and Vascular Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Cardiothoracic Surgery Sessions
CREATE TABLE IF NOT EXISTS cardio_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    procedure_type VARCHAR(255), -- e.g., CABG, Valve Replacement
    pump_time_minutes INTEGER,
    cross_clamp_time_minutes INTEGER,
    bypass_flow_rate FLOAT,
    intraop_map_avg INTEGER,
    outcome_status VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ctS FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_ctS FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Vascular Grafts Registry
CREATE TABLE IF NOT EXISTS vascular_grafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    session_id UUID NOT NULL,
    graft_type VARCHAR(100), -- e.g., PTFE, Dacron, Autologous
 la_diameter_mm FLOAT,
    location_segment VARCHAR(255),
    patency_status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_vg FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_vg FOREIGN KEY (session_id) REFERENCES cardio_surgery_sessions(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE cardio_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vascular_grafts ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON cardio_surgery_sessions 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON vascular_grafts 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;

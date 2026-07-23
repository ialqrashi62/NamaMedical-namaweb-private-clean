-- Migration for General Surgery Specialized Data
-- Target: namaweb/migrations/e66_general_surgery_up.sql

CREATE TABLE IF NOT EXISTS surgical_safety_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    phase TEXT CHECK (phase IN ('Sign-in', 'Time-out', 'Sign-out')),
    checklist_completed BOOLEAN DEFAULT FALSE,
    verified_by UUID NOT NULL REFERENCES system_users(id),
    verification_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surgical_intra_op_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    estimated_blood_loss DECIMAL(6,2),
    actual_blood_loss DECIMAL(6,2),
    anesthesia_start TIMESTAMP WITH TIME ZONE,
    anesthesia_end TIMESTAMP WITH TIME ZONE,
    tourniquet_time_min INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surgical_robotic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    robot_model TEXT,
    console_time_min INTEGER,
    port_locations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE surgical_safety_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgical_intra_op_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgical_robotic_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON surgical_safety_checklists 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON surgical_intra_op_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON surgical_robotic_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

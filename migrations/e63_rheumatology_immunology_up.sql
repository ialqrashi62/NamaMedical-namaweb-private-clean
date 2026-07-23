-- Migration for Rheumatology & Immunology Specialized Data
-- Target: namaweb/migrations/e63_rheumatology_immunology_up.sql

CREATE TABLE IF NOT EXISTS rheum_joint_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    joint_name TEXT NOT NULL, -- e.g., 'MCP 2-Right', 'PIP 3-Left'
    tenderness_grade INTEGER CHECK (tenderness_grade BETWEEN 0 AND 3),
    swelling_grade INTEGER CHECK (swelling_grade BETWEEN 0 AND 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rheum_activity_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    das28_score DECIMAL(4,2),
    la28_score DECIMAL(4,2),
    activity_level TEXT CHECK (activity_level IN ('Remission', 'Low', 'Moderate', 'High')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rheum_biologic_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    drug_name TEXT NOT NULL,
    screening_status TEXT CHECK (screening_status IN ('Pending', 'Clear', 'Flagged')),
    last_dose_date DATE,
    next_dose_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE rheum_joint_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rheum_activity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rheum_biologic_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON rheum_joint_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON rheum_activity_scores 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON rheum_biologic_tracking 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

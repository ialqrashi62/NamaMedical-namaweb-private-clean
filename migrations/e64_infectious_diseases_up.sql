-- Migration for Infectious Diseases & Infection Control
-- Target: namaweb/migrations/e64_infectious_diseases_up.sql

CREATE TABLE IF NOT EXISTS infectious_isolation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    isolation_type TEXT CHECK (isolation_type IN ('Airborne', 'Droplet', 'Contact', 'Protective')),
    room_number TEXT,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    status TEXT CHECK (status IN ('Active', 'Resolved', 'Transferred')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS antimicrobial_stewardship_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    drug_name TEXT NOT NULL,
    dose TEXT,
    start_date DATE,
    stop_date DATE,
    indication TEXT,
    stewardship_approval BOOLEAN DEFAULT FALSE,
    review_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE infectious_isolation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE antimicrobial_stewardship_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON infectious_isolation_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON antimicrobial_stewardship_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

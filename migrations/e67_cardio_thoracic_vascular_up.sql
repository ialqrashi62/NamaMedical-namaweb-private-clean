-- Migration for Cardiothoracic & Vascular Surgery Specialized Data
-- Target: namaweb/migrations/e67_cardio_thoracic_vascular_up.sql

CREATE TABLE IF NOT EXISTS cardio_thoracic_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    cpb_start TIMESTAMP WITH TIME ZONE,
    cpb_end TIMESTAMP WITH TIME ZONE,
    cross_clamp_start TIMESTAMP WITH TIME ZONE,
    cross_clamp_end TIMESTAMP WITH TIME ZONE,
    pump_flow_rate DECIMAL(6,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vascular_graft_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    graft_type TEXT CHECK (graft_type IN ('Synthetic', 'Autologous')),
    material TEXT,
    diameter_mm DECIMAL(4,2),
    location TEXT,
    patency_check_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE cardio_thoracic_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE vascular_graft_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON cardio_thoracic_metrics 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON vascular_graft_registry 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Migration: e80_admin_ops_up.sql
-- Purpose: Implement specialized tables for Admin & Ops (Wave 7)

BEGIN;

-- 1. Resource Optimization Logs
CREATE TABLE IF NOT EXISTS admin_resource_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    bed_occupancy_percent FLOAT,
    staff_patient_ratio FLOAT,
    or_utilization_percent FLOAT,
    resource_bottleneck VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Financial Integrity & Leakage Logs
CREATE TABLE IF NOT EXISTS financial_integrity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revenue_leakage_amount FLOAT,
    cost_per_case_avg FLOAT,
    billing_anomaly_detected BOOLEAN,
    anomaly_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. HCM & Credentialing Logs
CREATE TABLE IF NOT EXISTS hcm_credentialing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    physician_id UUID,
    license_expiry_date DATE,
    credentialing_status VARCHAR(50), -- e.g., Active, Pending, Expired
    last_audit_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Supply Chain & Cold-Chain Metrics
CREATE TABLE IF NOT EXISTS supply_chain_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    item_id UUID,
    inventory_level INTEGER,
    cold_chain_temp_c FLOAT,
    temp_deviation_alert BOOLEAN,
    reorder_point_reached BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE admin_resource_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_integrity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm_credentialing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_chain_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY admin_resource_logs_tenant_policy ON admin_resource_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY financial_integrity_logs_tenant_policy ON financial_integrity_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY hcm_credentialing_logs_tenant_policy ON hcm_credentialing_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY supply_chain_metrics_tenant_policy ON supply_chain_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;

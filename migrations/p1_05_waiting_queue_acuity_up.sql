-- ============================================================================
-- P1 PHASE waiting_queue ACUITY — UP
-- Updates waiting_queue with triage levels and provisions visit_lifecycle table.
-- ============================================================================
BEGIN;

-- 1. Create visit_lifecycle table if not exists (out-of-band schema provision)
CREATE TABLE IF NOT EXISTS visit_lifecycle (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    patient_id INTEGER,
    patient_name TEXT DEFAULT '',
    appointment_id INTEGER,
    doctor TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status TEXT DEFAULT 'arrived',
    stage TEXT DEFAULT 'arrived',
    arrived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triage_at TIMESTAMP,
    triage_level INTEGER,
    pain_score INTEGER,
    consult_start TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enable RLS and isolating policies for visit_lifecycle
ALTER TABLE visit_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_lifecycle FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_visit_lifecycle_tenant_isolation ON visit_lifecycle;
CREATE POLICY rls_visit_lifecycle_tenant_isolation ON visit_lifecycle
    FOR ALL
    TO PUBLIC
    USING (tenant_id = current_setting('app.tenant_id', true)::integer);

-- 3. Add new columns to waiting_queue if they do not exist
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS triage_level INTEGER DEFAULT 5;
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS acuity_notes TEXT DEFAULT '';
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS exam_room_id VARCHAR(50) DEFAULT '';
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 4. Update default status and convert legacy statuses
ALTER TABLE waiting_queue ALTER COLUMN status SET DEFAULT 'CheckedIn';
UPDATE waiting_queue SET status = 'CheckedIn' WHERE status = 'Waiting';

-- 5. Add CHECK constraint on status (drop if exists first)
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS chk_waiting_queue_status;
ALTER TABLE waiting_queue ADD CONSTRAINT chk_waiting_queue_status 
    CHECK (status IN ('CheckedIn', 'Triage', 'WaitingForProvider', 'InConsultation', 'WaitingForResults', 'ReadyForDischarge', 'NoShow'));

-- 6. Ensure tenant_id exists and is NOT NULL
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE waiting_queue SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE waiting_queue ALTER COLUMN tenant_id SET NOT NULL;

-- 7. Add tenant_id FK to tenants if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'waiting_queue' AND kcu.column_name = 'tenant_id'
    ) THEN
        ALTER TABLE waiting_queue ADD CONSTRAINT fk_waiting_queue_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 8. Enable Row Level Security (RLS) and Force it
ALTER TABLE waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_queue FORCE ROW LEVEL SECURITY;

-- 9. Create or replace canonical tenant isolation policy
DROP POLICY IF EXISTS rls_waiting_queue_tenant_isolation ON waiting_queue;
CREATE POLICY rls_waiting_queue_tenant_isolation ON waiting_queue
    FOR ALL
    TO PUBLIC
    USING (tenant_id = current_setting('app.tenant_id', true)::integer);

COMMIT;

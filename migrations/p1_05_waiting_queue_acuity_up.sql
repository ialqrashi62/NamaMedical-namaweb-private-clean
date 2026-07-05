-- ============================================================================
-- P1 PHASE waiting_queue ACUITY — UP
-- Updates waiting_queue with triage levels, room assignments, check constraint, and RLS.
-- ============================================================================
BEGIN;

-- 1. Add new columns if they do not exist
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS triage_level INTEGER DEFAULT 5;
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS acuity_notes TEXT DEFAULT '';
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS exam_room_id VARCHAR(50) DEFAULT '';
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Update default status and convert legacy statuses
ALTER TABLE waiting_queue ALTER COLUMN status SET DEFAULT 'CheckedIn';
UPDATE waiting_queue SET status = 'CheckedIn' WHERE status = 'Waiting';

-- 3. Add CHECK constraint on status (drop if exists first)
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS chk_waiting_queue_status;
ALTER TABLE waiting_queue ADD CONSTRAINT chk_waiting_queue_status 
    CHECK (status IN ('CheckedIn', 'Triage', 'WaitingForProvider', 'InConsultation', 'WaitingForResults', 'ReadyForDischarge', 'NoShow'));

-- 4. Ensure tenant_id exists and is NOT NULL
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE waiting_queue SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE waiting_queue ALTER COLUMN tenant_id SET NOT NULL;

-- 5. Add tenant_id FK to tenants if not exists
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

-- 6. Enable Row Level Security (RLS) and Force it
ALTER TABLE waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_queue FORCE ROW LEVEL SECURITY;

-- 7. Create or replace canonical tenant isolation policy
DROP POLICY IF EXISTS rls_waiting_queue_tenant_isolation ON waiting_queue;
CREATE POLICY rls_waiting_queue_tenant_isolation ON waiting_queue
    FOR ALL
    TO PUBLIC
    USING (tenant_id = current_setting('app.tenant_id', true)::integer);

COMMIT;

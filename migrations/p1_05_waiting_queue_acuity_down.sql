-- ============================================================================
-- P1 PHASE waiting_queue ACUITY — DOWN
-- Reverses modifications to waiting_queue and drops visit_lifecycle.
-- ============================================================================
BEGIN;

-- 1. Drop visit_lifecycle policy and table
DROP POLICY IF EXISTS rls_visit_lifecycle_tenant_isolation ON visit_lifecycle;
DROP TABLE IF EXISTS visit_lifecycle CASCADE;

-- 2. Drop policy and constraints on waiting_queue
DROP POLICY IF EXISTS rls_waiting_queue_tenant_isolation ON waiting_queue;
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS chk_waiting_queue_status;
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS fk_waiting_queue_tenant;

-- 3. Drop newly added columns
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS triage_level;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS acuity_notes;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS exam_room_id;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS updated_at;

-- 4. Reset status column default
ALTER TABLE waiting_queue ALTER COLUMN status SET DEFAULT 'Waiting';
UPDATE waiting_queue SET status = 'Waiting' WHERE status = 'CheckedIn';

COMMIT;

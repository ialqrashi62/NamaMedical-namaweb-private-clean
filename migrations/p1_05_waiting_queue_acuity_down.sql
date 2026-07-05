-- ============================================================================
-- P1 PHASE waiting_queue ACUITY — DOWN
-- Reverses modifications to waiting_queue.
-- ============================================================================
BEGIN;

-- 1. Drop policy and constraints
DROP POLICY IF EXISTS rls_waiting_queue_tenant_isolation ON waiting_queue;
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS chk_waiting_queue_status;
ALTER TABLE waiting_queue DROP CONSTRAINT IF EXISTS fk_waiting_queue_tenant;

-- 2. Drop newly added columns
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS triage_level;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS acuity_notes;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS exam_room_id;
ALTER TABLE waiting_queue DROP COLUMN IF EXISTS updated_at;

-- 3. Reset status column default
ALTER TABLE waiting_queue ALTER COLUMN status SET DEFAULT 'Waiting';
UPDATE waiting_queue SET status = 'Waiting' WHERE status = 'CheckedIn';

COMMIT;

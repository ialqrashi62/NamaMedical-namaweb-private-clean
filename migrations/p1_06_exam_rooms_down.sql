-- ============================================================================
-- P1 PHASE exam_rooms PROVISIONING — DOWN
-- Reverses modifications and drops exam_rooms table.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS rls_exam_rooms_tenant_isolation ON exam_rooms;
DROP TABLE IF EXISTS exam_rooms CASCADE;

COMMIT;

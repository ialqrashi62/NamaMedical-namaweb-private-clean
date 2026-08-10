-- migrations/e48_endocrine_emergency_down.sql
BEGIN;

DROP POLICY IF EXISTS er_trauma_tenant_isolation ON er_trauma_assessments;
DROP TABLE IF EXISTS er_trauma_assessments;

DROP POLICY IF EXISTS er_queue_tenant_isolation ON er_queue;
DROP TABLE IF EXISTS er_queue;

DROP POLICY IF EXISTS er_triage_tenant_isolation ON er_triage;
DROP TABLE IF EXISTS er_triage;

DROP POLICY IF EXISTS thyroid_tenant_isolation ON thyroid_assessments;
DROP TABLE IF EXISTS thyroid_assessments;

DROP POLICY IF EXISTS insulin_doses_tenant_isolation ON insulin_doses;
DROP TABLE IF EXISTS insulin_doses;

COMMIT;

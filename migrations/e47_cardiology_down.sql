-- migrations/e47_cardiology_down.sql
-- Reverse of e47_cardiology_up.sql (non-destructive but drops objects)

BEGIN;

DROP POLICY IF EXISTS cardiology_proc_tenant_isolation ON cardiology_procedures;
DROP TABLE IF EXISTS cardiology_procedures;

DROP POLICY IF EXISTS cardiology_meds_tenant_isolation ON cardiology_medications;
DROP TABLE IF EXISTS cardiology_medications;

DROP POLICY IF EXISTS cardiology_ecg_reports_tenant_isolation ON cardiology_ecg_reports;
DROP TABLE IF EXISTS cardiology_ecg_reports;

DROP POLICY IF EXISTS cardiology_assessments_tenant_isolation ON cardiology_assessments;
DROP TABLE IF EXISTS cardiology_assessments;

COMMIT;

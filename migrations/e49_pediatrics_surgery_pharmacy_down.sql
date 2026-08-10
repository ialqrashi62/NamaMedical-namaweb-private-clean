-- migrations/e49_pediatrics_surgery_pharmacy_down.sql
BEGIN;
DROP POLICY IF EXISTS renal_dose_tenant_isolation ON renal_dose_adjustments;
DROP TABLE IF EXISTS renal_dose_adjustments;
DROP POLICY IF EXISTS drug_int_tenant_isolation ON drug_interaction_checks;
DROP TABLE IF EXISTS drug_interaction_checks;
DROP POLICY IF EXISTS surgery_timeout_tenant_isolation ON surgery_timeouts;
DROP TABLE IF EXISTS surgery_timeouts;
DROP POLICY IF EXISTS surgery_asa_tenant_isolation ON surgery_asa_assessments;
DROP TABLE IF EXISTS surgery_asa_assessments;
DROP POLICY IF EXISTS pediatrics_apgar_tenant_isolation ON pediatrics_apgar;
DROP TABLE IF EXISTS pediatrics_apgar;
COMMIT;

-- e11_03_nphies_lifecycle_tables_down.sql  (rollback of e11_03_nphies_lifecycle_tables_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- جداول جديدة بالكامل => نُسقطها (سياساتها تسقط ضمناً مع DROP TABLE). ترتيب عكسي للاعتماديات
--   (lines/denials تعتمد claims لكنها بـCASCADE؛ نُسقط الجداول الجديدة فقط ولا نمسّ أي جدول قائم). idempotent.
BEGIN;

DROP TABLE IF EXISTS insurance_payer_pricing;
DROP TABLE IF EXISTS insurance_claim_denials;
DROP TABLE IF EXISTS insurance_claim_lines;
DROP TABLE IF EXISTS insurance_pre_authorizations;
DROP TABLE IF EXISTS insurance_eligibility_checks;

COMMIT;

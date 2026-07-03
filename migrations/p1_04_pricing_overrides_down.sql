-- ============================================================
-- p1_04_pricing_overrides_down.sql
-- Drops the pricing overrides tables.
-- ============================================================

DROP TABLE IF EXISTS tenant_service_overrides CASCADE;
DROP TABLE IF EXISTS tenant_lab_test_overrides CASCADE;
DROP TABLE IF EXISTS tenant_radiology_overrides CASCADE;

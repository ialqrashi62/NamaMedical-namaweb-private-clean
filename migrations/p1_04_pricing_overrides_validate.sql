-- ============================================================
-- p1_04_pricing_overrides_validate.sql
-- Validates existence of pricing overrides tables.
-- ============================================================

SELECT (
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenant_service_overrides'
    ) AND EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenant_lab_test_overrides'
    ) AND EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenant_radiology_overrides'
    )
) AS all_ok;

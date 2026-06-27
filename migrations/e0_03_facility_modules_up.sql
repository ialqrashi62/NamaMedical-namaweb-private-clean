-- ============================================================
-- e0_03_facility_modules_up.sql
-- E0 Facility Onboarding Wizard — migration 3 of 3.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: إنشاء جدول facility_modules (الوحدات المُفعّلة لكل مستأجر) ليحلّ ديناميكياً محلّ/يدعم
--   ثابت FACILITY_ALLOWED في app.js. module_index = فهرس NAV_ITEMS (0..42).
--   FORCE RLS بعزل tenant_id (نفس نمط 150 سياسة) + فهرس tenant_id + UNIQUE(tenant_id, module_index).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS facility_modules (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_index INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_facility_module UNIQUE (tenant_id, module_index),
    CONSTRAINT chk_facility_module_index CHECK (module_index >= 0 AND module_index <= 42)
);

CREATE INDEX IF NOT EXISTS idx_facility_modules_tenant ON facility_modules (tenant_id);

ALTER TABLE facility_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_modules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_facility_modules_tenant_isolation ON facility_modules;
CREATE POLICY rls_facility_modules_tenant_isolation ON facility_modules
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

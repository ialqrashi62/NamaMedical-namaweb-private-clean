-- ============================================================
-- ex_02_rbac_up.sql
-- E-X3 RBAC MATRIX — foundational migration (2 of group EX).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: جدول صلاحيات قابل للإدارة يُفعّل الثغرة L6 (عمود system_users.permissions الميت + جدول
--   user_permissions غير المُستخدم). نُنشئ:
--     permissions(id, key UNIQUE, description)            -- كتالوج مفاتيح الصلاحيات (عام، غير مرتبط بمستأجر)
--     role_permissions(tenant_id, role, permission_key)   -- مصفوفة دور->صلاحية لكل مستأجر (FORCE RLS)
--   permissions كتالوج عالمي (لا tenant_id) — قراءة فقط مرجعية، مثل lab_tests_catalog العالمي.
--   role_permissions مرتبط بالمستأجر: tenant_id NOT NULL + ENABLE+FORCE RLS + سياسة العزل القياسية.
--   middleware requirePermission(key) في rbac.js يقرأ role_permissions ويسقط (fallback) إلى requireRole
--   عند غياب أي صف مصفوفة (غير كاسر). البذور في seeds/ex_02_rbac_seed.sql (لا تُنفّذ هنا).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================
BEGIN;

-- ---------- permissions (global catalog of permission keys) ----------
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_permissions_key UNIQUE (key)
);

-- ---------- role_permissions (per-tenant role -> permission_key matrix) ----------
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    permission_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_role_permission UNIQUE (tenant_id, role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id ON role_permissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup ON role_permissions (tenant_id, role);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_role_permissions_tenant_isolation ON role_permissions;
CREATE POLICY rls_role_permissions_tenant_isolation ON role_permissions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

-- ============================================================
-- ex_02_rbac_seed.sql  (baseline RBAC matrix seed; run AFTER ex_02_rbac_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- يبذر كتالوج permissions (عالمي) + يملأ role_permissions لكل مستأجر قائم بنفس خريطة
--   ROLE_PERMISSIONS الثابتة في server.js (مصدر الحقيقة الحالي) لكن كصفوف صلاحيات دقيقة.
-- آمن لإعادة التشغيل: ON CONFLICT DO NOTHING على كلا الجدولين.
-- ملاحظة: role_permissions تحت FORCE RLS؛ هذا البذر يجب أن يُنفّذ كـ table owner / superuser
--   (الذي يتجاوز RLS) أو ضمن جلسة set_config('app.tenant_id',...) المناسبة. النسخة أدناه تستخدم
--   حلقة per-tenant تختم tenant_id صراحةً (تعمل تحت مالك يتجاوز RLS).
-- ============================================================
BEGIN;

-- ---------- 1) Global permission catalog ----------
INSERT INTO permissions (key, description) VALUES
  ('orders:create',   'Create unified clinical orders (lab/rad/med/consult)'),
  ('orders:view',     'View unified clinical orders'),
  ('orders:update',   'Update order status / cancel'),
  ('lab:order',       'Create lab orders'),
  ('lab:result',      'Enter/view lab results'),
  ('rad:order',       'Create radiology orders'),
  ('rad:result',      'Enter/view radiology results'),
  ('rx:create',       'Create prescriptions'),
  ('rx:dispense',     'Dispense medications (pharmacy)'),
  ('patients:view',   'View patient records'),
  ('patients:manage', 'Create/update patient records'),
  ('appointments:manage', 'Manage appointments / scheduling'),
  ('invoices:manage', 'Create/manage invoices and billing'),
  ('reports:view',    'View clinical/operational reports'),
  ('hr:manage',       'Manage employees / HR records'),
  ('settings:manage', 'Manage system settings'),
  ('rbac:manage',     'Manage roles and permissions matrix')
ON CONFLICT (key) DO NOTHING;

-- ---------- 2) Per-tenant role -> permission_key matrix ----------
-- baseline role grants mirror server.js ROLE_PERMISSIONS module lists, expressed as fine-grained keys.
-- Admin is intentionally NOT seeded as rows: requirePermission() short-circuits Admin to next()
-- (mirrors ROLE_PERMISSIONS '*'), and absent rows fall back to requireRole — both non-breaking.
DO $$
DECLARE
    t RECORD;
    grant_row RECORD;
BEGIN
    FOR t IN SELECT id FROM tenants LOOP
        -- I1 fix: role_permissions is under FORCE RLS. Without binding app.tenant_id, the policy
        -- WITH CHECK rejects every INSERT when this seed runs as a NON-superuser app role (silent 0 rows).
        -- Set the tenant context per loop so each tenant's rows pass the policy. A superuser/owner run
        -- BYPASSES RLS entirely (set_config is harmless there) — so this is correct for EITHER role.
        PERFORM set_config('app.tenant_id', t.id::text, false);
        FOR grant_row IN
            SELECT * FROM (VALUES
                ('Doctor',         'orders:create'),
                ('Doctor',         'orders:view'),
                ('Doctor',         'orders:update'),
                ('Doctor',         'lab:order'),
                ('Doctor',         'rad:order'),
                ('Doctor',         'rx:create'),
                ('Doctor',         'patients:view'),
                ('Doctor',         'reports:view'),
                ('Nurse',          'orders:view'),
                ('Nurse',          'patients:view'),
                ('Pharmacist',     'orders:view'),
                ('Pharmacist',     'rx:dispense'),
                ('Lab Technician', 'orders:view'),
                ('Lab Technician', 'lab:result'),
                ('Radiologist',    'orders:view'),
                ('Radiologist',    'rad:result'),
                ('Reception',      'patients:view'),
                ('Reception',      'patients:manage'),
                ('Reception',      'appointments:manage'),
                ('Finance',        'invoices:manage'),
                ('Finance',        'reports:view'),
                ('HR',             'hr:manage'),
                ('HR',             'reports:view'),
                ('IT',             'settings:manage')
            ) AS v(role, permission_key)
        LOOP
            INSERT INTO role_permissions (tenant_id, role, permission_key)
            VALUES (t.id, grant_row.role, grant_row.permission_key)
            ON CONFLICT (tenant_id, role, permission_key) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

COMMIT;

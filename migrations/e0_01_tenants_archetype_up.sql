-- ============================================================
-- e0_01_tenants_archetype_up.sql
-- E0 Facility Onboarding Wizard — migration 1 of 3.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: إضافة عمود archetype إلى tenants (نمط المنشأة: medical_city / large_hospital /
--   general_hospital / polyclinic / health_center). يغذّي facilityType/FACILITY_ALLOWED في الواجهة.
--
-- idempotent: ADD COLUMN IF NOT EXISTS — آمن لإعادة التشغيل. لا RLS على tenants (إنشاء المستأجر
--   عملية عابرة للمستأجرين بصلاحية super-admin؛ RLS على tenants نفسها = منع ذاتي). لا تغيير صفوف.
-- ============================================================
BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archetype VARCHAR(50);

-- معرّفات تنظيمية للمنشأة (غير سرية): ترخيص وزارة الصحة، السجل التجاري، الرقم الضريبي.
-- idempotent: ADD COLUMN IF NOT EXISTS. تُملأ من الويزرد (اختيارية).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS moh_license TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cr_no TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vat_no TEXT;

-- قيد فحص قِيَم النمط المسموحة (idempotent: يُسقط ثم يُنشأ). NULL مسموح (مستأجرون قدماء).
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_archetype;
ALTER TABLE tenants ADD CONSTRAINT chk_tenants_archetype
    CHECK (archetype IS NULL OR archetype IN
        ('medical_city','large_hospital','general_hospital','polyclinic','health_center'));

COMMIT;

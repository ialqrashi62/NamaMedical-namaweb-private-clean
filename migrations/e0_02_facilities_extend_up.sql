-- ============================================================
-- e0_02_facilities_extend_up.sql
-- E0 Facility Onboarding Wizard — migration 2 of 3.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: توسيع جدول facilities القائم (id, tenant_id FK→tenants, name, tax_number, created_at)
--   بأعمدة الويزرد: type/archetype للمنشأة، عدد الأسرّة، العملة، المنطقة الزمنية، و
--   parent_facility_id (self-FK) لدعم "مدينة طبية" (منشآت فرعية ضمن مستأجر واحد).
--   ثم تفعيل FORCE RLS بعزل tenant_id (نفس النمط القائم لـ 150 سياسة) + فهرس tenant_id.
--
-- idempotent: ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS.
-- ملاحظة عزل: facilities مرتبط بـ tenant_id؛ بعد التبديل إلى الدور غير الممتاز (nama_medical_app)
--   تُقرأ/تُكتب فقط ضمن سياق app.tenant_id. إنشاء المنشأة في الويزرد يجري داخل معاملة تضبط
--   app.tenant_id إلى المستأجر الجديد قبل INSERT (انظر مسار /api/admin/facilities/provision).
-- ============================================================
BEGIN;

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS beds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'SAR';
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Riyadh';
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS parent_facility_id INTEGER;

-- self-FK لمدينة طبية (منشأة أمّ ⟵ منشآت فرعية). idempotent عبر فحص pg_constraint.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_facilities_parent') THEN
        ALTER TABLE facilities
            ADD CONSTRAINT fk_facilities_parent
            FOREIGN KEY (parent_facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
    END IF;
END $$;

-- قيد فحص نوع المنشأة (نفس مجموعة الأنماط). NULL مسموح للصفوف القديمة.
ALTER TABLE facilities DROP CONSTRAINT IF EXISTS chk_facilities_type;
ALTER TABLE facilities ADD CONSTRAINT chk_facilities_type
    CHECK (type IS NULL OR type IN
        ('medical_city','large_hospital','general_hospital','polyclinic','health_center'));

-- فهرس tenant_id (نفس نمط الفهارس القائمة).
CREATE INDEX IF NOT EXISTS idx_facilities_tenant ON facilities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_parent ON facilities (parent_facility_id);

-- FORCE RLS بعزل tenant_id (نسخة طبق الأصل من نمط tenant_*_overrides القائم).
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_facilities_tenant_isolation ON facilities;
CREATE POLICY rls_facilities_tenant_isolation ON facilities
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

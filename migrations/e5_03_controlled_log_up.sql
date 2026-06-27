-- ============================================================
-- e5_03_controlled_log_up.sql
-- E5 PHARMACY — Controlled / high-alert drug register (dual-record, witnessed).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سجل دفتر مزدوج للأدوية المراقبة/المخدرات (controlled_drug_log): كل صرف لدواء مراقب يكتب
--   سطراً يربط الدواء + الكمية + الرصيد قبل/بعد + من صرف (dispensed_by) + الشاهد (witnessed_by) + الوصفة.
--   قاعدة FAIL-CLOSED: لا يُصرف دواء مراقب بدون witnessed_by (يفرضها مسار الخادم؛ هنا العمود قابل لـ NULL
--   فقط ليقبل أي سجلات غير مراقبة محتملة، لكن مسار الصرف يرفض أي مراقب بلا شاهد).
--   كذلك (idempotent) يضيف is_controlled / schedule_class على pharmacy_drug_catalog.
--   نفس قالب الـ FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS + عزل + فهرس.
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + ADD COLUMN IF NOT EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS controlled_drug_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id INTEGER,
    drug_id INTEGER,
    drug_name TEXT,
    drug_batch_id INTEGER,
    dispense_id INTEGER,                                   -- -> pharmacy_dispense.id
    prescription_id INTEGER,
    patient_id INTEGER,
    qty INTEGER NOT NULL DEFAULT 0,
    balance_before INTEGER,
    balance_after INTEGER,
    schedule_class TEXT,                                   -- e.g. 'CDII'/'CDIII'/'high-alert'
    dispensed_by INTEGER,                                  -- pharmacist
    witnessed_by INTEGER,                                  -- second witness (route requires this for controlled)
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_controlled_log_qty CHECK (qty >= 0)
);

ALTER TABLE controlled_drug_log DROP CONSTRAINT IF EXISTS chk_controlled_log_qty;
ALTER TABLE controlled_drug_log ADD CONSTRAINT chk_controlled_log_qty CHECK (qty >= 0);

CREATE INDEX IF NOT EXISTS idx_controlled_log_tenant_id ON controlled_drug_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_controlled_log_drug ON controlled_drug_log (tenant_id, drug_id, at);

ALTER TABLE controlled_drug_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE controlled_drug_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_controlled_drug_log_tenant_isolation ON controlled_drug_log;
CREATE POLICY rls_controlled_drug_log_tenant_isolation ON controlled_drug_log
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ----- controlled flags on the catalog (table managed out-of-band; add only what is missing) -----
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pharmacy_drug_catalog') THEN
    ALTER TABLE pharmacy_drug_catalog ADD COLUMN IF NOT EXISTS is_controlled INTEGER DEFAULT 0;
    ALTER TABLE pharmacy_drug_catalog ADD COLUMN IF NOT EXISTS schedule_class TEXT;
  END IF;
END
$do$;

COMMIT;

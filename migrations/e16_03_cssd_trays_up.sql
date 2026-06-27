-- ============================================================
-- e16_03_cssd_trays_up.sql
-- E16 CSSD — NEW table: cssd_trays (instrument trays processed through a sterilization
--   cycle; a tray may only reach 'sterile'/'issued' after its cycle's biological indicator
--   PASSED — enforced fail-CLOSED in server.js; this table records the lifecycle + audit).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- جدول جديد كلياً => tenant_id INTEGER NOT NULL REFERENCES tenants(id) منذ الإنشاء + FORCE RLS
--   بالقالب القانوني + FK لدورة التعقيم وطقم الأدوات. NOT مُضاف إلى bootstrap في db_postgres.js.
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY IF EXISTS. BEGIN;…COMMIT;
--
-- آلة حالة الصينية: packed -> in_cycle -> sterile -> issued | quarantine | recalled.
--   الانتقال إلى sterile/issued يفرضه الخادم فقط بعد تسجيل BI = pass (لا يُحدّده العميل).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS cssd_trays (
    id              SERIAL PRIMARY KEY,
    tray_code       TEXT DEFAULT '',
    set_id          INTEGER REFERENCES cssd_instrument_sets(id) ON DELETE SET NULL,
    cycle_id        INTEGER REFERENCES cssd_sterilization_cycles(id) ON DELETE SET NULL,
    department      TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'packed',
    sterilized_at   TIMESTAMP,
    issued_to       TEXT DEFAULT '',
    issued_at       TIMESTAMP,
    used_in_surgery_id INTEGER,
    notes           TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_cssd_trays_status CHECK (status IN
        ('packed','in_cycle','sterile','issued','quarantine','recalled'))
);
CREATE INDEX IF NOT EXISTS idx_cssd_trays_tenant_id ON cssd_trays (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cssd_trays_cycle ON cssd_trays (tenant_id, cycle_id);
ALTER TABLE cssd_trays ENABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_trays FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cssd_trays_tenant_isolation ON cssd_trays;
CREATE POLICY rls_cssd_trays_tenant_isolation ON cssd_trays
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

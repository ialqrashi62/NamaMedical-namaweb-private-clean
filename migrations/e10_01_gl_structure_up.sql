-- ============================================================
-- e10_01_gl_structure_up.sql
-- E10 FINANCE / GENERAL LEDGER — harden the EXISTING finance_chart_of_accounts,
--   finance_journal_entries, finance_journal_lines to a tenant-isolated, double-entry-safe shape.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سدّ فجوة الدفتر العام (E10). الجداول الثلاثة قائمة سابقاً (أنشأها bootstrap) لكنها بلا عزل
--   FORCE RLS، وبلا قيود توازن، وبأعمدة REAL (فقدان دقة). نطبّق:
--     - tenant_id NOT NULL + FK -> tenants(id) + FORCE RLS بالقالب القانوني على الجداول الثلاثة.
--     - finance_journal_lines: تحويل debit/credit إلى NUMERIC(14,2) + FK account_id -> CoA +
--       FK entry_id -> journal_entries (ON DELETE CASCADE) + قيد CHECK يمنع السالب والجانبين معاً.
--     - finance_journal_entries: posting_status enum-CHECK (DRAFT/POSTED/REVERSED) + source_type +
--       posted_by/posted_at/balanced_at + reversal_of (مرجع للقيد المعكوس).
--     - finance_chart_of_accounts: account_class CHECK (Asset/Liability/Equity/Revenue/Expense) +
--       opening_balance NUMERIC(14,2) + فهرس (tenant_id, account_code).
--   هذه الجداول قائمة سابقاً => down لا يُسقطها، بل يعكس الإضافات فقط.
--   لا إضافة جداول جديدة إلى bootstrap في db_postgres.js عبر هذه الهجرة (هجرة مرشّحة فقط).
--
-- idempotent: ADD COLUMN IF NOT EXISTS + backfill + SET NOT NULL + DROP/ADD CONSTRAINT IF EXISTS
--   + ALTER TYPE USING + CREATE INDEX IF NOT EXISTS + DROP/CREATE POLICY. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ===== finance_chart_of_accounts =====
ALTER TABLE finance_chart_of_accounts ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE finance_chart_of_accounts SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE finance_chart_of_accounts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE finance_chart_of_accounts DROP CONSTRAINT IF EXISTS fk_coa_tenant;
ALTER TABLE finance_chart_of_accounts ADD CONSTRAINT fk_coa_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE finance_chart_of_accounts ADD COLUMN IF NOT EXISTS account_class TEXT;
-- backfill account_class from the existing free-text account_type where recognisable
UPDATE finance_chart_of_accounts
   SET account_class = CASE
        WHEN account_type ILIKE 'asset%'     THEN 'Asset'
        WHEN account_type ILIKE 'liabilit%'  THEN 'Liability'
        WHEN account_type ILIKE 'equity%'    THEN 'Equity'
        WHEN account_type ILIKE 'revenue%'   THEN 'Revenue'
        WHEN account_type ILIKE 'income%'    THEN 'Revenue'
        WHEN account_type ILIKE 'expense%'   THEN 'Expense'
        ELSE 'Asset' END
 WHERE account_class IS NULL;
ALTER TABLE finance_chart_of_accounts DROP CONSTRAINT IF EXISTS chk_coa_class;
ALTER TABLE finance_chart_of_accounts ADD CONSTRAINT chk_coa_class
    CHECK (account_class IN ('Asset','Liability','Equity','Revenue','Expense'));
ALTER TABLE finance_chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_coa_tenant_id ON finance_chart_of_accounts (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_tenant_code ON finance_chart_of_accounts (tenant_id, account_code);
ALTER TABLE finance_chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_chart_of_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_coa_tenant_isolation ON finance_chart_of_accounts;
CREATE POLICY rls_coa_tenant_isolation ON finance_chart_of_accounts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== finance_journal_entries =====
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE finance_journal_entries SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE finance_journal_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE finance_journal_entries DROP CONSTRAINT IF EXISTS fk_je_tenant;
ALTER TABLE finance_journal_entries ADD CONSTRAINT fk_je_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posting_status TEXT DEFAULT 'DRAFT';
-- migrate the legacy is_posted boolean/int into the new state machine
UPDATE finance_journal_entries SET posting_status = 'POSTED'
 WHERE posting_status IS NULL AND is_posted = 1;
UPDATE finance_journal_entries SET posting_status = 'DRAFT' WHERE posting_status IS NULL;
ALTER TABLE finance_journal_entries DROP CONSTRAINT IF EXISTS chk_je_posting_status;
ALTER TABLE finance_journal_entries ADD CONSTRAINT chk_je_posting_status
    CHECK (posting_status IN ('DRAFT','POSTED','REVERSED'));
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL';
ALTER TABLE finance_journal_entries DROP CONSTRAINT IF EXISTS chk_je_source_type;
ALTER TABLE finance_journal_entries ADD CONSTRAINT chk_je_source_type
    CHECK (source_type IN ('MANUAL','INVOICE','SYSTEM','REVERSAL'));
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posted_by INTEGER;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS balanced_at TIMESTAMP;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS reversal_of INTEGER;
-- L-1 fix: FK so reversal_of references a real journal entry (self-referential; SET NULL on delete)
ALTER TABLE finance_journal_entries DROP CONSTRAINT IF EXISTS fk_je_reversal_of;
ALTER TABLE finance_journal_entries ADD CONSTRAINT fk_je_reversal_of
    FOREIGN KEY (reversal_of) REFERENCES finance_journal_entries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_je_tenant_id ON finance_journal_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_je_tenant_status ON finance_journal_entries (tenant_id, posting_status);
ALTER TABLE finance_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_journal_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_je_tenant_isolation ON finance_journal_entries;
CREATE POLICY rls_je_tenant_isolation ON finance_journal_entries
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== finance_journal_lines =====
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE finance_journal_lines SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE finance_journal_lines ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS fk_jl_tenant;
ALTER TABLE finance_journal_lines ADD CONSTRAINT fk_jl_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
-- precision: REAL -> NUMERIC(14,2) (USING preserves existing values)
ALTER TABLE finance_journal_lines ALTER COLUMN debit  TYPE NUMERIC(14,2) USING ROUND(debit::numeric, 2);
ALTER TABLE finance_journal_lines ALTER COLUMN credit TYPE NUMERIC(14,2) USING ROUND(credit::numeric, 2);
ALTER TABLE finance_journal_lines ALTER COLUMN debit  SET DEFAULT 0;
ALTER TABLE finance_journal_lines ALTER COLUMN credit SET DEFAULT 0;
ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS fk_jl_entry;
ALTER TABLE finance_journal_lines ADD CONSTRAINT fk_jl_entry
    FOREIGN KEY (entry_id) REFERENCES finance_journal_entries(id) ON DELETE CASCADE;
ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS fk_jl_account;
ALTER TABLE finance_journal_lines ADD CONSTRAINT fk_jl_account
    FOREIGN KEY (account_id) REFERENCES finance_chart_of_accounts(id);
-- line invariant: no negatives, never both sides non-zero (double-entry hygiene)
ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS chk_jl_sides;
ALTER TABLE finance_journal_lines ADD CONSTRAINT chk_jl_sides
    CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0));
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_jl_tenant_id ON finance_journal_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON finance_journal_lines (tenant_id, entry_id);
ALTER TABLE finance_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_journal_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_jl_tenant_isolation ON finance_journal_lines;
CREATE POLICY rls_jl_tenant_isolation ON finance_journal_lines
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;

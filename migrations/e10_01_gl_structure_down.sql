-- e10_01_gl_structure_down.sql  (rollback of e10_01_gl_structure_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: الجداول الثلاثة (chart_of_accounts/journal_entries/journal_lines) قائمة سابقاً (أنشأها
--   bootstrap) — لذلك لا نُسقطها. نعكس فقط ما أضافته هذه الهجرة: السياسات، القيود، الفهارس،
--   والأعمدة المُضافة. أعمدة tenant_id كانت موجودة في bootstrap أصلاً فنُبقيها (نُزيل فقط NOT NULL/FK
--   التي أضفناها). تحويل REAL<-NUMERIC غير ضروري للتراجع الوظيفي (NUMERIC أدق) فنتركه. idempotent.
BEGIN;

-- policies
DROP POLICY IF EXISTS rls_coa_tenant_isolation ON finance_chart_of_accounts;
DROP POLICY IF EXISTS rls_je_tenant_isolation ON finance_journal_entries;
DROP POLICY IF EXISTS rls_jl_tenant_isolation ON finance_journal_lines;

-- constraints added by this migration
ALTER TABLE finance_chart_of_accounts DROP CONSTRAINT IF EXISTS chk_coa_class;
ALTER TABLE finance_chart_of_accounts DROP CONSTRAINT IF EXISTS fk_coa_tenant;
ALTER TABLE finance_journal_entries  DROP CONSTRAINT IF EXISTS chk_je_posting_status;
ALTER TABLE finance_journal_entries  DROP CONSTRAINT IF EXISTS chk_je_source_type;
ALTER TABLE finance_journal_entries  DROP CONSTRAINT IF EXISTS fk_je_tenant;
ALTER TABLE finance_journal_entries  DROP CONSTRAINT IF EXISTS fk_je_reversal_of; -- L-1
ALTER TABLE finance_journal_lines    DROP CONSTRAINT IF EXISTS chk_jl_sides;
ALTER TABLE finance_journal_lines    DROP CONSTRAINT IF EXISTS fk_jl_entry;
ALTER TABLE finance_journal_lines    DROP CONSTRAINT IF EXISTS fk_jl_account;
ALTER TABLE finance_journal_lines    DROP CONSTRAINT IF EXISTS fk_jl_tenant;

-- indexes added by this migration
DROP INDEX IF EXISTS uq_coa_tenant_code;
DROP INDEX IF EXISTS idx_coa_tenant_id;
DROP INDEX IF EXISTS idx_je_tenant_id;
DROP INDEX IF EXISTS idx_je_tenant_status;
DROP INDEX IF EXISTS idx_jl_tenant_id;
DROP INDEX IF EXISTS idx_jl_entry;

-- columns added by this migration (tenant_id/facility_id/branch_id pre-existed in bootstrap -> kept)
ALTER TABLE finance_chart_of_accounts DROP COLUMN IF EXISTS account_class;
ALTER TABLE finance_chart_of_accounts DROP COLUMN IF EXISTS opening_balance;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS posting_status;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS source_type;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS posted_by;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS posted_at;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS balanced_at;
ALTER TABLE finance_journal_entries  DROP COLUMN IF EXISTS reversal_of;

-- relax NOT NULL we added (column itself pre-existed in bootstrap)
ALTER TABLE finance_chart_of_accounts ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE finance_journal_entries   ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE finance_journal_lines     ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;

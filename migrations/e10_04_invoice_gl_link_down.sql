-- e10_04_invoice_gl_link_down.sql  (rollback of e10_04_invoice_gl_link_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: invoices جدول قائم سابقاً (مشترك) => لا نُسقطه؛ نُزيل فقط الأعمدة/القيود التي أضافتها هذه
--   الهجرة. idempotent.
BEGIN;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoice_journal_entry;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_posting_status;
DROP INDEX IF EXISTS idx_invoices_journal_entry;
ALTER TABLE invoices DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS accounting_posting_status;

COMMIT;

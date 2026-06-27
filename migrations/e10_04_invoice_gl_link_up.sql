-- ============================================================
-- e10_04_invoice_gl_link_up.sql
-- E10 FINANCE — link EXISTING invoices to the GL (journal_entry_id) + posting status.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ربط فاتورة (L2 موجودة) بقيد يومية عند الترحيل. لا نغيّر بنية invoices الأساسية (مشتركة مع
--   فواتير أخرى) — نضيف فقط:
--     - journal_entry_id INTEGER + FK -> finance_journal_entries(id)  (NULL = لم تُرحّل بعد)
--     - accounting_posting_status TEXT DEFAULT 'UNPOSTED' + CHECK (UNPOSTED/POSTED)
--   هذه الإضافات اختيارية وتظل خاملة طالما ACCOUNTING_POSTING_ENABLED=OFF.
--   جدول قائم سابقاً => down يُزيل الإضافات فقط. لا إضافة جداول جديدة إلى bootstrap. idempotent.
-- ============================================================
BEGIN;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoice_journal_entry;
ALTER TABLE invoices ADD CONSTRAINT fk_invoice_journal_entry
    FOREIGN KEY (journal_entry_id) REFERENCES finance_journal_entries(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_posting_status TEXT DEFAULT 'UNPOSTED';
UPDATE invoices SET accounting_posting_status = 'UNPOSTED' WHERE accounting_posting_status IS NULL;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_posting_status;
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_posting_status
    CHECK (accounting_posting_status IN ('UNPOSTED','POSTED'));

CREATE INDEX IF NOT EXISTS idx_invoices_journal_entry ON invoices (journal_entry_id);

COMMIT;

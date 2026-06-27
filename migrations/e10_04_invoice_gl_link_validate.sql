-- e10_04_invoice_gl_link_validate.sql  (run AFTER e10_04_invoice_gl_link_up.sql; read-only)
-- PASS = invoices has journal_entry_id FK -> journal_entries + accounting_posting_status CHECK.

SELECT
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='invoices'
       AND column_name='journal_entry_id')                                                                   AS inv_je_col,            -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='invoices'::regclass
       AND confrelid='finance_journal_entries'::regclass AND contype='f')                                    AS inv_je_fk,             -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='invoices'
       AND column_name='accounting_posting_status')                                                          AS inv_status_col,        -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='invoices'::regclass AND conname='chk_invoice_posting_status')                         AS inv_status_check;      -- expect 1

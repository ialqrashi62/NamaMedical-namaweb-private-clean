-- migrations/e55_invoices_multi_currency_down.sql
-- G-11: Rollback multi-currency columns. Non-destructive (DROP IF EXISTS).
-- Note: existing invoices will lose currency_code = 'SAR' default after drop,
-- but column drop is non-destructive (data is preserved in column drop).

BEGIN;

DROP INDEX IF EXISTS idx_invoices_fx_date;
DROP INDEX IF EXISTS idx_invoices_tenant_currency;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_fx_rate_positive;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_base_currency_code;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_currency_code;

ALTER TABLE invoices DROP COLUMN IF EXISTS fx_date;
ALTER TABLE invoices DROP COLUMN IF EXISTS fx_source;
ALTER TABLE invoices DROP COLUMN IF EXISTS base_currency_code;
ALTER TABLE invoices DROP COLUMN IF EXISTS fx_rate_at_invoice;
ALTER TABLE invoices DROP COLUMN IF EXISTS currency_code;

COMMIT;
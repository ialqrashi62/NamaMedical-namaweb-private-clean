-- migrations/e55_invoices_multi_currency_up.sql
-- G-11: Multi-currency invoicing support (ISO 4217 + FX snapshot at invoice time).
-- Non-destructive: adds nullable columns + a check constraint + index.
-- Idempotent: uses IF NOT EXISTS everywhere.
--
-- Adds:
--   invoices.currency_code       CHAR(3)   — ISO 4217 (SAR/AED/EGP/USD/EUR/GBP)
--   invoices.fx_rate_at_invoice NUMERIC(12,6) — rate to tenant base currency, snapshot at issue
--   invoices.base_currency_code  CHAR(3)   — tenant base currency at issue (for audit)
--   invoices.fx_source           VARCHAR(32) — e.g. SAMA / ECB / SAMA+SAMA (multi-hop)
--   invoices.fx_date             DATE      — when the FX was observed
--
-- Existing rows get SAR / 1.0 / SAR / 'LEGACY' / current_date (backward compatible).
--
-- RAIL-5: tenant-scoped (FK + RLS already in place).
-- RAIL-11: fail-closed — CHECK on currency_code from allow-list.

BEGIN;

-- 1) Currency code on invoice header (ISO 4217, 3-letter)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'SAR';

-- 2) FX snapshot at invoice time (rate from currency_code -> base_currency_code)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fx_rate_at_invoice NUMERIC(12,6);

-- 3) Tenant base currency at issue (for historical audit)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS base_currency_code CHAR(3) NOT NULL DEFAULT 'SAR';

-- 4) FX source attribution (SAMA / ECB / etc., or 'LEGACY' for old rows)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fx_source VARCHAR(32);

-- 5) FX observation date
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fx_date DATE;

-- Backfill legacy rows (any row missing FX data)
UPDATE invoices
   SET fx_rate_at_invoice = 1.0,
       fx_source = COALESCE(fx_source, 'LEGACY'),
       fx_date = COALESCE(fx_date, CURRENT_DATE)
 WHERE fx_rate_at_invoice IS NULL;

-- CHECK constraint: allow-list of ISO 4217 currencies (RAIL-11 fail-closed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_currency_code'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_currency_code
      CHECK (currency_code IN ('SAR','AED','EGP','USD','EUR','GBP'));
  END IF;
END $$;

-- CHECK constraint: base currency also allow-listed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_base_currency_code'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_base_currency_code
      CHECK (base_currency_code IN ('SAR','AED','EGP','USD','EUR','GBP'));
  END IF;
END $$;

-- CHECK constraint: FX rate must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_fx_rate_positive'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_fx_rate_positive
      CHECK (fx_rate_at_invoice IS NULL OR fx_rate_at_invoice > 0);
  END IF;
END $$;

-- Index for tenant + currency analytics (multi-currency reporting)
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_currency
  ON invoices(tenant_id, currency_code, created_at DESC);

-- Index for FX date lookups (historical FX queries)
CREATE INDEX IF NOT EXISTS idx_invoices_fx_date
  ON invoices(fx_date)
  WHERE fx_date IS NOT NULL;

COMMIT;
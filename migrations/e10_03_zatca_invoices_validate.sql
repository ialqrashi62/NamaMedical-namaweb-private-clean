-- e10_03_zatca_invoices_validate.sql  (run AFTER e10_03_zatca_invoices_up.sql; read-only)
-- PASS = zatca_invoices tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK + invoice FK) +
--   ubl_xml/digital_stamp/qr_tlv columns + clearance_status CHECK.

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='zatca_invoices')                                  AS z_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='zatca_invoices'
       AND policyname='rls_zatca_tenant_isolation')                                                          AS z_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='zatca_invoices'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS z_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='zatca_invoices'::regclass AND confrelid='tenants'::regclass AND contype='f')          AS z_tenant_fk,        -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='zatca_invoices'::regclass AND confrelid='invoices'::regclass AND contype='f')         AS z_invoice_fk,       -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='zatca_invoices'
       AND column_name IN ('ubl_xml','digital_stamp','qr_tlv'))                                               AS z_artifact_cols,    -- expect 3
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='zatca_invoices'::regclass AND conname='chk_zatca_clearance')                          AS z_clearance_check;  -- expect 1

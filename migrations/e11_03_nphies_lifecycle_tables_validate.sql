-- e11_03_nphies_lifecycle_tables_validate.sql  (run AFTER e11_03_nphies_lifecycle_tables_up.sql; read-only)
-- PASS = all 5 new tables exist, FORCE RLS + policy + tenant_id NOT NULL FK -> tenants + parent FK + status CHECK.

SELECT
  -- eligibility_checks
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_eligibility_checks')                    AS el_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_eligibility_checks')                          AS el_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_eligibility_checks'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS el_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_eligibility_checks'::regclass AND confrelid='tenants'::regclass AND contype='f') AS el_tenant_fk,    -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_eligibility_checks'::regclass AND conname='chk_elig_status')                AS el_status_check,     -- expect 1
  -- pre_authorizations
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_pre_authorizations')                    AS pa_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_pre_authorizations')                          AS pa_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_pre_authorizations'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS pa_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_pre_authorizations'::regclass AND conname='chk_preauth_status')             AS pa_status_check,     -- expect 1
  -- claim_lines
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_claim_lines')                           AS cl_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_claim_lines')                                 AS cl_policy,           -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claim_lines'::regclass AND confrelid='insurance_claims'::regclass AND contype='f') AS cl_claim_fk,  -- expect 1
  -- claim_denials
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_claim_denials')                         AS dn_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_claim_denials')                               AS dn_policy,           -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claim_denials'::regclass AND conname='chk_denial_appeal_status')            AS dn_appeal_check,     -- expect 1
  -- payer_pricing
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_payer_pricing')                         AS pp_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_payer_pricing')                               AS pp_policy,           -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_payer_pricing'::regclass AND confrelid='medical_services'::regclass AND contype='f') AS pp_service_fk; -- expect 1

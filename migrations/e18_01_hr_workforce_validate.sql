-- e18_01_hr_workforce_validate.sql  (run AFTER e18_01 up; read-only)
-- PASS = all five NEW tables exist with tenant_id NOT NULL + FK->tenants + FK->hr_employees
--        + FORCE RLS + canonical isolation policy + key CHECK constraints.
SELECT
  -- hr_licenses
  (SELECT count(*)::int FROM information_schema.tables WHERE table_name='hr_licenses')            AS lic_exists,        -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='hr_licenses')                          AS lic_force_rls,     -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='hr_licenses'
       AND policyname='rls_hr_lic_tenant_isolation')                                              AS lic_policy,        -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='hr_licenses'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS lic_tenant_nn,     -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='hr_licenses'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                         AS lic_tenant_fk,     -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='hr_licenses'::regclass
       AND confrelid='hr_employees'::regclass AND contype='f')                                    AS lic_emp_fk,        -- 1
  -- hr_shifts
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='hr_shifts')                            AS shift_force_rls,   -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='hr_shifts'
       AND policyname='rls_hr_shift_tenant_isolation')                                            AS shift_policy,      -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='hr_shifts'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS shift_tenant_nn,   -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_hr_shift_status')                   AS shift_status_chk,  -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='hr_shifts'::regclass
       AND confrelid='hr_employees'::regclass AND contype='f')                                    AS shift_emp_fk,      -- 1  (L3)
  -- hr_leave_requests
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='hr_leave_requests')                    AS leave_force_rls,   -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='hr_leave_requests'
       AND policyname='rls_hr_leave_req_tenant_isolation')                                        AS leave_policy,      -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='hr_leave_requests'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS leave_tenant_nn,   -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_hr_leave_status')                   AS leave_status_chk,  -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='hr_leave_requests'::regclass
       AND confrelid='hr_employees'::regclass AND contype='f')                                    AS leave_emp_fk,      -- 1
  -- hr_payroll_slips
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='hr_payroll_slips')                     AS slip_force_rls,    -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='hr_payroll_slips'
       AND policyname='rls_hr_slip_tenant_isolation')                                             AS slip_policy,       -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='hr_payroll_slips'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS slip_tenant_nn,    -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_hr_slip_net_nonneg')                AS slip_net_chk,      -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='uq_hr_slip_emp_month')                  AS slip_uq,           -- 1
  -- hr_competencies
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='hr_competencies')                      AS comp_force_rls,    -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='hr_competencies'
       AND policyname='rls_hr_comp_tenant_isolation')                                             AS comp_policy,       -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='hr_competencies'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS comp_tenant_nn,    -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='hr_competencies'::regclass
       AND confrelid='hr_employees'::regclass AND contype='f')                                    AS comp_emp_fk;       -- 1  (L3)

-- e2_02_roi_validate.sql  (run AFTER e2_02_roi_up.sql; read-only)
-- PASS = roi_requests exists with tenant_id FK NOT NULL + FORCE RLS + isolation policy + indexes + status CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='roi_requests') AS roi_exists,                  -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='roi_requests'
       AND column_name IN ('tenant_id','facility_id','patient_id','requester','purpose','status','requested_by','approved_by','released_at','created_at')) AS roi_cols, -- expect 10
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='roi_requests') AS roi_force_rls,                        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='roi_requests' AND policyname='rls_roi_requests_tenant_isolation') AS roi_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_roi_status') AS roi_status_check,                         -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='roi_requests' AND indexname='idx_roi_requests_tenant_id') AS roi_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='roi_requests' AND column_name='tenant_id' AND is_nullable='NO';                               -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='roi_requests'::regclass AND confrelid='tenants'::regclass AND contype='f';                      -- expect 1

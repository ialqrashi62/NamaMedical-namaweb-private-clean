-- ex_01_orders_down.sql  (rollback of ex_01_orders_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف order_items ثم orders ثم order_sets (ترتيب احترام مفاتيح FK) مع سياساتها. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_order_items_tenant_isolation ON order_items;
DROP TABLE IF EXISTS order_items;

DROP POLICY IF EXISTS rls_orders_tenant_isolation ON orders;
ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS chk_orders_status;
DROP TABLE IF EXISTS orders;

DROP POLICY IF EXISTS rls_order_sets_tenant_isolation ON order_sets;
DROP TABLE IF EXISTS order_sets;

COMMIT;

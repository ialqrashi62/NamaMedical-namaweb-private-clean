-- e16_02_supply_chain_down.sql  (rollback of e16_02 up)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- كل هذه الجداول جديدة أنشأتها e16_02 — نُسقطها أولاً بترتيب يحترم اعتماديات الـFK
--   (الأبناء ثم الآباء) وكل DROP TABLE يُسقط سياساته/فهارسه/قيوده ضمناً. idempotent (IF EXISTS).
BEGIN;

DROP TABLE IF EXISTS inventory_stock_counts CASCADE;
DROP TABLE IF EXISTS goods_receipt_items CASCADE;
DROP TABLE IF EXISTS goods_receipts CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory_batches CASCADE;

COMMIT;

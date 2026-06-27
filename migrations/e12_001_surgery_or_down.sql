-- ============================================================================
-- Epic E12 — Surgery / OR migration DOWN (reverse only E12 additions).
-- Drops ONLY the 5 NEW tables introduced by this epic. Does NOT touch any
-- pre-existing table (surgeries, operating_rooms, inventory_items, etc.).
-- ============================================================================
BEGIN;
DROP TABLE IF EXISTS or_consumption CASCADE;
DROP TABLE IF EXISTS operative_notes CASCADE;
DROP TABLE IF EXISTS pacu_records CASCADE;
DROP TABLE IF EXISTS who_surgical_checklist CASCADE;
DROP TABLE IF EXISTS or_slots CASCADE;
COMMIT;

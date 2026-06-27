-- ============================================================================
-- Epic E17 — Quality / CAPA / Risk migration DOWN (reverse only E17 additions).
-- Drops ONLY the 2 NEW tables and removes ONLY the columns added by the up
-- migration. Does NOT drop the pre-existing quality_incidents table.
-- ============================================================================
BEGIN;
DROP TABLE IF EXISTS quality_risk_register CASCADE;
DROP TABLE IF EXISTS quality_capa CASCADE;

ALTER TABLE quality_incidents DROP COLUMN IF EXISTS workflow_state;
ALTER TABLE quality_incidents DROP COLUMN IF EXISTS visit_id;
ALTER TABLE quality_incidents DROP COLUMN IF EXISTS encounter_id;
ALTER TABLE quality_incidents DROP COLUMN IF EXISTS confidential;
ALTER TABLE quality_incidents DROP COLUMN IF EXISTS near_miss;
ALTER TABLE quality_incidents DROP COLUMN IF EXISTS harm_level;
COMMIT;

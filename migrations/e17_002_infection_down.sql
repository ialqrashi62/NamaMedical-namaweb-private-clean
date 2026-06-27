-- ============================================================================
-- Epic E17 — Infection Control migration DOWN (reverse only E17 additions).
-- Drops ONLY the 2 NEW tables introduced by this epic. Does NOT touch any
-- pre-existing table (patients, infection_surveillance, etc.).
-- ============================================================================
BEGIN;
DROP TABLE IF EXISTS ams_flags CASCADE;
DROP TABLE IF EXISTS hai_isolation CASCADE;
COMMIT;

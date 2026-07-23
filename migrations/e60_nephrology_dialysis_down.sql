-- Down migration for Nephrology & Dialysis Specialized Data
-- Target: namaweb/migrations\e60_nephrology_dialysis_down.sql

DROP TABLE IF EXISTS renal_transplant_logs;
DROP TABLE IF EXISTS dialysis_sessions;
DROP TABLE IF EXISTS nephrology_gfr_logs;

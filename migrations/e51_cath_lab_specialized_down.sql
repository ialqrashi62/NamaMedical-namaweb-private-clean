-- Down migration for Interventional Cardiology (Cath Lab)
-- Target: namaweb/migrations/e51_cath_lab_specialized_down.sql

DROP TABLE IF EXISTS stent_registry;
DROP TABLE IF EXISTS cath_lab_procedures;

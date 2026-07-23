-- Down migration for Hematology & Oncology Specialized Data
-- Target: namaweb/migrations/e61_oncology_hematology_down.sql

DROP TABLE IF EXISTS bmt_registry;
DROP TABLE IF EXISTS oncology_toxicity_logs;
DROP TABLE IF EXISTS oncology_chemo_cycles;

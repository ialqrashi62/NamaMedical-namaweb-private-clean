-- Down migration for Peripheral Vascular & Advanced Heart Failure
-- Target: namaweb/migrations/e55_vascular_ahf_down.sql

DROP TABLE IF EXISTS vad_registry;
DROP TABLE IF EXISTS ahf_monitoring;
DROP TABLE IF EXISTS vascular_abi_logs;

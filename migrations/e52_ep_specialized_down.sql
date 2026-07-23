-- Down migration for Electrophysiology (EP) Specialized Data
-- Target: namaweb/migrations/e52_ep_specialized_down.sql

DROP TABLE IF EXISTS ep_device_registry;
DROP TABLE IF EXISTS ep_ablation_logs;

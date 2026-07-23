-- Migration: e80_admin_ops_down.sql
-- Purpose: Reverse changes from e80_admin_ops_up.sql

BEGIN;

DROP TABLE IF EXISTS supply_chain_metrics;
DROP TABLE IF EXISTS hcm_credentialing_logs;
DROP TABLE IF EXISTS financial_integrity_logs;
DROP TABLE IF EXISTS admin_resource_logs;

COMMIT;

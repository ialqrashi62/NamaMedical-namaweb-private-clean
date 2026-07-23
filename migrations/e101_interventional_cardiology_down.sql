-- Migration: e101_interventional_cardiology_down.sql
BEGIN;
DROP TABLE IF EXISTS pci_hemodynamics;
DROP TABLE IF EXISTS stent_registry;
DROP TABLE IF EXISTS pci_sessions;
COMMIT;

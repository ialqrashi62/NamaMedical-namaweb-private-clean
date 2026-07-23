-- Down migration for General Surgery Specialized Data
-- Target: namaweb/migrations/e66_general_surgery_down.sql

DROP TABLE IF EXISTS surgical_robotic_logs;
DROP TABLE IF EXISTS surgical_intra_op_logs;
DROP TABLE IF EXISTS surgical_safety_checklists;

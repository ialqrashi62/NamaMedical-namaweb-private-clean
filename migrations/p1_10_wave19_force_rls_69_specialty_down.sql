-- =====================================================================
-- p1_10_wave19_force_rls_69_specialty_down.sql
-- Reverse of p1_10_wave19_force_rls_69_specialty_up.sql.
-- Disables FORCE on the 69 tables (ALTER TABLE ... NO FORCE ROW LEVEL SECURITY).
-- Does NOT disable RLS itself. Does NOT drop any policy.
-- Idempotent.
-- =====================================================================
SET search_path = public;
BEGIN;

-- admin_resource_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'admin_resource_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'admin_resource_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'admin_resource_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'admin_resource_logs';
    END IF;
END
$do$;

-- audiometry_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'audiometry_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'audiometry_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'audiometry_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'audiometry_metrics';
    END IF;
END
$do$;

-- burn_resuscitation_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'burn_resuscitation_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'burn_resuscitation_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'burn_resuscitation_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'burn_resuscitation_logs';
    END IF;
END
$do$;

-- cardiac_medications
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'cardiac_medications';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'cardiac_medications');
        RAISE NOTICE 'FORCE disabled on public.%', 'cardiac_medications';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'cardiac_medications';
    END IF;
END
$do$;

-- cardio_thoracic_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'cardio_thoracic_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'cardio_thoracic_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'cardio_thoracic_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'cardio_thoracic_metrics';
    END IF;
END
$do$;

-- cardiology_visits
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'cardiology_visits';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'cardiology_visits');
        RAISE NOTICE 'FORCE disabled on public.%', 'cardiology_visits';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'cardiology_visits';
    END IF;
END
$do$;

-- cochlear_implant_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'cochlear_implant_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'cochlear_implant_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'cochlear_implant_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'cochlear_implant_registry';
    END IF;
END
$do$;

-- crit_care_hemodynamics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'crit_care_hemodynamics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'crit_care_hemodynamics');
        RAISE NOTICE 'FORCE disabled on public.%', 'crit_care_hemodynamics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'crit_care_hemodynamics';
    END IF;
END
$do$;

-- crit_care_ventilation_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'crit_care_ventilation_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'crit_care_ventilation_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'crit_care_ventilation_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'crit_care_ventilation_logs';
    END IF;
END
$do$;

-- diag_molecular_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'diag_molecular_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'diag_molecular_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'diag_molecular_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'diag_molecular_logs';
    END IF;
END
$do$;

-- ecg_reports
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'ecg_reports';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'ecg_reports');
        RAISE NOTICE 'FORCE disabled on public.%', 'ecg_reports';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'ecg_reports';
    END IF;
END
$do$;

-- ent_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'ent_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'ent_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'ent_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'ent_surgical_logs';
    END IF;
END
$do$;

-- ep_ablation_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'ep_ablation_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'ep_ablation_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'ep_ablation_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'ep_ablation_logs';
    END IF;
END
$do$;

-- financial_integrity_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'financial_integrity_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'financial_integrity_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'financial_integrity_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'financial_integrity_logs';
    END IF;
END
$do$;

-- flap_monitoring_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'flap_monitoring_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'flap_monitoring_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'flap_monitoring_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'flap_monitoring_metrics';
    END IF;
END
$do$;

-- fracture_management_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'fracture_management_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'fracture_management_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'fracture_management_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'fracture_management_logs';
    END IF;
END
$do$;

-- gastro_encounters
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'gastro_encounters';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'gastro_encounters');
        RAISE NOTICE 'FORCE disabled on public.%', 'gastro_encounters';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'gastro_encounters';
    END IF;
END
$do$;

-- gastro_endoscopy_reports
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'gastro_endoscopy_reports';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'gastro_endoscopy_reports');
        RAISE NOTICE 'FORCE disabled on public.%', 'gastro_endoscopy_reports';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'gastro_endoscopy_reports';
    END IF;
END
$do$;

-- gastro_hepatic_markers
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'gastro_hepatic_markers';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'gastro_hepatic_markers');
        RAISE NOTICE 'FORCE disabled on public.%', 'gastro_hepatic_markers';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'gastro_hepatic_markers';
    END IF;
END
$do$;

-- glaucoma_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'glaucoma_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'glaucoma_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'glaucoma_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'glaucoma_metrics';
    END IF;
END
$do$;

-- gyn_oncology_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'gyn_oncology_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'gyn_oncology_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'gyn_oncology_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'gyn_oncology_registry';
    END IF;
END
$do$;

-- hcm_credentialing_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'hcm_credentialing_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'hcm_credentialing_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'hcm_credentialing_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'hcm_credentialing_logs';
    END IF;
END
$do$;

-- intracranial_pressure_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'intracranial_pressure_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'intracranial_pressure_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'intracranial_pressure_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'intracranial_pressure_logs';
    END IF;
END
$do$;

-- iol_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'iol_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'iol_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'iol_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'iol_registry';
    END IF;
END
$do$;

-- joint_replacement_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'joint_replacement_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'joint_replacement_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'joint_replacement_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'joint_replacement_registry';
    END IF;
END
$do$;

-- maternal_fetal_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'maternal_fetal_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'maternal_fetal_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'maternal_fetal_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'maternal_fetal_metrics';
    END IF;
END
$do$;

-- neonatal_transition_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'neonatal_transition_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'neonatal_transition_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'neonatal_transition_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'neonatal_transition_logs';
    END IF;
END
$do$;

-- neuro_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'neuro_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'neuro_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'neuro_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'neuro_surgical_logs';
    END IF;
END
$do$;

-- nicu_ventilation_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'nicu_ventilation_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'nicu_ventilation_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'nicu_ventilation_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'nicu_ventilation_logs';
    END IF;
END
$do$;

-- nuclear_med_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'nuclear_med_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'nuclear_med_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'nuclear_med_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'nuclear_med_logs';
    END IF;
END
$do$;

-- obgyn_anc_tracking
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'obgyn_anc_tracking';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'obgyn_anc_tracking');
        RAISE NOTICE 'FORCE disabled on public.%', 'obgyn_anc_tracking';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'obgyn_anc_tracking';
    END IF;
END
$do$;

-- obgyn_delivery_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'obgyn_delivery_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'obgyn_delivery_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'obgyn_delivery_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'obgyn_delivery_logs';
    END IF;
END
$do$;

-- obgyn_delivery_records
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'obgyn_delivery_records';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'obgyn_delivery_records');
        RAISE NOTICE 'FORCE disabled on public.%', 'obgyn_delivery_records';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'obgyn_delivery_records';
    END IF;
END
$do$;

-- obgyn_encounters
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'obgyn_encounters';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'obgyn_encounters');
        RAISE NOTICE 'FORCE disabled on public.%', 'obgyn_encounters';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'obgyn_encounters';
    END IF;
END
$do$;

-- obgyn_ivf_lab_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'obgyn_ivf_lab_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'obgyn_ivf_lab_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'obgyn_ivf_lab_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'obgyn_ivf_lab_logs';
    END IF;
END
$do$;

-- ophthalmic_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'ophthalmic_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'ophthalmic_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'ophthalmic_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'ophthalmic_surgical_logs';
    END IF;
END
$do$;

-- ortho_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'ortho_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'ortho_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'ortho_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'ortho_surgical_logs';
    END IF;
END
$do$;

-- pathology_digital_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pathology_digital_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pathology_digital_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'pathology_digital_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pathology_digital_logs';
    END IF;
END
$do$;

-- pci_hemodynamics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pci_hemodynamics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pci_hemodynamics');
        RAISE NOTICE 'FORCE disabled on public.%', 'pci_hemodynamics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pci_hemodynamics';
    END IF;
END
$do$;

-- pci_sessions
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pci_sessions';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pci_sessions');
        RAISE NOTICE 'FORCE disabled on public.%', 'pci_sessions';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pci_sessions';
    END IF;
END
$do$;

-- peds_cardio_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'peds_cardio_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'peds_cardio_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'peds_cardio_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'peds_cardio_logs';
    END IF;
END
$do$;

-- peds_growth_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'peds_growth_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'peds_growth_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'peds_growth_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'peds_growth_logs';
    END IF;
END
$do$;

-- peds_milestone_tracking
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'peds_milestone_tracking';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'peds_milestone_tracking');
        RAISE NOTICE 'FORCE disabled on public.%', 'peds_milestone_tracking';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'peds_milestone_tracking';
    END IF;
END
$do$;

-- peds_nephro_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'peds_nephro_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'peds_nephro_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'peds_nephro_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'peds_nephro_logs';
    END IF;
END
$do$;

-- peds_neuro_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'peds_neuro_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'peds_neuro_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'peds_neuro_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'peds_neuro_logs';
    END IF;
END
$do$;

-- plastic_burns_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'plastic_burns_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'plastic_burns_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'plastic_burns_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'plastic_burns_surgical_logs';
    END IF;
END
$do$;

-- psychosocial_support_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'psychosocial_support_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'psychosocial_support_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'psychosocial_support_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'psychosocial_support_logs';
    END IF;
END
$do$;

-- pulmonology_bronchoscopy
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pulmonology_bronchoscopy';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pulmonology_bronchoscopy');
        RAISE NOTICE 'FORCE disabled on public.%', 'pulmonology_bronchoscopy';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pulmonology_bronchoscopy';
    END IF;
END
$do$;

-- pulmonology_encounters
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pulmonology_encounters';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pulmonology_encounters');
        RAISE NOTICE 'FORCE disabled on public.%', 'pulmonology_encounters';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pulmonology_encounters';
    END IF;
END
$do$;

-- pulmonology_pft_results
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pulmonology_pft_results';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pulmonology_pft_results');
        RAISE NOTICE 'FORCE disabled on public.%', 'pulmonology_pft_results';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pulmonology_pft_results';
    END IF;
END
$do$;

-- pulmonology_sleep_studies
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'pulmonology_sleep_studies';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'pulmonology_sleep_studies');
        RAISE NOTICE 'FORCE disabled on public.%', 'pulmonology_sleep_studies';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'pulmonology_sleep_studies';
    END IF;
END
$do$;

-- radiology_advanced_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'radiology_advanced_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'radiology_advanced_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'radiology_advanced_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'radiology_advanced_metrics';
    END IF;
END
$do$;

-- rehab_occupational_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'rehab_occupational_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'rehab_occupational_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'rehab_occupational_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'rehab_occupational_logs';
    END IF;
END
$do$;

-- rehab_physical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'rehab_physical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'rehab_physical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'rehab_physical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'rehab_physical_logs';
    END IF;
END
$do$;

-- rehab_speech_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'rehab_speech_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'rehab_speech_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'rehab_speech_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'rehab_speech_logs';
    END IF;
END
$do$;

-- sepsis_bundle_tracking
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'sepsis_bundle_tracking';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'sepsis_bundle_tracking');
        RAISE NOTICE 'FORCE disabled on public.%', 'sepsis_bundle_tracking';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'sepsis_bundle_tracking';
    END IF;
END
$do$;

-- shock_titration_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'shock_titration_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'shock_titration_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'shock_titration_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'shock_titration_logs';
    END IF;
END
$do$;

-- spine_stability_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'spine_stability_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'spine_stability_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'spine_stability_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'spine_stability_metrics';
    END IF;
END
$do$;

-- stent_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'stent_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'stent_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'stent_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'stent_registry';
    END IF;
END
$do$;

-- supply_chain_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'supply_chain_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'supply_chain_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'supply_chain_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'supply_chain_metrics';
    END IF;
END
$do$;

-- surgery_encounters
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'surgery_encounters';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'surgery_encounters');
        RAISE NOTICE 'FORCE disabled on public.%', 'surgery_encounters';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'surgery_encounters';
    END IF;
END
$do$;

-- surgery_implants
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'surgery_implants';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'surgery_implants');
        RAISE NOTICE 'FORCE disabled on public.%', 'surgery_implants';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'surgery_implants';
    END IF;
END
$do$;

-- surgery_wound_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'surgery_wound_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'surgery_wound_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'surgery_wound_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'surgery_wound_logs';
    END IF;
END
$do$;

-- surgical_intra_op_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'surgical_intra_op_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'surgical_intra_op_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'surgical_intra_op_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'surgical_intra_op_logs';
    END IF;
END
$do$;

-- surgical_robotic_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'surgical_robotic_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'surgical_robotic_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'surgical_robotic_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'surgical_robotic_logs';
    END IF;
END
$do$;

-- urology_oncology_metrics
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'urology_oncology_metrics';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'urology_oncology_metrics');
        RAISE NOTICE 'FORCE disabled on public.%', 'urology_oncology_metrics';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'urology_oncology_metrics';
    END IF;
END
$do$;

-- urology_stone_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'urology_stone_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'urology_stone_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'urology_stone_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'urology_stone_registry';
    END IF;
END
$do$;

-- urology_surgical_logs
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'urology_surgical_logs';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'urology_surgical_logs');
        RAISE NOTICE 'FORCE disabled on public.%', 'urology_surgical_logs';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'urology_surgical_logs';
    END IF;
END
$do$;

-- vascular_graft_registry
DO $do$
DECLARE
    is_forced boolean;
BEGIN
    SELECT c.relforcerowsecurity
      INTO is_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'vascular_graft_registry';
    IF is_forced = true THEN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', 'vascular_graft_registry');
        RAISE NOTICE 'FORCE disabled on public.%', 'vascular_graft_registry';
    ELSE
        RAISE NOTICE 'FORCE already disabled on public.%, skipped', 'vascular_graft_registry';
    END IF;
END
$do$;

COMMIT;

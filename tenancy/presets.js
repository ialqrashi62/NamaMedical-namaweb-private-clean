'use strict';
// Tenant Presets — 16 facility types × module enablement matrix.
// Source of truth: AGENTS.md §4.4 + facility-catalog.js (browser-side).
// When a tenant is onboarded via Hikma Atlas, the preset here is the
// canonical module-enablement policy.
//
// IMPORTANT: this file is only called WITHIN Hikma Atlas during `onboard()`.
// Direct mutation of a tenant's enabled modules happens via RBAC admin
// endpoint and is hash-chained auditable.

const FACILITY_PRESETS = {
  medical_city: {
    label: 'Medical City',
    min_modules: 18,
    modules: [
      'card','pulm','gi','neph','onc','endo','id','derm','rheum','er',
      'obg','peds','surg','neuro','ortho','ophth','ent','uro','anes','icu','psyc',
      'lab','rad','pharm','opd','finance','hr',
    ],
  },
  general_hospital: {
    label: 'General Hospital',
    min_modules: 16,
    modules: [
      'card','pulm','er','icu','onc','surg','neuro','ortho','ophth','peds','obg','anes',
      'lab','rad','pharm','opd',
    ],
  },
  tertiary_hospital: {
    label: 'Tertiary Hospital',
    min_modules: 24,
    modules: [
      'card','pulm','er','icu','onc','surg','neuro','ortho','ophth','ent','uro',
      'peds','obg','anes','lab','rad','pharm','opd','derm','rheum','gi','neph','endo','id',
    ],
  },
  specialized_hospital: {
    label: 'Specialized Hospital',
    min_modules: 6,
    modules: ['er','icu','surg','lab','rad','pharm'],
  },
  polyclinic: {
    label: 'Polyclinic',
    min_modules: 4,
    modules: ['gp','pharm','lab','rad'],
  },
  phc: {
    label: 'Primary Health Care',
    min_modules: 3,
    modules: ['gp','pharm','lab','immun'],
  },
  specialty_center: {
    label: 'Specialty Center',
    min_modules: 10,
    modules: ['card','pulm','onco','neu','ortho','derm','gyn','uro','ophth','ent'],
  },
  diagnostic_center: {
    label: 'Diagnostic Center',
    min_modules: 3,
    modules: ['rad','lab','path'],
  },
  rehabilitation_center: {
    label: 'Rehabilitation Center',
    min_modules: 4,
    modules: ['rehab','pt','ot','ortho'],
  },
  dialysis_center: {
    label: 'Dialysis Center',
    min_modules: 2,
    modules: ['neph','dialysis'],
  },
  dental_center: {
    label: 'Dental Center',
    min_modules: 1,
    modules: ['dent'],
  },
  mental_health_center: {
    label: 'Mental Health Center',
    min_modules: 1,
    modules: ['psyc'],
  },
  home_healthcare_unit: {
    label: 'Home Healthcare Unit',
    min_modules: 2,
    modules: ['nurse','home_visit'],
  },
  mobile_clinic: {
    label: 'Mobile Clinic',
    min_modules: 2,
    modules: ['gp','pharm'],
  },
  virtual_clinic: {
    label: 'Virtual Clinic',
    min_modules: 2,
    modules: ['gp','psy_tele'],
  },
  health_unit: {
    label: 'Health Unit',
    min_modules: 2,
    modules: ['gp','first_aid'],
  },
};

function listFacilityTypes() {
  return Object.keys(FACILITY_PRESETS);
}

function getPreset(facilityType) {
  if (!FACILITY_PRESETS[facilityType]) throw new Error('UNKNOWN_FACILITY_TYPE: ' + facilityType);
  return FACILITY_PRESETS[facilityType];
}

// RBAC sanity: only an admin/owner can mutate tenant modules after onboard.
function assertCanMutate(ctx) {
  if (!ctx || !ctx.roles || !Array.isArray(ctx.roles)) {
    throw new Error('CTX_ROLES_REQUIRED');
  }
  if (!ctx.roles.includes('tenant:admin') && !ctx.roles.includes('owner')) {
    throw new Error('PERMISSION_DENIED');
  }
}

// Apply preset to a tenant (mutates tenant doc).
function applyPreset(tenant, facilityType) {
  if (!tenant || typeof tenant !== 'object') throw new Error('TENANT_REQUIRED');
  const preset = getPreset(facilityType);
  tenant.facilityType = facilityType;
  tenant.modulesEnabled = Array.from(preset.modules);
  tenant.appliedPresetAt = new Date().toISOString();
  tenant.presetLabel = preset.label;
  return tenant;
}

// Diff: who would gain what if we applied a new preset.
function diff(tenant, facilityType) {
  if (!tenant || typeof tenant !== 'object') throw new Error('TENANT_REQUIRED');
  const preset = getPreset(facilityType);
  const current = new Set(tenant.modulesEnabled || []);
  const next = new Set(preset.modules);
  const gain = [...next].filter(m => !current.has(m));
  const lose = [...current].filter(m => !next.has(m));
  return { facilityType, label: preset.label, gain, lose };
}

module.exports = { FACILITY_PRESETS, getPreset, listFacilityTypes, applyPreset, diff, assertCanMutate };

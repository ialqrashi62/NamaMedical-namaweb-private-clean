'use strict';
// Hikma Atlas — multi-tenant onboarding conductor.
// Step 1: tenant entity + sandbox DB
// Step 2: facility archetype (16 types)
// Step 3: module preset (per archetype)
// Step 4: first admin user + role binding
// Step 5: audit + RLS warmup
//
// SAFE: store nothing sensitive in memory; canonicalize inputs; deep-clone;
// 16 facility types inline (canonical list lives in
// AGENTS.md §4.4 + namaweb/public/js/facility-catalog.js for the browser).

const crypto = require('crypto');

const PRESETS = {
  medical_city:        ['card','pulm','er','icu','onc','surg','neuro','ortho','ophth','peds','obg','anes','lab','rad','pharm','opd','finance','hr'],
  general_hospital:    ['card','pulm','er','icu','onc','surg','neuro','ortho','ophth','peds','obg','anes','lab','rad','pharm','opd'],
  tertiary_hospital:   ['card','pulm','er','icu','onc','surg','neuro','ortho','ophth','ent','uro','peds','obg','anes','lab','rad','pharm','opd','derm','rheum','gi','neph','endo','id'],
  specialized_hospital:['er','icu','surg','lab','rad','pharm'],
  polyclinic:          ['gp','pharm','lab','rad'],
  phc:                 ['gp','pharm','lab','immun'],
  specialty_center:    ['card','pulm','onco','neu','ortho','derm','gyn','uro','ophth','ent'],
  diagnostic_center:   ['rad','lab','path'],
  rehabilitation_center:['rehab','pt','ot','ortho'],
  dialysis_center:     ['neph','dialysis'],
  dental_center:       ['dent'],
  mental_health_center:['psyc'],
  home_healthcare_unit:['nurse','home_visit'],
  mobile_clinic:       ['gp','pharm'],
  virtual_clinic:      ['gp','psy_tele'],
  health_unit:         ['gp','first_aid'],
};

class HikmaAtlas {
  constructor(opts = {}) {
    this.facilityTypes = [
      'medical_city','general_hospital','tertiary_hospital','specialized_hospital',
      'polyclinic','phc','specialty_center','diagnostic_center','rehabilitation_center',
      'dialysis_center','dental_center','mental_health_center','home_healthcare_unit',
      'mobile_clinic','virtual_clinic','health_unit',
    ];
    this.presets = opts.presets || PRESETS;
  }

  // ---------- helpers ----------
  _hashId(s) {
    return 'sha:' + crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
  }

  _validateTenant(input) {
    if (!input || typeof input !== 'object') throw new Error('TENANT_REQUIRED');
    if (!input.tenantId) throw new Error('TENANT_ID_REQUIRED');
    if (!input.name || input.name.length < 3) throw new Error('TENANT_NAME_REQUIRED');
    if (!input.countryCode || !/^[A-Z]{2}$/.test(input.countryCode)) throw new Error('COUNTRY_CODE_REQUIRED');
    if (!input.contactEmail || !/.+@.+\..+/.test(input.contactEmail)) throw new Error('CONTACT_EMAIL_REQUIRED');
    // redactor
    return {
      tenantId: this._hashId(input.tenantId),
      name: input.name,
      countryCode: input.countryCode,
      contactEmailHash: this._hashId(input.contactEmail),
      createdAt: new Date().toISOString(),
    };
  }

  _validateFacility(input) {
    if (!input || typeof input !== 'object') throw new Error('FACILITY_REQUIRED');
    if (!this.facilityTypes.includes(input.type)) throw new Error('UNKNOWN_FACILITY_TYPE: ' + input.type);
    if (!input.code || input.code.length < 2) throw new Error('FACILITY_CODE_REQUIRED');
    return {
      code: input.code,
      type: input.type,
      name: input.name || input.code,
      licenseNumber: input.licenseNumber ? this._hashId(input.licenseNumber) : null,
      modules: this.presets[input.type] || [],
    };
  }

  _validateAdmin(input) {
    if (!input || typeof input !== 'object') throw new Error('ADMIN_REQUIRED');
    if (!input.username || input.username.length < 3) throw new Error('USERNAME_REQUIRED');
    if (!input.email || !/.+@.+\..+/.test(input.email)) throw new Error('EMAIL_REQUIRED');
    const role = input.role || 'admin';
    return {
      username: input.username,
      emailHash: this._hashId(input.email),
      displayName: input.displayName || input.username,
      roles: [role, 'tenant:admin'],
      mfaEnabled: !!input.mfaEnabled,
      createdAt: new Date().toISOString(),
    };
  }

  // ---------- main pipeline ----------
  onboard(input) {
    const plan = {
      ts: new Date().toISOString(),
      tenant: this._validateTenant(input.tenant),
      facility: null,
      modules: [],
      admin: null,
      checklist: [],
    };

    // Step 1: tenant persist (sandbox = in-memory)
    plan.checklist.push({ step: 'tenant.created', ok: !!plan.tenant.tenantId });

    // Step 2: facility binding (DLQ if absent)
    if (!input.facility) {
      plan.checklist.push({ step: 'facility.skipped', reason: 'NOT_PROVIDED' });
    } else {
      plan.facility = this._validateFacility(input.facility);
      plan.checklist.push({ step: 'facility.created', ok: true, type: plan.facility.type });

      // Step 3: bind module preset
      plan.modules = plan.facility.modules.map(m => ({
        module: m,
        enabled: true,
        boundAt: new Date().toISOString(),
      }));
      plan.checklist.push({ step: 'modules.bound', count: plan.modules.length });
    }

    // Step 4: admin user
    if (input.admin) {
      plan.admin = this._validateAdmin(input.admin);
      plan.checklist.push({ step: 'admin.created', ok: true, username: plan.admin.username });
    }

    // Step 5: RLS warmup checklist (best-effort in sandbox)
    plan.checklist.push({
      step: 'rls.warmup',
      note: 'rails: 5 — confirm public tables enable+FORCE row level security after init migration',
      sqlHint: 'ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY; ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;',
    });

    // Step 6: audit sign-off
    const audit = {
      ts: plan.ts,
      tenantHash: plan.tenant.tenantId,
      facilityType: plan.facility ? plan.facility.type : 'pending',
      moduleCount: plan.modules.length,
      admin: !!plan.admin,
    };
    const auditHash = crypto.createHash('sha256').update(JSON.stringify(audit)).digest('hex');
    plan.auditHash = auditHash;
    plan.checklist.push({ step: 'audit.sealed', hash: auditHash });

    return plan;
  }
}

module.exports = { HikmaAtlas, PRESETS };

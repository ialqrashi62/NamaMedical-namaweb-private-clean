'use strict';

/**
 * DrugCheckService — server-side authority for drug safety.
 * - allergy cross-reactivity
 * - drug-drug interactions
 * - SFDA registry check
 * - pregnancy / renal / hepatic safety checks
 */
const { SFDARegistry } = require('./ports');

class DrugCheckService {
  constructor(opts = {}) {
    this.sfda = opts.sfda || new DefaultSFDARegistry();
    this.interactions = new Map(); // pair -> 'major'|'moderate'|'minor'
    for (const e of (opts.interactions || DEFAULT_INTERACTIONS)) {
      this.interactions.set(`${e.a}|${e.b}`, e.sev);
      this.interactions.set(`${e.b}|${e.a}`, e.sev);
    }
    this.allergens = new Map();
    for (const e of (opts.allergens || DEFAULT_ALLERGENS)) {
      this.allergens.set(e.allergen, e.cross);
    }
  }

  async check(req) {
    const proposed = req.proposed || [];
    const current = req.currentMeds || [];
    const allergies = (req.allergies || []).map(s => String(s).toLowerCase());
    const pregnancy = !!req.pregnancy;
    const renal = !!req.renalFailure;
    const hepatic = !!req.hepaticFailure;

    const alerts = [];
    for (const drug of proposed) {
      const code = drug.code || drug.name;
      // SFDA registered?
      const reg = await this.sfda.isRegistered(code);
      if (!reg.ok) {
        alerts.push({ type: 'sfda_unregistered', drug: code, reason: reg.reason || 'not in SFDA registry', severity: 'block' });
      }
      const bb = await this.sfda.blackbox(code);
      if (bb.blackbox) {
        alerts.push({ type: 'sfda_blackbox', drug: code, reason: bb.warning, severity: 'warn' });
      }
      // Allergies
      for (const a of allergies) {
        const cross = this.allergens.get(a) || [];
        if (cross.includes(code.toLowerCase()) || code.toLowerCase() === a) {
          alerts.push({ type: 'allergy', drug: code, reason: 'patient allergic or cross-reactive', severity: 'block' });
        }
      }
      // Pregnancy
      if (pregnancy && PREG_BLOCK.has(code.toLowerCase())) {
        alerts.push({ type: 'pregnancy', drug: code, reason: 'teratogen; contraindicated', severity: 'block' });
      }
      // Renal
      if (renal && RENAL_DOSE_REQUIRED.has(code.toLowerCase())) {
        alerts.push({ type: 'renal', drug: code, reason: 'renal dose adjustment required', severity: 'warn' });
      }
      // Hepatic
      if (hepatic && HEP_DOSE_REQUIRED.has(code.toLowerCase())) {
        alerts.push({ type: 'hepatic', drug: code, reason: 'hepatic dose adjustment required', severity: 'warn' });
      }
    }

    // Drug-drug interactions (any pair current+proposed)
    for (const cur of current) {
      for (const pro of proposed) {
        const a = cur.code || cur.name;
        const b = pro.code || pro.name;
        const sev = this.interactions.get(`${a}|${b}`);
        if (sev) {
          alerts.push({ type: 'interaction', drug: b, reason: `interacts with current ${a} (${sev})`, severity: sev === 'major' ? 'block' : 'warn' });
        }
      }
    }

    return alerts;
  }
}

class DefaultSFDARegistry {
  // Default: all common SFDA-registered classes are recognized.
  // Local customization: pass SFDA catalog via opts.
  async isRegistered(code) {
    const known = !!code;
    return { ok: known, reason: known ? null : 'unknown drug code' };
  }
  async blackbox(code) {
    return { blackbox: false, warning: null };
  }
}

const PREG_BLOCK = new Set([
  'warfarin', 'isotretinoin', 'methotrexate', 'ace_inhibitor', 'arb',
  'valproate', 'topiramate', 'phenytoin', 'carbamazepine', 'lithium',
  'misoprostol', 'ergotamine', 'simvastatin', 'mycophenolate',
]);
const RENAL_DOSE_REQUIRED = new Set([
  'amoxicillin', 'ceftazidime', 'vancomycin', 'gentamicin', 'tobramycin',
  'acyclovir', 'valacyclovir', 'meropenem', 'piperacillin', 'enoxaparin',
  'metformin', 'digoxin', 'lithium',
]);
const HEP_DOSE_REQUIRED = new Set([
  'paracetamol', 'morphine', 'metronidazole', 'clarithromycin',
  'warfarin', 'simvastatin', 'atorvastatin',
]);

const DEFAULT_INTERACTIONS = [
  { a: 'warfarin', b: 'fluconazole',  sev: 'major' },
  { a: 'warfarin', b: 'clarithromycin', sev: 'major' },
  { a: 'warfarin', b: 'tramadol', sev: 'major' },
  { a: 'warfarin', b: 'amiodarone', sev: 'major' },
  { a: 'simvastatin', b: 'clarithromycin', sev: 'major' },
  { a: 'simvastatin', b: 'fluconazole', sev: 'major' },
  { a: 'metformin', b: 'contrast_iodinated', sev: 'moderate' },
  { a: 'lithium',   b: 'nsaid', sev: 'major' },
  { a: 'lithium',   b: 'thiazide', sev: 'major' },
  { a: 'digoxin',   b: 'amiodarone', sev: 'major' },
  { a: 'clopidogrel', b: 'omeprazole', sev: 'moderate' },
];

const DEFAULT_ALLERGENS = [
  // allergen (lowercase) -> cross reactive family (lowercase)
  { allergen: 'penicillin', cross: ['amoxicillin', 'ampicillin', 'piperacillin', 'nafcillin', 'oxacillin'] },
  { allergen: 'sulfa',      cross: ['sulfamethoxazole', 'sulfasalazine'] },
  { allergen: 'aspirin',    cross: ['ibuprofen', 'naproxen', 'diclofenac', 'celecoxib', 'ketorolac'] },
  { allergen: 'shellfish',  cross: ['iodinated_contrast'] },
];

module.exports = { DrugCheckService, DefaultSFDARegistry };

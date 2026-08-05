// lib/pharmacy/usp.js
// USP <797> / <800> compliance helpers for sterile and hazardous
// pharmaceutical compounding. Pure JS, no npm install.
//
// BUD = Beyond-Use Date. Per USP <797> the defaults are:
//   - Low/medium-risk sterile, room-temp  → 30 hours
//   - Low/medium-risk sterile, refrigerated → 9 days
//   - Low/medium-risk sterile, frozen       → 45 days
//   - High-risk sterile, room-temp          → 24 hours
//   - High-risk sterile, refrigerated       → 3 days
// Per USP <800> hazardous drugs:
//   - Room-temp → 12 hours
//   - Refrigerated → 28 days
// Non-sterile compounds follow standard beyond-use dating: 6 months room
// temp / 12 months refrigerated, or per the master formula override.
//
// Categories are kept as a frozen enum-like object so the rest of the
// codebase can switch on them safely.

'use strict';

const CATEGORIES = Object.freeze({
  STERILE: 'sterile',
  NON_STERILE: 'non_sterile',
  HAZARDOUS: 'hazardous'
});

// BUD table is in HOURS (smaller unit) where possible. Refrigerated/frozen
// are kept in HOURS too (e.g. 9 days = 216 hours) so all comparisons are
// uniform.
const BUD_BY_CATEGORY = Object.freeze({
  sterile: {
    room_temp: 30,        // 30 hours
    refrigerated: 9 * 24, // 9 days
    frozen: 45 * 24,      // 45 days
    high_risk_room_temp: 24,
    high_risk_refrigerated: 3 * 24
  },
  hazardous: {
    room_temp: 12,
    refrigerated: 28 * 24,
    frozen: 28 * 24
  },
  non_sterile: {
    room_temp: 180 * 24,        // ~6 months
    refrigerated: 365 * 24,     // ~12 months
    frozen: 365 * 24
  }
});

// Required engineering controls per category:
//   - sterile low/medium risk   → ISO Class 5 PEC (LAFW or CACI)
//   - sterile high risk         → ISO Class 5 PEC inside ISO Class 7 buffer
//   - hazardous                 → ISO Class 5 C-PEC inside ISO Class 7 C-SEC
//                                  (containment ventilation; negative pressure)
const RISK_BY_CATEGORY = Object.freeze({
  sterile: {
    riskLevel: 'high',
    requiresPEC: true,
    requiresISOClass: 'ISO-5',
    requiresISOBuffer: 'ISO-7',
    doubleWitness: true,
    gownedRequired: true
  },
  hazardous: {
    riskLevel: 'high',
    requiresPEC: true,
    requiresISOClass: 'ISO-5',
    requiresCBI: true, // closed system drug transfer device
    doubleWitness: true,
    gownedRequired: true
  },
  non_sterile: {
    riskLevel: 'low',
    requiresPEC: false,
    requiresISOClass: 'ISO-8',
    doubleWitness: false,
    gownedRequired: false
  }
});

/**
 * Classify a formula based on its components and declared category.
 * Returns the engineering controls the compounder must use.
 */
function classifyFormula({ category, components }) {
  const cat = normalizeCategory(category);
  const comps = Array.isArray(components) ? components : [];
  const base = RISK_BY_CATEGORY[cat];
  if (!base) {
    return {
      ok: false,
      error: 'UNKNOWN_CATEGORY',
      riskLevel: 'unknown',
      requiresPEC: false,
      requiresISOClass: null
    };
  }
  // Up-classify sterile formulas with > 3 components (heuristic for
  // higher complexity / more manipulation steps).
  let riskLevel = base.riskLevel;
  if (cat === 'sterile' && comps.length > 3) riskLevel = 'high';
  return {
    ok: true,
    category: cat,
    componentCount: comps.length,
    riskLevel: riskLevel,
    requiresPEC: base.requiresPEC,
    requiresISOClass: base.requiresISOClass,
    requiresISOBuffer: base.requiresISOBuffer || null,
    requiresCBI: base.requiresCBI || false,
    doubleWitness: base.doubleWitness,
    gownedRequired: base.gownedRequired
  };
}

/**
 * Compute the Beyond-Use Date for a compounding batch.
 *
 *   { category, storage, riskLevel? }
 *
 * Returns { ok, budHours, basis }.
 *   - basis: a human-readable string citing the USP <797>/<800> rule
 *     used. This is what gets stamped on the batch label.
 */
function beyondUseDate({ category, storage, riskLevel }) {
  const cat = normalizeCategory(category);
  const sto = normalizeStorage(storage);
  const table = BUD_BY_CATEGORY[cat];
  if (!table) return { ok: false, error: 'UNKNOWN_CATEGORY' };
  // Sterile: branch on risk for room_temp / refrigerated
  if (cat === 'sterile' && (sto === 'room_temp' || sto === 'refrigerated')) {
    if (riskLevel === 'high') {
      const key = sto === 'room_temp' ? 'high_risk_room_temp' : 'high_risk_refrigerated';
      return {
        ok: true,
        budHours: table[key],
        basis: 'USP <797> high-risk ' + sto
      };
    }
  }
  // Sterile: frozen is always 45 days (no risk split in our table)
  if (cat === 'sterile' && sto === 'frozen') {
    return { ok: true, budHours: table.frozen, basis: 'USP <797> frozen' };
  }
  // Hazardous defaults
  if (cat === 'hazardous') {
    if (table[sto] === undefined) {
      return { ok: true, budHours: table.room_temp, basis: 'USP <800> room-temp default' };
    }
    return { ok: true, budHours: table[sto], basis: 'USP <800> ' + sto };
  }
  // Non-sterile: standard
  if (cat === 'non_sterile') {
    if (table[sto] === undefined) {
      return { ok: true, budHours: table.room_temp, basis: 'Non-sterile room-temp default' };
    }
    return { ok: true, budHours: table[sto], basis: 'Non-sterile ' + sto };
  }
  // Sterile fallthrough
  if (cat === 'sterile' && table[sto] !== undefined) {
    return { ok: true, budHours: table[sto], basis: 'USP <797> ' + sto };
  }
  return { ok: true, budHours: table.room_temp, basis: 'Default room-temp' };
}

/**
 * Validate a master formula and produce a frozen record.
 * Throws on validation failure (fail-closed, RAIL-11).
 */
function masterFormula({ name, components, category, instructions, storage, riskLevel }) {
  if (!name || typeof name !== 'string') throw new Error('NAME_REQUIRED');
  if (!Array.isArray(components) || components.length === 0) throw new Error('COMPONENTS_REQUIRED');
  for (const c of components) {
    if (!c || !c.name || !c.strength) throw new Error('COMPONENT_INVALID');
  }
  if (!category) throw new Error('CATEGORY_REQUIRED');
  const cat = normalizeCategory(category);
  const cls = classifyFormula({ category: cat, components: components });
  if (!cls.ok) throw new Error(cls.error || 'CLASSIFY_FAILED');
  const bud = beyondUseDate({ category: cat, storage: storage, riskLevel: riskLevel || cls.riskLevel });
  if (!bud.ok) throw new Error(bud.error || 'BUD_FAILED');
  return Object.freeze({
    formulaId: 'mf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    name: name,
    components: components.map(function (c) {
      return { name: c.name, strength: c.strength, unit: c.unit || null, lot: c.lot || null };
    }),
    category: cat,
    storage: storage || 'room_temp',
    riskLevel: cls.riskLevel,
    requiresPEC: cls.requiresPEC,
    requiresISOClass: cls.requiresISOClass,
    doubleWitness: cls.doubleWitness,
    instructions: instructions || '',
    budHours: bud.budHours,
    basis: bud.basis,
    createdAt: new Date().toISOString()
  });
}

// --- helpers ---

function normalizeCategory(c) {
  if (!c) return 'non_sterile';
  const s = String(c).toLowerCase().trim();
  if (s === 'sterile' || s === 's') return 'sterile';
  if (s === 'hazardous' || s === 'hd' || s === 'chemo') return 'hazardous';
  if (s === 'non_sterile' || s === 'non-sterile' || s === 'ns') return 'non_sterile';
  return s;
}

function normalizeStorage(s) {
  if (!s) return 'room_temp';
  const v = String(s).toLowerCase().trim();
  if (v === 'room' || v === 'room_temp' || v === 'room-temp' || v === 'rt') return 'room_temp';
  if (v === 'refrigerated' || v === 'fridge' || v === 'fridge_2_8' || v === '2-8c') return 'refrigerated';
  if (v === 'frozen' || v === 'freeze' || v === '-20') return 'frozen';
  return v;
}

module.exports = {
  CATEGORIES: CATEGORIES,
  BUD_BY_CATEGORY: BUD_BY_CATEGORY,
  classifyFormula: classifyFormula,
  beyondUseDate: beyondUseDate,
  masterFormula: masterFormula,
  // exposed for tests
  _normalizeCategory: normalizeCategory,
  _normalizeStorage: normalizeStorage
};

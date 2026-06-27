/**
 * bloodbank_compat.js — Blood Bank ABO/Rh compatibility engine (E13)
 * =================================================================
 * PURE, DB-FREE, UNIT-TESTABLE compatibility logic for crossmatch.
 *
 * SAFETY INVARIANT (critical): an ABO/Rh-INCOMPATIBLE pairing must be
 * reported incompatible so the caller can fail-closed (HTTP 422). The
 * client must NEVER be trusted to mark a crossmatch compatible — that
 * authority lives here, server-side.
 *
 * Standard RBC transfusion compatibility (recipient receives donor RBC):
 *   - ABO: recipient plasma must not contain antibodies against donor RBC antigens.
 *       O    -> can receive: O
 *       A    -> can receive: A, O
 *       B    -> can receive: B, O
 *       AB   -> can receive: AB, A, B, O   (universal recipient)
 *   - Rh : an Rh-NEGATIVE recipient must NOT receive Rh-POSITIVE RBC.
 *           An Rh-POSITIVE recipient may receive either.
 *
 * For plasma/FFP products the ABO rule is INVERTED (plasma carries
 * antibodies, not antigens) and Rh is not a barrier. We implement the
 * RBC rule for cellular components (Whole Blood / Packed RBC / Platelets)
 * and the plasma rule for FFP / Cryoprecipitate. When the component is
 * unknown we apply the STRICTER (RBC) rule — fail-closed by default.
 *
 * No incomplete input is ever treated as "compatible": missing/unparseable
 * ABO or Rh => compatible:false with an explicit reason (E6 lesson: an
 * engine that cannot decide must block, never reassure).
 */
'use strict';

const VALID_ABO = ['O', 'A', 'B', 'AB'];

// RBC (cellular) compatibility: recipient -> set of acceptable donor ABO groups
const RBC_ABO_COMPAT = {
  'O':  ['O'],
  'A':  ['A', 'O'],
  'B':  ['B', 'O'],
  'AB': ['AB', 'A', 'B', 'O'],
};

// Plasma (FFP/Cryo) compatibility: recipient -> set of acceptable donor ABO groups
// (inverted: AB plasma is universal donor; O plasma only to O)
const PLASMA_ABO_COMPAT = {
  'AB': ['AB'],
  'A':  ['A', 'AB'],
  'B':  ['B', 'AB'],
  'O':  ['O', 'A', 'B', 'AB'],
};

const PLASMA_COMPONENTS = new Set(['FFP', 'CRYOPRECIPITATE', 'CRYO', 'PLASMA', 'FRESH FROZEN PLASMA']);

/**
 * parseBloodType — normalize a free-form blood type into { abo, rh } or null.
 * Accepts: "A+", "A POS", "O-", "AB Negative", "B", { blood_type:'A', rh_factor:'+' }.
 * Returns null abo / null rh for any part it cannot determine (fail-closed upstream).
 * @returns {{abo: string|null, rh: ('+'|'-'|null)}}
 */
function parseBloodType(typeStr, rhStr) {
  let abo = null;
  let rh = null;

  // Allow object form { blood_type, rh_factor }
  if (typeStr && typeof typeStr === 'object') {
    rhStr = typeStr.rh_factor != null ? typeStr.rh_factor : rhStr;
    typeStr = typeStr.blood_type;
  }

  const raw = (typeStr == null ? '' : String(typeStr)).trim().toUpperCase();

  // Extract Rh from a combined string first (A+, O-, "A POS", "B NEGATIVE")
  let aboPart = raw;
  if (/[+]|POS|POSITIVE/.test(raw)) { rh = '+'; }
  if (/[-]|NEG|NEGATIVE/.test(raw)) { rh = (rh === '+' ? null : '-'); } // both -> ambiguous -> null
  // strip rh tokens to isolate ABO
  aboPart = raw.replace(/POSITIVE|NEGATIVE|POS|NEG|[+\-\s]/g, '');

  if (VALID_ABO.includes(aboPart)) abo = aboPart;

  // explicit rhStr overrides / supplements
  if (rhStr != null && String(rhStr).trim() !== '') {
    const r = String(rhStr).trim().toUpperCase();
    if (r === '+' || r === 'POS' || r === 'POSITIVE') rh = '+';
    else if (r === '-' || r === 'NEG' || r === 'NEGATIVE') rh = '-';
  }

  return { abo, rh };
}

/**
 * isABORhCompatible — the critical safety predicate.
 * @param {string|object} patientType  recipient ABO (e.g. "A+", or {blood_type,rh_factor})
 * @param {string} patientRh           recipient Rh (optional if encoded in patientType)
 * @param {string|object} unitType     donor unit ABO
 * @param {string} unitRh              donor unit Rh
 * @param {string} component           unit component (governs RBC vs plasma rule)
 * @returns {{compatible: boolean, reason: string, recipient: object, donor: object}}
 */
function isABORhCompatible(patientType, patientRh, unitType, unitRh, component) {
  const recipient = parseBloodType(patientType, patientRh);
  const donor = parseBloodType(unitType, unitRh);

  // Fail-closed on incomplete data — never return compatible:true on missing input.
  if (!recipient.abo || !recipient.rh) {
    return { compatible: false, reason: 'INCOMPLETE_RECIPIENT_TYPE', recipient, donor };
  }
  if (!donor.abo || !donor.rh) {
    return { compatible: false, reason: 'INCOMPLETE_DONOR_TYPE', recipient, donor };
  }

  const comp = (component == null ? '' : String(component)).trim().toUpperCase();
  const isPlasma = PLASMA_COMPONENTS.has(comp);
  const table = isPlasma ? PLASMA_ABO_COMPAT : RBC_ABO_COMPAT;

  // ABO check
  const acceptable = table[recipient.abo] || [];
  if (!acceptable.includes(donor.abo)) {
    return {
      compatible: false,
      reason: `ABO_INCOMPATIBLE: recipient ${recipient.abo} cannot receive ${isPlasma ? 'plasma' : 'RBC'} from donor ${donor.abo}`,
      recipient, donor,
    };
  }

  // Rh check — only a barrier for cellular (RBC) products.
  // Rh-negative recipient must NOT receive Rh-positive RBC.
  if (!isPlasma && recipient.rh === '-' && donor.rh === '+') {
    return {
      compatible: false,
      reason: 'RH_INCOMPATIBLE: Rh-negative recipient cannot receive Rh-positive RBC',
      recipient, donor,
    };
  }

  return {
    compatible: true,
    reason: isPlasma ? 'ABO_COMPATIBLE_PLASMA' : 'ABO_RH_COMPATIBLE',
    recipient, donor,
  };
}

/**
 * isUnitIssuable — FEFO/expiry + status gate (pure). Does NOT touch DB.
 * @param {object} unit { status, expiry_date }
 * @param {Date|string} now reference date (defaults to today)
 * @returns {{issuable: boolean, reason: string}}
 */
function isUnitIssuable(unit, now) {
  if (!unit) return { issuable: false, reason: 'UNIT_NOT_FOUND' };
  const status = (unit.status == null ? '' : String(unit.status)).trim();
  if (status !== 'Available') {
    return { issuable: false, reason: `UNIT_NOT_AVAILABLE: status=${status || 'unknown'}` };
  }
  const exp = unit.expiry_date;
  if (exp != null && String(exp).trim() !== '') {
    const expDate = new Date(String(exp).slice(0, 10) + 'T23:59:59');
    const ref = now ? new Date(now) : new Date();
    if (!isNaN(expDate.getTime()) && expDate.getTime() < ref.getTime()) {
      return { issuable: false, reason: 'UNIT_EXPIRED' };
    }
  }
  return { issuable: true, reason: 'OK' };
}

/** daysUntilExpiry — helper for near-expiry alerts (pure). null when unknown. */
function daysUntilExpiry(expiry_date, now) {
  if (expiry_date == null || String(expiry_date).trim() === '') return null;
  const expDate = new Date(String(expiry_date).slice(0, 10) + 'T00:00:00');
  if (isNaN(expDate.getTime())) return null;
  const ref = now ? new Date(now) : new Date();
  return Math.floor((expDate.getTime() - ref.getTime()) / (24 * 3600 * 1000));
}

module.exports = {
  parseBloodType,
  isABORhCompatible,
  isUnitIssuable,
  daysUntilExpiry,
  VALID_ABO,
  RBC_ABO_COMPAT,
  PLASMA_ABO_COMPAT,
};

'use strict';
// Pharmaco — CPIC-style lookup. Given a drug + variant, returns a dosing
// recommendation. Sandbox stub uses a small in-memory table.

function newPharmaco() {
  const table = {
    'warfarin-VKORC1:-1639G>A': { recommendation: 'Reduce dose 30%', level: 'strong' },
    'codeine-CYP2D6:*1/*1': { recommendation: 'Standard dose', level: 'standard' },
    'clopidogrel-CYP2C19:*2/*2': { recommendation: 'Alternative recommended', level: 'strong' },
  };
  function lookup({ drug, variant }) {
    if (!drug || !variant) throw new Error('DRUG_VARIANT_REQUIRED');
    const k = drug + '-' + variant;
    return table[k] || { recommendation: 'Standard dose', level: 'standard', hint: 'No CPIC entry, defaulting' };
  }
  return { lookup };
}

module.exports = { newPharmaco };

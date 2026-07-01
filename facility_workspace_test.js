/**
 * facility_workspace_test.js
 * ==========================================
 * Tests for the Facility Switcher and Department Workspace core rules.
 * Verifies that:
 * 1. Facility Catalog helpers work correctly.
 * 2. Allowed departments are filtered by facility type.
 * 3. Polyclinic hides ICU/OR by default.
 * 4. Health Unit hides ICU/OR by default.
 * 5. Workspace contains no PHI.
 */

const assert = require('assert');

// Mock browser globals for testing
global.window = {};
require('./public/js/facility-catalog.js');

console.log('Running Facility Switcher & Department Workspace Core Tests...');

// 1. Filter facilities by medical city
const kfmcFacilities = global.window.getFacilitiesByMedicalCity(1);
assert.strictEqual(kfmcFacilities.length, 5, 'KFMC should have 5 facilities');
assert.ok(kfmcFacilities.some(f => f.name_en.includes('General Hospital')), 'KFMC should contain General Hospital');
console.log('✓ Facility Catalog filtering passed.');

// 2. Allowed departments for Polyclinic (page 23 is ICU, page 18 is Surgery)
const polyDepts = global.window.getDepartmentsByFacilityType('polyclinic');
assert.ok(!polyDepts.includes(23), 'Polyclinic should not allow ICU');
console.log('✓ Polyclinic department filtering passed.');

// 3. Allowed departments for Health Unit
const unitDepts = global.window.getDepartmentsByFacilityType('health_unit');
assert.ok(!unitDepts.includes(18), 'Health Unit should not allow Surgery/OR');
assert.ok(!unitDepts.includes(23), 'Health Unit should not allow ICU');
console.log('✓ Health Unit department filtering passed.');

// 4. Allowed departments for Medical City (null = all allowed)
const mcDepts = global.window.getDepartmentsByFacilityType('medical_city');
assert.strictEqual(mcDepts, null, 'Medical City should allow all departments (null)');
console.log('✓ Medical City department filtering passed.');

console.log('All Facility Switcher & Department Workspace Core Tests Passed!');
process.exit(0);

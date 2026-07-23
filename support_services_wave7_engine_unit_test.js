// support_services_wave7_engine_unit_test.js
// Unit tests for support_services_wave7_engine.js

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('./support_services_wave7_engine.js');

// NRS-2002
test('NRS BMI 19 + wt loss 5kg = 6 (high risk)', () => {
    const r = engine.screenNutritionNRS({ bmi: 19, weightLossKg3mo: 6, intakeReduced: false, severelyIll: false });
    assert.equal(r.value.score, 6);
    assert.equal(r.severity, 'high');
});

test('NRS normal BMI no issues = 0', () => {
    const r = engine.screenNutritionNRS({ bmi: 24, weightLossKg3mo: 0, intakeReduced: false, severelyIll: false });
    assert.equal(r.value.score, 0);
    assert.equal(r.value.risk, 'no_risk');
});

test('NRS reduced intake only = 1 (possible risk)', () => {
    const r = engine.screenNutritionNRS({ bmi: 24, weightLossKg3mo: 0, intakeReduced: true, severelyIll: false });
    assert.equal(r.value.score, 1);
});

// MUST
test('MUST BMI 17 + 12% loss + acute = 6 (high)', () => {
    const r = engine.screenMalnutritionMUST({ bmi: 17, weightLossPct: 12, acuteDiseaseEffect: true });
    assert.equal(r.value.total, 6);
    assert.equal(r.value.category, 'high_risk');
});

test('MUST BMI 22 + 0% = 0 (low)', () => {
    const r = engine.screenMalnutritionMUST({ bmi: 22, weightLossPct: 0, acuteDiseaseEffect: false });
    assert.equal(r.value.total, 0);
    assert.equal(r.value.category, 'low_risk');
});

test('MUST BMI 19 + 7% = 2 (high)', () => {
    const r = engine.screenMalnutritionMUST({ bmi: 19, weightLossPct: 7, acuteDiseaseEffect: false });
    assert.equal(r.value.total, 2);
});

// Social work
test('SW 2 flags = moderate, SW consult', () => {
    const r = engine.screenSocialWork({ housingInstability: true, foodInsecurity: true, financialStrain: false, lackSupport: false, transportBarriers: false });
    assert.equal(r.value.score, 2);
    assert.equal(r.severity, 'high');
    assert.ok(r.recommendations.some(x => x.intervention.includes('Social work consult')));
});

test('SW 0 flags = no risk', () => {
    const r = engine.screenSocialWork({ housingInstability: false, foodInsecurity: false, financialStrain: false, lackSupport: false, transportBarriers: false });
    assert.equal(r.value.score, 0);
    assert.equal(r.severity, 'low');
});

test('SW 4 flags = high', () => {
    const r = engine.screenSocialWork({ housingInstability: true, foodInsecurity: true, financialStrain: true, lackSupport: false, transportBarriers: true });
    assert.equal(r.value.score, 4);
});

// Biomed PM
test('PM life-support 7mo = overdue (critical)', () => {
    const r = engine.planBiomedPM({ equipmentClass: 'life_support', lastPmMonthsAgo: 7, currentAgeYears: 3, dailyUsageHours: 8, recallHistory: 0 });
    assert.equal(r.value.overdue, true);
    assert.equal(r.severity, 'critical');
    assert.equal(r.value.priority, 'immediate');
});

test('PM critical 13mo = overdue (high)', () => {
    const r = engine.planBiomedPM({ equipmentClass: 'critical', lastPmMonthsAgo: 13, currentAgeYears: 5, dailyUsageHours: 6, recallHistory: 0 });
    assert.equal(r.value.overdue, true);
    assert.equal(r.value.priority, 'urgent');
});

test('PM general 20mo = on schedule (low)', () => {
    const r = engine.planBiomedPM({ equipmentClass: 'general', lastPmMonthsAgo: 10, currentAgeYears: 3, dailyUsageHours: 4, recallHistory: 0 });
    assert.equal(r.value.overdue, false);
    assert.equal(r.severity, 'low');
});

test('PM general 30mo = overdue (moderate)', () => {
    const r = engine.planBiomedPM({ equipmentClass: 'general', lastPmMonthsAgo: 30, currentAgeYears: 5, dailyUsageHours: 4, recallHistory: 0 });
    assert.equal(r.value.overdue, true);
    assert.equal(r.value.priority, 'soon');
});

// Device failure
test('Device 15y old, many hours, 3 recalls = high failure', () => {
    const r = engine.assessMedicalDeviceFailure({ ageYears: 15, totalOperatingHours: 50000, lastPmMonthsAgo: 18, expectedLifespanYears: 10, recallCount: 3, errorLogCount: 10 });
    assert.ok(r.value.failureProb > 50);
    assert.ok(['high', 'critical'].includes(r.severity));
});

test('Device 1y old = low failure prob', () => {
    const r = engine.assessMedicalDeviceFailure({ ageYears: 1, totalOperatingHours: 2000, lastPmMonthsAgo: 2, expectedLifespanYears: 10, recallCount: 0, errorLogCount: 0 });
    assert.ok(r.value.failureProb < 30);
    assert.equal(r.severity, 'low');
});

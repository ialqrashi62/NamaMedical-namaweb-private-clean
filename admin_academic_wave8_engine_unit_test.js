// admin_academic_wave8_engine_unit_test.js
// Unit tests for admin_academic_wave8_engine.js

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('./admin_academic_wave8_engine.js');

// HAI
test('CLABSI SIR 1.8 = critical (high infection)', () => {
    const r = engine.calculateHAI({ type: 'clabsi', observed: 9, expected: 5, deviceDays: 5000 });
    assert.equal(r.value.sir, 1.8);
    assert.equal(r.value.rate, 1.8);
    assert.equal(r.severity, 'critical');
});

test('CLABSI SIR 0.3 = low (better than expected)', () => {
    const r = engine.calculateHAI({ type: 'clabsi', observed: 2, expected: 6.67, deviceDays: 5000 });
    assert.ok(r.value.sir < 0.5);
    assert.equal(r.severity, 'low');
});

test('CAUTI SIR 1.1 = high', () => {
    const r = engine.calculateHAI({ type: 'cauti', observed: 6, expected: 5.45, deviceDays: 5500 });
    assert.ok(r.value.sir >= 1.0 && r.value.sir <= 1.5);
    assert.equal(r.severity, 'high');
});

test('SSI SIR 0.7 = moderate', () => {
    const r = engine.calculateHAI({ type: 'ssi', observed: 7, expected: 10, procedures: 1000 });
    assert.equal(r.value.sir, 0.7);
    assert.equal(r.value.rate, 0.7);
    assert.equal(r.severity, 'moderate');
});

test('MRSA LabID SIR 2.0 = critical', () => {
    const r = engine.calculateHAI({ type: 'mrsa', observed: 4, expected: 2, patientDays: 5000 });
    assert.equal(r.value.sir, 2.0);
    assert.equal(r.severity, 'critical');
});

test('HAI throws on missing required fields', () => {
    assert.throws(() => engine.calculateHAI({ type: 'clabsi', observed: 1, expected: 2 }), /deviceDays/);
});

// Research eligibility
test('Research all inclusion + no exclusion = eligible', () => {
    const r = engine.screenResearchEligibility({
        inclusion: [
            { name: 'Age 18-75', met: true },
            { name: 'ECOG 0-1', met: true }
        ],
        exclusion: [
            { name: 'Pregnant', present: false },
            { name: 'Prior chemo', present: false }
        ]
    });
    assert.equal(r.value.eligible, true);
    assert.equal(r.severity, 'low');
});

test('Research 1 inclusion fail = ineligible', () => {
    const r = engine.screenResearchEligibility({
        inclusion: [
            { name: 'Age 18-75', met: true },
            { name: 'ECOG 0-1', met: false }
        ],
        exclusion: [{ name: 'Pregnant', present: false }]
    });
    assert.equal(r.value.eligible, false);
    assert.equal(r.value.blockers.length, 1);
});

test('Research 1 exclusion present = ineligible', () => {
    const r = engine.screenResearchEligibility({
        inclusion: [{ name: 'Age', met: true }],
        exclusion: [{ name: 'Pregnant', present: true }]
    });
    assert.equal(r.value.eligible, false);
    assert.equal(r.severity, 'moderate');
});

// Credentialing
test('All credentials current = eligible', () => {
    const r = engine.assessProviderCredential({
        licenseActive: true, deaActive: true, boardCertActive: true,
        malpracticeActive: true, hospitalPrivilegesActive: true,
        cmeHoursAnnual: 30, cmeHoursRequired: 25, npdbQueryMoAgo: 6
    });
    assert.equal(r.value.credentialEligible, true);
    assert.equal(r.value.allPassed, true);
    assert.equal(r.severity, 'low');
});

test('License inactive = not eligible (critical)', () => {
    const r = engine.assessProviderCredential({
        licenseActive: false, deaActive: true, boardCertActive: true,
        malpracticeActive: true, hospitalPrivilegesActive: true,
        cmeHoursAnnual: 30, cmeHoursRequired: 25, npdbQueryMoAgo: 6
    });
    assert.equal(r.value.credentialEligible, false);
    assert.equal(r.severity, 'critical');
    assert.ok(r.recommendations.some(x => x.intervention.includes('HALT')));
});

test('CME short + NPDB old = moderate (non-critical fails)', () => {
    const r = engine.assessProviderCredential({
        licenseActive: true, deaActive: true, boardCertActive: true,
        malpracticeActive: true, hospitalPrivilegesActive: true,
        cmeHoursAnnual: 10, cmeHoursRequired: 25, npdbQueryMoAgo: 30
    });
    assert.equal(r.value.credentialEligible, true);
    assert.equal(r.value.allPassed, false);
});

test('DEA inactive = critical', () => {
    const r = engine.assessProviderCredential({
        licenseActive: true, deaActive: false, boardCertActive: true,
        malpracticeActive: true, hospitalPrivilegesActive: true,
        cmeHoursAnnual: 30, cmeHoursRequired: 25
    });
    assert.equal(r.severity, 'critical');
});

// CME tracking
test('CME 20/30 = 67% (moderate)', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const r = engine.trackCME({ currentCME: 20, requiredAnnual: 30, deadline: future.toISOString().slice(0, 10), specialtyBoard: 'IM' });
    assert.equal(r.value.pctComplete, 67);
    assert.equal(r.value.remaining, 10);
});

test('CME 0/30 close deadline = critical', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const r = engine.trackCME({ currentCME: 0, requiredAnnual: 30, deadline: soon.toISOString().slice(0, 10) });
    assert.equal(r.severity, 'critical');
});

test('CME 30/30 = complete (low)', () => {
    const r = engine.trackCME({ currentCME: 30, requiredAnnual: 30, deadline: '2026-12-31' });
    assert.equal(r.value.complete, true);
    assert.equal(r.severity, 'low');
});

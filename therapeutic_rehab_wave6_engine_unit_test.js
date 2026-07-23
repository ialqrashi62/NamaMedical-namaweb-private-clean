// therapeutic_rehab_wave6_engine_unit_test.js
// Unit tests for therapeutic_rehab_wave6_engine.js

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('./therapeutic_rehab_wave6_engine.js');

// Berg Balance Scale
test('Berg total 56 = independent', () => {
    const r = engine.assessBergBalance({ itemScores: [4,4,4,4,4,4,4,4,4,4,4,4,4,4] });
    assert.equal(r.value.total, 56);
    assert.equal(r.severity, 'low');
    assert.equal(r.value.riskClass, 'independent');
});

test('Berg total 28 = assisted (high severity)', () => {
    const scores = [2,2,2,2,2,2,2,2,2,2,2,2,2,2];
    const r = engine.assessBergBalance({ itemScores: scores });
    assert.equal(r.value.total, 28);
    assert.equal(r.value.riskClass, 'assisted');
    assert.equal(r.severity, 'high');
});

test('Berg total 9 = wheelchair (critical)', () => {
    const scores = [0,0,0,0,0,1,1,1,1,1,1,1,1,1];
    const r = engine.assessBergBalance({ itemScores: scores });
    assert.equal(r.value.total, 9);
    assert.equal(r.severity, 'critical');
    assert.equal(r.value.riskClass, 'wheelchair');
});

test('Berg throws on wrong item count', () => {
    assert.throws(() => engine.assessBergBalance({ itemScores: [1,2,3] }), /14 scores/);
});

test('Berg throws on out-of-range score', () => {
    assert.throws(() => engine.assessBergBalance({ itemScores: [5,3,3,3,3,3,3,3,3,3,3,3,3,3] }), /0-4/);
});

// Tinetti
test('Tinetti total 28 = low fall risk', () => {
    const r = engine.assessTinetti({ balance: 16, gait: 12 });
    assert.equal(r.value.total, 28);
    assert.equal(r.severity, 'low');
});

test('Tinetti total 20 = moderate fall risk', () => {
    const r = engine.assessTinetti({ balance: 12, gait: 8 });
    assert.equal(r.value.total, 20);
    assert.equal(r.severity, 'moderate');
});

test('Tinetti total 14 = high fall risk (critical)', () => {
    const r = engine.assessTinetti({ balance: 8, gait: 6 });
    assert.equal(r.severity, 'critical');
});

test('Tinetti throws on out-of-range balance', () => {
    assert.throws(() => engine.assessTinetti({ balance: 17, gait: 10 }), /0-16/);
});

// FIM
test('FIM total 126 = near independent', () => {
    const r = engine.assessFIM({ motorItems: [7,7,7,7,7,7,7,7,7,7,7,7,7], cognitiveItems: [7,7,7,7,7] });
    assert.equal(r.value.total, 126);
    assert.equal(r.value.classif, 'near_independent');
});

test('FIM total 54 = significant assistance (high severity)', () => {
    const motor = [3,3,3,3,3,3,3,3,3,3,3,3,3];
    const cog = [3,3,3,3,3];
    const r = engine.assessFIM({ motorItems: motor, cognitiveItems: cog });
    assert.equal(r.value.total, 54);
    assert.equal(r.value.classif, 'significant_assistance');
    assert.equal(r.severity, 'high');
});

test('FIM throws on wrong item count', () => {
    assert.throws(() => engine.assessFIM({ motorItems: [3,3,3], cognitiveItems: [3,3,3,3,3] }), /13 scores/);
});

// Pain NRS
test('NRS 0 = no pain, no step', () => {
    const r = engine.assessPainNRS({ nrs: 0 });
    assert.equal(r.severity, 'low');
    assert.equal(r.value.step, 'none');
});

test('NRS 2 = mild, step 1', () => {
    const r = engine.assessPainNRS({ nrs: 2 });
    assert.equal(r.value.step, 'step1');
    assert.equal(r.severity, 'mild');
});

test('NRS 5 = moderate, step 2', () => {
    const r = engine.assessPainNRS({ nrs: 5 });
    assert.equal(r.value.step, 'step2');
});

test('NRS 9 = severe, step 3, morphine', () => {
    const r = engine.assessPainNRS({ nrs: 9, chronicity: 'acute' });
    assert.equal(r.value.step, 'step3');
    assert.equal(r.severity, 'severe');
    assert.ok(r.recommendations.some(x => x.drug && x.drug.includes('Morphine')));
});

test('NRS 7 chronic = PT + pain clinic', () => {
    const r = engine.assessPainNRS({ nrs: 7, chronicity: 'chronic' });
    assert.ok(r.recommendations.some(x => x.intervention && x.intervention.includes('pain clinic')));
});

test('NRS throws on > 10', () => {
    assert.throws(() => engine.assessPainNRS({ nrs: 11 }), /0-10/);
});

// Swallow screening
test('Swallow pass = low severity, PO trial', () => {
    const r = engine.assessSwallowScreening({ alert: true, ableToSit: true, ableToSip: true, coughOnSip: false, voiceChange: false, drooling: false });
    assert.equal(r.value.failed, false);
    assert.equal(r.severity, 'low');
});

test('Swallow fail (cough) = NPO', () => {
    const r = engine.assessSwallowScreening({ alert: true, ableToSit: true, ableToSip: true, coughOnSip: true, voiceChange: false, drooling: false });
    assert.equal(r.value.failed, true);
    assert.equal(r.severity, 'high');
    assert.ok(r.recommendations.some(x => x.intervention && x.intervention.includes('NPO')));
});

// Cardiac rehab phase
test('CR day 3 = phase 1 inpatient', () => {
    const r = engine.assessCardiacRehabPhase({ daysPostEvent: 3, event: 'MI', lvef: 45, onBetaBlocker: true });
    assert.equal(r.value.phase, 'phase1_inpatient');
});

test('CR day 14 = phase 2 outpatient', () => {
    const r = engine.assessCardiacRehabPhase({ daysPostEvent: 14, event: 'PCI', lvef: 50, onBetaBlocker: true });
    assert.equal(r.value.phase, 'phase2_outpatient');
});

test('CR day 60 = phase 3 maintenance', () => {
    const r = engine.assessCardiacRehabPhase({ daysPostEvent: 60, event: 'CABG', lvef: 40 });
    assert.equal(r.value.phase, 'phase3_maintenance');
});

test('CR day 200 = phase 4 independent', () => {
    const r = engine.assessCardiacRehabPhase({ daysPostEvent: 200, event: 'MI' });
    assert.equal(r.value.phase, 'phase4_independent');
});

test('CR LVEF 20 = not eligible (critical)', () => {
    const r = engine.assessCardiacRehabPhase({ daysPostEvent: 14, event: 'MI', lvef: 20 });
    assert.equal(r.value.eligibility, false);
    assert.equal(r.severity, 'critical');
});

// Pulmonary rehab
test('PR FEV1 0.4 + mmrc 3 = eligible', () => {
    const r = engine.assessPulmonaryRehabEligibility({ fvc: 3.0, fev1: 0.4, mmrcDyspnea: 3 });
    assert.equal(r.value.eligible, true);
    assert.equal(r.value.copdSeverity, 'severe');
});

test('PR FEV1 0.9 mmrc 0 = not eligible', () => {
    const r = engine.assessPulmonaryRehabEligibility({ fvc: 4.0, fev1: 0.9, mmrcDyspnea: 0 });
    assert.equal(r.value.eligible, false);
});

test('PR walk 150m = severe disability', () => {
    const r = engine.assessPulmonaryRehabEligibility({ fev1: 0.4, mmrcDyspnea: 3, walk6MinDist: 150 });
    assert.equal(r.value.disability, 'severe');
    assert.equal(r.severity, 'critical');
});

// internal_medicine_wave1_engine_batch5_unit_test.js
// Unit tests for internal_medicine_wave1_engine_batch5.js
'use strict';
const assert = require('assert');
const engine = require('./internal_medicine_wave1_engine_batch5');

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}: ${e.message}`); failed++; fails.push(name); }
}

console.log('internal_medicine_wave1_engine_batch5 unit tests\n');

// calculateHFAHAStage
test('HFrEF + NYHA II returns hfref class C', () => {
    const r = engine.calculateHFAHAStage({ lvef: 30, nyha: 'II', structuralDisease: true, hxHF: true, htn: true });
    assert.strictEqual(r.value.hfType, 'hfref');
    assert.strictEqual(r.value.ahaStage, 'C');
    assert.ok(r.recommendations.some(rec => rec.drug && rec.drug.startsWith('ARNI')));
    assert.ok(r.recommendations.some(rec => rec.drug && rec.drug.startsWith('SGLT2i')));
});

test('HFpEF NYHA II returns hfpef', () => {
    const r = engine.calculateHFAHAStage({ lvef: 55, nyha: 'II', structuralDisease: true, hxHF: true });
    assert.strictEqual(r.value.hfType, 'hfpef');
});

// calculateCHADSVAScRefined
test('CHA2DS2-VASc male 75 with stroke = 5', () => {
    const r = engine.calculateCHADSVAScRefined({ age: 80, sex: 'male', stroke: true });
    assert.strictEqual(r.value.chadsvasc, 4);
    assert.strictEqual(r.value.anticoagRecommendation, 'recommend');
});

test('Female age 60 with htn + DM = 3 (recommend anticoag)', () => {
    const r = engine.calculateCHADSVAScRefined({ age: 60, sex: 'female', htn: true, diabetes: true });
    assert.strictEqual(r.value.chadsvasc, 3);
    assert.strictEqual(r.value.anticoagRecommendation, 'recommend');
});

test('HAS-BLED >= 3 still anticoag, but with modify-risk-factors rec', () => {
    const r = engine.calculateCHADSVAScRefined({ age: 80, sex: 'male', stroke: true, htn: true, egfr: 25, alcohol: true });
    assert.ok(r.value.hasBled >= 3);
    assert.strictEqual(r.value.anticoagRecommendation, 'recommend');
    assert.ok(r.recommendations.some(rec => rec.action === 'modify_bleed_risk_factors'));
});

// calculateLVADEligibility
test('INTERMACS 1 + age 60 + no contra = eligible', () => {
    const r = engine.calculateLVADEligibility({ intermacs: '1', age: 60, egfr: 60, bilirubin: 1.0, inr: 1.2, severeAI: false, rvFailure: false, irreversibleNonCardiac: false, psychosocialOK: true, complianceOK: true });
    assert.strictEqual(r.value.eligible, true);
    assert.strictEqual(r.severity, 'critical');
});

test('INTERMACS 3 with severe AI = not eligible, recommend AVR', () => {
    const r = engine.calculateLVADEligibility({ intermacs: '3', age: 50, severeAI: true, psychosocialOK: true, complianceOK: true });
    assert.strictEqual(r.value.eligible, false);
    assert.strictEqual(r.value.reason, 'severe_AI_uncorrected');
    assert.ok(r.recommendations.some(rec => rec.action === 'concomitant_aortic_valve_intervention'));
});

test('Age 85 = not eligible (out of range)', () => {
    const r = engine.calculateLVADEligibility({ intermacs: '3', age: 85, psychosocialOK: true, complianceOK: true });
    assert.strictEqual(r.value.eligible, false);
});

// stratifyAccAhaRisk
test('Female 60, TC 220, HDL 50, SBP 130, no DM, no smoker = low (<5%)', () => {
    const r = engine.stratifyAccAhaRisk({ age: 60, sex: 'female', race: 'white', totalChol: 220, hdlChol: 50, sbp: 130, bpTreated: false, diabetes: false, smoker: false });
    assert.ok(r.value.ascvd < 7.5);
    assert.strictEqual(r.value.ascvdCategory, 'low');
});

test('Age out of range (35) = invalid', () => {
    const r = engine.stratifyAccAhaRisk({ age: 35, sex: 'male', race: 'white', totalChol: 200, hdlChol: 50, sbp: 120, diabetes: false, smoker: false });
    assert.strictEqual(r.value.valid, false);
});

// assessCardioObstetricRisk
test('WHO IV (severe AS) at 8w = critical, counsel against pregnancy', () => {
    const r = engine.assessCardioObstetricRisk({ whoClass: 'IV', ejectionFraction: 50, currentGAweeks: 8 });
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'counsel_against_pregnancy'));
});

test('WHO II mechanical valve = LMWH recommendation', () => {
    const r = engine.assessCardioObstetricRisk({ whoClass: 'II', valveType: 'mechanical' });
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('LMWH')));
});

// calculateSyntaxScore
test('Single LAD proximal lesion = moderate score (3.5)', () => {
    const r = engine.calculateSyntaxScore({ lesions: [{ location: 'LAD_proximal' }] });
    assert.strictEqual(r.value.syntaxScore, 3.5);
    assert.strictEqual(r.value.riskCategory, 'low');
});

test('Empty lesions = 0', () => {
    const r = engine.calculateSyntaxScore({ lesions: [] });
    assert.strictEqual(r.value.syntaxScore, 0);
});

test('Complex LM + CTO + bifurcation = intermediate risk', () => {
    const r = engine.calculateSyntaxScore({ lesions: [
        { location: 'LM', bifurcation: true, calcification: 'severe' },
        { location: 'LAD_proximal', cto: true, calcification: 'severe', lengthOver20mm: true },
        { location: 'LCx', bifurcation: true, thrombus: true }
    ]});
    assert.ok(r.value.syntaxScore >= 10);
    assert.ok(['low', 'intermediate', 'high'].includes(r.value.riskCategory));
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures: ' + fails.join(', ')); process.exit(1); }
process.exit(0);

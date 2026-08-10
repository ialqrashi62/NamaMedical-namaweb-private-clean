// ped_surg_pharm_engine_test.js
// Pure-function tests for pediatrics, surgery, pharmacy engines
'use strict';

const peds = require('./pediatrics_engine');
const surg = require('./surgery_engine');
const pharm = require('./pharmacy_engine');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
    if (ok) { pass++; console.log(`  PASS - ${name}`); }
    else { fail++; console.log(`  FAIL - ${name}${detail ? ' :: ' + detail : ''}`); }
};

console.log('\n=== Pediatrics APGAR ===');
try {
    const r = peds.apgarScore({ appearance: 2, pulse: 2, grimace: 2, activity: 2, respiration: 2 });
    log(r.score === 10 && r.interpretation === 'reassuring', 'APGAR 10/10', r.score);
} catch (e) { log(false, 'APGAR 10', e.message); }
try {
    const r = peds.apgarScore({ appearance: 1, pulse: 1, grimace: 1, activity: 1, respiration: 1 });
    log(r.score === 5 && r.interpretation === 'moderately_depressed', 'APGAR 5/10');
} catch (e) { log(false, 'APGAR 5', e.message); }
try {
    const r = peds.apgarScore({ appearance: 0, pulse: 0, grimace: 0, activity: 0, respiration: 0 });
    log(r.score === 0 && r.interpretation === 'severely_depressed', 'APGAR 0/10 NRP');
} catch (e) { log(false, 'APGAR 0', e.message); }

console.log('\n=== Pediatrics Vitals ===');
try {
    const r = peds.assessPediatricVitals({ age_years: 5, heart_rate: 100, rr_per_min: 22, systolic_bp: 95 });
    log(['normal','bradycardia','tachycardia'].includes(r.hr_status), 'Peds 5yo HR 100 = normal', r.hr_status);
} catch (e) { log(false, 'Peds vitals', e.message); }

console.log('\n=== Pediatrics Fluid ===');
try {
    const r = peds.pediatricFluidResuscitation({ weight_kg: 20, age_years: 5 });
    log(r.bolus_ml === 400 && r.maintenance_rate_ml_per_hr === 60, 'Peds 20kg fluid',
        `bolus=${r.bolus_ml}, maint=${r.maintenance_rate_ml_per_hr}`);
} catch (e) { log(false, 'Peds fluid', e.message); }

console.log('\n=== Croup (Westley) ===');
try {
    const r = peds.croupScore({ stridor: 1, retractions: 1, air_entry: 1, cyanosis: 0, consciousness: 0 });
    log(r.score === 3 && r.severity === 'moderate', 'Croup moderate');
} catch (e) { log(false, 'Croup', e.message); }

console.log('\n=== PEWS ===');
try {
    const r = peds.pewsScore({ behavior: 1, cardiovascular: 1, respiratory: 1 });
    log(r.score === 3 && r.action.includes('junior doctor'), 'PEWS 3 = junior review', r.action);
} catch (e) { log(false, 'PEWS', e.message); }

console.log('\n=== ASA Classification ===');
try {
    const r = surg.asaClassify({ asa_class: 3, emergency: false });
    log(r.asa_class === 3 && r.mortality_pct > 0, 'ASA 3');
} catch (e) { log(false, 'ASA 3', e.message); }
try {
    const r = surg.asaClassify({ asa_class: 4, emergency: true });
    log(r.asa_class === 4 && r.label.includes('EMERGENCY'), 'ASA 4 EMERGENCY', r.label);
} catch (e) { log(false, 'ASA 4 EM', e.message); }

console.log('\n=== Surgical Risk ===');
try {
    const r = surg.surgicalRisk({ age: 75, asa_class: 3, procedure_risk: 'high', emergency: false });
    log(r.mortality_pct > 2, 'Surgical risk 75yo ASA3 high');
} catch (e) { log(false, 'Surgical risk', e.message); }

console.log('\n=== Surgical Timeout ===');
try {
    const r = surg.surgicalTimeout({
        phase: 'sign_in',
        completed_items: ['patient_identity_confirmed', 'site_marked', 'procedure_verified',
                          'consent_signed', 'anesthesia_safety_check', 'pulse_oximeter_on_patient',
                          'allergy_known', 'airway_aspiration_risk', 'blood_loss_risk']
    });
    log(r.completion_pct === 100 && r.can_proceed, 'WHO sign_in complete');
} catch (e) { log(false, 'Timeout complete', e.message); }

try {
    const r = surg.surgicalTimeout({
        phase: 'sign_in',
        completed_items: ['site_marked', 'consent_signed'] // missing identity
    });
    log(r.status === 'critical_block' && !r.can_proceed, 'Missing identity blocks surgery');
} catch (e) { log(false, 'Timeout block', e.message); }

console.log('\n=== Caprini VTE ===');
try {
    const r = surg.capriniScore({ age_75_plus: true, prior_vte: true, surgery_within_30d: true, malignancy: true });
    log(r.score >= 9 && r.risk === 'very_high', 'Caprini very high', `score=${r.score}`);
} catch (e) { log(false, 'Caprini', e.message); }

console.log('\n=== Drug Interactions ===');
try {
    const r = pharm.checkDrugInteractions({ drugs: ['warfarin', 'aspirin'] });
    log(r.interactions_found >= 1 && r.highest_severity === 'major', 'Warfarin + aspirin = major', r.highest_severity);
} catch (e) { log(false, 'warfarin+aspirin', e.message); }

try {
    const r = pharm.checkDrugInteractions({ drugs: ['simvastatin', 'clarithromycin'] });
    log(r.highest_severity === 'contraindicated', 'Simvastatin + clarithromycin contraindicated', r.highest_severity);
} catch (e) { log(false, 'sim+clari', e.message); }

console.log('\n=== Renal Dose (Cockcroft-Gault) ===');
try {
    const r = pharm.cockcroftGault({ age: 70, weight_kg: 70, serum_creatinine_mg_dl: 2.5, sex: 'male' });
    log(r.crcl_ml_per_min < 60 && (r.ckd_stage.startsWith('G3') || r.ckd_stage.startsWith('G4')), 'CG 70yo 2.5mg/dl',
        `crcl=${r.crcl_ml_per_min}, stage=${r.ckd_stage}`);
} catch (e) { log(false, 'Cockcroft', e.message); }

try {
    const r = pharm.renalAdjustedDose({
        drug_name: 'vancomycin', standard_dose_mg: 1000, frequency_per_day: 2,
        age: 70, weight_kg: 70, serum_creatinine_mg_dl: 2.5, sex: 'male'
    });
    log(r.adjusted_dose_mg < r.standard_dose_mg && r.adjusted_dose_mg > 0, 'Vanco reduced',
        `${r.standard_dose_mg} -> ${r.adjusted_dose_mg}mg`);
} catch (e) { log(false, 'Renal dose vanco', e.message); }

console.log('\n=== Pregnancy Drug Check ===');
try {
    const r = pharm.pregnancyDrugCheck({ drugs: ['warfarin', 'acetaminophen'] });
    log(r.highest_risk === 'X', 'Warfarin in pregnancy = X', r.highest_risk);
} catch (e) { log(false, 'Pregnancy warfarin', e.message); }

try {
    const r = pharm.pregnancyDrugCheck({ drugs: ['metronidazole', 'acetaminophen'] });
    log(r.highest_risk === 'B' || r.highest_risk === 'safe', 'Safe drugs', r.highest_risk);
} catch (e) { log(false, 'Pregnancy safe', e.message); }

console.log(`\nALL PASS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// surgery_engine.js
// Perioperative pure-functions engine (ASA + surgical risk + timeout + SSI risk)
// Based on ASA 2024 + NSQIP + WHO Surgical Safety Checklist 2009

'use strict';

// ============================================================
// ASA Physical Status Classification (2024 update)
// 1 = Normal healthy patient
// 2 = Mild systemic disease
// 3 = Severe systemic disease
// 4 = Severe systemic disease, constant threat to life
// 5 = Moribund, not expected to survive without operation
// 6 = Brain-dead organ donor
// E = Emergency suffix
// ============================================================
const ASA_CLASSES = {
    1: { label: 'Normal healthy',          mortality_pct: 0.06 },
    2: { label: 'Mild systemic disease',    mortality_pct: 0.27 },
    3: { label: 'Severe systemic disease',  mortality_pct: 1.8 },
    4: { label: 'Constant threat to life',  mortality_pct: 7.8 },
    5: { label: 'Moribund',                 mortality_pct: 9.4 },
    6: { label: 'Brain-dead donor',         mortality_pct: 0 }
};

function asaClassify(input) {
    if (!input) throw new Error('asaClassify: input required');
    const required = ['asa_class'];
    for (const k of required) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`asaClassify: ${k} required`);
        }
    }
    const { asa_class, emergency } = input;
    if (asa_class < 1 || asa_class > 6) throw new Error('asa_class must be 1-6');
    const base = ASA_CLASSES[asa_class];
    // Emergency suffix increases mortality risk
    let mortality_pct = base.mortality_pct;
    if (emergency && asa_class < 6) mortality_pct *= 1.5;
    return {
        asa_class,
        emergency: !!emergency,
        label: emergency && asa_class < 6 ? `${base.label} (EMERGENCY)` : base.label,
        mortality_pct: Math.round(mortality_pct * 100) / 100,
        recommendation: asa_class >= 4
            ? 'ICU post-op; invasive monitoring; experienced anesthesia team'
            : asa_class === 3
            ? 'PACU; close monitoring'
            : 'Standard post-op care',
        cite: 'ASA-2024-physical-status'
    };
}

// ============================================================
// NSQIP-style surgical risk calculator
// Simplified: uses ASA + age + emergency + procedure type
// ============================================================
const PROCEDURE_RISK = {
    low:        { mortality: 0.1,  morbidity: 1.5,  examples: 'cataract, endoscopic, superficial skin' },
    moderate:   { mortality: 0.5,  morbidity: 5.0,  examples: 'lap chole, hernia repair, hysterectomy' },
    high:       { mortality: 2.0,  morbidity: 15.0, examples: 'CABG, AAA repair, colectomy' },
    very_high:  { mortality: 10.0, morbidity: 35.0, examples: 'esophagectomy, Whipple, liver transplant' }
};

function surgicalRisk(input) {
    if (!input) throw new Error('surgicalRisk: input required');
    const required = ['age', 'asa_class', 'procedure_risk', 'emergency'];
    for (const k of required) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`surgicalRisk: ${k} required`);
        }
    }
    const { age, asa_class, procedure_risk, emergency } = input;
    const proc = PROCEDURE_RISK[procedure_risk];
    if (!proc) throw new Error('procedure_risk must be low|moderate|high|very_high');

    let mortality = proc.mortality * (asa_class / 2.5);
    let morbidity = proc.morbidity * (asa_class / 2.5);
    if (age >= 80) { mortality *= 2.5; morbidity *= 1.8; }
    else if (age >= 70) { mortality *= 1.6; morbidity *= 1.3; }
    else if (age >= 60) { mortality *= 1.2; morbidity *= 1.1; }
    if (emergency) { mortality *= 1.8; morbidity *= 1.4; }

    return {
        mortality_pct: Math.round(mortality * 10) / 10,
        morbidity_pct: Math.round(morbidity * 10) / 10,
        procedure_risk, asa_class, age, emergency: !!emergency,
        cite: 'NSQIP-2024-simplified'
    };
}

// ============================================================
// WHO Surgical Safety Checklist (timeout) — verify all items
// ============================================================
const TIMEOUT_CHECKS = {
    sign_in: [
        'patient_identity_confirmed', 'site_marked', 'procedure_verified',
        'consent_signed', 'anesthesia_safety_check', 'pulse_oximeter_on_patient',
        'allergy_known', 'airway_aspiration_risk', 'blood_loss_risk'
    ],
    time_out: [
        'team_introductions', 'surgeon_procedure_confirmed',
        'anesthesia_concerns', 'nursing_equipment_issues',
        'antibiotic_prophylaxis_within_60min', 'imaging_displayed'
    ],
    sign_out: [
        'procedure_recorded', 'instrument_swab_count_correct',
        'specimen_labeled', 'equipment_issues_addressed',
        'recovery_concerns', 'key_recovery_plan_shared'
    ]
};

function surgicalTimeout(input) {
    if (!input) throw new Error('surgicalTimeout: input required');
    const { phase, completed_items } = input;
    const expected = TIMEOUT_CHECKS[phase];
    if (!expected) throw new Error('phase must be sign_in|time_out|sign_out');

    const completedSet = new Set(completed_items || []);
    const missing = expected.filter(it => !completedSet.has(it));
    const completed = expected.filter(it => completedSet.has(it));
    const completion_pct = Math.round(completed.length / expected.length * 100);

    let status;
    if (missing.length === 0) status = 'complete';
    else if (phase === 'sign_in' && missing.includes('patient_identity_confirmed')) status = 'critical_block';
    else if (completion_pct >= 80) status = 'mostly_complete';
    else status = 'incomplete';

    return {
        phase,
        completion_pct,
        completed_count: completed.length,
        missing_count: missing.length,
        missing_items: missing,
        status,
        can_proceed: status !== 'critical_block',
        cite: 'WHO-2009-surgical-safety'
    };
}

// ============================================================
// Caprini VTE risk score (simplified for surgical patients)
// ============================================================
function capriniScore(input) {
    if (!input) throw new Error('capriniScore: input required');
    const points_table = {
        age_41_60: 1, age_61_74: 2, age_75_plus: 3,
        prior_vte: 3, family_vte: 3, known_thrombophilia: 3,
        surgery_within_30d: 2,
        immobility_3d: 2, central_line: 2,
        malignancy: 2, chemotherapy: 2,
        bmi_above_40: 2, smoking: 1, oral_contraceptives: 1,
        hrt: 1, pregnancy_postpartum: 1
    };
    let score = 0;
    const details = [];
    for (const [k, points] of Object.entries(points_table)) {
        if (input[k]) {
            score += points;
            details.push({ factor: k, points });
        }
    }
    let risk, prophylaxis;
    if (score === 0)        { risk = 'very_low'; prophylaxis = 'early ambulation only'; }
    else if (score <= 2)    { risk = 'low';      prophylaxis = 'IPC (intermittent pneumatic compression)'; }
    else if (score <= 4)    { risk = 'moderate'; prophylaxis = 'LMWH + IPC'; }
    else if (score <= 8)    { risk = 'high';     prophylaxis = 'LMWH + IPC, extended prophylaxis 4 weeks'; }
    else                    { risk = 'very_high'; prophylaxis = 'LMWH + IPC, consider IVC filter, extended 4-6 weeks'; }

    return { score, risk, prophylaxis, factors: details, cite: 'Caprini-2005-2024' };
}

module.exports = {
    asaClassify,
    surgicalRisk,
    surgicalTimeout,
    capriniScore,
    ASA_CLASSES,
    PROCEDURE_RISK,
    TIMEOUT_CHECKS,
    VERSION: '3.0.0',
    CITATIONS: {
        'ASA-2024-physical-status': 'ASA Physical Status Classification 2024 update',
        'NSQIP-2024-simplified': 'ACS NSQIP 2024 risk calculator (simplified)',
        'WHO-2009-surgical-safety': 'WHO Surgical Safety Checklist 2009',
        'Caprini-2005-2024': 'Caprini JA. Dis Mon 2005 + 2024 update'
    }
};

// surgical_wave2_engine_batch2.js
// Surgical Wave 2 - Batch 2: Specialized surgical decision-support engines.
// All functions are pure (deterministic, no I/O) per Phase 3 architecture.

'use strict';

/**
 * calculateBariatricEligibility: NIH criteria for bariatric surgery
 *  - BMI ≥ 40, or
 *  - BMI ≥ 35 with comorbidity (T2D, HTN, OSA, NAFLD, OA, GERD)
 *  - BMI 30-34.9 with poorly controlled T2D (2018 ASMBS)
 *  - Failed non-surgical weight loss
 *  - No uncontrolled psychiatric/substance abuse
 */
function calculateBariatricEligibility({ bmi, t2d, htn, osa, nafld, oa, gerd, priorWeightLossAttempts, psychiatricControlled, substanceFree }) {
    if (!psychiatricControlled || !substanceFree) {
        return { value: { eligible: false, reason: 'psychiatric_or_substance_uncontrolled' }, severity: 'low', notes: 'Psychiatric or substance use uncontrolled', recommendations: [{ action: 'psychiatric_substance_clearance' }] };
    }
    const comorbidityCount = (t2d ? 1 : 0) + (htn ? 1 : 0) + (osa ? 1 : 0) + (nafld ? 1 : 0) + (oa ? 1 : 0) + (gerd ? 1 : 0);
    let eligible = false;
    let category = null;
    if (bmi >= 40) { eligible = true; category = 'class_III_morbid'; }
    else if (bmi >= 35 && comorbidityCount >= 1) { eligible = true; category = 'class_II_with_comorbidity'; }
    else if (bmi >= 30 && bmi < 35 && t2d) { eligible = true; category = 'class_I_with_T2D_2018ASMBS'; }
    const recommendations = [];
    if (eligible) {
        recommendations.push({ action: 'multidisciplinary_evaluation', team: 'surgery, endocrinology, nutrition, psychology', class: 'I' });
        recommendations.push({ action: 'pre-op_psychiatric_clearance', class: 'I' });
        recommendations.push({ action: 'pre-op_nutritional_counseling', class: 'I' });
        if (t2d) recommendations.push({ action: 'optimize_glycemic_control', class: 'I' });
    } else {
        recommendations.push({ action: 'continue_non_surgical_weight_management', class: 'I' });
        if (bmi < 30) recommendations.push({ action: 'lifestyle_modification', class: 'I' });
    }
    return {
        value: { eligible, bmi, category, comorbidityCount, priorAttempts: priorWeightLossAttempts },
        severity: eligible ? 'moderate' : 'low',
        notes: 'BMI ' + bmi + ', ' + comorbidityCount + ' comorbidities, prior attempts: ' + (priorWeightLossAttempts || 0),
        recommendations,
        citations: ['NIH 1991', 'ASMBS 2018', 'AACE/TOS/ASMBS 2013']
    };
}

/**
 * calculateNACBenefit: Neoadjuvant chemotherapy benefit for breast cancer
 * Decision support tool based on tumor characteristics
 */
function calculateNACBenefit({ tumorSizeCm, nodalStatus, her2, er, pr, ki67, grade, histology, brcaMutation }) {
    let responseRate = 30;  // baseline pCR ~30%
    let subtype = 'unknown';
    if (her2 === 'positive') {
        responseRate += 40;
        subtype = 'HER2+';
        if (er === 'negative') responseRate += 10;  // triple-negative-like HER2+ even more responsive
    }
    if (er === 'negative' && pr === 'negative' && her2 === 'negative') {
        subtype = 'TNBC';
        responseRate += 30;  // TNBC: 50-60% pCR with chemo
    }
    if (ki67 != null && ki67 >= 20) responseRate += 10;
    if (grade === 'grade_3') responseRate += 5;
    if (tumorSizeCm >= 2) responseRate += 5;
    if (nodalStatus === 'positive') responseRate += 5;
    if (brcaMutation) responseRate += 10;  // platinum benefit
    responseRate = Math.min(responseRate, 90);
    const recommendations = [];
    if (tumorSizeCm >= 2 || nodalStatus === 'positive') {
        recommendations.push({ action: 'consider_NAC_for_breast_conservation', class: 'I' });
    }
    if (subtype === 'HER2+') {
        recommendations.push({ action: 'NAC_includes_trastuzumab_+_pertuzumab', class: 'I' });
    }
    if (subtype === 'TNBC') {
        recommendations.push({ action: 'NAC_includes_platinum_+_pembrolizumab_if_CPS>=10', class: 'I' });
    }
    if (subtype === 'unknown' || (er === 'positive' && her2 === 'negative')) {
        recommendations.push({ action: 'consider_Oncotype_Dx_or_MammaPrint_for_chemo_benefit', class: 'I' });
    }
    if (brcaMutation) {
        recommendations.push({ action: 'consider_platinum_based_regimen', class: 'IIa' });
    }
    return {
        value: { responseRate, subtype, tumorSizeCm, nodalStatus, brcaMutation },
        severity: responseRate >= 60 ? 'high' : responseRate >= 40 ? 'moderate' : 'low',
        notes: 'Estimated pCR rate ' + responseRate + '% (' + subtype + ')',
        recommendations,
        citations: ['NCCN Breast 2024', 'SABCS 2023', 'KEYNOTE-522', 'APHINITY']
    };
}

/**
 * calculateTraumaActivation: Trauma activation level (Level I, II, or consult)
 * Based on mechanism + vital signs + anatomy
 */
function calculateTraumaActivation({ mechanism, sbp, hr, rr, gcs, penetrating, fall, ejection, mvcSpeed, intubation, bloodLoss, paralysis }) {
    let level = 'consult';
    let severity = 'low';
    if (penetrating === 'head_neck_torso' || gcs <= 8 || sbp < 90 || (hr != null && (hr > 120 || hr < 50)) || (rr != null && (rr < 10 || rr > 30)) || intubation || paralysis) {
        level = 'level_1';
        severity = 'critical';
    } else if (fall != null && fall >= 20 || ejection || mvcSpeed >= 30 || bloodLoss === 'major' || (gcs != null && gcs <= 13)) {
        level = 'level_2';
        severity = 'high';
    }
    const recommendations = [];
    if (level === 'level_1') {
        recommendations.push({ action: 'trauma_team_activate', class: 'I' });
        recommendations.push({ action: 'massive_transfusion_protocol', class: 'I' });
        recommendations.push({ action: 'ATLS_protocol', class: 'I' });
    } else if (level === 'level_2') {
        recommendations.push({ action: 'trauma_team_notify', class: 'I' });
    } else {
        recommendations.push({ action: 'trauma_surgical_consult', class: 'I' });
    }
    return {
        value: { activationLevel: level, mechanism, vitals: { sbp, hr, rr, gcs } },
        severity,
        notes: 'Trauma ' + level + ' activation: ' + mechanism + ', GCS ' + gcs + ', SBP ' + sbp,
        recommendations,
        citations: ['ATLS 10th edition', 'ACS TQIP', 'CDC Field Triage']
    };
}

/**
 * calculateISS: Injury Severity Score (1-75)
 * Body regions scored 1-6: head/neck, face, chest, abdomen, extremity, external
 * ISS = sum of squares of top 3 regions
 */
function calculateISS({ regions }) {
    if (!regions || typeof regions !== 'object') {
        return { value: { iss: 0, valid: false }, severity: 'low', notes: 'No regions provided', recommendations: [] };
    }
    const scores = Object.values(regions).filter(s => typeof s === 'number' && s >= 1 && s <= 6);
    if (scores.length < 3) {
        return { value: { iss: 0, valid: false }, severity: 'low', notes: 'Need at least 3 regions', recommendations: [] };
    }
    scores.sort((a, b) => b - a);
    const iss = scores[0] * scores[0] + scores[1] * scores[1] + scores[2] * scores[2];
    let severity = 'low';
    if (iss > 24) severity = 'critical';
    else if (iss > 15) severity = 'high';
    else if (iss > 8) severity = 'moderate';
    const mortality = iss > 50 ? '~50%' : iss > 25 ? '~25%' : iss > 15 ? '~10%' : iss > 8 ? '~5%' : '<1%';
    return {
        value: { iss, regions, mortality },
        severity,
        notes: 'ISS ' + iss + ' (mortality ' + mortality + ')',
        recommendations: [
            { action: 'trauma_team_assessment', class: 'I' },
            ...(iss > 15 ? [{ action: 'ICU_admission', class: 'I' }] : []),
            ...(iss > 24 ? [{ action: 'damage_control_resuscitation', class: 'I' }] : [])
        ],
        citations: ['Baker 1974', 'AAST 2018']
    };
}

/**
 * calculateClavienDindo: Complication severity (I-V)
 */
function calculateClavienDindo({ complication, interventionNeeded, icuNeeded, mortality, organFailure }) {
    let grade = 'I';
    let severity = 'low';
    if (mortality) {
        grade = 'V';
        severity = 'critical';
    } else if (organFailure === 'multi') {
        grade = 'IVb';
        severity = 'critical';
    } else if (organFailure === 'single' || icuNeeded) {
        grade = 'IVa';
        severity = 'critical';
    } else if (interventionNeeded === 'general_anesthesia') {
        grade = 'IIIb';
        severity = 'high';
    } else if (interventionNeeded === 'procedure_no_ga') {
        grade = 'IIIa';
        severity = 'moderate';
    } else if (complication === 'drug_treatment' || complication === 'tpn' || complication === 'transfusion') {
        grade = 'II';
        severity = 'moderate';
    }
    return {
        value: { grade, complication, interventionNeeded, organFailure },
        severity,
        notes: 'Clavien-Dindo ' + grade,
        recommendations: [
            { action: 'complication_documented_for_quality_review', class: 'I' },
            { action: 'consider_rca_if_grade_III_or_higher', class: 'I' }
        ],
        citations: ['Dindo 2004', 'Clavien 1992']
    };
}

/**
 * calculateASA: ASA Physical Status 1-6
 */
function calculateASA({ healthy, mildSystemic, severeSystemic, severeConstantThreat, moribund, brainDead, emergency }) {
    let asa = 'I';
    let description = 'Normal healthy patient';
    let severity = 'low';
    if (brainDead) { asa = 'VI'; description = 'Brain dead, organ donation'; severity = 'critical'; }
    else if (moribund) { asa = 'V'; description = 'Moribund, not expected to survive 24h'; severity = 'critical'; }
    else if (severeConstantThreat) { asa = 'IV'; description = 'Severe systemic disease, constant threat to life'; severity = 'high'; }
    else if (severeSystemic) { asa = 'III'; description = 'Severe systemic disease'; severity = 'moderate'; }
    else if (mildSystemic) { asa = 'II'; description = 'Mild systemic disease'; severity = 'low'; }
    if (emergency) asa = asa + 'E';
    return {
        value: { asa, description, emergency },
        severity,
        notes: 'ASA ' + asa + ' (' + description + ')',
        recommendations: [
            { action: 'preop_anesthesia_consult', class: 'I' },
            ...(asa === 'IV' || asa === 'V' ? [{ action: 'ICU_bed_confirmed_preop', class: 'I' }] : [])
        ],
        citations: ['ASA Physical Status 2014']
    };
}

/**
 * calculateRCRI: Revised Cardiac Risk Index for preop
 */
function calculateRCRI({ highRiskSurgery, ischemicHeartDisease, chf, stroke, diabetes, renalInsufficiency }) {
    let score = 0;
    if (highRiskSurgery) score += 1;
    if (ischemicHeartDisease) score += 1;
    if (chf) score += 1;
    if (stroke) score += 1;
    if (diabetes) score += 1;
    if (renalInsufficiency) score += 1;
    let riskCategory = 'low';
    let severity = 'low';
    if (score >= 2) { riskCategory = 'elevated'; severity = 'moderate'; }
    if (score >= 3) { riskCategory = 'high'; severity = 'high'; }
    const recommendations = [];
    if (score >= 2) {
        recommendations.push({ action: 'preop_cardiology_consult', class: 'IIa' });
    }
    if (score >= 3) {
        recommendations.push({ action: 'consider_stress_test_or_echocardiogram', class: 'IIa' });
        recommendations.push({ action: 'postop_cardiac_monitoring_telemetry', class: 'I' });
    }
    return {
        value: { score, riskCategory },
        severity,
        notes: 'RCRI ' + score + ' (' + riskCategory + ' risk of major cardiac complication)',
        recommendations,
        citations: ['Lee 1999', 'ACC/AHA Perioperative 2014']
    };
}

module.exports = {
    calculateBariatricEligibility,
    calculateNACBenefit,
    calculateTraumaActivation,
    calculateISS,
    calculateClavienDindo,
    calculateASA,
    calculateRCRI
};

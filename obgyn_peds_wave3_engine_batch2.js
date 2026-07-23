// obgyn_peds_wave3_engine_batch2.js
// OBGYN & Pediatrics Wave 3 - Batch 2: Maternal-Fetal Medicine, Prenatal Diagnosis, Gyn Onc, Peds scoring
'use strict';

/**
 * calculateEDDFromLMP: Naegele's rule for estimated date of delivery
 */
function calculateEDDFromLMP({ lmpDate }) {
    if (!lmpDate) return { value: { edd: null, valid: false }, severity: 'low', notes: 'No LMP provided', recommendations: [] };
    const lmp = new Date(lmpDate);
    if (isNaN(lmp.getTime())) return { value: { edd: null, valid: false }, severity: 'low', notes: 'Invalid LMP date', recommendations: [] };
    const edd = new Date(lmp);
    edd.setDate(edd.getDate() + 280);
    return {
        value: { edd: edd.toISOString().slice(0, 10), lmp: lmpDate, gaAtEDD: '40w0d' },
        severity: 'low',
        notes: 'EDD by Naegele: ' + edd.toISOString().slice(0, 10) + ' (40w0d from LMP)',
        recommendations: [{ action: 'confirm_with_first_trimester_US', class: 'I' }]
    };
}

/**
 * calculateGestationalAgeFromUS: GA by ultrasound (Hadlock formula or CRL-based)
 */
function calculateGAFromUS({ crl_mm, biparietalDiameter_mm, femurLength_mm, abdominalCircumference_mm, usDate, lmpDate }) {
    if (crl_mm != null && crl_mm >= 1 && crl_mm <= 90) {
        const gaDays = 56 + 4.5 * Math.sqrt(crl_mm);
        const gaWeeks = Math.floor(gaDays / 7);
        const gaDaysRem = Math.round(gaDays - gaWeeks * 7);
        return { value: { gaWeeks, gaDays: gaDaysRem, totalDays: Math.round(gaDays), method: 'CRL_Hadlock' }, severity: 'low', notes: 'GA by CRL: ' + gaWeeks + 'w ' + gaDaysRem + 'd', recommendations: [] };
    }
    if (biparietalDiameter_mm != null) {
        const gaWeeks = Math.round((biparietalDiameter_mm - 13) / 2.5) + 12;
        return { value: { gaWeeks, method: 'BPD' }, severity: 'low', notes: 'GA by BPD: ' + gaWeeks + 'w', recommendations: [] };
    }
    if (femurLength_mm != null) {
        const gaWeeks = Math.round(femurLength_mm / 1.5);
        return { value: { gaWeeks, method: 'FL' }, severity: 'low', notes: 'GA by FL: ' + gaWeeks + 'w', recommendations: [] };
    }
    return { value: { ga: null, valid: false }, severity: 'low', notes: 'No biometric data', recommendations: [{ action: 'use_first_trimester_CRL' }] };
}

/**
 * assessPreEclampsia: ACOG 2020 / ISSHP
 * Severe features: SBP >= 160, DBP >= 110, platelets < 100, Cr > 1.1, AST/ALT > 2x normal, pulmonary edema, neurological symptoms
 */
function assessPreEclampsia({ sbp, dbp, proteinuria, platelets, creatinine, ast, alt, neurologicalSymptoms, pulmonaryEdema, gestationalAgeWeeks, priorPreEclampsia }) {
    let diagnosis = 'normal';
    let severity = 'low';
    if ((sbp >= 140 || dbp >= 90) && (gestationalAgeWeeks >= 20)) {
        diagnosis = proteinuria ? 'preeclampsia' : 'gestational_HTN';
        severity = 'moderate';
    }
    let severeFeatures = [];
    if (sbp >= 160) severeFeatures.push('severe_HTN_SBP');
    if (dbp >= 110) severeFeatures.push('severe_HTN_DBP');
    if (platelets != null && platelets < 100) severeFeatures.push('thrombocytopenia');
    if (creatinine != null && creatinine > 1.1) severeFeatures.push('renal_dysfunction');
    if (ast != null && ast > 70) severeFeatures.push('elevated_AST');
    if (alt != null && alt > 70) severeFeatures.push('elevated_ALT');
    if (neurologicalSymptoms) severeFeatures.push('neuro_symptoms');
    if (pulmonaryEdema) severeFeatures.push('pulmonary_edema');
    if (severeFeatures.length > 0) {
        diagnosis = 'preeclampsia_with_severe_features';
        severity = 'critical';
    }
    if (sbp >= 160 && dbp >= 110 && neurologicalSymptoms) diagnosis = 'eclampsia_risk';
    const recommendations = [];
    if (diagnosis === 'preeclampsia_with_severe_features') {
        recommendations.push({ action: 'admit_LD', class: 'I' });
        recommendations.push({ action: 'magnesium_sulfate_seizure_prophylaxis', class: 'I' });
        recommendations.push({ action: 'antihypertensive_below_160_110', drug: 'labetalol/hydralazine/nifedipine', class: 'I' });
        recommendations.push({ action: 'betamethasone_if_<34w', class: 'I' });
        if (gestationalAgeWeeks >= 34) recommendations.push({ action: 'deliver', class: 'I' });
    } else if (diagnosis === 'preeclampsia') {
        recommendations.push({ action: 'close_followup_2x_weekly', class: 'I' });
        recommendations.push({ action: 'low-dose_aspirin_prevention', class: 'I' });
    }
    if (priorPreEclampsia) {
        recommendations.push({ action: 'low_dose_aspirin_initiated_<16w_for_prevention', class: 'I' });
    }
    return {
        value: { diagnosis, severeFeatures, sbp, dbp, gestationalAgeWeeks },
        severity,
        notes: diagnosis + (severeFeatures.length ? ' (severe features: ' + severeFeatures.join(', ') + ')' : ''),
        recommendations,
        citations: ['ACOG 2020', 'ISSHP 2018']
    };
}

/**
 * assessIVFCycleOutcome: Cycle characteristics predicting IVF success (SART/CDC)
 */
function assessIVFCycleOutcome({ age, amh, antralFollicleCount, priorCycles, priorLiveBirths, partnerSpermAnalysis, dayOfTransfer, embryosTransferred, blastocystStage }) {
    let successRate = 35;  // baseline per cycle for women <35
    if (age >= 35) successRate -= 5;
    if (age >= 38) successRate -= 10;
    if (age >= 40) successRate -= 15;
    if (age >= 42) successRate -= 20;
    if (amh != null && amh < 1) successRate -= 10;
    else if (amh != null && amh >= 3) successRate += 5;
    if (antralFollicleCount != null && antralFollicleCount < 5) successRate -= 10;
    else if (antralFollicleCount != null && antralFollicleCount >= 15) successRate += 5;
    if (priorLiveBirths >= 1) successRate += 10;
    if (priorCycles > 3 && priorLiveBirths === 0) successRate -= 10;
    if (embryosTransferred >= 2) successRate += 5;  // but increased multiples
    if (blastocystStage) successRate += 5;
    successRate = Math.max(5, Math.min(60, successRate));
    const multipleGestationRisk = embryosTransferred >= 2 ? 'high (15-30% twins)' : 'low (<2% twins)';
    const recommendations = [];
    if (age >= 40) recommendations.push({ action: 'consider_PGT-A_embryo_screening', class: 'IIa' });
    if ((antralFollicleCount != null && antralFollicleCount < 5) || (amh != null && amh < 0.5)) recommendations.push({ action: 'consider_donor_oocytes', class: 'IIa' });
    if (embryosTransferred >= 2) recommendations.push({ action: 'counsel_multiple_gestation_risk', class: 'I' });
    if (blastocystStage) recommendations.push({ action: 'single_embryo_transfer_recommended_per_ASRM', class: 'I' });
    return {
        value: { successRate, multipleGestationRisk, age, amh, antralFollicleCount },
        severity: successRate >= 30 ? 'moderate' : successRate >= 15 ? 'high' : 'critical',
        notes: 'Estimated live birth per cycle: ' + successRate + '%, multiple risk: ' + multipleGestationRisk,
        recommendations,
        citations: ['SART', 'ASRM guidelines', 'CDC ART Report']
    };
}

/**
 * assessAdolescentGyneProblem: Workup of adolescent GYN complaint
 *  - Primary amenorrhea: no menses by 15 (or 3y post-thelarche)
 *  - Secondary amenorrhea: no menses for 3+ months after menarche
 *  - Dysmenorrhea primary vs secondary
 *  - PCOS Rotterdam criteria in adolescents
 */
function assessAdolescentGyneProblem({ age, menarcheAge, lastPeriod, cycleRegularity, hirsutism, acne, bmi, hyperandrogenism, oligomenorrheaMonths }) {
    const recommendations = [];
    let diagnosis = 'normal';
    let severity = 'low';
    if (!lastPeriod && age >= 15) {
        diagnosis = 'primary_amenorrhea';
        severity = 'moderate';
        recommendations.push({ action: 'karyotype', class: 'I' });
        recommendations.push({ action: 'pelvic_US', class: 'I' });
        recommendations.push({ action: 'FSH_LH_prolactin_TSH', class: 'I' });
    } else if (oligomenorrheaMonths >= 3) {
        diagnosis = 'secondary_amenorrhea';
        severity = 'moderate';
        recommendations.push({ action: 'pregnancy_test_first', class: 'I' });
        recommendations.push({ action: 'TSH_prolactin_FSH_LH', class: 'I' });
    } else if (cycleRegularity === 'irregular' && (hirsutism || acne || bmi >= 25) && menarcheAge && (age - menarcheAge) >= 2) {
        diagnosis = 'PCOS_suspect_Rotterdam';
        severity = 'moderate';
        recommendations.push({ action: 'free_androgen_index', class: 'I' });
        recommendations.push({ action: 'pelvic_US_ovarian_morphology', class: 'I' });
        recommendations.push({ action: 'glucose_lipid_screen', class: 'I' });
    } else if (cycleRegularity === 'irregular') {
        diagnosis = 'immature_HPO_axis';
        severity = 'low';
        recommendations.push({ action: 'reassurance_followup_2y_post_menarche', class: 'I' });
    }
    if (age < 9 && lastPeriod) {
        diagnosis = 'precocious_puberty';
        severity = 'high';
        recommendations.push({ action: 'GnRH_stimulation_test', class: 'I' });
        recommendations.push({ action: 'bone_age', class: 'I' });
        recommendations.push({ action: 'brain_MRI', class: 'I' });
    }
    return {
        value: { diagnosis, age, menarcheAge, lastPeriod, cycleRegularity },
        severity,
        notes: diagnosis,
        recommendations,
        citations: ['ASRM', 'AAP Adolescent', 'NASPGHAN']
    };
}

/**
 * assessPedsDehydration: Pediatric dehydration severity
 *  - Mild: 3-5% (infants) or 3-4% (children) fluid loss
 *  - Moderate: 6-9% (infants) or 6-8% (children)
 *  - Severe: >=10% (infants) or >=9% (children)
 */
function assessPedsDehydration({ weightLossPercent, ageMonths, capillaryRefillSec, skinTurgor, mucousMembranes, tears, mentalStatus, urineOutput }) {
    let severity = 'mild';
    let fluidDeficit = 0;
    if (ageMonths < 12) {
        if (weightLossPercent < 5) severity = 'mild';
        else if (weightLossPercent < 10) severity = 'moderate';
        else severity = 'severe';
    } else {
        if (weightLossPercent < 4) severity = 'mild';
        else if (weightLossPercent < 9) severity = 'moderate';
        else severity = 'severe';
    }
    const redFlags = [];
    if (capillaryRefillSec >= 3) redFlags.push('capillary_refill_>=3s');
    if (skinTurgor === 'very_reduced') redFlags.push('very_reduced_turgor');
    if (mucousMembranes === 'dry') redFlags.push('dry_mucous_membranes');
    if (tears === 'absent') redFlags.push('no_tears');
    if (mentalStatus === 'lethargic' || mentalStatus === 'comatose') redFlags.push('altered_mental_status');
    if (urineOutput === 'anuric') redFlags.push('anuria');
    const severeSymptoms = redFlags.length >= 2;
    if (severeSymptoms && severity !== 'severe') severity = 'severe';
    fluidDeficit = weightLossPercent * 10;  // mL/kg
    const recommendations = [];
    if (severity === 'severe') {
        recommendations.push({ action: 'IV_fluid_resuscitation_20_mL/kg_bolus', class: 'I' });
        recommendations.push({ action: 'admit', class: 'I' });
        recommendations.push({ action: 'check_electrolytes_especially_Na_K', class: 'I' });
    } else if (severity === 'moderate') {
        recommendations.push({ action: 'oral_rehydration_solution_ORS', class: 'I' });
        recommendations.push({ action: 'reassess_4h', class: 'I' });
    } else {
        recommendations.push({ action: 'oral_rehydration_continue_breastfeeding', class: 'I' });
        recommendations.push({ action: 'followup_24h', class: 'I' });
    }
    return {
        value: { severity, fluidDeficit, redFlags, severeSymptoms },
        severity: severity === 'severe' ? 'critical' : severity === 'moderate' ? 'moderate' : 'low',
        notes: severity + ' dehydration (' + fluidDeficit + ' mL/kg deficit)' + (redFlags.length ? '; red flags: ' + redFlags.join(', ') : ''),
        recommendations,
        citations: ['AAP', 'WHO Plan A/B/C', 'ESPGHAN 2014']
    };
}

/**
 * assessPEWSPediatric: Pediatric Early Warning Score (PEWS) for inpatient deterioration
 */
function assessPEWSPediatric({ ageYears, behavior, cardiovascular, respiratory }) {
    // behavior: 0 (playing) to 3 (lethargic)
    // cardiovascular: 0 (pink, cap refill <2s) to 3 (gray, mottled, cap refill >5s)
    // respiratory: 0 (within normal, no retractions) to 3 (severe distress, RR > 70 or < 10)
    const total = behavior + cardiovascular + respiratory;
    let severity = 'low';
    let riskCategory = 'low_risk';
    if (total >= 4) { severity = 'moderate'; riskCategory = 'high_risk'; }
    if (total >= 6) { severity = 'high'; riskCategory = 'critical'; }
    if (total >= 8) { severity = 'critical'; }
    const recommendations = [];
    if (total >= 4) {
        recommendations.push({ action: 'increase_observation_frequency_q1h', class: 'I' });
        recommendations.push({ action: 'notify_pediatric_attending', class: 'I' });
    }
    if (total >= 6) {
        recommendations.push({ action: 'rapid_response_team_PICU_consult', class: 'I' });
        recommendations.push({ action: 'consider_transfer_to_PICU', class: 'IIa' });
    }
    if (total >= 8) {
        recommendations.push({ action: 'emergent_PICU_transfer', class: 'I' });
    }
    return {
        value: { total, riskCategory, subscores: { behavior, cardiovascular, respiratory } },
        severity,
        notes: 'PEWS ' + total + ' (' + riskCategory + ')',
        recommendations,
        citations: ['Monaghan 2005', 'AHRQ PEWS']
    };
}

module.exports = {
    calculateEDDFromLMP,
    calculateGAFromUS,
    assessPreEclampsia,
    assessIVFCycleOutcome,
    assessAdolescentGyneProblem,
    assessPedsDehydration,
    assessPEWSPediatric
};

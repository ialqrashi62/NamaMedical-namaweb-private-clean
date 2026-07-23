// critical_care_wave5_engine_batch2.js
// Critical Care Wave 5 - Batch 2: Sepsis, sedation, mechanical ventilation, transfusion
'use strict';

/**
 * calculateSOFA: Sequential Organ Failure Assessment (per Vincent 1996, Singer 2016)
 * 6 organ systems, each scored 0-4. Total 0-24.
 */
function calculateSOFA({ pao2Fio2, platelets, bilirubin, map, dopamine, dobutamine, epinephrine, norepinephrine, gcs, creatinine, urineOutput24h }) {
    let score = 0;
    // Respiratory
    if (pao2Fio2 != null) {
        if (pao2Fio2 >= 400) score += 0;
        else if (pao2Fio2 >= 300) score += 1;
        else if (pao2Fio2 >= 200) score += 2;
        else if (pao2Fio2 >= 100) score += 3;
        else score += 4;
    }
    // Coagulation
    if (platelets != null) {
        if (platelets >= 150) score += 0;
        else if (platelets >= 100) score += 1;
        else if (platelets >= 50) score += 2;
        else if (platelets >= 20) score += 3;
        else score += 4;
    }
    // Liver
    if (bilirubin != null) {
        if (bilirubin < 1.2) score += 0;
        else if (bilirubin < 2.0) score += 1;
        else if (bilirubin < 6.0) score += 2;
        else if (bilirubin < 12.0) score += 3;
        else score += 4;
    }
    // Cardiovascular
    if (map != null && !dopamine && !dobutamine && !epinephrine && !norepinephrine) {
        if (map >= 70) score += 0;
        else score += 1;
    } else if (dopamine != null && dopamine <= 5 || dobutamine) {
        score += 2;
    } else if (dopamine > 5 || epinephrine <= 0.1 || norepinephrine <= 0.1) {
        score += 3;
    } else if (dopamine > 15 || epinephrine > 0.1 || norepinephrine > 0.1) {
        score += 4;
    }
    // CNS
    if (gcs != null) {
        if (gcs >= 15) score += 0;
        else if (gcs >= 13) score += 1;
        else if (gcs >= 10) score += 2;
        else if (gcs >= 6) score += 3;
        else score += 4;
    }
    // Renal
    if (creatinine != null) {
        if (creatinine < 1.2) score += 0;
        else if (creatinine < 2.0) score += 1;
        else if (creatinine < 3.5) score += 2;
        else if (creatinine < 5.0) score += 3;
        else score += 4;
    }
    if (urineOutput24h != null) {
        if (urineOutput24h < 500) score = Math.max(score, 3);
        if (urineOutput24h < 200) score = Math.max(score, 4);
    }
    let mortality = '<10%';
    if (score >= 6) mortality = '~20%';
    if (score >= 9) mortality = '~40%';
    if (score >= 12) mortality = '~60%';
    if (score >= 15) mortality = '~80%';
    if (score >= 18) mortality = '>90%';
    const recommendations = [];
    if (score >= 6) recommendations.push({ action: 'consider_transfer_to_higher_acuity_unit', class: 'IIa' });
    if (score >= 9) {
        recommendations.push({ action: 'multidisciplinary_ICU_review', class: 'I' });
        recommendations.push({ action: 'consider_septic_workup_if_infection_suspected', class: 'I' });
    }
    if (score >= 12) {
        recommendations.push({ action: 'goals_of_care_discussion', class: 'I' });
        recommendations.push({ action: 'consider_care_limitations_if_severe', class: 'IIa' });
    }
    return {
        value: { sofaScore: score, mortality },
        severity: score >= 12 ? 'critical' : score >= 6 ? 'high' : score >= 3 ? 'moderate' : 'low',
        notes: 'SOFA ' + score + ' (mortality ' + mortality + ')',
        recommendations,
        citations: ['Vincent 1996', 'Sepsis-3 2016']
    };
}

/**
 * assessRASS: Richmond Agitation-Sedation Scale
 *  - +4 Combative
 *  - +3 Very agitated
 *  - +2 Agitated
 *  - +1 Restless
 *  - 0 Alert and calm
 *  - -1 Drowsy
 *  - -2 Light sedation
 *  - -3 Moderate sedation
 *  - -4 Deep sedation
 *  - -5 Unarousable
 */
function assessRASS({ rassScore, onVentilator }) {
    let target;
    let severity = 'low';
    if (rassScore >= 3) { target = 'consider_sedation_decrease'; severity = 'high'; }
    else if (rassScore === 2) { target = 'consider_sedation_decrease'; severity = 'moderate'; }
    else if (rassScore === 1) { target = 'maintain_current'; severity = 'low'; }
    else if (rassScore === 0) { target = 'maintain_current'; severity = 'low'; }
    else if (rassScore === -1) { target = 'maintain_current'; severity = 'low'; }
    else if (rassScore === -2) { target = onVentilator ? 'optimal_for_ventilator' : 'maintain_current'; severity = 'low'; }
    else if (rassScore === -3) { target = onVentilator ? 'consider_lightening' : 'oversedated'; severity = 'moderate'; }
    else if (rassScore === -4) { target = 'oversedated_assess_cause'; severity = 'high'; }
    else if (rassScore === -5) { target = 'oversedated_arousal_assessment'; severity = 'critical'; }
    const recommendations = [];
    if (rassScore <= -3 && onVentilator) {
        recommendations.push({ action: 'daily_sedation_holiday', class: 'I' });
        recommendations.push({ action: 'consider_dexmedetomidine_over_benzodiazepine', class: 'IIa' });
    }
    if (rassScore >= 2) {
        recommendations.push({ action: 'evaluate_for_delirium_pain_hypoxia', class: 'I' });
    }
    if (rassScore <= -4) {
        recommendations.push({ action: 'rule_out_oversedation_complications', class: 'I' });
    }
    return {
        value: { rassScore, target, onVentilator },
        severity,
        notes: 'RASS ' + rassScore + ' (' + target + ')',
        recommendations,
        citations: ['Sessler 2002', 'ICU Liberation']
    };
}

/**
 * calculateVentSettings: Lung-protective ventilation
 *  - TV 6-8 mL/kg PBW
 *  - Plateau < 30
 *  - Driving pressure < 15
 *  - PEEP/FiO2 per ARDSnet table
 */
function calculateVentSettings({ sex, heightCm, currentTV, currentPEEP, currentFiO2, plateauPressure, mode, diagnosis }) {
    // PBW calculation (ARDSnet)
    let pbw;
    if (sex === 'male') pbw = 50 + 0.91 * (heightCm - 152.4);
    else pbw = 45.5 + 0.91 * (heightCm - 152.4);
    const targetTVLow = pbw * 6;
    const targetTVHigh = pbw * 8;
    let lungProtective = 'optimal';
    if (currentTV > targetTVHigh * 1.1) lungProtective = 'too_high_risk_volutrauma';
    else if (currentTV < targetTVLow * 0.9) lungProtective = 'too_low_possible_atelectasis';
    else lungProtective = 'optimal';
    // Driving pressure
    let drivingPressure = plateauPressure ? (plateauPressure - currentPEEP) : null;
    let dpOptimal = true;
    if (drivingPressure > 15) dpOptimal = false;
    // ARDS severity
    let ardsSeverity = null;
    if (diagnosis === 'ARDS' || diagnosis === 'ards') {
        // Would need P/F ratio, not passed here; placeholder
    }
    const recommendations = [];
    if (lungProtective === 'too_high_risk_volutrauma') {
        recommendations.push({ action: 'reduce_TV_to_' + Math.round(targetTVHigh) + '_mL', class: 'I' });
    }
    if (drivingPressure != null && drivingPressure > 15) {
        recommendations.push({ action: 'reduce_Vt_or_increase_PEEP_to_lower_driving_pressure', class: 'I' });
    }
    if (currentFiO2 > 0.6) {
        recommendations.push({ action: 'optimize_PEEP_recruitment', class: 'I' });
    }
    recommendations.push({ action: 'PBW_' + Math.round(pbw) + '_kg_TV_target_6-8_mL/kg', class: 'I' });
    return {
        value: { pbw: Math.round(pbw), targetTVRange: [Math.round(targetTVLow), Math.round(targetTVHigh)], currentTV, drivingPressure, lungProtective, dpOptimal },
        severity: lungProtective !== 'optimal' || !dpOptimal ? 'high' : 'low',
        notes: 'PBW ' + Math.round(pbw) + ' kg, target TV ' + Math.round(targetTVLow) + '-' + Math.round(targetTVHigh) + ' mL, current ' + currentTV + ' mL (' + lungProtective + ')' + (drivingPressure ? ', driving P ' + drivingPressure : ''),
        recommendations,
        citations: ['ARDSnet 2000', 'Amato 2015 (driving pressure)']
    };
}

/**
 * assessTransfusion: Restrictive vs liberal transfusion threshold
 *  - Hb < 7 g/dL: transfuse most patients
 *  - Hb < 8 g/dL: ACS, postop cardiac surgery
 *  - Hb < 10 g/dL: acute MI, unstable angina
 */
function assessTransfusion({ hemoglobin, clinicalContext, activeBleeding, symptoms, platelets, fibrinogen, inr, pltTarget, pltCount }) {
    let transfusionThreshold;
    let severity = 'low';
    if (clinicalContext === 'ACS' || clinicalContext === 'acute_MI' || clinicalContext === 'unstable_angina') {
        transfusionThreshold = 10;
        if (hemoglobin < 10) severity = 'critical';
        else if (hemoglobin < 11) severity = 'high';
    } else if (clinicalContext === 'sepsis') {
        transfusionThreshold = 7;
        if (hemoglobin < 7) severity = 'critical';
    } else if (clinicalContext === 'postop_cardiac') {
        transfusionThreshold = 8;
        if (hemoglobin < 8) severity = 'high';
    } else if (clinicalContext === 'upper_GI_bleed') {
        transfusionThreshold = 7;
        if (hemoglobin < 7) severity = 'critical';
    } else {
        // General restrictive
        transfusionThreshold = 7;
        if (hemoglobin < 7) severity = 'critical';
    }
    if (activeBleeding === 'massive') {
        transfusionThreshold = 8;
        if (hemoglobin < 8) severity = 'critical';
    }
    let transfusionRecommended = hemoglobin < transfusionThreshold;
    const recommendations = [];
    if (transfusionRecommended) {
        recommendations.push({ action: 'transfuse_pRBC', target: transfusionThreshold, class: 'I' });
    } else {
        recommendations.push({ action: 'no_transfusion_threshold_not_met', class: 'I' });
    }
    if (platelets != null && platelets < (pltTarget || 50)) {
        if (activeBleeding) recommendations.push({ action: 'transfuse_platelets', class: 'I' });
    }
    if (inr != null && inr > 1.5 && activeBleeding) {
        recommendations.push({ action: 'transfuse_FFP_or_4F_PCC', class: 'I' });
    }
    if (fibrinogen != null && fibrinogen < 1.5 && activeBleeding) {
        recommendations.push({ action: 'transfuse_cryoprecipitate', class: 'I' });
    }
    return {
        value: { transfusionRecommended, transfusionThreshold, hemoglobin, clinicalContext, activeBleeding },
        severity,
        notes: 'Hb ' + hemoglobin + ', threshold ' + transfusionThreshold + ' for ' + (clinicalContext || 'general') + (transfusionRecommended ? ' → TRANSFUSE' : ' → no transfusion needed'),
        recommendations,
        citations: ['TRICC 1999', 'TRISS 2014', 'TRANSFUSE 2017']
    };
}

/**
 * calculateNutrition: ICU nutrition screening
 *  - NRS-2002 (Nutritional Risk Screening)
 *  - NUTRIC score for ICU
 *  - ASPEN/SCCM guidelines: 25-30 kcal/kg/day, 1.2-2.0 g protein/kg/day
 */
function calculateNutrition({ bmi, weightKg, age, heightCm, sex, apache, sofa, numComorbidities, daysHospitalizedPreICU, ventilated, immuneCompromised, calDelivered, proteinDelivered }) {
    const bmiClass = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese';
    let idealBodyWeight, adjustedWeight;
    if (heightCm && sex) {
        const heightInches = heightCm / 2.54;
        idealBodyWeight = sex === 'male' ? 50 + 2.3 * (heightInches - 60) : 45.5 + 2.3 * (heightInches - 60);
        adjustedWeight = bmi < 30 ? weightKg : idealBodyWeight + 0.4 * (weightKg - idealBodyWeight);
    } else {
        // Fallback: rough estimate
        idealBodyWeight = weightKg;
        adjustedWeight = bmi < 30 ? weightKg : weightKg * 0.7;
    }
    const targetKcal = adjustedWeight * 25;  // basal
    const targetProtein = adjustedWeight * 1.5;
    const calPct = calDelivered ? (calDelivered / targetKcal * 100) : 0;
    const proteinPct = proteinDelivered ? (proteinDelivered / targetProtein * 100) : 0;
    let severity = 'low';
    if (calPct < 60) severity = 'high';
    if (calPct < 30) severity = 'critical';
    if (calPct >= 80) severity = 'low';
    const recommendations = [];
    if (calPct < 60) {
        recommendations.push({ action: 'increase_enteral_feeding_rate', class: 'I' });
        recommendations.push({ action: 'consider_parenteral_nutrition_if_6th_day', class: 'IIa' });
    }
    if (proteinPct < 60) {
        recommendations.push({ action: 'increase_protein_intake_target_' + Math.round(targetProtein) + 'g/day', class: 'I' });
    }
    if (bmi < 18.5) recommendations.push({ action: 'high_protein_high_calorie_nutrition', class: 'I' });
    return {
        value: { bmiClass, targetKcal: Math.round(targetKcal), targetProtein: Math.round(targetProtein), calPct: Math.round(calPct), proteinPct: Math.round(proteinPct) },
        severity,
        notes: 'BMI ' + bmi + ' (' + bmiClass + '); cal delivered ' + Math.round(calPct) + '% of target, protein ' + Math.round(proteinPct) + '%',
        recommendations,
        citations: ['ASPEN/SCCM 2016', 'NRS-2002', 'NUTRIC score']
    };
}

module.exports = {
    calculateSOFA,
    assessRASS,
    calculateVentSettings,
    assessTransfusion,
    calculateNutrition
};

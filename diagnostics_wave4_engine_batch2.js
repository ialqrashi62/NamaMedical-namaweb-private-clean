// diagnostics_wave4_engine_batch2.js
// Diagnostics Wave 4 - Batch 2: Radiology AI interpretation, lab interpretation, PFT, ECG, sleep
'use strict';

/**
 * interpretBIRADS: Breast Imaging Reporting and Data System (BI-RADS) 5th ed
 *  - 0: Incomplete (needs additional imaging)
 *  - 1: Negative (routine screening)
 *  - 2: Benign (routine screening)
 *  - 3: Probably benign (6-month follow-up)
 *  - 4: Suspicious (biopsy)
 *    - 4A: Low suspicion
 *    - 4B: Moderate
 *    - 4C: High
 *  - 5: Highly suggestive of malignancy (biopsy + treatment)
 *  - 6: Known biopsy-proven malignancy
 */
function interpretBIRADS({ birads, massSizeMm, massShape, massMargin, calcifications, associatedFeatures, axillaryLymphNodes }) {
    let management;
    let riskMalignancy;
    let severity = 'low';
    switch (String(birads)) {
        case '0': management = 'additional_imaging_required'; riskMalignancy = 'unknown'; severity = 'moderate'; break;
        case '1': management = 'continue_routine_screening'; riskMalignancy = '~0%'; break;
        case '2': management = 'continue_routine_screening'; riskMalignancy = '~0%'; break;
        case '3': management = '6_month_followup'; riskMalignancy = '<=2%'; severity = 'low'; break;
        case '4A': management = 'tissue_diagnosis_biopsy'; riskMalignancy = '2-10%'; severity = 'moderate'; break;
        case '4B': management = 'tissue_diagnosis_biopsy'; riskMalignancy = '10-50%'; severity = 'moderate'; break;
        case '4C': management = 'tissue_diagnosis_biopsy'; riskMalignancy = '50-95%'; severity = 'high'; break;
        case '5': management = 'tissue_diagnosis_biopsy_treatment_planning'; riskMalignancy = '>95%'; severity = 'critical'; break;
        case '6': management = 'treatment_planning_known_malignancy'; riskMalignancy = '100%'; severity = 'critical'; break;
        default: management = 'invalid_birads'; riskMalignancy = 'unknown';
    }
    const recommendations = [];
    recommendations.push({ action: management, class: 'I' });
    if (['4A', '4B', '4C', '5'].includes(String(birads))) {
        recommendations.push({ action: 'core_needle_biopsy', class: 'I' });
        if (axillaryLymphNodes === 'suspicious') recommendations.push({ action: 'axillary_US_+_FNA_if_suspicious', class: 'I' });
    }
    return {
        value: { birads, management, riskMalignancy, massSizeMm, massShape, massMargin },
        severity,
        notes: 'BI-RADS ' + birads + ' (' + riskMalignancy + ' malignancy risk)',
        recommendations,
        citations: ['ACR BI-RADS 5th ed', 'ACR Appropriateness Criteria']
    };
}

/**
 * interpretBacterialSensitivities: Antibiogram interpretation
 * S = Susceptible, I = Intermediate, R = Resistant
 */
function interpretBacterialSensitivities({ organism, sensitivities, source, patientAllergies, renalFunction }) {
    const susceptibleDrugs = [];
    const intermediateDrugs = [];
    const resistantDrugs = [];
    for (const s of sensitivities) {
        if (s.susceptibility === 'S') susceptibleDrugs.push(s.antibiotic);
        else if (s.susceptibility === 'I') intermediateDrugs.push(s.antibiotic);
        else if (s.susceptibility === 'R') resistantDrugs.push(s.antibiotic);
    }
    // Common empiric picks by source
    let empiricOptions = [];
    if (source === 'urine') {
        empiricOptions = ['nitrofurantoin', 'TMP-SMX', 'fosfomycin', 'ciprofloxacin'];
    } else if (source === 'blood') {
        empiricOptions = ['pip-tazo', 'meropenem', 'vancomycin', 'cefepime'];
    } else if (source === 'sputum') {
        empiricOptions = ['levofloxacin', 'ceftriaxone', 'azithromycin', 'cefepime'];
    } else if (source === 'wound') {
        empiricOptions = ['cefazolin', 'oxacillin', 'TMP-SMX', 'doxycycline'];
    }
    // Filter empiric options by actual susceptibility
    const suitableAntibiotics = empiricOptions.filter(d => susceptibleDrugs.includes(d) || intermediateDrugs.includes(d));
    // Exclude allergies
    const finalOptions = suitableAntibiotics.filter(d => !(patientAllergies || []).includes(d));
    // Renal dose adjustments needed
    const needRenalDose = (renalFunction != null && renalFunction.egfr < 60);
    const recommendations = [];
    if (finalOptions.length > 0) {
        recommendations.push({ action: 'deescalate_to_narrowest_spectrum', drug: finalOptions[0], class: 'I' });
        if (needRenalDose) recommendations.push({ action: 'adjust_dose_for_renal_function', class: 'I' });
    } else {
        recommendations.push({ action: 'broad_spectrum_continued', class: 'I' });
    }
    // Check for resistance patterns
    const mrsa = resistantDrugs.includes('oxacillin') || resistantDrugs.includes('cefazolin');
    const vre = organism === 'Enterococcus' && resistantDrugs.includes('vancomycin');
    const esbl = resistantDrugs.includes('ceftriaxone') && resistantDrugs.includes('cefepime') && resistantDrugs.includes('aztreonam');
    const cre = organism && (organism.includes('Klebsiella') || organism.includes('Enterobacter')) && resistantDrugs.includes('meropenem');
    let resistanceNotes = [];
    if (mrsa) resistanceNotes.push('MRSA pattern');
    if (vre) resistanceNotes.push('VRE');
    if (esbl) resistanceNotes.push('ESBL');
    if (cre) resistanceNotes.push('CRE');
    return {
        value: { organism, source, susceptible: susceptibleDrugs, intermediate: intermediateDrugs, resistant: resistantDrugs, recommended: finalOptions, needRenalDose, resistanceNotes },
        severity: resistanceNotes.includes('CRE') || resistanceNotes.includes('VRE') ? 'high' : 'moderate',
        notes: 'Organism ' + organism + ' from ' + source + (resistanceNotes.length ? ' (' + resistanceNotes.join(', ') + ')' : ''),
        recommendations,
        citations: ['CLSI M100', 'IDSA guidance', 'EUCAST']
    };
}

/**
 * interpretPFT: Pulmonary Function Test interpretation
 *  - Obstructive: FEV1/FVC < 0.70
 *  - Restrictive: TLC < 80% predicted (or FEV1/FVC normal/↑ with reduced FVC)
 *  - Mixed: both
 * Severity by FEV1 % predicted
 */
function interpretPFT({ fev1Actual, fev1Predicted, fvcActual, fvcPredicted, fev1FvcRatio, tlcActual, tlcPredicted, dlcoActual, dlcoPredicted, age, height, sex }) {
    const fev1Percent = (fev1Actual / fev1Predicted) * 100;
    const fvcPercent = (fvcActual / fvcPredicted) * 100;
    const tlcPercent = tlcActual && tlcPredicted ? (tlcActual / tlcPredicted) * 100 : null;
    const dlcoPercent = dlcoActual && dlcoPredicted ? (dlcoActual / dlcoPredicted) * 100 : null;
    let pattern = 'normal';
    let severity = 'low';
    let obstructionSeverity = null;
    if (fev1FvcRatio < 0.70) {
        pattern = 'obstructive';
        if (fev1Percent >= 80) obstructionSeverity = 'mild';
        else if (fev1Percent >= 50) obstructionSeverity = 'moderate';
        else if (fev1Percent >= 30) obstructionSeverity = 'severe';
        else obstructionSeverity = 'very_severe';
        severity = obstructionSeverity === 'very_severe' ? 'critical' : obstructionSeverity === 'severe' ? 'high' : obstructionSeverity === 'moderate' ? 'moderate' : 'low';
    } else if (tlcPercent != null && tlcPercent < 80) {
        pattern = 'restrictive';
        if (fvcPercent >= 70) severity = 'mild';
        else if (fvcPercent >= 60) severity = 'moderate';
        else if (fvcPercent >= 50) severity = 'severe';
        else severity = 'very_severe';
        if (severity === 'very_severe') severity = 'critical';
    } else if (fev1FvcRatio < 0.70 && tlcPercent != null && tlcPercent < 80) {
        pattern = 'mixed';
        severity = 'high';
    }
    const recommendations = [];
    if (pattern === 'obstructive') {
        recommendations.push({ action: 'bronchodilator_response_test', class: 'I' });
        if (obstructionSeverity === 'moderate' || obstructionSeverity === 'severe') {
            recommendations.push({ action: 'inhaled_LABA_LAMA_therapy', class: 'I' });
        }
        if (obstructionSeverity === 'very_severe') {
            recommendations.push({ action: 'consider_biologics_omalizumab_mepolizumab_etc', class: 'IIa' });
        }
    } else if (pattern === 'restrictive') {
        recommendations.push({ action: 'HRCT_chest', class: 'I' });
        recommendations.push({ action: 'pulmonology_consult', class: 'I' });
    }
    return {
        value: { pattern, severity: obstructionSeverity, fev1Percent: Math.round(fev1Percent), fvcPercent: Math.round(fvcPercent), tlcPercent: tlcPercent ? Math.round(tlcPercent) : null, dlcoPercent: dlcoPercent ? Math.round(dlcoPercent) : null },
        severity,
        notes: pattern + ' (' + severity + '); FEV1 ' + Math.round(fev1Percent) + '%, FVC ' + Math.round(fvcPercent) + '%' + (dlcoPercent ? ', DLCO ' + Math.round(dlcoPercent) + '%' : ''),
        recommendations,
        citations: ['ATS/ERS 2005 standardization', 'GOLD 2024']
    };
}

/**
 * interpretGCS: Glasgow Coma Scale (eye + verbal + motor)
 */
function interpretGCS({ eye, verbal, motor, intubated }) {
    let score;
    if (intubated) {
        // Use 1T for verbal (intubated patients cannot speak)
        const vScore = 1;
        score = (eye || 0) + vScore + (motor || 0);
    } else {
        score = (eye || 0) + (verbal || 0) + (motor || 0);
    }
    let severity = 'low';
    let interpretation;
    if (score <= 8) { severity = 'critical'; interpretation = 'severe_brain_injury_intubation_considered'; }
    else if (score <= 12) { severity = 'moderate'; interpretation = 'moderate_brain_injury'; }
    else if (score <= 14) { severity = 'low'; interpretation = 'mild_brain_injury'; }
    else { severity = 'low'; interpretation = 'normal_or_minor_injury'; }
    return {
        value: { score, eye, verbal, motor, intubated, interpretation },
        severity,
        notes: 'GCS ' + score + ' (' + interpretation + ')',
        recommendations: [
            ...(score <= 8 ? [{ action: 'intubate_if_not_already', class: 'I' }, { action: 'ICU_admission', class: 'I' }] : []),
            ...(score <= 12 ? [{ action: 'close_observation_serial_GCS', class: 'I' }] : []),
            { action: 'CT_head_if_trauma_or_focal_deficit', class: 'I' }
        ],
        citations: ['Teasdale 1974', 'Advanced Trauma Life Support']
    };
}

/**
 * interpretCardiacBiomarkers: Troponin, BNP, D-dimer
 * Returns clinical risk classification
 */
function interpretCardiacBiomarkers({ troponin, troponinUrl, bnp, ntProBnp, dDimer, age, egfr, presentation }) {
    const recommendations = [];
    const interpretations = [];
    let severity = 'low';
    // Troponin
    if (troponin != null) {
        if (troponin > 5) { interpretations.push('troponin_significantly_elevated'); severity = 'critical'; }
        else if (troponin > 0.04) { interpretations.push('troponin_elevated'); severity = 'high'; }
        else { interpretations.push('troponin_normal'); }
    }
    // BNP
    if (bnp != null) {
        if (bnp > 1000) { interpretations.push('BNP_significantly_elevated'); severity = 'critical'; }
        else if (bnp > 100) { interpretations.push('BNP_elevated'); severity = 'high'; }
        else { interpretations.push('BNP_normal'); }
    }
    if (ntProBnp != null) {
        const ageAdjusted = age >= 75 ? 1800 : age >= 50 ? 900 : 450;
        if (ntProBnp > ageAdjusted * 2) { interpretations.push('NT_proBNP_significantly_elevated'); severity = 'critical'; }
        else if (ntProBnp > ageAdjusted) { interpretations.push('NT_proBNP_elevated'); severity = 'high'; }
    }
    // D-dimer
    if (dDimer != null) {
        if (dDimer > 0.5) { interpretations.push('D_dimer_elevated'); if (severity === 'low') severity = 'moderate'; }
    }
    if (severity === 'critical') {
        recommendations.push({ action: 'emergent_cardiologist_consult', class: 'I' });
        if (presentation === 'chest_pain' && troponin > 0.04) {
            recommendations.push({ action: 'acute_coronary_syndrome_pathway', class: 'I' });
        }
    }
    if (severity === 'high' || (bnp > 500 && presentation === 'dyspnea')) {
        recommendations.push({ action: 'echocardiogram_within_24h', class: 'I' });
    }
    return {
        value: { interpretations, troponin, bnp, ntProBnp, dDimer },
        severity,
        notes: interpretations.join(', '),
        recommendations,
        citations: ['Fourth Universal Definition of MI 2018', 'AHA/ACC HF 2022']
    };
}

/**
 * interpretSleepStudy: Polysomnography summary
 * AHI classification: < 5 normal, 5-15 mild, 15-30 moderate, > 30 severe
 */
function interpretSleepStudy({ ahi, remAhi, nremAhi, supineAhi, odi, tst90, lowestSpO2, arousalIndex }) {
    let severity = 'normal';
    let diagnosis = 'normal';
    let treatmentRecommendation = 'no_treatment';
    if (ahi >= 5 && ahi < 15) { severity = 'mild'; diagnosis = 'mild_OSA'; treatmentRecommendation = 'lifestyle_modification_weight_loss_positional'; }
    else if (ahi >= 15 && ahi < 30) { severity = 'moderate'; diagnosis = 'moderate_OSA'; treatmentRecommendation = 'CPAP_PAP_therapy'; }
    else if (ahi >= 30) { severity = 'severe'; diagnosis = 'severe_OSA'; treatmentRecommendation = 'CPAP_PAP_therapy_titration'; }
    const recommendations = [];
    // Positional OSA: supine AHI 2x non-supine
    if (supineAhi != null && nremAhi != null && supineAhi / Math.max(1, nremAhi) > 2) {
        treatmentRecommendation = treatmentRecommendation + '_positional_therapy';
        recommendations.push({ action: 'positional_therapy', class: 'I' });
    }
    recommendations.push({ action: treatmentRecommendation, class: 'I' });
    if (lowestSpO2 < 80) recommendations.push({ action: 'supplemental_oxygen_with_PAP', class: 'IIa' });
    if (ahi >= 15) recommendations.push({ action: 'PAP_titration_study', class: 'I' });
    if (arousalIndex > 30) recommendations.push({ action: 'consider_alternative_causes_of_sleepiness', class: 'I' });
    return {
        value: { diagnosis, ahi, supineAhi, odi, lowestSpO2 },
        severity: severity === 'severe' ? 'critical' : severity === 'moderate' ? 'high' : severity === 'mild' ? 'moderate' : 'low',
        notes: diagnosis + ' (AHI ' + ahi + ', lowest SpO2 ' + lowestSpO2 + '%)',
        recommendations,
        citations: ['AASM Manual 2020', 'ICSD-3']
    };
}

module.exports = {
    interpretBIRADS,
    interpretBacterialSensitivities,
    interpretPFT,
    interpretGCS,
    interpretCardiacBiomarkers,
    interpretSleepStudy
};

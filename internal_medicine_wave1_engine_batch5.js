// internal_medicine_wave1_engine_batch5.js
// Internal Medicine Wave 1 - Batch 5: Advanced sub-specialty clinical engines.
// All functions are pure (deterministic, no I/O) per Phase 3 architecture.
// Each function returns { value, severity, notes, recommendations, citations } per the engine contract.

'use strict';

/**
 * calculateHFAHAStage: NYHA functional class + AHA HF stage mapping for HFrEF / HFmrEF / HFpEF
 * 4 NYHA classes (I-IV), 4 AHA stages (A-D)
 *  - Class I: No limitation
 *  - Class II: Slight limitation (comfortable at rest, ordinary activity → symptoms)
 *  - Class III: Marked limitation (less than ordinary activity → symptoms)
 *  - Class IV: Symptoms at rest
 *  - Stage A: At risk (no structural disease)
 *  - Stage B: Structural disease, no symptoms
 *  - Stage C: Structural disease, prior or current symptoms
 *  - Stage D: Refractory
 */
function calculateHFAHAStage({ lvef, nyha, structuralDisease, hxHF, htn, dm, cad }) {
    let hfType = 'hfpef';
    if (lvef != null) {
        if (lvef <= 40) hfType = 'hfref';
        else if (lvef <= 49) hfType = 'hfmref';
    }
    let ahaStage;
    if (hxHF) ahaStage = 'C';
    else if (structuralDisease) ahaStage = 'B';
    else ahaStage = 'A';
    let recommendations = [];
    if (hfType === 'hfref') {
        recommendations.push({ drug: 'ARNI (sacubitril/valsartan)', class: 'I', note: 'Replace ACEi/ARB' });
        recommendations.push({ drug: 'β-blocker (carvedilol/metoprolol succ/bisoprolol)', class: 'I' });
        recommendations.push({ drug: 'MRA (spironolactone/eplerenone)', class: 'I', note: 'K+ < 5.0, eGFR > 30' });
        recommendations.push({ drug: 'SGLT2i (dapagliflozin/empagliflozin)', class: 'I' });
    } else if (hfType === 'hfmref') {
        recommendations.push({ drug: 'Treat per HFrEF guidelines', class: 'IIa' });
    } else {
        recommendations.push({ drug: 'SGLT2i (empagliflozin)', class: 'I', note: 'HFpEF evidence' });
        recommendations.push({ drug: 'Treat comorbidities (HTN, AF, CAD, DM)', class: 'I' });
    }
    if (nyha === 'IV') ahaStage = 'D';
    return {
        value: { hfType, ahaStage, nyha, lvef },
        severity: nyha === 'IV' ? 'critical' : nyha === 'III' ? 'high' : nyha === 'II' ? 'moderate' : 'low',
        notes: 'HF staging: ' + hfType + ', AHA ' + ahaStage + ', NYHA ' + nyha,
        recommendations,
        citations: ['AHA/ACC 2022 HF Guideline', 'ESC HF Guidelines 2021']
    };
}

/**
 * calculateCHADSVAScRefined: CHA2DS2-VASc for AF stroke risk + HAS-BLED for bleed risk (parallel).
 * If HAS-BLED >= 3 → flag for caution; do not auto-contraindicate.
 */
function calculateCHADSVAScRefined({ age, sex, chf, htn, stroke, vascular, diabetes, lvef, egfr, hepaticDisease, priorBleeding, labileINR, drugs, alcohol }) {
    let chadsvasc = 0;
    if (chf) chadsvasc += 1;
    if (htn) chadsvasc += 1;
    if (age >= 75) chadsvasc += 2;
    else if (age >= 65) chadsvasc += 1;
    if (diabetes) chadsvasc += 1;
    if (stroke) chadsvasc += 2;
    if (vascular) chadsvasc += 1;
    if (sex === 'female') chadsvasc += 1;
    let hasBled = 0;
    if (htn) hasBled += 1;
    if (egfr != null && egfr < 30) hasBled += 1;  // renal disease
    if (hepaticDisease) hasBled += 1;
    if (stroke) hasBled += 1;
    if (priorBleeding) hasBled += 1;
    if (labileINR) hasBled += 1;
    if (age != null && age >= 65) hasBled += 1;
    if (drugs) hasBled += 1;  // antiplatelet/NSAID
    if (alcohol) hasBled += 1;
    let anticoagRecommendation = 'consider';
    if (sex === 'male' && chadsvasc >= 2) anticoagRecommendation = 'recommend';
    if (sex === 'male' && chadsvasc === 0) anticoagRecommendation = 'no_anticoagulation';
    if (sex === 'male' && chadsvasc === 1) anticoagRecommendation = 'shared_decision';
    if (sex === 'female' && chadsvasc >= 3) anticoagRecommendation = 'recommend';
    if (sex === 'female' && chadsvasc <= 1) anticoagRecommendation = 'no_anticoagulation';
    if (sex === 'female' && chadsvasc === 2) anticoagRecommendation = 'shared_decision';
    const doacPref = ['apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban'];
    let preferredDOAC = 'apixaban';
    if (egfr != null) {
        if (egfr < 15) preferredDOAC = 'warfarin';
        else if (egfr < 30) preferredDOAC = 'apixaban';
        else if (egfr < 50) preferredDOAC = 'edoxaban';
    }
    return {
        value: { chadsvasc, hasBled, anticoagRecommendation, preferredDOAC },
        severity: chadsvasc >= 4 ? 'high' : chadsvasc >= 2 ? 'moderate' : 'low',
        notes: 'CHA2DS2-VASc ' + chadsvasc + ' | HAS-BLED ' + hasBled + ' (>=3 = high bleed risk; modify risk factors, do not auto-contraindicate)',
        recommendations: [
            { action: anticoagRecommendation, drug: preferredDOAC, class: 'I' },
            ...(hasBled >= 3 ? [{ action: 'modify_bleed_risk_factors', class: 'IIa' }] : []),
            ...(lvef != null && lvef < 35 ? [{ action: 'rate_control_preferred', note: 'HFrEF: caution with rhythm control', class: 'IIa' }] : [])
        ],
        citations: ['ESC AF 2020', 'AHA/ACC/HRS AF 2023']
    };
}

/**
 * calculateLVADEligibility: LVAD candidate assessment (INTERMACS profile + contraindications)
 *  - INTERMACS 1-7 (1 = critical cardiogenic shock, 7 = advanced NYHA III)
 *  - Common contraindications: irreversible non-cardiac, severe aortic insufficiency, RV failure (right-only LVAD may fail)
 */
function calculateLVADEligibility({ intermacs, age, egfr, bilirubin, inr, severeAI, rvFailure, irreversibleNonCardiac, psychosocialOK, complianceOK }) {
    if (age < 18 || age > 80) {
        return { value: { eligible: false, reason: 'age_out_of_range' }, severity: 'low', notes: 'Age ' + age + ' outside 18-80 typical range', recommendations: [{ action: 'individualize_with_HT_team' }] };
    }
    if (irreversibleNonCardiac) {
        return { value: { eligible: false, reason: 'non_cardiac_contraindication' }, severity: 'low', notes: 'Irreversible non-cardiac comorbidity', recommendations: [] };
    }
    if (severeAI) {
        return { value: { eligible: false, reason: 'severe_AI_uncorrected' }, severity: 'moderate', notes: 'Severe AI — repair/AVR simultaneously', recommendations: [{ action: 'concomitant_aortic_valve_intervention' }] };
    }
    if (rvFailure) {
        return { value: { eligible: false, reason: 'rv_failure_consider_BiVAD' }, severity: 'high', notes: 'RV failure — BiVAD or total artificial heart', recommendations: [{ action: 'consider_BiVAD_TAH' }] };
    }
    if (!psychosocialOK || !complianceOK) {
        return { value: { eligible: false, reason: 'psychosocial_or_compliance' }, severity: 'low', notes: 'Psychosocial/compliance concern', recommendations: [{ action: 'social_work_psychiatry_consult' }] };
    }
    let organDysfunction = false;
    if (egfr != null && egfr < 30) organDysfunction = true;
    if (bilirubin != null && bilirubin > 3) organDysfunction = true;
    if (inr != null && inr > 2.5) organDysfunction = true;
    const eligible = ['1', '2', '3', '4', '5', '6', '7'].includes(String(intermacs));
    let severity = 'moderate';
    if (['1', '2', '3'].includes(String(intermacs))) severity = 'critical';
    return {
        value: { eligible: eligible && !organDysfunction, intermacs, organDysfunction },
        severity,
        notes: 'INTERMACS ' + intermacs + (organDysfunction ? ' (reversible organ dysfunction may improve with inotropes/IABP/ECMO bridge)' : ' (candidate for LVAD evaluation)'),
        recommendations: [
            { action: 'refer_to_advanced_HF_program', class: 'I' },
            ...(organDysfunction ? [{ action: 'bridge_with_inotropes_or_temporary_MCS', class: 'IIa' }] : []),
            ...(String(intermacs) === '4' || String(intermacs) === '5' ? [{ action: 'timing_critical_for_optimal_outcome', class: 'I' }] : []),
            { action: 'evaluate_for_transplant_concurrently', class: 'I' }
        ],
        citations: ['ISHLT LVAD Guidelines 2013', 'MOMENTUM 3 trial']
    };
}

/**
 * stratifyAccAhaRisk: ASCVD Pooled Cohort risk score (10-yr ASCVD risk)
 * Required fields: age, sex, race, totalChol, hdlChol, sbp, bpTreated, diabetes, smoker
 * Returns: 10-year ASCVD risk %, risk category
 */
function stratifyAccAhaRisk({ age, sex, race, totalChol, hdlChol, sbp, bpTreated, diabetes, smoker }) {
    if (age < 40 || age > 79) {
        return { value: { ascvd: null, valid: false }, severity: 'low', notes: 'Age ' + age + ' outside 40-79 (PCE range)', recommendations: [] };
    }
    if (!sex || !race) {
        return { value: { ascvd: null, valid: false }, severity: 'low', notes: 'Missing sex/race', recommendations: [] };
    }
    let coefficient = -17.0;  // baseline intercept
    coefficient += Math.log(age) * 12.344;
    if (sex === 'male') coefficient += 0;
    else coefficient += -12.928;
    coefficient += Math.log(totalChol) * 11.853;
    coefficient += Math.log(hdlChol) * -7.990;
    if (String(race).toLowerCase() === 'black') coefficient += 2.833;
    if (sbp != null) {
        if (bpTreated) {
            coefficient += Math.log(sbp) * 1.797;
        } else {
            coefficient += Math.log(sbp) * 1.999;
        }
    }
    if (diabetes) coefficient += 0.658;
    if (smoker) coefficient += 7.574;
    coefficient += Math.log(age) * Math.log(totalChol) * -2.664;
    if (sex === 'male') coefficient += Math.log(age) * Math.log(hdlChol) * -1.769;
    if (String(race).toLowerCase() === 'black') coefficient += -0.156 * Math.log(age) * Math.log(totalChol);
    const baselineSurvival = (sex === 'male' && String(race).toLowerCase() === 'black') ? 0.8954
                            : (sex === 'male') ? 0.9144
                            : (sex === 'female' && String(race).toLowerCase() === 'black') ? 0.9533
                            : 0.9665;
    const ascvd = 1 - Math.pow(baselineSurvival, Math.exp(coefficient - 17.0));
    const ascvdPercent = Math.round(ascvd * 10000) / 100;
    let riskCategory = 'low';
    if (ascvdPercent >= 20) riskCategory = 'high';
    else if (ascvdPercent >= 7.5) riskCategory = 'intermediate';
    else if (ascvdPercent >= 5) riskCategory = 'borderline';
    const recommendations = [];
    if (ascvdPercent >= 7.5) {
        recommendations.push({ action: 'statin_therapy', drug: 'moderate-to-high_intensity_statin', class: 'I' });
        recommendations.push({ action: 'BP_target_<130/80', class: 'I' });
        recommendations.push({ action: 'lifestyle_modifications', class: 'I' });
    } else if (ascvdPercent >= 5) {
        recommendations.push({ action: 'consider_statin', class: 'IIa' });
        recommendations.push({ action: 'lifestyle_modifications', class: 'I' });
    } else {
        recommendations.push({ action: 'lifestyle_modifications', class: 'I' });
    }
    return {
        value: { ascvd: ascvdPercent, ascvdCategory: riskCategory, age, sex, race, totalChol, hdlChol, sbp, bpTreated, diabetes, smoker },
        severity: riskCategory === 'high' ? 'high' : riskCategory === 'intermediate' ? 'moderate' : 'low',
        notes: '10-year ASCVD risk: ' + ascvdPercent + '% (' + riskCategory + ')',
        recommendations,
        citations: ['ACC/AHA PCE 2013', '2018 Cholesterol Guideline']
    };
}

/**
 * assessCardioObstetricRisk: mWHO classification for pregnancy in cardiac disease
 *  - WHO I: no increased risk (mild PS, MVP, small ASD/VSD)
 *  - WHO II: small increased risk (unoperated ASD/VSD, mild LV dysfunction)
 *  - WHO II-III: moderate (mild LV impairment, hypertrophic cardiomyopathy, Marfan, native/repaired coarct)
 *  - WHO III: significantly increased (mechanical valves, systemic RV, unrepaired cyanotic, Marfan w/ aortic dilation)
 *  - WHO IV: pregnancy contraindicated (severe systemic RV dysfunction, severe MS/AS, prior peripartum cardiomyopathy with residual, Marfan with dilated aorta > 45mm, pulmonary HTN)
 */
function assessCardioObstetricRisk({ whoClass, ejectionFraction, nyha, mPAP, aorticDiameter, valveType, priorPPCM, currentGAweeks }) {
    const recommendations = [];
    let severity = 'low';
    if (whoClass === 'IV') {
        severity = 'critical';
        recommendations.push({ action: 'counsel_against_pregnancy', class: 'III_harm' });
        if (currentGAweeks) {
            recommendations.push({ action: 'early_termination_discussion', class: 'I' });
        }
    } else if (whoClass === 'III') {
        severity = 'high';
        recommendations.push({ action: 'preconception_counseling_MFM_cardiologist', class: 'I' });
        recommendations.push({ action: 'monthly_cardiac_followup', class: 'I' });
    } else if (whoClass === 'II-III' || whoClass === 'II') {
        severity = 'moderate';
        recommendations.push({ action: 'multidisciplinary_followup', class: 'I' });
    }
    if (ejectionFraction != null && ejectionFraction < 40) severity = 'high';
    if (mPAP != null && mPAP > 25) severity = 'high';
    if (aorticDiameter != null && aorticDiameter > 45) severity = 'critical';
    if (valveType === 'mechanical') {
        recommendations.push({ action: 'LMWH_anticoagulation_with_factor_Xa_monitoring', class: 'I' });
    }
    if (priorPPCM) {
        recommendations.push({ action: 'echocardiography_each_trimester', class: 'I' });
    }
    return {
        value: { whoClass, ejectionFraction, mPAP, aorticDiameter, valveType, priorPPCM },
        severity,
        notes: 'mWHO ' + whoClass + (currentGAweeks ? ' at ' + currentGAweeks + 'w' : ''),
        recommendations,
        citations: ['ESC Pregnancy CVD 2018', 'AHA/ACC Pregnancy 2023']
    };
}

/**
 * calculateSyntaxScore: SYNTAX score for coronary lesion complexity (1-2 lesions simplified)
 *  - Determines PCI vs CABG suitability (per SYNTAX II: anatomy + clinical)
 *  - Higher score = more complex, CABG preferred
 */
function calculateSyntaxScore({ lesions }) {
    if (!Array.isArray(lesions) || lesions.length === 0) {
        return { value: { syntaxScore: 0, riskCategory: 'low' }, severity: 'low', notes: 'No lesions described', recommendations: [] };
    }
    let total = 0;
    for (const l of lesions) {
        let ls = 0;
        if (l.location === 'LM') ls += 5;
        else if (l.location === 'LAD_proximal') ls += 3.5;
        else if (l.location === 'LAD_mid') ls += 2.5;
        else if (l.location === 'LCx') ls += 1.5;
        else if (l.location === 'RCA') ls += 1.0;
        if (l.bifurcation) ls += 1.0;
        if (l.cto) ls += 1.0;
        if (l.thrombus) ls += 1.0;
        if (l.calcification === 'severe') ls += 2.0;
        if (l.tortuosity === 'severe') ls += 2.0;
        if (l.lengthOver20mm) ls += 1.0;
        total += ls;
    }
    let riskCategory = 'low';
    if (total >= 33) riskCategory = 'high';
    else if (total >= 23) riskCategory = 'intermediate';
    const recommendations = [];
    if (total >= 33) {
        recommendations.push({ action: 'Heart_Team_review_for_CABG', class: 'I' });
    } else if (total >= 23) {
        recommendations.push({ action: 'Heart_Team_review_PCI_or_CABG', class: 'I' });
    } else {
        recommendations.push({ action: 'PCI_reasonable', class: 'I' });
    }
    return {
        value: { syntaxScore: Math.round(total * 10) / 10, lesionCount: lesions.length, riskCategory },
        severity: riskCategory === 'high' ? 'critical' : riskCategory === 'intermediate' ? 'moderate' : 'low',
        notes: 'SYNTAX score ' + Math.round(total * 10) / 10 + ' (' + riskCategory + ' complexity)',
        recommendations,
        citations: ['SYNTAX Trial', 'ESC Revascularization 2018']
    };
}

module.exports = {
    calculateHFAHAStage,
    calculateCHADSVAScRefined,
    calculateLVADEligibility,
    stratifyAccAhaRisk,
    assessCardioObstetricRisk,
    calculateSyntaxScore
};

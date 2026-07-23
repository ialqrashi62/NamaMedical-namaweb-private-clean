// support_services_wave7_engine.js
// Support Services Wave 7: Nutrition screening, Social work, Biomed equipment PM, etc.
// All functions are pure (deterministic, no I/O) per Phase 3 architecture.
// Each function returns { value, severity, notes, recommendations, citations } per the engine contract.

'use strict';

/**
 * screenNutritionNRS: NRS-2002 (Nutritional Risk Screening) for hospitalized adults
 *  - 4-step screen: BMI < 20.5? Weight loss? Reduced intake? Severely ill?
 *  - Score 0-7; ≥ 3 = at risk → full SGA assessment
 *  - Final: 0=no risk, 1-2=possible, ≥3=at risk
 */
function screenNutritionNRS({ bmi, weightLossKg3mo, intakeReduced, severelyIll }) {
    let score = 0;
    const components = [];
    if (bmi < 20.5) { score += 3; components.push({ factor: 'BMI<20.5', points: 3 }); }
    if (weightLossKg3mo >= 5) { score += 3; components.push({ factor: 'Wt loss >5%/3mo', points: 3 }); }
    else if (weightLossKg3mo >= 3) { score += 2; components.push({ factor: 'Wt loss 3-5%/3mo', points: 2 }); }
    if (intakeReduced) { score += 1; components.push({ factor: 'Reduced intake', points: 1 }); }
    if (severelyIll) { score += 2; components.push({ factor: 'Severely ill', points: 2 }); }
    const severity = score >= 3 ? 'high' : score >= 1 ? 'moderate' : 'low';
    return {
        value: { score, max: 7, risk: score >= 3 ? 'at_risk' : score >= 1 ? 'possible_risk' : 'no_risk', components },
        severity,
        notes: 'NRS-2002: ' + score + ' (max 7)',
        recommendations: score >= 3 ? [
            { intervention: 'Full SGA (Subjective Global Assessment)', priority: 'high' },
            { intervention: 'Dietitian consult within 24-48h', priority: 'high' },
            { intervention: 'Consider oral nutritional supplements', priority: 'moderate' }
        ] : score >= 1 ? [
            { intervention: 'Monitor intake; reassess in 3-5 days', priority: 'moderate' }
        ] : [{ intervention: 'Routine nutrition care', priority: 'low' }],
        citations: ['Kondrup J 2003 NRS-2002', 'ESPEN Guidelines 2015']
    };
}

/**
 * screenMalnutritionMUST: Malnutrition Universal Screening Tool (5-step)
 *  - BMI: 0 (≥20), 1 (18.5-20), 2 (<18.5)
 *  - Unplanned wt loss 3-6mo: 0 (<5%), 1 (5-10%), 2 (>10%)
 *  - Acute disease: 0, 1, 2
 *  - Total: 0=low, 1=medium, ≥2=high
 */
function screenMalnutritionMUST({ bmi, weightLossPct, acuteDiseaseEffect }) {
    let bmiScore = 0;
    if (bmi < 18.5) bmiScore = 2;
    else if (bmi < 20) bmiScore = 1;
    let lossScore = 0;
    if (weightLossPct >= 10) lossScore = 2;
    else if (weightLossPct >= 5) lossScore = 1;
    const diseaseScore = acuteDiseaseEffect ? 2 : 0;
    const total = bmiScore + lossScore + diseaseScore;
    let severity, category;
    if (total === 0) { severity = 'low'; category = 'low_risk'; }
    else if (total === 1) { severity = 'moderate'; category = 'medium_risk'; }
    else { severity = 'high'; category = 'high_risk'; }
    return {
        value: { total, bmiScore, lossScore, diseaseScore, category, max: 6 },
        severity,
        notes: 'MUST: ' + total + ' (' + category + ')',
        recommendations: total >= 2 ? [
            { intervention: 'Dietitian referral', priority: 'high' },
            { intervention: 'Document malnutrition in chart', priority: 'high' },
            { intervention: 'Consider ICD-10 E46', priority: 'moderate' }
        ] : total === 1 ? [
            { intervention: 'Observe dietary intake 3 days', priority: 'moderate' }
        ] : [{ intervention: 'Routine care', priority: 'low' }],
        citations: ['MUST (BAPEN)', 'ASPEN 2012']
    };
}

/**
 * screenSocialWork: Psychosocial risk screening
 *  - 5 domains: housing instability, food insecurity, financial strain, lack of support, transport barriers
 *  - Each 0-1
 *  - ≥ 2 = high psychosocial risk → SW consult
 */
function screenSocialWork({ housingInstability, foodInsecurity, financialStrain, lackSupport, transportBarriers }) {
    const flags = [housingInstability, foodInsecurity, financialStrain, lackSupport, transportBarriers].filter(Boolean);
    const score = flags.length;
    const severity = score >= 3 ? 'high' : score >= 2 ? 'moderate' : score >= 1 ? 'low' : 'low';
    return {
        value: { score, max: 5, flags: { housingInstability, foodInsecurity, financialStrain, lackSupport, transportBarriers } },
        severity: score >= 2 ? 'high' : 'low',
        notes: 'Social risk flags: ' + score + '/5',
        recommendations: score >= 2 ? [
            { intervention: 'Social work consult', priority: 'high' },
            { intervention: 'Consider community resources / financial counselor', priority: 'moderate' }
        ] : [{ intervention: 'Standard discharge planning', priority: 'low' }],
        citations: ['AHCPR Social Work screening', 'CMS Conditions of Participation']
    };
}

/**
 * planBiomedPM: Biomed equipment preventive maintenance scheduling
 *  - Based on risk class: Class I (life-support) = 6mo PM, Class II (critical) = 12mo, Class III (general) = 24mo
 *  - Failure risk factors: age, hours, last PM, device criticality
 *  Returns priority + next PM date
 */
function planBiomedPM({ equipmentClass, lastPmMonthsAgo, currentAgeYears, dailyUsageHours, recallHistory }) {
    let intervalMonths;
    if (equipmentClass === 'life_support') intervalMonths = 6;
    else if (equipmentClass === 'critical') intervalMonths = 12;
    else if (equipmentClass === 'general') intervalMonths = 24;
    else intervalMonths = 36;
    const overdue = lastPmMonthsAgo > intervalMonths;
    let severity = 'low';
    let priority = 'routine';
    if (overdue) {
        if (equipmentClass === 'life_support') { severity = 'critical'; priority = 'immediate'; }
        else if (equipmentClass === 'critical') { severity = 'high'; priority = 'urgent'; }
        else { severity = 'moderate'; priority = 'soon'; }
    } else if (lastPmMonthsAgo > intervalMonths * 0.9) {
        priority = 'scheduled';
    }
    const highUsage = dailyUsageHours > 12;
    const oldDevice = currentAgeYears > 10;
    const highRisk = recallHistory > 0 || (highUsage && oldDevice);
    if (highRisk && overdue) severity = 'critical';
    const nextPmMonths = intervalMonths - (lastPmMonthsAgo % intervalMonths);
    return {
        value: { intervalMonths, lastPmMonthsAgo, overdue, nextPmIn: nextPmMonths, highRisk, priority },
        severity,
        notes: 'PM interval: ' + intervalMonths + 'mo; last PM ' + lastPmMonthsAgo + 'mo ago - ' + (overdue ? 'OVERDUE' : 'on schedule'),
        recommendations: overdue ? [
            { intervention: 'Schedule PM within ' + (priority === 'immediate' ? '24h' : priority === 'urgent' ? '7d' : '30d'), priority: severity },
            { intervention: 'Take out of service if life-support', priority: severity }
        ] : [{ intervention: 'Continue routine schedule', priority: 'low' }],
        citations: ['ECRI Biomed PM Standards', 'TJC Environment of Care']
    };
}

/**
 * assessMedicalDeviceFailure: Combine age, hours, recall history, maintenance score
 *  - Returns probability of failure (0-100%) in next 12mo
 */
function assessMedicalDeviceFailure({ ageYears, totalOperatingHours, lastPmMonthsAgo, expectedLifespanYears, recallCount, errorLogCount }) {
    const ageFactor = Math.min(ageYears / expectedLifespanYears, 1.5);
    const hoursPerYear = ageYears > 0 ? totalOperatingHours / ageYears : 0;
    const usageFactor = Math.min(hoursPerYear / 4000, 1.5);
    const pmFactor = Math.max(0, 1 - lastPmMonthsAgo / 12);
    const riskScore = (ageFactor * 0.4 + usageFactor * 0.2 + pmFactor * 0.2 + (recallCount > 0 ? 0.2 : 0) + (errorLogCount > 5 ? 0.2 : 0)) / 2 * 100;
    const failureProb = Math.min(100, Math.round(riskScore));
    const severity = failureProb > 70 ? 'critical' : failureProb > 40 ? 'high' : failureProb > 20 ? 'moderate' : 'low';
    return {
        value: { failureProb, ageFactor, usageFactor, pmFactor, hoursPerYear },
        severity,
        notes: '12-mo failure probability: ' + failureProb + '%',
        recommendations: failureProb > 40 ? [
            { intervention: 'Increase PM frequency', priority: 'high' },
            { intervention: 'Plan replacement', priority: 'moderate' }
        ] : [{ intervention: 'Routine monitoring', priority: 'low' }],
        citations: ['ECRI Risk Assessment', 'FDA MAUDE database']
    };
}

module.exports = {
    screenNutritionNRS,
    screenMalnutritionMUST,
    screenSocialWork,
    planBiomedPM,
    assessMedicalDeviceFailure
};

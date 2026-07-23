// therapeutic_rehab_wave6_engine.js
// Therapeutic & Rehabilitation Wave 6: PT, OT, Speech, Pain, Cardiac/Pulmonary rehab engines.
// All functions are pure (deterministic, no I/O) per Phase 3 architecture.
// Each function returns { value, severity, notes, recommendations, citations } per the engine contract.

'use strict';

/**
 * assessBergBalance: Berg Balance Scale (14 items, 0-4 each, total 0-56)
 *  - 0-20: wheelchair-bound (high fall risk)
 *  - 21-40: walking with assistance
 *  - 41-56: independent
 *  Cutoff < 45 = fall risk
 */
function assessBergBalance({ itemScores }) {
    if (!Array.isArray(itemScores) || itemScores.length !== 14) {
        throw new Error('itemScores must be array of 14 scores (0-4 each)');
    }
    if (itemScores.some(s => s < 0 || s > 4)) {
        throw new Error('Each item score must be 0-4');
    }
    const total = itemScores.reduce((a, b) => a + b, 0);
    let severity, riskClass;
    if (total <= 20) { severity = 'critical'; riskClass = 'wheelchair'; }
    else if (total <= 40) { severity = 'high'; riskClass = 'assisted'; }
    else if (total < 45) { severity = 'moderate'; riskClass = 'fall_risk'; }
    else { severity = 'low'; riskClass = 'independent'; }
    const recommendations = [];
    if (total < 45) {
        recommendations.push({ intervention: 'Fall precautions', priority: 'high' });
        recommendations.push({ intervention: 'PT 3-5x/week for balance training', priority: 'high' });
        recommendations.push({ intervention: 'Assistive device assessment', priority: 'moderate' });
    } else {
        recommendations.push({ intervention: 'Continue maintenance program', priority: 'low' });
    }
    return {
        value: { total, max: 56, riskClass },
        severity,
        notes: 'BBS total: ' + total + '/56 - ' + riskClass,
        recommendations,
        citations: ['Berg KO 1989', 'Berg Balance Scale - clinical cutoff 45']
    };
}

/**
 * assessTinetti: Tinetti Performance-Oriented Mobility Assessment (POMA)
 *  - Balance subscale: 9 items, 0-16
 *  - Gait subscale: 7 items, 0-12
 *  - Total 0-28
 *  - <18: high fall risk
 *  - 19-23: moderate
 *  - ≥24: low
 */
function assessTinetti({ balance, gait }) {
    if (balance < 0 || balance > 16) throw new Error('balance must be 0-16');
    if (gait < 0 || gait > 12) throw new Error('gait must be 0-12');
    const total = balance + gait;
    let severity, riskClass;
    if (total < 18) { severity = 'critical'; riskClass = 'high_fall_risk'; }
    else if (total < 24) { severity = 'moderate'; riskClass = 'moderate_fall_risk'; }
    else { severity = 'low'; riskClass = 'low_fall_risk'; }
    const recommendations = [];
    if (total < 18) {
        recommendations.push({ intervention: 'PT consult; consider walker', priority: 'high' });
        recommendations.push({ intervention: 'Home safety evaluation', priority: 'high' });
    } else if (total < 24) {
        recommendations.push({ intervention: 'Balance training 2-3x/week', priority: 'moderate' });
    }
    return {
        value: { total, balance, gait, max: 28, riskClass },
        severity,
        notes: 'POMA total: ' + total + '/28 (balance ' + balance + '/16 + gait ' + gait + '/12)',
        recommendations,
        citations: ['Tinetti ME 1986']
    };
}

/**
 * assessFIM: Functional Independence Measure (18 items, 1-7 each, total 18-126)
 *  - Motor (13 items, 13-91): self-care, sphincter, mobility, locomotion
 *  - Cognitive (5 items, 5-35): communication, social cognition
 *  - 7 = complete independence, 1 = total assist
 *  - < 80 = needs significant assistance
 *  - 80-100 = needs minimal assistance
 *  - > 100 = near independent
 */
function assessFIM({ motorItems, cognitiveItems }) {
    if (!Array.isArray(motorItems) || motorItems.length !== 13) {
        throw new Error('motorItems must be array of 13 scores (1-7)');
    }
    if (!Array.isArray(cognitiveItems) || cognitiveItems.length !== 5) {
        throw new Error('cognitiveItems must be array of 5 scores (1-7)');
    }
    if (motorItems.some(s => s < 1 || s > 7) || cognitiveItems.some(s => s < 1 || s > 7)) {
        throw new Error('Each item score must be 1-7');
    }
    const motor = motorItems.reduce((a, b) => a + b, 0);
    const cognitive = cognitiveItems.reduce((a, b) => a + b, 0);
    const total = motor + cognitive;
    let severity, classif;
    if (total < 80) { severity = 'high'; classif = 'significant_assistance'; }
    else if (total < 100) { severity = 'moderate'; classif = 'minimal_assistance'; }
    else { severity = 'low'; classif = 'near_independent'; }
    return {
        value: { total, motor, cognitive, max: 126, classif },
        severity,
        notes: 'FIM total: ' + total + '/126 (motor ' + motor + '/91 + cog ' + cognitive + '/35)',
        recommendations: [
            { intervention: 'Discharge planning if total < 100', priority: severity === 'high' ? 'high' : 'moderate' },
            { intervention: 'Reassess weekly', priority: 'low' }
        ],
        citations: ['Uniform Data System for Medical Rehabilitation', 'FIM instrument']
    };
}

/**
 * assessPainNRS: Pain Numeric Rating Scale + functional impact
 *  - 0: no pain
 *  - 1-3: mild
 *  - 4-6: moderate
 *  - 7-10: severe
 *  WHO analgesic ladder:
 *  - 1-3: non-opioid ± adjuvant
 *  - 4-6: weak opioid (codeine/tramadol) ± non-opioid
 *  - 7-10: strong opioid (morphine/oxycodone) ± non-opioid ± adjuvant
 */
function assessPainNRS({ nrs, type, chronicity }) {
    if (nrs < 0 || nrs > 10) throw new Error('NRS must be 0-10');
    let severity, step;
    if (nrs === 0) { severity = 'low'; step = 'none'; }
    else if (nrs <= 3) { severity = 'mild'; step = 'step1'; }
    else if (nrs <= 6) { severity = 'moderate'; step = 'step2'; }
    else { severity = 'severe'; step = 'step3'; }
    const recommendations = [];
    if (step === 'step1') {
        recommendations.push({ drug: 'Paracetamol 1g q6h OR NSAID', class: 'I' });
    } else if (step === 'step2') {
        recommendations.push({ drug: 'Codeine 30-60mg q6h OR Tramadol 50-100mg q6h', class: 'I' });
        recommendations.push({ drug: '+ Paracetamol/NSAID', class: 'I' });
    } else if (step === 'step3') {
        recommendations.push({ drug: 'Morphine IR 5-10mg q4h OR Oxycodone 5-10mg q6h', class: 'I' });
        recommendations.push({ drug: '+ Paracetamol/NSAID + adjuvant (gabapentin/amitriptyline if neuropathic)', class: 'I' });
    }
    if (chronicity === 'chronic' && nrs > 3) {
        recommendations.push({ intervention: 'Multimodal non-pharmacologic (PT, CBT, TENS)', priority: 'high' });
        recommendations.push({ intervention: 'Consider pain clinic referral', priority: 'moderate' });
    }
    return {
        value: { nrs, type: type || 'unspecified', chronicity: chronicity || 'acute', step },
        severity,
        notes: 'NRS ' + nrs + '/10 (' + severity + ') - WHO step ' + step,
        recommendations,
        citations: ['WHO Analgesic Ladder', 'Numeric Pain Rating Scale']
    };
}

/**
 * assessSwallowScreening: Modified Yale Swallow Pre-screen (high-level)
 *  - Cognitive + motor screening: alert? able to sit? sip water?
 *  - Failed = NPO, full bedside swallow eval by SLP
 *  - Passed = PO trial, may advance diet
 */
function assessSwallowScreening({ alert, ableToSit, ableToSip, coughOnSip, voiceChange, drooling }) {
    const failed = !alert || !ableToSit || !ableToSip || coughOnSip || voiceChange || drooling;
    const severity = failed ? 'high' : 'low';
    const recommendations = [];
    if (failed) {
        recommendations.push({ intervention: 'NPO', priority: 'high' });
        recommendations.push({ intervention: 'Urgent SLP bedside evaluation', priority: 'high' });
        recommendations.push({ intervention: 'Consider VFSS / FEES', priority: 'moderate' });
    } else {
        recommendations.push({ intervention: 'Trial PO thin liquids, advance as tolerated', priority: 'low' });
    }
    return {
        value: { failed, components: { alert, ableToSit, ableToSip, coughOnSip, voiceChange, drooling } },
        severity,
        notes: failed ? 'Dysphagia screen FAILED - aspiration risk' : 'Dysphagia screen passed',
        recommendations,
        citations: ['Yale Swallow Protocol', 'ASPEN dysphagia guidelines']
    };
}

/**
 * assessCardiacRehabPhase: Phase 1-4 cardiac rehabilitation
 *  - Phase 1: Inpatient (acute MI, post-CABG/PCI)
 *  - Phase 2: Outpatient supervised exercise (≤ 4 weeks post-event)
 *  - Phase 3: Maintenance (4-12 weeks)
 *  - Phase 4: Long-term independent
 */
function assessCardiacRehabPhase({ daysPostEvent, event, lvef, comorbidities, onBetaBlocker }) {
    let phase, eligibility = true;
    if (daysPostEvent == null) {
        phase = 'not_started';
    } else if (daysPostEvent < 0) {
        throw new Error('daysPostEvent must be ≥ 0');
    } else if (daysPostEvent <= 7) {
        phase = 'phase1_inpatient';
    } else if (daysPostEvent <= 28) {
        phase = 'phase2_outpatient';
    } else if (daysPostEvent <= 84) {
        phase = 'phase3_maintenance';
    } else {
        phase = 'phase4_independent';
    }
    if (lvef != null && lvef < 25) {
        eligibility = false;
    }
    if (comorbidities && comorbidities.includes('unstable_arrhythmia')) {
        eligibility = false;
    }
    const recommendations = [];
    if (eligibility) {
        recommendations.push({ intervention: 'Enroll in ' + phase, priority: 'high' });
        recommendations.push({ intervention: 'EKG-monitored exercise 3x/week', priority: 'high' });
        if (!onBetaBlocker) recommendations.push({ intervention: 'Ensure rate control before exercise', priority: 'moderate' });
    } else {
        recommendations.push({ intervention: 'CR contraindicated currently', priority: 'high' });
        recommendations.push({ intervention: 'Reassess when stable', priority: 'moderate' });
    }
    return {
        value: { phase, eligibility, event, lvef, daysPostEvent },
        severity: eligibility ? (phase === 'phase1_inpatient' ? 'high' : 'moderate') : 'critical',
        notes: 'CR Phase: ' + phase + ', eligibility: ' + eligibility,
        recommendations,
        citations: ['AHA/ACC CR Performance Measures 2010', 'AACVPR Guidelines']
    };
}

/**
 * assessPulmonaryRehabEligibility: PR eligibility + 6MWT (6-min walk test) interpretation
 *  - 6MWD: 6-minute walk distance in meters
 *  - Normal ≥ 500m
 *  - 200-400m: moderate disability
 *  - < 200m: severe
 *  Eligibility: COPD mMRC ≥ 2 OR FEV1 < 50% OR recent exacerbation
 */
function assessPulmonaryRehabEligibility({ fvc, fev1, mmrcDyspnea, recentExacerbation30d, walk6MinDist, age, height, weight }) {
    const fev1FvcRatio = (fvc && fev1) ? fev1 / fvc : null;
    const copdSeverity = !fev1 ? null : fev1 >= 0.8 ? 'normal' : fev1 >= 0.5 ? 'mild_to_moderate' : 'severe';
    const eligible = (mmrcDyspnea >= 2) || (fev1 != null && fev1 < 0.5) || (recentExacerbation30d === true);
    let disability = 'none';
    if (walk6MinDist != null) {
        if (walk6MinDist < 200) disability = 'severe';
        else if (walk6MinDist < 400) disability = 'moderate';
        else if (walk6MinDist < 500) disability = 'mild';
    }
    const severity = !eligible ? 'low' : disability === 'severe' ? 'critical' : disability === 'moderate' ? 'high' : 'moderate';
    return {
        value: { eligible, fev1, fvc, fev1FvcRatio, copdSeverity, mmrcDyspnea, walk6MinDist, disability },
        severity,
        notes: eligible ? 'PR eligible' : 'Not eligible',
        recommendations: eligible ? [
            { intervention: 'Enroll in 6-8 week outpatient PR', priority: 'high' },
            { intervention: 'Endurance + strength training 3x/week', priority: 'high' },
            { intervention: 'Reassess 6MWT at completion', priority: 'moderate' }
        ] : [{ intervention: 'Maintain current activity', priority: 'low' }],
        citations: ['ATS/ERS 2013 PR Statement', 'GOLD 2024']
    };
}

module.exports = {
    assessBergBalance,
    assessTinetti,
    assessFIM,
    assessPainNRS,
    assessSwallowScreening,
    assessCardiacRehabPhase,
    assessPulmonaryRehabEligibility
};

// admin_academic_wave8_engine.js
// Admin & Academic Wave 8: Quality metrics, Research protocol, Credentialing, CME tracking
// All functions are pure (deterministic, no I/O) per Phase 3 architecture.
// Each function returns { value, severity, notes, recommendations, citations } per the engine contract.

'use strict';

/**
 * calculateHAI: Healthcare-Associated Infection rate (per 1000 device-days or procedures)
 *  Standardized Infection Ratio (SIR) = observed / expected
 *  - CLABSI (Central Line): per 1000 central line days
 *  - CAUTI (Catheter): per 1000 catheter days
 *  - SSI (Surgical Site): per 100 procedures
 *  - VAP (Vent): per 1000 vent days
 *  - MRSA LabID: per 1000 patient days
 *  - C.diff LabID: per 1000 patient days
 *  Severity based on SIR:
 *  - SIR > 1.5 = critical (much worse than expected)
 *  - SIR 1.0-1.5 = high
 *  - SIR 0.5-1.0 = moderate
 *  - SIR < 0.5 = low (better than expected)
 */
function calculateHAI({ type, observed, expected, deviceDays, procedures, patientDays }) {
    if (!observed || expected == null) {
        throw new Error('observed and expected required');
    }
    const sir = observed / expected;
    let rate;
    if (type === 'clabsi' || type === 'cauti' || type === 'vap') {
        if (!deviceDays) throw new Error('deviceDays required for CLABSI/CAUTI/VAP');
        rate = (observed / deviceDays) * 1000;
    } else if (type === 'ssi') {
        if (!procedures) throw new Error('procedures required for SSI');
        rate = (observed / procedures) * 100;
    } else {
        if (!patientDays) throw new Error('patientDays required for LabID events');
        rate = (observed / patientDays) * 1000;
    }
    let severity;
    if (sir > 1.5) severity = 'critical';
    else if (sir > 1.0) severity = 'high';
    else if (sir > 0.5) severity = 'moderate';
    else severity = 'low';
    return {
        value: { type, observed, expected, sir: Math.round(sir * 100) / 100, rate: Math.round(rate * 100) / 100, deviceDays, procedures, patientDays },
        severity,
        notes: type.toUpperCase() + ' SIR: ' + Math.round(sir * 100) / 100 + ' (rate ' + Math.round(rate * 100) / 100 + ')',
        recommendations: sir > 1.0 ? [
            { intervention: 'Infection control investigation', priority: 'high' },
            { intervention: 'Bundle compliance audit', priority: 'high' },
            { intervention: 'Report to quality committee', priority: 'high' }
        ] : sir > 0.5 ? [
            { intervention: 'Continue monitoring; trend review', priority: 'moderate' }
        ] : [{ intervention: 'Maintain current practices', priority: 'low' }],
        citations: ['NHSN HAI Definitions', 'CDC NHSN SIR']
    };
}

/**
 * screenResearchEligibility: Clinical trial enrollment screening
 *  - Inclusion + exclusion criteria checker
 *  - Each criterion: 0-1 score (0=no, 1=yes, null=unknown)
 *  - Eligible = meets all inclusion AND no exclusions
 */
function screenResearchEligibility({ inclusion, exclusion, age, diagnosis, ecog, labs }) {
    const inclusionMet = inclusion.every(c => c.met === true);
    const exclusionAbsent = exclusion.every(c => c.present !== true);
    const eligible = inclusionMet && exclusionAbsent;
    const blockers = [];
    inclusion.forEach((c, i) => { if (c.met !== true) blockers.push({ type: 'inclusion', criterion: c.name, idx: i }); });
    exclusion.forEach((c, i) => { if (c.present === true) blockers.push({ type: 'exclusion', criterion: c.name, idx: i }); });
    const severity = eligible ? 'low' : blockers.length > 2 ? 'high' : 'moderate';
    return {
        value: { eligible, inclusionMet, exclusionAbsent, blockerCount: blockers.length, blockers },
        severity,
        notes: eligible ? 'Eligible for enrollment' : blockers.length + ' blocker(s) found',
        recommendations: eligible ? [
            { intervention: 'Obtain informed consent', priority: 'high' },
            { intervention: 'Schedule screening visit', priority: 'high' }
        ] : [
            { intervention: 'Discuss exclusion reasons with PI', priority: 'high' },
            { intervention: 'Document ineligibility', priority: 'moderate' }
        ],
        citations: ['ICH-GCP E6', 'FDA 21 CFR 312']
    };
}

/**
 * assessProviderCredential: Privilege/credentialing eligibility check
 *  - License active?
 *  - DEA active?
 *  - Board cert current?
 *  - CME credits met?
 *  - Malpractice current?
 *  - NPDB query within 24mo?
 */
function assessProviderCredential({ licenseActive, licenseExpiry, deaActive, deaExpiry, boardCertActive, boardCertExpiry, cmeHoursAnnual, cmeHoursRequired, malpracticeActive, malpracticeExpiry, npdbQueryMoAgo, hospitalPrivilegesActive }) {
    const checks = [
        { name: 'License active', status: licenseActive, critical: true },
        { name: 'DEA active', status: deaActive, critical: true },
        { name: 'Board cert active', status: boardCertActive, critical: true },
        { name: 'Malpractice active', status: malpracticeActive, critical: true },
        { name: 'Hospital privileges', status: hospitalPrivilegesActive, critical: true },
        { name: 'CME met', status: cmeHoursAnnual >= cmeHoursRequired, critical: false },
        { name: 'NPDB query <24mo', status: npdbQueryMoAgo != null && npdbQueryMoAgo <= 24, critical: false }
    ];
    const criticalFails = checks.filter(c => c.critical && !c.status);
    const nonCriticalFails = checks.filter(c => !c.critical && !c.status);
    const allPassed = criticalFails.length === 0 && nonCriticalFails.length === 0;
    const credentialEligible = criticalFails.length === 0;
    const severity = criticalFails.length > 0 ? 'critical' : nonCriticalFails.length > 1 ? 'moderate' : nonCriticalFails.length === 1 ? 'low' : 'low';
    return {
        value: { credentialEligible, allPassed, criticalFails: criticalFails.map(c => c.name), nonCriticalFails: nonCriticalFails.map(c => c.name), checks },
        severity,
        notes: credentialEligible ? 'Credentialing-eligible' : 'NOT eligible - ' + criticalFails.length + ' critical gap(s)',
        recommendations: criticalFails.length > 0 ? [
            { intervention: 'HALT clinical activity', priority: 'high' },
            { intervention: 'Resolve: ' + criticalFails.map(c => c.name).join(', '), priority: 'high' }
        ] : nonCriticalFails.length > 0 ? [
            { intervention: 'Resolve: ' + nonCriticalFails.map(c => c.name).join(', '), priority: 'moderate' }
        ] : [{ intervention: 'Routine re-credentialing', priority: 'low' }],
        citations: ['TJC Medical Staff Standards', 'NCQA Credentialing', 'CMS CoP §482.22']
    };
}

/**
 * trackCME: Continuing Medical Education credit tracking
 *  - State/board requirements vary (typically 20-50 hours/year)
 *  - Returns status + remaining hours + deadline
 */
function trackCME({ currentCME, requiredAnnual, deadline, specialtyBoard }) {
    const remaining = Math.max(0, requiredAnnual - currentCME);
    const daysToDeadline = deadline ? Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const pctComplete = (currentCME / requiredAnnual) * 100;
    let severity = 'low';
    let priority = 'low';
    if (pctComplete < 50) { severity = 'high'; priority = 'high'; }
    else if (pctComplete < 80) { severity = 'moderate'; priority = 'moderate'; }
    if (daysToDeadline != null && daysToDeadline < 60 && pctComplete < 100) {
        severity = pctComplete < 50 ? 'critical' : 'high';
    }
    return {
        value: { currentCME, requiredAnnual, remaining, pctComplete: Math.round(pctComplete), daysToDeadline, specialtyBoard, complete: currentCME >= requiredAnnual },
        severity,
        notes: 'CME: ' + currentCME + '/' + requiredAnnual + ' (' + Math.round(pctComplete) + '%) - ' + (currentCME >= requiredAnnual ? 'COMPLETE' : remaining + ' hrs needed'),
        recommendations: currentCME < requiredAnnual ? [
            { intervention: 'Schedule ' + remaining + ' CME hrs before deadline', priority: severity === 'critical' ? 'high' : severity },
            { intervention: 'Consider online AMA PRA Category 1 activities', priority: 'moderate' }
        ] : [{ intervention: 'Maintain annual record', priority: 'low' }],
        citations: ['AMA PRA Category 1', 'State medical board CME requirements']
    };
}

module.exports = {
    calculateHAI,
    screenResearchEligibility,
    assessProviderCredential,
    trackCME
};

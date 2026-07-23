// ============================================================================
// Diagnostics — Wave 4 PURE ENGINE (no DB, no I/O)
// Converts Enterprise_Blueprint_2026 Wave 4 C-classified department specs into
// real, unit-testable decision-support gates. Same conventions as prior waves.
// ============================================================================

'use strict';

// 1) Nuclear Medicine — radioisotope pregnancy safety gate.
// Blueprint rule: hard-block radioisotope administration without documented negative
// pregnancy status (for applicable age group).
function checkRadioisotopePregnancyGate({ childbearingAge, pregnancyTestNegative } = {}) {
    if (childbearingAge !== true) {
        return { allowed: true, reason: 'not applicable age group — no pregnancy screen required' };
    }
    return {
        allowed: pregnancyTestNegative === true,
        reason: pregnancyTestNegative === true
            ? 'negative pregnancy test on file — administration allowed'
            : 'BLOCKED — documented negative pregnancy test required before radioisotope administration'
    };
}

// 2) Immunology — advisory-only labeling gate.
// Blueprint rule: all pattern interpretations tagged as "supportive of" language, never a
// stand-alone diagnosis.
function labelImmunologyPatternResult({ patternDetected } = {}) {
    return {
        pattern: patternDetected || 'none',
        label: patternDetected ? `supportive of ${patternDetected}` : 'no pattern detected',
        disclaimer: 'ADVISORY ONLY — supportive interpretation, not a stand-alone diagnosis'
    };
}

// 3) Medical Genetics — pathogenic-variant sign-off gate.
// Blueprint rule: hard-gate any "Pathogenic" classification report release behind
// mandatory geneticist sign-off.
function checkVariantReportReleaseGate({ classification, geneticistSignoff } = {}) {
    const requiresSignoff = classification === 'Pathogenic' || classification === 'Likely Pathogenic';
    if (!requiresSignoff) {
        return { releaseAllowed: true, reason: `classification "${classification}" does not require mandatory sign-off` };
    }
    return {
        releaseAllowed: geneticistSignoff === true,
        reason: geneticistSignoff === true
            ? `"${classification}" classification confirmed by geneticist sign-off`
            : `BLOCKED — "${classification}" classification requires mandatory geneticist sign-off before release`
    };
}

// 4) Toxicology — acetaminophen nomogram NAC alert.
// Blueprint rule: critical alert for acetaminophen levels above the Rumack-Matthew nomogram
// treatment line (urgent N-acetylcysteine).
function checkAcetaminophenNomogramAlert({ levelMcgMl, hoursPostIngestion } = {}) {
    if (levelMcgMl === undefined || levelMcgMl === null || hoursPostIngestion === undefined || hoursPostIngestion === null) {
        return { urgentNacAlert: false, reason: 'incomplete level/time data — cannot assess nomogram' };
    }
    // Rumack-Matthew treatment line approximation: 150 mcg/mL at 4h, halving every 4h (t1/2=4h possible-toxicity line).
    const hours = Math.max(Number(hoursPostIngestion), 4);
    const treatmentLineLevel = 150 * Math.pow(0.5, (hours - 4) / 4);
    const aboveLine = Number(levelMcgMl) > treatmentLineLevel;
    return {
        urgentNacAlert: aboveLine,
        treatmentLineLevel: Math.round(treatmentLineLevel * 10) / 10,
        reason: aboveLine
            ? `level ${levelMcgMl} mcg/mL exceeds nomogram treatment line (~${treatmentLineLevel.toFixed(1)}) at ${hoursPostIngestion}h — urgent NAC`
            : 'level below nomogram treatment line'
    };
}

// 5) EEG — non-convulsive status epilepticus (NCSE) alert.
// Blueprint rule: critical alert for suspected NCSE (immediate neurology notification for
// urgent anti-seizure medication).
function checkNcseAlert({ continuousElectrographicSeizure, noMotorConvulsions } = {}) {
    const alert = continuousElectrographicSeizure === true && noMotorConvulsions === true;
    return {
        ncseEmergencyAlert: alert,
        reason: alert
            ? 'continuous electrographic seizure without motor convulsions — suspected NCSE, immediate neurology notification'
            : 'NCSE criteria not met'
    };
}

// 6) EMG/NCS — Guillain-Barré pattern alert.
// Blueprint rule: urgent alert for suspected Guillain-Barré pattern (rapid progression +
// demyelinating features) — immediate neurology consult.
function checkGuillainBarreAlert({ rapidProgression, demyelinatingFeatures } = {}) {
    const alert = rapidProgression === true && demyelinatingFeatures === true;
    return {
        urgentNeurologyConsult: alert,
        reason: alert
            ? 'rapid progression + demyelinating features — suspected Guillain-Barré, urgent neurology consult'
            : 'Guillain-Barré pattern criteria not met'
    };
}

// 7) Cerebral Angiography — contrast extravasation emergency alert.
// Blueprint rule: critical alert for active contrast extravasation during procedure
// (immediate neurosurgical backup).
function checkContrastExtravasationAlert({ contrastExtravasationDetected } = {}) {
    return {
        immediateNeurosurgicalBackup: contrastExtravasationDetected === true,
        reason: contrastExtravasationDetected === true
            ? 'active contrast extravasation detected — immediate neurosurgical backup required'
            : 'no extravasation detected'
    };
}

// 8) Bronchial Angiography — massive hemoptysis emergency alert.
// Blueprint rule: critical alert for massive hemoptysis (>300mL/24h with dropping BP)
// (immediate IR activation).
function checkMassiveHemoptysisAlert({ bloodVolumeMl24h, droppingBp } = {}) {
    if (bloodVolumeMl24h === undefined || bloodVolumeMl24h === null) {
        return { immediateIrActivation: false, reason: 'blood volume data missing — cannot assess' };
    }
    const massive = Number(bloodVolumeMl24h) > 300 && droppingBp === true;
    return {
        immediateIrActivation: massive,
        reason: massive
            ? `${bloodVolumeMl24h}mL hemoptysis/24h with dropping BP — massive hemoptysis, immediate IR activation`
            : 'massive hemoptysis criteria not met'
    };
}

// 9) Sweat/Allergy Testing — insufficient-volume rejection gate.
// Blueprint rule: flag insufficient sweat volume as non-diagnostic (mandatory repeat, no
// result estimation).
function checkSweatTestValidity({ sweatVolumeMicroliters, minimumRequiredMicroliters = 15 } = {}) {
    if (sweatVolumeMicroliters === undefined || sweatVolumeMicroliters === null) {
        return { diagnostic: false, reason: 'sweat volume data missing — non-diagnostic, repeat required' };
    }
    const sufficient = Number(sweatVolumeMicroliters) >= minimumRequiredMicroliters;
    return {
        diagnostic: sufficient,
        reason: sufficient
            ? `${sweatVolumeMicroliters}uL sufficient for diagnostic result`
            : `${sweatVolumeMicroliters}uL insufficient (<${minimumRequiredMicroliters}uL) — non-diagnostic, mandatory repeat, no result estimation`
    };
}

module.exports = {
    checkRadioisotopePregnancyGate,
    labelImmunologyPatternResult,
    checkVariantReportReleaseGate,
    checkAcetaminophenNomogramAlert,
    checkNcseAlert,
    checkGuillainBarreAlert,
    checkContrastExtravasationAlert,
    checkMassiveHemoptysisAlert,
    checkSweatTestValidity
};

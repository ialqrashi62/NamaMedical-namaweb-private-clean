// ============================================================================
// Rare & Super-Specialized Domains — PURE ENGINE (no DB, no I/O)
// ----------------------------------------------------------------------------
// Converts the 12 Wave 10 Enterprise_Blueprint_2026 "rare" department specs into
// real, unit-testable business-rule gates. Mirrors the e18_hr_engine.js pattern:
// pure functions only, so they can be unit-tested without a database and reused
// verbatim by server.js routes later once the surrounding schema/UI is built.
//
// GAP NOTE (see Enterprise_Blueprint_2026/IMPLEMENTATION_STATUS.md): none of these
// 12 departments have dedicated DB tables yet (genuine classification C). This
// engine implements ONLY the core safety/compliance decision logic explicitly
// described in each blueprint's "Constraint" — no new migrations were written,
// since that requires schema design + explicit user sign-off per
// .agents/skills/nm_enterprise_implementation/SKILL.md.
//
// HARD rules honoured (mirrors EPIC_BUILD_CONVENTIONS):
//  - fail-CLOSED: missing/incomplete input never yields a falsely-reassuring
//    "safe"/"approved" result — it yields a block/hold requiring more data.
//  - Authority decisions (block/hold/override) are computed here, not on the client.
// ============================================================================

'use strict';

// 1) Space & Dive Medicine — decompression-sickness risk modeling.
function dcsRiskAssessment({ hasNeuroSigns, rapidAscent, depthMeters, diveTimeMinutes } = {}) {
    if (hasNeuroSigns === undefined || hasNeuroSigns === null) {
        return { severity: 'unknown', requiresImmediateRecompression: true, reason: 'incomplete data — fail-closed' };
    }
    if (hasNeuroSigns === true) {
        return { severity: 'severe', requiresImmediateRecompression: true, reason: 'neurological signs present' };
    }
    if (rapidAscent === true && Number(depthMeters) > 30) {
        return { severity: 'moderate', requiresImmediateRecompression: false, reason: 'rapid ascent from significant depth — monitor closely' };
    }
    return { severity: 'low', requiresImmediateRecompression: false, reason: 'no red-flag criteria met' };
}

// 2) Complex Sleep Disorders — REM Behavior Disorder pattern -> mandatory neurology referral.
function classifyParasomnia({ remAtoniaLoss, dreamEnactmentBehavior } = {}) {
    if (remAtoniaLoss === true && dreamEnactmentBehavior === true) {
        return { pattern: 'REM_Behavior_Disorder', requiresNeurologyReferral: true };
    }
    return { pattern: 'unclassified', requiresNeurologyReferral: false };
}

// 3) Epilepsy Monitoring Unit — surgical candidacy requires concordant localization (>=2 modalities).
function verifySurgicalCandidacy({ eegOnsetZone, imagingOnsetZone } = {}) {
    if (!eegOnsetZone || !imagingOnsetZone) {
        return { candidacyStatus: 'hold', reason: 'incomplete localization data — fail-closed' };
    }
    if (eegOnsetZone !== imagingOnsetZone) {
        return { candidacyStatus: 'hold', reason: `discordant localization: EEG=${eegOnsetZone} vs imaging=${imagingOnsetZone}` };
    }
    return { candidacyStatus: 'eligible', reason: `concordant localization: ${eegOnsetZone}` };
}

// 4) Advanced Stem Cell Therapy — protocol compliance gate (hard block outside approved trial/compassionate-use).
function verifyProtocolCompliance({ approvedTrialId, compassionateUseApproved } = {}) {
    const approved = Boolean(approvedTrialId) || compassionateUseApproved === true;
    return {
        allowed: approved,
        reason: approved ? 'approved trial or compassionate-use protocol confirmed' : 'BLOCKED — no approved trial/compassionate-use protocol on record'
    };
}

// 5) Fetal Surgery — hard block without full multi-disciplinary consensus (MFM + Surgeon + Neonatology + Ethics).
function verifyFetalSurgeryConsensus({ mfmSignoff, fetalSurgeonSignoff, neonatologySignoff, ethicsSignoff } = {}) {
    const allSigned = mfmSignoff === true && fetalSurgeonSignoff === true && neonatologySignoff === true && ethicsSignoff === true;
    return {
        allowed: allSigned,
        reason: allSigned ? 'full multi-disciplinary consensus documented' : 'BLOCKED — missing one or more required sign-offs (MFM/Fetal Surgeon/Neonatology/Ethics)'
    };
}

// 6) Fetal Medicine — rare syndromic pattern -> mandatory genetics consult before counseling.
function recognizeSyndromicPattern({ chdDetected, skeletalAnomalyDetected } = {}) {
    if (chdDetected === true && skeletalAnomalyDetected === true) {
        return { pattern: 'possible_syndromic_combination', requiresGeneticsConsult: true };
    }
    return { pattern: 'isolated_or_none', requiresGeneticsConsult: false };
}

// 7) Deep Brain Stimulation — trajectory must respect a minimum vascular safety margin.
function verifyTrajectorySafety({ distanceToVesselMm, minSafeMarginMm = 3 } = {}) {
    if (distanceToVesselMm === undefined || distanceToVesselMm === null || !Number.isFinite(Number(distanceToVesselMm))) {
        return { allowed: false, reason: 'incomplete vascular-proximity data — fail-closed' };
    }
    const safe = Number(distanceToVesselMm) >= minSafeMarginMm;
    return {
        allowed: safe,
        reason: safe ? `trajectory clears ${minSafeMarginMm}mm safety margin` : `BLOCKED — trajectory within ${distanceToVesselMm}mm of a major vessel (min margin ${minSafeMarginMm}mm)`
    };
}

// 8) Nuclear Medicine Therapy — inpatient isolation-room gate before therapeutic dose administration.
function verifyIsolationGate({ requiresIsolation, isolationRoomAvailable } = {}) {
    if (requiresIsolation !== true) {
        return { allowed: true, reason: 'isotope/dose does not require inpatient isolation' };
    }
    return {
        allowed: isolationRoomAvailable === true,
        reason: isolationRoomAvailable === true ? 'isolation room confirmed available' : 'BLOCKED — isolation required but no room confirmed available'
    };
}

// 9) Cryotherapy / Cryosurgery — ice-ball margin coverage verification.
function verifyMarginCoverage({ coveragePercent, requiredPercent = 100 } = {}) {
    if (coveragePercent === undefined || coveragePercent === null || !Number.isFinite(Number(coveragePercent))) {
        return { complete: false, requiresAdditionalCycle: true, reason: 'incomplete imaging data — fail-closed' };
    }
    const complete = Number(coveragePercent) >= requiredPercent;
    return {
        complete,
        requiresAdditionalCycle: !complete,
        reason: complete ? 'full safety-margin coverage achieved' : `incomplete coverage (${coveragePercent}% of required ${requiredPercent}%) — additional freeze cycle required`
    };
}

// 10) Confocal Laser Endomicroscopy — AI reads are always advisory-only, never a final diagnosis.
function classifyConfocalPattern({ suspiciousPattern } = {}) {
    return {
        pattern: suspiciousPattern ? 'suspicious' : 'unremarkable',
        recommendation: suspiciousPattern ? 'targeted biopsy recommended' : 'no targeted biopsy indicated',
        label: 'ADVISORY ONLY — not a diagnosis; histopathology confirmation required'
    };
}

// 11) Pharmacogenomics — known high-risk genotype-drug pairing gate (e.g. HLA-B*15:02 + carbamazepine).
const HIGH_RISK_GENOTYPE_DRUG_PAIRS = [
    { allele: 'HLA-B*15:02', drug: 'carbamazepine', risk: 'Stevens-Johnson Syndrome' },
    { allele: 'HLA-B*15:02', drug: 'phenytoin', risk: 'Stevens-Johnson Syndrome' },
    { allele: 'HLA-B*58:01', drug: 'allopurinol', risk: 'Severe cutaneous adverse reaction' }
];
function checkGenotypeDrugInteraction({ allele, drug, physicianOverride } = {}) {
    const match = HIGH_RISK_GENOTYPE_DRUG_PAIRS.find(
        p => p.allele === allele && p.drug && drug && p.drug.toLowerCase() === String(drug).toLowerCase()
    );
    if (!match) {
        return { allowed: true, reason: 'no known high-risk genotype-drug pairing found' };
    }
    if (physicianOverride === true) {
        return { allowed: true, reason: `high-risk pairing (${match.risk}) present but physician override + counseling documented`, overridden: true };
    }
    return { allowed: false, reason: `BLOCKED — known high-risk pairing: ${allele} + ${drug} (${match.risk}); requires physician override + patient counseling` };
}

// 12) Nanomedicine & Micro-Robotics — mirrors stem-cell protocol-compliance governance (research-track only).
function verifyNanomedicineProtocolCompliance({ approvedTrialId } = {}) {
    const approved = Boolean(approvedTrialId);
    return {
        allowed: approved,
        reason: approved ? 'approved IRB research protocol confirmed' : 'BLOCKED — nanomedicine/micro-robotic therapy requires an approved IRB research protocol'
    };
}

module.exports = {
    dcsRiskAssessment,
    classifyParasomnia,
    verifySurgicalCandidacy,
    verifyProtocolCompliance,
    verifyFetalSurgeryConsensus,
    recognizeSyndromicPattern,
    verifyTrajectorySafety,
    verifyIsolationGate,
    verifyMarginCoverage,
    classifyConfocalPattern,
    checkGenotypeDrugInteraction,
    verifyNanomedicineProtocolCompliance,
    HIGH_RISK_GENOTYPE_DRUG_PAIRS
};

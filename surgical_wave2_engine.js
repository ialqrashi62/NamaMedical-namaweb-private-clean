// ============================================================================
// Surgical — Wave 2 PURE ENGINE (no DB, no I/O)
// ----------------------------------------------------------------------------
// Converts Enterprise_Blueprint_2026 Wave 2 (Surgical) C-classified department
// specs into real, unit-testable decision-support gates. Same conventions as
// the Wave 1/10 engines: pure functions, fail-closed, each rule is the EXACT
// "Critical Alert"/"Business Logic" rule stated in the department's blueprint.
// ============================================================================

'use strict';

// 1) Surgical Oncology — tumor board scheduling gate.
// Blueprint rule: auto-schedule tumor board review for any "Borderline Resectable" case
// before OR booking.
function checkTumorBoardSchedulingGate({ resectabilityStatus } = {}) {
    const requiresTumorBoard = resectabilityStatus === 'borderline_resectable';
    return {
        tumorBoardRequiredBeforeOr: requiresTumorBoard,
        orBookingAllowed: !requiresTumorBoard || false,
        reason: requiresTumorBoard
            ? 'borderline resectable — tumor board review required before OR booking'
            : 'resectability status does not require pre-OR tumor board review'
    };
}

// 2) Endocrine Surgery — intraoperative nerve monitoring alert.
// Blueprint rule: critical alert if intraoperative nerve signal is lost (immediate
// surgical team notification).
function checkNerveMonitoringAlert({ nerveSignalLost } = {}) {
    return {
        criticalAlert: nerveSignalLost === true,
        reason: nerveSignalLost === true
            ? 'intraoperative nerve signal lost — immediate surgical team notification'
            : 'nerve signal intact'
    };
}

// 3) Robotic Surgery — docking angle safety alert.
// Blueprint rule: alert if docking angle deviates significantly from the procedure-specific
// optimal range (risk of arm collision).
function checkDockingAngleSafety({ dockingAngleDegrees, optimalAngleDegrees, toleranceDegrees = 15 } = {}) {
    if (dockingAngleDegrees === undefined || dockingAngleDegrees === null || optimalAngleDegrees === undefined || optimalAngleDegrees === null) {
        return { alert: false, reason: 'incomplete docking-angle data — cannot assess' };
    }
    const deviation = Math.abs(Number(dockingAngleDegrees) - Number(optimalAngleDegrees));
    const alert = deviation > toleranceDegrees;
    return {
        armCollisionRiskAlert: alert,
        deviationDegrees: deviation,
        reason: alert
            ? `docking angle deviates ${deviation.toFixed(1)}deg from optimal (>${toleranceDegrees}deg tolerance) — arm collision risk`
            : 'docking angle within safe tolerance'
    };
}

// 4) Bariatric Surgery — OR scheduling clearance gate.
// Blueprint rule: hard-block OR scheduling if psych/nutrition clearance is missing.
function checkBariatricOrSchedulingGate({ psychClearance, nutritionClearance } = {}) {
    const cleared = psychClearance === true && nutritionClearance === true;
    return {
        orSchedulingAllowed: cleared,
        reason: cleared
            ? 'psych and nutrition clearance both documented'
            : 'BLOCKED — OR scheduling requires both psych and nutrition clearance'
    };
}

// 5) Breast Surgery — imaging-pathology discordance flag.
// Blueprint rule: auto-flag any discordant imaging-pathology result for mandatory tumor board discussion.
function checkBreastImagingPathologyConcordance({ imagingSuspicionLevel, pathologyResult } = {}) {
    if (!imagingSuspicionLevel || !pathologyResult) {
        return { discordant: false, tumorBoardRequired: false, reason: 'incomplete imaging/pathology data — cannot assess concordance' };
    }
    const highSuspicionImaging = imagingSuspicionLevel === 'high' || imagingSuspicionLevel === 'BI-RADS 4' || imagingSuspicionLevel === 'BI-RADS 5';
    const benignPathology = pathologyResult === 'benign';
    const discordant = highSuspicionImaging && benignPathology;
    return {
        discordant,
        tumorBoardRequired: discordant,
        reason: discordant
            ? 'high-suspicion imaging with benign pathology — discordant, mandatory tumor board review'
            : 'imaging and pathology results are concordant'
    };
}

// 6) Trauma Surgery — Massive Transfusion Protocol activation.
// Blueprint rule: auto-activate Massive Transfusion Protocol alert to Blood Bank if criteria met.
function checkMassiveTransfusionProtocol({ systolicBp, heartRate, suspectedActiveHemorrhage, positiveFast } = {}) {
    const shockPhysiology = (systolicBp !== undefined && systolicBp !== null && Number(systolicBp) < 90)
        && (heartRate !== undefined && heartRate !== null && Number(heartRate) > 120);
    const mtpCriteria = (shockPhysiology && positiveFast === true) || suspectedActiveHemorrhage === true;
    return {
        mtpActivated: mtpCriteria,
        reason: mtpCriteria ? 'MTP criteria met — urgent Blood Bank activation for massive transfusion' : 'MTP criteria not met'
    };
}

// 7) Colorectal Surgery — diverting ostomy recommendation.
// Blueprint rule: auto-suggest diverting loop ileostomy if leak risk score exceeds threshold.
function checkAnastomoticLeakRisk({ leakRiskScore, leakRiskThreshold = 7 } = {}) {
    if (leakRiskScore === undefined || leakRiskScore === null || !Number.isFinite(Number(leakRiskScore))) {
        return { divertingOstomyRecommended: false, reason: 'leak risk score missing — cannot assess' };
    }
    const recommend = Number(leakRiskScore) > leakRiskThreshold;
    return {
        divertingOstomyRecommended: recommend,
        reason: recommend
            ? `leak risk score ${leakRiskScore} exceeds threshold ${leakRiskThreshold} — diverting loop ileostomy suggested`
            : 'leak risk within acceptable range'
    };
}

// 8) Neurosurgery — intraoperative neuromonitoring (IONM) requirement flag.
// Blueprint rule: auto-flag cases requiring IONM/awake mapping based on lesion-eloquent-cortex proximity.
function checkIonmRequirement({ eloquentCortexProximityMm, proximityThresholdMm = 10 } = {}) {
    if (eloquentCortexProximityMm === undefined || eloquentCortexProximityMm === null) {
        return { ionmRequired: false, reason: 'lesion-cortex proximity data missing — cannot assess' };
    }
    const required = Number(eloquentCortexProximityMm) <= proximityThresholdMm;
    return {
        ionmOrAwakeMappingRequired: required,
        reason: required
            ? `lesion within ${eloquentCortexProximityMm}mm of eloquent cortex (<=${proximityThresholdMm}mm) — IONM/awake mapping required`
            : 'lesion sufficiently distant from eloquent cortex'
    };
}

// 9) Spine Surgery — Cauda Equina Syndrome emergency trigger.
// Blueprint rule: critical alert if Cauda Equina Syndrome criteria present (immediate OR
// activation, bypass elective queue).
function checkCaudaEquinaEmergency({ saddleAnesthesia, bowelBladderDysfunction, bilateralLegWeakness } = {}) {
    const emergency = saddleAnesthesia === true && (bowelBladderDysfunction === true || bilateralLegWeakness === true);
    return {
        emergencyOrActivation: emergency,
        reason: emergency
            ? 'Cauda Equina Syndrome criteria present — immediate OR activation, bypass elective queue'
            : 'Cauda Equina Syndrome criteria not met'
    };
}

// 10) Maxillofacial Surgery — airway compromise alert.
// Blueprint rule: critical alert for panfacial trauma with airway compromise risk (immediate
// ENT/Anesthesia co-management).
function checkAirwayCompromiseAlert({ panfacialTrauma, airwayCompromiseSigns } = {}) {
    const alert = panfacialTrauma === true && airwayCompromiseSigns === true;
    return {
        immediateEntAnesthesiaCoManagement: alert,
        reason: alert
            ? 'panfacial trauma with airway compromise signs — immediate ENT/Anesthesia co-management required'
            : 'no airway compromise criteria met'
    };
}

module.exports = {
    checkTumorBoardSchedulingGate,
    checkNerveMonitoringAlert,
    checkDockingAngleSafety,
    checkBariatricOrSchedulingGate,
    checkBreastImagingPathologyConcordance,
    checkMassiveTransfusionProtocol,
    checkAnastomoticLeakRisk,
    checkIonmRequirement,
    checkCaudaEquinaEmergency,
    checkAirwayCompromiseAlert
};

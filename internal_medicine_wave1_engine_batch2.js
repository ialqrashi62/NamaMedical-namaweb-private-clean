// ============================================================================
// Internal Medicine — Wave 1 PURE ENGINE, batch 2 (no DB, no I/O)
// ----------------------------------------------------------------------------
// Same conventions as internal_medicine_wave1_engine.js: pure functions,
// fail-closed on missing data, each rule is the EXACT numeric "Critical Alert"
// stated in the department's own blueprint file.
// ============================================================================

'use strict';

// 1) Hepatology — liver failure alert.
// Blueprint rule: Bilirubin > 5 mg/dL OR INR > 2.0 -> Urgent Liver Failure alert.
function checkLiverFailureAlert({ bilirubinMgDl, inr } = {}) {
    const bilirubinHigh = bilirubinMgDl !== undefined && bilirubinMgDl !== null && Number(bilirubinMgDl) > 5;
    const inrHigh = inr !== undefined && inr !== null && Number(inr) > 2.0;
    const alert = bilirubinHigh || inrHigh;
    return {
        urgentLiverFailureAlert: alert,
        reason: alert
            ? `${bilirubinHigh ? `bilirubin=${bilirubinMgDl}mg/dL ` : ''}${inrHigh ? `INR=${inr}` : ''}`.trim()
            : 'liver function within alert-free range'
    };
}

// 2) Pancreato-Biliary — acute pancreatitis alert.
// Blueprint rule: Lipase > 3x Upper Limit of Normal -> Acute Pancreatitis alert.
function checkAcutePancreatitisAlert({ lipaseValue, upperLimitNormal } = {}) {
    if (lipaseValue === undefined || lipaseValue === null || upperLimitNormal === undefined || upperLimitNormal === null) {
        return { alert: false, reason: 'incomplete lipase/ULN data — cannot assess' };
    }
    const alert = Number(lipaseValue) > 3 * Number(upperLimitNormal);
    return {
        acutePancreatitisAlert: alert,
        reason: alert ? `lipase ${lipaseValue} > 3x ULN (${3 * upperLimitNormal})` : 'lipase within expected range'
    };
}

// 3) Renal Transplant — rejection workup trigger.
// Blueprint rule: Creatinine rises > 20% from baseline post-transplant -> Urgent Rejection Workup alert.
function checkTransplantRejectionRisk({ currentCreatinineMgDl, baselineCreatinineMgDl } = {}) {
    if (!currentCreatinineMgDl || !baselineCreatinineMgDl || Number(baselineCreatinineMgDl) <= 0) {
        return { urgentRejectionWorkup: false, reason: 'incomplete creatinine baseline/current data — cannot assess' };
    }
    const pctRise = ((Number(currentCreatinineMgDl) - Number(baselineCreatinineMgDl)) / Number(baselineCreatinineMgDl)) * 100;
    const alert = pctRise > 20;
    return {
        urgentRejectionWorkup: alert,
        percentRiseFromBaseline: Math.round(pctRise * 10) / 10,
        reason: alert ? `creatinine rose ${pctRise.toFixed(1)}% from baseline (>20% threshold)` : 'creatinine within expected post-transplant range'
    };
}

// 4) Medical Oncology — neutropenia chemo safety lock.
// Blueprint rule: ANC < 1000 -> block chemotherapy administration without physician override.
function checkChemoSafetyLock({ ancValue, physicianOverride } = {}) {
    if (ancValue === undefined || ancValue === null || !Number.isFinite(Number(ancValue))) {
        return { allowed: false, reason: 'ANC value missing — fail-closed, chemo administration blocked' };
    }
    const neutropenic = Number(ancValue) < 1000;
    if (!neutropenic) {
        return { allowed: true, reason: `ANC ${ancValue} above neutropenia threshold` };
    }
    return {
        allowed: physicianOverride === true,
        reason: physicianOverride === true
            ? `ANC ${ancValue} <1000 (neutropenic) but physician override documented`
            : `BLOCKED — ANC ${ancValue} <1000 (neutropenia risk); requires physician override`
    };
}

// 5) Hematology — hyperleukocytosis alert.
// Blueprint rule: WBC > 100,000 -> Urgent Leukapheresis Consideration alert.
function checkHyperleukocytosisAlert({ wbcCount } = {}) {
    if (wbcCount === undefined || wbcCount === null || !Number.isFinite(Number(wbcCount))) {
        return { alert: false, reason: 'WBC count missing — cannot assess' };
    }
    const alert = Number(wbcCount) > 100000;
    return {
        urgentLeukapheresisConsideration: alert,
        reason: alert ? `WBC ${wbcCount} > 100,000 (hyperleukocytosis)` : 'WBC within expected range'
    };
}

// 6) Coagulation/Anemia — urgent transfusion/reversal alert.
// Blueprint rule: Hemoglobin < 7 g/dL OR INR > 5.0 -> Urgent Transfusion/Reversal alert.
function checkTransfusionReversalAlert({ hemoglobinGdl, inr } = {}) {
    const hgbLow = hemoglobinGdl !== undefined && hemoglobinGdl !== null && Number(hemoglobinGdl) < 7;
    const inrHigh = inr !== undefined && inr !== null && Number(inr) > 5.0;
    const alert = hgbLow || inrHigh;
    return {
        urgentTransfusionReversalAlert: alert,
        reason: alert
            ? `${hgbLow ? `Hgb=${hemoglobinGdl}g/dL ` : ''}${inrHigh ? `INR=${inr}` : ''}`.trim()
            : 'hemoglobin/INR within safe range'
    };
}

// 7) BMT Unit — febrile neutropenia protocol trigger.
// Blueprint rule: Fever > 38.3C during neutropenic phase -> Immediate Febrile Neutropenia Protocol
// (blood cultures + broad-spectrum antibiotics within 1 hour).
function checkFebrileNeutropeniaProtocol({ temperatureCelsius, inNeutropenicPhase } = {}) {
    if (temperatureCelsius === undefined || temperatureCelsius === null) {
        return { protocolTriggered: false, reason: 'temperature missing — cannot assess' };
    }
    const triggered = inNeutropenicPhase === true && Number(temperatureCelsius) > 38.3;
    return {
        protocolTriggered: triggered,
        reason: triggered
            ? `fever ${temperatureCelsius}C during neutropenic phase — blood cultures + broad-spectrum antibiotics within 1 hour`
            : 'febrile neutropenia criteria not met'
    };
}

// 8) Gynecologic Oncology — recurrence workup trigger.
// Blueprint rule: CA-125 rises significantly post-treatment -> Recurrence Workup alert.
// "Significantly" is not numerically fixed in the blueprint; uses a configurable percent-rise
// threshold (default 50%, in line with common CA-125 doubling/rise conventions) — advisory only.
function checkGynOncRecurrenceRisk({ currentCA125, nadirCA125, significantRisePercent = 50 } = {}) {
    if (!currentCA125 || !nadirCA125 || Number(nadirCA125) <= 0) {
        return { recurrenceWorkupAlert: false, reason: 'incomplete CA-125 nadir/current data — cannot assess' };
    }
    const pctRise = ((Number(currentCA125) - Number(nadirCA125)) / Number(nadirCA125)) * 100;
    const alert = pctRise >= significantRisePercent;
    return {
        recurrenceWorkupAlert: alert,
        percentRiseFromNadir: Math.round(pctRise * 10) / 10,
        reason: alert ? `CA-125 rose ${pctRise.toFixed(1)}% from nadir (>= ${significantRisePercent}% threshold)` : 'CA-125 stable relative to nadir'
    };
}

module.exports = {
    checkLiverFailureAlert,
    checkAcutePancreatitisAlert,
    checkTransplantRejectionRisk,
    checkChemoSafetyLock,
    checkHyperleukocytosisAlert,
    checkTransfusionReversalAlert,
    checkFebrileNeutropeniaProtocol,
    checkGynOncRecurrenceRisk
};

// pharmacy_engine.js
// Pharmacy pure-functions engine (drug interactions + renal dose adjustment)
// Reference: Lexicomp 2024 + Sanford Guide 2024 + ASHP

'use strict';

// ============================================================
// Drug interaction check
// Severity: contraindicated | major | moderate | minor | none
// ============================================================
const KNOWN_INTERACTIONS = {
    'warfarin+aspirin':           { severity: 'major',           effect: 'Bleeding risk' },
    'warfarin+amiodarone':         { severity: 'major',           effect: 'INR increase; bleeding' },
    'warfarin+fluconazole':        { severity: 'major',           effect: 'INR increase; bleeding' },
    'warfarin+trimethoprim':       { severity: 'major',           effect: 'INR increase; bleeding' },
    'simvastatin+clarithromycin': { severity: 'contraindicated', effect: 'Rhabdomyolysis' },
    'simvastatin+itraconazole':    { severity: 'contraindicated', effect: 'Rhabdomyolysis' },
    'simvastatin+cyclosporine':   { severity: 'major',           effect: 'Rhabdomyolysis' },
    'metformin+iodinated_contrast':{ severity: 'moderate',       effect: 'Lactic acidosis if eGFR < 30' },
    'digoxin+amiodarone':          { severity: 'major',           effect: 'Digoxin toxicity' },
    'digoxin+verapamil':           { severity: 'major',           effect: 'Digoxin toxicity' },
    'lithium+thiazide':            { severity: 'major',           effect: 'Lithium toxicity' },
    'lithium+nsaid':               { severity: 'moderate',        effect: 'Lithium toxicity' },
    'maoi+ssri':                   { severity: 'contraindicated', effect: 'Serotonin syndrome' },
    'maoi+tyramine':               { severity: 'contraindicated', effect: 'Hypertensive crisis' },
    'methotrexate+trimethoprim':   { severity: 'major',           effect: 'Bone marrow suppression' },
    'tramadol+ssri':               { severity: 'major',           effect: 'Serotonin syndrome' },
    'tramadol+maoi':               { severity: 'contraindicated', effect: 'Serotonin syndrome' },
    'potassium+acei':              { severity: 'moderate',        effect: 'Hyperkalemia' },
    'potassium+spironolactone':    { severity: 'moderate',        effect: 'Hyperkalemia' },
    'metoclopramide+dopamine_antagonist': { severity: 'moderate', effect: 'Extrapyramidal effects' }
};

function checkDrugInteractions(input) {
    if (!input) throw new Error('checkDrugInteractions: input required');
    if (!Array.isArray(input.drugs) || input.drugs.length < 2) {
        throw new Error('checkDrugInteractions: need at least 2 drugs');
    }
    const drugs = input.drugs.map(d => String(d).toLowerCase().trim());
    const found = [];
    const seen = new Set();
    for (let i = 0; i < drugs.length; i++) {
        for (let j = i + 1; j < drugs.length; j++) {
            const a = drugs[i], b = drugs[j];
            const key1 = `${a}+${b}`;
            const key2 = `${b}+${a}`;
            const match = KNOWN_INTERACTIONS[key1] || KNOWN_INTERACTIONS[key2];
            if (match && !seen.has(key1)) {
                seen.add(key1);
                found.push({
                    drug_a: a,
                    drug_b: b,
                    severity: match.severity,
                    effect: match.effect,
                    action: match.severity === 'contraindicated'
                        ? 'DO NOT co-administer'
                        : match.severity === 'major'
                        ? 'Avoid or use with caution; monitor closely'
                        : match.severity === 'moderate'
                        ? 'Monitor; consider dose adjustment'
                        : 'No action needed'
                });
            }
        }
    }
    // Sort by severity
    const sevOrder = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
    found.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
    return {
        drugs,
        interactions_found: found.length,
        interactions: found,
        highest_severity: found.length > 0 ? found[0].severity : 'none',
        cite: 'Lexicomp-2024-Sanford-2024'
    };
}

// ============================================================
// Renal dose adjustment (Cockcroft-Gault)
// ============================================================
function cockcroftGault(input) {
    if (!input) throw new Error('cockcroftGault: input required');
    const required = ['age', 'weight_kg', 'serum_creatinine_mg_dl', 'sex'];
    for (const k of required) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`cockcroftGault: ${k} required`);
        }
    }
    const { age, weight_kg, serum_creatinine_mg_dl, sex } = input;
    let crcl = ((140 - age) * weight_kg) / (72 * serum_creatinine_mg_dl);
    if (sex === 'female') crcl *= 0.85;
    crcl = Math.round(crcl * 10) / 10;
    let stage, recommendation;
    if (crcl >= 90)       { stage = 'G1-normal';     recommendation = 'No adjustment'; }
    else if (crcl >= 60)  { stage = 'G2-mild_loss';  recommendation = 'No adjustment (monitor)'; }
    else if (crcl >= 45)  { stage = 'G3a-mild-mod';  recommendation = '50-75% dose for renally cleared drugs'; }
    else if (crcl >= 30)  { stage = 'G3b-mod-severe';recommendation = '25-50% dose or extend interval'; }
    else if (crcl >= 15)  { stage = 'G4-severe';     recommendation = 'Avoid or use 25% dose'; }
    else                  { stage = 'G5-dialysis';   recommendation = 'Avoid; nephrology consult'; }
    return {
        crcl_ml_per_min: crcl,
        ckd_stage: stage,
        recommendation,
        formula: 'Cockcroft-Gault',
        cite: 'NKF-KDOQI-2024'
    };
}

// ============================================================
// Renal-adjusted dose recommendation
// ============================================================
function renalAdjustedDose(input) {
    if (!input) throw new Error('renalAdjustedDose: input required');
    const required = ['drug_name', 'standard_dose_mg', 'frequency_per_day',
                      'age', 'weight_kg', 'serum_creatinine_mg_dl', 'sex'];
    for (const k of required) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`renalAdjustedDose: ${k} required`);
        }
    }
    const { drug_name, standard_dose_mg, frequency_per_day,
            age, weight_kg, serum_creatinine_mg_dl, sex } = input;
    const cg = cockcroftGault({ age, weight_kg, serum_creatinine_mg_dl, sex });
    let factor;
    if (cg.crcl_ml_per_min >= 60)      factor = 1.0;
    else if (cg.crcl_ml_per_min >= 45) factor = 0.75;
    else if (cg.crcl_ml_per_min >= 30) factor = 0.5;
    else if (cg.crcl_ml_per_min >= 15) factor = 0.25;
    else                               factor = 0.0; // avoid

    return {
        drug_name: String(drug_name),
        standard_dose_mg,
        crcl_ml_per_min: cg.crcl_ml_per_min,
        ckd_stage: cg.ckd_stage,
        dose_adjustment_factor: factor,
        adjusted_dose_mg: standard_dose_mg * factor,
        frequency_per_day,
        recommendation: factor === 0
            ? `${drug_name}: AVOID in severe renal impairment`
            : `${drug_name}: ${Math.round(standard_dose_mg * factor)} mg ${frequency_per_day}x/day (${factor*100}% of standard)`,
        cite: 'Lexicomp-2024-renal-dose'
    };
}

// ============================================================
// Pregnancy drug safety (FDA category A/B/C/D/X + new labeling)
// ============================================================
const PREGNANCY_RISK = {
    'warfarin': 'X', 'isotretinoin': 'X', 'methotrexate': 'X',
    'ace_inhibitors': 'D', 'arb_blockers': 'D',
    'valproate': 'D', 'carbamazepine': 'D', 'phenytoin': 'D',
    'metronidazole': 'B', 'amoxicillin': 'B', 'acetaminophen': 'B',
    'doxycycline': 'D', 'tetracycline': 'D',
    'ssri_paroxetine': 'D', 'ssri_sertraline': 'C',
    'fluconazole_high_dose': 'D', 'fluconazole_single': 'C',
    'lisinopril': 'D', 'losartan': 'D'
};

function pregnancyDrugCheck(input) {
    if (!input) throw new Error('pregnancyDrugCheck: input required');
    if (!Array.isArray(input.drugs)) {
        throw new Error('pregnancyDrugCheck: drugs array required');
    }
    const found = input.drugs.map(d => {
        const key = String(d).toLowerCase().trim();
        const risk = PREGNANCY_RISK[key];
        return {
            drug: d,
            fda_category: risk || 'unknown',
            recommendation: !risk ? 'Unknown — verify with reference'
                : risk === 'X' ? 'CONTRAINDICATED in pregnancy'
                : risk === 'D' ? 'Avoid in pregnancy; risk outweighs benefit'
                : risk === 'C' ? 'Use only if benefit outweighs risk'
                : 'Generally safe in pregnancy'
        };
    });
    return {
        drugs: input.drugs,
        results: found,
        highest_risk: found.some(r => r.fda_category === 'X') ? 'X'
            : found.some(r => r.fda_category === 'D') ? 'D'
            : found.some(r => r.fda_category === 'C') ? 'C' : 'safe',
        cite: 'FDA-PLRE-2014-Lexicomp-2024'
    };
}

module.exports = {
    checkDrugInteractions,
    cockcroftGault,
    renalAdjustedDose,
    pregnancyDrugCheck,
    KNOWN_INTERACTIONS,
    PREGNANCY_RISK,
    VERSION: '3.0.0',
    CITATIONS: {
        'Lexicomp-2024-Sanford-2024': 'Lexicomp Drug Interactions 2024 + Sanford Guide 2024',
        'NKF-KDOQI-2024': 'National Kidney Foundation KDOQI 2024',
        'Lexicomp-2024-renal-dose': 'Lexicomp Renal Dose Adjustments 2024',
        'FDA-PLRE-2014-Lexicomp-2024': 'FDA Pregnancy and Lactation Labeling Rule 2014 + Lexicomp 2024'
    }
};

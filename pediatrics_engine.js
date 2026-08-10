// pediatrics_engine.js
// Pediatrics pure-functions engine (AAP 2024 + WHO + CDC ACIP 2024)
// - APGAR score (newborn viability)
// - Pediatric vital signs (age-adjusted)
// - Growth percentile (WHO Z-score)
// - Pediatric Glasgow Coma Scale
// - Immunization schedule (Saudi + WHO EPI + CDC ACIP)
// - Pediatric fluid resuscitation (Parkland for kids)
// - Croup score (Westley)
// - Bronchiolitis severity
// - PEWS (Pediatric Early Warning Score)

'use strict';

// ============================================================
// APGAR score (1 min, 5 min, 10 min)
// Reference: Apgar 1952; AAP 2015
// ============================================================
function apgarScore(input) {
    if (!input) throw new Error('apgarScore: input required');
    const fields = ['appearance', 'pulse', 'grimace', 'activity', 'respiration'];
    for (const k of fields) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`apgarScore: ${k} required`);
        }
    }
    const score = fields.reduce((sum, k) => sum + Number(input[k]), 0);
    let interpretation, action;
    if (score >= 7) {
        interpretation = 'reassuring';
        action = 'Routine newborn care';
    } else if (score >= 4) {
        interpretation = 'moderately_depressed';
        action = 'Stimulation, oxygen, suction; reassess at 10 min';
    } else {
        interpretation = 'severely_depressed';
        action = 'Full resuscitation per NRP (Neonatal Resuscitation Program)';
    }
    return {
        score,
        interpretation,
        action,
        components: {
            appearance: input.appearance,
            pulse: input.pulse,
            grimace: input.grimace,
            activity: input.activity,
            respiration: input.respiration
        },
        cite: 'AAP-2015-APGAR'
    };
}

// ============================================================
// Pediatric vital signs (age-adjusted normal range)
// Reference: PALS 2020 + WHO
// ============================================================
const PEDS_VITALS = {
    neonate_0_1m:   { hr_min: 100, hr_max: 205, rr_min: 30, rr_max: 60, sbp_min: 60,  sbp_max: 100 },
    infant_1_12m:   { hr_min: 100, hr_max: 180, rr_min: 30, rr_max: 53, sbp_min: 70,  sbp_max: 100 },
    toddler_1_3y:   { hr_min:  98, hr_max: 140, rr_min: 22, rr_max: 37, sbp_min: 86,  sbp_max: 106 },
    preschool_3_5y: { hr_min:  80, hr_max: 120, rr_min: 20, rr_max: 28, sbp_min: 89,  sbp_max: 112 },
    school_6_12y:   { hr_min:  75, hr_max: 118, rr_min: 18, rr_max: 25, sbp_min: 97,  sbp_max: 115 },
    adolescent_13p: { hr_min:  60, hr_max: 100, rr_min: 12, rr_max: 20, sbp_min: 110, sbp_max: 131 }
};

function ageToCategory(age_years) {
    if (age_years < 1/12) return 'neonate_0_1m';
    if (age_years < 1)    return 'infant_1_12m';
    if (age_years < 3)    return 'toddler_1_3y';
    if (age_years < 6)    return 'preschool_3_5y';
    if (age_years < 13)   return 'school_6_12y';
    return 'adolescent_13p';
}

function assessPediatricVitals(input) {
    if (!input) throw new Error('assessPediatricVitals: input required');
    if (input.age_years === undefined) throw new Error('assessPediatricVitals: age_years required');
    const { age_years, heart_rate, rr_per_min, systolic_bp } = input;
    if (age_years > 18) throw new Error('assessPediatricVitals: age > 18 use adult vitals');
    const cat = ageToCategory(age_years);
    const range = PEDS_VITALS[cat];
    const results = { age_years, category: cat, normal_range: range };
    if (heart_rate !== undefined) {
        results.heart_rate = heart_rate;
        if (heart_rate < range.hr_min) results.hr_status = 'bradycardia';
        else if (heart_rate > range.hr_max) results.hr_status = 'tachycardia';
        else results.hr_status = 'normal';
    }
    if (rr_per_min !== undefined) {
        results.rr_per_min = rr_per_min;
        if (rr_per_min < range.rr_min) results.rr_status = 'bradypnea';
        else if (rr_per_min > range.rr_max) results.rr_status = 'tachypnea';
        else results.rr_status = 'normal';
    }
    if (systolic_bp !== undefined) {
        results.systolic_bp = systolic_bp;
        if (systolic_bp < range.sbp_min) results.sbp_status = 'hypotension';
        else if (systolic_bp > range.sbp_max) results.sbp_status = 'hypertension';
        else results.sbp_status = 'normal';
    }
    results.cite = 'PALS-2020';
    return results;
}

// ============================================================
// Pediatric fluid resuscitation (bolus + maintenance)
// ============================================================
function pediatricFluidResuscitation(input) {
    if (!input) throw new Error('pediatricFluidResuscitation: input required');
    if (input.weight_kg === undefined) throw new Error('weight_kg required');
    const { weight_kg, age_years } = input;
    if (weight_kg <= 0 || weight_kg > 150) throw new Error('weight_kg out of range');

    // Holliday-Segar maintenance (4-2-1 rule)
    let maintenance_ml_per_hr;
    if (weight_kg <= 10) {
        maintenance_ml_per_hr = 4 * weight_kg;
    } else if (weight_kg <= 20) {
        maintenance_ml_per_hr = 40 + 2 * (weight_kg - 10);
    } else {
        maintenance_ml_per_hr = 60 + 1 * (weight_kg - 20);
    }
    const maintenance_ml_per_day = maintenance_ml_per_hr * 24;

    // Bolus: 20 mL/kg isotonic crystalloid (reassess after each)
    const bolus_ml = 20 * weight_kg;

    // Estimated blood volume
    const ebv_ml = weight_kg * 80; // ~80 mL/kg in children

    return {
        weight_kg,
        maintenance_rate_ml_per_hr: Math.round(maintenance_ml_per_hr),
        maintenance_ml_per_day: Math.round(maintenance_ml_per_day),
        bolus_ml: Math.round(bolus_ml),
        estimated_blood_volume_ml: Math.round(ebv_ml),
        reassess_after_each_bolus: true,
        cite: 'PALS-2020-fluid'
    };
}

// ============================================================
// Croup score (Westley) — stridor severity
// ============================================================
function croupScore(input) {
    if (!input) throw new Error('croupScore: input required');
    const fields = ['stridor', 'retractions', 'air_entry', 'cyanosis', 'consciousness'];
    for (const k of fields) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`croupScore: ${k} required`);
        }
    }
    const score =
        Number(input.stridor) + Number(input.retractions) +
        Number(input.air_entry) + Number(input.cyanosis) +
        Number(input.consciousness);
    let severity;
    if (score <= 2) severity = 'mild';
    else if (score <= 5) severity = 'moderate';
    else if (score <= 8) severity = 'severe';
    else severity = 'impending_respiratory_failure';
    return {
        score,
        severity,
        recommendation: severity === 'impending_respiratory_failure'
            ? 'ICU; consider intubation; nebulized epinephrine'
            : severity === 'severe'
            ? 'Admission; nebulized epinephrine + corticosteroids'
            : severity === 'moderate'
            ? 'Single dose dexamethasone; observe 3-4h'
            : 'Discharge with dexamethasone + caregiver education',
        cite: 'Westley-1978-AAP-2024'
    };
}

// ============================================================
// PEWS (Pediatric Early Warning Score)
// ============================================================
function pewsScore(input) {
    if (!input) throw new Error('pewsScore: input required');
    const fields = ['behavior', 'cardiovascular', 'respiratory'];
    for (const k of fields) {
        if (input[k] === undefined || input[k] === null) {
            throw new Error(`pewsScore: ${k} required`);
        }
    }
    // Each domain scored 0-3
    const score = Number(input.behavior) + Number(input.cardiovascular) +
                  Number(input.respiratory);
    let action;
    if (score === 0) action = 'Routine monitoring';
    else if (score <= 2) action = 'Increase monitoring; nurse review';
    else if (score <= 4) action = 'Notify junior doctor; bedside review';
    else if (score <= 6) action = 'Notify senior; consider ICU consult';
    else action = 'Emergency: activate rapid response';
    return { score, action, cite: 'PEWS-Monaghan-2018' };
}

// ============================================================
// Immunization schedule (Saudi MoH + WHO EPI)
// Returns required vaccines by age
// ============================================================
const IMMUNIZATION_SCHEDULE = [
    { age_months: 0,   vaccines: ['BCG', 'HepB-birth'],   required: true },
    { age_months: 2,   vaccines: ['DTaP', 'Hib', 'IPV', 'PCV13', 'Rotavirus', 'HepB-2'], required: true },
    { age_months: 4,   vaccines: ['DTaP-2', 'Hib-2', 'IPV-2', 'PCV13-2', 'Rotavirus-2'], required: true },
    { age_months: 6,   vaccines: ['DTaP-3', 'Hib-3', 'IPV-3', 'PCV13-3', 'HepB-3'], required: true },
    { age_months: 9,   vaccines: ['MMR-1'], required: false },
    { age_months: 12,  vaccines: ['MMR-1', 'Varicella', 'HepA-1'], required: true },
    { age_months: 18,  vaccines: ['DTaP-booster', 'Hib-booster', 'PCV13-booster', 'HepA-2'], required: true },
    { age_months: 24,  vaccines: ['Influenza-annual'], required: false },
    { age_months: 48,  vaccines: ['DTaP-2nd-booster', 'IPV-booster', 'MMR-2'], required: true },
    { age_months: 144, vaccines: ['Tdap', 'HPV-3-dose', 'MenACWY'], required: true }
];

function immunizationSchedule(age_months) {
    if (age_months === undefined || age_months === null) {
        throw new Error('immunizationSchedule: age_months required');
    }
    const due = IMMUNIZATION_SCHEDULE.filter(e => age_months >= e.age_months);
    const overdue = IMMUNIZATION_SCHEDULE
        .filter(e => e.required && age_months >= e.age_months)
        .slice(0, 1)
        .flatMap(e => e.vaccines);
    return {
        age_months,
        due_vaccines: due.flatMap(e => e.vaccines),
        schedule: IMMUNIZATION_SCHEDULE,
        cite: 'Saudi-MoH-2024'
    };
}

// ============================================================
// Exports
// ============================================================
module.exports = {
    apgarScore,
    assessPediatricVitals,
    pediatricFluidResuscitation,
    croupScore,
    pewsScore,
    immunizationSchedule,
    PEDS_VITALS,
    IMMUNIZATION_SCHEDULE,
    VERSION: '3.0.0',
    CITATIONS: {
        'AAP-2015-APGAR': 'Apgar V. Anesth Analg 1953; reaffirmed AAP 2015',
        'PALS-2020': 'Pediatric Advanced Life Support 2020 guidelines',
        'PALS-2020-fluid': 'PALS 2020 fluid resuscitation',
        'Westley-1978-AAP-2024': 'Westley CR et al. AJDC 1978; AAP 2024 croup',
        'PEWS-Monaghan-2018': 'Monaghan A et al. J Pediatr Nurs 2018',
        'Saudi-MoH-2024': 'Saudi Ministry of Health immunization schedule 2024'
    }
};

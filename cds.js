/**
 * cds.js — E1 Clinical Decision Support engine (PURE, unit-testable, FAIL-SAFE).
 *
 * CLINICAL-SAFETY CRITICAL. These functions are deterministic and side-effect free:
 * no DB, no HTTP, no I/O. They take explicit inputs and return STRUCTURED ALERTS so the
 * caller (server route) decides whether to hard-stop, soft-warn, or persist an override.
 *
 * ---------------------------------------------------------------------------
 * ALERT SHAPE (every check returns an array of these):
 *   {
 *     rule:        'drug-drug' | 'allergy' | 'dose' | 'duplicate',
 *     severity:    'info' | 'warning' | 'critical',
 *     message:     string  (English; bilingual fields message_en/message_ar also present),
 *     message_en:  string,
 *     message_ar:  string,
 *     overridable: boolean,
 *     subjects:    string[]  (the drugs/items the alert is about),
 *     fail_safe:   boolean   (true => surfaced BECAUSE data was missing/uncertain, not a confirmed hit)
 *   }
 *
 * SEVERITY / OVERRIDE CONTRACT (enforced by the route layer, defined here):
 *   - 'critical'  => HARD-STOP. The route MUST block (HTTP 422) unless an explicit
 *                    override_reason is supplied, in which case the override is AUDITED.
 *                    overridable=true means "blockable but override-able WITH reason".
 *                    overridable=false would mean absolutely no override (not used today;
 *                    every critical here is override-with-reason per spec).
 *   - 'warning'   => SOFT. Override-with-reason (captured + audited), does not 422 on its own.
 *   - 'info'      => advisory only.
 *
 * FAIL-SAFE PRINCIPLE (spec): if rule data is missing or uncertain, we surface a 'warning'
 *   with fail_safe=true rather than silently passing. We NEVER return [] to mean "uncertain";
 *   [] means "checked, and definitively nothing found". Bad/empty INPUT (e.g. no meds to check)
 *   yields [] (nothing to evaluate) — that is not uncertainty about a real drug.
 *
 * This module ENHANCES (does not replace) the existing in-line checks in server.js:
 *   - The drug-drug INTERACTION_MATRIX mirrors the hardcoded array at server.js POST
 *     /api/drug-interactions/check, normalized to {severity: info|warning|critical}.
 *   - ALLERGY_CLASSES mirrors the allergyGroups map at server.js POST /api/allergy-check.
 *   - DOSE_LIMITS is a conservative max-single-dose table; unknown drug => fail-safe warning.
 */
'use strict';

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------
function norm(s) {
    return String(s === null || s === undefined ? '' : s).trim().toLowerCase();
}

// Token-aware loose match: true if a or b contains the other as a substring (mirrors the
// existing server.js substring matching, but applied symmetrically and on normalized text).
function looseMatch(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    return x.includes(y) || y.includes(x);
}

// Map legacy 3-level severities (low/moderate/high/critical) to the E1 contract.
function mapSeverity(raw) {
    const s = norm(raw);
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'critical';      // high bleeding/toxicity/QT => hard-stop class
    if (s === 'moderate') return 'warning';
    if (s === 'low' || s === 'minor') return 'info';
    if (s === 'warning') return 'warning';
    if (s === 'info') return 'info';
    return 'warning';                         // FAIL-SAFE: unknown severity => warning, never silent pass
}

// ---------------------------------------------------------------------------
// RULE DATA (mirrors server.js; centralized so both paths agree)
// ---------------------------------------------------------------------------

// Drug-drug interaction matrix. severity uses the legacy scale; mapped via mapSeverity().
const INTERACTION_MATRIX = [
    { pair: ['Warfarin', 'Aspirin'], severity: 'high', en: 'High bleeding risk', ar: 'خطر نزيف شديد' },
    { pair: ['Warfarin', 'Ibuprofen'], severity: 'high', en: 'High bleeding risk', ar: 'خطر نزيف شديد' },
    { pair: ['Warfarin', 'Diclofenac'], severity: 'high', en: 'Bleeding risk', ar: 'خطر نزيف' },
    { pair: ['Warfarin', 'Omeprazole'], severity: 'moderate', en: 'May increase Warfarin effect', ar: 'قد يزيد تأثير الوارفارين' },
    { pair: ['Warfarin', 'Ciprofloxacin'], severity: 'high', en: 'Dangerously increases INR', ar: 'يزيد INR بشكل خطير' },
    { pair: ['Warfarin', 'Metronidazole'], severity: 'high', en: 'Increases Warfarin effect', ar: 'يزيد تأثير الوارفارين' },
    { pair: ['Metformin', 'Contrast'], severity: 'high', en: 'Lactic acidosis risk', ar: 'خطر حماض لاكتيكي' },
    { pair: ['ACE Inhibitor', 'Potassium'], severity: 'high', en: 'Hyperkalemia risk', ar: 'خطر ارتفاع البوتاسيوم' },
    { pair: ['Enalapril', 'Spironolactone'], severity: 'high', en: 'Hyperkalemia risk', ar: 'خطر ارتفاع البوتاسيوم' },
    { pair: ['Lisinopril', 'Spironolactone'], severity: 'high', en: 'Hyperkalemia risk', ar: 'خطر ارتفاع البوتاسيوم' },
    { pair: ['Digoxin', 'Amiodarone'], severity: 'high', en: 'Digoxin toxicity', ar: 'سمية الديجوكسين' },
    { pair: ['Digoxin', 'Verapamil'], severity: 'high', en: 'Digoxin toxicity', ar: 'سمية الديجوكسين' },
    { pair: ['Methotrexate', 'TMP/SMX'], severity: 'high', en: 'Methotrexate toxicity', ar: 'سمية الميثوتركسات' },
    { pair: ['Methotrexate', 'NSAIDs'], severity: 'high', en: 'Renal toxicity', ar: 'سمية كلوية' },
    { pair: ['Simvastatin', 'Clarithromycin'], severity: 'high', en: 'Rhabdomyolysis risk', ar: 'خطر انحلال العضلات' },
    { pair: ['Atorvastatin', 'Clarithromycin'], severity: 'moderate', en: 'Increased statin effect', ar: 'زيادة تأثير الستاتين' },
    { pair: ['Clopidogrel', 'Omeprazole'], severity: 'moderate', en: 'Reduces Clopidogrel efficacy', ar: 'يقلل فعالية كلوبيدوقرل' },
    { pair: ['Lithium', 'NSAIDs'], severity: 'high', en: 'Lithium toxicity', ar: 'سمية الليثيوم' },
    { pair: ['Lithium', 'ACE Inhibitor'], severity: 'high', en: 'Lithium toxicity', ar: 'سمية الليثيوم' },
    { pair: ['Ciprofloxacin', 'Theophylline'], severity: 'high', en: 'Theophylline toxicity', ar: 'سمية الثيوفيلين' },
    { pair: ['MAO Inhibitor', 'SSRI'], severity: 'critical', en: 'Serotonin syndrome - FATAL', ar: 'متلازمة السيروتونين - مميت' },
    { pair: ['Tramadol', 'SSRI'], severity: 'high', en: 'Serotonin syndrome risk', ar: 'خطر متلازمة السيروتونين' },
    { pair: ['Tramadol', 'Sertraline'], severity: 'high', en: 'Serotonin syndrome risk', ar: 'خطر متلازمة السيروتونين' },
    { pair: ['Sildenafil', 'Nitrate'], severity: 'critical', en: 'Fatal hypotension', ar: 'انخفاض ضغط مميت' },
    { pair: ['Sildenafil', 'Nitroglycerin'], severity: 'critical', en: 'Fatal hypotension', ar: 'انخفاض ضغط مميت' },
    { pair: ['Amlodipine', 'Simvastatin'], severity: 'moderate', en: 'Do not exceed Simvastatin 20mg', ar: 'لا تتجاوز سيمفاستاتين 20مج' },
    { pair: ['Carbamazepine', 'OCP'], severity: 'high', en: 'Reduces OCP efficacy', ar: 'يقلل فعالية حبوب منع الحمل' },
    { pair: ['Phenytoin', 'Warfarin'], severity: 'high', en: 'Complex interaction - monitor', ar: 'تفاعل معقد - مراقبة' },
    { pair: ['Erythromycin', 'Simvastatin'], severity: 'high', en: 'Rhabdomyolysis', ar: 'انحلال عضلات' },
    { pair: ['Fluconazole', 'Warfarin'], severity: 'high', en: 'Increases bleeding', ar: 'يزيد نزيف' },
    { pair: ['Amiodarone', 'Warfarin'], severity: 'high', en: 'Increases INR', ar: 'يزيد INR' },
    { pair: ['Aspirin', 'Ibuprofen'], severity: 'moderate', en: 'Reduces cardiac aspirin effect', ar: 'يقلل تأثير الأسبرين القلبي' },
    { pair: ['Metformin', 'Alcohol'], severity: 'moderate', en: 'Lactic acidosis risk', ar: 'خطر حماض لاكتيكي' },
    { pair: ['Insulin', 'Beta Blocker'], severity: 'moderate', en: 'Masks hypoglycemia symptoms', ar: 'يخفي أعراض هبوط السكر' },
    { pair: ['Potassium', 'Spironolactone'], severity: 'high', en: 'Severe hyperkalemia risk', ar: 'خطر ارتفاع بوتاسيوم شديد' },
    { pair: ['Azithromycin', 'Amiodarone'], severity: 'high', en: 'QT prolongation', ar: 'إطالة QT' },
    { pair: ['Domperidone', 'Clarithromycin'], severity: 'high', en: 'QT prolongation', ar: 'إطالة QT' },
    { pair: ['Metoclopramide', 'Haloperidol'], severity: 'moderate', en: 'Extrapyramidal symptoms', ar: 'أعراض خارج هرمية' },
    { pair: ['Rifampin', 'OCP'], severity: 'high', en: 'Eliminates OCP efficacy', ar: 'يلغي فعالية حبوب منع الحمل' },
    { pair: ['Rifampin', 'Warfarin'], severity: 'high', en: 'Greatly reduces Warfarin', ar: 'يقلل فعالية الوارفارين بشدة' },
    { pair: ['Ciprofloxacin', 'Antacid'], severity: 'moderate', en: 'Reduces Cipro absorption', ar: 'يقلل امتصاص سيبرو' },
    { pair: ['Tetracycline', 'Antacid'], severity: 'moderate', en: 'Reduces absorption', ar: 'يقلل الامتصاص' },
    { pair: ['Levothyroxine', 'Calcium'], severity: 'moderate', en: 'Reduces thyroxine absorption', ar: 'يقلل امتصاص الثايروكسين' },
    { pair: ['Levothyroxine', 'Iron'], severity: 'moderate', en: 'Reduces thyroxine absorption', ar: 'يقلل امتصاص الثايروكسين' },
    { pair: ['Bisoprolol', 'Verapamil'], severity: 'high', en: 'Dangerous bradycardia', ar: 'بطء قلب خطير' },
    { pair: ['Atenolol', 'Verapamil'], severity: 'high', en: 'Dangerous bradycardia', ar: 'بطء قلب خطير' },
    { pair: ['Clonidine', 'Beta Blocker'], severity: 'high', en: 'Rebound hypertension', ar: 'ارتداد ارتفاع ضغط' },
    { pair: ['Allopurinol', 'Azathioprine'], severity: 'critical', en: 'Bone marrow toxicity', ar: 'سمية نخاع العظم' },
    { pair: ['Clarithromycin', 'Colchicine'], severity: 'high', en: 'Colchicine toxicity', ar: 'سمية الكولشيسين' },
];

// Allergy cross-reactivity classes (mirrors server.js allergyGroups).
const ALLERGY_CLASSES = {
    'penicillin': ['amoxicillin', 'ampicillin', 'augmentin', 'amoxicillin-clavulanate', 'piperacillin', 'flucloxacillin', 'penicillin'],
    'sulfa': ['sulfamethoxazole', 'tmp/smx', 'co-trimoxazole', 'sulfasalazine', 'dapsone', 'sulfa'],
    'nsaid': ['ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'indomethacin', 'piroxicam', 'meloxicam', 'celecoxib'],
    'aspirin': ['aspirin', 'acetylsalicylic'],
    'cephalosporin': ['cephalexin', 'cefuroxime', 'ceftriaxone', 'cefazolin', 'cefixime', 'ceftazidime'],
    'macrolide': ['erythromycin', 'azithromycin', 'clarithromycin'],
    'quinolone': ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin'],
    'tetracycline': ['doxycycline', 'tetracycline', 'minocycline'],
    'codeine': ['codeine', 'tramadol', 'morphine', 'oxycodone'],
    'contrast': ['iodine', 'contrast', 'gadolinium'],
};

// Conservative max single-dose (mg) per drug. Used only when both the drug AND a numeric
// mg dose are known. Unknown drug or unparseable dose => FAIL-SAFE warning (never silent pass).
const DOSE_LIMITS = {
    'paracetamol': { max: 1000, unit: 'mg' },
    'acetaminophen': { max: 1000, unit: 'mg' },
    'ibuprofen': { max: 800, unit: 'mg' },
    'amoxicillin': { max: 1000, unit: 'mg' },
    'metformin': { max: 1000, unit: 'mg' },
    'simvastatin': { max: 40, unit: 'mg' },
    'atorvastatin': { max: 80, unit: 'mg' },
    'warfarin': { max: 10, unit: 'mg' },
    'digoxin': { max: 0.25, unit: 'mg' },
    'morphine': { max: 30, unit: 'mg' },
    'tramadol': { max: 100, unit: 'mg' },
    'diazepam': { max: 10, unit: 'mg' },
    'furosemide': { max: 80, unit: 'mg' },
    'amlodipine': { max: 10, unit: 'mg' },
    'aspirin': { max: 325, unit: 'mg' },
    'prednisolone': { max: 60, unit: 'mg' },
};

// ---------------------------------------------------------------------------
// Alert constructors
// ---------------------------------------------------------------------------
function makeAlert(rule, severity, en, ar, subjects, opts) {
    const o = opts || {};
    // Per spec, every critical/warning is override-with-reason unless explicitly told otherwise.
    const overridable = (o.overridable === undefined) ? true : !!o.overridable;
    return {
        rule,
        severity,
        message: en,
        message_en: en,
        message_ar: ar || en,
        overridable,
        subjects: Array.isArray(subjects) ? subjects : [subjects].filter(Boolean),
        fail_safe: !!o.fail_safe,
    };
}

// ---------------------------------------------------------------------------
// 1) checkDrugDrugInteraction(meds[])
//    meds: array of strings (drug names) OR objects {name|medication_name|drug_name}.
//    Returns alerts for every matrix pair where BOTH members are present in meds.
// ---------------------------------------------------------------------------
function extractName(m) {
    if (m === null || m === undefined) return '';
    if (typeof m === 'string') return m;
    return m.name || m.medication_name || m.drug_name || m.drug || m.catalog_ref || '';
}

function checkDrugDrugInteraction(meds) {
    const alerts = [];
    if (!Array.isArray(meds)) return alerts;                  // nothing to evaluate
    const names = meds.map(extractName).map(norm).filter(Boolean);
    if (names.length < 2) return alerts;                      // need >=2 drugs to interact

    for (const entry of INTERACTION_MATRIX) {
        const [a, b] = entry.pair;
        const hasA = names.some(n => looseMatch(n, a));
        const hasB = names.some(n => looseMatch(n, b));
        // Guard against a single drug matching BOTH sides of the pair (e.g. one name
        // looseMatching both members). Require two DISTINCT source names.
        if (hasA && hasB) {
            const matchA = names.find(n => looseMatch(n, a));
            const matchB = names.find(n => looseMatch(n, b) && n !== matchA);
            if (!matchB) continue;                            // only one source drug -> not a real pair
            alerts.push(makeAlert('drug-drug', mapSeverity(entry.severity), entry.en, entry.ar, entry.pair));
        }
    }
    return alerts;
}

// ---------------------------------------------------------------------------
// 2) checkDrugAllergy(med, allergies[])
//    med: string or object. allergies: array of strings (free-text allergens) OR a single
//    comma/semicolon-delimited string (matches patients.allergies free text).
//    Returns: exact-match => critical; class cross-reactivity => critical (allergy is always
//    hard-stop class). Empty allergies => [] (nothing recorded, not uncertainty).
// ---------------------------------------------------------------------------
function normalizeAllergyList(allergies) {
    if (allergies === null || allergies === undefined) return [];
    if (Array.isArray(allergies)) return allergies.map(norm).filter(Boolean);
    // free-text: split on comma/semicolon/newline/slash
    return norm(allergies).split(/[,;\n\/]+/).map(s => s.trim()).filter(Boolean);
}

function checkDrugAllergy(med, allergies) {
    const alerts = [];
    const drug = norm(extractName(med));
    if (!drug) return alerts;                                  // no drug to check
    const list = normalizeAllergyList(allergies);
    if (list.length === 0) return alerts;                      // nothing recorded => nothing to flag

    // 1) Direct / substring match against any recorded allergen.
    for (const al of list) {
        if (looseMatch(drug, al)) {
            alerts.push(makeAlert('allergy', 'critical',
                'Direct allergy match: patient is allergic to ' + al,
                'حساسية مباشرة مسجلة: ' + al, [drug]));
            return alerts;                                     // direct hit dominates; one critical is enough
        }
    }

    // 2) Class cross-reactivity: recorded allergen names a class (e.g. "penicillin") and the
    //    drug belongs to that class's member list.
    for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
        const recordedClass = list.some(al => looseMatch(al, cls));
        if (recordedClass && members.some(mem => looseMatch(drug, mem))) {
            alerts.push(makeAlert('allergy', 'critical',
                'Cross-reactivity: ' + drug + ' belongs to the ' + cls + ' class (allergy recorded)',
                drug + ' ينتمي لعائلة ' + cls + ' المسجل حساسية منها', [drug]));
        }
    }
    return alerts;
}

// ---------------------------------------------------------------------------
// 3) checkDoseRange(med, dose, patient)
//    med: string/object. dose: number (mg) OR string like "500 mg" / "500mg" / "2 tab".
//    patient: optional {weight_kg, age}. Returns:
//      - dose > max          => critical (overdose, hard-stop)
//      - drug unknown        => FAIL-SAFE warning (cannot verify)
//      - dose unparseable    => FAIL-SAFE warning (cannot verify)
//      - dose <= 0           => warning (implausible)
//      - within range        => []
// ---------------------------------------------------------------------------
function parseDoseMg(dose) {
    if (typeof dose === 'number' && isFinite(dose)) return { mg: dose, ok: true };
    if (dose === null || dose === undefined) return { mg: null, ok: false };
    const s = String(dose).trim().toLowerCase();
    // Match a leading number; only trust it when the unit is mg (or unit omitted).
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(mg|milligram|milligrams)?\b/);
    if (!m) return { mg: null, ok: false };
    const val = parseFloat(m[1]);
    if (!isFinite(val)) return { mg: null, ok: false };
    const unit = m[2] || '';
    // If a non-mg unit is present elsewhere (tab/ml/mcg/g/iu/puff/drop/etc., incl. plurals), we
    // cannot compare to a mg limit -> FAIL-SAFE (caller surfaces a warning, never silent pass).
    if (!unit && /(tab|tablet|capsule|cap|ml|millilit|mcg|microgram|gram|\bg\b|iu|\bunit|puff|drop|sachet|spray|patch|amp|vial| tsp|teaspoon)/i.test(s)) {
        return { mg: null, ok: false };
    }
    return { mg: val, ok: true };
}

function checkDoseRange(med, dose, patient) {
    const alerts = [];
    const drug = norm(extractName(med));
    if (!drug) return alerts;                                  // no drug -> nothing to evaluate

    // Find a dose limit whose key looseMatches the drug name.
    let limit = null, limitKey = null;
    for (const [key, lim] of Object.entries(DOSE_LIMITS)) {
        if (looseMatch(drug, key)) { limit = lim; limitKey = key; break; }
    }
    if (!limit) {
        // FAIL-SAFE: unknown drug => cannot verify dose => warn, do not silently pass.
        alerts.push(makeAlert('dose', 'warning',
            'Dose not verifiable: no reference range for ' + drug + ' — confirm manually',
            'تعذّر التحقق من الجرعة: لا يوجد مرجع لـ ' + drug + ' — تأكد يدوياً', [drug], { fail_safe: true }));
        return alerts;
    }

    const parsed = parseDoseMg(dose);
    if (!parsed.ok || parsed.mg === null) {
        // FAIL-SAFE: dose present but not parseable as mg => warn, do not silently pass.
        alerts.push(makeAlert('dose', 'warning',
            'Dose not verifiable for ' + drug + ' (non-mg or unparseable) — confirm manually',
            'تعذّر التحقق من جرعة ' + drug + ' (وحدة غير mg أو غير مقروءة) — تأكد يدوياً', [drug], { fail_safe: true }));
        return alerts;
    }

    if (parsed.mg <= 0) {
        alerts.push(makeAlert('dose', 'warning',
            'Implausible dose (<= 0) for ' + drug,
            'جرعة غير منطقية (<= 0) لـ ' + drug, [drug]));
        return alerts;
    }

    if (parsed.mg > limit.max) {
        alerts.push(makeAlert('dose', 'critical',
            'Overdose: ' + parsed.mg + 'mg exceeds max single dose ' + limit.max + 'mg for ' + drug,
            'جرعة زائدة: ' + parsed.mg + 'mg تتجاوز الحد الأقصى ' + limit.max + 'mg لـ ' + drug, [drug]));
        return alerts;
    }
    return alerts;                                             // within range
}

// ---------------------------------------------------------------------------
// 4) checkDuplicateOrder(order, activeOrders[])
//    order: {type, catalog_ref|name|medication_name, patient_id?}.
//    activeOrders: array of existing active orders (same shape).
//    Returns a 'warning' (duplicate therapy/order) when an active order of the SAME type and
//    SAME catalog item already exists. Override-with-reason. Missing type/ref on the NEW order
//    that we cannot evaluate => FAIL-SAFE warning (cannot rule out a duplicate).
// ---------------------------------------------------------------------------
function orderKey(o) {
    const type = norm(o && o.type);
    const ref = norm(extractName(o));
    return { type, ref };
}

function checkDuplicateOrder(order, activeOrders) {
    const alerts = [];
    if (!order) return alerts;
    const k = orderKey(order);
    const list = Array.isArray(activeOrders) ? activeOrders : [];

    // FAIL-SAFE: if we can't identify the new order's item, we can't prove it's NOT a duplicate.
    if (!k.ref) {
        alerts.push(makeAlert('duplicate', 'warning',
            'Duplicate check inconclusive: order item is unspecified — review active orders',
            'تعذّر فحص التكرار: صنف الأمر غير محدد — راجع الأوامر الفعالة', [], { fail_safe: true }));
        return alerts;
    }

    for (const a of list) {
        const ak = orderKey(a);
        const sameType = !k.type || !ak.type ? true : (k.type === ak.type);
        if (sameType && ak.ref && looseMatch(k.ref, ak.ref)) {
            alerts.push(makeAlert('duplicate', 'warning',
                'Duplicate order: an active ' + (k.type || 'order') + ' for "' + k.ref + '" already exists',
                'أمر مكرر: يوجد ' + (k.type || 'أمر') + ' فعّال لـ "' + k.ref + '"', [k.ref]));
            break;                                             // one duplicate alert is enough
        }
    }
    return alerts;
}

// ---------------------------------------------------------------------------
// evaluateOrder(...) — convenience aggregator the route layer uses to run ALL relevant checks
//   for one order/prescription and get a single decision.
//
//   ctx = {
//     type,                 // 'med' | 'lab' | 'rad' | 'consult'
//     med,                  // drug name/object (for med orders)
//     dose,                 // dose string/number (for med orders)
//     patient,              // {allergies, weight_kg, age, ...}
//     activeMeds,           // [] other current meds (for interaction)
//     activeOrders,         // [] current active orders (for duplicate)
//   }
//   Returns { alerts, hasCritical, blocked, requiresReason }.
//     blocked        = true if any critical alert and no override yet (route returns 422).
//     requiresReason = true if any warning OR critical (override must capture a reason).
// ---------------------------------------------------------------------------
function evaluateOrder(ctx) {
    const c = ctx || {};
    const alerts = [];

    if (norm(c.type) === 'med' || c.med) {
        // allergy
        for (const a of checkDrugAllergy(c.med, (c.patient && c.patient.allergies) || c.allergies)) alerts.push(a);
        // dose
        if (c.dose !== undefined) {
            for (const a of checkDoseRange(c.med, c.dose, c.patient)) alerts.push(a);
        }
        // drug-drug: the new med against the active med list (+ itself)
        const medSet = [c.med].concat(Array.isArray(c.activeMeds) ? c.activeMeds : []);
        for (const a of checkDrugDrugInteraction(medSet)) alerts.push(a);
    }

    // duplicate (applies to any order type)
    for (const a of checkDuplicateOrder(
        { type: c.type, name: extractName(c.med) || c.catalog_ref || c.name },
        c.activeOrders)) alerts.push(a);

    const hasCritical = alerts.some(a => a.severity === 'critical');
    const requiresReason = alerts.some(a => a.severity === 'critical' || a.severity === 'warning');
    return { alerts, hasCritical, blocked: hasCritical, requiresReason };
}

// ---------------------------------------------------------------------------
// decide(alerts, overrideReason) — central gate used by the route layer.
//   Returns { allow, status, reason }.
//     - critical present + NO non-empty overrideReason  => allow:false, status:422
//     - critical present + valid overrideReason          => allow:true (route MUST audit override)
//     - only warnings/info                               => allow:true (route SHOULD audit if reason given)
// ---------------------------------------------------------------------------
function decide(alerts, overrideReason) {
    const list = Array.isArray(alerts) ? alerts : [];
    const hasCritical = list.some(a => a.severity === 'critical');
    const reason = (overrideReason === null || overrideReason === undefined) ? '' : String(overrideReason).trim();
    if (hasCritical && !reason) {
        return { allow: false, status: 422, reason: 'critical_alert_requires_override_reason' };
    }
    return { allow: true, status: 200, reason: reason || null };
}

module.exports = {
    // pure checks
    checkDrugDrugInteraction,
    checkDrugAllergy,
    checkDoseRange,
    checkDuplicateOrder,
    // aggregation + gate
    evaluateOrder,
    decide,
    // exposed for tests / server enhancement reuse
    INTERACTION_MATRIX,
    ALLERGY_CLASSES,
    DOSE_LIMITS,
    mapSeverity,
    extractName,
    normalizeAllergyList,
    parseDoseMg,
};

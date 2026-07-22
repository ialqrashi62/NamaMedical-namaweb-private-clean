// Dermatology Activity Engine: PASI (Psoriasis) + SCORAD (Atopic Dermatitis)
// Pure deterministic, no I/O, no side effects

'use strict';

const PASI_SEVERITY = {
  mild: { max: 7, label: 'Mild' },
  moderate: { min: 7, max: 12, label: 'Moderate' },
  severe: { min: 12, label: 'Severe' }
};

const SCORAD_SEVERITY = {
  mild: { max: 25, label: 'Mild' },
  moderate: { min: 25, max: 50, label: 'Moderate' },
  severe: { min: 50, label: 'Severe' }
};

function pasiScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  // Each region: erythema (0-4), induration (0-4), desquamation (0-4), area_pct (0-100)
  const required = ['head', 'trunk', 'upper_extremities', 'lower_extremities'];
  for (const k of required) {
    if (!input[k]) throw new Error(`Missing required region: ${k}`);
  }

  const regions = ['head', 'trunk', 'upper_extremities', 'lower_extremities'];
  const weights = { head: 0.1, trunk: 0.3, upper_extremities: 0.2, lower_extremities: 0.4 };

  let total = 0;
  const components = {};
  for (const r of regions) {
    const data = input[r];
    if (data.erythema < 0 || data.erythema > 4) throw new Error(`${r}.erythema must be 0-4`);
    if (data.induration < 0 || data.induration > 4) throw new Error(`${r}.induration must be 0-4`);
    if (data.desquamation < 0 || data.desquamation > 4) throw new Error(`${r}.desquamation must be 0-4`);
    if (data.area_pct < 0 || data.area_pct > 100) throw new Error(`${r}.area_pct must be 0-100`);

    const severity = data.erythema + data.induration + data.desquamation;
    // Area score: 0=0%, 1=<10%, 2=10-29%, 3=30-49%, 4=50-69%, 5=70-89%, 6=90-100%
    let areaScore = 0;
    if (data.area_pct > 0 && data.area_pct < 10) areaScore = 1;
    else if (data.area_pct < 30) areaScore = 2;
    else if (data.area_pct < 50) areaScore = 3;
    else if (data.area_pct < 70) areaScore = 4;
    else if (data.area_pct < 90) areaScore = 5;
    else if (data.area_pct >= 90) areaScore = 6;

    const regionPASI = severity * areaScore * weights[r];
    components[r] = { severity, areaScore, area_pct: data.area_pct, regionPASI: Math.round(regionPASI * 100) / 100 };
    total += regionPASI;
  }

  const score = Math.round(total * 100) / 100;

  let severity = 'severe';
  let action = '';
  if (score < 7) { severity = 'mild'; action = 'Topical therapy: vitamin D analogs (calcipotriol), topical corticosteroids, emollients. Phototherapy if inadequate.'; }
  else if (score < 12) { severity = 'moderate'; action = 'Topicals + phototherapy OR systemic therapy (MTX, cyclosporine, acitretin, apremilast).'; }
  else { severity = 'severe'; action = 'Systemic biologic: TNF inhibitor (adalimumab, infliximab), IL-12/23 (ustekinumab), IL-17 (secukinumab, ixekizumab), or JAK inhibitor (tofacitinib).'; }

  return {
    pasi: score,
    components,
    severity,
    action,
    notes: [
      'PASI: 0-72. Mild <7, moderate 7-12, severe >12. PASI 75 = 75% reduction (common endpoint for biologics).',
      'Body surface area (BSA) approximation: 1 hand (palm+fingers) = 1% BSA.',
      'Alternative: BSA × modified PASI simplified for routine use.'
    ],
    citations: ['PASI (Fredriksson 1978)', 'AAD-NPF 2021 Psoriasis Guidelines']
  };
}

function scoradScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['extent_pct_0_100', 'intensity_erythema_0_3', 'intensity_papulation_0_3', 'intensity_oozing_0_3', 'intensity_excoriation_0_3', 'intensity_lichenification_0_3', 'intensity_dryness_0_3', 'subjective_itch_0_10', 'subjective_sleep_loss_0_10'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  // SCORAD = extent/5 + 3.5×intensity + subjective
  const extent = input.extent_pct_0_100 / 5;  // A (extent): 0-20
  const intensity = (input.intensity_erythema_0_3 + input.intensity_papulation_0_3 + input.intensity_oozing_0_3 + input.intensity_excoriation_0_3 + input.intensity_lichenification_0_3 + input.intensity_dryness_0_3) * 3.5 / 6;  // B (intensity 0-18)
  const subjective = (input.subjective_itch_0_10 + input.subjective_sleep_loss_0_10);  // C: 0-20

  const total = Math.round((extent + intensity + subjective) * 10) / 10;

  let severity = 'severe';
  let action = '';
  if (total < 25) { severity = 'mild'; action = 'Mild atopic dermatitis: emollients, low-potency topical steroid, oral antihistamine for itch. Trigger avoidance.'; }
  else if (total < 50) { severity = 'moderate'; action = 'Moderate AD: medium-potency topical steroids, topical calcineurin inhibitors (tacrolimus), wet wraps, consider phototherapy.'; }
  else { severity = 'severe'; action = 'Severe AD: high-potency steroids, dupilumab (IL-4Rα) or JAK inhibitor (upadacitinib, abrocitinib). Consider systemic immunosuppressant (MTX, AZA, MMF).'; }

  return {
    scorad: total,
    components: { extent, intensity, subjective },
    severity,
    action,
    notes: [
      'SCORAD: 0-103. Extent (A): 0-20 (% body area / 5). Intensity (B): 0-18 (6 items × 3, but scored 0-3 per item). Subjective (C): 0-20 (itch + sleep loss, each 0-10).',
      'EASI (Eczema Area and Severity Index) is the alternative preferred in trials.',
      'SCORAD <25 mild, 25-50 moderate, >50 severe.'
    ],
    citations: ['SCORAD (European Task Force 1993)', 'EASI (Hanifin 2001)', 'AAD 2023 Atopic Dermatitis Guidelines']
  };
}

module.exports = { pasiScore, scoradScore, PASI_SEVERITY, SCORAD_SEVERITY };

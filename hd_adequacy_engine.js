// Hemodialysis Adequacy Engine
// Computes spKt/V, URR, Kt/V targets per KDOQI/KDIGO
// Pure deterministic, no I/O, no side effects

'use strict';

const MIN_KTV = 1.2;  // Minimum per session (KDOQI)
const TARGET_KTV = 1.4;  // Target per session
const MIN_URR_PCT = 65;  // Minimum urea reduction ratio
const WEEKLY_TARGET_KTV = 2.1;  // 3x/week minimum

function hdAdequacy(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['pre_bun_mg_dL', 'post_bun_mg_dL', 'session_hours', 'sessions_per_week', 'weight_kg', 'uf_volume_L', 'dialyzer_koA', 'qb_blood_flow_mL_min'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  if (input.pre_bun_mg_dL <= 0) throw new Error('pre_bun_mg_dL must be > 0');
  if (input.post_bun_mg_dL < 0 || input.post_bun_mg_dL >= input.pre_bun_mg_dL) throw new Error('post_bun_mg_dL must be > 0 and < pre_bun_mg_dL');

  // URR = (C0 - Ct) / C0
  const urr = ((input.pre_bun_mg_dL - input.post_bun_mg_dL) / input.pre_bun_mg_dL) * 100;

  // spKt/V (Daugirdas 2nd generation, with UF)
  // Kt/V = -ln(R - 0.008 × t) + (4 - 3.5 × R) × (UF/W)
  const R = input.post_bun_mg_dL / input.pre_bun_mg_dL;
  const t = input.session_hours;
  const UF_W = input.uf_volume_L / input.weight_kg;
  const spKtV = -Math.log(R - 0.008 * t) + (4 - 3.5 * R) * UF_W;

  // Weekly Kt/V (Gotch 1995 simplified)
  const weeklyKtV = spKtV * input.sessions_per_week;

  let adequacy = 'adequate';
  let action = 'Continue current prescription. Reassess monthly labs and quarterly adequacy studies.';

  const issues = [];
  if (spKtV < MIN_KTV) issues.push(`spKt/V ${spKtV.toFixed(2)} < ${MIN_KTV} (sub-target)`);
  if (urr < MIN_URR_PCT) issues.push(`URR ${urr.toFixed(1)}% < ${MIN_URR_PCT}% (sub-target)`);
  if (weeklyKtV < WEEKLY_TARGET_KTV) issues.push(`Weekly Kt/V ${weeklyKtV.toFixed(2)} < ${WEEKLY_TARGET_KTV}`);

  if (issues.length > 0) {
    adequacy = 'inadequate';
    action = 'Optimize dialysis prescription:';
    if (spKtV < MIN_KTV) {
      action += ' Increase session time (currently ' + input.session_hours + 'h → target 4h) OR increase Qb to 350-400 mL/min OR increase dialyzer K (target K0A ≥1500).';
    }
    if (weeklyKtV < WEEKLY_TARGET_KTV && input.sessions_per_week < 4) {
      action += ' Consider adding 4th session/week (short daily or nocturnal).';
    }
  }

  // Recirculation / access
  const recommendations = [
    { action: `spKt/V target: ≥${MIN_KTV} (achieved ${spKtV.toFixed(2)})`, level: 'standard' },
    { action: `URR target: ≥${MIN_URR_PCT}% (achieved ${urr.toFixed(1)}%)`, level: 'standard' },
    { action: 'Monthly labs: BUN, Cr, K, Hgb, albumin. Quarterly: PTH, iron studies, dialysis adequacy.', level: 'standard' },
    { action: 'Check access flow Qa every 1-3 months; stenosis if Qa <600 mL/min or drops >25%.', level: 'standard' }
  ];

  if (adequacy === 'inadequate') {
    recommendations.push({ action: 'Increase time/Qb/dialyzer K (see action plan above)', level: 'high' });
    recommendations.push({ action: 'Check for access recirculation (sample from arterial port after slowing Qb to 50)', level: 'high' });
  }

  return {
    spKtV: Math.round(spKtV * 100) / 100,
    weeklyKtV: Math.round(weeklyKtV * 100) / 100,
    urr: Math.round(urr * 10) / 10,
    ureaReductionRatio: Math.round(urr * 10) / 10,
    adequacy,
    targets: { spKtV: MIN_KTV, weeklyKtV: WEEKLY_TARGET_KTV, urr: MIN_URR_PCT },
    action,
    recommendations,
    notes: [
      'Daugirdas 2nd-generation formula accounts for ultrafiltration volume.',
      'KDOQI 2020: minimum spKt/V 1.2 per session for 3x/week HD, target 1.4.',
      'URR is simpler but less accurate than spKt/V; use spKt/V when UF is significant.',
      'For nocturnal HD (5-6x/week, 6-8h/session), target weekly Kt/V ≥4.5.'
    ],
    citations: [
      'Daugirdas 2nd-Generation Formula (Daugirdas 1993)',
      'KDOQI 2020 Hemodialysis Adequacy Update',
      'KDIGO 2024 CKD Evaluation & Management'
    ]
  };
}

module.exports = { hdAdequacy, MIN_KTV, TARGET_KTV, MIN_URR_PCT, WEEKLY_TARGET_KTV };

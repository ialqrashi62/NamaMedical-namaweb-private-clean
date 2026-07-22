// E2E integration test for phase3_calculators_router
// Stands up a minimal Express app, mounts the router, and hits every endpoint
// to verify the full HTTP -> router -> engine -> response chain works.
//
// Inputs are copied verbatim from each engine's _test.js file (production-tested inputs).

const express = require('express');
const http = require('http');
const { makePhase3CalculatorsRouter } = require('./phase3_calculators_router');

const requireAuth = (req, res, next) => { req.session = req.session || { user: { id: 1, role: 'Doctor', tenantId: 1 } }; next(); };
const requireTenantScope = (req, res, next) => { next(); };

const app = express();
app.use(express.json());
app.use('/api/phase3', makePhase3CalculatorsRouter({ requireAuth, requireTenantScope }));

const server = app.listen(0, async () => {
  const port = server.address().port;
  let totalPass = 0, totalFail = 0;
  const failures = [];

  async function call(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port, path, method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json; try { json = JSON.parse(text); } catch { json = text; }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async function test(label, method, path, body, expectStatus) {
    try {
      const r = await call(method, path, body);
      if (r.status !== expectStatus) {
        totalFail++;
        failures.push(`${label}: expected ${expectStatus}, got ${r.status}; body=${JSON.stringify(r.body).slice(0, 200)}`);
        return;
      }
      totalPass++;
    } catch (e) {
      totalFail++;
      failures.push(`${label}: throw ${e.message}`);
    }
  }

  // 1. Index
  await test('GET / (index)', 'GET', '/api/phase3/', null, 200);

  // 2-26. Each engine endpoint with a happy-path body (from each engine's _test.js)
  const cases = [
    ['thyroid',          '/thyroid',                  { tsh: 25, ft4: 0.5, age: 45 }],
    ['bone-density',     '/bone-density',             { age: 50, sex: 'female', weight_kg: 70, height_cm: 165, femoral_neck_bmd_tscore: -0.5 }],
    ['obesity',          '/obesity',                  { weight_kg: 65, height_cm: 170, waist_cm: 80, comorbidities: [] }],
    ['glycemic-control', '/glycemic-control',         { type: 'type1', hba1c: 6.5, tir_pct: 75, time_below_70: 3, time_below_54: 0 }],
    ['copd-severity',    '/copd-severity',            { fev1_pct: 85, cat_score: 5, exacerbations_last_12m: 0, hospitalization_last_12m: 0, mMRC_dyspnea: 0, smoke_status: 'current', eosinophils_cells_ul: 50 }],
    ['asthma-control',   '/asthma-control',           { symptoms_per_week: 1, night_awakenings_per_month: 0, SABA_use_per_week: 1, activity_limitation: false, exacerbations_last_12m: 0, current_step: 3, fev1_pct: 90, act_score: 22 }],
    ['sleep-study',      '/sleep-study',              { ahi: 45, odi: 42, min_spo2: 75, tst_hours: 7.5, sleep_efficiency: 88, rem_pct: 18, arousal_index: 35, periodic_limb_movement_index: 5, predominant_event_type: 'obstructive' }],
    ['gi-bleed-risk',    '/gi-bleed-risk',            { hemoglobin_g_dL: 13.5, sex: 'male', systolic_bp_mmHg: 130, pulse_bpm: 80, BUN_mmol_L: 5.0, melena: false, syncope: false, age: 45, hepatic_disease: false, cardiac_failure: false, source: 'upper' }],
    ['ibd/mayo',         '/ibd-activity/mayo',        { stool_frequency_subscore: 0, rectal_bleeding_subscore: 0, endoscopic_subscore: 0, physician_global_subscore: 0 }],
    ['ckd/egfr',         '/ckd/egfr',                 { age: 25, sex: 'female', creatinine_mg_dL: 0.7, race_black: false }],
    ['hd-adequacy',      '/hd-adequacy',              { pre_bun_mg_dL: 80, post_bun_mg_dL: 20, session_hours: 4, sessions_per_week: 3, weight_kg: 70, uf_volume_L: 2.5, dialyzer_koA: 1500, qb_blood_flow_mL_min: 350 }],
    ['rheum/das28',      '/rheum/das28',              { tender_joints_28: 0, swollen_joints_28: 0, crp_mg_L: 1, patient_global_vas_0_100: 5 }],
    ['sepsis/news2',     '/sepsis/news2',             { resp_rate: 16, spo2_pct: 98, oxygen_supplement: false, temperature_c: 37.0, systolic_bp_mmHg: 130, pulse_bpm: 75, consciousness: 'alert' }],
    ['icu/nihss',        '/icu/nihss',                { consciousness_lvlc: 0, consciousness_lvl1a: 0, consciousness_lvl1b: 0, best_gaze: 0, visual_field: 0, facial_palsy: 0, motor_arm_left: 0, motor_arm_right: 0, motor_leg_left: 0, motor_leg_right: 0, limb_ataxia: 0, sensory: 0, language: 0, dysarthria: 0, extinction_inattention: 0 }],
    ['obgyn/partograph', '/obgyn/partograph',         { current_dilation_cm: 7, hours_since_4cm: 3, parity: 'nulliparous', contractions_per_10min: 4, descent_station: 0 }],
    ['derm/pasi',        '/derm/pasi',                { head: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, trunk: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, upper_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, lower_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 } }],
    ['trauma/gcs',       '/trauma/gcs',               { eye: 4, verbal: 5, motor: 6 }],
    ['neonatal/apgar',   '/neonatal/apgar',           { appearance_0_2: 2, pulse_0_2: 2, grimace_0_2: 2, activity_0_2: 2, respiration_0_2: 2 }],
    ['palliative/kps',   '/palliative/kps',           { karnofsky: 90 }],
    ['oncology/tnm',     '/oncology/tnm',             { T: 1, N: 0, M: 0 }],
    ['psych/phq9',       '/psych/phq9',               { q1_anhedonia: 0, q2_mood: 1, q3_sleep: 1, q4_energy: 0, q5_appetite: 0, q6_self_esteem: 0, q7_concentration: 0, q8_motor: 0, q9_self_harm: 0 }],
    ['ent/pure-tone-avg','/ent/pure-tone-avg',        { thresholds_500_4000_hz: { db_500: 10, db_1000: 15, db_2000: 10, db_4000: 15 } }],
    ['uro/ipss',         '/uro/ipss',                 { incomplete_emptying: 1, frequency: 1, intermittency: 1, urgency: 1, weak_stream: 1, straining: 0, nocturia: 1, qol_score_0_6: 1 }],
    ['preop/asa',        '/preop/asa',                { asa_class: 1 }],
    ['nutrition/bmi',    '/nutrition/bmi',            { weight_kg: 70, height_m: 1.75 }],
  ];

  for (const [name, path, body] of cases) {
    await test(`POST ${path}`, 'POST', `/api/phase3${path}`, body, 200);
  }

  // 27. Bad input -> 400 with code 'engine_error'
  const bad = await call('POST', '/api/phase3/copd-severity', {});
  if (bad.status === 400 && bad.body && bad.body.code === 'engine_error') {
    totalPass++;
    console.log('[OK] bad input -> 400 engine_error');
  } else {
    totalFail++;
    failures.push(`bad input: expected 400 engine_error, got ${bad.status} body=${JSON.stringify(bad.body).slice(0, 200)}`);
  }

  console.log(`\n=== HTTP e2e: pass=${totalPass} fail=${totalFail} ===`);
  if (totalFail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  ' + f);
  }
  server.close();
  process.exit(totalFail > 0 ? 1 : 0);
});

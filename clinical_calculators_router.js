// clinical_calculators_router.js
// REST API for the 18 pure clinical scoring/calculation functions in
// clinical_calculators.js. All routes are read-only, idempotent, and
// require authentication + tenant scope. No PHI is stored by these routes;
// they only evaluate user-supplied numeric inputs.
//
// Safety rails respected:
//   * No money/finance impact (read-only scoring)
//   * No tenant data write (no DB access)
//   * requireAuth + requireTenantScope enforced
//   * Input validation via parseFloat / parsed range checks
//
// Naming: /api/calculators/<function-name>  (kebab-case)
//
// All endpoints return:
//   { ok: true,  function, value, severity, notes, citations, input }
//   { ok: false, error, code }

'use strict';

const express = require('express');
const calc = require('./clinical_calculators');

function safeNum(v, min, max) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (typeof min === 'number' && n < min) return null;
  if (typeof max === 'number' && n > max) return null;
  return n;
}

function safeInt(v, min, max) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!Number.isInteger(n)) return null;
  if (typeof min === 'number' && n < min) return null;
  if (typeof max === 'number' && n > max) return null;
  return n;
}

function runOr400(res, fn, args, functionName) {
  try {
    const r = typeof fn === 'function' && fn.length > 0 && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0 ? fn() : fn.apply(null, Array.isArray(args) ? args : [args]);
    if (!r || typeof r !== 'object') {
      return res.status(500).json({ ok: false, code: 'bad_engine_output' });
    }
    return res.json({ ok: true, function: functionName, input: args, ...r });
  } catch (e) {
    return res.status(400).json({ ok: false, code: 'engine_error', error: e.message });
  }
}

function makeCalculatorsRouter({ requireAuth, requireTenantScope }) {
  const router = express.Router();

  // Self-contained JSON body parser (defense in depth).
  router.use(express.json({ limit: '16kb' }));
  router.use(requireAuth, requireTenantScope);

  router.get('/', (req, res) => {
    const list = [
      { id: 'tbsa', name: 'TBSA (Rule of Nines)', category: 'burn' },
      { id: 'parkland', name: 'Parkland Formula', category: 'burn' },
      { id: 'apgar', name: 'APGAR Score', category: 'neonatal' },
      { id: 'gcs', name: 'Glasgow Coma Scale', category: 'neurology' },
      { id: 'aldrete', name: 'Aldrete Score (PACU)', category: 'anesthesia' },
      { id: 'esi', name: 'ESI Triage Level', category: 'er' },
      { id: 'iol-srkt', name: 'IOL Power (SRK/T)', category: 'ophthalmology' },
      { id: 'child-pugh', name: 'Child-Pugh Score', category: 'hepatology' },
      { id: 'meld', name: 'MELD Score', category: 'hepatology' },
      { id: 'cha2ds2-vasc', name: 'CHA2DS2-VASc', category: 'cardiology' },
      { id: 'has-bled', name: 'HAS-BLED', category: 'cardiology' },
      { id: 'curb65', name: 'CURB-65', category: 'pulmonology' },
      { id: 'qsofa', name: 'qSOFA', category: 'sepsis' },
      { id: 'wells-dvt', name: 'Wells DVT', category: 'hematology' },
      { id: 'centor', name: 'Centor (Strep Pharyngitis)', category: 'ent' },
      { id: 'rom', name: 'ROM Score (Range of Motion)', category: 'orthopedics' },
      { id: 'ews', name: 'Modified Early Warning Score', category: 'critical-care' },
      { id: 'cpb', name: 'CPB Timer Alert', category: 'perfusion' }
    ];
    res.json({ ok: true, count: list.length, calculators: list });
  });

  // 1. TBSA (Rule of Nines) - burns
  router.post('/tbsa', (req, res) => {
    const b = req.body || {};
    const regionKeys = ['head', 'chest', 'abdomen', 'back', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'perineum'];
    const areas = {};
    for (const k of regionKeys) {
      const v = safeNum(b[k], 0, 100);
      if (v === null) return res.status(400).json({ ok: false, code: 'bad_input', field: k });
      areas[k] = v;
    }
    runOr400(res, calc.tbsaRuleOfNines, areas, 'tbsaRuleOfNines');
  });

  // 2. Parkland formula
  router.post('/parkland', (req, res) => {
    const b = req.body || {};
    const tbsa = safeNum(b.tbsaPercent, 0, 100);
    const weight = safeNum(b.weightKg, 1, 400);
    if (tbsa === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'tbsaPercent' });
    if (weight === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'weightKg' });
    runOr400(res, calc.parklandFormula, [tbsa, weight], 'parklandFormula');
  });

  // 3. APGAR
  router.post('/apgar', (req, res) => {
    const b = req.body || {};
    const fields = ['appearance', 'pulse', 'grimace', 'activity', 'respiration'];
    const scores = {};
    for (const f of fields) {
      const v = safeInt(b[f], 0, 2);
      if (v === null) return res.status(400).json({ ok: false, code: 'bad_input', field: f });
      scores[f] = v;
    }
    runOr400(res, calc.apgarTotal, scores, 'apgarTotal');
  });

  // 4. GCS
  router.post('/gcs', (req, res) => {
    const b = req.body || {};
    const eye = safeInt(b.eye, 1, 4);
    const verbal = safeInt(b.verbal, 1, 5);
    const motor = safeInt(b.motor, 1, 6);
    if (eye === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'eye' });
    if (verbal === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'verbal' });
    if (motor === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'motor' });
    runOr400(res, calc.gcsTotal, [eye, verbal, motor], 'gcsTotal');
  });

  // 5. Aldrete (PACU)
  router.post('/aldrete', (req, res) => {
    const b = req.body || {};
    const fields = ['activity', 'respiration', 'circulation', 'consciousness', 'spo2'];
    const scores = {};
    for (const f of fields) {
      const v = safeInt(b[f], 0, 2);
      if (v === null) return res.status(400).json({ ok: false, code: 'bad_input', field: f });
      scores[f] = v;
    }
    runOr400(res, calc.aldreteTotal, scores, 'aldreteTotal');
  });

  // 6. ESI Triage
  router.post('/esi', (req, res) => {
    const b = req.body || {};
    const highRiskResources = !!b.highRiskResources;
    const ageMonths = safeNum(b.ageMonths, 0, 240);
    const painScore = safeInt(b.painScore, 0, 10);
    if (ageMonths === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'ageMonths' });
    if (painScore === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'painScore' });
    runOr400(res, calc.esiLevel, { highRiskResources, ageMonths, painScore }, 'esiLevel');
  });

  // 7. IOL (SRK/T)
  router.post('/iol-srkt', (req, res) => {
    const b = req.body || {};
    const aConstant = safeNum(b.aConstant, 110, 124);
    const axialLength = safeNum(b.axialLength, 18, 30);
    const k1 = safeNum(b.k1, 35, 55);
    const k2 = safeNum(b.k2, 35, 55);
    const desiredRefraction = safeNum(b.desiredRefraction !== undefined ? b.desiredRefraction : 0, -5, 5);
    if (aConstant === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'aConstant' });
    if (axialLength === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'axialLength' });
    if (k1 === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'k1' });
    if (k2 === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'k2' });
    if (desiredRefraction === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'desiredRefraction' });
    runOr400(res, calc.iolSrkt, { aConstant, axialLength, k1, k2, desiredRefraction }, 'iolSrkt');
  });

  // 8. Child-Pugh
  router.post('/child-pugh', (req, res) => {
    const b = req.body || {};
    const bilirubin = safeNum(b.bilirubin, 0, 30);
    const albumin = safeNum(b.albumin, 0.5, 6);
    const inr = safeNum(b.inr, 0.5, 10);
    const ascites = String(b.ascites || '');
    const encephalopathy = String(b.encephalopathy || '');
    const allowedAscites = ['none', 'mild', 'severe'];
    const allowedEnceph = ['none', 'grade1-2', 'severe'];
    if (bilirubin === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'bilirubin' });
    if (albumin === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'albumin' });
    if (inr === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'inr' });
    if (!allowedAscites.includes(ascites)) return res.status(400).json({ ok: false, code: 'bad_input', field: 'ascites' });
    if (!allowedEnceph.includes(encephalopathy)) return res.status(400).json({ ok: false, code: 'bad_input', field: 'encephalopathy' });
    runOr400(res, calc.childPugh, { bilirubin, albumin, inr, ascites, encephalopathy }, 'childPugh');
  });

  // 9. MELD
  router.post('/meld', (req, res) => {
    const b = req.body || {};
    const bilirubin = safeNum(b.bilirubin, 0.1, 50);
    const inr = safeNum(b.inr, 0.5, 10);
    const creatinine = safeNum(b.creatinine, 0.1, 20);
    const dialysis = b.dialysis === 'yes' ? 'yes' : 'no';
    if (bilirubin === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'bilirubin' });
    if (inr === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'inr' });
    if (creatinine === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'creatinine' });
    runOr400(res, calc.meld, { bilirubin, inr, creatinine, dialysis }, 'meld');
  });

  // 10. CHA2DS2-VASc
  router.post('/cha2ds2-vasc', (req, res) => {
    const b = req.body || {};
    const age = safeInt(b.age, 0, 120);
    if (age === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'age' });
    runOr400(res, calc.cha2ds2vasc, {
      chf: !!b.chf, htn: !!b.htn, age,
      diabetes: !!b.diabetes, stroke: !!b.stroke,
      vascular: !!b.vascular, sex: b.sex === 'female' ? 'female' : 'male'
    }, 'cha2ds2vasc');
  });

  // 11. HAS-BLED
  router.post('/has-bled', (req, res) => {
    const b = req.body || {};
    runOr400(res, calc.hasBled, {
      htn: !!b.htn, renal: !!b.renal, liver: !!b.liver,
      stroke: !!b.stroke, bleeding: !!b.bleeding,
      inr: !!b.inr, elderly: !!b.elderly,
      drugs: !!b.drugs, alcohol: !!b.alcohol
    }, 'hasBled');
  });

  // 12. CURB-65
  router.post('/curb65', (req, res) => {
    const b = req.body || {};
    const age = safeInt(b.age, 0, 120);
    if (age === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'age' });
    runOr400(res, calc.curb65, {
      confusion: !!b.confusion, uremia: !!b.uremia,
      respiratoryRate: safeInt(b.respiratoryRate, 0, 60) || 0,
      bp: safeInt(b.bp, 0, 300) || 0, age
    }, 'curb65');
  });

  // 13. qSOFA
  router.post('/qsofa', (req, res) => {
    const b = req.body || {};
    runOr400(res, calc.qsofa, {
      alteredMentation: !!b.alteredMentation,
      rrGte22: !!b.rrGte22,
      sbpLte100: !!b.sbpLte100
    }, 'qsofa');
  });

  // 14. Wells DVT
  router.post('/wells-dvt', (req, res) => {
    const b = req.body || {};
    runOr400(res, calc.wellsDvt, {
      activeCancer: !!b.activeCancer,
      paralysis: !!b.paralysis,
      recentImmobilization: !!b.recentImmobilization,
      localizedTenderness: !!b.localizedTenderness,
      entireLegSwollen: !!b.entireLegSwollen,
      calfSwelling: !!b.calfSwelling,
      pittingEdema: !!b.pittingEdema,
      collateralSuperficialVeins: !!b.collateralSuperficialVeins,
      altDxAsLikely: !!b.altDxAsLikely
    }, 'wellsDvt');
  });

  // 15. Centor
  router.post('/centor', (req, res) => {
    const b = req.body || {};
    runOr400(res, calc.centor, {
      fever: !!b.fever,
      tonsillarExudate: !!b.tonsillarExudate,
      tenderLymph: !!b.tenderLymph,
      cough: !!b.cough
    }, 'centor');
  });

  // 16. ROM (Range of Motion)
  router.post('/rom', (req, res) => {
    const b = req.body || {};
    const degrees = safeNum(b.degrees, 0, 180);
    if (degrees === null) return res.status(400).json({ ok: false, code: 'bad_input', field: 'degrees' });
    runOr400(res, calc.romScore, degrees, 'romScore');
  });

  // 17. EWS
  router.post('/ews', (req, res) => {
    const b = req.body || {};
    const fields = ['pulse', 'systolicBP', 'respiratoryRate', 'temperature', 'spo2', 'consciousness'];
    const components = {};
    for (const f of fields) {
      const v = safeInt(b[f], 0, 3);
      if (v === null) return res.status(400).json({ ok: false, code: 'bad_input', field: f });
      components[f] = v;
    }
    runOr400(res, calc.ewsTotal, components, 'ewsTotal');
  });

  // 18. CPB Timer
  router.post('/cpb', (req, res) => {
    const b = req.body || {};
    const crossClampStart = String(b.crossClampStart || '');
    const cpbStart = String(b.cpbStart || '');
    const currentTime = b.currentTime ? String(b.currentTime) : new Date().toISOString();
    if (!crossClampStart) return res.status(400).json({ ok: false, code: 'bad_input', field: 'crossClampStart' });
    if (!cpbStart) return res.status(400).json({ ok: false, code: 'bad_input', field: 'cpbStart' });
    if (isNaN(new Date(crossClampStart).getTime())) return res.status(400).json({ ok: false, code: 'bad_input', field: 'crossClampStart' });
    if (isNaN(new Date(cpbStart).getTime())) return res.status(400).json({ ok: false, code: 'bad_input', field: 'cpbStart' });
    runOr400(res, calc.cpbTimer, { crossClampStart, cpbStart, currentTime }, 'cpbTimer');
  });

  return router;
}

module.exports = { makeCalculatorsRouter };

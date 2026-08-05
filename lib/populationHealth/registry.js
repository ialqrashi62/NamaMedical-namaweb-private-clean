'use strict';
// lib/populationHealth/registry.js
// Disease registries — static catalog of 5 starter registries with
// ICD-10 inclusion codes, exclusion rules, and tracked metrics.
//
// Pure JS, no npm install. The registry exposes:
//   REGISTRIES                              → the static catalog
//   buildRegistry(args)                     → compose a runtime registry
//   registryStats(registryId, cohortData)   → aggregate a cohort against the registry
//   outreachCandidates(registryId, list)    → flag patients needing outreach
//   riskStratify(registryId, patient)       → low/medium/high risk bucket
//
// No PHI in any audit-emitting path. Counts and registry IDs only.

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  const REGISTRIES = Object.freeze({
    diabetes: Object.freeze({
      id: 'diabetes',
      nameAr: 'السكري',
      nameEn: 'Diabetes Mellitus',
      inclusion: Object.freeze(['ICD-10:E10', 'ICD-10:E11']),
      exclusions: Object.freeze(['Type 1 if age<30']),
      metrics: Object.freeze(['hba1c', 'bp', 'ldl', 'egfr']),
      riskWeights: Object.freeze({
        hba1c: 0.45,
        bp: 0.20,
        ldl: 0.20,
        egfr: 0.15
      })
    }),
    hypertension: Object.freeze({
      id: 'hypertension',
      nameAr: 'الضغط',
      nameEn: 'Hypertension',
      inclusion: Object.freeze(['ICD-10:I10-I15']),
      exclusions: Object.freeze([]),
      metrics: Object.freeze(['bp', 'sodium', 'potassium', 'creatinine']),
      riskWeights: Object.freeze({
        bp: 0.55,
        sodium: 0.10,
        potassium: 0.15,
        creatinine: 0.20
      })
    }),
    asthma: Object.freeze({
      id: 'asthma',
      nameAr: 'الربو',
      nameEn: 'Asthma',
      inclusion: Object.freeze(['ICD-10:J45']),
      exclusions: Object.freeze([]),
      metrics: Object.freeze(['peak_flow', 'act_score', 'fev1']),
      riskWeights: Object.freeze({
        peak_flow: 0.35,
        act_score: 0.40,
        fev1: 0.25
      })
    }),
    chf: Object.freeze({
      id: 'chf',
      nameAr: 'هبوط القلب',
      nameEn: 'Congestive Heart Failure',
      inclusion: Object.freeze(['ICD-10:I50']),
      exclusions: Object.freeze([]),
      metrics: Object.freeze(['ef', 'bnp', 'sodium', 'creatinine']),
      riskWeights: Object.freeze({
        ef: 0.50,
        bnp: 0.30,
        sodium: 0.05,
        creatinine: 0.15
      })
    }),
    ckd: Object.freeze({
      id: 'ckd',
      nameAr: 'القصور الكلوي',
      nameEn: 'Chronic Kidney Disease',
      inclusion: Object.freeze(['ICD-10:N18']),
      exclusions: Object.freeze([]),
      metrics: Object.freeze(['egfr', 'uacr', 'potassium', 'phosphorus']),
      riskWeights: Object.freeze({
        egfr: 0.50,
        uacr: 0.25,
        potassium: 0.15,
        phosphorus: 0.10
      })
    })
  });

  function _reg(id) {
    const r = REGISTRIES[id];
    if (!r) throw new Error('REGISTRY_UNKNOWN:' + id);
    return r;
  }

  function buildRegistry(args) {
    const id = args && args.registryId;
    if (!id) throw new Error('REGISTRY_REQUIRED');
    const base = _reg(id);
    return Object.assign({}, base, {
      tenantId: args && args.tenantId || null,
      cohortId: args && args.cohortId || null,
      snapshots: Array.isArray(args && args.snapshots) ? args.snapshots.slice() : []
    });
  }

  // registryStats(cohortData) → aggregate stats for a cohort
  // cohortData = { patients: [ {patientId, age, sex, ...metrics} ] }
  function registryStats(registryId, cohortData) {
    const reg = _reg(registryId);
    const data = (cohortData && Array.isArray(cohortData.patients))
      ? cohortData.patients
      : [];
    const N = data.length;
    const sums = {};
    const mins = {};
    const maxs = {};
    const counts = {};
    reg.metrics.forEach(function (m) {
      sums[m] = 0;
      mins[m] = null;
      maxs[m] = null;
      counts[m] = 0;
    });
    for (let i = 0; i < data.length; i++) {
      const p = data[i] || {};
      for (let j = 0; j < reg.metrics.length; j++) {
        const m = reg.metrics[j];
        const v = p[m];
        if (typeof v === 'number') {
          sums[m] += v;
          counts[m] += 1;
          if (mins[m] === null || v < mins[m]) mins[m] = v;
          if (maxs[m] === null || v > maxs[m]) maxs[m] = v;
        }
      }
    }
    const means = {};
    for (let j = 0; j < reg.metrics.length; j++) {
      const m = reg.metrics[j];
      means[m] = counts[m] > 0 ? +(sums[m] / counts[m]).toFixed(3) : null;
    }
    return {
      registryId: reg.id,
      cohortSize: N,
      measuredCounts: counts,
      mean: means,
      min: mins,
      max: maxs
    };
  }

  // outreachCandidates(registryId, patients) → list of patientIds needing outreach
  // Per-registry outreach rule: candidate when at least one tracked metric
  // is missing OR falls outside a lenient bound. No PHI returned — IDs only.
  function outreachCandidates(registryId, patients) {
    const reg = _reg(registryId);
    const list = Array.isArray(patients) ? patients : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      let needs = false;
      let reason = null;
      for (let j = 0; j < reg.metrics.length; j++) {
        const m = reg.metrics[j];
        const v = p[m];
        if (typeof v !== 'number') {
          needs = true;
          reason = 'METRIC_MISSING:' + m;
          break;
        }
        if (reg.id === 'diabetes' && m === 'hba1c' && v >= 9.0) {
          needs = true; reason = 'HBA1C_HIGH'; break;
        }
        if (reg.id === 'hypertension' && m === 'bp' && v >= 160) {
          needs = true; reason = 'BP_HIGH'; break;
        }
        if (reg.id === 'asthma' && m === 'act_score' && v <= 15) {
          needs = true; reason = 'ACT_LOW'; break;
        }
        if (reg.id === 'chf' && m === 'bnp' && v >= 1000) {
          needs = true; reason = 'BNP_HIGH'; break;
        }
        if (reg.id === 'ckd' && m === 'egfr' && v < 30) {
          needs = true; reason = 'EGFR_LOW'; break;
        }
      }
      if (needs && p.patientId) {
        out.push({
          patientId: p.patientId,
          registryId: reg.id,
          reason: reason
        });
      }
    }
    return out;
  }

  // riskStratify(registryId, patient) → 'low' | 'medium' | 'high'
  // Weighted average of normalized metric scores. No PHI.
  function riskStratify(registryId, patient) {
    const reg = _reg(registryId);
    const p = patient || {};
    const w = reg.riskWeights || {};
    let total = 0;
    let totalWeight = 0;
    let missingCount = 0;
    Object.keys(w).forEach(function (m) {
      const v = p[m];
      if (typeof v !== 'number') {
        missingCount += 1;
        return;
      }
      // Normalise each metric to a 0..1 "abnormality" score.
      let norm = 0;
      if (reg.id === 'diabetes') {
        if (m === 'hba1c') norm = clamp01((v - 6.5) / 4.5);          // 6.5..11.0
        else if (m === 'bp')     norm = clamp01((v - 120) / 60);    // 120..180
        else if (m === 'ldl')    norm = clamp01((v - 100) / 80);    // 100..180
        else if (m === 'egfr')   norm = clamp01((90 - v) / 90);     // 90..0
      } else if (reg.id === 'hypertension') {
        if (m === 'bp')         norm = clamp01((v - 120) / 60);
        else if (m === 'sodium')norm = clamp01(Math.abs(v - 140) / 20);
        else if (m === 'potassium') norm = clamp01(Math.abs(v - 4.2) / 1.5);
        else if (m === 'creatinine') norm = clamp01((v - 1.0) / 2.0);
      } else if (reg.id === 'asthma') {
        if (m === 'peak_flow')  norm = clamp01((400 - v) / 300);    // lower worse
        else if (m === 'act_score') norm = clamp01((25 - v) / 20);
        else if (m === 'fev1')   norm = clamp01((80 - v) / 60);
      } else if (reg.id === 'chf') {
        if (m === 'ef')         norm = clamp01((55 - v) / 50);
        else if (m === 'bnp')   norm = clamp01(v / 1500);
        else if (m === 'sodium')norm = clamp01((140 - v) / 15);
        else if (m === 'creatinine') norm = clamp01((v - 1.0) / 2.0);
      } else if (reg.id === 'ckd') {
        if (m === 'egfr')       norm = clamp01((60 - v) / 60);
        else if (m === 'uacr')  norm = clamp01(v / 500);
        else if (m === 'potassium') norm = clamp01((v - 5.0) / 3.0);
        else if (m === 'phosphorus') norm = clamp01((v - 4.5) / 5.5);
      }
      total += w[m] * clamp01(norm);
      totalWeight += w[m];
    });

    const score = totalWeight > 0 ? +(total / totalWeight).toFixed(3) : 0;
    let bucket = 'medium';
    if (missingCount >= 2) bucket = 'high';
    else if (score >= 0.66) bucket = 'high';
    else if (score >= 0.33) bucket = 'medium';
    else bucket = 'low';

    return {
      registryId: reg.id,
      patientId: p.patientId || null,
      score: score,
      bucket: bucket,
      missingMetrics: missingCount
    };
  }

  function clamp01(x) {
    if (typeof x !== 'number' || isNaN(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  module.exports = {
    REGISTRIES: REGISTRIES,
    buildRegistry: buildRegistry,
    registryStats: registryStats,
    outreachCandidates: outreachCandidates,
    riskStratify: riskStratify
  };
})();

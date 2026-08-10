/**
 * AI / Services / Certificates / Infection Wave Boundary Guard
 * 47 routes: medical certificates, medical services, AI orchestrators, AI voice,
 * CDS-hooks, system settings, medical reports, patient DELETE, OPD, messages,
 * admin/backup, infection surveillance/outbreaks/exposure/hand-hygiene/isolation/AMS
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  // Medical certificates / services / billing / reports
  { route: '/api/medical/bill-procedures',     verb: 'post', schema: 'medicalBillProcedureCreate' },
  { route: '/api/medical/certificates',        verb: 'post', schema: 'medicalCertificateCreate' },
  { route: '/api/medical-reports',             verb: 'post', schema: 'medicalReportCreate' },

  // System settings PUT
  { route: '/api/settings',                    verb: 'put',  schema: 'systemSettingsUpdate' },

  // Patient DELETE (admin)
  { route: '/api/patients/:id',                verb: 'delete', schema: 'patientDelete' },

  // Admin backup
  { route: '/api/admin/backup',                verb: 'post', schema: null },

  // Messages
  { route: '/api/messages',                    verb: 'post', schema: 'messageCreate' },

  // OPD encounter start
  { route: '/api/opd/encounter/start',         verb: 'post', schema: 'opdEncounterStart' },

  // AI orchestrators (21)
  { route: '/api/ai/cardiology/analyze-ecg',   verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/cardiology/predict-hf',    verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/critical/predict-det',     verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/critical/optimize-vent',   verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/derm/analyze-lesion',      verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/diagnostics/scan',         verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/diagnostics/lab-trends',   verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/endocrine/glucose',        verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/gastro/endoscopy',         verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/gastro/liver-risk',        verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/infectious/antibiotic',    verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/nephrology/biopsy',        verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/nephrology/gfr-trend',     verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/obgyn-peds/fetal',         verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/obgyn-peds/neonatal',      verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/oncology/genomics',        verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/pulmonology/pft',          verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/pulmonology/sleep-apnea',  verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/rheuma/autoimmune',        verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/surgery/recovery',         verb: 'post', schema: 'aiOrchestratorInvoke' },
  { route: '/api/ai/surgery/report',           verb: 'post', schema: 'aiOrchestratorInvoke' },

  // AI CDS-hooks + voice dictation
  { route: '/api/ai/cds-hooks',                verb: 'post', schema: 'cdsHookInvoke' },
  { route: '/api/ai/voice-dictation/start',    verb: 'post', schema: 'voiceDictationStart' },
  { route: '/api/ai/voice-dictation/:id/finalize', verb: 'post', schema: 'voiceDictationFinalize' },

  // Infection surveillance (9 routes)
  { route: '/api/infection/surveillance',         verb: 'post', schema: 'infectionSurveillanceCreate' },
  { route: '/api/infection/outbreaks',            verb: 'post', schema: 'infectionOutbreakCreate' },
  { route: '/api/infection/outbreaks/:id',        verb: 'put',  schema: 'infectionOutbreakUpdate' },
  { route: '/api/infection/exposures',            verb: 'post', schema: 'infectionExposureCreate' },
  { route: '/api/infection/hand-hygiene',         verb: 'post', schema: 'infectionHandHygieneCreate' },
  { route: '/api/infection/isolation',            verb: 'post', schema: 'infectionIsolationCreate' },
  { route: '/api/infection/isolation/:id',        verb: 'put',  schema: 'infectionIsolationUpdate' },
  { route: '/api/infection/ams',                  verb: 'post', schema: 'infectionAmsCreate' },
  { route: '/api/infection/ams/:id',              verb: 'put',  schema: 'infectionAmsUpdate' },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `app\\.${c.verb}\\('${escaped}'[\\s\\S]{0,500}?idempotencyGuard\\s*,`
  );
  try {
    assert.ok(re.test(serverSrc), `idempotencyGuard missing for: ${c.verb.toUpperCase()} ${c.route}`);
    if (c.schema) {
      const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
      assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined`);
      const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
      assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported`);
    }
    console.log(`  PASS  ${c.verb.toUpperCase().padEnd(6)} ${c.route}${c.schema ? '  ->  ' + c.schema : '  (idempotencyGuard only)'}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.verb.toUpperCase().padEnd(6)} ${c.route}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`AI/Services/Certificates/Infection boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);

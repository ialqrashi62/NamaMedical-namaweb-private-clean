/**
 * Surgery / Operations / Consent / ER / ADT / Dietary / Quality / Maintenance / Transport Wave Boundary Guard
 * 36 routes: surgery, OR, consent, ER, ADT, bed-transfers, dietary, nutrition,
 * quality, maintenance, transport
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  // Surgery / OR
  { route: '/api/surgeries',                          verb: 'post',   schema: 'surgeryCreate' },
  { route: '/api/surgeries/:id',                      verb: 'delete', schema: 'surgeryDelete' },
  { route: '/api/operating-rooms',                    verb: 'post',   schema: 'operatingRoomCreate' },
  { route: '/api/or/slots/:id/cancel',                verb: 'put',    schema: 'orSlotCancel' },
  { route: '/api/or/surgeries/:id/who-checklist/:phase', verb: 'post', schema: 'orWhoChecklist' },

  // Consent
  { route: '/api/consent-forms',                      verb: 'post',   schema: 'consentFormCreate' },
  { route: '/api/consent-forms/:id/sign',             verb: 'put',    schema: 'consentFormSign' },

  // ER
  { route: '/api/er/triage',                          verb: 'post',   schema: 'erTriage' },
  { route: '/api/er/assign-provider',                 verb: 'post',   schema: 'erAssignProvider' },
  { route: '/api/er/disposition',                     verb: 'post',   schema: 'erDisposition' },

  // ADT / bed-transfers
  { route: '/api/bed-transfers',                      verb: 'post',   schema: 'bedTransferCreate' },
  { route: '/api/adt/admit',                          verb: 'post',   schema: 'adtAdmit' },
  { route: '/api/adt/transfer',                       verb: 'post',   schema: 'adtTransfer' },
  { route: '/api/adt/discharge',                      verb: 'post',   schema: 'adtDischarge' },
  { route: '/api/adt/bed-status',                     verb: 'post',   schema: 'adtBedStatus' },

  // Dietary
  { route: '/api/dietary/orders',                     verb: 'post',   schema: 'dietaryOrderCreate' },
  { route: '/api/dietary/orders/:id',                 verb: 'put',    schema: 'dietaryOrderUpdate' },
  { route: '/api/dietary/meals',                      verb: 'post',   schema: 'dietaryMealCreate' },
  { route: '/api/dietary/meals/:id/deliver',          verb: 'put',    schema: 'dietaryMealDeliver' },

  // Nutrition
  { route: '/api/nutrition/assessments',              verb: 'post',   schema: 'nutritionAssessmentCreate' },

  // Quality
  { route: '/api/quality/incidents',                  verb: 'post',   schema: 'qualityIncidentCreate' },
  { route: '/api/quality/incidents/:id',              verb: 'put',    schema: 'qualityIncidentUpdate' },
  { route: '/api/quality/satisfaction',               verb: 'post',   schema: 'qualitySatisfactionCreate' },
  { route: '/api/quality/kpis',                       verb: 'post',   schema: 'qualityKpiCreate' },
  { route: '/api/quality/incidents/:id/capa',          verb: 'post',   schema: 'qualityCapaCreate' },
  { route: '/api/quality/capa/:id',                   verb: 'put',    schema: 'qualityCapaUpdate' },
  { route: '/api/quality/risks',                      verb: 'post',   schema: 'qualityRiskCreate' },
  { route: '/api/quality/risks/:id',                  verb: 'put',    schema: 'qualityRiskUpdate' },

  // Maintenance
  { route: '/api/maintenance/work-orders',            verb: 'post',   schema: 'maintenanceWorkOrderCreate' },
  { route: '/api/maintenance/work-orders/:id',        verb: 'put',    schema: 'maintenanceWorkOrderUpdate' },
  { route: '/api/maintenance/equipment',              verb: 'post',   schema: 'maintenanceEquipmentCreate' },
  { route: '/api/maintenance/pm-schedules',           verb: 'post',   schema: 'maintenancePmScheduleCreate' },
  { route: '/api/maintenance/orders',                 verb: 'post',   schema: 'maintenanceOrderCreate' },
  { route: '/api/maintenance/orders/:id',             verb: 'put',    schema: 'maintenanceOrderUpdate' },
  { route: '/api/maintenance/calibrations',           verb: 'post',   schema: 'maintenanceCalibrationCreate' },

  // Transport
  { route: '/api/transport/requests',                 verb: 'post',   schema: 'transportRequestCreate' },
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
console.log(`Surgery/Operations wave boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);

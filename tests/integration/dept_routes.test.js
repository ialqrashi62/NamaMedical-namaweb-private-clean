'use strict';

/**
 * Integration tests against the dept_router with stub auth.
 *
 * Run:
 *   npx jest tests/integration/dept_routes.test.js
 */

const request = require('supertest');
const app = require('../../routes/dept_attach');

describe('Dept router', () => {
  test('GET /api/v4/dept/list returns 21 depts', async () => {
    const r = await request(app).get('/api/v4/dept/list');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.depts)).toBe(true);
    expect(r.body.depts.length).toBeGreaterThanOrEqual(21);
    expect(r.body.depts.map(d => d.deptId)).toEqual(expect.arrayContaining(['CARD','PULM','GI','ER']));
  });

  test('POST /api/v4/dept/PULM/visits (sandbox) returns 201', async () => {
    const r = await request(app)
      .post('/api/v4/dept/PULM/visits')
      .send({ patientId: 'TEST', visitType: 'initial', chiefComplaint: 'fever' });
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^v-/);
    expect(r.body.dept).toBe('PULM');
  });

  test('POST assessment with safe input returns ok=true (sandbox LLM stub)', async () => {
    const r = await request(app)
      .post('/api/v4/dept/PULM/visits/v-1/assessment')
      .send({
        chiefComplaint: 'dry cough x2 weeks',
        hpi: 'no fever, no sob',
        exam: 'clear',
        vitals: { hr: 80, spo2: 98, temp_c: 36.7 },
      });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.engineId).toMatch(/PULM-001/);
    expect(Array.isArray(r.body.redFlags)).toBe(true);
    expect(Array.isArray(r.body.drugAlerts)).toBe(true);
  });

  test('Unknown dept returns 404', async () => {
    const r = await request(app)
      .post('/api/v4/dept/UNKNOWN/visits/v-1/assessment')
      .send({ chiefComplaint: 'x' });
    expect(r.status).toBe(404);
  });

  test('HARD red flag in chief complaint blocks execute (in-application)', async () => {
    const r = await request(app)
      .post('/api/v4/dept/PULM/visits/v-1/assessment')
      .send({
        chiefComplaint: 'hemoptysis massive 200mL',
        hpi: 'crashing',
      });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/HARD_RED_FLAG_BLOCK/);
  });

  test('Place orders returns 201 with idempotency-key', async () => {
    const r = await request(app)
      .post('/api/v4/dept/PULM/visits/v-1/orders')
      .set('idempotency-key', 'idem-' + Date.now())
      .send({ orders: [{ type: 'medication', code: 'salbutamol', dose: '5mg', route: 'neb', timing: 'stat' }] });
    expect(r.status).toBe(201);
    expect(r.body.orders.length).toBe(1);
  });

  test('Health endpoint returns ok', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.depts).toBeGreaterThanOrEqual(21);
  });

  test('Tasks mine returns empty list', async () => {
    const r = await request(app).get('/api/v4/dept/PULM/tasks/mine');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.tasks)).toBe(true);
  });

  test('Results endpoint returns empty list', async () => {
    const r = await request(app).get('/api/v4/dept/PULM/patients/P-1/results');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.results)).toBe(true);
  });
});

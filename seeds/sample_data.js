'use strict';
// Sample data seeder — generates FHIR-shaped patients, encounters, observations.
// Sandbox-only: emits JS objects. Production: SQL inserts.

class SampleDataSeeder {
  constructor(opts = {}) {
    this.tenantId = opts.tenantId || 'demo';
  }

  patients(n = 5) {
    const firstNames = ['Ahmed', 'Sara', 'Mohammed', 'Layla', 'Yusuf', 'Fatima', 'Omar', 'Aisha', 'Khalid', 'Nora'];
    const lastNames = ['Al-Saud', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Harbi', 'Al-Dosari', 'Al-Zahrani', 'Al-Sharif', 'Al-Qahtani'];
    const out = [];
    for (let i = 0; i < n; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[i % lastNames.length];
      out.push({
        resourceType: 'Patient',
        id: `p-${i}-${Date.now()}`,
        name: [{ text: `${fn} ${ln}` }],
        gender: i % 2 === 0 ? 'male' : 'female',
        birthDate: `${1950 + (i * 7) % 60}-0${(i % 9) + 1}-15`,
        meta: { tag: [{ system: 'tenant', code: this.tenantId }] },
      });
    }
    return out;
  }

  observations(patientId, n = 3) {
    const types = ['heart-rate', 'blood-pressure', 'temperature', 'oxygen-saturation', 'respiratory-rate'];
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        resourceType: 'Observation',
        id: `o-${i}-${Date.now()}`,
        subject: { reference: `Patient/${patientId}` },
        code: { coding: [{ system: 'http://loinc.org', code: types[i % types.length] }] },
        valueQuantity: { value: 60 + i * 10, unit: 'bpm' },
        effectiveDateTime: new Date().toISOString(),
      });
    }
    return out;
  }

  encounters(patientId, n = 2) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        resourceType: 'Encounter',
        id: `e-${i}-${Date.now()}`,
        subject: { reference: `Patient/${patientId}` },
        class: { code: 'AMB' },
        period: { start: new Date().toISOString(), end: new Date().toISOString() },
      });
    }
    return out;
  }
}

module.exports = { SampleDataSeeder };

'use strict';
// HL7 v2 -> FHIR via Mirth Connect simulation.
// In production, Mirth is a Java service receiving ADT/ORU/RDE messages.
// This adapter provides:
//   - parseHL7V2(message)   best-effort segment extraction
//   - toFHIRBundle(msg)     returns a Bundle resource with Patient + Encounters etc
// It is a sandbox-safe parser (no actual MLLP socket).

function parseHL7V2(message) {
  if (!message || typeof message !== 'string') throw new Error('HL7_MSG_REQUIRED');
  // HL7 v2 uses \r segment separators; sandbox often replaces with \n
  const norm = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const segments = norm.split('\n').filter(Boolean).map(line => line.split('|'));
  const parsed = {};
  for (const seg of segments) {
    const id = seg[0];
    if (id === 'MSH') parsed.messageType = seg[8] || seg[9];
    else if (id === 'PID') {
      parsed.patientId = seg[3] ? seg[3].split('^')[0] : null;
      parsed.patientName = seg[5] ? seg[5].replace(/\^/g, ' ').trim() : null;
      parsed.dob = seg[7] || null;
      parsed.gender = seg[8] || null;
    } else if (id === 'PV1') {
      parsed.visitClass = seg[2] || null;
      parsed.attendingDoctor = (seg[7] || '').split('^')[1] || null;
      parsed.visitNumber = seg[19] || null;
    } else if (id === 'OBX') {
      parsed.observations = parsed.observations || [];
      parsed.observations.push({
        valueType: seg[2], code: seg[3] ? seg[3].split('^')[0] : null,
        value: seg[5] || null, units: seg[6] || null,
      });
    }
  }
  parsed._ts = new Date().toISOString();
  return parsed;
}

function toFHIRBundle(parsed, tenantId) {
  if (!parsed) throw new Error('PARSED_REQUIRED');
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  const pid = parsed.patientId || 'unknown';
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: pid,
          identifier: [{ system: 'tenant', value: tenantId + ':' + pid }],
          name: parsed.patientName ? [{ text: parsed.patientName }] : undefined,
          gender: parsed.gender || undefined,
          birthDate: parsed.dob || undefined,
        },
        request: { method: 'POST', url: 'Patient' },
      },
      ...((parsed.observations || []).map((o, i) => ({
        resource: {
          resourceType: 'Observation',
          id: parsed.visitNumber + '-o' + i,
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: o.code || 'unknown' }] },
          subject: { reference: 'Patient/' + pid },
          valueString: o.value,
        },
        request: { method: 'POST', url: 'Observation' },
      }))),
      ...(parsed.visitNumber ? [{
        resource: {
          resourceType: 'Encounter',
          id: parsed.visitNumber,
          status: 'finished',
          class: parsed.visitClass ? { code: parsed.visitClass } : undefined,
          subject: { reference: 'Patient/' + pid },
          participant: parsed.attendingDoctor ? [{ individual: { display: parsed.attendingDoctor } }] : undefined,
        },
        request: { method: 'POST', url: 'Encounter' },
      }] : []),
    ],
  };
}

class MirthAdapter {
  constructor(opts = {}) {
    this.endpoint = opts.endpoint || process.env.MIRTH_ENDPOINT || 'mirth:6661';
    this.sandbox = opts.sandbox !== false;
  }
  // For sandbox we just parse + return bundle; prod would write MLLP socket.
  ingestV2({ tenantId, message }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!message) throw new Error('HL7_MSG_REQUIRED');
    const parsed = parseHL7V2(message);
    const bundle = toFHIRBundle(parsed, tenantId);
    return { parsed, bundle, ingestedAt: new Date().toISOString(), mode: this.sandbox ? 'sandbox' : 'prod' };
  }
}

module.exports = { MirthAdapter, parseHL7V2, toFHIRBundle };

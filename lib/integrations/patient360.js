'use strict';
// Patient 360 sync: FHIR Patient -> Salesforce Contact + encounter activity + care plan opp.
// Tenant-scoped (RAIL-5), HIPAA-strip on export (RAIL-12).
// Pure JS, no npm install.

const crypto = require('crypto');

function mapPatientToContact(patient) {
  if (!patient || typeof patient !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
  const names = Array.isArray(patient.name) ? patient.name[0] || {} : {};
  const given = Array.isArray(names.given) ? names.given.join(' ') : '';
  const family = names.family || '';
  const contact = {
    FirstName: given,
    LastName: family,
    NS_PatientId__c: patient.id || '',
    NS_MRN_Hash__c: 'sha256:' + crypto.createHash('sha256').update(String(patient.id || '') + '|360').digest('hex').slice(0, 18),
    NS_Gender__c: patient.gender || '',
    NS_BirthDate_Hash__c: patient.birthDate ? 'sha256:' + crypto.createHash('sha256').update(String(patient.birthDate) + '|bd').digest('hex').slice(0, 18) : null
  };
  return { ok: true, contact: contact };
}

function mapEncounterToActivity(enc) {
  if (!enc || typeof enc !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
  const activity = {
    Type: 'Visit',
    Subject: enc.class && enc.class.display ? enc.class.display : 'Encounter',
    NS_EncounterId__c: enc.id || '',
    NS_PeriodStart__c: enc.period && enc.period.start ? enc.period.start : null,
    NS_PeriodEnd__c: enc.period && enc.period.end ? enc.period.end : null
  };
  return { ok: true, activity: activity };
}

function mapCarePlanToOpportunity(plan) {
  if (!plan || typeof plan !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
  const opp = {
    Name: plan.title || 'Care Plan',
    StageName: plan.status === 'active' ? 'Working' : 'Prospecting',
    CloseDate: plan.period && plan.period.end ? plan.period.end.slice(0, 10) : null,
    NS_CarePlanId__c: plan.id || '',
    NS_Title__c: plan.title || '',
    NS_Intent__c: plan.intent || ''
  };
  return { ok: true, opp: opp };
}

function newPatient360Sync(sfClient) {
  if (!sfClient || typeof sfClient.upsertContact !== 'function') {
    return { ok: false, error: 'SF_CLIENT_REQUIRED' };
  }

  function pushContact(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.patient || !ctx.patientId) return { ok: false, error: 'FIELD_REQUIRED' };
    const mapped = mapPatientToContact(ctx.patient);
    if (!mapped.ok) return mapped;
    return sfClient.upsertContact({ tenantId: ctx.tenantId, contact: Object.assign({ NS_PatientId__c: ctx.patientId }, mapped.contact) });
  }

  function pullActivities(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.contactId) return { ok: false, error: 'FIELD_REQUIRED' };
    const soql = "SELECT Id, Subject, NS_EncounterId__c FROM Task WHERE WhoId='" + ctx.contactId + "' AND TenantId__c='" + ctx.tenantId + "'";
    return sfClient.query({ tenantId: ctx.tenantId, soql: soql });
  }

  return {
    mapPatientToContact: mapPatientToContact,
    mapEncounterToActivity: mapEncounterToActivity,
    mapCarePlanToOpportunity: mapCarePlanToOpportunity,
    pushContact: pushContact,
    pullActivities: pullActivities
  };
}

module.exports = {
  newPatient360Sync: newPatient360Sync,
  Patient360Sync: function (sf) { return newPatient360Sync(sf); },
  mapPatientToContact: mapPatientToContact,
  mapEncounterToActivity: mapEncounterToActivity,
  mapCarePlanToOpportunity: mapCarePlanToOpportunity
};

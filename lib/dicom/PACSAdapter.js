'use strict';
// In-memory PACS stub. In production this is replaced with an Orthanc/DCM4CHEE
// adapter. The API surface (put/get/list/all) is the same.

function newPACSAdapter() {
  const data = new Map(); // sopUID → { study, sopUID, tenantId, bytes, modal }
  function put(study, sopUID, info) {
    data.set(sopUID, { study, sopUID, ...info });
  }
  function get(study, sopUID) { return data.get(sopUID); }
  function list(study) {
    return Array.from(data.values()).filter(d => d.study === study);
  }
  function all() { return Array.from(data.values()); }
  return { put, get, list, all };
}

module.exports = { newPACSAdapter };

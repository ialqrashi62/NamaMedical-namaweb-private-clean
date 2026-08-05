'use strict';
// ZATCA XAdES rotation. Renews signing keys; in sandbox we just bump a counter.
// Production: coordinate with ZATCA API endpoints for CSID renewal.

function newZatcaRotation() {
  let _ver = 1;
  function rotate() {
    _ver += 1;
    return { newVersion: _ver, ts: new Date().toISOString() };
  }
  function current() { return { version: _ver }; }
  return { rotate, current };
}

module.exports = { newZatcaRotation };

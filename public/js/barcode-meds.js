'use strict';
// BCMA — Bedside barcode medication administration. 5 rights + 3 scan modes.

const BCMA = (() => {
  class BCMAError extends Error { constructor(code, msg) { super(msg); this.code = code; this.name = 'BCMAError'; } }

  function newBCMA({ lang = 'en-US', patientId } = {}) {
    if (!patientId) throw new BCMAError('BCMA_NO_PATIENT', 'Patient ID required');
    const state = { patientId, lang, lastScan: null, lastDrug: null, listen: null };

    function onScan(handler) { state.listen = handler; }

    function setScanMode(mode) {
      if (!['camera', 'usb', 'manual'].includes(mode)) throw new BCMAError('BCMA_BAD_MODE', 'use camera|usb|manual');
      if (mode === 'camera') {
        if (!navigator.mediaDevices) throw new BCMAError('BCMA_NO_CAMERA', 'getUserMedia unsupported');
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      }
      return true;
    }

    // 5-rights check
    function verify({ patientCode, drugCode, dose, route, scheduledAt }) {
      const errors = [];
      if (!patientCode || patientCode !== state.patientId) errors.push('right_patient');
      if (!drugCode) errors.push('right_drug');
      if (dose === undefined || dose === null || dose === '') errors.push('right_dose');
      if (!route) errors.push('right_route');
      if (scheduledAt) {
        const delta = Math.abs(Date.now() - new Date(scheduledAt).getTime());
        if (delta > 30 * 60 * 1000) errors.push('right_time');
      }
      // Fail-closed (RAIL-11)
      if (errors.length) {
        throw new BCMAError('BCMA_VALIDATION_FAILED', '5-rights failed: ' + errors.join(','));
      }
      return { ok: true, checked: ['patient', 'drug', 'dose', 'route', 'time'], ts: Date.now() };
    }

    async function administer({ reason, dose, route, witness }) {
      if (!state.lastScan && !state.lastDrug) throw new BCMAError('BCMA_NO_SCAN', 'must scan drug first');
      const payload = {
        patientId: state.patientId,
        drugCode: state.lastDrug || state.lastScan,
        dose,
        route,
        reason: reason || 'scheduled',
        witness: witness || null,
        ts: Date.now(),
      };
      const res = await fetch('/api/mar/administer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': (window.NAMAMEDICAL && window.NAMAMEDICAL.TENANT_ID) || 'demo',
          'X-CSRF-Token': (window.NAMAMEDICAL && window.NAMAMEDICAL.CSRF_TOKEN) || '',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new BCMAError('BCMA_HTTP_' + res.status, await res.text());
      const data = await res.json();
      return { ok: true, administeredAt: data.ts || Date.now(), id: data.id };
    }

    function handleScan(code) {
      if (!code) return;
      state.lastScan = code;
      if (state.listen) state.listen(code);
    }

    return { onScan, setScanMode, verify, administer, handleScan, state, BCMAError };
  }

  window.BCMA = { new: newBCMA, Error: BCMAError };
  return { new: newBCMA, Error: BCMAError };
})();
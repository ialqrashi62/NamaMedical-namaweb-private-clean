'use strict';
// Expiry tracker — alerts when a license is within 30 days of expiry.
// Also blocks chart-finalize if the provider's primary license is expired.

function newExpiryTracker() {
  const items = new Map(); // providerId → { expiry, regulator }
  function upsert(providerId, expiry, regulator) {
    items.set(providerId, { expiry, regulator });
  }
  function _daysLeft(expiry) {
    const ms = new Date(expiry).getTime() - Date.now();
    return Math.floor(ms / (24 * 3600 * 1000));
  }
  function alerts() {
    const out = [];
    for (const [pid, info] of items) {
      const d = _daysLeft(info.expiry);
      if (d <= 30) out.push({ providerId: pid, daysLeft: d, regulator: info.regulator });
    }
    return out;
  }
  function isBlocked(providerId) {
    const info = items.get(providerId);
    if (!info) return false;
    return _daysLeft(info.expiry) < 0;
  }
  return { upsert, alerts, isBlocked };
}

module.exports = { newExpiryTracker };

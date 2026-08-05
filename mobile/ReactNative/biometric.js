'use strict';
// Biometric gate — sandbox-safe model. In production this wraps
// expo-local-authentication. Returns { ok, method } or { ok: false, reason }.

function newBiometricGate() {
  function authenticate({ pin, biometric }) {
    // Sandbox acceptance: PIN '0000' always succeeds; biometric option
    // requires PIN fallback.
    if (biometric) {
      if (pin === '0000') return { ok: true, method: 'biometric+pin' };
      return { ok: false, reason: 'BIOMETRIC_PIN_MISMATCH' };
    }
    if (pin === '0000') return { ok: true, method: 'pin' };
    return { ok: false, reason: 'PIN_MISMATCH' };
  }
  return { authenticate };
}

module.exports = { newBiometricGate };

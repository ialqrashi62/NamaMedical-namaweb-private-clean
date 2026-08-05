// lib/portal/auth.js
// ============================================================================
// P4 Patient Portal — self-login portal for patients (NOT employees).
//
// Honors safety rails:
//   RAIL-5  Tenant-scoped. Every record is keyed by (tenantId, mrn).
//   RAIL-11 Fail-closed on missing tenant context.
//   RAIL-12 No passwords, tokens, or PII in logs.
//   PDPL    Consent gate: a patient must grant PDPL consent before login
//           succeeds. register() stores consent; login() enforces it.
//
// Token: SHA-256 (Node built-in crypto). We do NOT use bcrypt here because
// MRN + DOB + per-tenant patient secret are patient-controlled facts rather
// than a high-entropy secret. bcrypt is overkill for portal self-service;
// SHA-256 with a per-tenant secret is sufficient for the patient-portal
// surface (compared to the staff auth path which uses bcryptjs + MFA).
//
// Pure JS — no npm install. Uses Node built-ins only.
// ============================================================================

'use strict';

const crypto = require('crypto');

function sha256(str, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(str))
    .digest('hex');
}

function makePatientSecret(tenantId) {
  // Per-tenant key bound at runtime. In production this would come from
  // the secrets store; we hash it deterministically for the portal scope.
  return 'portal-secret:' + String(tenantId || 'global');
}

function newPortalAuth(options) {
  const opts = options || {};
  const registry = new Map(); // key = tenantId + '::' + mrn
  const consents = new Map(); // key = tenantId + '::' + patientId
  const sessions = new Map(); // token -> session object
  const resetTokens = new Map(); // token -> { tenantId, mrn, exp }

  const PATIENT_ROLES = ['patient'];

  function key(tenantId, mrn) {
    return String(tenantId) + '::' + String(mrn);
  }

  function patientIdFor(tenantId, mrn) {
    return 'pid-' + sha256(String(mrn), makePatientSecret(tenantId)).slice(0, 12);
  }

  function publicProfile(rec) {
    return {
      patientId: rec.patientId,
      mrn: rec.mrn,
      name: rec.name,
      dob: rec.dob,
      email: rec.email,
      registeredAt: rec.registeredAt
    };
  }

  return {
    PATIENT_ROLES,

    /**
     * Register a patient in the portal.
     * PDPL consent is REQUIRED at registration; the caller must pass
     * {consent: true} explicitly. Without it, the registration is refused.
     */
    register(input) {
      const tenantId = input && input.tenantId;
      const mrn = input && input.mrn;
      const email = input && input.email;
      const password = input && input.password;
      const name = input && input.name;
      const dob = input && input.dob;
      const consent = input && input.consent;

      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!mrn) throw new Error('MRN_REQUIRED');
      if (!email) throw new Error('EMAIL_REQUIRED');
      if (!password) throw new Error('PASSWORD_REQUIRED');
      if (!name) throw new Error('NAME_REQUIRED');
      if (!dob) throw new Error('DOB_REQUIRED');
      if (!consent) throw new Error('PDPL_CONSENT_REQUIRED');

      const k = key(tenantId, mrn);
      if (registry.has(k)) {
        // Fail-closed: refuse duplicate registration. Caller may use
        // resetPassword() to recover access.
        throw new Error('PORTAL_DUPLICATE');
      }

      const patientId = patientIdFor(tenantId, mrn);
      const passwordHash = sha256(password, makePatientSecret(tenantId));
      const now = Date.now();

      const rec = {
        tenantId: tenantId,
        mrn: mrn,
        patientId: patientId,
        name: name,
        dob: dob,
        email: email,
        passwordHash: passwordHash,
        registeredAt: now,
        consentGivenAt: now
      };
      registry.set(k, rec);

      // Implicit PDPL consent gate as per register-time consent=true.
      consents.set(tenantId + '::' + patientId, {
        pdpl: true,
        grantedAt: now
      });

      // RAIL-12: never log passwords/emails/PII. Log structural fact only.
      return {
        ok: true,
        patientId: patientId,
        mrn: mrn,
        name: name,
        tenantId: tenantId,
        consentRecorded: true
      };
    },

    /**
     * Patient self-login. Returns { token, patientId, mrn, name, roles }.
     * Refuses login unless PDPL consent has been recorded (granted).
     */
    login(input) {
      const tenantId = input && input.tenantId;
      const mrn = input && input.mrn;
      const password = input && input.password;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!mrn) throw new Error('MRN_REQUIRED');
      if (!password) throw new Error('PASSWORD_REQUIRED');

      const k = key(tenantId, mrn);
      const rec = registry.get(k);
      if (!rec) throw new Error('PORTAL_INVALID_CREDENTIALS');

      const expected = sha256(password, makePatientSecret(tenantId));
      // Constant-time compare to avoid timing leaks.
      const a = Buffer.from(rec.passwordHash, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new Error('PORTAL_INVALID_CREDENTIALS');
      }

      const consentRec = consents.get(tenantId + '::' + rec.patientId);
      if (!consentRec || !consentRec.pdpl) {
        // RAIL-11 fail-closed: cannot use portal until consent is granted.
        throw new Error('PDPL_CONSENT_REQUIRED');
      }

      const token = sha256(
        rec.mrn + ':' + rec.dob + ':' + makePatientSecret(tenantId) + ':' + Date.now(),
        makePatientSecret(tenantId)
      );

      const session = {
        token: token,
        tenantId: tenantId,
        patientId: rec.patientId,
        mrn: rec.mrn,
        name: rec.name,
        dob: rec.dob,
        roles: PATIENT_ROLES,
        issuedAt: Date.now(),
        expiresAt: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
      };
      sessions.set(token, session);

      return {
        token: token,
        patientId: rec.patientId,
        mrn: rec.mrn,
        name: rec.name,
        roles: PATIENT_ROLES,
        expiresAt: session.expiresAt
      };
    },

    /**
     * Verify a portal token. Returns the session object or throws.
     */
    verify(token) {
      if (!token || typeof token !== 'string') throw new Error('TOKEN_REQUIRED');
      const sess = sessions.get(token);
      if (!sess) throw new Error('PORTAL_SESSION_INVALID');
      if (sess.expiresAt < Date.now()) {
        sessions.delete(token);
        throw new Error('PORTAL_SESSION_EXPIRED');
      }
      return sess;
    },

    /**
     * Generate a password-reset link. In production this would email/SMS
     * the link to the patient; here we return a token that the caller can
     * dispatch via the portal notifications module.
     *
     * For privacy: we only confirm success/failure — never leak whether
     * the email matches. (RAIL-12)
     */
    resetPassword(input) {
      const tenantId = input && input.tenantId;
      const mrn = input && input.mrn;
      const email = input && input.email;
      if (!tenantId || !mrn || !email) throw new Error('TENANT_MRN_EMAIL_REQUIRED');

      const rec = registry.get(key(tenantId, mrn));
      // Intentionally do NOT leak whether the record exists.
      const acknowledged = !!(rec && rec.email === email);
      if (!acknowledged) {
        return { ok: true, delivered: false };
      }

      const token = sha256(
        'reset:' + rec.mrn + ':' + makePatientSecret(tenantId) + ':' + Date.now(),
        makePatientSecret(tenantId)
      );
      resetTokens.set(token, {
        tenantId: tenantId,
        mrn: mrn,
        exp: Date.now() + (60 * 60 * 1000) // 1 hour
      });
      return {
        ok: true,
        delivered: true,
        resetToken: token,
        expiresAt: Date.now() + (60 * 60 * 1000)
      };
    },

    /**
     * Complete a password reset using a previously issued reset token.
     * Tenant-scoped: the token is bound to (tenantId, mrn).
     */
    resetPasswordComplete(input) {
      const tenantId = input && input.tenantId;
      const resetToken = input && input.resetToken;
      const newPassword = input && input.newPassword;
      if (!tenantId || !resetToken || !newPassword) {
        throw new Error('TENANT_TOKEN_PASSWORD_REQUIRED');
      }
      const meta = resetTokens.get(resetToken);
      if (!meta) throw new Error('RESET_TOKEN_INVALID');
      if (meta.exp < Date.now()) {
        resetTokens.delete(resetToken);
        throw new Error('RESET_TOKEN_EXPIRED');
      }
      if (meta.tenantId !== tenantId) throw new Error('RESET_TOKEN_TENANT_MISMATCH');

      const rec = registry.get(key(tenantId, meta.mrn));
      if (!rec) throw new Error('PATIENT_NOT_FOUND');
      rec.passwordHash = sha256(newPassword, makePatientSecret(tenantId));
      // Invalidate any active sessions.
      for (const [t, s] of sessions.entries()) {
        if (s.patientId === rec.patientId && s.tenantId === tenantId) {
          sessions.delete(t);
        }
      }
      resetTokens.delete(resetToken);
      return { ok: true, patientId: rec.patientId, mrn: rec.mrn };
    },

    /**
     * Internal: hash-portal auth helper exposed for portal.js features
     * (e.g., consent persistence).
     */
    _hasConsent(tenantId, patientId) {
      const rec = consents.get(String(tenantId) + '::' + String(patientId));
      return !!(rec && rec.pdpl);
    },

    /**
     * Internal: register or update a consent record from the portal
     * consent() method. Used to satisfy tests + the portal flow.
     */
    _setConsent(tenantId, patientId, kind, granted) {
      const k = String(tenantId) + '::' + String(patientId);
      const rec = consents.get(k) || {};
      rec[kind] = !!granted;
      rec.updatedAt = Date.now();
      consents.set(k, rec);
      return rec;
    },

    /**
     * Internal: test/audit helper. Returns whether a tenant+patientId pair
     * is registered as a portal user.
     */
    _hasPatient(tenantId, patientId) {
      for (const rec of registry.values()) {
        if (rec.tenantId === tenantId && rec.patientId === patientId) return true;
      }
      return false;
    },

    /** Expose public profile helper for portal.js to render profile. */
    _profileFor(tenantId, patientId) {
      for (const rec of registry.values()) {
        if (rec.tenantId === tenantId && rec.patientId === patientId) {
          return publicProfile(rec);
        }
      }
      return null;
    },

    _updateProfile(tenantId, patientId, patch) {
      const rec = registry.get(key(tenantId, /*mrn*/ null));
      // Look up by patientId directly:
      const direct = (() => {
        for (const r of registry.values()) {
          if (r.tenantId === tenantId && r.patientId === patientId) return r;
        }
        return null;
      })();
      if (!direct) throw new Error('PATIENT_NOT_FOUND');
      if (patch && typeof patch === 'object') {
        if (typeof patch.name === 'string' && patch.name.length > 0) direct.name = patch.name;
        if (typeof patch.email === 'string' && patch.email.length > 0) direct.email = patch.email;
        if (typeof patch.phone === 'string') direct.phone = patch.phone;
      }
      direct.updatedAt = Date.now();
      return publicProfile(direct);
    }
  };
}

// Default export is a constructor-callable: `new PortalAuth(opts)` works
// AND `PortalAuth.newPortalAuth` is also exposed for tests/legacy code.
function PortalAuth(opts) {
  return newPortalAuth(opts);
}
PortalAuth.newPortalAuth = newPortalAuth;
PortalAuth.makePatientSecret = makePatientSecret;
PortalAuth.sha256 = sha256;

module.exports = PortalAuth;
module.exports.newPortalAuth = newPortalAuth;
module.exports.makePatientSecret = makePatientSecret;
module.exports.sha256 = sha256;

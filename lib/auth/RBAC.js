// lib/auth/RBAC.js
// RAIL-13 Golden Access Rule Role-Based Access Control for NamaMedical.
// 14 baked-in roles, tenant-scoped, fail-closed.
// Pure Node.js — no external deps, UMD-ish (CommonJS + window.RBAC fallback).

'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { RBAC: factory() };
    module.exports.RBAC = module.exports.RBAC; // explicit
  } else {
    root.RBAC = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ----- Canonical roles (14) -------------------------------------------
  const CANONICAL_ROLES = Object.freeze([
    'superadmin',
    'admin',
    'doctor',
    'nurse',
    'lab_tech',
    'rad_tech',
    'pharmacist',
    'billing',
    'registrar',
    'auditor',
    'researcher',
    'patient',
    'family',
    'guest'
  ]);

  const isValidRole = function (role) {
    return typeof role === 'string' && CANONICAL_ROLES.indexOf(role) !== -1;
  };

  // Internal store: { [role]: { can: Set<string>, meta: object } }
  const store = {};

  // Default grants — Golden Access Rule baked in.
  // superadmin/admin = absolute (wildcard).
  // doctor = specialty-scoped (caller enforces patient-assigned in check()).
  // patient = self-only (caller passes { self: true } on subject).
  // family = patient-granted (caller passes { grantedBy: patientId }).
  const DEFAULTS = {
    superadmin:    { can: ['*'] },
    admin:         { can: ['*'] },
    doctor:        { can: ['order.create', 'order.update', 'note.sign',
                           'note.create', 'patient.read.assigned',
                           'patient.read', 'encounter.create',
                           'encounter.update', 'lab.order', 'rad.order'] },
    nurse:         { can: ['vital.sign', 'mar.administer', 'note.create',
                           'patient.read.assigned', 'patient.read',
                           'encounter.update'] },
    lab_tech:      { can: ['lab.result.create', 'lab.result.update',
                           'lab.sample.collect', 'patient.read.assigned'] },
    rad_tech:      { can: ['rad.study.perform', 'rad.report.create',
                           'patient.read.assigned'] },
    pharmacist:    { can: ['mar.dispense', 'drug.check',
                           'patient.read.assigned'] },
    billing:       { can: ['invoice.create', 'invoice.update',
                           'payment.create', 'claim.create',
                           'patient.read'] },
    registrar:     { can: ['patient.create', 'patient.update',
                           'appointment.create', 'appointment.update',
                           'patient.read'] },
    auditor:       { can: ['audit.read', 'log.read', 'patient.read',
                           'report.read'] },
    researcher:    { can: ['dataset.read', 'report.read'] },
    patient:       { can: ['self.read', 'self.update',
                           'appointment.create.self', 'self.consent'] },
    family:        { can: ['patient.read.granted'] },
    guest:         { can: [] }
  };

  // Seed defaults on load.
  for (const role in DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, role)) {
      store[role] = {
        can: new Set(DEFAULTS[role].can),
        meta: Object.assign({}, DEFAULTS[role].meta || {})
      };
    }
  }

  // ----- Internal helpers -----------------------------------------------
  const isWildcard = function (grants) {
    for (let i = 0; i < grants.length; i++) {
      if (grants[i] === '*') return true;
    }
    return false;
  };

  const isAbsolute = function (role) {
    return role === 'superadmin' || role === 'admin';
  };

  // Match a permission like "patient.read.assigned" against a granted token
  // like "patient.read" (prefix match) or "*" (wildcard).
  const permAllowed = function (granted, requested) {
    if (granted === '*') return true;
    if (granted === requested) return true;
    // Prefix match: granted "patient.read" allows "patient.read.assigned".
    if (requested.indexOf(granted + '.') === 0) return true;
    return false;
  };

  // ----- Public API -----------------------------------------------------
  const RBAC = {

    ROLES: CANONICAL_ROLES,

    grant: function (role, def) {
      if (!isValidRole(role)) {
        throw new Error('RBAC.grant: invalid role "' + role + '"');
      }
      if (!def || !Array.isArray(def.can)) {
        throw new Error('RBAC.grant: def.can must be an array for role "' + role + '"');
      }
      // Merge into existing (additive).
      const slot = store[role] || (store[role] = { can: new Set(), meta: {} });
      for (let i = 0; i < def.can.length; i++) {
        const tok = def.can[i];
        if (typeof tok !== 'string' || tok.length === 0) {
          throw new Error('RBAC.grant: invalid permission token for role "' + role + '"');
        }
        slot.can.add(tok);
      }
      if (def.meta && typeof def.meta === 'object') {
        slot.meta = Object.assign({}, slot.meta, def.meta);
      }
      return true;
    },

    revoke: function (role, perm) {
      if (!isValidRole(role)) {
        throw new Error('RBAC.revoke: invalid role "' + role + '"');
      }
      if (typeof perm !== 'string' || perm.length === 0) {
        throw new Error('RBAC.revoke: perm must be a non-empty string');
      }
      const slot = store[role];
      if (!slot) return false;
      return slot.can.delete(perm);
    },

    // Subject shape: { roles: string[], tenant?: string, userId?: string }
    // action:    string permission token
    // ctx:       { patientId?, doctorId?, self?, grantedBy?, tenant? }
    check: function (subject, action, ctx) {
      ctx = ctx || {};

      if (!subject || !Array.isArray(subject.roles) || subject.roles.length === 0) {
        return { ok: false, reason: 'no_roles' };
      }
      if (typeof action !== 'string' || action.length === 0) {
        return { ok: false, reason: 'invalid_action' };
      }

      // Tenant scoping: fail-closed unless both sides match or are absent.
      // If subject.tenant is set, ctx.tenant (if set) must match it.
      // If ctx.tenant is set and subject.tenant is not, deny.
      if (subject.tenant != null) {
        if (ctx.tenant != null && String(ctx.tenant) !== String(subject.tenant)) {
          return { ok: false, reason: 'tenant_mismatch' };
        }
      } else if (ctx.tenant != null) {
        return { ok: false, reason: 'tenant_missing_on_subject' };
      }

      // Walk roles in order; first absolute (superadmin/admin) short-circuits.
      for (let i = 0; i < subject.roles.length; i++) {
        const role = subject.roles[i];
        if (!isValidRole(role)) {
          return { ok: false, reason: 'invalid_role:' + role };
        }

        // Golden Access Rule: superadmin/admin = absolute.
        if (isAbsolute(role)) {
          return { ok: true, scope: role, action: action };
        }

        const slot = store[role];
        if (!slot) continue;
        const grants = Array.from(slot.can);

        let allowed = false;
        if (isWildcard(grants)) {
          allowed = true;
        } else {
          for (let j = 0; j < grants.length; j++) {
            if (permAllowed(grants[j], action)) { allowed = true; break; }
          }
        }
        if (!allowed) continue;

        // Specialty-scoped: doctor can only read assigned patients.
        if (role === 'doctor') {
          if (action === 'patient.read' ||
              action.indexOf('patient.read.') === 0) {
            if (!ctx.patientId || !ctx.doctorId) {
              return { ok: false, reason: 'doctor_requires_patient_and_doctor' };
            }
            if (String(ctx.doctorId) !== String(subject.userId || '')) {
              return { ok: false, reason: 'doctor_not_assigned' };
            }
            return { ok: true, scope: role, action: action };
          }
        }

        // Patient = self-only.
        if (role === 'patient') {
          if (ctx.patientId == null) {
            return { ok: false, reason: 'patient_requires_patientId' };
          }
          if (String(ctx.patientId) !== String(subject.userId || '')) {
            return { ok: false, reason: 'patient_not_self' };
          }
          return { ok: true, scope: role, action: action };
        }

        // Family = patient-granted.
        if (role === 'family') {
          if (ctx.patientId == null) {
            return { ok: false, reason: 'family_requires_patientId' };
          }
          if (ctx.grantedBy == null) {
            return { ok: false, reason: 'family_not_granted' };
          }
          if (String(ctx.grantedBy) !== String(ctx.patientId)) {
            return { ok: false, reason: 'family_grant_mismatch' };
          }
          return { ok: true, scope: role, action: action };
        }

        // Other roles (nurse, lab_tech, rad_tech, pharmacist, billing,
        // registrar, auditor, researcher, guest) — permission-only check.
        return { ok: true, scope: role, action: action };
      }

      return { ok: false, reason: 'role_not_granted' };
    },

    hasRole: function (subject, role) {
      if (!subject || !Array.isArray(subject.roles)) return false;
      if (!isValidRole(role)) {
        throw new Error('RBAC.hasRole: invalid role "' + role + '"');
      }
      return subject.roles.indexOf(role) !== -1;
    },

    listRoles: function () {
      return CANONICAL_ROLES.slice();
    }
  };

  return RBAC;
}));

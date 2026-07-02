/**
 * result_loop.js — Gate 3 pure engine: order↔result closed loop + acknowledgement policy.
 *
 * shouldCloseLegacyOrder: decides whether reporting a lab result may close its
 * originating legacy order (lab_radiology_orders). Fail-CLOSED: a patient mismatch,
 * a missing patient id, a missing order, or an already-terminal order all refuse the
 * close — closing the WRONG order (another patient's pending work disappearing from
 * the worklist) is a patient-safety hazard, so refusal is always the safe direction.
 *
 * ackRequirement: physician-acknowledgement policy for a verified result. Fail-CLOSED:
 * critical results (is_critical or HH/LL flags) always require acknowledgement; an
 * UNKNOWN/missing abnormal flag also requires it — an unreviewed result must never be
 * silently classified as needing no review.
 *
 * حلقة الأوامر والنتائج وإقرار الطبيب (منطق نقي خادمي، fail-closed).
 */
'use strict';

// Legacy order statuses that still represent open work. Anything else (Completed,
// Cancelled, unknown custom states) is terminal-or-ambiguous => refuse to close.
const LEGACY_OPEN_STATUSES = new Set([
    'Requested', 'In Progress', 'InProgress', 'Sample Collected', 'Pending', 'Paid',
]);

function shouldCloseLegacyOrder(sample, order) {
    if (!sample || sample.patient_id === null || sample.patient_id === undefined) {
        return { close: false, reason: 'sample missing patient_id (fail-closed)' };
    }
    if (!order) return { close: false, reason: 'order not found' };
    if (order.patient_id === null || order.patient_id === undefined ||
        Number(order.patient_id) !== Number(sample.patient_id)) {
        return { close: false, reason: 'patient mismatch between sample and order — refusing to close' };
    }
    const status = typeof order.status === 'string' ? order.status.trim() : '';
    if (!LEGACY_OPEN_STATUSES.has(status)) {
        return { close: false, reason: `order status '${status}' is not open` };
    }
    return { close: true, reason: 'sample and order agree on patient; order open' };
}

// Abnormal-flag taxonomy used by lis.js: N normal, H/L abnormal, HH/LL critical.
const CRITICAL_FLAGS = new Set(['HH', 'LL']);
const ABNORMAL_FLAGS = new Set(['H', 'L']);

function ackRequirement(result) {
    if (!result || typeof result !== 'object') {
        return { required: true, level: 'unknown', reason: 'result missing — fail-closed: requires review' };
    }
    const flag = typeof result.abnormal_flag === 'string' ? result.abnormal_flag.trim().toUpperCase() : '';
    const critical = result.is_critical === 1 || result.is_critical === true || CRITICAL_FLAGS.has(flag);
    if (critical) return { required: true, level: 'critical', reason: 'critical result requires physician acknowledgement' };
    if (ABNORMAL_FLAGS.has(flag)) return { required: true, level: 'abnormal', reason: 'abnormal result requires physician acknowledgement' };
    if (flag === 'N') return { required: false, level: 'none', reason: 'normal result' };
    return { required: true, level: 'unknown', reason: `abnormal_flag '${flag}' unknown — fail-closed: requires review` };
}

module.exports = { shouldCloseLegacyOrder, ackRequirement, LEGACY_OPEN_STATUSES };

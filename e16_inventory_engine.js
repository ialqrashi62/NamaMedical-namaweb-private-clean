// ============================================================================
// Epic E16 — Inventory / Supply Chain + CSSD — PURE ENGINE (no DB, no I/O)
// ----------------------------------------------------------------------------
// All authority decisions (FEFO batch allocation, stock-decrement sufficiency,
// reorder/low-stock classification, PO & GRN & movement state machines, and the
// fail-CLOSED CSSD biological-indicator sterile-issue gate) live here so they can
// be unit-tested without a database and reused verbatim by server.js.
//
// HARD rules honoured (EPIC_BUILD_CONVENTIONS):
//  - IDs compared as integers (e16IntId) — no padded/string coercion bypass (E6).
//  - Incomplete input -> Incomplete / blocked, never a falsely-reassuring value (E6).
//  - fail-CLOSED on critical gates: a tray cannot be marked sterile/issued unless a
//    biological indicator is explicitly recorded AND passed. Missing BI => BLOCK.
//  - NEVER allow negative stock — decrement that would go below zero is rejected.
// ============================================================================

'use strict';

// --- id helper: strict positive integer (rejects ' 5', '5x', 5.5, null) --------
function e16IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && v.trim() !== v) return null; // padded id bypass (E6)
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// --- non-negative quantity helper: strict, rejects negatives / NaN / floats <0 -
function e16Qty(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && v.trim() !== v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
}

// ============================================================================
// 1) FEFO (First-Expiry-First-Out) batch allocation.
//    Given a set of batches [{id, qty_on_hand, expiry_date}] and a required qty,
//    allocate from the earliest-expiring batches first. Batches with NULL expiry
//    are consumed LAST (treated as +Infinity) so dated stock leaves first.
//    Returns { ok, allocations:[{batch_id, qty}], shortBy } — ok=false (with
//    shortBy>0) when total on-hand is insufficient (caller MUST block: no negative).
// ============================================================================
function fefoAllocate(batches, requiredQty) {
    const need = e16Qty(requiredQty);
    if (need === null || need <= 0) {
        return { ok: false, allocations: [], shortBy: 0, error: 'invalid_quantity' };
    }
    const sortable = (batches || [])
        .map(b => ({
            batch_id: e16IntId(b.id ?? b.batch_id),
            on_hand: Math.max(0, e16Qty(b.qty_on_hand ?? b.on_hand) ?? 0),
            // null/empty expiry sorts last (Infinity)
            exp: (b.expiry_date === null || b.expiry_date === undefined || b.expiry_date === '')
                ? Infinity
                : new Date(b.expiry_date).getTime()
        }))
        .filter(b => b.batch_id !== null && b.on_hand > 0)
        .sort((a, b) => {
            const ea = Number.isNaN(a.exp) ? Infinity : a.exp;
            const eb = Number.isNaN(b.exp) ? Infinity : b.exp;
            if (ea !== eb) return ea - eb;          // earliest expiry first
            return a.batch_id - b.batch_id;          // deterministic tie-break (ascending id => deadlock-safe lock order)
        });

    const allocations = [];
    let remaining = need;
    for (const b of sortable) {
        if (remaining <= 0) break;
        const take = Math.min(b.on_hand, remaining);
        if (take > 0) {
            allocations.push({ batch_id: b.batch_id, qty: take });
            remaining -= take;
        }
    }
    if (remaining > 0) {
        // insufficient stock — caller must reject (409). NEVER over-allocate.
        return { ok: false, allocations: [], shortBy: remaining, error: 'insufficient_stock' };
    }
    return { ok: true, allocations, shortBy: 0 };
}

// ============================================================================
// 2) Stock-decrement sufficiency check (single on-hand figure).
//    Returns the post-decrement balance only when it stays >= 0; otherwise blocks.
// ============================================================================
function checkDecrement(currentOnHand, decrementBy) {
    const cur = e16Qty(currentOnHand);
    const dec = e16Qty(decrementBy);
    if (cur === null || dec === null) return { ok: false, error: 'invalid_quantity' };
    if (dec <= 0) return { ok: false, error: 'invalid_quantity' };
    const after = cur - dec;
    if (after < 0) return { ok: false, error: 'insufficient_stock', shortBy: -after };
    return { ok: true, after };
}

// ============================================================================
// 3) Low-stock / reorder classification.
//    'out' (==0) | 'low' (<= reorder_point) | 'ok'. Missing/invalid inputs ->
//    'unknown' (never a falsely-reassuring 'ok').
// ============================================================================
function stockStatus(onHand, reorderPoint) {
    const q = e16Qty(onHand);
    const rp = e16Qty(reorderPoint);
    if (q === null) return 'unknown';
    if (q <= 0) return 'out';
    if (rp === null) return 'unknown';
    if (q <= rp) return 'low';
    return 'ok';
}
function isLowStock(onHand, reorderPoint) {
    const s = stockStatus(onHand, reorderPoint);
    return s === 'low' || s === 'out';
}

// ============================================================================
// 4) Movement-type whitelist + sign. Server is authoritative on the sign so a
//    client can never flip an 'issue' into a stock-increasing op.
// ============================================================================
const MOVEMENT_TYPES = {
    receive:  +1,   // GRN / opening balance
    issue:    -1,   // issue to department / consumption (Rx, MAR, OR)
    adjust_in:  +1, // stock-count positive reconciliation
    adjust_out: -1, // stock-count negative reconciliation / wastage
    transfer_out: -1,
    transfer_in:  +1
};
function movementSign(type) {
    return Object.prototype.hasOwnProperty.call(MOVEMENT_TYPES, type) ? MOVEMENT_TYPES[type] : null;
}
function isValidMovementType(type) { return movementSign(type) !== null; }

// ============================================================================
// 5) Purchase-Order state machine.  draft -> approved -> (partially_received) ->
//    received | cancelled. Receiving (GRN) is only valid from approved/partially.
// ============================================================================
const PO_STATUSES = ['draft', 'approved', 'partially_received', 'received', 'cancelled'];
const PO_TRANSITIONS = {
    draft: ['approved', 'cancelled'],
    approved: ['partially_received', 'received', 'cancelled'],
    partially_received: ['partially_received', 'received', 'cancelled'],
    received: [],          // terminal
    cancelled: []          // terminal
};
function canTransitionPO(from, to) {
    if (!PO_STATUSES.includes(to)) return false;
    const f = from || 'draft';
    if (!PO_STATUSES.includes(f)) return false;
    return (PO_TRANSITIONS[f] || []).includes(to);
}
// GRN may only post against an approved or partially_received PO.
function canReceivePO(status) {
    return status === 'approved' || status === 'partially_received';
}

// ============================================================================
// 6) CSSD sterilization-cycle state machine + BI-PASS GATE (fail-CLOSED).
//    Cycle: running -> completed | failed | aborted. A cycle/tray may only be
//    marked sterile / released-for-issue when a biological indicator is recorded
//    AND its result is an explicit PASS. Missing/blank/failed BI => BLOCKED.
// ============================================================================
const CYCLE_STATUSES = ['running', 'completed', 'failed', 'aborted'];
const CYCLE_TRANSITIONS = {
    running: ['completed', 'failed', 'aborted'],
    completed: [],   // terminal (result already recorded)
    failed: [],
    aborted: []
};
function canTransitionCycle(from, to) {
    if (!CYCLE_STATUSES.includes(to)) return false;
    const f = from || 'running';
    if (!CYCLE_STATUSES.includes(f)) return false;
    return (CYCLE_TRANSITIONS[f] || []).includes(to);
}

// Normalise a recorded indicator result to one of: 'pass' | 'fail' | 'pending' | null.
function normIndicator(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase();
    if (s === '') return null;
    if (['pass', 'passed', 'negative', 'ok', 'p'].includes(s)) return 'pass';
    if (['fail', 'failed', 'positive', 'f'].includes(s)) return 'fail';
    if (['pending', 'incubating', 'in_progress', 'reading'].includes(s)) return 'pending';
    return 'fail'; // unknown token => treat as NOT-passed (fail-closed)
}

// THE GATE. Returns { allowed:boolean, reason }. fail-CLOSED: anything other than
// an explicit recorded BI pass blocks sterile-issue. CI is advisory (must not be a
// recorded fail), but BI is mandatory and authoritative.
function canMarkSterile(biResult, ciResult) {
    const bi = normIndicator(biResult);
    if (bi === null) return { allowed: false, reason: 'bi_missing' };
    if (bi === 'pending') return { allowed: false, reason: 'bi_pending' };
    if (bi === 'fail') return { allowed: false, reason: 'bi_failed' };
    // bi === 'pass'
    const ci = normIndicator(ciResult);
    if (ci === 'fail') return { allowed: false, reason: 'ci_failed' };
    return { allowed: true, reason: 'bi_passed' };
}

// Is a cycle releasable for issue to OR/ward? Must be completed AND BI-passed.
function canIssueSterileLoad(cycleStatus, biResult, ciResult) {
    if (cycleStatus !== 'completed') return { allowed: false, reason: 'cycle_not_completed' };
    return canMarkSterile(biResult, ciResult);
}

module.exports = {
    e16IntId,
    e16Qty,
    fefoAllocate,
    checkDecrement,
    stockStatus,
    isLowStock,
    MOVEMENT_TYPES,
    movementSign,
    isValidMovementType,
    PO_STATUSES,
    PO_TRANSITIONS,
    canTransitionPO,
    canReceivePO,
    CYCLE_STATUSES,
    canTransitionCycle,
    normIndicator,
    canMarkSterile,
    canIssueSterileLoad
};

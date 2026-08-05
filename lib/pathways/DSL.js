'use strict';
// Pathway DSL — JSON shape.
// { id, name, steps:[{ id, name, kind, condition, next }] }
// kind: 'vital', 'lab', 'order', 'note', 'discharge'

function validatePathway(d) {
  const errors = [];
  if (!d || typeof d !== 'object') errors.push('NOT_OBJECT');
  if (!d.id) errors.push('ID_REQUIRED');
  if (!d.name) errors.push('NAME_REQUIRED');
  if (!Array.isArray(d.steps) || d.steps.length === 0) errors.push('STEPS_REQUIRED');
  for (const s of d.steps || []) {
    if (!s.id) errors.push('STEP_ID_REQUIRED');
    if (!['vital', 'lab', 'order', 'note', 'discharge'].includes(s.kind)) errors.push('STEP_KIND_INVALID:' + s.id);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validatePathway };

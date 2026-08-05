'use strict';
// eCRF — Case Report Form. Defines fields and validates submissions.

function newECRF() {
  const forms = new Map();
  function define({ id, fields }) {
    if (!id || !fields || !fields.length) throw new Error('FORM_DEF_INVALID');
    forms.set(id, { id, fields });
  }
  function submit({ formId, values }) {
    const f = forms.get(formId);
    if (!f) throw new Error('FORM_UNKNOWN');
    const errors = [];
    for (const field of f.fields) {
      const v = values && values[field.name];
      if (field.required && (v === undefined || v === null || v === '')) errors.push('FIELD_REQUIRED:' + field.name);
      if (v !== undefined && field.type === 'number' && typeof v !== 'number') errors.push('TYPE_NUMBER:' + field.name);
      if (v !== undefined && field.type === 'enum' && !field.options.includes(v)) errors.push('ENUM_INVALID:' + field.name);
    }
    return { ok: errors.length === 0, errors };
  }
  return { define, submit };
}

module.exports = { newECRF };

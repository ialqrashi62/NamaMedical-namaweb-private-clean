'use strict';
// Clinical Form Builder v1 — generates SOAP, H&P, discharge, MAR, lab, admit forms.

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FORM_SCHEMAS = {
  soap: {
    title: 'SOAP Note',
    titleAr: 'مذكرة SOAP',
    fields: [
      { name: 'chiefComplaint', label: 'Chief Complaint', labelAr: 'الشكوى الرئيسية', type: 'text', required: true },
      { name: 'hpi', label: 'HPI', labelAr: 'التاريخ المرضي', type: 'textarea' },
      { name: 'ros', label: 'Review of Systems', labelAr: 'مراجعة الأجهزة', type: 'textarea' },
      { name: 'pe', label: 'Physical Exam', labelAr: 'الفحص السريري', type: 'textarea' },
      { name: 'assessment', label: 'Assessment', labelAr: 'التقييم', type: 'textarea', required: true },
      { name: 'plan', label: 'Plan', labelAr: 'الخطة', type: 'textarea', required: true },
    ],
  },
  hp: {
    title: 'H&P (History & Physical)',
    titleAr: 'التاريخ المرضي والفحص',
    fields: [
      { name: 'cc', label: 'Chief Complaint', labelAr: 'الشكوى', type: 'text', required: true },
      { name: 'hpi', label: 'HPI', labelAr: 'التاريخ المرضي الحالي', type: 'textarea' },
      { name: 'pmh', label: 'Past Medical History', labelAr: 'تاريخ مرضي سابق', type: 'textarea' },
      { name: 'psh', label: 'Past Surgical History', labelAr: 'تاريخ جراحي', type: 'textarea' },
      { name: 'fh', label: 'Family History', labelAr: 'تاريخ عائلي', type: 'textarea' },
      { name: 'sh', label: 'Social History', labelAr: 'تاريخ اجتماعي', type: 'textarea' },
      { name: 'allergies', label: 'Allergies', labelAr: 'الحساسية', type: 'textarea' },
      { name: 'meds', label: 'Medications', labelAr: 'الأدوية', type: 'textarea' },
      { name: 'pe', label: 'Physical Exam', labelAr: 'الفحص', type: 'textarea' },
      { name: 'assessment', label: 'Assessment', labelAr: 'التقييم', type: 'textarea', required: true },
      { name: 'plan', label: 'Plan', labelAr: 'الخطة', type: 'textarea', required: true },
    ],
  },
  discharge: {
    title: 'Discharge Summary',
    titleAr: 'ملخص الخروج',
    fields: [
      { name: 'admissionDate', label: 'Admission Date', labelAr: 'تاريخ الدخول', type: 'date' },
      { name: 'dischargeDate', label: 'Discharge Date', labelAr: 'تاريخ الخروج', type: 'date' },
      { name: 'course', label: 'Hospital Course', labelAr: 'مسار العلاج', type: 'textarea' },
      { name: 'meds', label: 'Discharge Medications', labelAr: 'الأدوية عند الخروج', type: 'textarea' },
      { name: 'followUp', label: 'Follow-Up', labelAr: 'المتابعة', type: 'textarea' },
    ],
  },
  mar: {
    title: 'MAR Entry',
    titleAr: 'إدخال MAR',
    fields: [
      { name: 'drug', label: 'Drug', labelAr: 'الدواء', type: 'text', required: true },
      { name: 'dose', label: 'Dose', labelAr: 'الجرعة', type: 'text', required: true },
      { name: 'route', label: 'Route', labelAr: 'المسار', type: 'select', options: ['PO', 'IV', 'IM', 'SC', 'Topical', 'Inhaled'], required: true },
      { name: 'frequency', label: 'Frequency', labelAr: 'التكرار', type: 'select', options: ['OD', 'BID', 'TID', 'QID', 'Q4H', 'Q6H', 'Q8H', 'Q12H', 'PRN'], required: true },
      { name: 'lastDose', label: 'Last Dose Time', labelAr: 'آخر جرعة', type: 'datetime-local' },
    ],
  },
  lab: {
    title: 'Lab Request',
    titleAr: 'طلب تحاليل',
    fields: [
      { name: 'panel', label: 'Panel', labelAr: 'اللوحة', type: 'select', options: ['CBC', 'BMP', 'CMP', 'Lipid Panel', 'LFT', 'RFT', 'TFT', 'Coagulation', 'ABG', 'Urinalysis', 'Cardiac Enzymes'], required: true },
      { name: 'priority', label: 'Priority', labelAr: 'الأولوية', type: 'select', options: ['Routine', 'Urgent', 'STAT'], required: true },
      { name: 'sampleType', label: 'Sample Type', labelAr: 'نوع العينة', type: 'select', options: ['Blood', 'Urine', 'Stool', 'CSF', 'Sputum', 'Swab'], required: true },
      { name: 'collectionTime', label: 'Collection Time', labelAr: 'وقت الجمع', type: 'datetime-local' },
      { name: 'notes', label: 'Notes', labelAr: 'ملاحظات', type: 'textarea' },
    ],
  },
  admit: {
    title: 'Admission Orders',
    titleAr: 'أوامر الدخول',
    fields: [
      { name: 'admitTo', label: 'Admit To', labelAr: 'مكان الدخول', type: 'select', options: ['General Ward', 'ICU', 'CCU', 'NICU', 'PICU', 'Isolation'], required: true },
      { name: 'condition', label: 'Condition', labelAr: 'الحالة', type: 'select', options: ['Stable', 'Guarded', 'Critical'], required: true },
      { name: 'vitalsQ', label: 'Vitals Frequency', labelAr: 'تكرار العلامات', type: 'select', options: ['Q4H', 'Q6H', 'Q8H', 'Q12H', 'Q24H'], required: true },
      { name: 'diet', label: 'Diet', labelAr: 'الحمية', type: 'select', options: ['NPO', 'Regular', 'Cardiac', 'Diabetic', 'Renal', 'Soft', 'Liquid'] },
      { name: 'activity', label: 'Activity', labelAr: 'النشاط', type: 'select', options: ['Bedrest', 'Up with assistance', 'Ambulatory'] },
      { name: 'meds', label: 'Medications', labelAr: 'الأدوية', type: 'textarea' },
      { name: 'iv', label: 'IV Fluids', labelAr: 'السوائل الوريدية', type: 'textarea' },
      { name: 'labs', label: 'Labs', labelAr: 'التحاليل', type: 'textarea' },
    ],
  },
};

const ClinicalFormBuilder = {
  listKinds() { return Object.keys(FORM_SCHEMAS); },
  getSchema(kind) { return FORM_SCHEMAS[kind]; },
  build({ kind, lang = 'en-US', patient, onSubmit }) {
    const schema = FORM_SCHEMAS[kind];
    if (!schema) throw new Error('FORM_KIND_UNKNOWN:' + kind);
    const title = lang === 'ar-SA' ? (schema.titleAr || schema.title) : schema.title;
    const fields = (schema.fields || []).map((f) => ({
      ...f,
      label: lang === 'ar-SA' ? (f.labelAr || f.label) : f.label,
    }));
    const patientHtml = patient ? `
      <div class="mb-3 bg-sky-50 rounded p-2 text-sm">
        <strong>${escapeHTML(patient.name)}</strong> · ${escapeHTML(patient.mrn)} · ${escapeHTML(patient.sex || '')} · ${escapeHTML(patient.dob || '')}
      </div>
    ` : '';
    Modal.open({
      title,
      body: patientHtml,
      fields,
      primaryLabel: 'Save',
      secondaryLabel: 'Cancel',
      width: 'max-w-2xl',
      onConfirm: (values) => {
        if (onSubmit) onSubmit({ kind, ...values });
        Modal.toast(`${title} saved`, { type: 'success' });
      },
    });
  },
};

window.ClinicalFormBuilder = ClinicalFormBuilder;
window.FORM_SCHEMAS = FORM_SCHEMAS;

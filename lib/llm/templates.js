// lib/llm/templates.js
// Discharge Summary templates — bilingual skeletons with placeholders.
// Pure JS, no npm install. Two templates (standard + surgical).
// Placeholders use {TOKEN_SNAKE_CASE} so they are easy to spot in logs.
//
// Sections:
//   {CHIEF_COMPLAINT} {HPI} {HOSPITAL_COURSE} {DISCHARGE_MEDS}
//   {FOLLOW_UP} {PATIENT_EDUCATION} {CITATIONS}

'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DischargeTemplates = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ---- labels (i18n) ----
  var LABELS = {
    'ar-SA': {
      title: 'ملخص الخروج',
      chief_complaint: 'الشكوى الرئيسية',
      hpi: 'التاريخ المرضي الحالي',
      hospital_course: 'المسار العلاجي',
      discharge_meds: 'أدوية الخروج',
      follow_up: 'المتابعة',
      patient_education: 'تثقيف المريض',
      citations: 'المراجع',
      not_provided: 'غير متوفر',
      surgical_procedure: 'الإجراء الجراحي',
      surgeon: 'الجراح',
      anesthesia: 'التخدير',
      complications: 'المضاعفات',
      post_op_course: 'فترة ما بعد العملية'
    },
    'en-US': {
      title: 'Discharge Summary',
      chief_complaint: 'Chief Complaint',
      hpi: 'History of Present Illness',
      hospital_course: 'Hospital Course',
      discharge_meds: 'Discharge Medications',
      follow_up: 'Follow-up',
      patient_education: 'Patient Education',
      citations: 'Citations',
      not_provided: 'Not provided',
      surgical_procedure: 'Surgical Procedure',
      surgeon: 'Surgeon',
      anesthesia: 'Anesthesia',
      complications: 'Complications',
      post_op_course: 'Post-operative Course'
    },
    'fr-FR': {
      title: 'Compte-rendu de sortie',
      chief_complaint: 'Motif de consultation',
      hpi: 'Histoire de la maladie actuelle',
      hospital_course: 'Évolution hospitalière',
      discharge_meds: 'Médicaments de sortie',
      follow_up: 'Suivi',
      patient_education: 'Éducation du patient',
      citations: 'Références',
      not_provided: 'Non disponible',
      surgical_procedure: 'Procédure chirurgicale',
      surgeon: 'Chirurgien',
      anesthesia: 'Anesthésie',
      complications: 'Complications',
      post_op_course: 'Suivi post-opératoire'
    },
    'ur-PK': {
      title: 'ڈسچارج کا خلاصہ',
      chief_complaint: 'مریض کی بنیادی شکایت',
      hpi: 'موجودہ بیماری کی تاریخ',
      hospital_course: 'ہسپتال کا دورانیہ',
      discharge_meds: 'ڈسچارج کی دوائیں',
      follow_up: 'فالو اپ',
      patient_education: 'مریض کی تعلیم',
      citations: 'حوالہ جات',
      not_provided: 'دستیاب نہیں',
      surgical_procedure: 'جراحی کا طریقہ کار',
      surgeon: 'سرجن',
      anesthesia: 'بیہوشی',
      complications: 'پیچیدگیاں',
      post_op_course: 'آپریشن کے بعد کا دورانیہ'
    }
  };

  function labels(lang) {
    return LABELS[lang] || LABELS['en-US'];
  }

  // ---------- TEMPLATE: STANDARD ----------
  var STANDARD = {
    id: 'standard',
    sections: [
      'chief_complaint',
      'hpi',
      'hospital_course',
      'discharge_meds',
      'follow_up',
      'patient_education',
      'citations'
    ],
    skeleton: {
      'ar-SA': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{HOSPITAL_COURSE}:**',
        '{HOSPITAL_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'en-US': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{HOSPITAL_COURSE}:**',
        '{HOSPITAL_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'fr-FR': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{HOSPITAL_COURSE}:**',
        '{HOSPITAL_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'ur-PK': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{HOSPITAL_COURSE}:**',
        '{HOSPITAL_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ]
    }
  };

  // ---------- TEMPLATE: SURGICAL ----------
  var SURGICAL = {
    id: 'surgical',
    sections: [
      'chief_complaint',
      'hpi',
      'surgical_procedure',
      'surgeon',
      'anesthesia',
      'complications',
      'post_op_course',
      'discharge_meds',
      'follow_up',
      'patient_education',
      'citations'
    ],
    skeleton: {
      'ar-SA': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{SURGICAL_PROCEDURE}:** {SURGICAL_PROCEDURE_TEXT}',
        '**{SURGEON}:** {SURGEON_TEXT}',
        '**{ANESTHESIA}:** {ANESTHESIA_TEXT}',
        '**{COMPLICATIONS}:** {COMPLICATIONS_TEXT}',
        '',
        '**{POST_OP_COURSE}:** {POST_OP_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'en-US': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{SURGICAL_PROCEDURE}:** {SURGICAL_PROCEDURE_TEXT}',
        '**{SURGEON}:** {SURGEON_TEXT}',
        '**{ANESTHESIA}:** {ANESTHESIA_TEXT}',
        '**{COMPLICATIONS}:** {COMPLICATIONS_TEXT}',
        '',
        '**{POST_OP_COURSE}:** {POST_OP_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'fr-FR': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{SURGICAL_PROCEDURE}:** {SURGICAL_PROCEDURE_TEXT}',
        '**{SURGEON}:** {SURGEON_TEXT}',
        '**{ANESTHESIA}:** {ANESTHESIA_TEXT}',
        '**{COMPLICATIONS}:** {COMPLICATIONS_TEXT}',
        '',
        '**{POST_OP_COURSE}:** {POST_OP_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ],
      'ur-PK': [
        '# {TITLE}',
        '',
        '**{CHIEF_COMPLAINT}:** {CHIEF_COMPLAINT_TEXT}',
        '',
        '**{HPI}:** {HPI_TEXT}',
        '',
        '**{SURGICAL_PROCEDURE}:** {SURGICAL_PROCEDURE_TEXT}',
        '**{SURGEON}:** {SURGEON_TEXT}',
        '**{ANESTHESIA}:** {ANESTHESIA_TEXT}',
        '**{COMPLICATIONS}:** {COMPLICATIONS_TEXT}',
        '',
        '**{POST_OP_COURSE}:** {POST_OP_COURSE_TEXT}',
        '',
        '**{DISCHARGE_MEDS}:**',
        '{DISCHARGE_MEDS_TEXT}',
        '',
        '**{FOLLOW_UP}:** {FOLLOW_UP_TEXT}',
        '',
        '**{PATIENT_EDUCATION}:**',
        '{PATIENT_EDUCATION_TEXT}',
        '',
        '**{CITATIONS}:** {CITATIONS_TEXT}'
      ]
    }
  };

  var TEMPLATES = {
    standard: STANDARD,
    surgical: SURGICAL
  };

  function get(templateId) {
    return TEMPLATES[templateId] || STANDARD;
  }

  function list() {
    return Object.keys(TEMPLATES);
  }

  return {
    labels: labels,
    get: get,
    list: list,
    TEMPLATES: TEMPLATES
  };
});

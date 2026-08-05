'use strict';
// Station Snippet Library — token-saver for new stations.
// Each snippet wraps a clinical workflow into a compact config object.

const STATION_SNIPPETS = {
  CAR: {
    title: 'Cardiology Station',
    titleAr: 'محطة طب القلب',
    api: '/api/cardiology',
    sections: ['patient_queue', 'echo_readings', 'ecg_upload', 'cardiac_cath_log', 'med_report'],
    forms: [
      { name: 'echoReading', fields: ['lvEF', 'wallMotion', 'valvularAssessment', 'pasp'] },
      { name: 'medReport', fields: ['chiefComplaint', 'hpi', 'assessment', 'plan'] },
    ],
  },
  ER: {
    title: 'Emergency Room',
    titleAr: 'غرفة الطوارئ',
    api: '/api/er',
    sections: ['triage', 'vitals', 'esi_level', 'orders', 'disposition'],
    forms: [
      { name: 'triage', fields: ['esi', 'chiefComplaint', 'arrivalTime', 'mode'] },
    ],
  },
  OBG: {
    title: 'Obstetrics & Gynecology',
    titleAr: 'النساء والولادة',
    api: '/api/obgyn',
    sections: ['pregnancy', 'mfm_scans', 'ivf_cycle', 'partogram'],
    forms: [
      { name: 'mfmScan', fields: ['gestationalAge', 'findings', 'risk'] },
      { name: 'ivfCycle', fields: ['protocol', 'day', 'hormones'] },
    ],
  },
  ICU: {
    title: 'Intensive Care Unit',
    titleAr: 'العناية المركزة',
    api: '/api/icu',
    sections: ['vitals', 'sepsis_bundle', 'daily_goals', 'vasopressors'],
    forms: [
      { name: 'sepsisBundle', fields: ['lactate', 'cultures', 'abx', 'fluids'] },
    ],
  },
  ONC: {
    title: 'Oncology',
    titleAr: 'الأورام',
    api: '/api/oncology',
    sections: ['chemo_cycle', 'bmt_monitoring', 'toxicity_grade'],
    forms: [
      { name: 'chemoCycle', fields: ['protocol', 'day', 'dose', 'toxicity'] },
    ],
  },
  ORTHO: {
    title: 'Orthopedics',
    titleAr: 'العظام',
    api: '/api/orthopedics',
    sections: ['fracture_list', 'implants', 'pre_post_op'],
    forms: [
      { name: 'fracture', fields: ['site', 'type', 'gleason', 'surgery'] },
    ],
  },
  NEURO: {
    title: 'Neurology',
    titleAr: 'طب الأعصاب',
    api: '/api/neurology',
    sections: ['stroke_alert', 'gcs_trend', 'icp_log'],
    forms: [
      { name: 'strokeAlert', fields: ['nihss', 'lastKnownWell', 'eligible'] },
    ],
  },
  PEDS: {
    title: 'Pediatrics',
    titleAr: 'طب الأطفال',
    api: '/api/pediatrics',
    sections: ['growth_chart', 'vaccination', 'apgar'],
    forms: [
      { name: 'growth', fields: ['weight', 'height', 'headCircumference', 'percentile'] },
      { name: 'vaccination', fields: ['vaccine', 'lot', 'nextDue'] },
    ],
  },
  PSYCH: {
    title: 'Psychiatry',
    titleAr: 'الطب النفسي',
    api: '/api/psychiatry',
    sections: ['mse', 'risk_assessment', 'medication_reconciliation'],
    forms: [
      { name: 'mses', fields: ['appearance', 'mood', 'speech', 'thoughts'] },
    ],
  },
  DERM: {
    title: 'Dermatology',
    titleAr: 'الجلدية',
    api: '/api/dermatology',
    sections: ['lesion_log', 'cosmetic_log', 'phototherapy'],
    forms: [
      { name: 'lesion', fields: ['site', 'type', 'size', 'photographed'] },
    ],
  },
  ENT: {
    title: 'ENT',
    titleAr: 'الأنف والأذن والحنجرة',
    api: '/api/ent',
    sections: ['audiogram', 'sinus_log', 'pharyngeal_swab'],
    forms: [
      { name: 'audiogram', fields: ['rightEar', 'leftEar', 'speech'] },
    ],
  },
  OPHTH: {
    title: 'Ophthalmology',
    titleAr: 'طب العيون',
    api: '/api/ophthalmology',
    sections: ['visual_acuity', 'iol_calc', 'glaucoma_log'],
    forms: [
      { name: 'visual', fields: ['rightOD', 'leftOS', 'refraction'] },
    ],
  },
  PULM: {
    title: 'Pulmonology',
    titleAr: 'الصدرية',
    api: '/api/pulmonology',
    sections: ['pft', 'sleep_study', 'bronchoscopy'],
    forms: [
      { name: 'pft', fields: ['fev1', 'fvc', 'ratio', 'interpretation'] },
    ],
  },
  GI: {
    title: 'Gastroenterology',
    titleAr: 'الجهاز الهضمي',
    api: '/api/gastroenterology',
    sections: ['endoscopy', 'hepatology_metrics', 'ibs_score'],
    forms: [
      { name: 'endoscopy', fields: ['site', 'findings', 'biopsies'] },
    ],
  },
  NEPH: {
    title: 'Nephrology',
    titleAr: 'طب الكلى',
    api: '/api/nephrology',
    sections: ['dialysis_session', 'transplant_followup'],
    forms: [
      { name: 'dialysis', fields: ['dryWeight', 'duration', 'ultrafiltration'] },
    ],
  },
  ENDO: {
    title: 'Endocrinology',
    titleAr: 'الغدد الصماء',
    api: '/api/endocrinology',
    sections: ['glucose_log', 'thyroid_metrics', 'bone_density'],
    forms: [
      { name: 'glucose', fields: ['fasting', 'pp', 'hba1c'] },
    ],
  },
  INF: {
    title: 'Infectious Disease',
    titleAr: 'الأمراض المعدية',
    api: '/api/infectious',
    sections: ['culture_log', 'asp_review', 'isolation'],
    forms: [
      { name: 'culture', fields: ['source', 'organism', 'sensitivity'] },
    ],
  },
  RHEUM: {
    title: 'Rheumatology',
    titleAr: 'الروماتيزم',
    api: '/api/rheumatology',
    sections: ['das28_score', 'serology_log', 'joint_count'],
    forms: [
      { name: 'das28', fields: ['tender', 'swollen', 'esr', 'crp'] },
    ],
  },
  LAB: {
    title: 'Laboratory',
    titleAr: 'المختبر',
    api: '/api/lab',
    sections: ['result_entry', 'critical_values', 'microbiology'],
    forms: [
      { name: 'result', fields: ['test', 'value', 'refRange', 'abnormal'] },
    ],
  },
  RAD: {
    title: 'Radiology',
    titleAr: 'الأشعة',
    api: '/api/radiology',
    sections: ['imaging_queue', 'report', 'critical_findings'],
    forms: [
      { name: 'report', fields: ['modality', 'findings', 'impression'] },
    ],
  },
  ANES: {
    title: 'Anesthesia',
    titleAr: 'التخدير',
    api: '/api/anesthesia',
    sections: ['preop', 'intraop', 'pacu_handoff'],
    forms: [
      { name: 'preop', fields: ['mallampati', 'asa', 'airway'] },
    ],
  },
  SURG: {
    title: 'Surgery',
    titleAr: 'الجراحة',
    api: '/api/surgery',
    sections: ['who_checklist', 'recovery_plan', 'complications'],
    forms: [
      { name: 'whoChecklist', fields: ['signIn', 'timeOut', 'signOut'] },
    ],
  },
  CRIT: {
    title: 'Critical Care',
    titleAr: 'العناية الحرجة',
    api: '/api/critical',
    sections: ['triage', 'sepsis', 'rsi'],
    forms: [
      { name: 'rsi', fields: ['drug', 'dose', 'time'] },
    ],
  },
  DIAG: {
    title: 'Diagnostics',
    titleAr: 'التشخيص',
    api: '/api/diagnostics',
    sections: ['scan_upload', 'lab_result', 'pathology'],
    forms: [
      { name: 'scan', fields: ['modality', 'bodyPart', 'findings'] },
    ],
  },
  FUNC: {
    title: 'Functional Tests',
    titleAr: 'الفحوصات الوظيفية',
    api: '/api/functional-tests',
    sections: ['ecg', 'pft', 'eeg'],
    forms: [
      { name: 'ecg', fields: ['rate', 'rhythm', 'intervals'] },
    ],
  },
  CTS: {
    title: 'Cardiothoracic Surgery',
    titleAr: 'جراحة القلب والصدر',
    api: '/api/cardiothoracic',
    sections: ['bypass_timer', 'graft_log'],
    forms: [
      { name: 'bypass', fields: ['crossClamp', 'pumpTime'] },
    ],
  },
  NEUROSURG: {
    title: 'Neurosurgery',
    titleAr: 'جراحة الأعصاب',
    api: '/api/neurosurgery',
    sections: ['icp_log', 'gcs_trend'],
    forms: [
      { name: 'icp', fields: ['value', 'time', 'intervention'] },
    ],
  },
  NICU: {
    title: 'NICU',
    titleAr: 'العناية المركزة لحديثي الولادة',
    api: '/api/nicu',
    sections: ['apgar', 'growth', 'bilirubin'],
    forms: [
      { name: 'apgar', fields: ['appearance', 'pulse', 'grimace', 'activity', 'respiration'] },
    ],
  },
  PACU: {
    title: 'Post-Anesthesia Care',
    titleAr: 'إفاقة ما بعد التخدير',
    api: '/api/pacu',
    sections: ['vitals', 'pain_scores', 'discharge'],
    forms: [
      { name: 'painScore', fields: ['score', 'scoreType', 'intervention'] },
    ],
  },
  PLASTIC: {
    title: 'Plastic Surgery',
    titleAr: 'الجراحة التجميلية',
    api: '/api/plastic-surgery',
    sections: ['graft_log', 'procedure_log'],
    forms: [
      { name: 'graft', fields: ['type', 'site', 'viability'] },
    ],
  },
  UROL: {
    title: 'Urology',
    titleAr: 'طب المسالك البولية',
    api: '/api/urology',
    sections: ['procedure_log', 'renal_stone'],
    forms: [
      { name: 'procedure', fields: ['type', 'findings', 'complications'] },
    ],
  },
};

window.STATION_SNIPPETS = STATION_SNIPPETS;

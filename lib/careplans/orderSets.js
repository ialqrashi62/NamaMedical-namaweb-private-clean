// lib/careplans/orderSets.js
// Order sets (clinical bundles) for Care Plans.
// Pure data, no I/O. Tenant-agnostic — bundles are templates that are
// applied per-tenant via engine.js. All bundles are evidence-based:
//   - stroke_alert   : AHA/ASA acute ischemic stroke (within 4.5h)
//   - sepsis_1h      : Surviving Sepsis Campaign 1-hour bundle
//   - chest_pain     : AHA/ACC ACS early evaluation
//   - dka            : ADA DKA management
//   - acs_stemi      : ACC/AHA STEMI door-to-balloon <= 90min
//
// Each item carries a clinical priority + optional time window so that
// downstream auditors (and the UI) can flag overdue items.

'use strict';

const ORDER_SETS = {
  stroke_alert: {
    id: 'stroke_alert',
    name: 'Stroke Alert Bundle',
    nameAr: 'حزمة إنذار السكتة الدماغية',
    timeCritical: '4.5h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'STAT',  timeWindow: '25min' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT',  timeWindow: '10min' },
      { code: 'LAB-COAG',         type: 'lab',         priority: 'STAT',  timeWindow: '10min' },
      { code: 'MED-tPA',          type: 'medication',  dose: '0.9mg/kg', route: 'IV',
        conditional: 'if ischemic AND within 4.5h' },
      { code: 'CONSULT-NEURO',    type: 'consult',     priority: 'urgent' },
      { code: 'OBS-NIHSS-Q15',    type: 'observation', freq:   'Q15min' }
    ]
  },

  sepsis_1h: {
    id: 'sepsis_1h',
    name: 'Sepsis 1-Hour Bundle',
    nameAr: 'حزمة sepsis ساعة واحدة',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-LACTATE',      type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: null },
      { code: 'LAB-BMP',          type: 'lab',         priority: null },
      { code: 'MICRO-BLD-CX2',    type: 'micro',       priority: 'STAT' },
      { code: 'MED-NS-30MLKG',    type: 'medication',  dose: '30mL/kg', route: 'IV' },
      { code: 'MED-EMPIRICAL-ABX',type: 'medication',  conditional: 'within 1h' }
    ]
  },

  chest_pain: {
    id: 'chest_pain',
    name: 'Acute Chest Pain Bundle',
    nameAr: 'ألم الصدر الحاد',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT',  timeWindow: '10min' },
      { code: 'LAB-TROP',         type: 'lab',         priority: 'STAT',  timeWindow: '30min' },
      { code: 'LAB-CBC',          type: 'lab',         priority: null },
      { code: 'MED-ASA',          type: 'medication',  dose: '325mg',    route: 'PO' },
      { code: 'CONSULT-CARDIO',   type: 'consult',     priority: 'urgent' }
    ]
  },

  dka: {
    id: 'dka',
    name: 'DKA Bundle',
    nameAr: 'الحماض الكيتوني السكري',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-ABG',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-ANION',        type: 'lab',         priority: null },
      { code: 'MED-NS',           type: 'medication',  route: 'IV' },
      { code: 'MED-INSULIN-DRIP', type: 'medication',  dose: '0.1U/kg/h', route: 'IV' },
      { code: 'OBS-GLUCOSE-Q1',   type: 'observation', freq:   'Q1h' }
    ]
  },

  acs_stemi: {
    id: 'acs_stemi',
    name: 'STEMI Protocol',
    nameAr: 'بروتوكول STEMI',
    timeCritical: '90min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT',  timeWindow: '10min' },
      { code: 'MED-ASA',          type: 'medication',  dose: '325mg',     route: 'PO' },
      { code: 'MED-CLOPIDOGREL',  type: 'medication',  dose: '600mg',     route: 'PO' },
      { code: 'MED-HEPARIN',      type: 'medication',  route: 'IV' },
      { code: 'CATH-LAB',         type: 'procedure',   priority: 'STAT',  timeWindow: '90min' }
    ]
  },

  // ===== RESPIRATORY / PULMONARY (5) =====
  asthma_exacerbation: {
    id: 'asthma_exacerbation',
    name: 'Asthma Exacerbation Bundle',
    nameAr: 'حزمة نوبة الربو',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'respiratory_therapist'],
    items: [
      { code: 'OBS-PEAK-FLOW',    type: 'observation', priority: 'STAT' },
      { code: 'OBS-SPO2',         type: 'observation', freq: 'continuous' },
      { code: 'MED-SABA-NEB',     type: 'medication',  dose: '2.5-5mg',   route: 'Nebulized' },
      { code: 'MED-SYSTEMIC-STEROID', type: 'medication', dose: 'Prednisone 50mg', route: 'PO' },
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'urgent' },
      { code: 'LAB-ABG',          type: 'lab',         priority: 'urgent' }
    ]
  },
  copd_exacerbation: {
    id: 'copd_exacerbation',
    name: 'COPD Exacerbation Bundle',
    nameAr: 'حزمة تفاقم COPD',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse', 'respiratory_therapist'],
    items: [
      { code: 'OBS-ABG',          type: 'observation', priority: 'STAT' },
      { code: 'MED-SABA-NEB',     type: 'medication',  route: 'Nebulized' },
      { code: 'MED-ANTICHOLINERGIC-NEB', type: 'medication', route: 'Nebulized' },
      { code: 'MED-SYSTEMIC-STEROID', type: 'medication', dose: 'Methylpred 60mg', route: 'IV' },
      { code: 'MED-ANTIBIOTIC',   type: 'medication',  conditional: 'if infectious trigger' },
      { code: 'IMG-CXR',          type: 'imaging' },
      { code: 'OBS-O2-SAT',       type: 'observation', freq: 'continuous' }
    ]
  },
  pulmonary_embolism: {
    id: 'pulmonary_embolism',
    name: 'Pulmonary Embolism Bundle',
    nameAr: 'حزمة الانصمام الرئوي',
    timeCritical: '2h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-D-DIMER',      type: 'lab',         priority: 'STAT' },
      { code: 'LAB-TROP',         type: 'lab',         priority: 'STAT' },
      { code: 'LAB-ABG',          type: 'lab',         priority: 'STAT' },
      { code: 'IMG-CT-PA',        type: 'imaging',     priority: 'STAT' },
      { code: 'IMG-VQ-SCAN',      type: 'imaging',     conditional: 'if CT contraindicated' },
      { code: 'MED-HEPARIN',      type: 'medication',  route: 'IV',      priority: 'STAT' },
      { code: 'OBS-SPO2',         type: 'observation', freq: 'continuous' }
    ]
  },
  pneumonia_cap: {
    id: 'pneumonia_cap',
    name: 'Community-Acquired Pneumonia Bundle',
    nameAr: 'حزمة الالتهاب الرئوي المكتسب',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-SPUTUM-CX',    type: 'lab' },
      { code: 'MED-EMPIRICAL-ABX', type: 'medication', conditional: 'within 4h' },
      { code: 'OBS-SPO2',         type: 'observation', freq: 'Q4h' },
      { code: 'MED-O2',           type: 'medication',  conditional: 'if SpO2 < 92%' }
    ]
  },
  massive_hemoptysis: {
    id: 'massive_hemoptysis',
    name: 'Massive Hemoptysis Bundle',
    nameAr: 'حزمة النفث الدموي الغزير',
    timeCritical: '30min',
    ownerRoles: ['doctor', 'nurse', 'interventional_radiology'],
    items: [
      { code: 'OBS-VITALS-Q5',    type: 'observation', priority: 'STAT' },
      { code: 'IMG-CT-CHEST',     type: 'imaging',     priority: 'STAT' },
      { code: 'PROC-BRONCH',      type: 'procedure',   priority: 'STAT' },
      { code: 'PROC-BAE',         type: 'procedure',   conditional: 'if embolization needed' },
      { code: 'MED-TRANEXAMIC',   type: 'medication',  dose: '1g IV',    route: 'IV' },
      { code: 'MED-BLOOD-CROSS',  type: 'lab',         priority: 'STAT' }
    ]
  },

  // ===== CARDIOLOGY (5) =====
  atrial_fib_new: {
    id: 'atrial_fib_new',
    name: 'New-Onset Atrial Fibrillation Bundle',
    nameAr: 'حزمة الرجفان الأذيني الجديد',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-TSH',          type: 'lab' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'IMG-ECHO',         type: 'imaging',     priority: 'urgent' },
      { code: 'MED-RATE-CONTROL', type: 'medication',  dose: 'Metoprolol 5mg IV', route: 'IV' },
      { code: 'MED-ANTICOAG',     type: 'medication',  conditional: 'CHA2DS2-VASc >= 2' }
    ]
  },
  heart_failure_admit: {
    id: 'heart_failure_admit',
    name: 'Acute Heart Failure Admission Bundle',
    nameAr: 'حزمة دخول قصور القلب الحاد',
    timeCritical: '3h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-BNP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'IMG-ECHO',         type: 'imaging',     priority: 'urgent' },
      { code: 'MED-LOOP-DIURETIC',type: 'medication',  dose: 'Furosemide 40mg IV', route: 'IV' },
      { code: 'OBS-I-O',          type: 'observation', freq: 'Q8h' },
      { code: 'OBS-WEIGHT-DAILY', type: 'observation' }
    ]
  },
  hypertensive_emergency: {
    id: 'hypertensive_emergency',
    name: 'Hypertensive Emergency Bundle',
    nameAr: 'حزمة طوارئ ضغط الدم',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'OBS-BP-Q15',       type: 'observation', priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-TROP',         type: 'lab',         priority: 'STAT' },
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT' },
      { code: 'MED-IV-ANTIHYPERTENSIVE', type: 'medication', route: 'IV' },
      { code: 'MED-LABETALOL',    type: 'medication',  dose: '20mg IV',  route: 'IV' }
    ]
  },
  bradycardia: {
    id: 'bradycardia',
    name: 'Symptomatic Bradycardia Bundle',
    nameAr: 'حزمة بطء القلب العرضي',
    timeCritical: '15min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'OBS-TELEMETRY',    type: 'observation', priority: 'STAT' },
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT' },
      { code: 'MED-ATROPINE',     type: 'medication',  dose: '0.5mg IV', route: 'IV' },
      { code: 'MED-DOPAMINE',     type: 'medication',  dose: '5-20mcg/kg/min', route: 'IV', conditional: 'if atropine ineffective' },
      { code: 'PROC-PACING-TRANS', type: 'procedure', conditional: 'if refractory' }
    ]
  },
  pericarditis: {
    id: 'pericarditis',
    name: 'Acute Pericarditis Bundle',
    nameAr: 'حزمة التهاب التامور الحاد',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-ECG-12',       type: 'imaging',     priority: 'STAT' },
      { code: 'IMG-ECHO',         type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-CRP',          type: 'lab' },
      { code: 'LAB-TROP',         type: 'lab' },
      { code: 'MED-NSAID',        type: 'medication',  dose: 'Ibuprofen 600mg', route: 'PO' },
      { code: 'MED-COLCHICINE',   type: 'medication',  dose: '0.6mg BID', route: 'PO' }
    ]
  },

  // ===== GI / HEPATOBILIARY (5) =====
  upper_gi_bleed: {
    id: 'upper_gi_bleed',
    name: 'Upper GI Bleed Bundle',
    nameAr: 'حزمة نزيف الجهاز الهضمي العلوي',
    timeCritical: '2h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-COAG',         type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-TYPE-CROSS',   type: 'lab',         priority: 'STAT' },
      { code: 'MED-IV-ACCESS',    type: 'procedure',   priority: 'STAT' },
      { code: 'MED-PPI-IV',       type: 'medication',  dose: 'Pantoprazole 80mg', route: 'IV' },
      { code: 'PROC-EGD',         type: 'procedure',   priority: 'STAT' },
      { code: 'MED-TRANSFUSE-PRBC', type: 'medication', conditional: 'if Hb < 7' }
    ]
  },
  acute_pancreatitis: {
    id: 'acute_pancreatitis',
    name: 'Acute Pancreatitis Bundle',
    nameAr: 'حزمة التهاب البنكرياس الحاد',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-LIPASE',       type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'IMG-CT-ABD',       type: 'imaging',     priority: 'urgent' },
      { code: 'MED-NS-IV',        type: 'medication',  dose: 'Aggressive hydration', route: 'IV' },
      { code: 'MED-ANALGESIA',    type: 'medication',  route: 'IV' },
      { code: 'OBS-NPO',          type: 'observation' }
    ]
  },
  biliary_colic: {
    id: 'biliary_colic',
    name: 'Acute Biliary Colic Bundle',
    nameAr: 'حزمة المغص الصفراوي',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-LFT',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LIPASE',       type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'IMG-US-ABD',       type: 'imaging',     priority: 'urgent' },
      { code: 'MED-NSAID',        type: 'medication',  dose: 'Ketorolac 30mg', route: 'IV' },
      { code: 'MED-ANTIEMETIC',   type: 'medication' },
      { code: 'PROC-ERCP',        type: 'procedure',   conditional: 'if cholangitis' }
    ]
  },
  hepatic_encephalopathy: {
    id: 'hepatic_encephalopathy',
    name: 'Hepatic Encephalopathy Bundle',
    nameAr: 'حزمة اعتلال الدماغ الكبدي',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-Ammonia',      type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'MED-LACTULOSE',    type: 'medication',  route: 'PO/PR' },
      { code: 'MED-RIFAXIMIN',    type: 'medication',  dose: '550mg BID', route: 'PO' },
      { code: 'OBS-MENTAL-STATUS', type: 'observation', freq: 'Q2h' },
      { code: 'OBS-ASTERIXIS',    type: 'observation' }
    ]
  },
  small_bowel_obstruction: {
    id: 'small_bowel_obstruction',
    name: 'Small Bowel Obstruction Bundle',
    nameAr: 'حزمة انسداد الأمعاء الدقيقة',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse', 'surgeon'],
    items: [
      { code: 'IMG-CT-ABD',       type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'LAB-LACTATE',      type: 'lab',         priority: 'urgent' },
      { code: 'MED-NG-TUBE',      type: 'procedure',   priority: 'STAT' },
      { code: 'MED-IV-FLUIDS',    type: 'medication',  route: 'IV' },
      { code: 'OBS-NPO',          type: 'observation' },
      { code: 'CONSULT-SURGERY',  type: 'consult',     priority: 'urgent' }
    ]
  },

  // ===== RENAL / UROLOGY (4) =====
  aki_adult: {
    id: 'aki_adult',
    name: 'Acute Kidney Injury (Adult) Bundle',
    nameAr: 'حزمة إصابة الكلى الحادة للبالغين',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse', 'nephrologist'],
    items: [
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-URINALYSIS',   type: 'lab',         priority: 'STAT' },
      { code: 'LAB-FENa',         type: 'lab',         conditional: 'if pre-renal suspected' },
      { code: 'IMG-US-RENAL',     type: 'imaging',     priority: 'urgent' },
      { code: 'OBS-I-O',          type: 'observation', freq: 'Q6h' },
      { code: 'MED-NEPHROTOX-HOLD', type: 'medication', conditional: 'review all meds' }
    ]
  },
  hyperkalemia_severe: {
    id: 'hyperkalemia_severe',
    name: 'Severe Hyperkalemia Bundle',
    nameAr: 'حزمة فرط بوتاسيوم الدم الشديد',
    timeCritical: '30min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-ECG',          type: 'imaging',     priority: 'STAT' },
      { code: 'MED-CALCIUM-GLUCONATE', type: 'medication', dose: '1g IV', route: 'IV' },
      { code: 'MED-INSULIN-D10',  type: 'medication',  route: 'IV' },
      { code: 'MED-ALBUTEROL-NEB', type: 'medication', route: 'Nebulized' },
      { code: 'MED-KAYEXALATE',   type: 'medication',  route: 'PO' },
      { code: 'PROC-DIALYSIS',    type: 'procedure',   conditional: 'if refractory' }
    ]
  },
  renal_colic: {
    id: 'renal_colic',
    name: 'Renal Colic Bundle',
    nameAr: 'حزمة المغص الكلوي',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-CT-KUB',       type: 'imaging',     priority: 'urgent' },
      { code: 'IMG-US-RENAL',     type: 'imaging',     conditional: 'if pregnant or pediatric' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'LAB-URINALYSIS',   type: 'lab' },
      { code: 'MED-KETOROLAC',    type: 'medication',  dose: '30mg IV',   route: 'IV' },
      { code: 'MED-MORPHINE',     type: 'medication',  conditional: 'if NSAID contraindicated' }
    ]
  },
  uti_complicated: {
    id: 'uti_complicated',
    name: 'Complicated UTI / Pyelonephritis Bundle',
    nameAr: 'حزمة التهاب المسالك البولية المعقد',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-URINE-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BLOOD-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'MED-EMPIRICAL-ABX', type: 'medication', route: 'IV' },
      { code: 'IMG-CT-ABD',       type: 'imaging',     conditional: 'if obstruction suspected' },
      { code: 'OBS-TEMP-Q4',      type: 'observation' }
    ]
  },

  // ===== ENDOCRINE / METABOLIC (3) =====
  thyroid_storm: {
    id: 'thyroid_storm',
    name: 'Thyroid Storm Bundle',
    nameAr: 'حزمة عاصفة الغدة الدرقية',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'endocrinologist'],
    items: [
      { code: 'LAB-TSH',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-FREE-T4',      type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'MED-PROP-YTHIOURACIL', type: 'medication', dose: '500mg', route: 'PO' },
      { code: 'MED-PROPRANOLOL',  type: 'medication',  dose: '60mg',     route: 'PO' },
      { code: 'MED-HYDROCORTISONE', type: 'medication', dose: '100mg IV', route: 'IV' },
      { code: 'MED-COOLING',      type: 'procedure',   conditional: 'if hyperthermia' }
    ]
  },
  adrenal_crisis: {
    id: 'adrenal_crisis',
    name: 'Adrenal Crisis Bundle',
    nameAr: 'حزمة أزمة الغدة الكظرية',
    timeCritical: '30min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-CORTISOL',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'MED-HYDROCORTISONE', type: 'medication', dose: '100mg IV', route: 'IV' },
      { code: 'MED-NS-IV',        type: 'medication',  dose: '1L bolus', route: 'IV' },
      { code: 'OBS-BP-Q15',       type: 'observation', priority: 'STAT' },
      { code: 'OBS-GLUCOSE-Q1',   type: 'observation' }
    ]
  },
  hypoglycemia_severe: {
    id: 'hypoglycemia_severe',
    name: 'Severe Hypoglycemia Bundle',
    nameAr: 'حزمة نقص السكر الشديد',
    timeCritical: '15min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-GLUCOSE',      type: 'lab',         priority: 'STAT' },
      { code: 'MED-D50-IV',       type: 'medication',  dose: '50mL D50', route: 'IV' },
      { code: 'MED-GLUCAGON',     type: 'medication',  dose: '1mg IM',   route: 'IM', conditional: 'if no IV access' },
      { code: 'OBS-GLUCOSE-Q15',  type: 'observation', priority: 'STAT' },
      { code: 'OBS-MENTAL-STATUS', type: 'observation', freq: 'Q15min' }
    ]
  },

  // ===== NEURO / STROKE-LIKE (4) =====
  status_epilepticus: {
    id: 'status_epilepticus',
    name: 'Status Epilepticus Bundle',
    nameAr: 'حزمة الصرع المستمر',
    timeCritical: '5min',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'OBS-AIRWAY',       type: 'observation', priority: 'STAT' },
      { code: 'LAB-GLUCOSE',      type: 'lab',         priority: 'STAT' },
      { code: 'LAB-ABG',          type: 'lab',         priority: 'STAT' },
      { code: 'MED-LORAZEPAM',    type: 'medication',  dose: '4mg IV',    route: 'IV' },
      { code: 'MED-LEVETIRACETAM', type: 'medication', dose: '60mg/kg IV', route: 'IV' },
      { code: 'MED-PHENYTOIN',    type: 'medication',  conditional: 'if refractory' },
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'urgent' }
    ]
  },
  tia_workup: {
    id: 'tia_workup',
    name: 'TIA Workup Bundle',
    nameAr: 'حزمة فحص TIA',
    timeCritical: '24h',
    ownerRoles: ['doctor', 'nurse', 'neurologist'],
    items: [
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'STAT' },
      { code: 'IMG-MRA-NECK',     type: 'imaging',     priority: 'urgent' },
      { code: 'IMG-ECHO',         type: 'imaging' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-COAG',         type: 'lab' },
      { code: 'LAB-LIPID',        type: 'lab' },
      { code: 'MED-ASA',          type: 'medication',  dose: '325mg',    route: 'PO' },
      { code: 'CONSULT-NEURO',    type: 'consult',     priority: 'urgent' }
    ]
  },
  intracranial_hemorrhage: {
    id: 'intracranial_hemorrhage',
    name: 'Intracranial Hemorrhage Bundle',
    nameAr: 'حزمة النزيف داخل القحف',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'neurosurgeon'],
    items: [
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'STAT' },
      { code: 'OBS-NEURO-Q1',     type: 'observation', priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-COAG',         type: 'lab',         priority: 'STAT' },
      { code: 'MED-REVERSE-ANTICOAG', type: 'medication', conditional: 'if on anticoagulation' },
      { code: 'OBS-BP-Q15',       type: 'observation' },
      { code: 'CONSULT-NEUROSURG', type: 'consult',    priority: 'STAT' }
    ]
  },
  meningitis_adult: {
    id: 'meningitis_adult',
    name: 'Adult Meningitis Bundle',
    nameAr: 'حزمة التهاب السحايا للبالغين',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-BLOOD-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LACTATE',      type: 'lab',         priority: 'STAT' },
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'STAT' },
      { code: 'PROC-LP',          type: 'procedure',   priority: 'STAT' },
      { code: 'MED-EMPIRICAL-ABX', type: 'medication', dose: 'Ceftriaxone 2g IV', route: 'IV' },
      { code: 'MED-DEXAMETHASONE', type: 'medication', dose: '10mg IV',  route: 'IV' }
    ]
  },

  // ===== OBGYN (3) =====
  preeclampsia_severe: {
    id: 'preeclampsia_severe',
    name: 'Severe Preeclampsia Bundle',
    nameAr: 'حزمة تسمم الحمل الشديد',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'obstetrician'],
    items: [
      { code: 'OBS-BP-Q15',       type: 'observation', priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LFT',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-URIC-ACID',    type: 'lab' },
      { code: 'LAB-URINE-PROTEIN', type: 'lab' },
      { code: 'MED-MAG-SULFATE',  type: 'medication',  dose: '4g IV load', route: 'IV' },
      { code: 'MED-LABETALOL',    type: 'medication',  route: 'IV' },
      { code: 'OBS-FHR',          type: 'observation', freq: 'continuous', conditional: 'if viable fetus' }
    ]
  },
  postpartum_hemorrhage: {
    id: 'postpartum_hemorrhage',
    name: 'Postpartum Hemorrhage Bundle',
    nameAr: 'حزمة نزيف ما بعد الولادة',
    timeCritical: '15min',
    ownerRoles: ['doctor', 'nurse', 'obstetrician'],
    items: [
      { code: 'OBS-VITALS-Q5',    type: 'observation', priority: 'STAT' },
      { code: 'MED-UTEROTONIC',   type: 'medication',  dose: 'Oxytocin 40U IV', route: 'IV' },
      { code: 'MED-METHERGINE',   type: 'medication',  dose: '0.2mg IM', route: 'IM' },
      { code: 'MED-HEMABATE',     type: 'medication',  dose: '250mcg IM', route: 'IM' },
      { code: 'LAB-TYPE-CROSS',   type: 'lab',         priority: 'STAT' },
      { code: 'MED-TRANEXAMIC',   type: 'medication',  dose: '1g IV',    route: 'IV' },
      { code: 'PROC-BAKRI-BALLOON', type: 'procedure', conditional: 'if atonic' },
      { code: 'PROC-EMBOLIZATION', type: 'procedure',  conditional: 'if refractory' }
    ]
  },
  ectopic_pregnancy: {
    id: 'ectopic_pregnancy',
    name: 'Ectopic Pregnancy Bundle',
    nameAr: 'حزمة الحمل خارج الرحم',
    timeCritical: '2h',
    ownerRoles: ['doctor', 'nurse', 'obstetrician'],
    items: [
      { code: 'LAB-BETA-HCG',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-TYPE-CROSS',   type: 'lab',         priority: 'STAT' },
      { code: 'IMG-TV-US',        type: 'imaging',     priority: 'STAT' },
      { code: 'IMG-CT-ABD',       type: 'imaging',     conditional: 'if rupture suspected' },
      { code: 'OBS-VITALS-Q15',   type: 'observation' },
      { code: 'MED-METHOTREXATE', type: 'medication',  conditional: 'if stable + unruptured' }
    ]
  },

  // ===== PEDIATRICS (2) =====
  pediatric_fever_no_source: {
    id: 'pediatric_fever_no_source',
    name: 'Pediatric Fever Without Source Bundle',
    nameAr: 'حزمة حمى الأطفال بدون مصدر',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse', 'pediatrician'],
    items: [
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'LAB-BLOOD-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-URINE-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'OBS-TEMP',         type: 'observation' },
      { code: 'MED-PARACETAMOL',  type: 'medication',  dose: '15mg/kg',  route: 'PO' },
      { code: 'MED-EMPIRICAL-ABX', type: 'medication', conditional: 'if age < 28d or septic' }
    ]
  },
  pediatric_status_epilepticus: {
    id: 'pediatric_status_epilepticus',
    name: 'Pediatric Status Epilepticus Bundle',
    nameAr: 'حزمة الصرع المستمر للأطفال',
    timeCritical: '5min',
    ownerRoles: ['doctor', 'nurse', 'pediatrician'],
    items: [
      { code: 'OBS-AIRWAY',       type: 'observation', priority: 'STAT' },
      { code: 'LAB-GLUCOSE',      type: 'lab',         priority: 'STAT' },
      { code: 'MED-MIDAZOLAM',    type: 'medication',  dose: '0.2mg/kg', route: 'IN/IM' },
      { code: 'MED-LEVETIRACETAM', type: 'medication', dose: '60mg/kg IV', route: 'IV' },
      { code: 'IMG-CT-HEAD',      type: 'imaging',     priority: 'urgent' },
      { code: 'OBS-NEURO-Q15',    type: 'observation' }
    ]
  },

  // ===== PSYCHIATRY (2) =====
  acute_agitation: {
    id: 'acute_agitation',
    name: 'Acute Agitation Bundle',
    nameAr: 'حزمة الهياج الحاد',
    timeCritical: '15min',
    ownerRoles: ['doctor', 'nurse', 'psychiatrist'],
    items: [
      { code: 'OBS-VITALS-Q15',   type: 'observation', priority: 'STAT' },
      { code: 'OBS-MENTAL-STATUS', type: 'observation', freq: 'Q15min' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'MED-VERBAL-DEESCALATION', type: 'procedure' },
      { code: 'MED-LORAZEPAM',    type: 'medication',  dose: '2mg IM/PO', route: 'IM' },
      { code: 'MED-OLANZAPINE',   type: 'medication',  dose: '5mg IM',    route: 'IM' },
      { code: 'CONSULT-PSYCH',    type: 'consult',     priority: 'urgent' }
    ]
  },
  alcohol_withdrawal: {
    id: 'alcohol_withdrawal',
    name: 'Alcohol Withdrawal Bundle (CIWA-Ar)',
    nameAr: 'حزمة انسحاب الكحول',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'OBS-CIWA-Q1',      type: 'observation', priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-MAGNESIUM',    type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'MED-BENZODIAZEPINE', type: 'medication', dose: 'Lorazepam 2-4mg', route: 'IV/PO' },
      { code: 'MED-THIAMINE',     type: 'medication',  dose: '100mg IV',  route: 'IV' },
      { code: 'MED-FOLIC-ACID',   type: 'medication',  dose: '1mg',      route: 'PO' },
      { code: 'MED-MAG-SULFATE',  type: 'medication',  conditional: 'if low' }
    ]
  },

  // ===== TRAUMA / SURGERY (3) =====
  trauma_primary_survey: {
    id: 'trauma_primary_survey',
    name: 'Trauma Primary Survey (ABCDE) Bundle',
    nameAr: 'حزمة المسح الأولى للرضح',
    timeCritical: '5min',
    ownerRoles: ['doctor', 'nurse', 'trauma_team'],
    items: [
      { code: 'AIRWAY-A',         type: 'procedure',   priority: 'STAT' },
      { code: 'BREATHING-B',      type: 'procedure',   priority: 'STAT' },
      { code: 'CIRCULATION-C',    type: 'procedure',   priority: 'STAT' },
      { code: 'DISABILITY-D',     type: 'observation', priority: 'STAT' },
      { code: 'EXPOSURE-E',       type: 'observation', priority: 'STAT' },
      { code: 'IMG-FAST',         type: 'imaging',     priority: 'STAT' },
      { code: 'IMG-CT-PANSCAN',   type: 'imaging',     priority: 'STAT' },
      { code: 'OBS-VITALS-Q5',    type: 'observation' }
    ]
  },
  burns_major: {
    id: 'burns_major',
    name: 'Major Burns (>20% TBSA) Bundle',
    nameAr: 'حزمة الحروق الكبيرة',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'burns_unit'],
    items: [
      { code: 'LAB-TYPE-CROSS',   type: 'lab',         priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-COAG',         type: 'lab' },
      { code: 'MED-LACTATED-RINGER', type: 'medication', dose: 'Parkland formula', route: 'IV' },
      { code: 'MED-MORPHINE-IV',  type: 'medication',  conditional: 'pain control' },
      { code: 'OBS-URINE-OUTPUT', type: 'observation', freq: 'Q1h', conditional: 'goal 0.5mL/kg/h' },
      { code: 'PROC-TBSA-ASSESS', type: 'procedure' }
    ]
  },
  surgical_preop: {
    id: 'surgical_preop',
    name: 'Surgical Pre-Op Checklist Bundle',
    nameAr: 'حزمة فحص ما قبل العملية',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse', 'anesthesiologist', 'surgeon'],
    items: [
      { code: 'CHK-NPO-STATUS',   type: 'observation' },
      { code: 'CHK-CONSENT',      type: 'observation' },
      { code: 'CHK-ALLERGY',      type: 'observation' },
      { code: 'CHK-SITE-MARKING', type: 'observation' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-COAG',         type: 'lab' },
      { code: 'LAB-TYPE-CROSS',   type: 'lab' },
      { code: 'MED-ABX-PROPHYLAXIS', type: 'medication', conditional: 'per SCIP' }
    ]
  },

  // ===== HEMATOLOGY / ONCOLOGY (3) =====
  neutropenic_fever: {
    id: 'neutropenic_fever',
    name: 'Neutropenic Fever Bundle',
    nameAr: 'حزمة الحمى ناقصة العدلات',
    timeCritical: '1h',
    ownerRoles: ['doctor', 'nurse', 'oncologist'],
    items: [
      { code: 'LAB-CBC-DIFF',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BLOOD-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'LAB-URINE-CX',     type: 'lab',         priority: 'STAT' },
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'STAT' },
      { code: 'MED-EMPIRICAL-ABX', type: 'medication', dose: 'Piperacillin-tazobactam', route: 'IV' },
      { code: 'MED-GCSF',         type: 'medication',  conditional: 'if high risk' },
      { code: 'OBS-TEMP-Q4',      type: 'observation' }
    ]
  },
  tumor_lysis_syndrome: {
    id: 'tumor_lysis_syndrome',
    name: 'Tumor Lysis Syndrome Bundle',
    nameAr: 'حزمة متلازمة انحلال الورم',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse', 'oncologist'],
    items: [
      { code: 'LAB-BMP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-PHOSPHATE',    type: 'lab',         priority: 'STAT' },
      { code: 'LAB-URIC-ACID',    type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LDH',          type: 'lab' },
      { code: 'MED-IV-HYDRATION', type: 'medication',  dose: '2-3L/m²/d', route: 'IV' },
      { code: 'MED-ALLOPURINOL',  type: 'medication',  dose: '300mg',     route: 'PO' },
      { code: 'MED-RASBURICASE',  type: 'medication',  conditional: 'if high risk' },
      { code: 'OBS-URINE-OUTPUT', type: 'observation' }
    ]
  },
  sickle_cell_crisis: {
    id: 'sickle_cell_crisis',
    name: 'Sickle Cell Crisis Bundle',
    nameAr: 'حزمة أزمة الخلايا المنجلية',
    timeCritical: '2h',
    ownerRoles: ['doctor', 'nurse', 'hematologist'],
    items: [
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-RETIC',        type: 'lab',         priority: 'STAT' },
      { code: 'LAB-BMP',          type: 'lab' },
      { code: 'MED-IV-HYDRATION', type: 'medication',  route: 'IV' },
      { code: 'MED-MORPHINE-IV', type: 'medication',  route: 'IV' },
      { code: 'MED-O2',           type: 'medication',  conditional: 'if hypoxic' },
      { code: 'MED-EXCHANGE-TRANSFUSION', type: 'procedure', conditional: 'if severe' }
    ]
  },

  // ===== INFECTIOUS DISEASE (3) =====
  covid_severe: {
    id: 'covid_severe',
    name: 'Severe COVID-19 Bundle',
    nameAr: 'حزمة COVID-19 الشديد',
    timeCritical: '4h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'STAT' },
      { code: 'LAB-CBC',          type: 'lab' },
      { code: 'LAB-CRP',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-D-DIMER',      type: 'lab',         priority: 'STAT' },
      { code: 'OBS-SPO2',         type: 'observation', freq: 'continuous' },
      { code: 'MED-DEXAMETHASONE', type: 'medication', dose: '6mg IV/PO daily', route: 'IV' },
      { code: 'MED-REM-DESIVIR',  type: 'medication',  conditional: 'if O2 req' },
      { code: 'PROC-HFNC',        type: 'procedure',   conditional: 'if hypoxic' }
    ]
  },
  tb_initiation: {
    id: 'tb_initiation',
    name: 'Tuberculosis Treatment Initiation Bundle',
    nameAr: 'حزمة بدء علاج السل',
    timeCritical: null,
    ownerRoles: ['doctor', 'nurse', 'infectious_disease'],
    items: [
      { code: 'LAB-SPUTUM-AFB',   type: 'lab',         priority: 'STAT' },
      { code: 'LAB-HIV-TEST',     type: 'lab' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'IMG-CXR',          type: 'imaging',     priority: 'STAT' },
      { code: 'MED-RIFAMPIN',     type: 'medication',  dose: '10mg/kg',   route: 'PO' },
      { code: 'MED-ISONIAZID',    type: 'medication',  dose: '5mg/kg',    route: 'PO' },
      { code: 'MED-PYRAZINAMIDE', type: 'medication',  dose: '25mg/kg',   route: 'PO' },
      { code: 'MED-ETHAMBUTOL',   type: 'medication',  dose: '15mg/kg',   route: 'PO' }
    ]
  },
  dengue_warning: {
    id: 'dengue_warning',
    name: 'Dengue Warning Signs Bundle',
    nameAr: 'حزمة علامات تحذير حمى الضنك',
    timeCritical: '2h',
    ownerRoles: ['doctor', 'nurse'],
    items: [
      { code: 'LAB-CBC',          type: 'lab',         priority: 'STAT' },
      { code: 'LAB-HEMATOCRIT',   type: 'lab',         priority: 'STAT' },
      { code: 'LAB-LFT',          type: 'lab' },
      { code: 'LAB-COAG',         type: 'lab' },
      { code: 'MED-IV-HYDRATION', type: 'medication',  route: 'IV' },
      { code: 'MED-PARACETAMOL',  type: 'medication',  dose: '500mg-1g',  route: 'PO' },
      { code: 'OBS-VITALS-Q4',    type: 'observation', freq: 'Q4h' }
    ]
  }
};

function listIds() {
  return Object.keys(ORDER_SETS);
}

function get(setId) {
  if (!setId) return null;
  return ORDER_SETS[setId] || null;
}

function itemCodes(setId) {
  const s = get(setId);
  if (!s) return [];
  return (s.items || []).map(function (i) { return i.code; });
}

module.exports = {
  ORDER_SETS: ORDER_SETS,
  listIds: listIds,
  get: get,
  itemCodes: itemCodes
};

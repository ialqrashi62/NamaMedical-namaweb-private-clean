'use strict';
// Station Clinical Enhancer — turns a generic snippet into a rich clinical workflow.
// Maps each of 31 dept codes to a specific panel/form/list combo.

const STATION_CLINICAL = {
  CAR: {
    panels: ['Echo Queue', 'ECG Strip', 'Cath Lab Log', 'Stress Test'],
    forms: ['Echo Reading', 'Cardiac Med Report', 'Post-Cath Note'],
    shortcuts: ['New ECG', 'Order Troponin', 'Cardio Consult'],
    scores: ['CHA2DS2-VASc', 'HAS-BLED', 'TIMI', 'GRACE'],
  },
  ER: {
    panels: ['Triage Board', 'Active Treatment', 'Waiting Room', 'Discharge Lounge'],
    forms: ['Triage Note', 'Trauma Resuscitation', 'Discharge Summary'],
    shortcuts: ['Add to Triage', 'STAT ECG', 'Trauma Alert'],
    scores: ['ESI Level', 'NEWS2', 'GCS', 'qSOFA'],
  },
  OBG: {
    panels: ['Antepartum', 'Labor & Delivery', 'Postpartum', 'Gyn Clinic'],
    forms: ['MFM Scan', 'IVF Cycle', 'Partogram', 'Postpartum Note'],
    shortcuts: ['New Pregnancy', 'Routine Scan', 'Induction'],
    scores: ['Bishop Score', 'APGAR', 'GBS Status'],
  },
  ICU: {
    panels: ['Bedside Monitors', 'Ventilator Tracker', 'Drips Sheet', 'Daily Goals'],
    forms: ['Sepsis Bundle', 'Vent Settings', 'Daily Goals', 'Family Update'],
    shortcuts: ['Add Vasopressor', 'Code Blue', 'Rounds Template'],
    scores: ['SOFA', 'APACHE II', 'GCS', 'SAPS II'],
  },
  NICU: {
    panels: ['Incubators', 'Ventilators', 'Feeding Schedule', 'KMC Tracker'],
    forms: ['Newborn Admission', 'Bilirubin Chart', 'Growth Chart'],
    shortcuts: ['Phototherapy', 'Surfactant', 'Family Counseling'],
    scores: ['APGAR', 'Silverman-Anderson', 'CRIB II'],
  },
  PEDS: {
    panels: ['Well-Baby', 'Vaccination', 'Sick Visit', 'Growth Chart'],
    forms: ['Well-Child Visit', 'Vaccination Record', 'Sick Note'],
    shortcuts: ['Vaccine Schedule', 'Growth Percentile', 'Fever Workup'],
    scores: ['PEWS', 'Pediatric GCS', 'Asthma Severity'],
  },
  ONC: {
    panels: ['Chemo Bay', 'BMT Unit', 'Follow-Up Clinic', 'Survivorship'],
    forms: ['Chemo Cycle', 'BMT Transplant', 'Toxicity Grade', 'Tumor Board'],
    shortcuts: ['New Protocol', 'Restaging', 'Biopsy Order'],
    scores: ['ECOG', 'Karnofsky', 'CTCAE v5'],
  },
  ORTHO: {
    panels: ['OR Schedule', 'Pre-Op', 'Post-Op', 'Implant Tracker'],
    forms: ['Fracture Note', 'Implant Log', 'Pre-Op H&P', 'Post-Op Note'],
    shortcuts: ['OR Booking', 'Implant Order', 'Cast Application'],
    scores: ['DASH', 'KOOS', 'Harris Hip'],
  },
  NEURO: {
    panels: ['Stroke Alert', 'EEG Queue', 'EMG Lab', 'Headache Clinic'],
    forms: ['Stroke Note', 'EEG Report', 'EMG Report', 'Migraine Plan'],
    shortcuts: ['NIHSS', 'tPA Check', 'CT Head'],
    scores: ['NIHSS', 'mRS', 'ABCDE', 'GCS'],
  },
  PSYCH: {
    panels: ['Inpatient Ward', 'ECT Suite', 'Crisis Line', 'Outpatient'],
    forms: ['MSE', 'Risk Assessment', 'Medication Note', 'Discharge Plan'],
    shortcuts: ['Suicide Risk', 'Restraint Order', 'Family Meeting'],
    scores: ['PHQ-9', 'GAD-7', 'CGI-S', 'Columbia'],
  },
  DERM: {
    panels: ['General Clinic', 'Procedure Suite', 'Phototherapy', 'Cosmetic'],
    forms: ['Lesion Note', 'Cosmetic Consult', 'Pathology Follow-Up'],
    shortcuts: ['Biopsy', 'Cryotherapy', 'Phototherapy Session'],
    scores: ['PASI', 'SCORAD', 'DLQI'],
  },
  ENT: {
    panels: ['Audiology', 'Sinus Clinic', 'Voice Lab', 'Allergy Testing'],
    forms: ['Audiogram', 'Sinus CT', 'Tonsillectomy Note'],
    shortcuts: ['Hearing Test', 'Nasal Endoscopy', 'Allergy Skin Test'],
    scores: ['Pure Tone Average', 'SNOT-22', 'VHI'],
  },
  OPHTH: {
    panels: ['Refraction', 'Retina Clinic', 'Glaucoma', 'Pediatric'],
    forms: ['Visual Acuity', 'IOL Calculation', 'Fundus Exam'],
    shortcuts: ['Tonometry', 'Dilate', 'OCT'],
    scores: ['LogMAR', 'IOP', 'VF MD'],
  },
  PULM: {
    panels: ['PFT Lab', 'Sleep Lab', 'Bronchoscopy', 'TB Clinic'],
    forms: ['PFT Report', 'Sleep Study', 'Bronchoscopy Note'],
    shortcuts: ['Spirometry', 'CPAP Titration', 'ABG'],
    scores: ['FEV1', 'FVC', 'Epworth', 'Borg'],
  },
  GI: {
    panels: ['Endoscopy', 'Hepatology', 'IBD Clinic', 'Manometry'],
    forms: ['Endoscopy Report', 'Liver Clinic', 'IBD Assessment'],
    shortcuts: ['Colonoscopy', 'EGD', 'Biopsy'],
    scores: ['MELD', 'Child-Pugh', 'Mayo Score'],
  },
  NEPH: {
    panels: ['Dialysis Unit', 'Transplant Clinic', 'CKD Clinic', 'Home HD'],
    forms: ['Dialysis Note', 'Transplant Eval', 'CKD Stage'],
    shortcuts: ['New AVF', 'HD Session', 'Kidney Biopsy'],
    scores: ['eGFR', 'KT/V', 'MELD'],
  },
  ENDO: {
    panels: ['Diabetes Clinic', 'Thyroid', 'Pituitary', 'Adrenal'],
    forms: ['Glucose Log', 'Thyroid Note', 'Insulin Pump'],
    shortcuts: ['CGM Download', 'A1C Order', 'Hormone Panel'],
    scores: ['A1C', 'TSH', 'HOMA-IR'],
  },
  INF: {
    panels: ['ID Consults', 'ASP Review', 'Travel Clinic', 'HIV Clinic'],
    forms: ['ID Consult', 'Culture Review', 'Travel Prophylaxis'],
    shortcuts: ['Blood Culture', 'Sensitivity', 'Isolation'],
    scores: ['SOFA', 'qSOFA', 'Pitt Bacteremia'],
  },
  RHEUM: {
    panels: ['Joint Clinic', 'Infusion Suite', 'Lupus Clinic', 'Vasculitis'],
    forms: ['Joint Exam', 'Biologic Infusion', 'Lupus Flare'],
    shortcuts: ['DMARD Order', 'Joint Injection', 'ANA Panel'],
    scores: ['DAS28', 'SLEDAI', 'BASDAI'],
  },
  LAB: {
    panels: ['Chemistry', 'Hematology', 'Microbiology', 'Blood Bank'],
    forms: ['Critical Value', 'Blood Culture', 'Crossmatch'],
    shortcuts: ['Add-On Test', 'Repeat', 'STAT'],
    scores: ['INR', 'aPTT', 'HbA1c'],
  },
  RAD: {
    panels: ['CT', 'MRI', 'Ultrasound', 'Mammography'],
    forms: ['CT Report', 'MRI Report', 'US Report', 'Mammo Report'],
    shortcuts: ['Contrast', 'STAT', 'Add Sequence'],
    scores: ['BI-RADS', 'LI-RADS', 'Lung-RADS'],
  },
  ANES: {
    panels: ['Pre-Op', 'OR', 'PACU', 'Pain Clinic'],
    forms: ['Pre-Op Eval', 'Anesthesia Record', 'Post-Op Pain'],
    shortcuts: ['Mallampati', 'ASA Class', 'Airway Plan'],
    scores: ['ASA', 'Mallampati', 'STOP-BANG'],
  },
  SURG: {
    panels: ['OR Booking', 'Pre-Op', 'OR Schedule', 'Recovery'],
    forms: ['WHO Checklist', 'Op Note', 'Post-Op Note'],
    shortcuts: ['Time-Out', 'Sponge Count', 'Drain Order'],
    scores: ['ASA', 'CCS', 'POSSUM'],
  },
  CRIT: {
    panels: ['Resus Bay', 'Sepsis Bundle', 'RSI', 'ECMO'],
    forms: ['Sepsis Bundle', 'RSI Checklist', 'ECMO Note'],
    shortcuts: ['Code Blue', 'Massive Transfusion', 'Therapeutic Hypothermia'],
    scores: ['SOFA', 'qSOFA', 'APACHE II'],
  },
  DIAG: {
    panels: ['Scan', 'Lab', 'Pathology', 'Genetics'],
    forms: ['Dx Note', 'Path Report', 'Genetic Result'],
    shortcuts: ['Biopsy', 'Stain Order', 'Send-Out'],
    scores: ['TNM', 'FIGO', 'Ann Arbor'],
  },
  FUNC: {
    panels: ['ECG', 'PFT', 'EEG', 'Holter'],
    forms: ['ECG Report', 'PFT Report', 'EEG Report'],
    shortcuts: ['12-Lead', 'Holter Hookup', 'Stress Test'],
    scores: ['QTc', 'FEV1', 'Burdick'],
  },
  CTS: {
    panels: ['OR', 'Bypass', 'Valve', 'Post-Op'],
    forms: ['CABG Note', 'Valve Replacement', 'Post-Op Note'],
    shortcuts: ['Bypass Time', 'Cross-Clamp', 'IABP'],
    scores: ['Euroscore II', 'STS', 'NYHA'],
  },
  NEUROSURG: {
    panels: ['OR', 'ICU', 'Spine', 'Tumor'],
    forms: ['Craniotomy Note', 'Spine Fusion', 'ICP Log'],
    shortcuts: ['ICP Monitor', 'Shunt Tap', 'GCS'],
    scores: ['GCS', 'mRS', 'Frankel'],
  },
  PACU: {
    panels: ['Bay 1', 'Bay 2', 'Discharge Lounge'],
    forms: ['PACU Note', 'Pain Assessment', 'Discharge Criteria'],
    shortcuts: ['Aldrete Score', 'Pain Med', 'Discharge'],
    scores: ['Aldrete', 'PAS', 'RAM'],
  },
  PLASTIC: {
    panels: ['Recon', 'Cosmetic', 'Burn', 'Hand'],
    forms: ['Recon Note', 'Cosmetic Consult', 'Burn Assessment'],
    shortcuts: ['Graft Order', 'Flap Check', 'Dressing Change'],
    scores: ['TBSA', 'Vancouver', 'Caprini'],
  },
  UROL: {
    panels: ['Clinic', 'OR', 'ESWL', 'Urodynamics'],
    forms: ['Stone Note', 'TURP Note', 'Urodynamics'],
    shortcuts: ['PSA', 'Renal US', 'Cystoscopy'],
    scores: ['IPSS', 'AUA', 'Stone Size'],
  },
};

const SCORE_DEFINITIONS = {
  CHA2DS2_VASc: { name: 'CHA2DS2-VASc', nameAr: 'تشاد-VASc', items: ['CHF', 'HTN', 'Age≥75', 'DM', 'Stroke/TIA', 'Vascular', 'Age 65-74', 'Sex Female'], max: 9 },
  HAS_BLED: { name: 'HAS-BLED', nameAr: 'هاس-بليد', items: ['HTN', 'Renal', 'Liver', 'Stroke', 'Bleeding', 'INR Labile', 'Elderly', 'Drugs', 'Alcohol'], max: 9 },
  ESI: { name: 'ESI Level', nameAr: 'مؤشر شدة الطوارئ', items: ['Needs life-saving', 'High risk', 'Many resources', 'One resource', 'No resources'], max: 5 },
  GCS: { name: 'GCS', nameAr: 'غلاسكو', items: ['Eye (1-4)', 'Verbal (1-5)', 'Motor (1-6)'], max: 15 },
  APGAR: { name: 'APGAR', nameAr: 'أبغار', items: ['Appearance', 'Pulse', 'Grimace', 'Activity', 'Respiration'], max: 10 },
  NIHSS: { name: 'NIHSS', nameAr: 'NIHSS', items: ['LOC', 'LOC Q', 'LOC Commands', 'Best Gaze', 'Visual', 'Facial Palsy', 'Motor Arm L', 'Motor Arm R', 'Motor Leg L', 'Motor Leg R', 'Limb Ataxia', 'Sensory', 'Best Language', 'Dysarthria', 'Extinction'], max: 42 },
  PHQ9: { name: 'PHQ-9', nameAr: 'PHQ-9', items: ['Little interest', 'Feeling down', 'Sleep', 'Energy', 'Appetite', 'Self-esteem', 'Concentration', 'Psychomotor', 'Suicidal ideation'], max: 27 },
  DAS28: { name: 'DAS28', nameAr: 'DAS28', items: ['TJC28', 'SJC28', 'ESR/CRP', 'Patient Global'], max: 10 },
  SOFA: { name: 'SOFA', nameAr: 'SOFA', items: ['PaO2/FiO2', 'Platelets', 'Bilirubin', 'MAP/Vaso', 'GCS', 'Creatinine'], max: 24 },
  APACHE_II: { name: 'APACHE II', nameAr: 'APACHE II', items: ['Temp', 'MAP', 'HR', 'RR', 'Oxygenation', 'pH', 'Na', 'K', 'Cr', 'Hct', 'WBC', 'GCS', 'Age', 'Chronic'], max: 71 },
};

function renderScoreCard(scoreKey, values, lang = 'en-US') {
  const def = SCORE_DEFINITIONS[scoreKey];
  if (!def) return '';
  const isAr = lang === 'ar-SA';
  const items = isAr ? (def.itemsAr || def.items) : def.items;
  const rows = items.map((item, i) => `
    <div class="flex items-center justify-between bg-slate-50 rounded px-2 py-1 text-xs">
      <span>${i + 1}. ${item}</span>
      <input type="number" min="0" max="3" value="${values[i] || 0}" data-score="${scoreKey}-${i}" class="w-12 text-center border rounded px-1" />
    </div>
  `).join('');
  const total = items.length;
  const sum = (values || []).reduce((a, b) => a + (Number(b) || 0), 0);
  const pct = Math.min(100, Math.round((sum / def.max) * 100));
  const color = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return `
    <div class="bg-white rounded-lg border p-3 mb-3">
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold text-sm">${isAr ? def.nameAr : def.name}</h4>
        <span class="text-xs text-slate-500">${sum} / ${def.max}</span>
      </div>
      <div class="h-1 bg-slate-200 rounded mb-2"><div class="h-1 ${color} rounded" style="width:${pct}%"></div></div>
      <div class="space-y-1">${rows}</div>
    </div>
  `;
}

function getClinicalPanel(code) { return STATION_CLINICAL[code] || null; }
function listScoreDefs() { return Object.keys(SCORE_DEFINITIONS); }
function getScoreDef(k) { return SCORE_DEFINITIONS[k]; }

window.STATION_CLINICAL = STATION_CLINICAL;
window.SCORE_DEFINITIONS = SCORE_DEFINITIONS;
window.renderScoreCard = renderScoreCard;
window.getClinicalPanel = getClinicalPanel;
window.listScoreDefs = listScoreDefs;
window.getScoreDef = getScoreDef;

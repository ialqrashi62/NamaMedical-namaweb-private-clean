// phase3_engines_ui.js
// Front-end UI for the 26 Phase 3 clinical engines (48 endpoints).
// Loads the engine catalog from GET /api/phase3/ and renders a gallery of
// input forms. Each form is data-driven from a per-engine schema declared
// here, so adding a new engine = adding a new entry to PHASE3_ENGINE_SCHEMAS
// + a new engine reference in PHASE3_ENGINES (built from the catalog order).
//
// Backend: POST /api/phase3/<name>  -> 200 { ok, value, severity, notes,
// recommendations[], citations[], ... }   |  400 { ok:false, code, error }
//
// No PHI is sent (only clinical numbers/bools/enums), per the engine contracts.

(function () {
  'use strict';

  // ------- Per-engine input schemas (data-driven form fields) -------
  // Each entry maps engine function name -> array of fields.
  // field types: 'number' (input[type=number], required), 'text', 'select'
  //   select: { choices: [...] }
  //   number: optional min/max/step + label
  //   text: free string
  const PHASE3_ENGINE_SCHEMAS = {
    // ===== Endocrine =====
    interpretThyroid: [
      { name: 'tsh', type: 'number', label: { en: 'TSH (mIU/L)', ar: 'TSH (م و د/ل)' }, step: 0.01 },
      { name: 'ft4', type: 'number', label: { en: 'FT4 (ng/dL)', ar: 'FT4 (ن غ/دل)' }, step: 0.01 },
      { name: 'ft3', type: 'number', label: { en: 'FT3 (pg/mL)', ar: 'FT3 (ب غ/م ل)' }, step: 0.1 },
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'pregnant', type: 'select', label: { en: 'Pregnant', ar: 'حامل' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    fraxScore: [
      { name: 'age', type: 'number', label: { en: 'Age (years)', ar: 'العمر (سنة)' }, min: 40, max: 90 },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'female', l: { en: 'Female', ar: 'أنثى' } }, { v: 'male', l: { en: 'Male', ar: 'ذكر' } }
      ] },
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن (كغ)' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول (سم)' } },
      { name: 'bmi', type: 'number', label: { en: 'BMI (kg/m^2)', ar: 'مؤشر كتلة الجسم' } },
      { name: 'previous_fracture', type: 'select', label: { en: 'Previous fracture', ar: 'كسر سابق' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'parent_hip_fracture', type: 'select', label: { en: 'Parent hip fracture', ar: 'كسر ورك عند الوالدين' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'current_smoking', type: 'select', label: { en: 'Current smoker', ar: 'مدخن حالي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'glucocorticoids', type: 'select', label: { en: 'On glucocorticoids', ar: 'على الكورتيزون' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'rheumatoid_arthritis', type: 'select', label: { en: 'Rheumatoid arthritis', ar: 'التهاب المفاصل الروماتويدي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'secondary_osteoporosis', type: 'select', label: { en: 'Secondary osteoporosis', ar: 'هشاشة العظام الثانوية' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'alcohol_3_or_more_per_day', type: 'select', label: { en: 'Alcohol >= 3/day', ar: 'كحول >= 3 يومياً' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'femoral_neck_bmd', type: 'number', label: { en: 'Femoral neck BMD (g/cm^2)', ar: 'كثافة عنق الفخذ' }, step: 0.01 }
    ],
    assessObesity: [
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن (كغ)' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول (سم)' } },
      { name: 'waist_cm', type: 'number', label: { en: 'Waist circumference (cm)', ar: 'محيط الخصر (سم)' } },
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'male', l: { en: 'Male', ar: 'ذكر' } }, { v: 'female', l: { en: 'Female', ar: 'أنثى' } }
      ] }
    ],
    glycemicControl: [
      { name: 'hba1c', type: 'number', label: { en: 'HbA1c (%)', ar: 'السكر التراكمي (%)' }, step: 0.1 },
      { name: 'tir_pct', type: 'number', label: { en: 'Time-in-Range (%)', ar: 'الوقت في النطاق (%)' } },
      { name: 'tar_pct', type: 'number', label: { en: 'Time-above-Range (%)', ar: 'فوق النطاق (%)' } },
      { name: 'tbr_pct', type: 'number', label: { en: 'Time-below-Range (%)', ar: 'تحت النطاق (%)' } },
      { name: 'fasting_glucose_mg_dL', type: 'number', label: { en: 'Fasting glucose (mg/dL)', ar: 'سكر صائم (مغ/دل)' } }
    ],

    // ===== Pulmonary =====
    copdSeverity: [
      { name: 'fev1_pct_predicted', type: 'number', label: { en: 'FEV1 % predicted', ar: 'FEV1 % المتوقع' } },
      { name: 'fev1_fvc_ratio', type: 'number', label: { en: 'FEV1/FVC ratio', ar: 'نسبة FEV1/FVC' }, step: 0.01 },
      { name: 'exacerbations_last_12m', type: 'number', label: { en: 'Exacerbations (12m)', ar: 'الانتكاسات (12 شهر)' } },
      { name: 'hospitalizations_last_12m', type: 'number', label: { en: 'Hospitalizations (12m)', ar: 'الاستشفاءات (12 شهر)' } },
      { name: 'mMRC_dyspnea_grade', type: 'number', label: { en: 'mMRC dyspnea grade', ar: 'درجة ضيق التنفس mMRC' } }
    ],
    assessAsthmaControl: [
      { name: 'symptoms_per_week', type: 'number', label: { en: 'Symptoms per week', ar: 'الأعراض أسبوعياً' } },
      { name: 'night_awakenings_per_month', type: 'number', label: { en: 'Night awakenings/month', ar: 'الاستيقاظ الليلي شهرياً' } },
      { name: 'SABA_use_per_week', type: 'number', label: { en: 'SABA use per week', ar: 'استخدام SABA أسبوعياً' } },
      { name: 'activity_limitation', type: 'select', label: { en: 'Activity limitation', ar: 'الحد من النشاط' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'exacerbations_last_12m', type: 'number', label: { en: 'Exacerbations (12m)', ar: 'الانتكاسات (12 شهر)' } },
      { name: 'fev1_pct_predicted', type: 'number', label: { en: 'FEV1 % predicted', ar: 'FEV1 % المتوقع' } },
      { name: 'act_score', type: 'number', label: { en: 'ACT score (5-25)', ar: 'درجة ACT' } }
    ],
    interpretSleepStudy: [
      { name: 'ahi', type: 'number', label: { en: 'AHI (events/hr)', ar: 'مؤشر توقف التنفس' } },
      { name: 'odi', type: 'number', label: { en: 'ODI (events/hr)', ar: 'مؤشر انخفاض الأكسجين' } },
      { name: 'min_spo2', type: 'number', label: { en: 'Min SpO2 (%)', ar: 'أدنى أكسجين (%)' } },
      { name: 'tst_hours', type: 'number', label: { en: 'Total sleep time (hr)', ar: 'وقت النوم (ساعة)' }, step: 0.1 }
    ],

    // ===== Gastro =====
    giBleedRisk: [
      { name: 'hemoglobin_g_dL', type: 'number', label: { en: 'Hemoglobin (g/dL)', ar: 'الهيموجلوبين' }, step: 0.1 },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'male', l: { en: 'Male', ar: 'ذكر' } }, { v: 'female', l: { en: 'Female', ar: 'أنثى' } }
      ] },
      { name: 'systolic_bp_mmHg', type: 'number', label: { en: 'Systolic BP (mmHg)', ar: 'الانقباضي' } },
      { name: 'pulse_bpm', type: 'number', label: { en: 'Pulse (bpm)', ar: 'النبض' } },
      { name: 'BUN_mmol_L', type: 'number', label: { en: 'BUN (mmol/L)', ar: 'البولة' }, step: 0.1 },
      { name: 'melena', type: 'select', label: { en: 'Melena', ar: 'ميلينا (براز أسود)' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'syncope', type: 'select', label: { en: 'Syncope', ar: 'إغماء' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    ucMayoScore: [
      { name: 'stool_frequency', type: 'number', label: { en: 'Stool frequency subscore', ar: 'تكرار البراز' }, min: 0, max: 3 },
      { name: 'rectal_bleeding', type: 'number', label: { en: 'Rectal bleeding subscore', ar: 'النزف الشرجي' }, min: 0, max: 3 },
      { name: 'endoscopic_finding', type: 'number', label: { en: 'Endoscopic subscore', ar: 'التنظير' }, min: 0, max: 3 },
      { name: 'physician_global', type: 'number', label: { en: 'Physician global', ar: 'تقييم الطبيب' }, min: 0, max: 3 }
    ],
    crohnCDAI: [
      { name: 'number_liquid_stools', type: 'number', label: { en: 'Liquid stools (7d)', ar: 'الإسهال السائل (7 أيام)' } },
      { name: 'abdominal_pain', type: 'number', label: { en: 'Abdominal pain (0-3)', ar: 'ألم البطن' }, min: 0, max: 3 },
      { name: 'general_wellbeing', type: 'number', label: { en: 'General wellbeing (0-4)', ar: 'الحالة العامة' }, min: 0, max: 4 },
      { name: 'hematocrit', type: 'number', label: { en: 'Hematocrit (%)', ar: 'الهيماتوكريت' } }
    ],

    // ===== Nephrology =====
    ckdEgfr: [
      { name: 'creatinine', type: 'number', label: { en: 'Creatinine (mg/dL)', ar: 'الكرياتينين' }, step: 0.01 },
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'male', l: { en: 'Male', ar: 'ذكر' } }, { v: 'female', l: { en: 'Female', ar: 'أنثى' } }
      ] }
    ],
    ckdStaging: [
      { name: 'egfr', type: 'number', label: { en: 'eGFR (mL/min/1.73m^2)', ar: 'معدل الترشيح' } },
      { name: 'albuminuria_mg_g', type: 'number', label: { en: 'Albuminuria (mg/g)', ar: 'البيلة الألبومينية' } }
    ],
    hdAdequacy: [
      { name: 'pre_dialysis_urea', type: 'number', label: { en: 'Pre-dialysis urea (mg/dL)', ar: 'البولة قبل الغسيل' } },
      { name: 'post_dialysis_urea', type: 'number', label: { en: 'Post-dialysis urea (mg/dL)', ar: 'البولة بعد الغسيل' } },
      { name: 'session_hours', type: 'number', label: { en: 'Session duration (hr)', ar: 'مدة الجلسة' }, step: 0.1 }
    ],

    // ===== Rheumatology =====
    das28crp: [
      { name: 'tjc28', type: 'number', label: { en: 'Tender joint count (28)', ar: 'المفاصل المؤلمة' } },
      { name: 'sjc28', type: 'number', label: { en: 'Swollen joint count (28)', ar: 'المفاصل المنتفخة' } },
      { name: 'crp_mg_L', type: 'number', label: { en: 'CRP (mg/L)', ar: 'البروتين التفاعلي' } },
      { name: 'patient_global_mm', type: 'number', label: { en: 'Patient global (0-100mm)', ar: 'تقييم المريض العام' }, min: 0, max: 100 }
    ],
    sledai2k: [
      { name: 'seizure', type: 'number', label: { en: 'Seizure', ar: 'تشنج' }, min: 0, max: 8 },
      { name: 'psychosis', type: 'number', label: { en: 'Psychosis', ar: 'ذهان' }, min: 0, max: 8 },
      { name: 'rash', type: 'number', label: { en: 'Rash', ar: 'طفح' }, min: 0, max: 8 },
      { name: 'arthritis', type: 'number', label: { en: 'Arthritis', ar: 'التهاب المفاصل' }, min: 0, max: 8 },
      { name: 'low_complement', type: 'number', label: { en: 'Low complement', ar: 'انخفاض المتمم' }, min: 0, max: 4 },
      { name: 'increased_dna', type: 'number', label: { en: 'Increased anti-DNA', ar: 'ارتفاع anti-DNA' }, min: 0, max: 4 }
    ],

    // ===== Critical Care =====
    news2Score: [
      { name: 'resp_rate', type: 'number', label: { en: 'Respiratory rate', ar: 'معدل التنفس' } },
      { name: 'spo2_pct', type: 'number', label: { en: 'SpO2 (%)', ar: 'الأكسجين' } },
      { name: 'temperature_c', type: 'number', label: { en: 'Temperature (°C)', ar: 'الحرارة' }, step: 0.1 },
      { name: 'systolic_bp_mmHg', type: 'number', label: { en: 'Systolic BP (mmHg)', ar: 'الانقباضي' } },
      { name: 'pulse_bpm', type: 'number', label: { en: 'Pulse (bpm)', ar: 'النبض' } },
      { name: 'consciousness', type: 'select', label: { en: 'Consciousness', ar: 'الوعي' }, choices: [
        { v: 'alert', l: { en: 'Alert', ar: 'يقظ' } }, { v: 'voice', l: { en: 'New confusion', ar: 'تشوش جديد' } }
      ] }
    ],
    nihssScore: [
      { name: 'loc_commands', type: 'number', label: { en: 'LOC - commands', ar: 'الوعي - أوامر' }, min: 0, max: 2 },
      { name: 'loc_questions', type: 'number', label: { en: 'LOC - questions', ar: 'الوعي - أسئلة' }, min: 0, max: 2 },
      { name: 'loc', type: 'number', label: { en: 'LOC - level', ar: 'مستوى الوعي' }, min: 0, max: 3 },
      { name: 'best_gaze', type: 'number', label: { en: 'Best gaze', ar: 'أفضل نظر' }, min: 0, max: 2 },
      { name: 'visual_field', type: 'number', label: { en: 'Visual field', ar: 'المجال البصري' }, min: 0, max: 3 },
      { name: 'facial_palsy', type: 'number', label: { en: 'Facial palsy', ar: 'شلل الوجه' }, min: 0, max: 3 },
      { name: 'motor_arm_left', type: 'number', label: { en: 'Motor arm L', ar: 'الذراع الأيسر' }, min: 0, max: 4 },
      { name: 'motor_arm_right', type: 'number', label: { en: 'Motor arm R', ar: 'الذراع الأيمن' }, min: 0, max: 4 },
      { name: 'motor_leg_left', type: 'number', label: { en: 'Motor leg L', ar: 'الساق اليسرى' }, min: 0, max: 4 },
      { name: 'motor_leg_right', type: 'number', label: { en: 'Motor leg R', ar: 'الساق اليمنى' }, min: 0, max: 4 },
      { name: 'limb_ataxia', type: 'number', label: { en: 'Limb ataxia', ar: 'ترنح الأطراف' }, min: 0, max: 2 },
      { name: 'sensory', type: 'number', label: { en: 'Sensory', ar: 'الإحساس' }, min: 0, max: 2 },
      { name: 'language', type: 'number', label: { en: 'Language', ar: 'اللغة' }, min: 0, max: 3 },
      { name: 'dysarthria', type: 'number', label: { en: 'Dysarthria', ar: 'عسر النطق' }, min: 0, max: 2 },
      { name: 'extinction', type: 'number', label: { en: 'Extinction/inattention', ar: 'إهمال' }, min: 0, max: 2 }
    ],
    apacheIV: [
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'temperature_c', type: 'number', label: { en: 'Temperature (°C)', ar: 'الحرارة' }, step: 0.1 },
      { name: 'mean_bp_mmHg', type: 'number', label: { en: 'Mean BP (mmHg)', ar: 'متوسط الضغط' } },
      { name: 'heart_rate_bpm', type: 'number', label: { en: 'Heart rate (bpm)', ar: 'النبض' } },
      { name: 'resp_rate', type: 'number', label: { en: 'Respiratory rate', ar: 'معدل التنفس' } },
      { name: 'paO2_mmHg', type: 'number', label: { en: 'PaO2 (mmHg)', ar: 'الأكسجين الشرياني' } },
      { name: 'fio2_pct', type: 'number', label: { en: 'FiO2 (%)', ar: 'تركيز الأكسجين' } },
      { name: 'pH', type: 'number', label: { en: 'pH', ar: 'الحموضة' }, step: 0.01 },
      { name: 'sodium_mmol_L', type: 'number', label: { en: 'Sodium (mmol/L)', ar: 'الصوديوم' } },
      { name: 'potassium_mmol_L', type: 'number', label: { en: 'Potassium (mmol/L)', ar: 'البوتاسيوم' } },
      { name: 'creatinine_mg_dL', type: 'number', label: { en: 'Creatinine (mg/dL)', ar: 'الكرياتينين' }, step: 0.01 },
      { name: 'hematocrit_pct', type: 'number', label: { en: 'Hematocrit (%)', ar: 'الهيماتوكريت' } },
      { name: 'wbc', type: 'number', label: { en: 'WBC (10^3/uL)', ar: 'الكريات البيض' } },
      { name: 'gcs', type: 'number', label: { en: 'GCS', ar: 'مقياس غلاسكو' } }
    ],

    // ===== OBGYN =====
    partographAssessment: [
      { name: 'cervical_dilation_cm', type: 'number', label: { en: 'Cervical dilation (cm)', ar: 'توسع عنق الرحم' }, step: 0.5 },
      { name: 'fetal_descent_station', type: 'number', label: { en: 'Fetal descent station', ar: 'محطة نزول الجنين' } },
      { name: 'contractions_per_10min', type: 'number', label: { en: 'Contractions per 10min', ar: 'الانقباضات / 10 دقائق' } },
      { name: 'fetal_heart_rate_bpm', type: 'number', label: { en: 'Fetal HR (bpm)', ar: 'نبض الجنين' } }
    ],
    bishopScore: [
      { name: 'dilation_cm', type: 'number', label: { en: 'Dilation (cm)', ar: 'التوسع' } },
      { name: 'effacement_pct', type: 'number', label: { en: 'Effacement (%)', ar: 'المحو (%)' } },
      { name: 'station', type: 'number', label: { en: 'Station', ar: 'المحطة' } },
      { name: 'position', type: 'select', label: { en: 'Position', ar: 'الوضع' }, choices: [
        { v: 'anterior', l: { en: 'Anterior', ar: 'أمامي' } },
        { v: 'mid', l: { en: 'Mid', ar: 'وسط' } },
        { v: 'posterior', l: { en: 'Posterior', ar: 'خلفي' } }
      ] },
      { name: 'consistency', type: 'select', label: { en: 'Consistency', ar: 'التماسك' }, choices: [
        { v: 'firm', l: { en: 'Firm', ar: 'قاسي' } },
        { v: 'medium', l: { en: 'Medium', ar: 'متوسط' } },
        { v: 'soft', l: { en: 'Soft', ar: 'لين' } }
      ] }
    ],

    // ===== Dermatology =====
    pasiScore: [
      { name: 'head_erythema', type: 'number', label: { en: 'Head erythema (0-4)', ar: 'احمرار الرأس' }, min: 0, max: 4 },
      { name: 'head_induration', type: 'number', label: { en: 'Head induration (0-4)', ar: 'تصلب الرأس' }, min: 0, max: 4 },
      { name: 'head_desquamation', type: 'number', label: { en: 'Head desquamation (0-4)', ar: 'تقشر الرأس' }, min: 0, max: 4 },
      { name: 'head_area_pct', type: 'number', label: { en: 'Head area %', ar: 'مساحة الرأس %' } },
      { name: 'trunk_erythema', type: 'number', label: { en: 'Trunk erythema', ar: 'احمرار الجذع' }, min: 0, max: 4 },
      { name: 'trunk_induration', type: 'number', label: { en: 'Trunk induration', ar: 'تصلب الجذع' }, min: 0, max: 4 },
      { name: 'trunk_desquamation', type: 'number', label: { en: 'Trunk desquamation', ar: 'تقشر الجذع' }, min: 0, max: 4 },
      { name: 'trunk_area_pct', type: 'number', label: { en: 'Trunk area %', ar: 'مساحة الجذع %' } },
      { name: 'upper_erythema', type: 'number', label: { en: 'Upper erythema', ar: 'احمرار الأطراف العلوية' }, min: 0, max: 4 },
      { name: 'upper_induration', type: 'number', label: { en: 'Upper induration', ar: 'تصلب' }, min: 0, max: 4 },
      { name: 'upper_desquamation', type: 'number', label: { en: 'Upper desquamation', ar: 'تقشر' }, min: 0, max: 4 },
      { name: 'upper_area_pct', type: 'number', label: { en: 'Upper area %', ar: 'مساحة %' } },
      { name: 'lower_erythema', type: 'number', label: { en: 'Lower erythema', ar: 'احمرار السفلية' }, min: 0, max: 4 },
      { name: 'lower_induration', type: 'number', label: { en: 'Lower induration', ar: 'تصلب' }, min: 0, max: 4 },
      { name: 'lower_desquamation', type: 'number', label: { en: 'Lower desquamation', ar: 'تقشر' }, min: 0, max: 4 },
      { name: 'lower_area_pct', type: 'number', label: { en: 'Lower area %', ar: 'مساحة %' } }
    ],
    scoradScore: [
      { name: 'extent_pct', type: 'number', label: { en: 'Extent (0-100%)', ar: 'الامتداد %' }, min: 0, max: 100 },
      { name: 'intensity_sum', type: 'number', label: { en: 'Intensity sum (0-18)', ar: 'مجموع الشدة' }, min: 0, max: 18 },
      { name: 'subjective_sum', type: 'number', label: { en: 'Subjective sum (0-20)', ar: 'مجموع الذاتي' }, min: 0, max: 20 }
    ],

    // ===== Trauma =====
    glasgowComaScale: [
      { name: 'eye', type: 'number', label: { en: 'Eye (1-4)', ar: 'العين' }, min: 1, max: 4 },
      { name: 'verbal', type: 'number', label: { en: 'Verbal (1-5)', ar: 'اللفظي' }, min: 1, max: 5 },
      { name: 'motor', type: 'number', label: { en: 'Motor (1-6)', ar: 'الحركي' }, min: 1, max: 6 }
    ],
    injurySeverityScore: [
      { name: 'head_ais', type: 'number', label: { en: 'Head AIS', ar: 'AIS الرأس' }, min: 0, max: 6 },
      { name: 'face_ais', type: 'number', label: { en: 'Face AIS', ar: 'AIS الوجه' }, min: 0, max: 6 },
      { name: 'chest_ais', type: 'number', label: { en: 'Chest AIS', ar: 'AIS الصدر' }, min: 0, max: 6 },
      { name: 'abdomen_ais', type: 'number', label: { en: 'Abdomen AIS', ar: 'AIS البطن' }, min: 0, max: 6 },
      { name: 'extremity_ais', type: 'number', label: { en: 'Extremity AIS', ar: 'AIS الأطراف' }, min: 0, max: 6 },
      { name: 'external_ais', type: 'number', label: { en: 'External AIS', ar: 'AIS خارجي' }, min: 0, max: 6 }
    ],
    revisedTraumaScore: [
      { name: 'gcs', type: 'number', label: { en: 'GCS', ar: 'غلاسكو' } },
      { name: 'systolic_bp_mmHg', type: 'number', label: { en: 'Systolic BP (mmHg)', ar: 'الانقباضي' } },
      { name: 'resp_rate', type: 'number', label: { en: 'Respiratory rate', ar: 'معدل التنفس' } }
    ],

    // ===== Neonatal =====
    apgarScore: [
      { name: 'appearance', type: 'number', label: { en: 'Appearance (0-2)', ar: 'المظهر' }, min: 0, max: 2 },
      { name: 'pulse', type: 'number', label: { en: 'Pulse (0-2)', ar: 'النبض' }, min: 0, max: 2 },
      { name: 'grimace', type: 'number', label: { en: 'Grimace (0-2)', ar: 'ردود الفعل' }, min: 0, max: 2 },
      { name: 'activity', type: 'number', label: { en: 'Activity (0-2)', ar: 'النشاط' }, min: 0, max: 2 },
      { name: 'respiration', type: 'number', label: { en: 'Respiration (0-2)', ar: 'التنفس' }, min: 0, max: 2 }
    ],
    bhutaniRisk: [
      { name: 'total_serum_bilirubin_mg_dL', type: 'number', label: { en: 'Total bilirubin (mg/dL)', ar: 'البيليروبين الكلي' }, step: 0.1 },
      { name: 'age_hours', type: 'number', label: { en: 'Age (hours)', ar: 'العمر بالساعات' } }
    ],
    birthweightCategory: [
      { name: 'birth_weight_grams', type: 'number', label: { en: 'Birth weight (g)', ar: 'الوزن عند الولادة' } },
      { name: 'gestational_age_weeks', type: 'number', label: { en: 'Gestational age (weeks)', ar: 'عمر الحمل' } }
    ],

    // ===== Palliative =====
    karnofskyScore: [
      { name: 'karnofsky', type: 'number', label: { en: 'Karnofsky score (0-100)', ar: 'درجة كارنوفسكي' }, min: 0, max: 100, step: 10 }
    ],
    ecogScore: [
      { name: 'ecog', type: 'number', label: { en: 'ECOG performance (0-4)', ar: 'أداء ECOG' }, min: 0, max: 4 }
    ],
    pallPerformanceScale: [
      { name: 'pps_percent', type: 'number', label: { en: 'PPS percent (0-100)', ar: 'نسبة PPS' }, step: 10 }
    ],

    // ===== Oncology =====
    tnmStage: [
      { name: 'T', type: 'number', label: { en: 'T stage (0-4)', ar: 'مرحلة T' }, min: 0, max: 4 },
      { name: 'N', type: 'number', label: { en: 'N stage (0-3)', ar: 'مرحلة N' }, min: 0, max: 3 },
      { name: 'M', type: 'number', label: { en: 'M stage (0-1)', ar: 'مرحلة M' }, min: 0, max: 1 }
    ],
    bodySurfaceArea: [
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول' } }
    ],
    chemoDose: [
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول' } },
      { name: 'dose_mg_per_m2', type: 'number', label: { en: 'Dose (mg/m^2)', ar: 'الجرعة ملغ/م²' } }
    ],

    // ===== Psychiatry =====
    phq9Score: [
      { name: 'q1_anhedonia', type: 'number', label: { en: 'Q1 anhedonia (0-3)', ar: 'فقد المتعة' }, min: 0, max: 3 },
      { name: 'q2_mood', type: 'number', label: { en: 'Q2 mood (0-3)', ar: 'المزاج' }, min: 0, max: 3 },
      { name: 'q3_sleep', type: 'number', label: { en: 'Q3 sleep (0-3)', ar: 'النوم' }, min: 0, max: 3 },
      { name: 'q4_energy', type: 'number', label: { en: 'Q4 energy (0-3)', ar: 'الطاقة' }, min: 0, max: 3 },
      { name: 'q5_appetite', type: 'number', label: { en: 'Q5 appetite (0-3)', ar: 'الشهية' }, min: 0, max: 3 },
      { name: 'q6_self_esteem', type: 'number', label: { en: 'Q6 self-esteem (0-3)', ar: 'تقدير الذات' }, min: 0, max: 3 },
      { name: 'q7_concentration', type: 'number', label: { en: 'Q7 concentration (0-3)', ar: 'التركيز' }, min: 0, max: 3 },
      { name: 'q8_motor', type: 'number', label: { en: 'Q8 psychomotor (0-3)', ar: 'الحركية النفسية' }, min: 0, max: 3 },
      { name: 'q9_self_harm', type: 'number', label: { en: 'Q9 self-harm (0-3)', ar: 'إيذاء النفس' }, min: 0, max: 3 }
    ],
    gad7Score: [
      { name: 'q1_nervous', type: 'number', label: { en: 'Q1 nervous (0-3)', ar: 'العصبية' }, min: 0, max: 3 },
      { name: 'q2_worry_control', type: 'number', label: { en: 'Q2 worry control (0-3)', ar: 'التحكم بالقلق' }, min: 0, max: 3 },
      { name: 'q3_worrying_too_much', type: 'number', label: { en: 'Q3 worrying too much (0-3)', ar: 'القلق المفرط' }, min: 0, max: 3 },
      { name: 'q4_trouble_relaxing', type: 'number', label: { en: 'Q4 trouble relaxing (0-3)', ar: 'صعوبة الاسترخاء' }, min: 0, max: 3 },
      { name: 'q5_restless', type: 'number', label: { en: 'Q5 restless (0-3)', ar: 'الأرق' }, min: 0, max: 3 },
      { name: 'q6_annoyed', type: 'number', label: { en: 'Q6 annoyed (0-3)', ar: 'الانزعاج' }, min: 0, max: 3 },
      { name: 'q7_afraid', type: 'number', label: { en: 'Q7 afraid (0-3)', ar: 'الخوف' }, min: 0, max: 3 }
    ],
    wongBakerFaces: [
      { name: 'face_score', type: 'select', label: { en: 'Face (0-10)', ar: 'الوجه' }, choices: [
        { v: 0, l: { en: '0 - No hurt', ar: '0 - بدون ألم' } },
        { v: 2, l: { en: '2 - Hurts little bit', ar: '2 - ألم خفيف' } },
        { v: 4, l: { en: '4 - Hurts little more', ar: '4 - أكثر قليلاً' } },
        { v: 6, l: { en: '6 - Hurts even more', ar: '6 - أكثر' } },
        { v: 8, l: { en: '8 - Hurts whole lot', ar: '8 - كثير' } },
        { v: 10, l: { en: '10 - Hurts worst', ar: '10 - أسوأ' } }
      ] }
    ],

    // ===== ENT/Ophthalmology =====
    pureToneAverage: [
      { name: 'db_500', type: 'number', label: { en: '500 Hz (dB)', ar: '500 هرتز' } },
      { name: 'db_1000', type: 'number', label: { en: '1000 Hz (dB)', ar: '1000 هرتز' } },
      { name: 'db_2000', type: 'number', label: { en: '2000 Hz (dB)', ar: '2000 هرتز' } },
      { name: 'db_4000', type: 'number', label: { en: '4000 Hz (dB)', ar: '4000 هرتز' } }
    ],
    visualAcuity: [
      { name: 'snellen_numerator', type: 'number', label: { en: 'Numerator (e.g. 20)', ar: 'البسط (مثل 20)' } },
      { name: 'snellen_denominator', type: 'number', label: { en: 'Denominator (e.g. 40)', ar: 'المقام (مثل 40)' } }
    ],
    glaucomaRisk: [
      { name: 'iop_mmHg', type: 'number', label: { en: 'IOP (mmHg)', ar: 'الضغط داخل العين' } },
      { name: 'cup_disc_ratio', type: 'number', label: { en: 'Cup/Disc ratio', ar: 'نسبة الكأس/القرص' }, step: 0.1 },
      { name: 'central_corneal_thickness_um', type: 'number', label: { en: 'CCT (um)', ar: 'سماكة القرنية' } },
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'family_history', type: 'select', label: { en: 'Family history', ar: 'تاريخ عائلي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],

    // ===== Urology =====
    ipssScore: [
      { name: 'incomplete_emptying', type: 'number', label: { en: 'Incomplete emptying (0-5)', ar: 'تفريغ ناقص' }, min: 0, max: 5 },
      { name: 'frequency', type: 'number', label: { en: 'Frequency (0-5)', ar: 'التكرار' }, min: 0, max: 5 },
      { name: 'intermittency', type: 'number', label: { en: 'Intermittency (0-5)', ar: 'التقطع' }, min: 0, max: 5 },
      { name: 'urgency', type: 'number', label: { en: 'Urgency (0-5)', ar: 'الإلحاح' }, min: 0, max: 5 },
      { name: 'weak_stream', type: 'number', label: { en: 'Weak stream (0-5)', ar: 'ضعف التدفق' }, min: 0, max: 5 },
      { name: 'straining', type: 'number', label: { en: 'Straining (0-5)', ar: 'الجهد' }, min: 0, max: 5 },
      { name: 'nocturia', type: 'number', label: { en: 'Nocturia (0-5)', ar: 'التبول الليلي' }, min: 0, max: 5 },
      { name: 'qol_score_0_6', type: 'number', label: { en: 'QoL (0-6)', ar: 'جودة الحياة' }, min: 0, max: 6 }
    ],
    renalStonesRisk: [
      { name: 'fluid_intake_L_d', type: 'number', label: { en: 'Fluid intake (L/day)', ar: 'السوائل اليومية' }, step: 0.1 },
      { name: 'bmi', type: 'number', label: { en: 'BMI', ar: 'مؤشر الكتلة' }, step: 0.1 },
      { name: 'family_history', type: 'select', label: { en: 'Family history', ar: 'تاريخ عائلي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'male', l: { en: 'Male', ar: 'ذكر' } }, { v: 'female', l: { en: 'Female', ar: 'أنثى' } }
      ] }
    ],

    // ===== Heme/ID =====
    wellsDVT: [
      { name: 'active_cancer', type: 'select', label: { en: 'Active cancer', ar: 'سرطان نشط' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'recently_bedridden', type: 'select', label: { en: 'Recently bedridden', ar: 'طريح الفراش مؤخراً' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'localized_tenderness', type: 'select', label: { en: 'Localized tenderness', ar: 'ألم موضعي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'calf_swelling_3cm', type: 'select', label: { en: 'Calf swelling >3cm', ar: 'تورم بطة الساق' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'alternative_diagnosis_less_likely', type: 'select', label: { en: 'Alternative dx less likely', ar: 'تشخيص بديل أقل احتمالاً' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    wellsPE: [
      { name: 'clinical_signs_dvt', type: 'select', label: { en: 'DVT signs', ar: 'علامات DVT' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'pe_most_likely', type: 'select', label: { en: 'PE most likely', ar: 'PE الأكثر احتمالاً' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'hr_gt_100', type: 'select', label: { en: 'HR >100', ar: 'نبض >100' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'hemoptysis', type: 'select', label: { en: 'Hemoptysis', ar: 'نفث الدم' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'malignancy', type: 'select', label: { en: 'Malignancy', ar: 'ورم خبيث' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    hasBledScore: [
      { name: 'hypertension_uncontrolled', type: 'select', label: { en: 'Uncontrolled HTN', ar: 'ضغط غير منضبط' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'renal_disease', type: 'select', label: { en: 'Renal disease', ar: 'مرض كلوي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'liver_disease', type: 'select', label: { en: 'Liver disease', ar: 'مرض كبدي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'stroke', type: 'select', label: { en: 'Stroke history', ar: 'سكتة دماغية' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'prior_major_bleeding', type: 'select', label: { en: 'Prior major bleeding', ar: 'نزيف سابق' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'labile_inr', type: 'select', label: { en: 'Labile INR', ar: 'INR متقلب' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'age_gt_65', type: 'select', label: { en: 'Age >65', ar: 'عمر >65' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'alcohol_use', type: 'select', label: { en: 'Alcohol use', ar: 'كحول' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    curb65Score: [
      { name: 'confusion', type: 'select', label: { en: 'Confusion', ar: 'تشوش' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'bun_gt_19_mg_dL', type: 'select', label: { en: 'BUN >19 mg/dL', ar: 'بولة >19' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'resp_rate_gt_30', type: 'select', label: { en: 'RR >30', ar: 'تنفس >30' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'systolic_bp_lt_90', type: 'select', label: { en: 'SBP <90', ar: 'انقباضي <90' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'age_gt_65', type: 'select', label: { en: 'Age >65', ar: 'عمر >65' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],

    // ===== Preop =====
    asaClassification: [
      { name: 'asa_class', type: 'select', label: { en: 'ASA class (1-6)', ar: 'فئة ASA' }, choices: [
        { v: 1, l: { en: '1 - Normal', ar: '1 - طبيعي' } },
        { v: 2, l: { en: '2 - Mild systemic', ar: '2 - مرض خفيف' } },
        { v: 3, l: { en: '3 - Severe systemic', ar: '3 - مرض شديد' } },
        { v: 4, l: { en: '4 - Severe w/ constant threat', ar: '4 - خطر دائم' } },
        { v: 5, l: { en: '5 - Moribund', ar: '5 - يحتضر' } },
        { v: 6, l: { en: '6 - Brain-dead', ar: '6 - ميت دماغياً' } }
      ] }
    ],
    rcriScore: [
      { name: 'high_risk_surgery', type: 'select', label: { en: 'High-risk surgery', ar: 'جراحة عالية الخطورة' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'ischemic_heart_disease', type: 'select', label: { en: 'Ischemic HD', ar: 'قصور تاجي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'heart_failure', type: 'select', label: { en: 'Heart failure', ar: 'فشل قلبي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'cerebrovascular_disease', type: 'select', label: { en: 'Cerebrovascular dz', ar: 'مرض وعائي دماغي' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'insulin_dependent_diabetes', type: 'select', label: { en: 'Insulin-dependent DM', ar: 'سكري معتمد على الأنسولين' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] },
      { name: 'creatinine_above_2', type: 'select', label: { en: 'Creatinine >2', ar: 'كرياتينين >2' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ],
    capriniScore: [
      { name: 'age_40_59', type: 'number', label: { en: 'Age 40-59', ar: 'عمر 40-59' }, min: 0, max: 2 },
      { name: 'age_60_74', type: 'number', label: { en: 'Age 60-74', ar: 'عمر 60-74' }, min: 0, max: 2 },
      { name: 'age_75_plus', type: 'number', label: { en: 'Age 75+', ar: 'عمر 75+' }, min: 0, max: 3 },
      { name: 'prior_vte', type: 'number', label: { en: 'Prior VTE', ar: 'VTE سابقة' }, min: 0, max: 3 },
      { name: 'active_cancer', type: 'number', label: { en: 'Active cancer', ar: 'سرطان نشط' }, min: 0, max: 2 },
      { name: 'major_surgery', type: 'number', label: { en: 'Major surgery', ar: 'جراحة كبرى' }, min: 0, max: 2 },
      { name: 'immobility', type: 'number', label: { en: 'Immobility', ar: 'عدم الحركة' }, min: 0, max: 2 }
    ],

    // ===== Nutrition =====
    bmi: [
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول' } }
    ],
    harrisBenedictBEE: [
      { name: 'weight_kg', type: 'number', label: { en: 'Weight (kg)', ar: 'الوزن' } },
      { name: 'height_cm', type: 'number', label: { en: 'Height (cm)', ar: 'الطول' } },
      { name: 'age', type: 'number', label: { en: 'Age', ar: 'العمر' } },
      { name: 'sex', type: 'select', label: { en: 'Sex', ar: 'الجنس' }, choices: [
        { v: 'male', l: { en: 'Male', ar: 'ذكر' } }, { v: 'female', l: { en: 'Female', ar: 'أنثى' } }
      ] }
    ],
    nrs2002: [
      { name: 'bmi', type: 'number', label: { en: 'BMI', ar: 'مؤشر الكتلة' }, step: 0.1 },
      { name: 'weight_loss_pct', type: 'number', label: { en: 'Weight loss % (3m)', ar: 'فقدان الوزن %' } },
      { name: 'food_intake_pct_reduction', type: 'number', label: { en: 'Food intake reduction %', ar: 'نقص الغذاء %' } },
      { name: 'disease_severity', type: 'select', label: { en: 'Disease severity', ar: 'شدة المرض' }, choices: [
        { v: 'none', l: { en: 'None', ar: 'لا شيء' } },
        { v: 'mild', l: { en: 'Mild', ar: 'خفيف' } },
        { v: 'moderate', l: { en: 'Moderate', ar: 'متوسط' } },
        { v: 'severe', l: { en: 'Severe', ar: 'شديد' } }
      ] },
      { name: 'age_gt_70', type: 'select', label: { en: 'Age >70', ar: 'عمر >70' }, choices: [
        { v: false, l: { en: 'No', ar: 'لا' } }, { v: true, l: { en: 'Yes', ar: 'نعم' } }
      ] }
    ]
  };

  // Specialty grouping for the gallery
  const PHASE3_SPECIALTY_GROUPS = {
    'Endocrine':     ['interpretThyroid', 'fraxScore', 'assessObesity', 'glycemicControl'],
    'Pulmonary':     ['copdSeverity', 'assessAsthmaControl', 'interpretSleepStudy'],
    'Gastro':        ['giBleedRisk', 'ucMayoScore', 'crohnCDAI'],
    'Nephrology':    ['ckdEgfr', 'ckdStaging', 'hdAdequacy'],
    'Rheumatology':  ['das28crp', 'sledai2k'],
    'Critical Care': ['news2Score', 'nihssScore', 'apacheIV'],
    'OBGYN':         ['partographAssessment', 'bishopScore'],
    'Dermatology':   ['pasiScore', 'scoradScore'],
    'Trauma':        ['glasgowComaScale', 'injurySeverityScore', 'revisedTraumaScore'],
    'Neonatal':      ['apgarScore', 'bhutaniRisk', 'birthweightCategory'],
    'Palliative':    ['karnofskyScore', 'ecogScore', 'pallPerformanceScale'],
    'Oncology':      ['tnmStage', 'bodySurfaceArea', 'chemoDose'],
    'Psychiatry':    ['phq9Score', 'gad7Score', 'wongBakerFaces'],
    'ENT/Ophthal':   ['pureToneAverage', 'visualAcuity', 'glaucomaRisk'],
    'Urology':       ['ipssScore', 'renalStonesRisk'],
    'Heme/ID':       ['wellsDVT', 'wellsPE', 'hasBledScore', 'curb65Score'],
    'Preop':         ['asaClassification', 'rcriScore', 'capriniScore'],
    'Nutrition':     ['bmi', 'harrisBenedictBEE', 'nrs2002']
  };

  // Friendly titles for each engine (AR + EN)
  const PHASE3_ENGINE_TITLES = {
    interpretThyroid: { en: 'Thyroid Function', ar: 'وظائف الغدة الدرقية' },
    fraxScore: { en: 'FRAX Fracture Risk', ar: 'مخاطر الكسور FRAX' },
    assessObesity: { en: 'Obesity Assessment', ar: 'تقييم السمنة' },
    glycemicControl: { en: 'Glycemic Control', ar: 'السيطرة السكرية' },
    copdSeverity: { en: 'COPD Severity (GOLD)', ar: 'شدة COPD' },
    assessAsthmaControl: { en: 'Asthma Control', ar: 'السيطرة على الربو' },
    interpretSleepStudy: { en: 'Sleep Study (PSG)', ar: 'تفسير دراسة النوم' },
    giBleedRisk: { en: 'GI Bleed Risk', ar: 'مخاطر نزيف الجهاز الهضمي' },
    ucMayoScore: { en: 'UC Mayo Score', ar: 'مقياس مايو للقولون' },
    crohnCDAI: { en: "Crohn's CDAI", ar: 'مؤشر نشاط كرون' },
    ckdEgfr: { en: 'CKD eGFR', ar: 'معدل الترشيح' },
    ckdStaging: { en: 'CKD Staging', ar: 'مراحل مرض الكلى' },
    hdAdequacy: { en: 'Hemodialysis Adequacy', ar: 'كفاية غسيل الكلى' },
    das28crp: { en: 'DAS28-CRP', ar: 'مؤشر نشاط التهاب المفاصل' },
    sledai2k: { en: 'SLEDAI-2K', ar: 'مؤشر نشاط الذئبة' },
    news2Score: { en: 'NEWS-2 (Early Warning)', ar: 'مؤشر الإنذار المبكر' },
    nihssScore: { en: 'NIH Stroke Scale', ar: 'مقياس السكتة الدماغية' },
    apacheIV: { en: 'APACHE-IV', ar: 'APACHE-IV' },
    partographAssessment: { en: 'Partograph', ar: 'مخطط الولادة' },
    bishopScore: { en: 'Bishop Score', ar: 'مقياس بيشوب' },
    pasiScore: { en: 'PASI (Psoriasis)', ar: 'مؤشر الصدفية PASI' },
    scoradScore: { en: 'SCORAD (Eczema)', ar: 'مؤشر الإكزيما' },
    glasgowComaScale: { en: 'Glasgow Coma Scale', ar: 'مقياس غلاسكو' },
    injurySeverityScore: { en: 'Injury Severity Score', ar: 'شدة الإصابة' },
    revisedTraumaScore: { en: 'Revised Trauma Score', ar: 'مؤشر الصدمة المنقح' },
    apgarScore: { en: 'APGAR', ar: 'مقياس أبغار' },
    bhutaniRisk: { en: 'Bhutani Nomogram', ar: 'مخطط بوتاني' },
    birthweightCategory: { en: 'Birthweight Category', ar: 'تصنيف الوزن' },
    karnofskyScore: { en: 'Karnofsky Performance', ar: 'أداء كارنوفسكي' },
    ecogScore: { en: 'ECOG Performance', ar: 'أداء ECOG' },
    pallPerformanceScale: { en: 'Palliative Performance', ar: 'أداء ملطفي' },
    tnmStage: { en: 'TNM Staging', ar: 'تصنيف TNM' },
    bodySurfaceArea: { en: 'Body Surface Area (BSA)', ar: 'مساحة سطح الجسم' },
    chemoDose: { en: 'Chemo Dose Calculator', ar: 'جرعة العلاج الكيميائي' },
    phq9Score: { en: 'PHQ-9 (Depression)', ar: 'مقياس الاكتئاب PHQ-9' },
    gad7Score: { en: 'GAD-7 (Anxiety)', ar: 'مقياس القلق GAD-7' },
    wongBakerFaces: { en: 'Wong-Baker Pain', ar: 'وجوه الألم' },
    pureToneAverage: { en: 'Pure Tone Average', ar: 'معدل السمع النقي' },
    visualAcuity: { en: 'Visual Acuity (logMAR)', ar: 'حدة البصر' },
    glaucomaRisk: { en: 'Glaucoma Risk', ar: 'مخاطر الجلوكوما' },
    ipssScore: { en: 'IPSS (Prostate)', ar: 'مؤشر البروستاتا IPSS' },
    renalStonesRisk: { en: 'Renal Stones Risk', ar: 'مخاطر حصى الكلى' },
    wellsDVT: { en: "Wells' DVT Score", ar: 'مقياس DVT' },
    wellsPE: { en: "Wells' PE Score", ar: 'مقياس الانسداد الرئوي' },
    hasBledScore: { en: 'HAS-BLED', ar: 'مقياس HAS-BLED' },
    curb65Score: { en: 'CURB-65 (Pneumonia)', ar: 'مؤشر الالتهاب الرئوي' },
    asaClassification: { en: 'ASA Classification', ar: 'تصنيف ASA' },
    rcriScore: { en: 'RCRI (Cardiac Risk)', ar: 'مخاطر قلبية' },
    capriniScore: { en: 'Caprini (VTE Risk)', ar: 'مخاطر VTE' },
    bmi: { en: 'BMI Calculator', ar: 'مؤشر كتلة الجسم' },
    harrisBenedictBEE: { en: 'Harris-Benedict BEE', ar: 'الطاقة الأساسية' },
    nrs2002: { en: 'NRS-2002 (Nutrition)', ar: 'مؤشر التغذية NRS-2002' }
  };

  // Build the flat list of all 48 engines with their URL path
  const PHASE3_ENGINES = [];
  for (const [specialty, fns] of Object.entries(PHASE3_SPECIALTY_GROUPS)) {
    for (const fn of fns) {
      // Map function name -> URL path (uses the router's path mapping)
      const path = engineNameToPath(fn);
      PHASE3_ENGINES.push({ name: fn, specialty, path });
    }
  }

  function engineNameToPath(fnName) {
    // Match the router's path mapping
    const m = {
      interpretThyroid: 'thyroid',
      fraxScore: 'bone-density',
      assessObesity: 'obesity',
      glycemicControl: 'glycemic-control',
      copdSeverity: 'copd-severity',
      assessAsthmaControl: 'asthma-control',
      interpretSleepStudy: 'sleep-study',
      giBleedRisk: 'gi-bleed-risk',
      ucMayoScore: 'ibd-activity/mayo',
      crohnCDAI: 'ibd-activity/crohn',
      ckdEgfr: 'ckd/egfr',
      ckdStaging: 'ckd/staging',
      hdAdequacy: 'hd-adequacy',
      das28crp: 'rheum/das28',
      sledai2k: 'rheum/sledai',
      news2Score: 'sepsis/news2',
      nihssScore: 'icu/nihss',
      apacheIV: 'icu/apache',
      partographAssessment: 'obgyn/partograph',
      bishopScore: 'obgyn/bishop',
      pasiScore: 'derm/pasi',
      scoradScore: 'derm/scorad',
      glasgowComaScale: 'trauma/gcs',
      injurySeverityScore: 'trauma/iss',
      revisedTraumaScore: 'trauma/rts',
      apgarScore: 'neonatal/apgar',
      bhutaniRisk: 'neonatal/bhutani',
      birthweightCategory: 'neonatal/birthweight',
      karnofskyScore: 'palliative/kps',
      ecogScore: 'palliative/ecog',
      pallPerformanceScale: 'palliative/pps',
      tnmStage: 'oncology/tnm',
      bodySurfaceArea: 'oncology/bsa',
      chemoDose: 'oncology/chemo-dose',
      phq9Score: 'psych/phq9',
      gad7Score: 'psych/gad7',
      wongBakerFaces: 'psych/wong-baker',
      pureToneAverage: 'ent/pure-tone-avg',
      visualAcuity: 'ent/visual-acuity',
      glaucomaRisk: 'ent/glaucoma-risk',
      ipssScore: 'uro/ipss',
      renalStonesRisk: 'uro/stones',
      wellsDVT: 'heme/wells-dvt',
      wellsPE: 'heme/wells-pe',
      hasBledScore: 'heme/has-bled',
      curb65Score: 'heme/curb65',
      asaClassification: 'preop/asa',
      rcriScore: 'preop/rcri',
      capriniScore: 'preop/caprini',
      bmi: 'nutrition/bmi',
      harrisBenedictBEE: 'nutrition/bee',
      nrs2002: 'nutrition/nrs2002'
    };
    return m[fnName] || fnName;
  }

  // Build the form HTML for one engine
  function buildFormHtml(engine) {
    const schema = PHASE3_ENGINE_SCHEMAS[engine.name] || [];
    const title = PHASE3_ENGINE_TITLES[engine.name] || { en: engine.name, ar: engine.name };
    const fieldId = (i) => `p3-${engine.name}-f${i}`;

    const fieldsHtml = schema.map((f, i) => {
      const label = (f.label && (f.label.ar || f.label.en)) || f.name;
      if (f.type === 'select') {
        const opts = f.choices.map(c => {
          const lbl = (c.l && (c.l.ar || c.l.en)) || c.v;
          return `<option value="${escapeHtml(c.v)}">${escapeHtml(lbl)}</option>`;
        }).join('');
        return `<div class="form-group" style="margin-bottom:8px"><label style="font-size:12px">${escapeHtml(label)}</label><select id="${fieldId(i)}" class="form-input" style="font-size:13px;padding:4px 8px">${opts}</select></div>`;
      }
      const attrs = [];
      if (f.type === 'number') attrs.push('type="number"');
      if (f.min !== undefined) attrs.push(`min="${f.min}"`);
      if (f.max !== undefined) attrs.push(`max="${f.max}"`);
      if (f.step !== undefined) attrs.push(`step="${f.step}"`);
      return `<div class="form-group" style="margin-bottom:8px"><label style="font-size:12px">${escapeHtml(label)}</label><input ${attrs.join(' ')} id="${fieldId(i)}" class="form-input" style="font-size:13px;padding:4px 8px"/></div>`;
    }).join('');

    return `
      <div class="p3-engine" data-name="${engine.name}" data-path="${engine.path}" data-specialty="${engine.specialty}" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:13px;color:#1f2937">${escapeHtml(title.en)}</div>
            <div style="font-size:11px;color:#6b7280;direction:rtl;text-align:right">${escapeHtml(title.ar)}</div>
          </div>
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;background:#f3f4f6;padding:2px 6px;border-radius:4px">${escapeHtml(engine.specialty)}</div>
        </div>
        <div class="p3-form">${fieldsHtml}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button type="button" class="p3-run btn-primary" style="flex:1;font-size:12px;padding:6px 12px;border:none;background:#0ea5e9;color:#fff;border-radius:6px;cursor:pointer">⚡ ${escapeHtml('Calculate', 'احتساب')}</button>
          <button type="button" class="p3-reset" style="font-size:12px;padding:6px 10px;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:6px;cursor:pointer">↺ ${escapeHtml('Reset', 'مسح')}</button>
        </div>
        <div class="p3-result" style="margin-top:8px;display:none"></div>
      </div>`;
  }

  function escapeHtml(...vals) {
    const s = vals.find(v => typeof v === 'string') || '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Run one engine with current form values
  async function runEngine(engine) {
    const root = document.querySelector(`[data-name="${engine.name}"]`);
    if (!root) return;
    const result = root.querySelector('.p3-result');
    const schema = PHASE3_ENGINE_SCHEMAS[engine.name] || [];
    const payload = {};
    schema.forEach((f, i) => {
      const el = root.querySelector(`#p3-${engine.name}-f${i}`);
      if (!el) return;
      let v = el.value;
      if (v === '' || v === null || v === undefined) return; // skip empty
      if (f.type === 'number') v = parseFloat(v);
      // For booleans (true/false strings), pass through
      payload[f.name] = v;
    });

    result.style.display = 'block';
    result.innerHTML = `<div style="color:#6b7280;font-size:12px;padding:8px">⏳ ${escapeHtml('Calculating...', 'جاري الحساب...')}</div>`;

    try {
      const API = (window.API || (window.app && window.app.API));
      const resp = await fetch('/api/phase3/' + engine.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) {
        result.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px;border-radius:6px;font-size:12px">❌ <strong>Error</strong>: ${escapeHtml(data.error || 'Validation failed')}</div>`;
        return;
      }
      // Render success
      const sev = data.severity || 'normal';
      const sevColor = sev === 'critical' ? '#991b1b' : sev === 'high' || sev === 'severe' ? '#9a3412' : sev === 'moderate' || sev === 'amber' ? '#854d0e' : '#065f46';
      const sevBg = sev === 'critical' ? '#fee2e2' : sev === 'high' || sev === 'severe' ? '#ffedd5' : sev === 'moderate' || sev === 'amber' ? '#fef3c7' : '#d1fae5';
      const valHtml = data.value !== undefined && data.value !== null
        ? `<div style="font-size:24px;font-weight:700;color:#0ea5e9;margin:4px 0">${escapeHtml(String(data.value))}</div>`
        : '';
      const patternHtml = data.pattern ? `<div style="font-size:12px;color:#6b7280;margin:2px 0">${escapeHtml(data.pattern)}</div>` : '';
      const notesHtml = data.notes ? `<div style="font-size:12px;margin:4px 0;padding:6px;background:#f9fafb;border-radius:4px">${escapeHtml(data.notes)}</div>` : '';
      const recsHtml = (data.recommendations && data.recommendations.length)
        ? '<div style="margin-top:6px"><strong style="font-size:12px">Recommendations:</strong><ul style="margin:4px 0;padding-left:20px;font-size:12px">' +
            data.recommendations.map(r => `<li>${escapeHtml((r && (r.action || r.text)) || String(r))}</li>`).join('') +
          '</ul></div>'
        : '';
      const citationsHtml = (data.citations && data.citations.length)
        ? '<div style="margin-top:6px;font-size:10px;color:#9ca3af">📚 ' + data.citations.map(escapeHtml).join(', ') + '</div>'
        : '';
      const actionHtml = data.action ? `<div style="font-size:12px;margin:4px 0;color:#0f766e">→ ${escapeHtml(data.action)}</div>` : '';
      result.innerHTML = `
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:10px;text-transform:uppercase;background:${sevBg};color:${sevColor};padding:2px 8px;border-radius:4px;font-weight:600">${escapeHtml(sev)}</span>
            ${data.score !== undefined && data.score !== data.value ? `<span style="font-size:10px;color:#6b7280">score: ${escapeHtml(String(data.score))}</span>` : ''}
          </div>
          ${valHtml}
          ${patternHtml}
          ${actionHtml}
          ${notesHtml}
          ${recsHtml}
          ${citationsHtml}
        </div>`;
    } catch (err) {
      result.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px;border-radius:6px;font-size:12px">❌ ${escapeHtml(err.message || 'Network error')}</div>`;
    }
  }

  function resetForm(engine) {
    const root = document.querySelector(`[data-name="${engine.name}"]`);
    if (!root) return;
    root.querySelectorAll('input, select').forEach(el => { el.value = ''; });
    const result = root.querySelector('.p3-result');
    if (result) { result.style.display = 'none'; result.innerHTML = ''; }
  }

  // Build the gallery HTML
  function buildGallery() {
    let html = '<div class="p3-gallery" style="display:flex;flex-direction:column;gap:6px">';
    for (const eng of PHASE3_ENGINES) {
      html += buildFormHtml(eng);
    }
    html += '</div>';
    return html;
  }

  // Filter by search query
  function filterGallery(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('.p3-engine').forEach(el => {
      if (!q) { el.style.display = ''; return; }
      const txt = el.textContent.toLowerCase();
      el.style.display = txt.includes(q) ? '' : 'none';
    });
  }

  // Public API: render into a container
  function render(container) {
    if (!container) return;
    container.innerHTML = buildGallery();
    // Wire buttons
    container.querySelectorAll('.p3-engine').forEach(el => {
      const name = el.dataset.name;
      const eng = PHASE3_ENGINES.find(e => e.name === name);
      if (!eng) return;
      el.querySelector('.p3-run').addEventListener('click', () => runEngine(eng));
      el.querySelector('.p3-reset').addEventListener('click', () => resetForm(eng));
    });
  }

  // Public API: render with search box
  function renderWithSearch(container) {
    if (!container) return;
    container.innerHTML = `
      <div style="margin-bottom:8px">
        <input type="text" id="p3-search" placeholder="${escapeHtml('Search engines (e.g. GCS, APACHE, NEWS)...', 'ابحث عن المحرك...')}" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px"/>
      </div>
      <div id="p3-gallery-host"></div>
    `;
    render(container.querySelector('#p3-gallery-host'));
    const search = container.querySelector('#p3-search');
    if (search) search.addEventListener('input', (e) => filterGallery(e.target.value));
  }

  // Auto-mount: find a container with id='phase3EnginesGallery' or data-p3-mount and render
  function autoMount() {
    const host = document.querySelector('[data-p3-mount], #phase3EnginesGallery');
    if (host) renderWithSearch(host);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  // Expose
  window.Phase3EnginesUI = { render, renderWithSearch, runEngine, engines: PHASE3_ENGINES };
})();

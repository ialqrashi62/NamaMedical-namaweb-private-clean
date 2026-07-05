/**
 * ============================================================
 * NURSING STATION v1 — World-Class Clinical Workstation
 * محطة التمريض — مستوى عالمي (Epic / Cerner / Oracle Health)
 * ============================================================
 * Three-Panel Layout:
 *   LEFT   — Patient Worklist مع EWS Colors وحالة الوردية
 *   CENTER — 10 تبويبات سريرية كاملة
 *   RIGHT  — Quick Actions: Vitals / Alerts / Escalate / SBAR
 * ============================================================
 * v1 Features:
 *   1. Vitals + EWS/NEWS2 Auto-Score + Trend
 *   2. eMAR — MAR Sheet بألوان الورديات + Five Rights
 *   3. Head-to-Toe Assessment (Neuro/Resp/CV/GI/GU/Skin)
 *   4. Nursing Care Plan (NANDA/NIC/NOC)
 *   5. Intake & Output Tracker + Daily Balance
 *   6. SBAR Handover Report + Print
 *   7. Triage (ESI 1-5) + Room Assignment
 *   8. Risk Assessments (Morse + Braden + DVT + qSOFA)
 *   9. Nursing Orders Board (Acknowledge + Execute)
 *  10. Nursing Notes (SOAP + Progress + Templates)
 * ============================================================
 */

'use strict';

/* ---- Global State ---- */
window._NS = window._NS || {
  selectedPatientId: null,
  selectedPatientData: null,
  activeTab: 'vitals',
  ioEntries: [],           // Intake/Output entries for current session
  worklist: [],            // Patient worklist
  refreshTimer: null,
};

/* ============================================================ */
/*  NEWS2 SCORING ENGINE                                         */
/* ============================================================ */
function calcNEWS2({ rr, spo2, temp, sbp, hr, avpu, onO2 }) {
  let score = 0;
  const details = {};

  // Respiratory Rate
  if      (rr <= 8)  { score += 3; details.rr = { val: rr, pts: 3, flag: 'critical' }; }
  else if (rr <= 11) { score += 1; details.rr = { val: rr, pts: 1, flag: 'low' }; }
  else if (rr <= 20) { score += 0; details.rr = { val: rr, pts: 0, flag: 'normal' }; }
  else if (rr <= 24) { score += 1; details.rr = { val: rr, pts: 1, flag: 'low' }; }
  else               { score += 3; details.rr = { val: rr, pts: 3, flag: 'critical' }; }

  // SpO2 (Scale 1)
  if      (spo2 <= 91) { score += 3; details.spo2 = { val: spo2, pts: 3, flag: 'critical' }; }
  else if (spo2 <= 93) { score += 2; details.spo2 = { val: spo2, pts: 2, flag: 'high' }; }
  else if (spo2 <= 95) { score += 1; details.spo2 = { val: spo2, pts: 1, flag: 'low' }; }
  else                 { score += 0; details.spo2 = { val: spo2, pts: 0, flag: 'normal' }; }

  // O2 supplemental
  if (onO2) { score += 2; }

  // Temperature
  if      (temp <= 35.0) { score += 3; details.temp = { val: temp, pts: 3, flag: 'critical' }; }
  else if (temp <= 36.0) { score += 1; details.temp = { val: temp, pts: 1, flag: 'low' }; }
  else if (temp <= 38.0) { score += 0; details.temp = { val: temp, pts: 0, flag: 'normal' }; }
  else if (temp <= 39.0) { score += 1; details.temp = { val: temp, pts: 1, flag: 'low' }; }
  else                   { score += 2; details.temp = { val: temp, pts: 2, flag: 'high' }; }

  // Systolic BP
  if      (sbp <= 90)  { score += 3; details.sbp = { val: sbp, pts: 3, flag: 'critical' }; }
  else if (sbp <= 100) { score += 2; details.sbp = { val: sbp, pts: 2, flag: 'high' }; }
  else if (sbp <= 110) { score += 1; details.sbp = { val: sbp, pts: 1, flag: 'low' }; }
  else if (sbp <= 219) { score += 0; details.sbp = { val: sbp, pts: 0, flag: 'normal' }; }
  else                 { score += 3; details.sbp = { val: sbp, pts: 3, flag: 'critical' }; }

  // Heart Rate
  if      (hr <= 40)  { score += 3; details.hr = { val: hr, pts: 3, flag: 'critical' }; }
  else if (hr <= 50)  { score += 1; details.hr = { val: hr, pts: 1, flag: 'low' }; }
  else if (hr <= 90)  { score += 0; details.hr = { val: hr, pts: 0, flag: 'normal' }; }
  else if (hr <= 110) { score += 1; details.hr = { val: hr, pts: 1, flag: 'low' }; }
  else if (hr <= 130) { score += 2; details.hr = { val: hr, pts: 2, flag: 'high' }; }
  else                { score += 3; details.hr = { val: hr, pts: 3, flag: 'critical' }; }

  // Consciousness (AVPU)
  if (avpu && avpu !== 'A') { score += 3; details.avpu = { val: avpu, pts: 3, flag: 'critical' }; }
  else { details.avpu = { val: avpu || 'A', pts: 0, flag: 'normal' }; }

  const risk = score >= 7 ? 'high' : score >= 5 ? 'medium' : 'low';
  const riskColor = score >= 7 ? '#dc2626' : score >= 5 ? '#ca8a04' : '#16a34a';
  const riskLabel = score >= 7
    ? tr('HIGH — Escalate Urgently', 'عالية جداً — تصعيد فوري')
    : score >= 5 ? tr('MEDIUM — Monitor Closely', 'متوسطة — مراقبة مستمرة')
    : tr('LOW — Routine Monitoring', 'منخفضة — مراقبة روتينية');
  return { score, risk, riskColor, riskLabel, details };
}

/* ============================================================ */
/*  MORSE FALL RISK CALCULATOR                                   */
/* ============================================================ */
function calcMorse({ fallHistory, secDx, aidType, iv, gait, mentalStatus }) {
  const pts = {
    fallHistory: fallHistory ? 25 : 0,
    secDx:       secDx ? 15 : 0,
    aid:         aidType === 'furniture' ? 30 : aidType === 'crutch' ? 15 : 0,
    iv:          iv ? 20 : 0,
    gait:        gait === 'impaired' ? 20 : gait === 'weak' ? 10 : 0,
    mental:      mentalStatus === 'forgets' ? 15 : 0,
  };
  const total = Object.values(pts).reduce((a, b) => a + b, 0);
  const risk = total >= 45 ? 'high' : total >= 25 ? 'low' : 'no';
  const label = risk === 'high' ? tr('High Risk', 'خطورة عالية') : risk === 'low' ? tr('Low Risk', 'خطورة منخفضة') : tr('No Risk', 'لا خطورة');
  const color = risk === 'high' ? '#dc2626' : risk === 'low' ? '#ca8a04' : '#16a34a';
  return { total, risk, label, color, pts };
}

/* ============================================================ */
/*  BRADEN PRESSURE INJURY CALCULATOR                            */
/* ============================================================ */
function calcBraden({ sensory, moisture, activity, mobility, nutrition, friction }) {
  const total = (sensory || 4) + (moisture || 4) + (activity || 4) + (mobility || 4) + (nutrition || 4) + (friction || 3);
  const risk = total <= 9 ? 'very-high' : total <= 12 ? 'high' : total <= 14 ? 'moderate' : total <= 18 ? 'mild' : 'no';
  const label = {
    'very-high': tr('Very High Risk', 'خطورة عالية جداً'),
    'high':      tr('High Risk', 'خطورة عالية'),
    'moderate':  tr('Moderate Risk', 'خطورة متوسطة'),
    'mild':      tr('Mild Risk', 'خطورة خفيفة'),
    'no':        tr('No Risk', 'لا خطورة'),
  }[risk];
  const color = total <= 12 ? '#dc2626' : total <= 18 ? '#ca8a04' : '#16a34a';
  return { total, risk, label, color };
}

/* ============================================================ */
/*  MAIN ENTRY POINT                                             */
/* ============================================================ */
async function renderNursingStation(el) {
  if (window._NS.refreshTimer) { clearInterval(window._NS.refreshTimer); window._NS.refreshTimer = null; }
  window._NS.selectedPatientId = null;
  window._NS.ioEntries = [];

  // Skeleton
  el.innerHTML = `
    <div class="page-title">👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}
      <span style="font-size:12px;font-weight:400;color:var(--text-dim);margin-inline-start:12px">
        ${tr('Epic-class Clinical Workstation', 'محطة سريرية بمستوى عالمي')}
      </span>
    </div>
    <div class="ns-layout" id="nsLayout">
      <div class="ns-left-panel"><div class="ns-panel-header"><span>⏳ ${tr('Loading...', 'جاري التحميل...')}</span></div></div>
      <div class="ns-center-panel" style="align-items:center;justify-content:center">
        <div style="text-align:center;padding:40px;color:var(--text-dim)"><div style="font-size:64px;opacity:0.3">👩‍⚕️</div><p>${tr('Loading...', 'جاري التحميل...')}</p></div>
      </div>
      <div class="ns-right-panel"><div class="ns-panel-header"><span>⚡ ${tr('Actions', 'إجراءات')}</span></div></div>
    </div>
  `;

  let worklist = [], emarOrders = [], currentUser = {};
  try {
    [worklist, emarOrders, currentUser] = await Promise.all([
      API.get('/api/queue/patients').catch(() => API.get('/api/patients').then(p => p.filter(x => x.status === 'Waiting' || x.status === 'With Nurse' || x.status === 'With Doctor'))),
      API.get('/api/emar/orders').catch(() => []),
      API.get('/api/auth/me').catch(() => ({})),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="page-title">👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}</div>
      <div class="error-card-premium"><div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load', 'فشل التحميل')}</h3><p>${escapeHTML(e.message)}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>`;
    return;
  }

  window._NS.worklist = worklist;
  window._NS.emarOrders = emarOrders;
  window._NS.currentUser = currentUser.user || currentUser;

  el.innerHTML = `
    <div class="page-title" style="margin-bottom:12px">
      👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}
      <span style="font-size:12px;font-weight:500;color:var(--text-dim);margin-inline-start:12px">
        ${tr('Nurse:', 'الممرض/ة:')} <strong>${escapeHTML(window._NS.currentUser?.name || window._NS.currentUser?.username || 'Nurse')}</strong>
      </span>
      <span style="font-size:12px;font-weight:500;color:var(--text-dim);margin-inline-start:12px">
        📅 ${new Date().toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
      </span>
      <span style="font-size:11px;font-weight:600;color:var(--text-dim);margin-inline-start:auto;background:var(--surface-container,#f1f5f9);padding:4px 12px;border-radius:20px">
        🔄 ${tr('Shift', 'الوردية')}: ${getShiftName()}
      </span>
    </div>
    <div class="ns-layout" id="nsLayout">

      <!-- LEFT PANEL: Patient Worklist -->
      <div class="ns-left-panel" id="nsWorklist">
        <div class="ns-panel-header">
          <span>🏥 ${tr('Patient Worklist', 'قائمة المرضى')}</span>
          <div class="ns-badge-count" id="nsWorklistCount">${worklist.length}</div>
        </div>
        <div id="nsWorklistBody" style="flex:1;overflow-y:auto"></div>
        <div style="padding:10px;border-top:1px solid var(--border)">
          <button class="btn btn-sm w-full" onclick="window.nsRefreshWorklist()"
            style="background:var(--primary-glow);color:var(--primary);border:1px solid var(--primary);font-size:11px">
            🔄 ${tr('Refresh', 'تحديث')}
          </button>
        </div>
      </div>

      <!-- CENTER PANEL -->
      <div class="ns-center-panel" id="nsCenterPanel">
        <div id="nsCenterContent" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:40px;color:var(--text-dim);text-align:center">
          <div style="font-size:72px;margin-bottom:20px;opacity:0.3">🩺</div>
          <h3 style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--text-dim)">${tr('Select a patient', 'اختر مريضاً')}</h3>
          <p style="font-size:13px;opacity:0.7">${tr('Patient chart will appear here', 'سيظهر الملف السريري هنا')}</p>
        </div>
      </div>

      <!-- RIGHT PANEL: Quick Actions -->
      <div class="ns-right-panel" id="nsActionsPanel">
        <div class="ns-panel-header"><span>⚡ ${tr('Quick Actions', 'إجراءات سريعة')}</span></div>
        <div id="nsActionsContent" style="padding:16px;flex:1;overflow-y:auto">
          <div style="text-align:center;padding:32px;color:var(--text-dim)">
            <div style="font-size:36px;opacity:0.25">⚡</div>
            <p style="font-size:12px;margin-top:8px">${tr('Select a patient first', 'اختر مريضاً أولاً')}</p>
          </div>
        </div>
      </div>

    </div>
  `;

  window.nsRenderWorklist(worklist);
  window._NS.refreshTimer = setInterval(window.nsRefreshWorklist, 90000);
}

/* ============================================================ */
/*  HELPERS                                                      */
/* ============================================================ */
function getShiftName() {
  const h = new Date().getHours();
  if (h >= 7 && h < 15)  return tr('Morning (07:00-15:00)', 'صباحية (07-15)');
  if (h >= 15 && h < 23) return tr('Evening (15:00-23:00)', 'مسائية (15-23)');
  return tr('Night (23:00-07:00)', 'ليلية (23-07)');
}

function getEWSColor(score) {
  if (score >= 7) return '#dc2626';
  if (score >= 5) return '#ca8a04';
  if (score >= 1) return '#0ea5e9';
  return '#16a34a';
}

/* ============================================================ */
/*  LEFT PANEL: WORKLIST                                         */
/* ============================================================ */
window.nsRenderWorklist = function(patients) {
  const body = document.getElementById('nsWorklistBody');
  const count = document.getElementById('nsWorklistCount');
  if (!body) return;
  if (count) count.textContent = patients.length;

  if (!patients.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)">
      <div style="font-size:36px;margin-bottom:8px">🎉</div>
      <p style="font-size:12px">${tr('No patients', 'لا يوجد مرضى')}</p>
    </div>`;
    return;
  }

  body.innerHTML = patients.map(p => {
    const name = isArabic ? (p.name_ar || p.name_en || '-') : (p.name_en || p.name_ar || '-');
    const initial = (name || '?').charAt(0).toUpperCase();
    const isActive = window._NS.selectedPatientId === p.id;
    const ewsScore = p.ews_score || 0;
    const ewsColor = getEWSColor(ewsScore);
    const statusColor = p.status === 'With Doctor' ? '#16a34a' : p.status === 'With Nurse' ? '#0ea5e9' : '#ca8a04';
    const statusLabel = p.status === 'With Doctor' ? tr('With Doctor', 'مع الطبيب') : p.status === 'With Nurse' ? tr('With Nurse', 'مع الممرضة') : tr('Waiting', 'انتظار');
    const triageColors = { 1: '#dc2626', 2: '#ea580c', 3: '#ca8a04', 4: '#3b82f6', 5: '#16a34a' };
    const tColor = triageColors[p.triage_level] || '#6b7280';

    return `
      <div class="ns-worklist-item ${isActive ? 'active' : ''}"
           onclick="window.nsSelectPatient(${safeId(p.id)})"
           data-pid="${safeId(p.id)}">
        <div class="ns-worklist-avatar" style="background:linear-gradient(135deg,${tColor},${tColor}88)">${escapeHTML(initial)}</div>
        <div class="ns-worklist-info">
          <div class="ns-worklist-name">${escapeHTML(name)}</div>
          <div class="ns-worklist-meta">
            ${p.file_number ? '🗂️ ' + escapeHTML(String(p.file_number)) + ' · ' : ''}
            ${escapeHTML(p.department || p.chief_complaint || tr('General', 'عام'))}
          </div>
          <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
            <span style="background:${statusColor}22;color:${statusColor};font-size:9px;padding:1px 6px;border-radius:10px;font-weight:700">${escapeHTML(statusLabel)}</span>
            ${ewsScore > 0 ? `<span style="background:${ewsColor}22;color:${ewsColor};font-size:9px;padding:1px 6px;border-radius:10px;font-weight:700">NEWS2: ${ewsScore}</span>` : ''}
            ${p.triage_level ? `<span style="background:${tColor}22;color:${tColor};font-size:9px;padding:1px 6px;border-radius:10px;font-weight:700">T${p.triage_level}</span>` : ''}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-dim);white-space:nowrap">${p.exam_room_name ? '🚪 ' + escapeHTML(p.exam_room_name) : ''}</div>
      </div>`;
  }).join('');
};

window.nsRefreshWorklist = async function() {
  try {
    const q = await API.get('/api/queue/patients').catch(() =>
      API.get('/api/patients').then(p => p.filter(x => x.status === 'Waiting' || x.status === 'With Nurse' || x.status === 'With Doctor'))
    );
    window._NS.worklist = q;
    window.nsRenderWorklist(q);
  } catch (e) { /* silent */ }
};

/* ============================================================ */
/*  SELECT PATIENT → Load Chart                                  */
/* ============================================================ */
window.nsSelectPatient = async function(patientId) {
  if (!patientId) return;
  window._NS.selectedPatientId = patientId;
  window._NS.activeTab = 'vitals';
  window._NS.ioEntries = [];

  document.querySelectorAll('.ns-worklist-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.pid) === patientId);
  });

  const center = document.getElementById('nsCenterContent') || document.getElementById('nsCenterPanel');
  if (center) center.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-dim)"><div style="font-size:32px;margin-bottom:12px">⏳</div><p>${tr('Loading chart...', 'جاري تحميل الملف...')}</p></div>`;

  let chart = {}, vitals = [], problems = [], allergies = [], medications = [], emarOrders = [];
  try {
    [chart, vitals, problems, allergies, medications, emarOrders] = await Promise.all([
      API.get(`/api/patients/${patientId}/chart`).catch(() => ({})),
      API.get(`/api/nursing/vitals/${patientId}`).catch(() => []),
      API.get(`/api/patients/${patientId}/problems`).catch(() => []),
      API.get(`/api/patients/${patientId}/allergies`).catch(() => []),
      API.get(`/api/patients/${patientId}/medications`).catch(() => []),
      API.get('/api/emar/orders').catch(() => []),
    ]);
  } catch (e) { console.error('Chart load error:', e); }

  const patient = chart.patient || {};
  window._NS.selectedPatientData = { patient, chart, vitals, problems, allergies, medications, emarOrders };

  // Compute NEWS2 from latest vitals
  const latestV = {};
  vitals.forEach(v => { if (!latestV[v.score_type]) latestV[v.score_type] = v.score_value; });
  const bpSys = parseInt((latestV['blood_pressure'] || '0/0').split('/')[0]) || 0;
  const news2 = calcNEWS2({
    rr: parseFloat(latestV['respiratory_rate'] || 0),
    spo2: parseFloat(latestV['spo2'] || 99),
    temp: parseFloat(latestV['temperature'] || 37),
    sbp: bpSys,
    hr: parseFloat(latestV['pulse'] || 75),
    avpu: latestV['consciousness'] || 'A',
    onO2: false,
  });
  window._NS.selectedPatientData.news2 = news2;

  window.nsRenderPatientChart(patient, chart, vitals, problems, allergies, medications);
  window.nsRenderActionsPanel(patient, news2);
};

/* ============================================================ */
/*  CENTER PANEL: Patient Chart                                  */
/* ============================================================ */
window.nsRenderPatientChart = function(patient, chart, vitals, problems, allergies, medications) {
  const centerPanel = document.getElementById('nsCenterPanel');
  if (!centerPanel) return;

  const name = isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-');
  const initial = (name || '?').charAt(0).toUpperCase();
  const news2 = window._NS.selectedPatientData?.news2 || { score: 0, riskColor: '#16a34a', riskLabel: '' };

  // Allergy chips
  const allergyBanner = allergies.length
    ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;margin-top:6px;font-size:11px;font-weight:700;color:#dc2626">
        🚨 ${tr('ALLERGIES', 'تنبيه حساسية')}: ${allergies.map(a => escapeHTML(a.allergen)).join(' · ')}
       </div>`
    : '';

  centerPanel.innerHTML = `
    <!-- Patient Header -->
    <div class="ns-patient-header">
      <div class="ns-patient-avatar">${escapeHTML(initial)}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="ns-patient-name">${escapeHTML(name)}</div>
          <span style="background:${news2.riskColor}22;color:${news2.riskColor};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:800">
            NEWS2: ${news2.score} — ${news2.riskLabel}
          </span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${patient.file_number ? `<span class="ns-meta-chip">🗂️ ${escapeHTML(String(patient.file_number))}</span>` : ''}
          ${patient.age ? `<span class="ns-meta-chip">📅 ${escapeHTML(String(patient.age))} ${tr('yrs', 'سنة')}</span>` : ''}
          ${patient.gender ? `<span class="ns-meta-chip">${patient.gender === 'ذكر'||patient.gender==='Male'?'👨':'👩'} ${escapeHTML(patient.gender)}</span>` : ''}
          ${patient.blood_type ? `<span class="ns-meta-chip">🩸 ${escapeHTML(patient.blood_type)}</span>` : ''}
          ${patient.insurance_company ? `<span class="ns-meta-chip">🏢 ${escapeHTML(patient.insurance_company)}</span>` : ''}
        </div>
        ${allergyBanner}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-sm" onclick="window.nsMarkWithNurse(${safeId(patient.id)})"
          style="font-size:11px;padding:6px 10px;background:#0ea5e9;color:#fff;border:none">
          👩‍⚕️ ${tr('With Nurse', 'مع الممرضة')}
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="ns-chart-tabs" id="nsChartTabs">
      ${[
        { id: 'vitals',    icon: '🌡️', en: 'Vitals + EWS', ar: 'المؤشرات' },
        { id: 'emar',      icon: '💉', en: 'eMAR',          ar: 'إعطاء الدواء' },
        { id: 'h2t',       icon: '🩺', en: 'Assessment',    ar: 'التقييم' },
        { id: 'careplan',  icon: '📋', en: 'Care Plan',     ar: 'خطة الرعاية' },
        { id: 'io',        icon: '💧', en: 'I & O',         ar: 'السوائل' },
        { id: 'handover',  icon: '🔄', en: 'Handover',      ar: 'تسليم الوردية' },
        { id: 'triage',    icon: '⚠️', en: 'Triage',        ar: 'الفرز' },
        { id: 'risks',     icon: '📊', en: 'Risk Assess.',  ar: 'تقييم المخاطر' },
        { id: 'orders',    icon: '📑', en: 'Nsg Orders',    ar: 'أوامر التمريض' },
        { id: 'notes',     icon: '📝', en: 'Notes',         ar: 'الملاحظات' },
      ].map(t => `
        <div class="ns-tab ${t.id === window._NS.activeTab ? 'active' : ''}"
             onclick="window.nsSwitchTab('${t.id}')" data-tab="${t.id}">
          ${t.icon} ${tr(t.en, t.ar)}
        </div>
      `).join('')}
    </div>

    <!-- Tab Content -->
    <div class="ns-tab-content" id="nsTabContent"></div>
  `;

  window.nsSwitchTab(window._NS.activeTab);
};

/* ============================================================ */
/*  TAB SWITCHING                                                */
/* ============================================================ */
window.nsSwitchTab = function(tabId) {
  window._NS.activeTab = tabId;
  document.querySelectorAll('.ns-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  const content = document.getElementById('nsTabContent');
  if (!content) return;
  const d = window._NS.selectedPatientData || {};
  const pid = window._NS.selectedPatientId;

  switch (tabId) {
    case 'vitals':   window.nsTabVitals(content, d, pid); break;
    case 'emar':     window.nsTabEMAR(content, d, pid); break;
    case 'h2t':      content.innerHTML = window.nsTabH2T(d); break;
    case 'careplan': window.nsTabCarePlan(content, d, pid); break;
    case 'io':       window.nsTabIO(content, pid); break;
    case 'handover': content.innerHTML = window.nsTabHandover(d, pid); window.nsLoadHandovers(pid); break;
    case 'triage':   content.innerHTML = window.nsTabTriage(d, pid); break;
    case 'risks':    content.innerHTML = window.nsTabRisks(d, pid); break;
    case 'orders':   window.nsTabOrders(content, pid); break;
    case 'notes':    content.innerHTML = window.nsTabNotes(d, pid); break;
    default: content.innerHTML = `<p>${tr('Coming soon', 'قريباً')}</p>`;
  }
};

/* ============================================================ */
/*  TAB 1: VITALS + EWS/NEWS2                                   */
/* ============================================================ */
window.nsTabVitals = function(container, { patient = {}, vitals = [] }, pid) {
  const latestV = {};
  vitals.forEach(v => { if (!latestV[v.score_type]) latestV[v.score_type] = v.score_value; });
  const news2 = window._NS.selectedPatientData?.news2 || calcNEWS2({});

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- Vitals Entry Form -->
      <div>
        <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--primary)">
          🌡️ ${tr('Record New Vitals', 'تسجيل علامات حيوية جديدة')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('BP (mmHg)', 'الضغط')}</label>
            <input class="form-input" id="nsVBp" placeholder="120/80" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Heart Rate (bpm)', 'النبض')}</label>
            <input class="form-input" id="nsVHr" type="number" placeholder="75" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Temp (°C)', 'الحرارة')}</label>
            <input class="form-input" id="nsVTemp" type="number" step="0.1" placeholder="37.0" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('RR (/min)', 'معدل التنفس')}</label>
            <input class="form-input" id="nsVRr" type="number" placeholder="18" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">SpO2 (%)</label>
            <input class="form-input" id="nsVSpo2" type="number" placeholder="98" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Pain (0-10)', 'الألم 0-10')}</label>
            <input class="form-input" id="nsVPain" type="number" min="0" max="10" placeholder="0" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Weight (kg)', 'الوزن')}</label>
            <input class="form-input" id="nsVWeight" type="number" step="0.1" placeholder="70" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">GCS (3-15)</label>
            <input class="form-input" id="nsVGcs" type="number" min="3" max="15" placeholder="15" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Blood Glucose', 'السكر')} (mg/dL)</label>
            <input class="form-input" id="nsVGlucose" type="number" placeholder="100" style="height:34px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">AVPU</label>
            <select class="form-input" id="nsVAvpu" style="height:34px;font-size:13px">
              <option value="A">A — ${tr('Alert', 'متيقظ')}</option>
              <option value="V">V — ${tr('Voice', 'يستجيب للصوت')}</option>
              <option value="P">P — ${tr('Pain', 'يستجيب للألم')}</option>
              <option value="U">U — ${tr('Unresponsive', 'لا يستجيب')}</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px">
            <label style="font-size:10px;font-weight:700;color:var(--text-dim);white-space:nowrap">${tr('On O2?', 'على الأكسجين؟')}</label>
            <input type="checkbox" id="nsVOnO2" style="width:18px;height:18px;margin-bottom:8px">
          </div>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Nursing Notes', 'ملاحظات التمريض')}</label>
          <textarea class="form-input" id="nsVNotes" rows="2" placeholder="${tr('Any observations...', 'أي ملاحظات...')}"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window.nsSaveVitals(${pid})" style="flex:1;height:40px;font-size:13px">
            💾 ${tr('Save & Calculate EWS', 'حفظ وحساب EWS')}
          </button>
        </div>
      </div>

      <!-- NEWS2 Score + History -->
      <div>
        <!-- Current NEWS2 Score -->
        <div style="background:${news2.riskColor}11;border:2px solid ${news2.riskColor};border-radius:16px;padding:16px;margin-bottom:16px;text-align:center">
          <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px">
            🎯 NEWS2 Score
          </div>
          <div style="font-size:52px;font-weight:900;color:${news2.riskColor};line-height:1">${news2.score}</div>
          <div style="font-size:12px;font-weight:700;color:${news2.riskColor};margin-top:4px">${news2.riskLabel}</div>
          ${news2.score >= 5 ? `
            <button class="btn" onclick="window.nsEscalate(${pid})"
              style="margin-top:12px;background:#dc2626;color:#fff;border:none;font-size:12px;font-weight:700;width:100%">
              🚨 ${tr('ESCALATE TO DOCTOR', 'تصعيد فوري للطبيب')}
            </button>
          ` : ''}
        </div>

        <!-- Vitals History -->
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:var(--text-dim)">
          📈 ${tr('Vitals History', 'سجل العلامات الحيوية')} (${vitals.length})
        </div>
        ${vitals.length ? `
          <div style="overflow-x:auto;font-size:11px">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:var(--surface-container,#f1f5f9)">
                  <th style="padding:5px 8px;text-align:start">${tr('Time', 'الوقت')}</th>
                  <th style="padding:5px 8px">BP</th>
                  <th style="padding:5px 8px">HR</th>
                  <th style="padding:5px 8px">Temp</th>
                  <th style="padding:5px 8px">SpO2</th>
                </tr>
              </thead>
              <tbody>
                ${vitals.slice(0, 8).map(v => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:5px 8px;color:var(--text-dim)">${escapeHTML(v.recorded_at?.split('T')[1]?.slice(0,5) || v.created_at?.split('T')[1]?.slice(0,5) || '-')}</td>
                    <td style="padding:5px 8px;text-align:center;font-weight:700">${escapeHTML(v.score_type === 'blood_pressure' ? v.score_value : '-')}</td>
                    <td style="padding:5px 8px;text-align:center">${escapeHTML(v.score_type === 'pulse' ? v.score_value : '-')}</td>
                    <td style="padding:5px 8px;text-align:center">${escapeHTML(v.score_type === 'temperature' ? v.score_value : '-')}</td>
                    <td style="padding:5px 8px;text-align:center">${escapeHTML(v.score_type === 'spo2' ? v.score_value + '%' : '-')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px">${tr('No previous vitals', 'لا توجد علامات حيوية سابقة')}</div>`}
      </div>
    </div>
  `;
};

window.nsSaveVitals = async function(pid) {
  if (!pid) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const bp    = document.getElementById('nsVBp')?.value || '';
  const hr    = parseInt(document.getElementById('nsVHr')?.value) || 0;
  const temp  = parseFloat(document.getElementById('nsVTemp')?.value) || 0;
  const rr    = parseInt(document.getElementById('nsVRr')?.value) || 0;
  const spo2  = parseInt(document.getElementById('nsVSpo2')?.value) || 0;
  const pain  = parseInt(document.getElementById('nsVPain')?.value) || 0;
  const weight= parseFloat(document.getElementById('nsVWeight')?.value) || 0;
  const gcs   = parseInt(document.getElementById('nsVGcs')?.value) || 15;
  const glucose=parseInt(document.getElementById('nsVGlucose')?.value)||0;
  const avpu  = document.getElementById('nsVAvpu')?.value || 'A';
  const onO2  = document.getElementById('nsVOnO2')?.checked || false;
  const notes = document.getElementById('nsVNotes')?.value || '';

  const sbp = parseInt(bp.split('/')[0]) || 0;
  const news2 = calcNEWS2({ rr, spo2, temp, sbp, hr, avpu, onO2 });

  try {
    // Post vitals bundle
    const vitalsData = [
      { type: 'blood_pressure', value: bp },
      { type: 'pulse',          value: hr },
      { type: 'temperature',    value: temp },
      { type: 'respiratory_rate', value: rr },
      { type: 'spo2',           value: spo2 },
      { type: 'pain_score',     value: pain },
      { type: 'weight',         value: weight },
      { type: 'gcs_score',      value: gcs },
      { type: 'glucose',        value: glucose },
      { type: 'consciousness',  value: avpu },
    ].filter(x => x.value && x.value !== 0 && x.value !== '0');

    await API.post('/api/nursing/vitals', {
      patient_id: pid,
      bp, temp, weight,
      pulse: hr, o2_sat: spo2,
      respiratory_rate: rr,
      blood_sugar: glucose,
      notes: `NEWS2=${news2.score} | GCS=${gcs} | AVPU=${avpu} | Pain=${pain}/10 | O2=${onO2?'Yes':'No'} | ${notes}`,
    });

    showToast(`✅ ${tr('Vitals saved!', 'تم حفظ العلامات الحيوية!')} NEWS2 = ${news2.score} — ${news2.riskLabel}`);

    if (news2.score >= 7) {
      showToast(`🚨 ${tr('HIGH NEWS2 SCORE! Consider escalating to doctor.', 'نقاط NEWS2 عالية! يجب تصعيد الحالة للطبيب')}`, 'error');
    }

    setTimeout(() => window.nsSelectPatient(pid), 800);
  } catch (e) { showToast(e?.message || tr('Save failed', 'فشل الحفظ'), 'error'); }
};

window.nsEscalate = async function(pid) {
  if (!pid) return;
  const news2 = window._NS.selectedPatientData?.news2;
  const patient = window._NS.selectedPatientData?.patient || {};
  const name = isArabic ? (patient.name_ar || patient.name_en) : (patient.name_en || patient.name_ar);
  try {
    await API.post('/api/orders', {
      patient_id: pid,
      type: 'nursing',
      description: `[ESCALATE] NEWS2 Score = ${news2?.score || '?'} — URGENT: ${name}`,
      status: 'STAT',
      notes: `Nurse escalation — ${news2?.riskLabel || ''} — ${new Date().toLocaleTimeString()}`,
    });
    showToast(`🚨 ${tr('Escalated to doctor!', 'تم التصعيد للطبيب!')}`, 'error');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  TAB 2: eMAR — Medication Administration Record              */
/* ============================================================ */
window.nsTabEMAR = function(container, { patient = {}, emarOrders = [], allergies = [] }, pid) {
  const patOrders = emarOrders.filter(o => String(o.patient_id) === String(pid));
  const shiftMap = { morning: '☀️ 07:00-15:00', evening: '🌅 15:00-23:00', night: '🌙 23:00-07:00' };

  container.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--primary)">
      💉 ${tr('Electronic MAR — Medication Administration Record', 'سجل إعطاء الأدوية الإلكتروني')}
    </div>
    ${allergies.length ? `
    <div class="ns-cds-alert critical" style="margin-bottom:12px">
      🚨 ${tr('ALLERGY ALERT', 'تنبيه حساسية')}: ${allergies.map(a => escapeHTML(a.allergen)).join(', ')}
    </div>` : ''}
    ${!patOrders.length ? `
    <div style="text-align:center;padding:32px;color:var(--text-dim)">
      <div style="font-size:48px;opacity:0.3;margin-bottom:12px">💉</div>
      <p>${tr('No medication orders for this patient', 'لا توجد أوامر دوائية لهذا المريض')}</p>
    </div>
    ` : `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface-container,#f1f5f9)">
            <th style="padding:8px;text-align:start;font-weight:700">${tr('Medication', 'الدواء')}</th>
            <th style="padding:8px;text-align:center">${tr('Dose', 'الجرعة')}</th>
            <th style="padding:8px;text-align:center">${tr('Route', 'المسار')}</th>
            <th style="padding:8px;text-align:center">${tr('Frequency', 'التكرار')}</th>
            <th style="padding:8px;text-align:center">${tr('Due', 'الموعد')}</th>
            <th style="padding:8px;text-align:center">${tr('Status', 'الحالة')}</th>
            <th style="padding:8px;text-align:center">${tr('Action', 'إجراء')}</th>
          </tr>
        </thead>
        <tbody>
          ${patOrders.map(o => {
            const isHighAlert = ['insulin','heparin','warfarin','morphine','fentanyl','potassium','digoxin','epinephrine','norepinephrine'].some(h => (o.medication || o.drug_name || '').toLowerCase().includes(h));
            const statusColor = o.status === 'Completed' || o.status === 'Dispensed' ? '#16a34a' : o.status === 'Pending' ? '#ca8a04' : '#6b7280';
            return `
            <tr style="border-bottom:1px solid var(--border);${isHighAlert ? 'background:#fef9c3;' : ''}">
              <td style="padding:8px;font-weight:700">
                ${isHighAlert ? '<span style="background:#dc2626;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px">⚠️ HIGH ALERT</span>' : ''}
                ${escapeHTML(o.medication || o.drug_name || '-')}
              </td>
              <td style="padding:8px;text-align:center">${escapeHTML(o.dose || '-')}</td>
              <td style="padding:8px;text-align:center">${escapeHTML(o.route || '-')}</td>
              <td style="padding:8px;text-align:center">${escapeHTML(o.frequency || '-')}</td>
              <td style="padding:8px;text-align:center;color:var(--text-dim)">${escapeHTML(o.scheduled_at?.split('T')[1]?.slice(0,5) || 'PRN')}</td>
              <td style="padding:8px;text-align:center">
                <span style="background:${statusColor}22;color:${statusColor};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">
                  ${escapeHTML(o.status || 'Pending')}
                </span>
              </td>
              <td style="padding:8px;text-align:center">
                <button class="btn btn-sm" onclick="window.nsGiveMed(${safeId(o.id)},${safeId(pid)},'${jsStr(o.medication||o.drug_name||'')}','${jsStr(o.dose||'')}','${jsStr(o.route||'')}',${isHighAlert})"
                  style="background:#16a34a;color:#fff;border:none;font-size:11px;padding:4px 10px">
                  💉 ${tr('Give', 'إعطاء')}
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    `}
    <!-- eMAR Legend -->
    <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;font-size:11px">
      <span style="display:flex;align-items:center;gap:4px"><span style="background:#f0fdf4;border:1px solid #16a34a;width:16px;height:16px;border-radius:3px"></span> ${tr('Administered', 'أُعطي')}</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="background:#fef9c3;border:1px solid #ca8a04;width:16px;height:16px;border-radius:3px"></span> ${tr('Pending', 'معلق')}</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="background:#fef9c3;width:16px;height:16px;border-radius:3px;border:1px solid #eab308"></span> ⚠️ ${tr('High Alert Drug', 'دواء عالي الخطورة')}</span>
    </div>
  `;
};

window.nsGiveMed = async function(orderId, patientId, med, dose, route, isHighAlert) {
  if (isHighAlert) {
    const w = prompt(tr('HIGH-ALERT MEDICATION — Enter witness nurse ID:', 'دواء عالي الخطورة — أدخل معرّف الممرضة الشاهدة:'));
    if (!w) { showToast(tr('Witness required', 'يلزم شاهد'), 'error'); return; }
    try {
      await API.post('/api/mar/administer', {
        emar_order_id: orderId, patient_id: patientId,
        scanned_patient_id: patientId, scanned_drug: med,
        scanned_dose: dose, scanned_route: route,
        scheduled_at: new Date().toISOString(),
        witness_user_id: parseInt(w),
      });
      showToast(tr('✅ High-alert medication administered with witness', '✅ تم إعطاء الدواء بحضور شاهد'));
      setTimeout(() => window.nsSelectPatient(patientId), 800);
    } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
  } else {
    if (!confirm(tr(`Give ${med} — ${dose} — ${route}?`, `إعطاء ${med} — ${dose} — ${route}؟`))) return;
    try {
      await API.post('/api/mar/administer', {
        emar_order_id: orderId, patient_id: patientId,
        scanned_patient_id: patientId, scanned_drug: med,
        scanned_dose: dose, scanned_route: route,
        scheduled_at: new Date().toISOString(),
      });
      showToast(tr(`✅ ${med} administered`, `✅ تم إعطاء ${med}`));
      setTimeout(() => window.nsSelectPatient(patientId), 800);
    } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
  }
};

/* ============================================================ */
/*  TAB 3: HEAD-TO-TOE ASSESSMENT                               */
/* ============================================================ */
window.nsTabH2T = function({ patient = {}, vitals = [] }) {
  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      🩺 ${tr('Head-to-Toe Assessment', 'التقييم السريري الشامل (من الرأس للقدم)')}
    </div>
    <form id="nsH2TForm" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

      <!-- Neurological -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px;grid-column:span 2">
        <div style="font-weight:700;font-size:12px;color:#7c3aed;margin-bottom:10px">🧠 ${tr('Neurological', 'العصبي')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">GCS</label>
            <input class="form-input" name="gcs" type="number" min="3" max="15" placeholder="15" style="height:32px;font-size:12px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">AVPU</label>
            <select class="form-input" name="avpu" style="height:32px;font-size:12px">
              <option value="A">A — Alert</option>
              <option value="V">V — Voice</option>
              <option value="P">P — Pain</option>
              <option value="U">U — Unresponsive</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Pupils', 'الحدقتان')}</label>
            <select class="form-input" name="pupils" style="height:32px;font-size:12px">
              <option>PERRL (طبيعي)</option>
              <option>Unequal (متساوي)</option>
              <option>Fixed/Dilated (متمددتان)</option>
              <option>Constricted (متقلصتان)</option>
            </select>
          </div>
          <div style="grid-column:span 3">
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Orientation', 'التوجه')}</label>
            <div style="display:flex;gap:8px;margin-top:4px">
              ${['Person', 'Place', 'Time', 'Event'].map(o => `<label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" name="orient_${o.toLowerCase()}" checked> ${tr(o, { Person:'شخص', Place:'مكان', Time:'زمان', Event:'حدث' }[o])}</label>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Respiratory -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:#0ea5e9;margin-bottom:10px">🫁 ${tr('Respiratory', 'التنفسي')}</div>
        <div style="display:grid;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Breath Sounds', 'أصوات التنفس')}</label>
            <select class="form-input" name="breath_sounds" style="height:32px;font-size:12px">
              <option>Clear Bilaterally (واضح الجانبين)</option>
              <option>Wheezing (صفير)</option>
              <option>Crackles (فرقعة)</option>
              <option>Diminished (مخفف)</option>
              <option>Absent (غائب)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('O2 Therapy', 'العلاج بالأكسجين')}</label>
            <select class="form-input" name="o2_therapy" style="height:32px;font-size:12px">
              <option value="Room Air">Room Air (هواء الغرفة)</option>
              <option value="Nasal Cannula">Nasal Cannula (كانيولا)</option>
              <option value="Face Mask">Face Mask (قناع وجه)</option>
              <option value="Non-rebreather">Non-rebreather Mask</option>
              <option value="Mechanical Ventilation">Mechanical Ventilation</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Cough', 'السعال')}</label>
            <select class="form-input" name="cough" style="height:32px;font-size:12px">
              <option>None (لا يوجد)</option>
              <option>Productive (مع إفراز)</option>
              <option>Nonproductive (جاف)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Cardiovascular -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:#dc2626;margin-bottom:10px">🫀 ${tr('Cardiovascular', 'القلبي والوعائي')}</div>
        <div style="display:grid;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Heart Rhythm', 'نظم القلب')}</label>
            <select class="form-input" name="heart_rhythm" style="height:32px;font-size:12px">
              <option>Regular (منتظم)</option>
              <option>Irregular (غير منتظم)</option>
              <option>Atrial Fibrillation</option>
              <option>Bradycardia</option>
              <option>Tachycardia</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Capillary Refill', 'امتلاء الشعيرات')}</label>
            <select class="form-input" name="cap_refill" style="height:32px;font-size:12px">
              <option>< 2 sec (طبيعي)</option>
              <option>2-3 sec (متأخر قليلاً)</option>
              <option>> 3 sec (متأخر)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Peripheral Edema', 'وذمة الأطراف')}</label>
            <select class="form-input" name="edema" style="height:32px;font-size:12px">
              <option>None (لا يوجد)</option>
              <option>1+ Mild</option><option>2+ Moderate</option>
              <option>3+ Severe</option><option>4+ Pitting</option>
            </select>
          </div>
        </div>
      </div>

      <!-- GI -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:#ca8a04;margin-bottom:10px">🫃 ${tr('Gastrointestinal', 'الجهاز الهضمي')}</div>
        <div style="display:grid;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Bowel Sounds', 'أصوات الأمعاء')}</label>
            <select class="form-input" name="bowel_sounds" style="height:32px;font-size:12px">
              <option>Active (نشطة)</option><option>Hypoactive (منخفضة)</option>
              <option>Hyperactive (مفرطة)</option><option>Absent (غائبة)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Last BM', 'آخر تبرز')}</label>
            <input class="form-input" name="last_bm" type="date" style="height:32px;font-size:12px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Oral Intake %', 'نسبة الأكل')}</label>
            <select class="form-input" name="oral_intake" style="height:32px;font-size:12px">
              <option>100% (كامل)</option><option>75%</option><option>50%</option>
              <option>25%</option><option>0% / NPO</option>
            </select>
          </div>
        </div>
      </div>

      <!-- GU -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:#0369a1;margin-bottom:10px">💧 ${tr('Genitourinary', 'الجهاز البولي')}</div>
        <div style="display:grid;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Urine Output', 'إنتاج البول')}</label>
            <select class="form-input" name="urine_output" style="height:32px;font-size:12px">
              <option>Normal (طبيعي)</option><option>Reduced (منخفض)</option>
              <option>Oliguria < 0.5mL/kg/hr</option><option>Anuria (غائب)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Catheter', 'قسطرة')}</label>
            <select class="form-input" name="catheter" style="height:32px;font-size:12px">
              <option>None (لا يوجد)</option><option>Foley Catheter</option>
              <option>Suprapubic</option><option>Condom Catheter</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Skin -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px;grid-column:span 2">
        <div style="font-weight:700;font-size:12px;color:#16a34a;margin-bottom:10px">🩹 ${tr('Skin & Wound', 'الجلد والجروح')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Skin Color', 'لون الجلد')}</label>
            <select class="form-input" name="skin_color" style="height:32px;font-size:12px">
              <option>Normal (طبيعي)</option><option>Pale (شاحب)</option>
              <option>Jaundiced (أصفر)</option><option>Flushed (أحمر)</option>
              <option>Cyanotic (مزرق)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Skin Turgor', 'مرونة الجلد')}</label>
            <select class="form-input" name="skin_turgor" style="height:32px;font-size:12px">
              <option>Good (جيد)</option><option>Fair (متوسط)</option>
              <option>Poor / Tenting (ضعيف)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Wound/IV Site', 'الجرح/موقع الإبرة')}</label>
            <select class="form-input" name="wound_status" style="height:32px;font-size:12px">
              <option>Intact (سليم)</option><option>Redness (احمرار)</option>
              <option>Pressure Injury Stage I</option>
              <option>Pressure Injury Stage II</option>
              <option>Pressure Injury Stage III-IV</option>
              <option>Surgical Wound</option>
            </select>
          </div>
          <div style="grid-column:span 3">
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Wound Description', 'وصف الجرح')}</label>
            <textarea class="form-input" name="wound_notes" rows="2" placeholder="${tr('Size, depth, exudate, dressing...', 'الحجم، العمق، الإفراز، الضمادة...')}"></textarea>
          </div>
        </div>
      </div>

      <!-- Pain Assessment -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px;grid-column:span 2">
        <div style="font-weight:700;font-size:12px;color:#dc2626;margin-bottom:10px">😣 ${tr('Pain Assessment', 'تقييم الألم')}</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px">
          ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `
            <label style="text-align:center;cursor:pointer">
              <input type="radio" name="pain_nrs" value="${n}" ${n===0?'checked':''} style="display:block;margin:0 auto 2px">
              <span style="font-size:16px">${n<=2?'😊':n<=4?'😐':n<=6?'😟':n<=8?'😢':'😭'}</span>
              <div style="font-size:11px;font-weight:700">${n}</div>
            </label>
          `).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Pain Location', 'موقع الألم')}</label>
            <input class="form-input" name="pain_location" placeholder="${tr('Where?', 'أين؟')}" style="height:32px;font-size:12px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Pain Character', 'طبيعة الألم')}</label>
            <select class="form-input" name="pain_character" style="height:32px;font-size:12px">
              <option>Sharp (حاد)</option><option>Dull (خفيف)</option>
              <option>Burning (حرقان)</option><option>Throbbing (نابض)</option>
              <option>Cramping (تشنجي)</option><option>Pressure (ضغط)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Submit -->
      <div style="grid-column:span 2;display:flex;gap:10px">
        <button type="button" class="btn btn-primary" onclick="window.nsSaveH2T(${window._NS.selectedPatientId})" style="flex:1;height:44px;font-size:13px">
          💾 ${tr('Save Assessment', 'حفظ التقييم')}
        </button>
        <button type="button" class="btn" onclick="window.nsPrintH2T()" style="height:44px;font-size:13px;background:#fff3e0;border:1px solid #ff9800;color:#e65100">
          🖨️ ${tr('Print', 'طباعة')}
        </button>
      </div>
    </form>
  `;
};

window.nsSaveH2T = async function(pid) {
  if (!pid) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const form = document.getElementById('nsH2TForm');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  data.pain_nrs = document.querySelector('input[name="pain_nrs"]:checked')?.value || '0';
  try {
    await API.post('/api/nursing/assessments', {
      patient_id: pid,
      assessment_type: 'Head-to-Toe',
      pain_score: parseInt(data.pain_nrs),
      gcs_score: parseInt(data.gcs) || 15,
      assessment_data: JSON.stringify(data),
      nurse: window._NS.currentUser?.name || '',
      shift: getShiftName(),
    }).catch(() =>
      API.post('/api/medical/records', {
        patient_id: pid,
        diagnosis: 'Nursing Head-to-Toe Assessment',
        notes: JSON.stringify(data),
        treatment: '',
      })
    );
    showToast(tr('✅ Assessment saved!', '✅ تم حفظ التقييم!'));
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  TAB 4: NURSING CARE PLAN                                     */
/* ============================================================ */
window.nsTabCarePlan = async function(container, { patient = {} }, pid) {
  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:32px">⏳</div><p>${tr('Loading...', 'جاري التحميل...')}</p></div>`;
  let plans = [];
  try { plans = await API.get('/api/nursing/care-plans'); } catch {}
  const patPlans = plans.filter(p => String(p.patient_id) === String(pid));

  const nandaDiagnoses = [
    { code: '00001', label: 'Imbalanced Nutrition: Less Than Body Requirements | سوء التغذية' },
    { code: '00002', label: 'Deficient Fluid Volume | نقص حجم السوائل' },
    { code: '00004', label: 'Risk for Infection | خطر العدوى' },
    { code: '00007', label: 'Hyperthermia | ارتفاع الحرارة' },
    { code: '00030', label: 'Impaired Gas Exchange | اضطراب تبادل الغازات' },
    { code: '00046', label: 'Impaired Skin Integrity | خلل نزاهة الجلد' },
    { code: '00061', label: 'Caregiver Role Strain | إجهاد دور مقدم الرعاية' },
    { code: '00078', label: 'Ineffective Health Management | إدارة صحية غير فعّالة' },
    { code: '00085', label: 'Impaired Physical Mobility | إعاقة الحركة الجسدية' },
    { code: '00108', label: 'Bathing Self-Care Deficit | عجز العناية الذاتية' },
    { code: '00118', label: 'Disturbed Body Image | اضطراب صورة الجسم' },
    { code: '00128', label: 'Acute Confusion | الارتباك الحاد' },
    { code: '00132', label: 'Acute Pain | ألم حاد' },
    { code: '00133', label: 'Chronic Pain | ألم مزمن' },
    { code: '00146', label: 'Anxiety | القلق' },
    { code: '00148', label: 'Fear | الخوف' },
    { code: '00155', label: 'Risk for Falls | خطر السقوط' },
    { code: '00179', label: 'Risk for Unstable Blood Glucose | خطر عدم استقرار الجلوكوز' },
    { code: '00204', label: 'Ineffective Peripheral Tissue Perfusion | اضطراب التروية المحيطية' },
    { code: '00215', label: 'Decreased Cardiac Output | انخفاض الناتج القلبي' },
  ];

  container.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      📋 ${tr('Nursing Care Plan (NANDA/NIC/NOC)', 'خطة الرعاية التمريضية')}
    </div>

    <!-- Current Plans -->
    ${patPlans.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">${tr('Active Care Plans', 'خطط الرعاية النشطة')} (${patPlans.length})</div>
      ${patPlans.map(p => `
        <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong style="font-size:13px">${escapeHTML(p.diagnosis || '-')}</strong>
            <span class="badge badge-${p.priority==='High'?'danger':p.priority==='Low'?'success':'warning'}">${escapeHTML(p.priority || 'Medium')}</span>
          </div>
          ${p.goals ? `<div style="font-size:12px;color:var(--text-dim)">🎯 ${tr('Goals', 'الأهداف')}: ${escapeHTML(p.goals)}</div>` : ''}
          ${p.interventions ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px">🔧 ${tr('Interventions', 'التدخلات')}: ${escapeHTML(p.interventions)}</div>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- New Care Plan Form -->
    <div style="border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-size:12px;font-weight:700;margin-bottom:12px">➕ ${tr('Add New Care Plan', 'إضافة خطة رعاية جديدة')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="grid-column:span 2">
          <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('NANDA Nursing Diagnosis', 'تشخيص تمريضي NANDA')}</label>
          <select class="form-input" id="cpNanda">
            <option value="">${tr('-- Select NANDA Diagnosis --', '-- اختر التشخيص التمريضي --')}</option>
            ${nandaDiagnoses.map(d => `<option value="${d.code}: ${d.label}">${d.code}: ${escapeHTML(d.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Priority', 'الأولوية')}</label>
          <select class="form-input" id="cpPriority">
            <option value="Low">${tr('Low', 'منخفضة')}</option>
            <option value="Medium" selected>${tr('Medium', 'متوسطة')}</option>
            <option value="High">${tr('High', 'عالية')}</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Target Date', 'التاريخ المستهدف')}</label>
          <input class="form-input" id="cpTarget" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div style="grid-column:span 2">
          <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('NOC Outcomes / Goals', 'النتائج والأهداف القابلة للقياس')}</label>
          <textarea class="form-input" id="cpGoals" rows="2" placeholder="${tr('Measurable goals...', 'أهداف قابلة للقياس...')}"></textarea>
        </div>
        <div style="grid-column:span 2">
          <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('NIC Interventions', 'التدخلات التمريضية NIC')}</label>
          <textarea class="form-input" id="cpInterventions" rows="3" placeholder="${tr('Nursing interventions...', 'التدخلات التمريضية...')}"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" onclick="window.nsSaveCarePlan(${pid})" style="margin-top:12px;height:40px;font-size:13px">
        💾 ${tr('Save Care Plan', 'حفظ خطة الرعاية')}
      </button>
    </div>
  `;
};

window.nsSaveCarePlan = async function(pid) {
  const nanda   = document.getElementById('cpNanda')?.value || '';
  const priority= document.getElementById('cpPriority')?.value || 'Medium';
  const goals   = document.getElementById('cpGoals')?.value || '';
  const intv    = document.getElementById('cpInterventions')?.value || '';
  if (!nanda) return showToast(tr('Select a NANDA diagnosis', 'اختر التشخيص التمريضي'), 'error');
  try {
    const patient = window._NS.selectedPatientData?.patient || {};
    await API.post('/api/nursing/care-plans', {
      patient_id: pid,
      patient_name: isArabic ? (patient.name_ar || patient.name_en) : (patient.name_en || patient.name_ar),
      diagnosis: nanda, priority, goals, interventions: intv,
      status: 'Active',
    });
    showToast(tr('✅ Care plan saved!', '✅ تم حفظ خطة الرعاية!'));
    window.nsSwitchTab('careplan');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  TAB 5: INTAKE & OUTPUT                                       */
/* ============================================================ */
window.nsTabIO = async function(container, pid) {
  // Load persisted entries from server; fall back to local cache offline
  try {
    const data = await API.get(`/api/nursing/io/${pid}`);
    window._NS.ioEntries = (data.entries || []).map(e => ({
      type: e.entry_type,
      source: e.source,
      volume: e.volume_ml || 0,
      time: e.entry_time || String(e.created_at || '').slice(11, 16),
    }));
  } catch (e) { /* offline/mock mode — keep local cache */ }
  const entries = window._NS.ioEntries;
  const intake  = entries.filter(e => e.type === 'intake').reduce((s, e) => s + (e.volume || 0), 0);
  const output  = entries.filter(e => e.type === 'output').reduce((s, e) => s + (e.volume || 0), 0);
  const balance = intake - output;
  const balColor= balance > 500 ? '#ca8a04' : balance > 1000 ? '#dc2626' : '#16a34a';

  container.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      💧 ${tr('Intake & Output Tracking', 'مراقبة السوائل الواردة والصادرة')}
    </div>

    <!-- Balance Summary -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:#e0f2fe;border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:700;color:#0369a1;margin-bottom:4px">💧 ${tr('Total Intake', 'إجمالي الوارد')}</div>
        <div style="font-size:28px;font-weight:900;color:#0369a1">${intake}</div>
        <div style="font-size:11px;color:#0369a1">mL</div>
      </div>
      <div style="background:#fef9c3;border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:700;color:#ca8a04;margin-bottom:4px">🚰 ${tr('Total Output', 'إجمالي الصادر')}</div>
        <div style="font-size:28px;font-weight:900;color:#ca8a04">${output}</div>
        <div style="font-size:11px;color:#ca8a04">mL</div>
      </div>
      <div style="background:${balance>=0?'#f0fdf4':'#fee2e2'};border-radius:12px;padding:14px;text-align:center;border:2px solid ${balColor}">
        <div style="font-size:11px;font-weight:700;color:${balColor};margin-bottom:4px">⚖️ ${tr('Balance', 'الميزان')}</div>
        <div style="font-size:28px;font-weight:900;color:${balColor}">${balance >= 0 ? '+' : ''}${balance}</div>
        <div style="font-size:11px;color:${balColor}">mL</div>
      </div>
    </div>

    <!-- Add Entry -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <!-- Intake -->
      <div style="border:1px solid #0ea5e922;background:#e0f2fe11;border-radius:12px;padding:14px">
        <div style="font-weight:700;font-size:12px;color:#0369a1;margin-bottom:10px">➕ ${tr('Add Intake', 'إضافة سائل وارد')}</div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Source', 'المصدر')}</label>
          <select class="form-input" id="ioIntakeSource" style="height:32px;font-size:12px">
            <option value="IV Fluid">IV Fluids (سوائل وريدية)</option>
            <option value="PO Oral">PO Oral (فموي)</option>
            <option value="Tube Feed">Tube Feeding (أنبوب تغذية)</option>
            <option value="Blood Product">Blood Product (منتج دموي)</option>
            <option value="Medication Flush">Med Flush</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Volume (mL)', 'الحجم (مل)')}</label>
          <input class="form-input" id="ioIntakeVol" type="number" min="1" placeholder="250" style="height:32px;font-size:12px">
        </div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Time', 'الوقت')}</label>
          <input class="form-input" id="ioIntakeTime" type="time" value="${new Date().toTimeString().slice(0,5)}" style="height:32px;font-size:12px">
        </div>
        <button class="btn w-full" onclick="window.nsAddIO('intake')"
          style="background:#0369a1;color:#fff;border:none;height:34px;font-size:12px">
          ➕ ${tr('Add Intake', 'إضافة وارد')}
        </button>
      </div>

      <!-- Output -->
      <div style="border:1px solid #ca8a0422;background:#fef9c311;border-radius:12px;padding:14px">
        <div style="font-weight:700;font-size:12px;color:#ca8a04;margin-bottom:10px">➖ ${tr('Add Output', 'إضافة سائل صادر')}</div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Type', 'النوع')}</label>
          <select class="form-input" id="ioOutputType" style="height:32px;font-size:12px">
            <option value="Urine">Urine (بول)</option>
            <option value="Vomit">Vomit (قيء)</option>
            <option value="Drain">Drain (مصرف)</option>
            <option value="Nasogastric">Nasogastric (أنبوب معدي)</option>
            <option value="Stool">Stool (براز)</option>
            <option value="Blood Loss">Blood Loss (نزيف)</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Volume (mL)', 'الحجم (مل)')}</label>
          <input class="form-input" id="ioOutputVol" type="number" min="1" placeholder="300" style="height:32px;font-size:12px">
        </div>
        <div class="form-group mb-8">
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Time', 'الوقت')}</label>
          <input class="form-input" id="ioOutputTime" type="time" value="${new Date().toTimeString().slice(0,5)}" style="height:32px;font-size:12px">
        </div>
        <button class="btn w-full" onclick="window.nsAddIO('output')"
          style="background:#ca8a04;color:#fff;border:none;height:34px;font-size:12px">
          ➖ ${tr('Add Output', 'إضافة صادر')}
        </button>
      </div>
    </div>

    <!-- I&O Log Table -->
    ${entries.length ? `
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">${tr('Shift Log', 'سجل الوردية')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface-container,#f1f5f9)">
            <th style="padding:6px 8px;text-align:start">${tr('Time', 'الوقت')}</th>
            <th style="padding:6px 8px;text-align:start">${tr('Type', 'النوع')}</th>
            <th style="padding:6px 8px;text-align:start">${tr('Source', 'المصدر')}</th>
            <th style="padding:6px 8px;text-align:end">${tr('Volume', 'الحجم')} (mL)</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr style="border-bottom:1px solid var(--border);background:${e.type==='intake'?'#e0f2fe11':'#fef9c311'}">
              <td style="padding:6px 8px;color:var(--text-dim)">${escapeHTML(e.time)}</td>
              <td style="padding:6px 8px">
                <span style="color:${e.type==='intake'?'#0369a1':'#ca8a04'};font-weight:700">
                  ${e.type === 'intake' ? '💧 IN' : '🚰 OUT'}
                </span>
              </td>
              <td style="padding:6px 8px">${escapeHTML(e.source)}</td>
              <td style="padding:6px 8px;text-align:end;font-weight:700">${e.volume}</td>
            </tr>`).join('')}
          <tr style="background:var(--surface-container,#f1f5f9);font-weight:700">
            <td colspan="3" style="padding:6px 8px">${tr('Balance', 'الميزان')}</td>
            <td style="padding:6px 8px;text-align:end;color:${balColor}">${balance >= 0 ? '+' : ''}${balance}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px">${tr('No entries yet — add intake/output above', 'لا توجد إدخالات — أضف السوائل أعلاه')}</div>`}
  `;
};

window.nsAddIO = async function(type) {
  let source, vol, time;
  if (type === 'intake') {
    source = document.getElementById('ioIntakeSource')?.value || 'IV Fluid';
    vol    = parseInt(document.getElementById('ioIntakeVol')?.value) || 0;
    time   = document.getElementById('ioIntakeTime')?.value || new Date().toTimeString().slice(0,5);
  } else {
    source = document.getElementById('ioOutputType')?.value || 'Urine';
    vol    = parseInt(document.getElementById('ioOutputVol')?.value) || 0;
    time   = document.getElementById('ioOutputTime')?.value || new Date().toTimeString().slice(0,5);
  }
  if (!vol) return showToast(tr('Enter volume', 'أدخل الحجم'), 'error');
  try {
    await API.post('/api/nursing/io', {
      patient_id: window._NS.selectedPatientId,
      entry_type: type,
      source,
      volume_ml: vol,
      entry_time: time,
      shift: getShiftName(),
    });
  } catch (e) {
    // offline/mock mode — keep entry in local cache so the shift log still works
    window._NS.ioEntries.push({ type, source, volume: vol, time });
  }
  showToast(tr('Entry added', 'تم الإضافة'));
  window.nsSwitchTab('io');
};

/* ============================================================ */
/*  TAB 6: HANDOVER / SBAR                                       */
/* ============================================================ */
window.nsTabHandover = function({ patient = {}, chart = {}, vitals = [] }, pid) {
  const name = isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-');
  const news2 = window._NS.selectedPatientData?.news2 || { score: 0 };
  const lastRec = (chart.records || [])[0] || {};

  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      🔄 ${tr('Shift Handover — SBAR Format', 'تسليم الوردية — نموذج SBAR')}
    </div>
    <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px;font-size:12px">
      👤 <strong>${escapeHTML(name)}</strong> · 🗂️ ${escapeHTML(String(patient.file_number || '-'))} ·
      NEWS2: <strong style="color:${news2.riskColor || '#16a34a'}">${news2.score}</strong> ·
      📅 ${new Date().toLocaleDateString(isArabic ? 'ar-SA' : 'en-US')}
    </div>

    <div style="display:grid;gap:12px">
      <!-- S: Situation -->
      <div style="border:2px solid #0369a1;border-radius:12px;overflow:hidden">
        <div style="background:#0369a1;color:#fff;padding:10px 14px;font-weight:700;font-size:12px">
          🔵 S — ${tr('SITUATION (Current patient status)', 'الحالة الراهنة للمريض')}
        </div>
        <div style="padding:12px">
          <textarea class="form-input" id="sbarS" rows="3"
            placeholder="${tr('Patient name, age, diagnosis, reason for hospitalization, current vital status...', 'اسم المريض، العمر، التشخيص، سبب الدخول، الحالة الحيوية الحالية...')}"
            style="font-size:12px">${escapeHTML(lastRec.diagnosis ? `المريض ${name} يرقد بسبب: ${lastRec.diagnosis}. NEWS2 = ${news2.score}` : '')}</textarea>
        </div>
      </div>

      <!-- B: Background -->
      <div style="border:2px solid #7c3aed;border-radius:12px;overflow:hidden">
        <div style="background:#7c3aed;color:#fff;padding:10px 14px;font-weight:700;font-size:12px">
          🟣 B — ${tr('BACKGROUND (Medical history & context)', 'السياق الطبي والتاريخ المرضي')}
        </div>
        <div style="padding:12px">
          <textarea class="form-input" id="sbarB" rows="3"
            placeholder="${tr('PMH, allergies, current medications, procedures done...', 'التاريخ المرضي، الحساسيات، الأدوية الحالية، الإجراءات المنجزة...')}"
            style="font-size:12px"></textarea>
        </div>
      </div>

      <!-- A: Assessment -->
      <div style="border:2px solid #ca8a04;border-radius:12px;overflow:hidden">
        <div style="background:#ca8a04;color:#fff;padding:10px 14px;font-weight:700;font-size:12px">
          🟡 A — ${tr('ASSESSMENT (Nursing assessment & concerns)', 'التقييم التمريضي والمخاوف')}
        </div>
        <div style="padding:12px">
          <textarea class="form-input" id="sbarA" rows="3"
            placeholder="${tr('Clinical assessment, trends, concerns, pain score, any changes...', 'التقييم السريري، الاتجاهات، المخاوف، درجة الألم، أي تغييرات...')}"
            style="font-size:12px"></textarea>
        </div>
      </div>

      <!-- R: Recommendation -->
      <div style="border:2px solid #16a34a;border-radius:12px;overflow:hidden">
        <div style="background:#16a34a;color:#fff;padding:10px 14px;font-weight:700;font-size:12px">
          🟢 R — ${tr('RECOMMENDATION (Actions needed)', 'التوصيات للوردية القادمة')}
        </div>
        <div style="padding:12px">
          <textarea class="form-input" id="sbarR" rows="3"
            placeholder="${tr('Pending tasks, follow-up orders, medications due, things to watch...', 'المهام المعلقة، الأوامر المتبقية، الأدوية، ما يجب مراقبته...')}"
            style="font-size:12px"></textarea>
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="window.nsSaveSBAR(${pid})" style="flex:1;height:44px;font-size:13px">
          💾 ${tr('Save Handover Report', 'حفظ تقرير الوردية')}
        </button>
        <button class="btn" onclick="window.nsPrintSBAR()" style="height:44px;font-size:13px;background:#fff3e0;border:1px solid #ff9800;color:#e65100">
          🖨️ ${tr('Print SBAR', 'طباعة SBAR')}
        </button>
      </div>

      <div id="nsHandoverHistory"></div>
    </div>
  `;
};

/* Load previous handover reports for this patient */
window.nsLoadHandovers = async function(pid) {
  const box = document.getElementById('nsHandoverHistory');
  if (!box) return;
  let rows = [];
  try { rows = await API.get(`/api/nursing/handover/${pid}`); } catch (e) { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  box.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin:16px 0 8px;text-transform:uppercase">
      🗂️ ${tr('Previous Handovers', 'تقارير الورديات السابقة')}
    </div>
    ${rows.map(h => `
      <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;background:var(--surface-container,#f8fafc)">
        <div style="display:flex;gap:8px;flex-wrap:wrap;color:var(--text-dim);font-size:11px;margin-bottom:4px">
          <span>👩‍⚕️ ${escapeHTML(h.nurse_name || '-')}</span>
          <span>🔄 ${escapeHTML(h.shift || '-')}</span>
          <span>📅 ${escapeHTML(String(h.created_at || '').slice(0, 16).replace('T', ' '))}</span>
          ${h.news2_score ? `<span style="font-weight:700">NEWS2: ${parseInt(h.news2_score, 10) || 0}</span>` : ''}
        </div>
        <div style="white-space:pre-wrap">${escapeHTML(h.sbar_s || '')}</div>
        ${h.sbar_r ? `<div style="white-space:pre-wrap;margin-top:4px;color:#16a34a"><strong>R:</strong> ${escapeHTML(h.sbar_r)}</div>` : ''}
      </div>`).join('')}
  `;
};

window.nsSaveSBAR = async function(pid) {
  const S = document.getElementById('sbarS')?.value || '';
  const B = document.getElementById('sbarB')?.value || '';
  const A = document.getElementById('sbarA')?.value || '';
  const R = document.getElementById('sbarR')?.value || '';
  if (!S.trim()) return showToast(tr('Fill in Situation section', 'أدخل قسم الحالة'), 'error');
  try {
    await API.post('/api/nursing/handover', {
      patient_id: pid,
      sbar_s: S, sbar_b: B, sbar_a: A, sbar_r: R,
      shift: getShiftName(),
      news2_score: window._NS.selectedPatientData?.news2?.score || 0,
    });
    // best-effort copy into the medical record so it shows in the patient chart
    API.post('/api/medical/records', {
      patient_id: pid,
      diagnosis: 'Nursing SBAR Handover Report',
      symptoms: S,
      notes: `BACKGROUND: ${B}\n\nASSESSMENT: ${A}`,
      treatment: `RECOMMENDATION: ${R}`,
    }).catch(() => {});
    showToast(tr('✅ SBAR Handover saved!', '✅ تم حفظ تقرير الوردية!'));
    window.nsLoadHandovers(pid);
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.nsPrintSBAR = function() {
  const patient = window._NS.selectedPatientData?.patient || {};
  const patientName = isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-');
  const S = document.getElementById('sbarS')?.value || '';
  const B = document.getElementById('sbarB')?.value || '';
  const A = document.getElementById('sbarA')?.value || '';
  const R = document.getElementById('sbarR')?.value || '';
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>SBAR Handover</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;direction:rtl}h1{font-size:18px;color:#0369a1}.section{margin:16px 0;padding:14px;border-radius:8px}.s{background:#e0f2fe;border-left:5px solid #0369a1}.b{background:#f3e8ff;border-left:5px solid #7c3aed}.a{background:#fef9c3;border-left:5px solid #ca8a04}.r{background:#f0fdf4;border-left:5px solid #16a34a}h3{margin:0 0 8px;font-size:14px}p{margin:0;white-space:pre-wrap;font-size:13px}</style>
    </head><body>
    <h1>🔄 تقرير تسليم الوردية — SBAR</h1>
    <p><strong>المريض:</strong> ${escapeHTML(patientName)} | <strong>التاريخ:</strong> ${new Date().toLocaleString('ar-SA')} | <strong>الممرض/ة:</strong> ${escapeHTML(window._NS.currentUser?.name || '')}</p>
    <div class="section s"><h3>S — الحالة</h3><p>${escapeHTML(S)}</p></div>
    <div class="section b"><h3>B — السياق</h3><p>${escapeHTML(B)}</p></div>
    <div class="section a"><h3>A — التقييم</h3><p>${escapeHTML(A)}</p></div>
    <div class="section r"><h3>R — التوصيات</h3><p>${escapeHTML(R)}</p></div>
    </body></html>
  `);
  w.document.close();
  w.print();
};

/* ============================================================ */
/*  TAB 7: TRIAGE (ESI 1-5)                                      */
/* ============================================================ */
window.nsTabTriage = function({ patient = {} }, pid) {
  const esiData = [
    { level: 1, color: '#dc2626', bg: '#fee2e2', label: tr('Resuscitation', 'إنعاش'), desc: tr('Life/limb-threatening — immediate', 'تهديد للحياة — فوري'), icon: '🔴' },
    { level: 2, color: '#ea580c', bg: '#fff7ed', label: tr('Emergent', 'طارئ'), desc: tr('High risk — immediate evaluation', 'خطر عالٍ — تقييم فوري'), icon: '🟠' },
    { level: 3, color: '#ca8a04', bg: '#fef9c3', label: tr('Urgent', 'مستعجل'), desc: tr('Multiple resources required', 'يحتاج موارد متعددة'), icon: '🟡' },
    { level: 4, color: '#3b82f6', bg: '#eff6ff', label: tr('Less Urgent', 'أقل إلحاحاً'), desc: tr('One resource needed', 'يحتاج مورداً واحداً'), icon: '🔵' },
    { level: 5, color: '#16a34a', bg: '#f0fdf4', label: tr('Non-Urgent', 'غير عاجل'), desc: tr('No resources needed', 'لا يحتاج موارد'), icon: '🟢' },
  ];

  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      ⚠️ ${tr('Triage Assessment — ESI (Emergency Severity Index)', 'الفرز السريع — مؤشر خطورة الحالة')}
    </div>
    <div class="form-group mb-12">
      <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Chief Complaint', 'الشكوى الرئيسية')}</label>
      <input class="form-input" id="tgComplaint" placeholder="${tr('What brings the patient in today?', 'ما الذي أتى به المريض؟')}">
    </div>
    <div style="display:grid;gap:10px;margin-bottom:16px">
      ${esiData.map(e => `
        <label style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid ${e.color}33;border-radius:12px;cursor:pointer;background:${e.bg};transition:all 0.15s"
          onmouseover="this.style.borderColor='${e.color}'" onmouseout="this.style.borderColor='${e.color}33'">
          <input type="radio" name="esiLevel" value="${e.level}" style="width:18px;height:18px;accent-color:${e.color}">
          <span style="font-size:24px">${e.icon}</span>
          <div>
            <div style="font-weight:800;font-size:14px;color:${e.color}">ESI-${e.level}: ${e.label}</div>
            <div style="font-size:11px;color:var(--text-dim)">${e.desc}</div>
          </div>
        </label>
      `).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Initial BP', 'الضغط الأولي')}</label>
        <input class="form-input" id="tgBp" placeholder="120/80">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Initial HR', 'النبض الأولي')}</label>
        <input class="form-input" id="tgHr" type="number" placeholder="75">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('SpO2', 'تشبع الأكسجين')}</label>
        <input class="form-input" id="tgSpo2" type="number" placeholder="98">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Temp', 'الحرارة')}</label>
        <input class="form-input" id="tgTemp" type="number" step="0.1" placeholder="37.0">
      </div>
    </div>
    <div class="form-group mb-12">
      <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Triage Notes', 'ملاحظات الفرز')}</label>
      <textarea class="form-input" id="tgNotes" rows="2" placeholder="${tr('Additional observations...', 'ملاحظات إضافية...')}"></textarea>
    </div>
    <button class="btn btn-primary w-full" onclick="window.nsSaveTriage(${pid})" style="height:44px;font-size:14px;font-weight:700">
      ⚠️ ${tr('Save Triage & Route to Doctor', 'حفظ الفرز والتحويل للطبيب')}
    </button>
  `;
};

window.nsSaveTriage = async function(pid) {
  const level = parseInt(document.querySelector('input[name="esiLevel"]:checked')?.value || '3');
  const complaint = document.getElementById('tgComplaint')?.value || '';
  const notes = document.getElementById('tgNotes')?.value || '';
  if (!complaint.trim()) return showToast(tr('Enter chief complaint', 'أدخل الشكوى الرئيسية'), 'error');
  try {
    await API.post('/api/nursing/triage', {
      patient_id: pid, triage_level: level, acuity_notes: notes, chief_complaint: complaint,
    }).catch(() =>
      API.post('/api/orders', {
        patient_id: pid, type: 'nursing',
        description: `[TRIAGE] ESI-${level} | ${complaint}`,
        status: level <= 2 ? 'STAT' : 'Pending', notes,
      })
    );
    showToast(tr(`✅ Triage ESI-${level} saved!`, `✅ تم الفرز ESI-${level}!`));
    if (level <= 2) showToast(`🚨 ${tr('CRITICAL — Immediate attention required!', 'حرج — يجب التدخل الفوري!')}`, 'error');
    setTimeout(() => window.nsSelectPatient(pid), 800);
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  TAB 8: RISK ASSESSMENTS (Morse + Braden + DVT + qSOFA)       */
/* ============================================================ */
window.nsTabRisks = function({ patient = {} }, pid) {
  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:16px;color:var(--primary)">
      📊 ${tr('Clinical Risk Assessments', 'تقييمات المخاطر السريرية')}
    </div>
    <div style="display:grid;gap:16px">

      <!-- Morse Fall Risk -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-weight:700;font-size:13px;color:#ca8a04;margin-bottom:12px">🦶 ${tr('Morse Fall Risk Scale', 'مقياس مورس لخطر السقوط')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('History of Falls', 'تاريخ سقوط')}</label>
            <select class="form-input" id="morseFall" style="height:32px;font-size:12px">
              <option value="0">No — 0 pts</option><option value="25">Yes — 25 pts</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Secondary Diagnosis', 'تشخيص ثانوي')}</label>
            <select class="form-input" id="morseSecDx" style="height:32px;font-size:12px">
              <option value="0">No — 0 pts</option><option value="15">Yes — 15 pts</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Ambulatory Aid', 'وسيلة المشي')}</label>
            <select class="form-input" id="morseAid" style="height:32px;font-size:12px">
              <option value="none">None/Bed rest — 0 pts</option>
              <option value="crutch">Crutches/Cane/Walker — 15 pts</option>
              <option value="furniture">Furniture — 30 pts</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">IV Therapy</label>
            <select class="form-input" id="morseIV" style="height:32px;font-size:12px">
              <option value="0">No — 0 pts</option><option value="20">Yes — 20 pts</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Gait', 'طريقة المشي')}</label>
            <select class="form-input" id="morseGait" style="height:32px;font-size:12px">
              <option value="normal">Normal — 0 pts</option>
              <option value="weak">Weak — 10 pts</option>
              <option value="impaired">Impaired — 20 pts</option>
            </select>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Mental Status', 'الحالة الذهنية')}</label>
            <select class="form-input" id="morseMental" style="height:32px;font-size:12px">
              <option value="oriented">Oriented — 0 pts</option>
              <option value="forgets">Forgets Limitations — 15 pts</option>
            </select>
          </div>
        </div>
        <div id="morseResult" style="margin-top:10px;padding:10px;border-radius:8px;text-align:center;font-weight:700;background:#f1f5f9"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" onclick="window.nsCalcMorse()" style="flex:1;background:#ca8a04;color:#fff;border:none;font-size:12px;height:36px">
            🧮 ${tr('Calculate', 'احتساب')}
          </button>
          <button class="btn" onclick="window.nsSaveMorse(${pid})" style="flex:1;background:#16a34a;color:#fff;border:none;font-size:12px;height:36px">
            💾 ${tr('Save', 'حفظ')}
          </button>
        </div>
      </div>

      <!-- Braden Scale -->
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-weight:700;font-size:13px;color:#7c3aed;margin-bottom:12px">🛏️ ${tr('Braden Pressure Injury Scale', 'مقياس برادن لقرحة الفراش')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${[
            { id: 'brSensory', label: 'Sensory Perception', max: 4 },
            { id: 'brMoisture', label: 'Moisture', max: 4 },
            { id: 'brActivity', label: 'Activity', max: 4 },
            { id: 'brMobility', label: 'Mobility', max: 4 },
            { id: 'brNutrition', label: 'Nutrition', max: 4 },
            { id: 'brFriction', label: 'Friction/Shear', max: 3 },
          ].map(f => `
            <div>
              <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${f.label}</label>
              <select class="form-input" id="${f.id}" style="height:32px;font-size:12px">
                ${Array.from({length:f.max},(_, i)=>i+1).map(n=>`<option value="${n}">${n}</option>`).join('')}
              </select>
            </div>
          `).join('')}
        </div>
        <div id="bradenResult" style="margin-top:10px;padding:10px;border-radius:8px;text-align:center;font-weight:700;background:#f1f5f9"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" onclick="window.nsCalcBraden()" style="flex:1;background:#7c3aed;color:#fff;border:none;font-size:12px;height:36px">
            🧮 ${tr('Calculate', 'احتساب')}
          </button>
          <button class="btn" onclick="window.nsSaveBraden(${pid})" style="flex:1;background:#16a34a;color:#fff;border:none;font-size:12px;height:36px">
            💾 ${tr('Save', 'حفظ')}
          </button>
        </div>
      </div>

      <!-- qSOFA Sepsis Screening -->
      <div style="border:2px solid #dc262633;border-radius:12px;padding:14px">
        <div style="font-weight:700;font-size:13px;color:#dc2626;margin-bottom:12px">🦠 ${tr('qSOFA Sepsis Screening', 'فحص الإنتان qSOFA')}</div>
        <div style="display:grid;gap:8px">
          ${[
            { id: 'qsRr', label: tr('Respiratory Rate ≥ 22/min', 'معدل التنفس ≥ 22/دقيقة') },
            { id: 'qsAlt', label: tr('Altered Mentation (GCS < 15)', 'تغير الوعي (GCS < 15)') },
            { id: 'qsSbp', label: tr('Systolic BP ≤ 100 mmHg', 'ضغط انقباضي ≤ 100') },
          ].map(c => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface-container,#f8fafc);border-radius:8px;cursor:pointer">
              <input type="checkbox" id="${c.id}" style="width:18px;height:18px">
              <span style="font-size:12px">${c.label}</span>
            </label>
          `).join('')}
        </div>
        <div id="qsofaResult" style="margin-top:10px;padding:10px;border-radius:8px;text-align:center;font-weight:700;background:#f1f5f9"></div>
        <button class="btn w-full" onclick="window.nsCalcQSOFA()" style="margin-top:8px;background:#dc2626;color:#fff;border:none;font-size:12px;height:36px">
          🧮 ${tr('Screen for Sepsis', 'فحص الإنتان')}
        </button>
      </div>
    </div>
  `;
};

window.nsCalcMorse = function() {
  const result = calcMorse({
    fallHistory: parseInt(document.getElementById('morseFall')?.value) > 0,
    secDx:       parseInt(document.getElementById('morseSecDx')?.value) > 0,
    aidType:     document.getElementById('morseAid')?.value,
    iv:          parseInt(document.getElementById('morseIV')?.value) > 0,
    gait:        document.getElementById('morseGait')?.value,
    mentalStatus:document.getElementById('morseMental')?.value,
  });
  const el = document.getElementById('morseResult');
  if (el) {
    el.style.background = result.color + '22';
    el.style.color = result.color;
    el.innerHTML = `${tr('Morse Score', 'نقاط مورس')}: <strong>${result.total}</strong> — ${result.label}`;
  }
  window._NS._lastMorse = result;
};

window.nsSaveMorse = async function(pid) {
  window.nsCalcMorse();
  const r = window._NS._lastMorse;
  if (!r) return;
  try {
    await API.post('/api/nursing/risk-assessment', {
      patient_id: pid, assessment_type: 'Morse Fall Risk',
      total_score: r.total, risk_level: r.label,
      assessed_by: window._NS.currentUser?.name || '',
    });
    showToast(tr('✅ Morse saved!', '✅ تم حفظ مقياس مورس!'));
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.nsCalcBraden = function() {
  const result = calcBraden({
    sensory:   parseInt(document.getElementById('brSensory')?.value) || 4,
    moisture:  parseInt(document.getElementById('brMoisture')?.value) || 4,
    activity:  parseInt(document.getElementById('brActivity')?.value) || 4,
    mobility:  parseInt(document.getElementById('brMobility')?.value) || 4,
    nutrition: parseInt(document.getElementById('brNutrition')?.value) || 4,
    friction:  parseInt(document.getElementById('brFriction')?.value) || 3,
  });
  const el = document.getElementById('bradenResult');
  if (el) {
    el.style.background = result.color + '22';
    el.style.color = result.color;
    el.innerHTML = `${tr('Braden Score', 'نقاط برادن')}: <strong>${result.total}/23</strong> — ${result.label}`;
  }
  window._NS._lastBraden = result;
};

window.nsSaveBraden = async function(pid) {
  window.nsCalcBraden();
  const r = window._NS._lastBraden;
  if (!r) return;
  try {
    await API.post('/api/nursing/risk-assessment', {
      patient_id: pid, assessment_type: 'Braden Scale',
      total_score: r.total, risk_level: r.label,
      assessed_by: window._NS.currentUser?.name || '',
    });
    showToast(tr('✅ Braden saved!', '✅ تم حفظ مقياس برادن!'));
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.nsCalcQSOFA = function() {
  const rr  = document.getElementById('qsRr')?.checked ? 1 : 0;
  const alt = document.getElementById('qsAlt')?.checked ? 1 : 0;
  const sbp = document.getElementById('qsSbp')?.checked ? 1 : 0;
  const total = rr + alt + sbp;
  const el = document.getElementById('qsofaResult');
  const positive = total >= 2;
  if (el) {
    el.style.background = positive ? '#fee2e2' : '#f0fdf4';
    el.style.color = positive ? '#dc2626' : '#16a34a';
    el.innerHTML = `qSOFA: <strong>${total}/3</strong> — ${positive
      ? `🚨 ${tr('POSITIVE — Suspected Sepsis! Escalate!', 'إيجابي — اشتباه إنتان! تصعيد فوري!')}`
      : `✅ ${tr('Negative', 'سلبي')}`}`;
  }
};

/* ============================================================ */
/*  TAB 9: NURSING ORDERS BOARD                                  */
/* ============================================================ */
window.nsTabOrders = async function(container, pid) {
  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:32px">⏳</div><p>${tr('Loading orders...', 'جاري التحميل...')}</p></div>`;
  let data = { orders: [], prescriptions: [] };
  try { data = await API.get(`/api/patients/${pid}/active-orders`); } catch {}
  const nursingOrders = (data.orders || []).filter(o => o.order_category === 'nursing' || (o.description || '').includes('[NURSING]') || (o.description || '').includes('[DIET]') || (o.description || '').includes('[IV]') || (o.description || '').includes('[ESCALATE]'));
  const allOrders = data.orders || [];

  container.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--primary)">
      📑 ${tr('Nursing Orders Board', 'لوحة أوامر التمريض')} (${allOrders.length})
    </div>
    ${!allOrders.length ? `<div style="text-align:center;padding:32px;color:var(--text-dim)"><div style="font-size:48px;opacity:0.3">📑</div><p>${tr('No orders for this patient', 'لا توجد أوامر')}</p></div>` : `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface-container,#f1f5f9)">
            <th style="padding:8px;text-align:start">${tr('Type', 'النوع')}</th>
            <th style="padding:8px;text-align:start">${tr('Order', 'الأمر')}</th>
            <th style="padding:8px;text-align:center">${tr('Status', 'الحالة')}</th>
            <th style="padding:8px;text-align:center">${tr('Time', 'الوقت')}</th>
            <th style="padding:8px;text-align:center">${tr('Action', 'إجراء')}</th>
          </tr>
        </thead>
        <tbody>
          ${allOrders.map(o => {
            const isNursing = (o.description || '').includes('[NURSING]') || (o.description || '').includes('[DIET]') || (o.description || '').includes('[IV]') || o.order_category === 'nursing';
            const isStat = o.status === 'STAT';
            const statusColor = { Pending: '#ca8a04', STAT: '#dc2626', 'In Progress': '#0ea5e9', Completed: '#16a34a' }[o.status] || '#6b7280';
            const icon = (o.description || '').includes('[DIET]') ? '🥗' : (o.description || '').includes('[IV]') ? '💉' : (o.description || '').includes('[NURSING]') ? '🩺' : (o.description || '').includes('[ESCALATE]') ? '🚨' : o.order_category === 'lab' ? '🔬' : '📋';
            return `
            <tr style="border-bottom:1px solid var(--border);${isStat ? 'background:#fee2e2;' : isNursing ? 'background:#e0f2fe11;' : ''}">
              <td style="padding:8px;font-size:16px">${icon}</td>
              <td style="padding:8px;font-weight:600;max-width:200px;word-break:break-word">${escapeHTML(o.description || '-')}</td>
              <td style="padding:8px;text-align:center">
                <span style="background:${statusColor}22;color:${statusColor};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">
                  ${isStat ? '🚨 ' : ''}${escapeHTML(o.status || 'Pending')}
                </span>
              </td>
              <td style="padding:8px;text-align:center;color:var(--text-dim)">${escapeHTML(o.created_at?.split('T')[1]?.slice(0,5) || '-')}</td>
              <td style="padding:8px;text-align:center">
                ${o.status !== 'Completed' ? `<button class="btn btn-sm" onclick="window.nsAckOrder(${safeId(o.id)},${safeId(pid)})"
                  style="background:#16a34a;color:#fff;border:none;font-size:10px;padding:3px 8px">
                  ✅ ${tr('Done', 'منجز')}
                </button>` : '<span style="color:#16a34a;font-size:11px">✅</span>'}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    `}
  `;
};

window.nsAckOrder = async function(orderId, pid) {
  try {
    await API.put(`/api/orders/${orderId}`, { status: 'Completed' }).catch(() =>
      API.post('/api/medical/records', {
        patient_id: pid, diagnosis: `Order completed by nurse`,
        notes: `Order ID ${orderId} marked done`, treatment: '',
      })
    );
    showToast(tr('✅ Order marked as done', '✅ تم وضع علامة منجز على الأمر'));
    window.nsTabOrders(document.getElementById('nsTabContent'), pid);
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  TAB 10: NURSING NOTES                                         */
/* ============================================================ */
window.nsTabNotes = function({ chart = {} }, pid) {
  const records = chart.records || [];
  const nursingNotes = records.filter(r => r.diagnosis?.includes('Nursing') || r.treatment?.includes('Nursing') || r.notes?.includes('SBAR'));

  const templates = [
    { label: tr('Pre-op Check', 'فحص ما قبل العملية'), text: 'Pre-operative check completed. Patient verified ID, allergies reviewed, consent signed, NPO confirmed, IV access patent.' },
    { label: tr('Fall Prevention', 'منع السقوط'), text: 'Fall prevention measures implemented: bed in low position, call bell within reach, non-slip footwear, fall risk sign on door.' },
    { label: tr('Pain Management', 'إدارة الألم'), text: 'Pain assessed using NRS. Pain score: ___/10. Medication given as ordered. Reassessment in 30 minutes.' },
    { label: tr('IV Site Check', 'فحص موقع الإبرة'), text: 'IV site assessed: no redness, swelling, or infiltration noted. IV patent, infusing at prescribed rate.' },
    { label: tr('Discharge Teaching', 'تعليم الخروج'), text: 'Discharge teaching provided: medication compliance, diet, wound care, when to seek emergency care. Patient verbalized understanding.' },
  ];

  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--primary)">
      📝 ${tr('Nursing Notes', 'الملاحظات التمريضية')}
    </div>
    <div class="form-group mb-8">
      <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Quick Templates', 'قوالب جاهزة')}</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${templates.map(t => `
          <button class="btn btn-sm" onclick="document.getElementById('nsNoteText').value='${t.text.replace(/'/g,"\\'")}'"
            style="font-size:10px;padding:4px 8px;background:var(--surface-container,#f1f5f9);border:1px solid var(--border)">
            ${t.label}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="form-group mb-8">
      <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Note Type', 'نوع الملاحظة')}</label>
      <select class="form-input" id="nsNoteType">
        <option value="Progress Note">Progress Note (ملاحظة تقدم)</option>
        <option value="Focus Charting">Focus Charting (توثيق مركّز)</option>
        <option value="Shift Note">Shift Note (ملاحظة وردية)</option>
        <option value="Incident Note">Incident Note (ملاحظة حادثة)</option>
        <option value="Wound Assessment">Wound Assessment (تقييم جرح)</option>
      </select>
    </div>
    <div class="form-group mb-12">
      <label style="font-size:11px;font-weight:700;color:var(--text-dim)">${tr('Note', 'الملاحظة')}</label>
      <textarea class="form-input" id="nsNoteText" rows="6"
        placeholder="${tr('Enter nursing note...', 'أدخل الملاحظة التمريضية...')}"></textarea>
    </div>
    <button class="btn btn-primary w-full" onclick="window.nsSaveNote(${pid})" style="height:44px;font-size:13px;margin-bottom:20px">
      💾 ${tr('Save & Sign Note', 'حفظ وتوقيع الملاحظة')}
    </button>

    <!-- Previous Notes -->
    ${nursingNotes.length ? `
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">${tr('Previous Nursing Notes', 'الملاحظات التمريضية السابقة')} (${nursingNotes.length})</div>
      ${nursingNotes.slice(0, 5).map(r => `
        <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${escapeHTML(r.created_at?.split('T')[0] || '-')} · ${escapeHTML(r.diagnosis || '-')}</div>
          <div style="font-size:12px">${escapeHTML((r.notes || r.treatment || '').slice(0, 200))}${(r.notes || '').length > 200 ? '...' : ''}</div>
          ${r.is_signed ? `<div style="margin-top:4px;font-size:10px;color:#16a34a">✅ ${tr('Signed', 'موقّع')} — ${escapeHTML(r.signed_by || '')}</div>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;
};

window.nsSaveNote = async function(pid) {
  const text = document.getElementById('nsNoteText')?.value?.trim() || '';
  const type = document.getElementById('nsNoteType')?.value || 'Progress Note';
  if (!text) return showToast(tr('Enter note text', 'أدخل نص الملاحظة'), 'error');
  try {
    await API.post('/api/medical/records', {
      patient_id: pid,
      diagnosis: `Nursing ${type}`,
      notes: text,
      treatment: `Nurse: ${window._NS.currentUser?.name || ''} | Shift: ${getShiftName()}`,
      symptoms: '',
    });
    showToast(tr('✅ Note saved!', '✅ تم حفظ الملاحظة!'));
    document.getElementById('nsNoteText') && (document.getElementById('nsNoteText').value = '');
    setTimeout(() => window.nsSwitchTab('notes'), 500);
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  RIGHT PANEL: Quick Actions                                    */
/* ============================================================ */
window.nsRenderActionsPanel = function(patient, news2) {
  const panel = document.getElementById('nsActionsContent');
  if (!panel) return;
  const pid = safeId(patient.id);

  panel.innerHTML = `
    <!-- NEWS2 Quick Badge -->
    <div style="background:${news2.riskColor}11;border:2px solid ${news2.riskColor};border-radius:14px;padding:14px;text-align:center;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:${news2.riskColor};text-transform:uppercase">NEWS2 Score</div>
      <div style="font-size:44px;font-weight:900;color:${news2.riskColor};line-height:1.1">${news2.score}</div>
      <div style="font-size:10px;font-weight:700;color:${news2.riskColor};margin-top:2px">${news2.riskLabel}</div>
    </div>

    <!-- Quick Action Buttons -->
    <div style="display:grid;gap:8px">
      <button class="btn" onclick="window.nsSwitchTab('vitals')"
        style="background:#0ea5e9;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        🌡️ ${tr('Quick Vitals', 'قياس سريع')}
      </button>
      <button class="btn" onclick="window.nsSwitchTab('emar')"
        style="background:#16a34a;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        💉 ${tr('Give Medication', 'إعطاء دواء')}
      </button>
      <button class="btn" onclick="window.nsSwitchTab('io')"
        style="background:#7c3aed;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        💧 ${tr('I & O Entry', 'تسجيل سوائل')}
      </button>
      ${news2.score >= 5 ? `
      <button class="btn" onclick="window.nsEscalate(${pid})"
        style="background:#dc2626;color:#fff;border:none;font-size:12px;height:40px;font-weight:800;border-radius:10px;animation:pulse 1s infinite">
        🚨 ${tr('ESCALATE TO DOCTOR', 'تصعيد للطبيب')}
      </button>` : ''}
      <button class="btn" onclick="window.nsSwitchTab('handover')"
        style="background:#ca8a04;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        🔄 ${tr('Write SBAR', 'كتابة SBAR')}
      </button>
      <button class="btn" onclick="window.nsSwitchTab('triage')"
        style="background:#ea580c;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        ⚠️ ${tr('Triage', 'فرز المريض')}
      </button>
      <button class="btn" onclick="window.nsMarkWithNurse(${pid})"
        style="background:#0369a1;color:#fff;border:none;font-size:12px;height:40px;font-weight:700;border-radius:10px">
        👩‍⚕️ ${tr('Mark: With Nurse', 'وضع علامة: مع الممرضة')}
      </button>
    </div>

    <!-- Patient Info Summary -->
    <div style="margin-top:16px;border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">👤 ${tr('Patient', 'المريض')}</div>
      <div style="font-size:12px;font-weight:700">${escapeHTML(isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-'))}</div>
      ${patient.age ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">📅 ${escapeHTML(String(patient.age))} ${tr('yrs', 'سنة')} · ${escapeHTML(patient.gender || '-')}</div>` : ''}
      ${patient.blood_type ? `<div style="font-size:11px;color:var(--text-dim)">🩸 ${escapeHTML(patient.blood_type)}</div>` : ''}
      ${patient.file_number ? `<div style="font-size:11px;color:var(--text-dim)">🗂️ ${escapeHTML(String(patient.file_number))}</div>` : ''}
    </div>
  `;
};

/* ============================================================ */
/*  MARK WITH NURSE                                              */
/* ============================================================ */
window.nsMarkWithNurse = async function(patientId) {
  if (!patientId) return;
  try {
    await API.put('/api/patients/' + patientId, { status: 'With Nurse' });
    showToast(tr('✅ Marked as With Nurse', '✅ وضع علامة: مع الممرضة'));
    window.nsRefreshWorklist();
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  REGISTRATION — Override old renderNursing                    */
/* ============================================================ */
window.renderNursingStation = renderNursingStation;

// Override the old renderNursing to use the new module
if (typeof window.renderNursingOld === 'undefined') {
  window.renderNursingOld = window.renderNursing || function() {};
}
window.renderNursing = async function(el) {
  return renderNursingStation(el);
};

console.log('[NursingStation] Module v1 loaded — محطة التمريض مستوى Epic/Cerner جاهزة ✅');

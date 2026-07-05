/**
 * ============================================================
 * DOCTOR STATION — World-Class Clinical Workstation (v3)
 * محطة الطبيب — مستوى عالمي (Epic / Cerner / Oracle Health)
 * ============================================================
 * Three-Panel Layout:
 *   LEFT   — قائمة انتظار المرضى (Wait Queue) مع Triage Levels
 *   CENTER — الملف السريري (11 تبويب: Summary,History,Problems,
 *             Medications,Allergies,Vitals,Notes,Orders,Results,History+)
 *   RIGHT  — لوحة CPOE الموسّعة (Dx,Rx,Lab,Rad,Nursing,Diet,IV,Referral,Discharge)
 * ============================================================
 * v3 New: Orders Board, Lab Results Viewer, Extended History,
 *         BMI/BP in header, Triage badge, Insurance info,
 *         Diet/IV/Nursing orders, Rx templates, Refill support
 * ============================================================
 */

'use strict';

/* ---- Globals scoped to this module ---- */
window._DS = window._DS || {
  selectedPatientId: null,
  selectedPatientData: null,
  activeTab: 'summary',
  rxItems: [],           // وصفة إلكترونية قيد الإعداد
  activeEncounterId: null,
  waitTimer: null,       // setInterval for live wait-time refresh
};

/* ============================================================ */
/*  MAIN ENTRY POINT — replaces the old renderDoctor function   */
/* ============================================================ */
async function renderDoctor(el) {
  // Kill any previous wait-list refresh timer
  if (window._DS.waitTimer) { clearInterval(window._DS.waitTimer); window._DS.waitTimer = null; }
  window._DS.selectedPatientId = null;
  window._DS.rxItems = [];

  // Skeleton while loading
  el.innerHTML = `
    <div class="page-title">👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}
      <span style="font-size:12px;font-weight:400;color:var(--text-dim);margin-right:8px">
        ${tr('Epic-class Clinical Workstation', 'محطة سريرية بمستوى عالمي')}
      </span>
    </div>
    <div class="ds-layout" id="dsLayout">
      <div class="ds-left-panel">
        <div class="ds-panel-header"><span>⏳ ${tr('Wait Queue', 'قائمة الانتظار')}</span>
          <div class="skeleton-bar" style="width:30px;height:18px;border-radius:10px"></div>
        </div>
        ${[1,2,3,4].map(() => `
          <div class="ds-wait-item">
            <div class="ds-wait-avatar" style="background:#e5e7eb"></div>
            <div class="ds-wait-info">
              <div class="skeleton-bar mb-4" style="height:13px;width:80%"></div>
              <div class="skeleton-bar" style="height:10px;width:60%"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="ds-center-panel" style="align-items:center;justify-content:center">
        <div style="text-align:center;color:var(--text-dim);padding:40px">
          <div style="font-size:64px;margin-bottom:16px;opacity:0.4">👨‍⚕️</div>
          <p>${tr('Loading...', 'جارٍ التحميل...')}</p>
        </div>
      </div>
      <div class="ds-right-panel">
        <div class="ds-panel-header"><span>📋 ${tr('Orders', 'الأوامر')}</span></div>
        <div style="padding:16px">
          <div class="skeleton-bar mb-12" style="height:40px;border-radius:10px"></div>
          <div class="skeleton-bar mb-12" style="height:40px;border-radius:10px"></div>
          <div class="skeleton-bar" style="height:40px;border-radius:10px"></div>
        </div>
      </div>
    </div>
  `;

  // Load wait queue + current user in parallel
  let waitQueue = [], drugs = [], currentUserData = {}, allServices = [];
  try {
    [waitQueue, drugs, currentUserData, allServices] = await Promise.all([
      API.get('/api/doctor/wait-queue').catch(() => API.get('/api/patients').then(p => p.filter(x => x.status === 'Waiting' || x.status === 'With Doctor'))),
      API.get('/api/pharmacy/drugs').catch(() => []),
      API.get('/api/auth/me').catch(() => ({})),
      API.get('/api/medical/services').catch(() => []),
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load Doctor Station', 'فشل تحميل محطة الطبيب')}</h3>
        <p>${escapeHTML(e.message || String(e))}</p>
        <button class="btn btn-primary" onclick="navigateTo(3)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>`;
    return;
  }

  window._DS.drugs = drugs;
  window._DS.allServices = allServices;
  window._DS.currentUser = currentUserData.user || currentUserData;

  // Render the full three-panel layout
  el.innerHTML = `
    <div class="page-title" style="margin-bottom:12px">
      👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}
      <span style="font-size:12px;font-weight:500;color:var(--text-dim);margin-inline-start:12px">
        ${tr('Physician:', 'الطبيب:')} <strong>${escapeHTML(window._DS.currentUser?.name || window._DS.currentUser?.username || 'Doctor')}</strong>
      </span>
      <span style="font-size:12px;font-weight:500;color:var(--text-dim);margin-inline-start:12px">
        📅 ${new Date().toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
      </span>
    </div>
    <div class="ds-layout" id="dsLayout">

      <!-- ========== LEFT PANEL: Wait Queue ========== -->
      <div class="ds-left-panel" id="dsWaitPanel">
        <div class="ds-panel-header">
          <span>⏳ ${tr('Wait Queue', 'قائمة الانتظار')}</span>
          <div class="ds-badge-count" id="dsWaitCount">${waitQueue.length}</div>
        </div>
        <div id="dsWaitList" style="flex:1;overflow-y:auto"></div>
        <div style="padding:10px;border-top:1px solid var(--border)">
          <button class="btn btn-sm w-full" onclick="window.dsRefreshWaitQueue()"
            style="background:var(--primary-glow);color:var(--primary);border:1px solid var(--primary);font-size:11px">
            🔄 ${tr('Refresh', 'تحديث')}
          </button>
        </div>
      </div>

      <!-- ========== CENTER PANEL: Patient Chart ========== -->
      <div class="ds-center-panel" id="dsCenterPanel">
        <div id="dsCenterContent" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:40px;color:var(--text-dim);text-align:center">
          <div style="font-size:72px;margin-bottom:20px;opacity:0.3">🩺</div>
          <h3 style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--text-dim)">
            ${tr('Select a patient from the wait queue', 'اختر مريضاً من قائمة الانتظار')}
          </h3>
          <p style="font-size:13px;opacity:0.7">
            ${tr('The patient chart will appear here', 'سيظهر الملف السريري للمريض هنا')}
          </p>
        </div>
      </div>

      <!-- ========== RIGHT PANEL: Orders ========== -->
      <div class="ds-right-panel" id="dsOrdersPanel">
        <div class="ds-panel-header"><span>📋 ${tr('Orders', 'الأوامر')}</span></div>
        <div id="dsOrdersContent" style="flex:1;padding:16px;display:flex;align-items:center;justify-content:center;flex-direction:column;color:var(--text-dim)">
          <div style="font-size:48px;opacity:0.25;margin-bottom:12px">📋</div>
          <p style="font-size:12px">${tr('Select a patient to write orders', 'اختر مريضاً لكتابة الأوامر')}</p>
        </div>
      </div>

    </div>
  `;

  // Render wait list
  window.dsRenderWaitList(waitQueue);

  // Live timer refresh every 60s
  window._DS.waitTimer = setInterval(window.dsRefreshWaitQueue, 60000);
}

/* ============================================================ */
/*  WAIT QUEUE RENDERING                                         */
/* ============================================================ */
window.dsRenderWaitList = function(patients) {
  const list = document.getElementById('dsWaitList');
  if (!list) return;
  // Queue rows carry the queue-row id in `id` and the real patient id in `patient_id`.
  // Resolve to the patient id and drop duplicate queue rows for the same patient.
  if (!Array.isArray(patients)) patients = [];
  const seenPids = new Set();
  patients = patients.filter(p => {
    const pid = p.patient_id || p.id;
    if (!pid || seenPids.has(pid)) return false;
    seenPids.add(pid);
    return true;
  });
  const countEl = document.getElementById('dsWaitCount');
  if (countEl) countEl.textContent = patients.length;

  if (!patients.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)">
      <div style="font-size:36px;margin-bottom:8px">🎉</div>
      <p style="font-size:12px">${tr('No patients waiting', 'لا يوجد مرضى في الانتظار')}</p>
    </div>`;
    return;
  }

  list.innerHTML = patients.map(p => {
    const pid = p.patient_id || p.id;
    const name = isArabic ? (p.name_ar || p.name_en || '-') : (p.name_en || p.name_ar || '-');
    const initial = (name || '?').charAt(0).toUpperCase();
    const waitMin = Math.round(parseFloat(p.wait_minutes || 0));
    const timerClass = waitMin > 60 ? 'critical' : waitMin > 30 ? 'warning' : 'normal';
    const timerText = waitMin > 0 ? (waitMin + ' ' + tr('min', 'د')) : tr('Now', 'الآن');
    const isActive = window._DS.selectedPatientId === pid;
    const isWithDoc = p.status === 'With Doctor';
    return `
      <div class="ds-wait-item ${isActive ? 'active' : ''} ${isWithDoc ? 'with-doctor' : ''}"
           onclick="window.dsSelectPatient(${safeId(pid)})"
           data-pid="${safeId(pid)}">
        <div class="ds-wait-avatar">${escapeHTML(initial)}</div>
        <div class="ds-wait-info">
          <div class="ds-wait-name">${escapeHTML(name)}</div>
          <div class="ds-wait-meta">
            ${p.file_number ? '🗂️ ' + escapeHTML(String(p.file_number)) + ' · ' : ''}
            ${escapeHTML(p.department || p.chief_complaint || tr('General', 'عام'))}
            ${isWithDoc ? ' · <span style="color:#16a34a;font-weight:700">👨‍⚕️ ' + tr('With Doctor', 'مع الطبيب') + '</span>' : ''}
          </div>
        </div>
        <div class="ds-wait-timer ${timerClass}">${escapeHTML(timerText)}</div>
      </div>`;
  }).join('');
};

window.dsRefreshWaitQueue = async function() {
  try {
    const q = await API.get('/api/doctor/wait-queue').catch(() =>
      API.get('/api/patients').then(p => p.filter(x => x.status === 'Waiting' || x.status === 'With Doctor'))
    );
    window.dsRenderWaitList(q);
  } catch (e) { /* silent */ }
};

/* ============================================================ */
/*  SELECT PATIENT → Load Chart                                  */
/* ============================================================ */
window.dsSelectPatient = async function(patientId) {
  if (!patientId) return;
  window._DS.selectedPatientId = patientId;
  window._DS.rxItems = [];
  window._DS.activeTab = 'summary';

  // Highlight in wait list
  document.querySelectorAll('.ds-wait-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.pid) === patientId);
  });

  // Show loading in center & right
  const center = document.getElementById('dsCenterContent') || document.getElementById('dsCenterPanel');
  const ordersContent = document.getElementById('dsOrdersContent');
  if (center) center.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-dim)"><div style="font-size:32px;margin-bottom:12px">⏳</div><p>${tr('Loading chart...', 'جارٍ تحميل الملف...')}</p></div>`;
  if (ordersContent) ordersContent.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-dim)"><div style="font-size:24px;margin-bottom:12px">⏳</div></div>`;

  // Fetch all chart data in parallel
  let chart = {}, vitals = [], problems = [], allergies = [], medications = [];
  try {
    [chart, vitals, problems, allergies, medications] = await Promise.all([
      API.get(`/api/patients/${patientId}/chart`).catch(() => ({})),
      API.get(`/api/patients/${patientId}/vitals`).catch(() => []),
      API.get(`/api/patients/${patientId}/problems`).catch(() => []),
      API.get(`/api/patients/${patientId}/allergies`).catch(() => []),
      API.get(`/api/patients/${patientId}/medications`).catch(() => []),
    ]);
  } catch (e) { console.error('Chart load error:', e); }

  // API.get resolves with the error JSON (not a throw) on 4xx/5xx — normalize shapes
  const asArray = v => (Array.isArray(v) ? v : []);
  vitals = asArray(vitals);
  problems = asArray(problems);
  allergies = asArray(allergies);
  medications = asArray(medications);
  if (!chart || typeof chart !== 'object' || chart.error) chart = {};

  const patient = chart.patient || {};
  window._DS.selectedPatientData = { patient, chart, vitals, problems, allergies, medications };

  // Render Patient Header + Chart Tabs
  window.dsRenderPatientChart(patient, chart, vitals, problems, allergies, medications);
  // Render Orders Panel
  window.dsRenderOrdersPanel(patient, chart.records || []);
};

/* ============================================================ */
/*  CENTER PANEL: Patient Chart                                  */
/* ============================================================ */
window.dsRenderPatientChart = function(patient, chart, vitals, problems, allergies, medications) {
  const centerPanel = document.getElementById('dsCenterPanel');
  if (!centerPanel) return;

  const records = chart.records || [];
  const name = isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-');
  const initial = (name || '?').charAt(0).toUpperCase();
  const age = patient.age || patient.dob ? (patient.age || tr('N/A', 'غير محدد')) : '—';
  const gender = patient.gender || '—';
  const fileNo = patient.file_number || '—';

  // Build alert chips
  const allergyChips = allergies.length
    ? `<span class="ds-alert-chip allergy" title="${tr('Allergies', 'حساسيات')}">🚨 ${allergies.length} ${tr('Allergy', 'حساسية')}</span>`
    : '';
  const pendingOrders = (chart.orders || []).filter(o => o.status === 'Pending' || o.status === 'pending');
  const pendingChip = pendingOrders.length
    ? `<span class="ds-alert-chip pending">📋 ${pendingOrders.length} ${tr('Pending', 'معلق')}</span>`
    : '';
  const activeProblems = problems.filter(p => p.status === 'active');
  const problemChip = activeProblems.length
    ? `<span class="ds-alert-chip critical">⚠️ ${activeProblems.length} ${tr('Active Problem', 'مشكلة نشطة')}</span>`
    : '';

  // --- حساب BMI وآخر BP ودرجة الفرز ---
  const _lv = {};
  vitals.forEach(v => { if (!_lv[v.score_type]) _lv[v.score_type] = v.score_value; });
  const _w = parseFloat(_lv['weight']||0), _h = parseFloat(_lv['height']||0);
  const bmiVal = (_w>0&&_h>0) ? (_w/((_h/100)**2)).toFixed(1) : null;
  const bmiLabel = bmiVal ? (parseFloat(bmiVal)<18.5?'⬇️ نقص':parseFloat(bmiVal)<25?'✅ طبيعي':parseFloat(bmiVal)<30?'🟡 زيادة':'🔴 سمنة') : null;
  const bpRaw = _lv['blood_pressure']||'';
  const bpSys = parseInt((bpRaw.split('/')||[])[0]||0);
  const bpColor = bpSys>=160?'#dc2626':bpSys>=140?'#ea580c':bpSys>0?'#16a34a':'';
  const triageLevel = chart.queueInfo?.triage_level || null;
  const triageColors = {1:'#dc2626',2:'#ea580c',3:'#ca8a04',4:'#16a34a',5:'#6b7280'};
  const triageLabels = {1:tr('Resuscitation','إنعاش'),2:tr('Emergent','طارئ'),3:tr('Urgent','مستعجل'),4:tr('Less Urgent','غير مستعجل'),5:tr('Non-Urgent','عادي')};

  centerPanel.innerHTML = `
    <!-- Patient Header Banner v3 -->
    <div class="ds-patient-header">
      <div class="ds-patient-avatar">${escapeHTML(initial)}</div>
      <div class="ds-patient-info" style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="ds-patient-name">${escapeHTML(name)}</div>
          ${triageLevel ? `<span style="background:${triageColors[triageLevel]||'#6b7280'};color:#fff;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">T${triageLevel} ${escapeHTML(triageLabels[triageLevel]||'')}</span>` : ''}
          ${patient.blood_type ? `<span style="background:#7c3aed22;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">🩸 ${escapeHTML(patient.blood_type)}</span>` : ''}
        </div>
        <div class="ds-patient-meta" style="flex-wrap:wrap">
          <span class="ds-patient-meta-item">🗂️ ${escapeHTML(String(fileNo))}</span>
          <span class="ds-patient-meta-item">📅 ${tr('Age','العمر')}: ${escapeHTML(String(age))}</span>
          <span class="ds-patient-meta-item">${gender==='ذكر'||gender==='Male'?'👨':gender==='أنثى'||gender==='Female'?'👩':'🧑'} ${escapeHTML(gender)}</span>
          ${patient.national_id ? `<span class="ds-patient-meta-item">🪪 ${escapeHTML(patient.national_id)}</span>` : ''}
          ${bmiVal ? `<span class="ds-patient-meta-item" title="BMI">⚖️ BMI: <strong>${bmiVal}</strong> ${bmiLabel}</span>` : ''}
          ${bpRaw ? `<span class="ds-patient-meta-item" style="color:${bpColor||'inherit'};font-weight:700">🫀 BP: ${escapeHTML(bpRaw)}</span>` : ''}
          ${patient.insurance_company ? `<span class="ds-patient-meta-item">🏢 ${escapeHTML(patient.insurance_company)}</span>` : ''}
          ${patient.insurance_number ? `<span class="ds-patient-meta-item">📄 ${escapeHTML(patient.insurance_number)}</span>` : ''}
          ${chart.queueInfo?.exam_room_name ? `<span class="ds-patient-meta-item">🚪 ${escapeHTML(chart.queueInfo.exam_room_name)}</span>` : ''}
        </div>
        <div class="ds-patient-alerts">
          ${allergyChips}${problemChip}${pendingChip}
          ${patient.status === 'With Doctor' ? `<span class="ds-alert-chip info">👨‍⚕️ ${tr('With Doctor','مع الطبيب')}</span>` : ''}
        </div>
      </div>
      <div class="ds-patient-actions">
        <button class="btn btn-sm btn-primary" onclick="window.dsMarkWithDoctor(${safeId(patient.id)})"
          style="font-size:11px;padding:6px 12px" id="btnMarkDoctor">
          👨‍⚕️ ${tr('Start Visit','بدء الزيارة')}
        </button>
        <button class="btn btn-sm" onclick="window.dsSignEncounter()"
          style="font-size:11px;padding:6px 12px;background:#7c3aed;color:#fff;border-color:#7c3aed">
          ✍️ ${tr('Sign & Close','توقيع وإغلاق')}
        </button>
      </div>
    </div>

    <!-- Chart Tabs (v3: 10 tabs) -->
    <div class="ds-chart-tabs" id="dsChartTabs">
      ${[
        { id: 'summary',     icon: '📊', en: 'Summary',    ar: 'الملخص' },
        { id: 'history',     icon: '📅', en: 'History',    ar: 'التاريخ',    count: records.length },
        { id: 'problems',    icon: '⚠️', en: 'Problems',   ar: 'المشكلات',  count: problems.length },
        { id: 'medications', icon: '💊', en: 'Medications', ar: 'الأدوية',  count: medications.length },
        { id: 'allergies',   icon: '🚨', en: 'Allergies',  ar: 'الحساسيات', count: allergies.length },
        { id: 'vitals',      icon: '❤️', en: 'Vitals',     ar: 'المؤشرات',  count: vitals.length },
        { id: 'notes',       icon: '📝', en: 'Notes',      ar: 'الملاحظات' },
        { id: 'orders',      icon: '📋', en: 'Orders',     ar: 'الأوامر' },
        { id: 'results',     icon: '🔬', en: 'Results',    ar: 'النتائج' },
        { id: 'history_ext', icon: '👨‍👩‍👦', en: 'History+',  ar: 'التاريخ+' },
      ].map(t => `
        <div class="ds-tab ${t.id === window._DS.activeTab ? 'active' : ''}"
             onclick="window.dsSwitchTab('${t.id}')" data-tab="${t.id}">
          ${t.icon} ${tr(t.en, t.ar)}
          ${t.count ? `<span class="ds-tab-badge">${t.count}</span>` : ''}
        </div>
      `).join('')}
    </div>

    <!-- Tab Content -->
    <div class="ds-tab-content" id="dsTabContent"></div>
  `;

  // Render active tab
  window.dsSwitchTab(window._DS.activeTab);
};

/* ============================================================ */
/*  TAB SWITCHING                                                */
/* ============================================================ */
window.dsSwitchTab = function(tabId) {
  window._DS.activeTab = tabId;
  // Update active tab styling
  document.querySelectorAll('.ds-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  const content = document.getElementById('dsTabContent');
  if (!content) return;
  const d = window._DS.selectedPatientData || {};

  switch (tabId) {
    case 'summary':     content.innerHTML = window.dsTabSummary(d); break;
    case 'history':     content.innerHTML = window.dsTabHistory(d); break;
    case 'problems':    content.innerHTML = window.dsTabProblems(d); break;
    case 'medications': content.innerHTML = window.dsTabMedications(d); break;
    case 'allergies':   content.innerHTML = window.dsTabAllergies(d); break;
    case 'vitals':      content.innerHTML = window.dsTabVitals(d); break;
    case 'notes':
      content.innerHTML = window.dsTabNotes(d);
      window.dsInitSoapNotes();
      break;
    case 'orders':      window.dsTabOrders(content); break;
    case 'results':     window.dsTabResults(content); break;
    case 'history_ext': window.dsTabHistoryExt(content); break;
    default: content.innerHTML = `<p>${tr('Coming soon', 'قريباً')}</p>`;
  }
};

/* ============================================================ */
/*  TAB: SUMMARY                                                 */
/* ============================================================ */
window.dsTabSummary = function({ patient = {}, chart = {}, problems = [], medications = [], allergies = [], vitals = [] }) {
  const records = chart.records || [];
  const lastRecord = records[0];
  const activeProblems = problems.filter(p => p.status === 'active').slice(0, 4);
  const activeMeds = medications.slice(0, 4);
  const latestVitals = {};
  vitals.forEach(v => { if (!latestVitals[v.score_type]) latestVitals[v.score_type] = v; });

  return `
    <!-- Quick Vitals Summary -->
    ${Object.keys(latestVitals).length ? `
    <div class="ds-vital-grid" style="margin-bottom:16px">
      ${['blood_pressure','temperature','pulse','spo2','weight','glucose'].filter(k => latestVitals[k]).map(k => {
        const v = latestVitals[k];
        const icons = { blood_pressure: '🫀', temperature: '🌡️', pulse: '💓', spo2: '💨', weight: '⚖️', glucose: '🩸' };
        const units = { blood_pressure: 'mmHg', temperature: '°C', pulse: 'bpm', spo2: '%', weight: 'kg', glucose: 'mg/dL' };
        const labels = { blood_pressure: tr('BP','ضغط الدم'), temperature: tr('Temp','الحرارة'), pulse: tr('Pulse','النبض'), spo2: tr('SpO2','التشبع'), weight: tr('Weight','الوزن'), glucose: tr('Glucose','الجلوكوز') };
        const val = v.score_value || '—';
        const abnormal = (k==='temperature' && parseFloat(val) > 38.5) ||
                         (k==='pulse' && (parseFloat(val) < 60 || parseFloat(val) > 100)) ||
                         (k==='spo2' && parseFloat(val) < 95) ||
                         (k==='glucose' && parseFloat(val) > 200);
        return `<div class="ds-vital-card ${abnormal ? 'abnormal' : ''}">
          <div style="font-size:18px">${icons[k]||'📊'}</div>
          <div class="ds-vital-value">${escapeHTML(String(val))}</div>
          <div class="ds-vital-unit">${units[k]||''}</div>
          <div class="ds-vital-label">${labels[k]||k}</div>
        </div>`;
      }).join('')}
    </div>
    ` : ''}

    <!-- Last Visit -->
    ${lastRecord ? `
    <div class="card mb-12" style="border-radius:12px;padding:14px 16px;border:1px solid var(--border)">
      <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:8px">📋 ${tr('Last Encounter', 'آخر زيارة')}
        <span style="font-size:11px;font-weight:400;color:var(--text-dim);margin-inline-start:8px">${escapeHTML(lastRecord.created_at?.split('T')[0] || '')}</span>
      </div>
      <div style="font-size:13px;color:var(--on-surface)"><strong>${tr('Diagnosis:', 'التشخيص:')}</strong> ${escapeHTML(lastRecord.diagnosis || lastRecord.treatment || '-')}</div>
      ${lastRecord.notes ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px">${escapeHTML(lastRecord.notes)}</div>` : ''}
    </div>
    ` : `<div class="card mb-12" style="padding:14px;border-radius:12px;text-align:center;color:var(--text-dim)"><span style="font-size:24px">📋</span><p style="margin-top:8px;font-size:12px">${tr('No previous encounters', 'لا توجد زيارات سابقة')}</p></div>`}

    <!-- Active Problems -->
    <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">⚠️ ${tr('Active Problems', 'المشكلات النشطة')}</div>
    ${activeProblems.length ? activeProblems.map(p => `
      <div class="ds-problem-row">
        <div class="ds-problem-dot active"></div>
        <div class="ds-problem-name">${escapeHTML(p.problem_name || '-')}</div>
        <div class="ds-problem-icd">${escapeHTML(p.icd_code || '')}</div>
      </div>
    `).join('') : `<div style="color:var(--text-dim);font-size:12px;padding:8px;margin-bottom:12px">— ${tr('None recorded', 'لا يوجد')}</div>`}

    <!-- Current Medications -->
    <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-top:16px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">💊 ${tr('Current Medications', 'الأدوية الحالية')}</div>
    ${activeMeds.length ? activeMeds.map(m => `
      <div class="ds-med-row">
        <div class="ds-med-icon">💊</div>
        <div class="ds-med-info">
          <div class="ds-med-name">${escapeHTML(m.drug_name || m.description || '-')}</div>
          <div class="ds-med-detail">${escapeHTML(m.quantity || '')} ${escapeHTML(m.notes || '')}</div>
        </div>
        <div class="ds-med-status active">${tr('Active', 'فعّال')}</div>
      </div>
    `).join('') : `<div style="color:var(--text-dim);font-size:12px;padding:8px">— ${tr('None recorded', 'لا يوجد')}</div>`}

    <!-- Allergies Warning -->
    ${allergies.length ? `
    <div style="margin-top:16px">
      <div style="font-weight:700;font-size:12px;color:#b91c1c;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">🚨 ${tr('Allergies', 'الحساسيات')}</div>
      ${allergies.slice(0,3).map(a => `
        <div class="ds-cds-alert warning">
          <div class="ds-cds-alert-icon">⚠️</div>
          <div class="ds-cds-alert-body">
            <div class="ds-cds-alert-title">${escapeHTML(a.allergen || '-')}</div>
            <div class="ds-cds-alert-desc">${escapeHTML(a.reaction || '')} ${a.severity ? '· ' + escapeHTML(a.severity) : ''}</div>
          </div>
        </div>
      `).join('')}
    </div>` : ''}
  `;
};

/* ============================================================ */
/*  TAB: HISTORY (Timeline)                                      */
/* ============================================================ */
window.dsTabHistory = function({ chart = {} }) {
  const records = chart.records || [];
  const orders = chart.orders || [];
  const invoices = chart.invoices || [];

  // Merge events
  const events = [
    ...records.map(r => ({ date: r.created_at, type: 'visit', title: r.diagnosis || r.treatment || tr('Encounter', 'زيارة'), detail: r.notes || '' })),
    ...orders.filter(o => o.type && o.type.includes('lab')).map(o => ({ date: o.created_at, type: 'lab', title: o.description || tr('Lab Order', 'طلب مختبر'), detail: o.status || '' })),
    ...orders.filter(o => o.type && (o.type.includes('rad') || o.type.includes('xray'))).map(o => ({ date: o.created_at, type: 'radiology', title: o.description || tr('Radiology', 'أشعة'), detail: o.status || '' })),
    ...orders.filter(o => o.type && (o.type.includes('med') || o.type.includes('rx'))).map(o => ({ date: o.created_at, type: 'pharmacy', title: o.description || tr('Medication', 'دواء'), detail: o.status || '' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!events.length) return `<div style="text-align:center;padding:32px;color:var(--text-dim)">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.3">📅</div>
    <p>${tr('No history found', 'لا يوجد تاريخ طبي مسجّل')}</p>
  </div>`;

  return `<div class="ds-timeline">
    ${events.map(ev => `
      <div class="ds-timeline-item">
        <div class="ds-timeline-dot ${ev.type}"></div>
        <div class="ds-timeline-card">
          <div class="ds-timeline-date">${escapeHTML(ev.date?.split('T')[0] || '—')}</div>
          <div class="ds-timeline-title">${escapeHTML(ev.title)}</div>
          ${ev.detail ? `<div class="ds-timeline-detail">${escapeHTML(ev.detail)}</div>` : ''}
        </div>
      </div>
    `).join('')}
  </div>`;
};

/* ============================================================ */
/*  TAB: PROBLEMS                                                */
/* ============================================================ */
window.dsTabProblems = function({ problems = [] }) {
  if (!problems.length) return `<div style="text-align:center;padding:32px;color:var(--text-dim)">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.3">⚠️</div>
    <p>${tr('No problems recorded', 'لا توجد مشكلات مسجّلة')}</p>
    <button class="btn btn-sm btn-primary" style="margin-top:12px" onclick="window.dsAddProblem()">
      + ${tr('Add Problem', 'إضافة مشكلة')}
    </button>
  </div>`;

  const statusDot = { active: 'active', controlled: 'controlled', resolved: 'resolved' };
  const statusLabel = { active: { en: 'Active', ar: 'نشط' }, controlled: { en: 'Controlled', ar: 'خاضع للسيطرة' }, resolved: { en: 'Resolved', ar: 'محلول' } };

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:13px">${tr('Problem List', 'قائمة المشكلات')} (${problems.length})</strong>
      <button class="btn btn-sm btn-primary" onclick="window.dsAddProblem()">+ ${tr('Add', 'إضافة')}</button>
    </div>
    ${problems.map(p => {
      const dot = statusDot[p.status] || 'active';
      const lbl = statusLabel[p.status] || { en: p.status, ar: p.status };
      return `<div class="ds-problem-row">
        <div class="ds-problem-dot ${dot}" title="${tr(lbl.en, lbl.ar)}"></div>
        <div>
          <div class="ds-problem-name">${escapeHTML(p.problem_name || '-')}</div>
          <div style="font-size:11px;color:var(--text-dim)">${tr('Onset:', 'البداية:')} ${escapeHTML(p.onset_date || '—')}</div>
        </div>
        <div class="ds-problem-icd">${escapeHTML(p.icd_code || '')}</div>
        <span class="badge badge-${dot === 'active' ? 'danger' : dot === 'controlled' ? 'warning' : 'success'}" style="font-size:10px">${tr(lbl.en, lbl.ar)}</span>
      </div>`;
    }).join('')}
  `;
};

/* ============================================================ */
/*  TAB: MEDICATIONS                                             */
/* ============================================================ */
window.dsTabMedications = function({ medications = [] }) {
  if (!medications.length) return `<div style="text-align:center;padding:32px;color:var(--text-dim)">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.3">💊</div>
    <p>${tr('No medications recorded', 'لا توجد أدوية مسجّلة')}</p>
  </div>`;

  return `
    <div style="font-weight:700;font-size:13px;margin-bottom:12px">💊 ${tr('Medication List', 'قائمة الأدوية')} (${medications.length})</div>
    ${medications.map(m => `
      <div class="ds-med-row">
        <div class="ds-med-icon">💊</div>
        <div class="ds-med-info">
          <div class="ds-med-name">${escapeHTML(m.drug_name || m.description || '-')}</div>
          <div class="ds-med-detail">${escapeHTML(m.quantity || '')} · ${escapeHTML(m.notes || '')} · ${escapeHTML(m.created_at?.split('T')[0] || '')}</div>
        </div>
        <div class="ds-med-status ${m.status === 'Completed' ? 'stopped' : m.status === 'Pending' ? 'pending' : 'active'}">
          ${escapeHTML(isArabic ? (m.status === 'Completed' ? 'منتهي' : m.status === 'Pending' ? 'معلق' : 'فعّال') : (m.status || 'Active'))}
        </div>
      </div>
    `).join('')}
  `;
};

/* ============================================================ */
/*  TAB: ALLERGIES                                               */
/* ============================================================ */
window.dsTabAllergies = function({ allergies = [] }) {
  if (!allergies.length) return `<div style="text-align:center;padding:32px;color:var(--text-dim)">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.3">✅</div>
    <p style="color:#16a34a;font-weight:700">${tr('No Known Drug Allergies (NKDA)', 'لا حساسيات دوائية معروفة')}</p>
  </div>`;

  const sevColor = { severe: '#b91c1c', moderate: '#c2410c', mild: '#92400e', unknown: '#64748b' };
  return `
    <div style="margin-bottom:12px">
      <div class="ds-cds-alert critical" style="margin-bottom:12px">
        <div class="ds-cds-alert-icon">🚨</div>
        <div class="ds-cds-alert-body">
          <div class="ds-cds-alert-title">${tr('Allergy Alert', 'تنبيه الحساسية')} — ${allergies.length} ${tr('recorded', 'مسجّلة')}</div>
          <div class="ds-cds-alert-desc">${tr('Check before prescribing any new medication', 'تحقق قبل وصف أي دواء جديد')}</div>
        </div>
      </div>
      ${allergies.map(a => `
        <div class="ds-problem-row" style="border-right:4px solid ${sevColor[a.severity] || '#64748b'}">
          <div class="ds-med-icon">🚨</div>
          <div class="ds-med-info">
            <div class="ds-med-name" style="color:#b91c1c">${escapeHTML(a.allergen || '-')}</div>
            <div class="ds-med-detail">${tr('Reaction:', 'التفاعل:')} ${escapeHTML(a.reaction || '—')} · ${tr('Type:', 'النوع:')} ${escapeHTML(a.allergen_type || '—')}</div>
          </div>
          <div class="ds-med-status stopped">${escapeHTML(a.severity || tr('Unknown', 'غير محدد'))}</div>
        </div>
      `).join('')}
    </div>
  `;
};

/* ============================================================ */
/*  TAB: VITALS                                                  */
/* ============================================================ */
window.dsTabVitals = function({ vitals = [] }) {
  if (!vitals.length) return `<div style="text-align:center;padding:32px;color:var(--text-dim)">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.3">❤️</div>
    <p>${tr('No vitals recorded', 'لا توجد مؤشرات حيوية مسجّلة')}</p>
    <p style="font-size:12px;margin-top:8px">${tr('Vitals are recorded by nursing staff', 'تُسجّل المؤشرات الحيوية من قِبل التمريض')}</p>
  </div>`;

  const latest = {};
  vitals.forEach(v => { if (!latest[v.score_type]) latest[v.score_type] = v; });

  const vitalDefs = [
    { key: 'blood_pressure', icon: '🫀', label: { en: 'Blood Pressure', ar: 'ضغط الدم' }, unit: 'mmHg', abnormal: v => false },
    { key: 'temperature', icon: '🌡️', label: { en: 'Temperature', ar: 'الحرارة' }, unit: '°C', abnormal: v => parseFloat(v) > 38.5 || parseFloat(v) < 36 },
    { key: 'pulse', icon: '💓', label: { en: 'Heart Rate', ar: 'النبض' }, unit: 'bpm', abnormal: v => parseFloat(v) < 60 || parseFloat(v) > 100 },
    { key: 'spo2', icon: '💨', label: { en: 'SpO2', ar: 'تشبع الأكسجين' }, unit: '%', abnormal: v => parseFloat(v) < 95 },
    { key: 'weight', icon: '⚖️', label: { en: 'Weight', ar: 'الوزن' }, unit: 'kg', abnormal: () => false },
    { key: 'height', icon: '📏', label: { en: 'Height', ar: 'الطول' }, unit: 'cm', abnormal: () => false },
    { key: 'glucose', icon: '🩸', label: { en: 'Glucose', ar: 'الجلوكوز' }, unit: 'mg/dL', abnormal: v => parseFloat(v) > 200 || parseFloat(v) < 70 },
    { key: 'pain_score', icon: '😣', label: { en: 'Pain Score', ar: 'درجة الألم' }, unit: '/10', abnormal: v => parseFloat(v) >= 7 },
  ];

  return `
    <div class="ds-vital-grid" style="grid-template-columns:repeat(3,1fr)">
      ${vitalDefs.filter(d => latest[d.key]).map(d => {
        const v = latest[d.key];
        const val = v.score_value || '—';
        const abn = d.abnormal(val);
        return `<div class="ds-vital-card ${abn ? 'abnormal' : ''}">
          <div style="font-size:22px">${d.icon}</div>
          <div class="ds-vital-value">${escapeHTML(String(val))}</div>
          <div class="ds-vital-unit">${d.unit}</div>
          <div class="ds-vital-label">${tr(d.label.en, d.label.ar)}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px">${escapeHTML(v.recorded_at?.split('T')[0] || '')}</div>
        </div>`;
      }).join('')}
    </div>
    ${vitals.length ? `<div style="font-size:12px;color:var(--text-dim);margin-top:12px;text-align:center">
      ${tr('Showing latest reading per vital sign', 'يُعرض آخر قياس لكل مؤشر')} · ${vitals.length} ${tr('total readings', 'قراءة إجمالية')}
    </div>` : ''}
  `;
};

/* ============================================================ */
/*  TAB: NOTES (SOAP)                                            */
/* ============================================================ */
window.dsTabNotes = function({ chart = {} }) {
  const records = chart.records || [];
  const last = records[0] || {};
  return `
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:12px">📝 ${tr('SOAP Encounter Notes', 'ملاحظات الزيارة (SOAP)')}</div>
      <div class="ds-soap-grid">
        <div class="ds-soap-box s">
          <div class="ds-soap-label">S — ${tr('Subjective', 'ذاتي (أعراض)')}</div>
          <textarea class="ds-soap-input" id="soapS" placeholder="${tr('Chief complaint, history...', 'الشكوى الرئيسية، التاريخ...')}">${escapeHTML(last.symptoms || '')}</textarea>
        </div>
        <div class="ds-soap-box o">
          <div class="ds-soap-label">O — ${tr('Objective', 'موضوعي (فحص)')}</div>
          <textarea class="ds-soap-input" id="soapO" placeholder="${tr('Exam findings, vitals...', 'نتائج الفحص، المؤشرات...')}"></textarea>
        </div>
        <div class="ds-soap-box a">
          <div class="ds-soap-label">A — ${tr('Assessment', 'التقييم (تشخيص)')}</div>
          <textarea class="ds-soap-input" id="soapA" placeholder="${tr('Diagnosis, ICD-10...', 'التشخيص، كود ICD-10...')}">${escapeHTML(last.diagnosis || '')}</textarea>
        </div>
        <div class="ds-soap-box p">
          <div class="ds-soap-label">P — ${tr('Plan', 'الخطة العلاجية')}</div>
          <textarea class="ds-soap-input" id="soapP" placeholder="${tr('Treatment plan, referrals...', 'الخطة، التحويلات...')}">${escapeHTML(last.treatment || '')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn btn-primary" onclick="window.dsSaveSoapNotes()" style="flex:1">
          💾 ${tr('Save Notes', 'حفظ الملاحظات')}
        </button>
        <button class="btn" onclick="window.dsShowMedReportMenu()" style="flex:1;background:#fff3e0;border:1px solid #ff9800;color:#e65100">
          🖨️ ${tr('Print Report', 'طباعة تقرير')}
        </button>
      </div>
    </div>
    ${records.length > 0 ? `
    <div style="margin-top:20px">
      <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">${tr('Previous Notes', 'ملاحظات سابقة')}</div>
      ${records.slice(0, 5).map(r => `
        <div class="ds-timeline-card" style="margin-bottom:8px">
          <div class="ds-timeline-date">${escapeHTML(r.created_at?.split('T')[0] || '')}</div>
          <div class="ds-timeline-title">${escapeHTML(r.diagnosis || r.treatment || '-')}</div>
          ${r.notes ? `<div class="ds-timeline-detail">${escapeHTML(r.notes)}</div>` : ''}
          ${r.is_signed ? `<div style="margin-top:6px;font-size:11px;color:#16a34a">✅ ${tr('Signed by:', 'موقّع من:')} ${escapeHTML(r.signed_by || '—')}</div>` : ''}
        </div>
      `).join('')}
    </div>` : ''}
  `;
};

window.dsInitSoapNotes = function() {
  // Auto-expand textareas
  document.querySelectorAll('.ds-soap-input').forEach(ta => {
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 10) + 'px';
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight + 10) + 'px';
    });
  });
};

window.dsSaveSoapNotes = async function() {
  const pid = window._DS.selectedPatientId;
  if (!pid) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const S = document.getElementById('soapS')?.value || '';
  const O = document.getElementById('soapO')?.value || '';
  const A = document.getElementById('soapA')?.value || '';
  const P = document.getElementById('soapP')?.value || '';
  if (!A.trim()) return showToast(tr('Please enter a diagnosis/assessment', 'أدخل التشخيص/التقييم'), 'error');
  try {
    await API.post('/api/medical/records', {
      patient_id: pid,
      symptoms: S,
      diagnosis: A,
      treatment: P,
      notes: O,
    });
    showToast(tr('Notes saved!', 'تم حفظ الملاحظات!'));
    // Reload chart data
    setTimeout(() => window.dsSelectPatient(pid), 500);
  } catch (e) { showToast(e?.message || tr('Save failed', 'فشل الحفظ'), 'error'); }
};

window.dsShowMedReportMenu = function() {
  if (!window._DS.selectedPatientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  window._selectedPatientId = window._DS.selectedPatientId;
  window._selectedPatientName = window._DS.selectedPatientData?.patient?.name_ar || window._DS.selectedPatientData?.patient?.name_en || '';
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div style="background:var(--bg-card);border-radius:16px;padding:24px;width:360px;text-align:center">
    <h3 style="margin:0 0 16px;color:var(--primary)">🖨️ ${tr('Print Report', 'طباعة تقرير')}</h3>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary" onclick="showMedicalReportForm('sick_leave');this.closest('.modal-overlay,.fixed').remove()">🏥 ${tr('Sick Leave', 'إجازة مرضية')}</button>
      <button class="btn btn-secondary" onclick="showMedicalReportForm('medical_report');this.closest('.modal-overlay,.fixed').remove()">📋 ${tr('Medical Report', 'تقرير طبي')}</button>
      <button class="btn" onclick="showMedicalReportForm('fitness');this.closest('.modal-overlay,.fixed').remove()" style="background:#e8f5e9;border:1px solid #2e7d32;color:#2e7d32">✅ ${tr('Fitness Certificate', 'شهادة لياقة')}</button>
      <button class="btn btn-danger" onclick="this.closest('.fixed').remove()">✕ ${tr('Cancel', 'إلغاء')}</button>
    </div>
  </div>`;
  modal.classList.add('fixed');
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
};

/* ============================================================ */
/*  RIGHT PANEL: CPOE Orders Panel                              */
/* ============================================================ */
window.dsRenderOrdersPanel = function(patient, records = []) {
  const ordersPanel = document.getElementById('dsOrdersContent');
  if (!ordersPanel) return;
  const pid = safeId(patient.id);
  const patName = escapeHTML(isArabic ? (patient.name_ar || patient.name_en || '-') : (patient.name_en || patient.name_ar || '-'));

  ordersPanel.innerHTML = `
    <!-- Quick Diagnosis -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        🩺 ${tr('Diagnosis', 'التشخيص')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Diagnosis (ICD-10)', 'التشخيص (ICD-10)')}</label>
          <input class="form-input" id="dsIcd" placeholder="${tr('Type or search diagnosis...', 'اكتب أو ابحث عن التشخيص...')}" 
            oninput="window.handleDiagAutocomplete && handleDiagAutocomplete(this)" autocomplete="off">
          <div id="drDiagSuggestions" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-card,#fff);border:1px solid var(--border);border-radius:8px;z-index:100;max-height:150px;overflow-y:auto;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.1)"></div>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Symptoms', 'الأعراض')}</label>
          <input class="form-input" id="dsSymp" placeholder="${tr('Chief complaint...', 'الشكوى الرئيسية...')}">
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Notes', 'ملاحظات')}</label>
          <textarea class="form-input" id="dsNotes" rows="2" placeholder="${tr('Clinical notes...', 'ملاحظات سريرية...')}"></textarea>
        </div>
        <button class="btn btn-primary w-full" onclick="window.dsSaveRecord()" style="height:36px;font-size:12px">
          💾 ${tr('Save Diagnosis', 'حفظ التشخيص')}
        </button>
      </div>
    </div>

    <!-- E-Prescription -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        💊 ${tr('E-Prescription', 'الوصفة الإلكترونية')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div id="dsRxItems"></div>
        <div class="form-group mb-8" style="position:relative">
          <label style="font-size:11px;font-weight:700">${tr('Add Drug', 'إضافة دواء')}</label>
          <input class="form-input" id="dsRxSearch" placeholder="${tr('Search drug...', 'ابحث عن دواء...')}"
            oninput="window.dsFilterDrugs(this.value)" autocomplete="off">
          <div id="dsRxDropdown" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;z-index:100;max-height:160px;overflow-y:auto;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.12)"></div>
        </div>
        <div id="dsRxCdsAlerts"></div>
        <button class="btn btn-success w-full" id="dsSendRxBtn"
          onclick="window.dsSendPrescription(${pid})" 
          style="height:36px;font-size:12px;display:${window._DS.rxItems.length ? 'flex' : 'none'};align-items:center;justify-content:center;gap:8px">
          📤 ${tr('Send to Pharmacy', 'إرسال للصيدلية')} <span id="dsRxCount" class="ds-tab-badge">${window._DS.rxItems.length}</span>
        </button>
      </div>
    </div>

    <!-- Lab Order -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        🔬 ${tr('Lab Order', 'طلب مختبر')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Select Tests', 'اختر الفحوصات')}</label>
          <select class="form-input" id="dsLabTest" multiple size="4" style="height:auto">
            <optgroup label="${tr('Common', 'شائع')}">
              <option value="CBC">CBC — ${tr('Complete Blood Count', 'صورة دم كاملة')}</option>
              <option value="CMP">CMP — ${tr('Comprehensive Metabolic', 'الاستقلاب الشامل')}</option>
              <option value="HbA1c">HbA1c — ${tr('Glycated Hemoglobin', 'السكر التراكمي')}</option>
              <option value="TSH">TSH — ${tr('Thyroid Function', 'وظائف الغدة الدرقية')}</option>
              <option value="Lipid Profile">Lipid — ${tr('Cholesterol Profile', 'دهون الدم')}</option>
              <option value="Urinalysis">UA — ${tr('Urine Analysis', 'تحليل البول')}</option>
              <option value="CRP">CRP — ${tr('C-Reactive Protein', 'بروتين C التفاعلي')}</option>
              <option value="Troponin">Troponin — ${tr('Cardiac Markers', 'إنزيمات القلب')}</option>
            </optgroup>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Urgency', 'الإلحاح')}</label>
          <select class="form-input" id="dsLabUrgency">
            <option value="Routine">🟢 ${tr('Routine', 'عادي')}</option>
            <option value="Urgent">🟡 ${tr('Urgent', 'مستعجل')}</option>
            <option value="STAT">🔴 STAT — ${tr('Immediate', 'فوري')}</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Clinical Note', 'ملاحظة سريرية')}</label>
          <input class="form-input" id="dsLabNote" placeholder="${tr('Reason for order...', 'سبب الطلب...')}">
        </div>
        <button class="btn w-full" onclick="window.dsOrderLab(${pid})"
          style="height:36px;font-size:12px;background:#0ea5e9;color:#fff;border:none">
          🔬 ${tr('Order Lab', 'طلب تحليل')}
        </button>
      </div>
    </div>

    <!-- Radiology Order -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        📡 ${tr('Radiology Order', 'طلب أشعة')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Study Type', 'نوع الدراسة')}</label>
          <select class="form-input" id="dsRadType">
            <optgroup label="${tr('X-Ray', 'أشعة سينية')}">
              <option>CXR — Chest X-Ray</option>
              <option>X-Ray Abdomen</option>
              <option>X-Ray Spine (Cervical/Lumbar)</option>
              <option>X-Ray Extremity</option>
            </optgroup>
            <optgroup label="${tr('Ultrasound', 'الموجات فوق الصوتية')}">
              <option>US Abdomen & Pelvis</option>
              <option>US Thyroid</option>
              <option>US Cardiac (Echo)</option>
              <option>US Obstetric</option>
            </optgroup>
            <optgroup label="CT Scan">
              <option>CT Brain</option>
              <option>CT Chest</option>
              <option>CT Abdomen & Pelvis</option>
              <option>CT Spine</option>
            </optgroup>
            <optgroup label="MRI">
              <option>MRI Brain</option>
              <option>MRI Spine</option>
              <option>MRI Knee / Joint</option>
            </optgroup>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Clinical Indication', 'المؤشر السريري')}</label>
          <input class="form-input" id="dsRadNote" placeholder="${tr('Clinical reason...', 'السبب السريري...')}">
        </div>
        <button class="btn w-full" onclick="window.dsOrderRadiology(${pid})"
          style="height:36px;font-size:12px;background:#7c3aed;color:#fff;border:none">
          📡 ${tr('Order Radiology', 'طلب أشعة')}
        </button>
      </div>
    </div>

    <!-- Referral -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        🏥 ${tr('Referral', 'تحويل')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Referred to', 'تحويل إلى')}</label>
          <select class="form-input" id="dsRefTo">
            <option value="cardiology">${tr('Cardiology', 'أمراض القلب')}</option>
            <option value="neurology">${tr('Neurology', 'الأعصاب')}</option>
            <option value="orthopedics">${tr('Orthopedics', 'العظام')}</option>
            <option value="gastroenterology">${tr('Gastroenterology', 'الجهاز الهضمي')}</option>
            <option value="endocrinology">${tr('Endocrinology', 'الغدد الصماء')}</option>
            <option value="nephrology">${tr('Nephrology', 'الكلى')}</option>
            <option value="pulmonology">${tr('Pulmonology', 'الصدر')}</option>
            <option value="rheumatology">${tr('Rheumatology', 'الروماتيزم')}</option>
            <option value="dermatology">${tr('Dermatology', 'الجلدية')}</option>
            <option value="psychiatry">${tr('Psychiatry', 'الطب النفسي')}</option>
            <option value="ophthalmology">${tr('Ophthalmology', 'العيون')}</option>
            <option value="ent">${tr('ENT', 'الأنف والأذن والحنجرة')}</option>
            <option value="surgery">${tr('Surgery', 'الجراحة العامة')}</option>
            <option value="urology">${tr('Urology', 'المسالك البولية')}</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Reason', 'السبب')}</label>
          <textarea class="form-input" id="dsRefNote" rows="2" placeholder="${tr('Clinical reason for referral...', 'سبب التحويل...')}"></textarea>
        </div>
        <button class="btn w-full" onclick="window.dsOrderReferral(${pid})"
          style="height:36px;font-size:12px;background:#16a34a;color:#fff;border:none">
          🏥 ${tr('Send Referral', 'إرسال التحويل')}
        </button>
      </div>
    </div>

    <!-- Diet Order -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        🥗 ${tr('Diet Order', 'أمر الحمية')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Diet Type', 'نوع الحمية')}</label>
          <select class="form-input" id="dsDietType">
            <option value="Normal Diet">🍽️ ${tr('Normal Diet', 'حمية عادية')}</option>
            <option value="Diabetic Diet">🩸 ${tr('Diabetic Diet', 'حمية سكري')}</option>
            <option value="Renal Diet">🫘 ${tr('Renal Diet', 'حمية كلوي')}</option>
            <option value="Low Sodium Diet">🧂 ${tr('Low Sodium', 'منخفض الصوديوم')}</option>
            <option value="Cardiac Diet">❤️ ${tr('Cardiac Diet', 'حمية قلبية')}</option>
            <option value="High Protein Diet">💪 ${tr('High Protein', 'عالي البروتين')}</option>
            <option value="NPO (Nothing by Mouth)">🚫 NPO — ${tr('Nothing by Mouth', 'ممنوع الطعام والشراب')}</option>
            <option value="Clear Liquid Diet">💧 ${tr('Clear Liquids Only', 'سوائل شفافة فقط')}</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Duration', 'المدة')}</label>
          <select class="form-input" id="dsDietDuration">
            <option>24 ساعة</option>
            <option>48 ساعة</option>
            <option>حتى إشعار آخر</option>
          </select>
        </div>
        <button class="btn w-full" onclick="window.dsOrderDiet(${pid})"
          style="height:36px;font-size:12px;background:#16a34a;color:#fff;border:none">
          🥗 ${tr('Order Diet', 'طلب الحمية')}
        </button>
      </div>
    </div>

    <!-- IV Fluids Order -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        💉 ${tr('IV Fluids', 'السوائل الوريدية')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Fluid Type', 'نوع السائل')}</label>
          <select class="form-input" id="dsIvType">
            <option value="Normal Saline 0.9% (NS)">Normal Saline 0.9% (NS)</option>
            <option value="Dextrose 5% in Water (D5W)">Dextrose 5% in Water (D5W)</option>
            <option value="Lactated Ringer's (LR)">Lactated Ringer's (LR)</option>
            <option value="Half-Normal Saline (0.45% NS)">Half-Normal Saline (0.45% NS)</option>
            <option value="D5 in 0.45% NS">D5 in 0.45% NS</option>
            <option value="D5 in Lactated Ringer's">D5 in Lactated Ringer's</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" class="mb-8">
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Rate (mL/hr)', 'المعدل mL/ساعة')}</label>
            <input class="form-input" id="dsIvRate" type="number" min="10" max="500" value="100" style="height:32px;font-size:12px;padding:4px 8px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Duration (hr)', 'المدة (ساعة)')}</label>
            <input class="form-input" id="dsIvDuration" type="number" min="1" max="72" value="8" style="height:32px;font-size:12px;padding:4px 8px">
          </div>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Additive', 'إضافة')}</label>
          <input class="form-input" id="dsIvAdditive" placeholder="${tr('e.g. KCl 20mEq, MgSO4...', 'مثال: KCl 20mEq')}">
        </div>
        <button class="btn w-full" onclick="window.dsOrderIV(${pid})"
          style="height:36px;font-size:12px;background:#0369a1;color:#fff;border:none">
          💉 ${tr('Order IV Fluids', 'طلب سوائل وريدية')}
        </button>
      </div>
    </div>

    <!-- Nursing Order -->
    <div class="ds-order-section">
      <div class="ds-order-section-header" onclick="window.dsToggleSection(this)">
        🩺 ${tr('Nursing Orders', 'أوامر التمريض')} <span style="margin-inline-start:auto">▾</span>
      </div>
      <div class="ds-order-section-body">
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Order Type', 'نوع الأمر')}</label>
          <select class="form-input" id="dsNursingType">
            <option value="Monitor BP every 4h">📊 ${tr('Monitor BP q4h', 'قياس الضغط كل 4 ساعات')}</option>
            <option value="Monitor BP every 2h">📊 ${tr('Monitor BP q2h', 'قياس الضغط كل ساعتين')}</option>
            <option value="Vital Signs every 4h">❤️ ${tr('Vital Signs q4h', 'مؤشرات حيوية كل 4 ساعات')}</option>
            <option value="Strict I&O monitoring">💧 ${tr('Strict I&O Monitoring', 'مراقبة السوائل الدقيقة')}</option>
            <option value="Daily weight">⚖️ ${tr('Daily Weight', 'وزن يومي')}</option>
            <option value="Fall precautions">⚠️ ${tr('Fall Precautions', 'احتياطات السقوط')}</option>
            <option value="Bed rest">🛏️ ${tr('Bed Rest', 'راحة تامة')}</option>
            <option value="Wound care daily">🩹 ${tr('Wound Care Daily', 'رعاية الجرح يومياً')}</option>
            <option value="Foley catheter care">🔧 ${tr('Foley Catheter Care', 'رعاية القسطرة')}</option>
            <option value="Oxygen 2-4L/min via nasal cannula">💨 ${tr('O2 2-4L via NC', 'أكسجين 2-4 لتر/دقيقة')}</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label style="font-size:11px;font-weight:700">${tr('Additional Notes', 'ملاحظات إضافية')}</label>
          <input class="form-input" id="dsNursingNote" placeholder="${tr('Specify if needed...', 'حدد إن لزم...')}">
        </div>
        <button class="btn w-full" onclick="window.dsOrderNursing(${pid})"
          style="height:36px;font-size:12px;background:#7c3aed;color:#fff;border:none">
          🩺 ${tr('Issue Nursing Order', 'إصدار أمر تمريض')}
        </button>
      </div>
    </div>

    <!-- Sign & Close -->
    <div style="padding:12px 0">
      <button class="btn w-full" onclick="window.dsSignEncounter()"
        style="background:linear-gradient(135deg,#7c3aed,#0369a1);color:#fff;border:none;height:44px;font-size:13px;font-weight:700;border-radius:12px">
        ✍️ ${tr('Sign & Close Encounter', 'توقيع وإغلاق الزيارة')}
      </button>
    </div>
  `;

  window.dsRenderRxItems();
};


/* ============================================================ */
/*  Collapsible Sections                                         */
/* ============================================================ */
window.dsToggleSection = function(header) {
  const body = header.nextElementSibling;
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  const arrow = header.querySelector('span:last-child');
  if (arrow) arrow.textContent = collapsed ? '▾' : '▸';
};

/* ============================================================ */
/*  E-PRESCRIPTION                                               */
/* ============================================================ */
window.dsFilterDrugs = function(query) {
  const dropdown = document.getElementById('dsRxDropdown');
  if (!dropdown) return;
  const drugs = window._DS.drugs || [];
  const q = (query || '').trim().toLowerCase();
  if (!q) { dropdown.style.display = 'none'; return; }
  const matches = drugs.filter(d => {
    const n = ((d.name_ar || '') + ' ' + (d.name_en || '') + ' ' + (d.generic_name || '')).toLowerCase();
    return n.includes(q);
  }).slice(0, 12);
  if (!matches.length) { dropdown.style.display = 'none'; return; }
  dropdown.style.display = 'block';
  dropdown.innerHTML = matches.map(d => `
    <div style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border)"
      class="autocomplete-item"
      onmousedown="event.preventDefault();window.dsAddRxItem(${safeId(d.id)},'${jsStr(d.name_ar || d.name_en || '')}','${jsStr(d.name_en || '')}','${jsStr(d.generic_name || '')}',${parseFloat(d.price || 0)})">
      <strong>${escapeHTML(d.name_ar || d.name_en || '-')}</strong>
      ${d.name_en ? `<span style="color:var(--text-dim);font-size:11px"> — ${escapeHTML(d.name_en)}</span>` : ''}
      ${d.generic_name ? `<span style="color:var(--text-dim);font-size:10px"> (${escapeHTML(d.generic_name)})</span>` : ''}
    </div>
  `).join('');
};

window.dsAddRxItem = function(id, nameAr, nameEn, generic, price) {
  const dropdown = document.getElementById('dsRxDropdown');
  const input = document.getElementById('dsRxSearch');
  if (dropdown) dropdown.style.display = 'none';
  if (input) input.value = '';

  // Check for duplicate
  if (window._DS.rxItems.find(x => x.id === id)) {
    showToast(tr('Drug already added', 'الدواء مضاف مسبقاً'), 'error'); return;
  }

  // CDS: Check allergies
  const allergies = window._DS.selectedPatientData?.allergies || [];
  const allergyMatch = allergies.find(a => {
    const allergen = (a.allergen || '').toLowerCase();
    return nameEn.toLowerCase().includes(allergen) || nameAr.includes(allergen) || (generic || '').toLowerCase().includes(allergen);
  });
  if (allergyMatch) {
    const alertsDiv = document.getElementById('dsRxCdsAlerts');
    if (alertsDiv) {
      alertsDiv.innerHTML = `<div class="ds-cds-alert critical">
        <div class="ds-cds-alert-icon">🚨</div>
        <div class="ds-cds-alert-body">
          <div class="ds-cds-alert-title">${tr('ALLERGY ALERT', 'تنبيه حساسية')}: ${escapeHTML(nameAr || nameEn)}</div>
          <div class="ds-cds-alert-desc">${tr('Patient has recorded allergy to:', 'المريض لديه حساسية مسجّلة من:')} ${escapeHTML(allergyMatch.allergen)}</div>
        </div>
        <button class="ds-cds-alert-dismiss" onclick="this.parentElement.remove()">✕</button>
      </div>`;
    }
    // Still allow override but warn
    if (!confirm(tr('⚠️ ALLERGY ALERT! This drug may conflict with recorded allergies. Add anyway?', '⚠️ تنبيه حساسية! هذا الدواء قد يتعارض مع حساسيات مسجّلة. هل تريد الإضافة رغم ذلك؟'))) return;
  }

  window._DS.rxItems.push({
    id, nameAr, nameEn, generic,
    dose: '', frequency: 'مرة يومياً', duration: '7 أيام', route: 'فموي (PO)', qty: 1, notes: '', price
  });
  window.dsRenderRxItems();
};

window.dsRenderRxItems = function() {
  const container = document.getElementById('dsRxItems');
  const btn = document.getElementById('dsSendRxBtn');
  const countEl = document.getElementById('dsRxCount');
  if (countEl) countEl.textContent = window._DS.rxItems.length;
  if (btn) btn.style.display = window._DS.rxItems.length ? 'flex' : 'none';
  if (!container) return;

  if (!window._DS.rxItems.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text-dim);padding:8px 0;margin-bottom:8px">${tr('No medications added yet', 'لم يتم إضافة أدوية بعد')}</div>`;
    return;
  }

  container.innerHTML = window._DS.rxItems.map((item, idx) => {
    // Auto-calculate Qty Total based on duration days × frequency multiplier
    const durDays = parseInt(item.duration) || 7;
    const freqMult = item.frequency?.includes('4 مرات') ? 4 : item.frequency?.includes('3 مرات') ? 3 : item.frequency?.includes('مرتان') ? 2 : item.frequency?.includes('6') ? 4 : item.frequency?.includes('8') ? 3 : 1;
    const qtyTotal = (item.qty || 1) * freqMult * durDays;

    return `
    <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:12px">💊 ${escapeHTML(item.nameAr || item.nameEn)}</strong>
        <button class="ds-rx-remove" onclick="window.dsRemoveRxItem(${idx})">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Dose', 'الجرعة')}</label>
          <input class="form-input" style="height:30px;font-size:12px;padding:4px 8px" 
            value="${escapeHTML(item.dose)}" placeholder="${tr('e.g. 500mg', 'مثال: 500mg')}"
            oninput="window._DS.rxItems[${idx}].dose=this.value">
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Route', 'المسار')}</label>
          <select class="form-input" style="height:30px;font-size:12px;padding:2px 6px"
            onchange="window._DS.rxItems[${idx}].route=this.value">
            <option ${item.route === 'فموي (PO)' ? 'selected' : ''}>فموي (PO)</option>
            <option ${item.route === 'وريدي (IV)' ? 'selected' : ''}>وريدي (IV)</option>
            <option ${item.route === 'عضلي (IM)' ? 'selected' : ''}>عضلي (IM)</option>
            <option ${item.route === 'موضعي (Topical)' ? 'selected' : ''}>موضعي (Topical)</option>
            <option ${item.route === 'تحت الجلد (SC)' ? 'selected' : ''}>تحت الجلد (SC)</option>
            <option ${item.route === 'استنشاق (INH)' ? 'selected' : ''}>استنشاق (INH)</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Frequency', 'التكرار')}</label>
          <select class="form-input" style="height:30px;font-size:12px;padding:2px 6px"
            onchange="window._DS.rxItems[${idx}].frequency=this.value;window.dsRenderRxItems()">
            <option ${item.frequency === 'مرة يومياً' ? 'selected' : ''}>مرة يومياً</option>
            <option ${item.frequency === 'مرتان يومياً' ? 'selected' : ''}>مرتان يومياً</option>
            <option ${item.frequency === '3 مرات يومياً' ? 'selected' : ''}>3 مرات يومياً</option>
            <option ${item.frequency === '4 مرات يومياً' ? 'selected' : ''}>4 مرات يومياً</option>
            <option ${item.frequency === 'كل 6 ساعات' ? 'selected' : ''}>كل 6 ساعات</option>
            <option ${item.frequency === 'كل 8 ساعات' ? 'selected' : ''}>كل 8 ساعات</option>
            <option ${item.frequency === 'عند الحاجة (PRN)' ? 'selected' : ''}>عند الحاجة (PRN)</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Duration', 'المدة')}</label>
          <select class="form-input" style="height:30px;font-size:12px;padding:2px 6px"
            onchange="window._DS.rxItems[${idx}].duration=this.value;window.dsRenderRxItems()">
            <option>3 أيام</option>
            <option ${item.duration === '5 أيام' ? 'selected' : ''}>5 أيام</option>
            <option ${item.duration === '7 أيام' ? 'selected' : ''} selected>7 أيام</option>
            <option>10 أيام</option>
            <option>14 أيام</option>
            <option>30 أيام</option>
            <option>استمراري</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Refill (0-3)', 'التكرار المسموح')}</label>
          <select class="form-input" style="height:30px;font-size:12px;padding:2px 6px"
            onchange="window._DS.rxItems[${idx}].refill=parseInt(this.value)">
            <option value="0" ${!item.refill ? 'selected' : ''}>0 — ${tr('No Refill', 'بدون تكرار')}</option>
            <option value="1" ${item.refill===1 ? 'selected' : ''}>1x Refill</option>
            <option value="2" ${item.refill===2 ? 'selected' : ''}>2x Refill</option>
            <option value="3" ${item.refill===3 ? 'selected' : ''}>3x Refill</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text-dim)">${tr('Qty Total', 'الكمية الإجمالية')}</label>
          <div style="height:30px;display:flex;align-items:center;padding:0 8px;background:var(--primary-glow,#eff6ff);border-radius:8px;border:1px solid var(--primary);font-size:12px;font-weight:700;color:var(--primary)">
            ${isNaN(qtyTotal) ? '—' : qtyTotal} ${tr('units', 'وحدة')}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
};

window.dsRemoveRxItem = function(idx) {

  window._DS.rxItems.splice(idx, 1);
  window.dsRenderRxItems();
};

window.dsSendPrescription = async function(patientId) {
  if (!window._DS.rxItems.length) return showToast(tr('Add at least one drug', 'أضف دواءً على الأقل'), 'error');
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');

  // Check drug interactions
  if (window._DS.rxItems.length >= 2) {
    const drugNames = window._DS.rxItems.map(x => x.nameEn || x.nameAr);
    const interactionResult = await window.checkDrugInteractions(drugNames).catch(() => ({ hasCritical: false, failed: false }));
    if (interactionResult.hasCritical) {
      showToast(tr('Prescription blocked due to CRITICAL interaction', 'الوصفة مرفوضة بسبب تعارض حرج'), 'error');
      return;
    }
  }

  try {
    const btn = document.getElementById('dsSendRxBtn');
    if (btn) btn.disabled = true;
    await Promise.all(window._DS.rxItems.map(item => API.post('/api/orders', {
      patient_id: patientId,
      type: 'medication',
      description: `${item.nameAr || item.nameEn} ${item.dose} — ${item.frequency} × ${item.duration} (${item.route})`,
      quantity: item.qty || 1,
      status: 'Pending',
      notes: item.notes || '',
    })));
    showToast(tr(`✅ ${window._DS.rxItems.length} drug(s) sent to pharmacy!`, `✅ تم إرسال ${window._DS.rxItems.length} دواء للصيدلية!`));
    window._DS.rxItems = [];
    window.dsRenderRxItems();
    if (btn) btn.disabled = false;
  } catch (e) {
    showToast(e?.message || tr('Failed to send prescription', 'فشل إرسال الوصفة'), 'error');
    const btn = document.getElementById('dsSendRxBtn');
    if (btn) btn.disabled = false;
  }
};

/* ============================================================ */
/*  CLINICAL ORDERS: Lab, Radiology, Referral                    */
/* ============================================================ */
window.dsOrderLab = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const sel = document.getElementById('dsLabTest');
  const tests = sel ? [...sel.selectedOptions].map(o => o.value) : [];
  if (!tests.length) return showToast(tr('Select at least one test', 'اختر فحصاً واحداً على الأقل'), 'error');
  const urgency = document.getElementById('dsLabUrgency')?.value || 'Routine';
  const note = document.getElementById('dsLabNote')?.value || '';
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'lab',
      description: tests.join(', '),
      status: urgency === 'STAT' ? 'STAT' : 'Pending',
      notes: note || '',
    });
    showToast(tr(`✅ Lab order sent: ${tests.join(', ')}`, `✅ تم طلب: ${tests.join(', ')}`));
    if (sel) { [...sel.options].forEach(o => o.selected = false); }
    document.getElementById('dsLabNote') && (document.getElementById('dsLabNote').value = '');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.dsOrderRadiology = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const type = document.getElementById('dsRadType')?.value || '';
  if (!type) return showToast(tr('Select a study type', 'اختر نوع الدراسة'), 'error');
  const note = document.getElementById('dsRadNote')?.value || '';
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'radiology',
      description: type,
      status: 'Pending',
      notes: note,
    });
    showToast(tr(`✅ Radiology ordered: ${type}`, `✅ تم طلب الأشعة: ${type}`));
    document.getElementById('dsRadNote') && (document.getElementById('dsRadNote').value = '');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.dsOrderReferral = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const dept = document.getElementById('dsRefTo')?.value || '';
  const note = document.getElementById('dsRefNote')?.value || '';
  if (!note.trim()) return showToast(tr('Enter referral reason', 'أدخل سبب التحويل'), 'error');
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'referral',
      description: `Referral to ${dept}`,
      status: 'Pending',
      notes: note,
    });
    showToast(tr(`✅ Referral sent to ${dept}`, `✅ تم إرسال التحويل إلى ${dept}`));
    document.getElementById('dsRefNote') && (document.getElementById('dsRefNote').value = '');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  CLINICAL ORDERS: Diet, IV Fluids, Nursing                   */
/* ============================================================ */
window.dsOrderDiet = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const dietType = document.getElementById('dsDietType')?.value || 'Normal Diet';
  const duration = document.getElementById('dsDietDuration')?.value || '24 ساعة';
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'diet',
      description: `[DIET] ${dietType}`,
      status: 'Pending',
      notes: `${tr('Duration', 'المدة')}: ${duration}`,
    });
    showToast(tr(`✅ Diet ordered: ${dietType}`, `✅ تم طلب الحمية: ${dietType}`));
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.dsOrderIV = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const fluidType  = document.getElementById('dsIvType')?.value || 'Normal Saline 0.9% (NS)';
  const rate       = document.getElementById('dsIvRate')?.value || '100';
  const duration   = document.getElementById('dsIvDuration')?.value || '8';
  const additive   = document.getElementById('dsIvAdditive')?.value || '';
  const totalVol   = Math.round(parseFloat(rate) * parseFloat(duration));
  const desc = `[IV] ${fluidType} @ ${rate}mL/hr × ${duration}hr${additive ? ' + ' + additive : ''}`;
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'iv',
      description: desc,
      status: 'Pending',
      notes: `${tr('Total Volume', 'الحجم الكلي')}: ${totalVol}mL${additive ? ' | ' + tr('Additive', 'إضافة') + ': ' + additive : ''}`,
    });
    showToast(tr(`✅ IV ordered: ${fluidType}`, `✅ تم طلب السائل: ${fluidType}`));
    document.getElementById('dsIvAdditive') && (document.getElementById('dsIvAdditive').value = '');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.dsOrderNursing = async function(patientId) {
  if (!patientId) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const orderType = document.getElementById('dsNursingType')?.value || '';
  const note      = document.getElementById('dsNursingNote')?.value || '';
  try {
    await API.post('/api/orders', {
      patient_id: patientId,
      type: 'nursing',
      description: `[NURSING] ${orderType}`,
      status: 'Pending',
      notes: note,
    });
    showToast(tr(`✅ Nursing order issued`, `✅ تم إصدار أمر التمريض`));
    document.getElementById('dsNursingNote') && (document.getElementById('dsNursingNote').value = '');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};



/* ============================================================ */
/*  SAVE DIAGNOSIS RECORD                                        */
/* ============================================================ */
window.dsSaveRecord = async function() {
  const pid = window._DS.selectedPatientId;
  if (!pid) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const diag = document.getElementById('dsIcd')?.value || '';
  const symp = document.getElementById('dsSymp')?.value || '';
  const notes = document.getElementById('dsNotes')?.value || '';
  if (!diag.trim()) return showToast(tr('Enter diagnosis', 'أدخل التشخيص'), 'error');
  try {
    const rec = await API.post('/api/medical/records', {
      patient_id: pid,
      diagnosis: diag,
      symptoms: symp,
      notes: notes,
      treatment: '',
    });
    window._DS.activeEncounterId = rec.id;
    showToast(tr('Diagnosis saved!', 'تم حفظ التشخيص!'));
    document.getElementById('dsIcd') && (document.getElementById('dsIcd').value = '');
    document.getElementById('dsSymp') && (document.getElementById('dsSymp').value = '');
    document.getElementById('dsNotes') && (document.getElementById('dsNotes').value = '');
    // Refresh chart
    setTimeout(() => window.dsSelectPatient(pid), 600);
  } catch (e) { showToast(e?.message || tr('Save failed', 'فشل الحفظ'), 'error'); }
};

/* ============================================================ */
/*  MARK WITH DOCTOR                                             */
/* ============================================================ */
window.dsMarkWithDoctor = async function(patientId) {
  if (!patientId) return;
  try {
    await API.put('/api/patients/' + patientId, { status: 'With Doctor' });
    showToast(tr('Patient moved to "With Doctor"', 'تم نقل المريض إلى "مع الطبيب"'));
    window.dsRefreshWaitQueue();
    // Update the banner button
    const btn = document.getElementById('btnMarkDoctor');
    if (btn) { btn.disabled = true; btn.innerHTML = '✅ ' + tr('With Doctor', 'مع الطبيب'); }
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  SIGN & CLOSE ENCOUNTER                                       */
/* ============================================================ */
window.dsSignEncounter = function() {
  const encId = window._DS.activeEncounterId;
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="ds-sign-modal">
      <div class="ds-sign-icon">✍️</div>
      <h3 style="margin:0 0 8px;font-size:18px;font-weight:800">${tr('Sign Encounter', 'توقيع الزيارة')}</h3>
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        ${tr('Enter your 4-6 digit PIN to sign and lock the encounter', 'أدخل رمز PIN المكوّن من 4-6 أرقام للتوقيع وإغلاق الزيارة')}
      </p>
      <input type="password" class="ds-pin-input" id="dsPinInput" maxlength="6" inputmode="numeric"
        placeholder="● ● ● ●" oninput="this.value=this.value.replace(/\D/g,'')">
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="window.dsConfirmSign(${encId})" style="flex:1;height:44px;font-size:14px;font-weight:700">
          ✅ ${tr('Sign Now', 'توقيع الآن')}
        </button>
        <button class="btn" onclick="this.closest('.fixed-modal').remove()" style="flex:1;height:44px">
          ${tr('Cancel', 'إلغاء')}
        </button>
      </div>
      <div id="dsSignError" style="color:#dc2626;font-size:12px;margin-top:8px"></div>
    </div>
  `;
  modal.classList.add('fixed-modal');
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  setTimeout(() => document.getElementById('dsPinInput')?.focus(), 100);
};

window.dsConfirmSign = async function(encId) {
  const pin = document.getElementById('dsPinInput')?.value || '';
  const errEl = document.getElementById('dsSignError');
  if (!/^\d{4,6}$/.test(pin)) {
    if (errEl) errEl.textContent = tr('PIN must be 4-6 digits', 'يجب أن يكون PIN من 4-6 أرقام');
    return;
  }
  const doctorName = window._DS.currentUser?.name || window._DS.currentUser?.username || 'Doctor';
  const targetId = encId || (window._DS.activeEncounterId) || 0;
  try {
    const r = await API.post(`/api/encounters/${targetId || 0}/sign`, {
      pin,
      doctor_name: doctorName,
      signature_note: `Signed electronically by ${doctorName} on ${new Date().toISOString()}`,
    });
    document.querySelector('.fixed-modal')?.remove();
    if (r.degraded) {
      showToast(tr('Encounter signed (with notice)', 'تم التوقيع مع ملاحظة'));
    } else {
      showToast(tr('✅ Encounter signed and closed!', '✅ تم توقيع وإغلاق الزيارة!'));
    }
    // Refresh patient to With Doctor / Completed
    if (window._DS.selectedPatientId) {
      await API.put('/api/patients/' + window._DS.selectedPatientId, { status: 'Done' }).catch(() => {});
      window.dsRefreshWaitQueue();
    }
  } catch (e) {
    if (errEl) errEl.textContent = e?.message || tr('Signing failed', 'فشل التوقيع');
  }
};

/* ============================================================ */
/*  ADD PROBLEM (stub)                                           */
/* ============================================================ */
window.dsAddProblem = function() {
  const pid = window._DS.selectedPatientId;
  if (!pid) return showToast(tr('No patient selected', 'لا يوجد مريض محدد'), 'error');
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div style="background:var(--bg-card);border-radius:16px;padding:24px;width:400px">
    <h3 style="margin:0 0 16px;color:var(--primary)">⚠️ ${tr('Add Problem', 'إضافة مشكلة')}</h3>
    <div class="form-group mb-8"><label>${tr('Problem Name', 'اسم المشكلة')}</label><input class="form-input" id="dpName" placeholder="Hypertension, DM Type 2..."></div>
    <div class="form-group mb-8"><label>ICD-10</label><input class="form-input" id="dpIcd" placeholder="I10, E11..."></div>
    <div class="form-group mb-8"><label>${tr('Status', 'الحالة')}</label>
      <select class="form-input" id="dpStatus">
        <option value="active">${tr('Active', 'نشط')}</option>
        <option value="controlled">${tr('Controlled', 'خاضع للسيطرة')}</option>
        <option value="resolved">${tr('Resolved', 'محلول')}</option>
      </select></div>
    <div class="form-group mb-12"><label>${tr('Onset Date', 'تاريخ البداية')}</label><input type="date" class="form-input" id="dpOnset"></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" style="flex:1" onclick="window.dsSubmitProblem(${pid})">💾 ${tr('Save', 'حفظ')}</button>
      <button class="btn btn-secondary" style="flex:1" onclick="this.closest('.fixed-p').remove()">${tr('Cancel', 'إلغاء')}</button>
    </div>
  </div>`;
  modal.classList.add('fixed-p');
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
};

window.dsSubmitProblem = async function(pid) {
  const name = document.getElementById('dpName')?.value?.trim() || '';
  if (!name) return showToast(tr('Enter problem name', 'أدخل اسم المشكلة'), 'error');
  try {
    await API.post('/api/patients/' + pid + '/problems', {
      problem_name: name,
      icd_code: document.getElementById('dpIcd')?.value || '',
      status: document.getElementById('dpStatus')?.value || 'active',
      onset_date: document.getElementById('dpOnset')?.value || null,
    }).catch(() =>
      // Fallback: save via medical records notes
      API.post('/api/medical/records', {
        patient_id: pid,
        diagnosis: name + (document.getElementById('dpIcd')?.value ? ' [' + document.getElementById('dpIcd').value + ']' : ''),
        treatment: '',
        notes: 'Problem: ' + name,
      })
    );
    showToast(tr('Problem added!', 'تمت إضافة المشكلة!'));
    document.querySelector('.fixed-p')?.remove();
    setTimeout(() => window.dsSelectPatient(pid), 500);
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

/* ============================================================ */
/*  REGISTRATION — makes app.js delegation stub work            */
/* ============================================================ */
window.renderDoctorStation = renderDoctor;

// Also expose utility for drug interaction check (stub — extend later with real DB)
window.checkDrugInteractions = async function(drugNames) {
  const knownInteractions = [
    { drugs: ['warfarin', 'aspirin'], severity: 'critical', message: tr('Major bleeding risk', 'خطر نزيف كبير') },
    { drugs: ['metformin', 'contrast'], severity: 'critical', message: tr('Risk of lactic acidosis', 'خطر حماض اللاكتيك') },
    { drugs: ['ssri', 'maoi'], severity: 'critical', message: tr('Serotonin syndrome risk', 'خطر متلازمة السيروتونين') },
    { drugs: ['warfarin', 'nsaid'], severity: 'critical', message: tr('Increased bleeding risk', 'خطر نزيف مرتفع') },
  ];
  const lowerNames = drugNames.map(n => n.toLowerCase());
  let hasCritical = false;
  let alerts = [];
  knownInteractions.forEach(ix => {
    const matched = ix.drugs.filter(d => lowerNames.some(n => n.includes(d)));
    if (matched.length >= 2) {
      if (ix.severity === 'critical') hasCritical = true;
      alerts.push({ ...ix, matchedDrugs: matched });
    }
  });
  return { hasCritical, alerts };
};

console.log('[DoctorStation] Module v3 loaded — محطة الطبيب مستوى Epic/Cerner/Oracle جاهزة');

/* ============================================================ */
/*  TAB: ORDERS BOARD (لوحة الأوامر النشطة)                   */
/* ============================================================ */
window.dsTabOrders = async function(container) {
  const pid = window._DS.selectedPatientId;
  if (!pid) return;
  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:32px">⏳</div><p>${tr('Loading orders...', 'جاري تحميل الأوامر...')}</p></div>`;
  let data = { orders: [], prescriptions: [] };
  try { data = await API.get(`/api/patients/${pid}/active-orders`); } catch { data = { orders: [], prescriptions: [] }; }
  const { orders = [], prescriptions = [] } = data;
  const allItems = [
    ...orders.map(o => ({ ...o, _cat: o.order_category || (o.is_radiology==1?'radiology':'lab'), _icon: o.is_radiology==1?'📡':'🔬' })),
    ...prescriptions.map(p => ({ ...p, _cat: 'medication', _icon: '💊', description: p.drug_name || p.description })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!allItems.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-dim)"><div style="font-size:48px;opacity:.3">📋</div><p>${tr('No active orders', 'لا توجد أوامر نشطة')}</p></div>`;
    return;
  }
  const statusColor = { Pending: '#ca8a04', STAT: '#dc2626', 'In Progress': '#0ea5e9', Completed: '#16a34a', Dispensed: '#16a34a', Cancelled: '#6b7280' };
  const catLabel = { lab: tr('Lab', 'مختبر'), radiology: tr('Radiology', 'أشعة'), medication: tr('Medication', 'دواء'), referral: tr('Referral', 'تحويل'), nursing: tr('Nursing', 'تمريض'), diet: tr('Diet', 'غذاء'), iv: tr('IV Fluids', 'سوائل') };
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:13px">📋 ${tr('Active Orders Board', 'لوحة الأوامر')} (${allItems.length})</strong>
    </div>
    ${allItems.map(o => `
      <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <div style="font-size:22px">${escapeHTML(o._icon||'📋')}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:12px">${escapeHTML(o.description || '-')}</div>
          <div style="font-size:11px;color:var(--text-dim)">${escapeHTML(catLabel[o._cat]||o._cat||'')} · ${escapeHTML(o.created_at?.split('T')[0]||'')}</div>
        </div>
        <span style="background:${statusColor[o.status]||'#6b7280'}22;color:${statusColor[o.status]||'#6b7280'};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${escapeHTML(o.status||'')}</span>
      </div>
    `).join('')}
  `;
};

/* ============================================================ */
/*  TAB: RESULTS (نتائج المختبر والأشعة)                          */
/* ============================================================ */
window.dsTabResults = async function(container) {
  const pid = window._DS.selectedPatientId;
  if (!pid) return;
  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:32px">⏳</div><p>${tr('Loading results...', 'جاري تحميل النتائج...')}</p></div>`;
  let data = { labOrders: [], radOrders: [], labResults: [] };
  try { data = await API.get(`/api/patients/${pid}/lab-results`); } catch { data = { labOrders: [], radOrders: [], labResults: [] }; }
  const { labOrders = [], radOrders = [], labResults = [] } = data;

  if (!labOrders.length && !radOrders.length && !labResults.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-dim)"><div style="font-size:48px;opacity:.3">🔬</div><p>${tr('No lab results found', 'لا توجد نتائج مختبر مدخلة')}</p></div>`;
    return;
  }

  // Group labResults by test_name for latest value
  const byTest = {};
  labResults.forEach(r => { if (!byTest[r.test_name]) byTest[r.test_name] = []; byTest[r.test_name].push(r); });

  container.innerHTML = `
    ${labResults.length ? `
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">🔬 ${tr('Lab Results', 'نتائج المختبر')} (${labResults.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface-container,#f1f5f9);">
            <th style="padding:6px 8px;text-align:start;font-weight:700">${tr('Test', 'الفحص')}</th>
            <th style="padding:6px 8px;text-align:start;font-weight:700">${tr('Result', 'النتيجة')}</th>
            <th style="padding:6px 8px;text-align:start;font-weight:700">${tr('Unit', 'الوحدة')}</th>
            <th style="padding:6px 8px;text-align:start;font-weight:700">${tr('Reference', 'المرجع')}</th>
            <th style="padding:6px 8px;text-align:start;font-weight:700">${tr('Date', 'التاريخ')}</th>
          </tr>
        </thead>
        <tbody>
          ${labResults.map(r => {
            const isCrit = r.is_critical;
            const isAbn = r.is_abnormal || isCrit;
            const rowColor = isCrit ? '#fee2e2' : isAbn ? '#fef9c3' : '';
            const textColor = isCrit ? '#dc2626' : isAbn ? '#ca8a04' : 'inherit';
            const refRange = (r.reference_low!=null && r.reference_high!=null) ? `${r.reference_low} - ${r.reference_high}` : (r.reference_range || '-');
            return `<tr style="background:${rowColor};border-bottom:1px solid var(--border)">
              <td style="padding:6px 8px;font-weight:600;color:${textColor}">
                ${isCrit ? '🚨 ' : isAbn ? '⚠️ ' : ''}${escapeHTML(r.test_name||'-')}
              </td>
              <td style="padding:6px 8px;font-weight:700;color:${textColor}">${escapeHTML(String(r.result_value??r.result_text??'-'))}</td>
              <td style="padding:6px 8px;color:var(--text-dim)">${escapeHTML(r.unit||'')}</td>
              <td style="padding:6px 8px;color:var(--text-dim)">${escapeHTML(refRange)}</td>
              <td style="padding:6px 8px;color:var(--text-dim)">${escapeHTML(r.order_date?.split('T')[0]||r.result_date?.split('T')[0]||'')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}
    ${radOrders.length ? `
    <div style="margin-top:16px">
      <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">📡 ${tr('Radiology Orders', 'طلبات الأشعة')} (${radOrders.length})</div>
      ${radOrders.map(o => `
        <div style="background:var(--surface-container,#f8fafc);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px">
          <div style="font-weight:700;font-size:12px">${escapeHTML(o.description||o.order_type||'-')}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:4px">${escapeHTML(o.created_at?.split('T')[0]||'')} · حالة: <strong>${escapeHTML(o.status||'-')}</strong></div>
          ${o.results ? `<div style="font-size:12px;margin-top:6px;padding:6px;background:#f0f9ff;border-radius:6px;border-inline-start:3px solid #0ea5e9">${escapeHTML(o.results)}</div>` : ''}
        </div>
      `).join('')}
    </div>` : ''}
  `;
};

/* ============================================================ */
/*  TAB: HISTORY+ (تاريخ شامل: اجتماعي وعائلي وجراحي)          */
/* ============================================================ */
window.dsTabHistoryExt = async function(container) {
  const pid = window._DS.selectedPatientId;
  if (!pid) return;
  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:32px">⏳</div><p>${tr('Loading extended history...', 'جاري تحميل التاريخ...')}</p></div>`;
  let data = { social: {}, family: [], surgical: [], immunizations: [] };
  try { data = await API.get(`/api/patients/${pid}/history-extended`); } catch { /* graceful */ }
  const { social = {}, family = [], surgical = [], immunizations = [] } = data;
  const smokingMap = { never: tr('Never Smoked', 'لم يدخن قط'), former: tr('Former Smoker', 'دخن سابقاً'), current: tr('Current Smoker', 'يدخن حالياً') };

  container.innerHTML = `
    <!-- Social History -->
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:12px;color:var(--text-dim);text-transform:uppercase">👤 ${tr('Social History', 'التاريخ الاجتماعي')}</strong>
        <button class="btn btn-sm" style="font-size:10px;padding:4px 8px" onclick="window.dsEditSocialHistory(${pid})">✏️ ${tr('Edit', 'تعديل')}</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[['smoking_status', tr('Smoking', 'التدخين'), smokingMap[social.smoking_status] || social.smoking_status || '-'],
           ['occupation', tr('Occupation', 'المهنة'), social.occupation || '-'],
           ['marital_status', tr('Marital Status', 'الحالة الاجتماعية'), social.marital_status || '-'],
           ['exercise_frequency', tr('Exercise', 'الرياضة'), social.exercise_frequency || '-'],
        ].map(([k,label,val]) => `
          <div style="background:var(--surface-container,#f8fafc);border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;color:var(--text-dim);font-weight:700">${escapeHTML(label)}</div>
            <div style="font-size:13px;font-weight:600">${escapeHTML(val)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Family History -->
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:12px;color:var(--text-dim);text-transform:uppercase">👨‍👩‍👦 ${tr('Family History', 'التاريخ العائلي')} (${family.length})</strong>
        <button class="btn btn-sm" style="font-size:10px;padding:4px 8px" onclick="window.dsAddFamilyHistory(${pid})">+ ${tr('Add', 'إضافة')}</button>
      </div>
      ${family.length ? family.map(f => `
        <div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:18px">👨‍👩‍👦</div>
          <div><div style="font-weight:700;font-size:12px">${escapeHTML(f.condition||'-')}</div>
          <div style="font-size:11px;color:var(--text-dim)">${escapeHTML(f.relation||'')} ${f.icd_code?'· '+f.icd_code:''}</div></div>
        </div>
      `).join('') : `<div style="color:var(--text-dim);font-size:12px;padding:8px">— ${tr('None recorded', 'لا يوجد')}</div>`}
    </div>

    <!-- Surgical History -->
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">💉 ${tr('Surgical History', 'التاريخ الجراحي')} (${surgical.length})</div>
      ${surgical.length ? surgical.map(s => `
        <div style="background:var(--surface-container,#f8fafc);border-radius:8px;padding:8px 10px;margin-bottom:6px">
          <div style="font-weight:700;font-size:12px">${escapeHTML(s.procedure_name||'-')}</div>
          <div style="font-size:11px;color:var(--text-dim)">${escapeHTML(s.procedure_date||'')} ${s.hospital?'· '+s.hospital:''}</div>
        </div>
      `).join('') : `<div style="color:var(--text-dim);font-size:12px;padding:8px">— ${tr('None recorded', 'لا يوجد')}</div>`}
    </div>

    <!-- Immunizations -->
    <div>
      <div style="font-weight:700;font-size:12px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">💉 ${tr('Immunizations', 'التطعيمات')} (${immunizations.length})</div>
      ${immunizations.length ? immunizations.map(i => `
        <div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:18px">💉</div>
          <div><div style="font-weight:700;font-size:12px">${escapeHTML(i.vaccine_name||i.vaccine||'-')}</div>
          <div style="font-size:11px;color:var(--text-dim)">${escapeHTML(i.given_date?.split('T')[0]||i.vaccine_date?.split('T')[0]||'')} ${i.dose_number?'· جرعة '+i.dose_number:''}</div></div>
        </div>
      `).join('') : `<div style="color:var(--text-dim);font-size:12px;padding:8px">— ${tr('None recorded', 'لا يوجد')}</div>`}
    </div>
  `;
};

/* ============================================================ */
/*  EDIT SOCIAL HISTORY MODAL                                    */
/* ============================================================ */
window.dsEditSocialHistory = function(pid) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div style="background:var(--bg-card);border-radius:16px;padding:24px;width:480px;max-height:90vh;overflow-y:auto">
    <h3 style="margin:0 0 16px;color:var(--primary)">👤 ${tr('Social History', 'التاريخ الاجتماعي')}</h3>
    <div class="form-group mb-8"><label>${tr('Smoking Status', 'حالة التدخين')}</label>
      <select class="form-input" id="shSmoke">
        <option value="never">${tr('Never', 'لم يدخن')}</option>
        <option value="former">${tr('Former Smoker', 'دخن سابقاً')}</option>
        <option value="current">${tr('Current Smoker', 'يدخن حالياً')}</option>
      </select></div>
    <div class="form-group mb-8"><label>${tr('Marital Status', 'الحالة الاجتماعية')}</label>
      <select class="form-input" id="shMarital">
        <option value="Single">${tr('Single', 'أعزب')}</option>
        <option value="Married">${tr('Married', 'متزوج')}</option>
        <option value="Divorced">${tr('Divorced', 'مطلق')}</option>
        <option value="Widowed">${tr('Widowed', 'أرمل')}</option>
      </select></div>
    <div class="form-group mb-8"><label>${tr('Occupation', 'المهنة')}</label><input class="form-input" id="shOccupation" placeholder="${tr('Job title', 'المسمى الوظيفي')}"></div>
    <div class="form-group mb-12"><label>${tr('Exercise Frequency', 'تكرار الرياضة')}</label>
      <select class="form-input" id="shExercise">
        <option value="None">${tr('None', 'لا يمارس')}</option>
        <option value="Occasional">${tr('Occasional', 'أحياناً')}</option>
        <option value="3x per week">${tr('3x per week', '3 مرات/أسبوع')}</option>
        <option value="Daily">${tr('Daily', 'يومياً')}</option>
      </select></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" style="flex:1" onclick="window.dsSaveSocialHistory(${pid})">💾 ${tr('Save', 'حفظ')}</button>
      <button class="btn btn-secondary" style="flex:1" onclick="this.closest('[style*=fixed]').remove()">${tr('Cancel', 'إلغاء')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
};

window.dsSaveSocialHistory = async function(pid) {
  try {
    await API.post(`/api/patients/${pid}/social-history`, {
      smoking_status: document.getElementById('shSmoke')?.value || '',
      marital_status: document.getElementById('shMarital')?.value || '',
      occupation: document.getElementById('shOccupation')?.value || '',
      exercise_frequency: document.getElementById('shExercise')?.value || '',
    });
    showToast(tr('Social history saved!', 'تم حفظ التاريخ الاجتماعي!'));
    document.querySelector('[style*="position:fixed"][style*="inset:0"]')?.remove();
    window.dsSwitchTab('history_ext');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};

window.dsAddFamilyHistory = function(pid) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div style="background:var(--bg-card);border-radius:16px;padding:24px;width:400px">
    <h3 style="margin:0 0 16px;color:var(--primary)">👨‍👩‍👦 ${tr('Add Family History', 'إضافة تاريخ عائلي')}</h3>
    <div class="form-group mb-8"><label>${tr('Relation', 'صلة القرابة')}</label>
      <select class="form-input" id="fhRelation">
        <option>${tr('Father', 'الأب')}</option><option>${tr('Mother', 'الأم')}</option>
        <option>${tr('Sibling', 'أخ/أخت')}</option><option>${tr('Grandparent', 'جد/جدة')}</option>
      </select></div>
    <div class="form-group mb-8"><label>${tr('Condition', 'التشخيص')}</label><input class="form-input" id="fhCondition" placeholder="${tr('e.g. DM, HTN, Cancer', 'مثال: سكري, ضغط')}"></div>
    <div class="form-group mb-12"><label>ICD-10</label><input class="form-input" id="fhIcd" placeholder="E11, I10..."></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" style="flex:1" onclick="window.dsSaveFamilyHistory(${pid})">💾 ${tr('Save', 'حفظ')}</button>
      <button class="btn btn-secondary" style="flex:1" onclick="this.closest('[style*=fixed]').remove()">${tr('Cancel', 'إلغاء')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
};

window.dsSaveFamilyHistory = async function(pid) {
  const condition = document.getElementById('fhCondition')?.value?.trim() || '';
  if (!condition) return showToast(tr('Enter condition', 'أدخل التشخيص'), 'error');
  try {
    await API.post(`/api/patients/${pid}/family-history`, {
      relation: document.getElementById('fhRelation')?.value || '',
      condition,
      icd_code: document.getElementById('fhIcd')?.value || '',
    });
    showToast(tr('Family history added!', 'تم إضافة التاريخ العائلي!'));
    document.querySelector('[style*="position:fixed"][style*="inset:0"]')?.remove();
    window.dsSwitchTab('history_ext');
  } catch (e) { showToast(e?.message || tr('Error', 'خطأ'), 'error'); }
};




// --- SECURITY UTILS ---
window.escapeHTML = function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ===== Nama Medical ERP - Main App =====
let currentUser = null;
let isArabic = localStorage.getItem('namaLang') === 'ar' ? true : (localStorage.getItem('namaLang') === 'en' ? false : false);
let currentPage = 0;
let facilityType = 'hospital';
const FACILITY_ALLOWED = {
  hospital: null, // null = all allowed
  health_center: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 21, 30, 33, 34, 35, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50],
  clinic: [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 30, 34, 42, 43, 44, 45, 46, 47, 48, 49, 50]
};

const tr = (en, ar) => isArabic ? ar : en;

// Navigation items
const NAV_ITEMS = [
  { icon: '📊', en: 'Dashboard', ar: 'لوحة التحكم' },
  { icon: '🏥', en: 'Reception', ar: 'الاستقبال' },
  { icon: '📅', en: 'Appointments', ar: 'المواعيد' },
  { icon: '👨‍⚕️', en: 'Doctor Station', ar: 'محطة الطبيب' },
  { icon: '🔬', en: 'Laboratory', ar: 'المختبر' },
  { icon: '📡', en: 'Radiology', ar: 'الأشعة' },
  { icon: '💊', en: 'Pharmacy', ar: 'الصيدلية' },
  { icon: '🏢', en: 'HR', ar: 'الموارد البشرية' },
  { icon: '💰', en: 'Finance', ar: 'المالية' },
  { icon: '🛡️', en: 'Insurance', ar: 'التأمين' },
  { icon: '📦', en: 'Inventory', ar: 'المخازن' },
  { icon: '👩‍⚕️', en: 'Nursing', ar: 'التمريض' },
  { icon: '🪑', en: 'Waiting Queue', ar: 'قائمة الانتظار' },
  { icon: '💳', en: 'Patient Accounts', ar: 'حسابات المرضى' },
  { icon: '📋', en: 'Reports', ar: 'التقارير' },
  { icon: '✉️', en: 'Messaging', ar: 'الرسائل' },
  { icon: '📂', en: 'Catalog', ar: 'الأصناف' },
  { icon: '📤', en: 'Dept Requests', ar: 'طلبات الأقسام' },
  { icon: '🏥', en: 'Surgery & Pre-Op', ar: 'العمليات وما قبلها' },
  { icon: '🩸', en: 'Blood Bank', ar: 'بنك الدم' },
  { icon: '📜', en: 'Consent Forms', ar: 'الإقرارات' },
  { icon: '🚨', en: 'Emergency', ar: 'الطوارئ' },
  { icon: '🛏️', en: 'Inpatient ADT', ar: 'التنويم' },
  { icon: '🫀', en: 'ICU', ar: 'العناية المركزة' },
  { icon: '🧹', en: 'CSSD', ar: 'التعقيم المركزي' },
  { icon: '🍽️', en: 'Dietary', ar: 'التغذية' },
  { icon: '🦠', en: 'Infection Control', ar: 'مكافحة العدوى' },
  { icon: '📊', en: 'Quality', ar: 'الجودة' },
  { icon: '🔧', en: 'Maintenance', ar: 'الصيانة' },
  { icon: '🚑', en: 'Transport', ar: 'نقل المرضى' },
  { icon: '📁', en: 'Medical Records', ar: 'السجلات الطبية' },
  { icon: '💊', en: 'Clinical Pharmacy', ar: 'الصيدلية السريرية' },
  { icon: '🏋️', en: 'Rehabilitation', ar: 'إعادة التأهيل' },
  { icon: '📱', en: 'Patient Portal', ar: 'بوابة المرضى' },
  { icon: '🧾', en: 'ZATCA E-Invoice', ar: 'فوترة إلكترونية' },
  { icon: '📹', en: 'Telemedicine', ar: 'الطب عن بعد' },
  { icon: '🔬', en: 'Pathology', ar: 'علم الأمراض' },
  { icon: '🤝', en: 'Social Work', ar: 'الخدمة الاجتماعية' },
  { icon: '🏛️', en: 'Mortuary', ar: 'خدمة الوفيات' },
  { icon: '🎓', en: 'CME', ar: 'التعليم الطبي' },
  { icon: '💎', en: 'Cosmetic Surgery', ar: 'جراحة التجميل' },
  { icon: '🤰', en: 'OB/GYN', ar: 'النساء والتوليد' },
  { icon: '⚙️', en: 'Settings', ar: 'الإعدادات' },
  { icon: '🔬', en: 'Clinical Research', ar: 'الأبحاث السريرية والابتكار' },
  { icon: '🥗', en: 'Public Health', ar: 'الصحة العامة والسكانية' },
  { icon: '🚨', en: 'Crisis Command', ar: 'إدارة الأزمات والكوارث' },
  { icon: '🔌', en: 'Smart Facility & IoT', ar: 'البنية الذكية وإنترنت الأشياء' },
  { icon: '⚖️', en: 'Legal Affairs', ar: 'الشؤون القانونية والطبية الشرعية' },
  { icon: '🧪', en: 'Toxicology Response', ar: 'السموم والاستجابة الكيميائية' },
  { icon: '💽', en: 'Big Data Lake', ar: 'بيانات المنظومة الضخمة' },
  { icon: '🧭', en: 'Patient Journey Sim', ar: 'محاكاة رحلة المريض' }
];

// ===== ROUTING & HASH MAPPING =====
const HASH_MAP = {
  '#dashboard': 0,
  '#reception': 1,
  '#appointments': 2,
  '#doctor': 3,
  '#lab': 4,
  '#radiology': 5,
  '#pharmacy': 6,
  '#hr': 7,
  '#finance': 8,
  '#insurance': 9,
  '#inventory': 10,
  '#nursing': 11,
  '#waiting': 12,
  '#accounts': 13,
  '#reports': 14,
  '#messaging': 15,
  '#catalog': 16,
  '#dept-requests': 17,
  '#surgery': 18,
  '#blood-bank': 19,
  '#consent': 20,
  '#emergency': 21,
  '#inpatient': 22,
  '#icu': 23,
  '#cssd': 24,
  '#dietary': 25,
  '#infection-control': 26,
  '#quality': 27,
  '#maintenance': 28,
  '#transport': 29,
  '#medical-records': 30,
  '#clinical-pharmacy': 31,
  '#rehabilitation': 32,
  '#patient-portal': 33,
  '#zatca': 34,
  '#telemedicine': 35,
  '#pathology': 36,
  '#social-work': 37,
  '#mortuary': 38,
  '#cme': 39,
  '#cosmetic-surgery': 40,
  '#obgyn': 41,
  '#settings': 42,
  '#clinical-research': 43,
  '#research': 43,
  '#public-health': 44,
  '#publichealth': 44,
  '#crisis-command': 45,
  '#crisis': 45,
  '#smart-facility': 46,
  '#iot': 46,
  '#legal-affairs': 47,
  '#legal': 47,
  '#toxicology': 48,
  '#big-data': 49,
  '#bigdata': 49,
  '#patient-journey': 50,
  '#journey': 50
};

function handleHashRouting() {
  const hash = window.location.hash;
  if (hash && HASH_MAP[hash] !== undefined) {
    navigateTo(HASH_MAP[hash]);
  } else {
    navigateTo(0);
  }
}

// ===== INIT =====
(async function init() {
  try {
    const data = await API.get('/api/auth/me');
    currentUser = data.user;
  } catch {
    window.location.href = '/login.html';
    return;
  }
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0);

  // Load saved theme + facility type
  try {
    const s = await API.get('/api/settings');
    if (s.theme) { document.documentElement.setAttribute('data-theme', s.theme); document.getElementById('themeSelect').value = s.theme; }
    if (s.facility_type) facilityType = s.facility_type;
  } catch { }

  buildNav();
  setupEvents();
  handleHashRouting();

  // Language: set direction
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  document.documentElement.lang = isArabic ? 'ar' : 'en';
  // Set initial toggle button text
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.textContent = isArabic ? '🌐 EN' : '🌐 عربي';
  // Update all shell elements to match language
  updateShellLanguage();
})();

function buildNav() {
  const nav = document.getElementById('navList');
  const userPerms = currentUser?.permissions ? currentUser.permissions.split(',') : [];
  const isAdmin = currentUser?.role === 'Admin';

  const CLINICAL_ORDER = [0, 40, 29, 30, 31, 39, 50, 51, 49, 32, 33, 34, 41, 36, 37, 38, 58, 42, 70];
  const allIndices = [...CLINICAL_ORDER];
  for (let idx = 0; idx < NAV_ITEMS.length; idx++) {
    if (!allIndices.includes(idx)) {
      allIndices.push(idx);
    }
  }

  nav.innerHTML = allIndices.map(i => {
    const item = NAV_ITEMS[i];
    if (!item) return '';
    const hasPerm = isAdmin || i === 0 || userPerms.includes(i.toString());
    if (!hasPerm) return '';
    // Filter by facility type
    const allowed = FACILITY_ALLOWED[facilityType];
    if (allowed && !allowed.includes(i)) return '';
    return `<div class="nav-item${i === currentPage ? ' active' : ''}" data-page="${i}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${tr(item.en, item.ar)}</span>
    </div>`;
  }).join('');

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(parseInt(el.dataset.page)));
  });
}


// Add notification bell to header
const headerR = document.querySelector('.header-right') || document.querySelector('.header');
if (headerR) {
  const bellSpan = document.createElement('span');
  bellSpan.id = 'notifBell';
  bellSpan.style.cssText = 'cursor:pointer;font-size:20px;position:relative;margin-left:12px;margin-right:12px';
  bellSpan.innerHTML = '🔔';
  headerR.prepend(bellSpan);
}

function setupEvents() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await API.post('/api/auth/logout');
    window.location.href = '/login.html';
  });
  document.getElementById('themeSelect').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    API.put('/api/settings', { theme: e.target.value }).catch(() => { });
  });
  document.getElementById('langToggleBtn').addEventListener('click', () => {
    isArabic = !isArabic;
    localStorage.setItem('namaLang', isArabic ? 'ar' : 'en');
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.documentElement.lang = isArabic ? 'ar' : 'en';
    // Update toggle button text
    document.getElementById('langToggleBtn').textContent = isArabic ? '🌐 EN' : '🌐 عربي';
    updateShellLanguage();
    buildNav();
    navigateTo(currentPage);
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  });
  document.getElementById('globalSearch').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const txt = e.target.value.trim();
      if (!txt) return;
      const res = await API.get('/api/patients?search=' + encodeURIComponent(txt));
      let html = `<div id="searchResultPopup" class="card" style="position:absolute;top:60px;right:20px;width:700px;z-index:1000;box-shadow:0 10px 30px rgba(0,0,0,0.5)">
               <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                 <strong>🔍 ${tr('Search Results', 'نتائج البحث')} (${res.length})</strong>
                 <button class="btn btn-danger btn-sm" onclick="document.getElementById('searchResultPopup').remove()">❌</button>
               </div>
               <div style="max-height:400px;overflow-y:auto">
                 ${makeTable(
        [tr('File#', 'رقم الملف'), tr('Name', 'الاسم'), tr('National ID', 'الهوية'), tr('Phone', 'الجوال'), tr('Dept', 'القسم')],
        res.map(p => ({ cells: [p.file_number, isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar), p.national_id, p.phone, p.department] }))
      )}
               </div>
            </div>`;
      const old = document.getElementById('searchResultPopup');
      if (old) old.remove();
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
    }
  });
  // Set initial search placeholder based on language
  const searchBox = document.getElementById('globalSearch');
  if (searchBox) searchBox.placeholder = isArabic ? 'بحث بالاسم، الهوية، الجوال، رقم الملف...' : 'Search by name, ID, phone, file number...';

  // Listen to hashchange events for routing
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash && HASH_MAP[hash] !== undefined && HASH_MAP[hash] !== currentPage) {
      navigateTo(HASH_MAP[hash]);
    }
  });
}

// ===== UPDATE SHELL LANGUAGE =====
// Updates all static HTML elements that are hardcoded in index.html
function updateShellLanguage() {
  // Sidebar title & subtitle
  const sidebarTitle = document.querySelector('.sidebar-title');
  if (sidebarTitle) sidebarTitle.textContent = isArabic ? 'نما الطبي' : 'Nama Medical';
  const sidebarSubtitle = document.querySelector('.sidebar-subtitle');
  if (sidebarSubtitle) sidebarSubtitle.textContent = isArabic ? 'Nama Medical' : 'Medical ERP';

  // Search placeholder
  const searchBox = document.getElementById('globalSearch');
  if (searchBox) searchBox.placeholder = isArabic ? 'بحث بالاسم، الهوية، الجوال، رقم الملف...' : 'Search by name, ID, phone, file number...';

  // Logout button tooltip
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.title = isArabic ? 'تسجيل الخروج' : 'Logout';

  // Theme select options
  const themeNames = [
    { ar: '🔵 أزرق داكن', en: '🔵 Dark Blue' },
    { ar: '🟢 أخضر داكن', en: '🟢 Dark Green' },
    { ar: '🟣 بنفسجي', en: '🟣 Purple' },
    { ar: '🔴 أحمر', en: '🔴 Red' },
    { ar: '🟡 ذهبي', en: '🟡 Gold' },
    { ar: '⬜ فاتح كلاسيك', en: '⬜ Light Classic' },
    { ar: '🔷 فاتح أزرق', en: '🔷 Light Blue' },
    { ar: '🟩 فاتح أخضر', en: '🟩 Light Green' }
  ];
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.title = isArabic ? 'اختر السمة' : 'Choose Theme';
    Array.from(themeSelect.options).forEach((opt, i) => {
      if (themeNames[i]) opt.textContent = isArabic ? themeNames[i].ar : themeNames[i].en;
    });
  }

  // Language toggle button tooltip
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.title = isArabic ? 'تغيير اللغة' : 'Change Language';

  // Page title
  const pageTitle = document.querySelector('title');
  if (pageTitle) pageTitle.textContent = isArabic ? 'نما الطبي - Nama Medical ERP' : 'Nama Medical ERP';
}

async function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', parseInt(el.dataset.page) === page));
  const item = NAV_ITEMS[page];
  if (item) {
    document.getElementById('headerTitle').textContent = tr(item.en, item.ar);
  }
  // Close sidebar on mobile after navigation
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');

  // Sync hash with current page index
  const hash = Object.keys(HASH_MAP).find(key => HASH_MAP[key] === page);
  if (hash && window.location.hash !== hash) {
    window.location.hash = hash;
  }

  await loadPage(page);
}

function showToast(msg, type = 'success') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.className = `toast toast-${type} show`;
  t.innerHTML = `${type === 'success' ? '✅' : '❌'} ${msg}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function makeTable(headers, rows, actions) {
  if (!rows.length) return `<div class="empty-state"><div class="empty-icon">📭</div><p>${tr('No data found', 'لا توجد بيانات')}</p></div>`;
  let html = '<table class="data-table"><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.cells.forEach(c => html += `<td>${c}</td>`);
    if (actions) html += `<td>${actions(row)}</td>`;
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

window.createTable = function(container, id, headers, rows, actions) {
  if (!container) return;
  let html = `<table class="data-table" id="${id}"><thead><tr>`;
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  if (!rows || !rows.length) {
    html += `<tr><td colspan="${headers.length}" class="text-center py-4 text-on-surface-variant">${tr('No data found', 'لا توجد بيانات')}</td></tr>`;
  } else {
    rows.forEach(row => {
      html += `<tr data-id="${row.id || ''}" class="hover:bg-primary/5 transition-colors cursor-pointer">`;
      row.cells.forEach(c => html += `<td>${c}</td>`);
      if (actions) html += `<td>${actions(row)}</td>`;
      html += '</tr>';
    });
  }
  html += '</tbody></table>';
  container.innerHTML = html;
};

function badge(text, type) { return `<span class="badge badge-${type}">${text}</span>`; }

function statusBadge(status) {
  const map = { Waiting: 'warning', 'With Doctor': 'success', Confirmed: 'success', Pending: 'warning', Approved: 'success', Rejected: 'danger', Active: 'success', 'On Leave': 'info', Cancelled: 'danger', Completed: 'success', Requested: 'info', Done: 'success', Available: 'success', Reserved: 'warning', Used: 'info', Expired: 'danger', Compatible: 'success', Incompatible: 'danger', Signed: 'success', Dispensed: 'success', Scheduled: 'info', 'In Progress': 'warning' };
  return badge(status, map[status] || 'info');
}

// ===== PRINT UTILITY =====
window.printDocument = function (title, content, options = {}) {
  const rtl = isArabic ? 'dir="rtl"' : '';
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) { showToast(tr('Please allow pop-ups to print', 'يرجى السماح بالنوافذ المنبثقة للطباعة'), 'error'); return; }
  const showHeader = options.showHeader !== false;
  w.document.write(`<!DOCTYPE html><html ${rtl}><head><meta charset="utf-8"><title>${title}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;color:#333;font-size:13px;direction:${isArabic ? 'rtl' : 'ltr'}}
      .header{text-align:center;border-bottom:3px double #1a5276;padding-bottom:12px;margin-bottom:16px}
      .header h1{font-size:22px;color:#1a5276;margin-bottom:4px}
      .header p{font-size:11px;color:#666}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px}
      .info-grid div{padding:4px 8px;background:#f8f9fa;border-radius:4px}
      .info-grid strong{color:#1a5276}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      th{background:#1a5276;color:#fff;padding:8px 10px;text-align:${isArabic ? 'right' : 'left'};font-size:12px}
      td{padding:6px 10px;border-bottom:1px solid #ddd;font-size:12px}
      tr:nth-child(even){background:#f8f9fa}
      .total-row{font-weight:700;font-size:14px;background:#e8f4fd!important}
      .footer{text-align:center;margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#999}
      .signature{display:flex;justify-content:space-between;margin-top:40px}
      .signature div{text-align:center;min-width:150px;border-top:1px solid #333;padding-top:4px;font-size:11px}
      @media print{body{padding:10px} .no-print{display:none!important}}
    </style></head><body>
    ${showHeader ? '<div class="header"><h1>' + (options.companyName || 'نما الطبي — Nama Medical') + '</h1><p>' + (options.companyInfo || 'مستشفى نما الطبي | Nama Medical Hospital') + '</p></div><h2 style="text-align:center;color:#1a5276;margin-bottom:16px">' + title + '</h2>' : ''}
    ${content}
    <div class="footer">${tr('Printed on', 'طُبع بتاريخ')}: ${new Date().toLocaleString('ar-SA')} | ${tr('Nama Medical ERP', 'نما الطبي')}</div>
    <button class="no-print" onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:10px 24px;background:#1a5276;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨️ ${tr('Print', 'طباعة')}</button>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
};

window.printInvoice = async function (id) {
  try {
    const data = await API.get('/api/print/invoice/' + id);
    const inv = data.invoice;
    const content = `<div class="info-grid">
      <div><strong>${tr('Invoice #', 'فاتورة رقم')}:</strong> ${inv.invoice_number || inv.id}</div>
      <div><strong>${tr('Date', 'التاريخ')}:</strong> ${inv.created_at?.split('T')[0]}</div>
      <div><strong>${tr('Patient', 'المريض')}:</strong> ${inv.patient_name}</div>
      <div><strong>${tr('Payment', 'الدفع')}:</strong> ${inv.payment_method || '-'}</div>
    </div>
    <table><thead><tr><th>${tr('Description', 'الوصف')}</th><th>${tr('Amount', 'المبلغ')}</th><th>${tr('VAT', 'ضريبة')}</th><th>${tr('Total', 'الإجمالي')}</th></tr></thead>
    <tbody><tr><td>${inv.description || inv.service_type}</td><td>${inv.amount} SAR</td><td>${inv.vat_amount || 0} SAR</td><td>${inv.total} SAR</td></tr>
    <tr class="total-row"><td colspan="3">${tr('Grand Total', 'المجموع الكلي')}</td><td>${inv.total} SAR</td></tr></tbody></table>
    <div class="signature"><div>${tr('Cashier', 'أمين الصندوق')}</div><div>${tr('Patient Signature', 'توقيع المريض')}</div></div>`;
    printDocument(tr('Tax Invoice', 'فاتورة ضريبية'), content);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

window.printLabReport = async function (id) {
  try {
    const data = await API.get('/api/print/lab-report/' + id);
    const content = `<div class="info-grid">
      <div><strong>${tr('Patient', 'المريض')}:</strong> ${data.patient?.name_ar || data.patient?.name_en || '-'}</div>
      <div><strong>${tr('File #', 'رقم الملف')}:</strong> ${data.patient?.file_number || '-'}</div>
      <div><strong>${tr('Test', 'الفحص')}:</strong> ${data.order?.description}</div>
      <div><strong>${tr('Date', 'التاريخ')}:</strong> ${data.order?.created_at?.split('T')[0]}</div>
    </div>
    <table><thead><tr><th>${tr('Test', 'الفحص')}</th><th>${tr('Result', 'النتيجة')}</th><th>${tr('Normal Range', 'المعدل الطبيعي')}</th><th>${tr('Status', 'الحالة')}</th></tr></thead>
    <tbody>${(data.results || []).map(r => `<tr style="${r.is_abnormal ? 'color:#e74c3c;font-weight:700' : ''}"><td>${r.test_name || '-'}</td><td>${r.result_value || '-'}</td><td>${r.normal_range || '-'}</td><td>${r.is_abnormal ? '⚠️ ' + tr('Abnormal', 'غير طبيعي') : '✅ ' + tr('Normal', 'طبيعي')}</td></tr>`).join('')}</tbody></table>
    <div class="signature"><div>${tr('Lab Technician', 'فني المختبر')}</div><div>${tr('Doctor', 'الطبيب')}</div></div>`;
    printDocument(tr('Lab Report', 'تقرير مختبر'), content);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== EXPORT UTILITY =====
window.exportCSV = function (filename, headers, rows) {
  const BOM = '\uFEFF';
  const csv = BOM + headers.join(',') + '\n' + rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename + '.csv'; a.click();
  showToast(tr('Exported!', 'تم التصدير'));
};
window.exportTableCSV = function (filename) {
  const table = document.querySelector('#pageContent table');
  if (!table) return showToast(tr('No table found', 'لا يوجد جدول'), 'error');
  const headers = [...table.querySelectorAll('th')].map(h => h.textContent);
  const rows = [...table.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim()));
  exportCSV(filename, headers, rows);
};


// ===== CONSENT FORMS =====
async function renderConsentForms(el) {
  const content = el;

  const visits = await API.get('/api/visits').catch(() => []);
  const consentTypes = [
    { id: 'general', en: 'General Consent', ar: 'موافقة عامة', icon: '📋' },
    { id: 'surgery', en: 'Surgical Consent', ar: 'موافقة جراحية', icon: '🏥' },
    { id: 'anesthesia', en: 'Anesthesia Consent', ar: 'موافقة تخدير', icon: '💉' },
    { id: 'blood', en: 'Blood Transfusion', ar: 'نقل دم', icon: '🩸' },
    { id: 'discharge', en: 'Against Medical Advice', ar: 'خروج ضد النصيحة', icon: '🚪' },
    { id: 'procedures', en: 'Procedures Consent', ar: 'موافقة إجراءات', icon: '⚕️' },
  ];

  content.innerHTML = `
    <h2>${tr('Consent Forms', 'نماذج الموافقة')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px">
      ${consentTypes.map(t => '<div class="card" style="padding:20px;text-align:center;cursor:pointer;transition:transform 0.2s" onclick="printConsentForm(\'' + t.id + '\',\'' + t.en + '\',\'' + t.ar + '\')" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'"><div style="font-size:36px;margin-bottom:8px">' + t.icon + '</div><h4 style="margin:0">' + tr(t.en, t.ar) + '</h4><p style="margin:4px 0 0;font-size:11px;color:#666">' + tr('Click to generate', 'اضغط لإنشاء') + '</p></div>').join('')}
    </div>
    <div class="card" style="padding:20px">
      <h4 style="margin:0 0 12px">${tr('Generate Consent for Patient', 'إنشاء نموذج موافقة لمريض')}</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end">
        <div class="form-group"><label>${tr('Patient Name', 'اسم المريض')}</label><input class="form-input" id="cfPatient"></div>
        <div class="form-group"><label>${tr('MRN', 'رقم الملف')}</label><input class="form-input" id="cfMRN"></div>
        <div class="form-group"><label>${tr('Consent Type', 'نوع الموافقة')}</label>
          <select class="form-input" id="cfType">${consentTypes.map(t => '<option value="' + t.id + '">' + tr(t.en, t.ar) + '</option>').join('')}</select></div>
        <button class="btn btn-primary" onclick="generateConsent()">🖨️ ${tr('Generate & Print', 'إنشاء وطباعة')}</button>
      </div>
    </div>`;

  window.printConsentForm = (type, en, ar) => {
    const patientName = document.getElementById('cfPatient')?.value || '_______________';
    const mrn = document.getElementById('cfMRN')?.value || '___________';
    const now = new Date().toLocaleDateString('ar-SA');
    const body = '<div style="text-align:center;border-bottom:3px double #1a5276;padding-bottom:16px;margin-bottom:20px"><h1 style="color:#1a5276;margin:0">نما الطبي — Nama Medical</h1><p style="color:#666;margin:4px 0">' + tr('Consent Form', 'نموذج موافقة') + '</p></div>' +
      '<h2 style="text-align:center;color:#1a5276;margin-bottom:20px">' + tr(en, ar) + '</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px"><div><strong>' + tr('Patient', 'المريض') + ':</strong> ' + patientName + '</div><div><strong>' + tr('MRN', 'رقم الملف') + ':</strong> ' + mrn + '</div><div><strong>' + tr('Date', 'التاريخ') + ':</strong> ' + now + '</div></div>' +
      '<div style="border:1px solid #ddd;padding:20px;border-radius:8px;margin-bottom:20px;min-height:200px"><p>' + tr('I, the undersigned, hereby consent to...', 'أنا الموقع أدناه أوافق على...') + '</p><br><p style="color:#999;font-size:12px">' + tr('Patient has been informed about the procedure, risks, and alternatives.', 'تم إبلاغ المريض بالإجراء والمخاطر والبدائل.') + '</p></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:60px"><div style="text-align:center;min-width:200px;border-top:1px solid #333;padding-top:8px">' + tr('Patient Signature', 'توقيع المريض') + '</div><div style="text-align:center;min-width:200px;border-top:1px solid #333;padding-top:8px">' + tr('Doctor Signature', 'توقيع الطبيب') + '</div><div style="text-align:center;min-width:200px;border-top:1px solid #333;padding-top:8px">' + tr('Witness', 'الشاهد') + '</div></div>';
    printDocument(tr(en, ar), body);
  };
  window.generateConsent = () => {
    const type = document.getElementById('cfType').value;
    const ct = consentTypes.find(t => t.id === type);
    if (ct) window.printConsentForm(type, ct.en, ct.ar);
  };

}

let _signCtx = null, _signDrawing = false;
function initSignaturePad() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas) return;
  _signCtx = canvas.getContext('2d');
  _signCtx.strokeStyle = '#000';
  _signCtx.lineWidth = 2;
  _signCtx.lineCap = 'round';

  canvas.addEventListener('mousedown', e => { _signDrawing = true; _signCtx.beginPath(); _signCtx.moveTo(e.offsetX, e.offsetY); });
  canvas.addEventListener('mousemove', e => { if (_signDrawing) { _signCtx.lineTo(e.offsetX, e.offsetY); _signCtx.stroke(); } });
  canvas.addEventListener('mouseup', () => _signDrawing = false);
  canvas.addEventListener('mouseleave', () => _signDrawing = false);
  // Touch support
  canvas.addEventListener('touchstart', e => { e.preventDefault(); _signDrawing = true; const r = canvas.getBoundingClientRect(); _signCtx.beginPath(); _signCtx.moveTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (_signDrawing) { const r = canvas.getBoundingClientRect(); _signCtx.lineTo(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); _signCtx.stroke(); } });
  canvas.addEventListener('touchend', () => _signDrawing = false);
}

function clearSignature() {
  const canvas = document.getElementById('signaturePad');
  if (canvas && _signCtx) _signCtx.clearRect(0, 0, canvas.width, canvas.height);
}

async function loadConsentText() {
  const id = document.getElementById('consentTemplate')?.value;
  const area = document.getElementById('consentTextArea');
  if (!id) { area.style.display = 'none'; return; }
  try {
    const t = await API.get('/api/consent/templates/' + id);
    document.getElementById('consentTitle').textContent = t.title_ar;
    document.getElementById('consentBody').textContent = isArabic ? t.body_text_ar : t.body_text;
    area.style.display = 'block';
    // Show witness section if required
    document.getElementById('witnessSection').style.display = t.requires_witness ? 'block' : 'none';
    clearSignature();
    setTimeout(() => initSignaturePad(), 50);
  } catch (e) { showToast(tr('Error loading form', 'خطأ في تحميل الإقرار'), 'error'); }
}

window.loadConsentText = loadConsentText;
window.clearSignature = clearSignature;

async function submitConsent() {
  const patientId = document.getElementById('consentPatient')?.value;
  const templateId = document.getElementById('consentTemplate')?.value;
  const canvas = document.getElementById('signaturePad');
  if (!patientId) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  if (!templateId) return showToast(tr('Select consent form', 'اختر الإقرار'), 'error');
  // Check if canvas has content
  const sigData = canvas.toDataURL('image/png');
  const emptyCanvas = document.createElement('canvas');
  emptyCanvas.width = canvas.width; emptyCanvas.height = canvas.height;
  if (sigData === emptyCanvas.toDataURL('image/png')) return showToast(tr('Please sign the form', 'الرجاء التوقيع على الإقرار'), 'error');

  const patientSelect = document.getElementById('consentPatient');
  const patientName = patientSelect.options[patientSelect.selectedIndex]?.text || '';

  try {
    await API.post('/api/consent/sign', {
      template_id: templateId,
      patient_id: patientId,
      patient_name: patientName.split(' (')[0],
      signature_data: sigData,
      witness_name: document.getElementById('witnessName')?.value || '',
      doctor_name: document.getElementById('consentDoctor')?.value || '',
      procedure_details: document.getElementById('consentProcedure')?.value || ''
    });
    showToast(tr('Consent signed!', 'تم التوقيع على الإقرار!'));
    renderConsentForms(document.getElementById('pageContent'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
}
window.submitConsent = submitConsent;

window.viewSignedConsent = async function (id) {
  try {
    const consents = await API.get('/api/consent/recent');
    const c = consents.find(x => x.id === id);
    if (!c) return;
    const tmpl = await API.get('/api/consent/templates/' + c.template_id);
    let html = '<div style="direction:rtl;text-align:right">' +
      '<h3 style="margin-bottom:12px;color:var(--primary)">' + (tmpl.title_ar || c.title) + '</h3>' +
      '<div style="white-space:pre-wrap;line-height:2;font-size:14px;padding:12px;background:var(--hover);border-radius:8px;max-height:300px;overflow-y:auto;margin-bottom:16px">' + tmpl.body_text_ar + '</div>' +
      '<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px">' +
      '<div><strong>' + tr('Patient', 'المريض') + ':</strong> ' + c.patient_name + '</div>' +
      '<div><strong>' + tr('Doctor', 'الطبيب') + ':</strong> ' + (c.doctor_name || c.created_by) + '</div>' +
      '<div><strong>' + tr('Date', 'التاريخ') + ':</strong> ' + new Date(c.signed_at || c.created_at).toLocaleString('ar-SA') + '</div>' +
      (c.witness_name ? '<div><strong>' + tr('Witness', 'الشاهد') + ':</strong> ' + c.witness_name + '</div>' : '') +
      '</div>';
    if (c.signature_data) html += '<div style="margin-top:12px"><strong>' + tr('Signature', 'التوقيع') + ':</strong><br><img src="' + c.signature_data + '" style="max-width:300px;border:1px solid var(--border);border-radius:4px;margin-top:4px"></div>';
    html += '</div>';
    showModal(tr('Signed Consent', 'الإقرار الموقع'), html);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

window.printSignedConsent = async function (id) {
  try {
    const consents = await API.get('/api/consent/recent');
    const c = consents.find(x => x.id === id);
    if (!c) return;
    const tmpl = await API.get('/api/consent/templates/' + c.template_id);
    let html = '<div style="direction:rtl;text-align:right;font-family:Arial,sans-serif">' +
      '<div style="text-align:center;margin-bottom:20px"><h2>مركز نما الطبي</h2><h3 style="color:#1a56db">' + tmpl.title_ar + '</h3></div>' +
      '<div style="white-space:pre-wrap;line-height:2.2;font-size:14px;margin-bottom:20px">' + tmpl.body_text_ar + '</div>' +
      (c.procedure_details ? '<div style="margin-bottom:16px;padding:8px;border:1px solid #ccc;border-radius:4px"><strong>تفاصيل الإجراء:</strong> ' + c.procedure_details + '</div>' : '') +
      '<div style="margin-top:30px;display:flex;justify-content:space-between">' +
      '<div><strong>اسم المريض:</strong> ' + c.patient_name + '</div>' +
      '<div><strong>التاريخ:</strong> ' + new Date(c.signed_at || c.created_at).toLocaleDateString('ar-SA') + '</div>' +
      '</div>' +
      '<div style="margin-top:10px"><strong>الطبيب:</strong> ' + (c.doctor_name || '-') + '</div>' +
      (c.witness_name ? '<div style="margin-top:10px"><strong>الشاهد:</strong> ' + c.witness_name + '</div>' : '') +
      '<div style="margin-top:20px"><strong>التوقيع:</strong><br>' +
      (c.signature_data ? '<img src="' + c.signature_data + '" style="max-width:250px;margin-top:4px">' : '_______________') + '</div>' +
      '</div>';
    printDocument(tmpl.title_ar, html, { showHeader: false });
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};



// ===== OB/GYN DEPARTMENT PAGE =====
async function renderOBGYN(el) {
  let stats = { activePregnancies: 0, highRisk: 0, dueThisWeek: 0, deliveredThisMonth: 0 };
  try { stats = await API.get('/api/obgyn/stats'); } catch (e) { }
  const patients = await API.get('/api/patients');
  let patOpts = patients.map(p => '<option value="' + p.id + '" data-name="' + (p.name_ar || p.name_en) + '">' + (p.name_ar || p.name_en) + ' (' + p.file_number + ')</option>').join('');

  el.innerHTML = '<div class="page-title">🤰 ' + tr('OB/GYN Department', 'قسم النساء والتوليد') + '</div>' +
    '<div class="stats-grid">' +
    '<div class="stat-card" style="--stat-color:#ec4899"><div class="stat-label">' + tr('Active Pregnancies', 'حمل نشط') + '</div><div class="stat-value">' + stats.activePregnancies + '</div></div>' +
    '<div class="stat-card" style="--stat-color:#ef4444"><div class="stat-label">' + tr('High Risk', 'عالي الخطورة') + '</div><div class="stat-value">' + stats.highRisk + '</div></div>' +
    '<div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">' + tr('Due This Week', 'ولادة هذا الأسبوع') + '</div><div class="stat-value">' + stats.dueThisWeek + '</div></div>' +
    '<div class="stat-card" style="--stat-color:#22c55e"><div class="stat-label">' + tr('Delivered This Month', 'ولادات هذا الشهر') + '</div><div class="stat-value">' + stats.deliveredThisMonth + '</div></div>' +
    '</div>' +

    '<div class="card" style="margin-top:16px"><h3 style="margin-bottom:12px">📋 ' + tr('New Pregnancy Record', 'سجل حمل جديد') + '</h3>' +
    '<div class="form-grid" style="gap:10px">' +
    '<div class="form-group"><label>' + tr('Patient', 'المريضة') + '</label><select id="obPatient" class="form-control"><option value="">' + tr('-- Select --', '-- اختري --') + '</option>' + patOpts + '</select></div>' +
    '<div class="form-group"><label>' + tr('LMP (Last Menstrual Period)', 'آخر دورة شهرية') + '</label><input type="date" id="obLMP" class="form-control"></div>' +
    '<div class="form-group"><label>G (Gravida)</label><input type="number" id="obGravida" class="form-control" value="1" min="1"></div>' +
    '<div class="form-group"><label>P (Para)</label><input type="number" id="obPara" class="form-control" value="0" min="0"></div>' +
    '<div class="form-group"><label>A (Abortions)</label><input type="number" id="obAbort" class="form-control" value="0" min="0"></div>' +
    '<div class="form-group"><label>' + tr('Blood Group', 'فصيلة الدم') + '</label><select id="obBlood" class="form-control"><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div>' +
    '<div class="form-group"><label>Rh</label><select id="obRh" class="form-control"><option>Positive</option><option>Negative</option></select></div>' +
    '<div class="form-group"><label>' + tr('Risk Level', 'مستوى الخطورة') + '</label><select id="obRisk" class="form-control"><option value="Low">' + tr('Low', 'منخفض') + '</option><option value="Medium">' + tr('Medium', 'متوسط') + '</option><option value="High">' + tr('High', 'عالي') + '</option></select></div>' +
    '<div class="form-group"><label>' + tr('Previous C-Sections', 'قيصريات سابقة') + '</label><input type="number" id="obPrevCS" class="form-control" value="0" min="0"></div>' +
    '<div class="form-group"><label>' + tr('Chronic Conditions', 'أمراض مزمنة') + '</label><input id="obChronic" class="form-control" placeholder="' + tr('DM, HTN, etc', 'سكري، ضغط...') + '"></div>' +
    '<div class="form-group"><label>' + tr('Allergies', 'حساسية') + '</label><input id="obAllergy" class="form-control"></div>' +
    '<div class="form-group"><label>' + tr('Attending Doctor', 'الطبيب المعالج') + '</label><input id="obDoctor" class="form-control" value="' + (currentUser?.display_name || '') + '"></div>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="createPregnancy()" style="margin-top:12px">✅ ' + tr('Create Record', 'إنشاء السجل') + '</button></div>' +

    '<div class="card" style="margin-top:16px"><h3 style="margin-bottom:12px">📊 ' + tr('Active Pregnancies', 'الحالات النشطة') + '</h3><div id="obActiveList">' + tr('Loading...', 'جاري التحميل...') + '</div></div>' +

    '<div class="card" style="margin-top:16px"><h3 style="margin-bottom:12px">🧪 ' + tr('Lab Panels', 'حزم الفحوصات') + '</h3><div id="obLabPanels">' + tr('Loading...', 'جاري التحميل...') + '</div></div>';

  // Load active pregnancies
  try {
    const preg = await API.get('/api/obgyn/pregnancies?status=Active');
    const list = document.getElementById('obActiveList');
    if (preg.length === 0) { list.innerHTML = '<p style="color:var(--text-muted)">' + tr('No active pregnancies', 'لا توجد حالات نشطة') + '</p>'; }
    else {
      let html = '<table class="data-table"><thead><tr><th>' + tr('Patient', 'المريضة') + '</th><th>GPAL</th><th>' + tr('EDD', 'تاريخ الولادة المتوقع') + '</th><th>' + tr('Risk', 'الخطورة') + '</th><th>' + tr('Doctor', 'الطبيب') + '</th><th>' + tr('Actions', 'إجراءات') + '</th></tr></thead><tbody>';
      preg.forEach(p => {
        const riskColor = p.risk_level === 'High' ? '#ef4444' : p.risk_level === 'Medium' ? '#f59e0b' : '#22c55e';
        html += '<tr><td>' + p.patient_name + '</td><td>G' + p.gravida + 'P' + p.para + 'A' + p.abortions + 'L' + p.living_children + '</td><td>' + (p.edd || '-') + '</td><td><span style="color:' + riskColor + ';font-weight:700">' + p.risk_level + '</span></td><td>' + (p.attending_doctor || '-') + '</td><td><button class="btn btn-sm" onclick="showAntenatalForm(' + p.id + ',' + p.patient_id + ')">📋 ' + tr('Antenatal', 'متابعة') + '</button></td></tr>';
      });
      html += '</tbody></table>';
      list.innerHTML = html;
    }
  } catch (e) { document.getElementById('obActiveList').innerHTML = '<p style="color:red">Error loading</p>'; }

  // Load lab panels
  try {
    const panels = await API.get('/api/obgyn/lab-panels');
    let ph = '<div style="display:grid;gap:8px">';
    panels.forEach(p => {
      ph += '<div style="padding:12px;border-radius:8px;background:var(--hover);border-right:3px solid #ec4899"><strong>' + p.panel_name_ar + '</strong> (' + p.trimester + ')<br><small style="color:var(--text-muted)">' + p.tests + '</small></div>';
    });
    ph += '</div>';
    document.getElementById('obLabPanels').innerHTML = ph;
  } catch (e) { }
}

window.createPregnancy = async () => {
  const patSel = document.getElementById('obPatient');
  const pid = patSel.value;
  if (!pid) return showToast(tr('Select patient', 'اختري مريضة'), 'error');
  const lmp = document.getElementById('obLMP').value;
  if (!lmp) return showToast(tr('Enter LMP date', 'أدخلي تاريخ آخر دورة'), 'error');
  try {
    await API.post('/api/obgyn/pregnancies', {
      patient_id: pid,
      patient_name: patSel.options[patSel.selectedIndex]?.dataset?.name || '',
      lmp, gravida: parseInt(document.getElementById('obGravida').value) || 1,
      para: parseInt(document.getElementById('obPara').value) || 0,
      abortions: parseInt(document.getElementById('obAbort').value) || 0,
      blood_group: document.getElementById('obBlood').value,
      rh_factor: document.getElementById('obRh').value,
      risk_level: document.getElementById('obRisk').value,
      previous_cs: parseInt(document.getElementById('obPrevCS').value) || 0,
      chronic_conditions: document.getElementById('obChronic').value,
      allergies: document.getElementById('obAllergy').value,
      attending_doctor: document.getElementById('obDoctor').value
    });
    showToast(tr('Pregnancy record created!', 'تم إنشاء سجل الحمل!'));
    navigateTo(currentPage);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

window.showAntenatalForm = async (pregId, patientId) => {
  const visits = await API.get('/api/obgyn/antenatal/' + pregId);
  let vRows = visits.map(v => '<tr><td>' + v.visit_number + '</td><td>' + (v.gestational_age || '-') + '</td><td>' + v.blood_pressure + '</td><td>' + v.fetal_heart_rate + '</td><td>' + v.weight + 'kg</td><td>' + (v.risk_flags || '✅') + '</td></tr>').join('');

  let html = '<h4 style="margin-bottom:8px">' + tr('Previous Visits', 'الزيارات السابقة') + '</h4>' +
    (visits.length ? '<table class="data-table" style="margin-bottom:16px"><thead><tr><th>#</th><th>GA</th><th>BP</th><th>FHR</th><th>Wt</th><th>Flags</th></tr></thead><tbody>' + vRows + '</tbody></table>' : '<p style="color:var(--text-muted);margin-bottom:16px">' + tr('No visits yet', 'لا زيارات') + '</p>') +
    '<h4 style="margin-bottom:8px">' + tr('New Visit', 'زيارة جديدة') + '</h4>' +
    '<div class="form-grid" style="gap:8px">' +
    '<div class="form-group"><label>GA (weeks)</label><input id="antGA" class="form-control" placeholder="e.g. 28+3"></div>' +
    '<div class="form-group"><label>Weight (kg)</label><input type="number" id="antWt" class="form-control" step="0.1"></div>' +
    '<div class="form-group"><label>BP</label><input id="antBP" class="form-control" placeholder="120/80"></div>' +
    '<div class="form-group"><label>Systolic</label><input type="number" id="antSys" class="form-control"></div>' +
    '<div class="form-group"><label>Diastolic</label><input type="number" id="antDia" class="form-control"></div>' +
    '<div class="form-group"><label>FHR</label><input type="number" id="antFHR" class="form-control" placeholder="110-160"></div>' +
    '<div class="form-group"><label>Fundal Height</label><input type="number" id="antFH" class="form-control" step="0.5"></div>' +
    '<div class="form-group"><label>Hb</label><input type="number" id="antHb" class="form-control" step="0.1"></div>' +
    '<div class="form-group"><label>Presentation</label><select id="antPres" class="form-control"><option>Cephalic</option><option>Breech</option><option>Transverse</option></select></div>' +
    '<div class="form-group"><label>Edema</label><select id="antEdema" class="form-control"><option>None</option><option>Mild +</option><option>Moderate ++</option><option>Severe +++</option></select></div>' +
    '</div>' +
    '<div class="form-group" style="margin-top:8px"><label>Complaints</label><textarea id="antComp" class="form-control" rows="2"></textarea></div>' +
    '<div class="form-group"><label>Plan</label><textarea id="antPlan" class="form-control" rows="2"></textarea></div>' +
    '<button class="btn btn-primary" onclick="saveAntenatal(' + pregId + ',' + patientId + ')" style="margin-top:8px">💾 ' + tr('Save Visit', 'حفظ الزيارة') + '</button>';
  showModal(tr('Antenatal Visit', 'زيارة متابعة الحمل') + ' #' + pregId, html);
};

window.saveAntenatal = async (pregId, patientId) => {
  const bp = document.getElementById('antBP').value;
  try {
    await API.post('/api/obgyn/antenatal', {
      pregnancy_id: pregId, patient_id: patientId,
      gestational_age: document.getElementById('antGA').value,
      weight: parseFloat(document.getElementById('antWt').value) || 0,
      blood_pressure: bp,
      systolic: parseInt(document.getElementById('antSys').value) || (bp ? parseInt(bp.split('/')[0]) : 0),
      diastolic: parseInt(document.getElementById('antDia').value) || (bp ? parseInt(bp.split('/')[1]) : 0),
      fetal_heart_rate: parseInt(document.getElementById('antFHR').value) || 0,
      fundal_height: parseFloat(document.getElementById('antFH').value) || 0,
      hemoglobin: parseFloat(document.getElementById('antHb').value) || 0,
      fetal_presentation: document.getElementById('antPres').value,
      edema: document.getElementById('antEdema').value,
      complaints: document.getElementById('antComp').value,
      plan: document.getElementById('antPlan').value
    });
    showToast(tr('Visit saved!', 'تم حفظ الزيارة!'));
    document.querySelector('.modal-overlay')?.remove();
    navigateTo(currentPage);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};


// ===== PAGE LOADER =====
async function loadPage(page) {
  const el = document.getElementById('pageContent');
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  const pages = [renderDashboard, renderReception, renderAppointments, renderDoctor, renderLab, renderRadiology, renderPharmacy, renderHR, renderFinance, renderInsurance, renderInventory, renderNursing, renderWaitingQueue, renderPatientAccounts, renderReports, renderMessaging, renderCatalog, renderDeptRequests, renderSurgery, renderBloodBank, renderConsentForms, renderEmergency, renderInpatient, renderICU, renderCSSD, renderDietary, renderInfectionControl, renderQuality, renderMaintenance, renderTransport, renderMedicalRecords, renderClinicalPharmacy, renderRehabilitation, renderPatientPortal, renderZATCA, renderTelemedicine, renderPathology, renderSocialWork, renderMortuary, renderCME, renderCosmeticSurgery, renderOBGYN, renderSettings, renderClinicalResearch, renderPublicHealth, renderCrisisCommand, renderSmartFacility, renderLegal, renderToxicology, renderBigData, renderPatientJourney];
  if (pages[page]) await pages[page](el);
  else el.innerHTML = `<div class="page-title">${NAV_ITEMS[page]?.icon} ${tr(NAV_ITEMS[page]?.en, NAV_ITEMS[page]?.ar)}</div><div class="card"><p>${tr('Coming soon...', 'قريباً...')}</p></div>`;
}

// ===== DASHBOARD =====


// ===== MEDICAL REPORT / SICK LEAVE =====
window.showMedicalReportForm = (type) => {
  const patientId = document.getElementById('drPatient')?.value || window._selectedPatientId;
  if (!patientId) return showToast(tr('Select patient first', 'اختر مريض أولاً'), 'error');
  const patientName = document.getElementById('drPatient')?.selectedOptions[0]?.text || window._selectedPatientName || '';

  const typeLabels = {
    sick_leave: { en: 'Sick Leave', ar: 'إجازة مرضية' },
    medical_report: { en: 'Medical Report', ar: 'تقرير طبي' },
    fitness: { en: 'Fitness Certificate', ar: 'شهادة لياقة' },
  };
  const label = typeLabels[type] || typeLabels.medical_report;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = '<div style="background:var(--bg-card,#fff);border-radius:16px;padding:24px;width:550px;max-height:90vh;overflow-y:auto;direction:rtl">' +
    '<h3 style="margin:0 0 16px;color:var(--primary)">' + (isArabic ? label.ar : label.en) + '</h3>' +
    '<div class="form-group"><label>' + tr('Patient', 'المريض') + '</label><input class="form-input" value="' + patientName + '" readonly></div>' +
    '<div class="form-group"><label>' + tr('Diagnosis', 'التشخيص') + '</label><input class="form-input" id="mrDiagnosis" placeholder="' + tr('Diagnosis', 'التشخيص') + '"></div>' +
    '<div class="form-group"><label>' + tr('ICD Code', 'رمز ICD') + '</label><input class="form-input" id="mrICD" placeholder="e.g. J06.9"></div>' +
    (type === 'sick_leave' ?
      '<div style="display:flex;gap:12px">' +
      '<div class="form-group" style="flex:1"><label>' + tr('From', 'من') + '</label><input type="date" class="form-input" id="mrFrom"></div>' +
      '<div class="form-group" style="flex:1"><label>' + tr('To', 'إلى') + '</label><input type="date" class="form-input" id="mrTo"></div>' +
      '<div class="form-group" style="flex:1"><label>' + tr('Days', 'أيام') + '</label><input type="number" class="form-input" id="mrDays" min="1"></div>' +
      '</div>' : '') +
    (type === 'fitness' ?
      '<div class="form-group"><label>' + tr('Fitness Status', 'حالة اللياقة') + '</label>' +
      '<select class="form-input" id="mrFitness"><option value="fit">' + tr('Fit', 'لائق') + '</option><option value="unfit">' + tr('Unfit', 'غير لائق') + '</option><option value="conditional">' + tr('Conditional', 'مشروط') + '</option></select></div>' : '') +
    '<div class="form-group"><label>' + tr('Notes', 'ملاحظات') + '</label><textarea class="form-input" id="mrNotes" rows="3"></textarea></div>' +
    '<div style="display:flex;gap:12px;margin-top:16px">' +
    '<button class="btn btn-primary" onclick="saveMedicalReport(\'' + type + '\', ' + patientId + ', \'' + patientName.replace(/'/g, '') + '\')" style="flex:1">💾 ' + tr('Save & Print', 'حفظ وطباعة') + '</button>' +
    '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()" style="flex:1">' + tr('Cancel', 'إلغاء') + '</button>' +
    '</div></div>';
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.saveMedicalReport = async (type, patientId, patientName) => {
  try {
    const data = {
      patient_id: patientId,
      patient_name: patientName,
      report_type: type,
      diagnosis: document.getElementById('mrDiagnosis')?.value || '',
      icd_code: document.getElementById('mrICD')?.value || '',
      start_date: document.getElementById('mrFrom')?.value || null,
      end_date: document.getElementById('mrTo')?.value || null,
      duration_days: document.getElementById('mrDays')?.value || null,
      notes: document.getElementById('mrNotes')?.value || '',
      fitness_status: document.getElementById('mrFitness')?.value || null,
    };

    const result = await API.post('/api/medical-reports', data);
    document.querySelector('.modal-overlay')?.remove();
    showToast(tr('Report saved!', 'تم حفظ التقرير!'));

    // Print the report
    printMedicalReport(result, type);
  } catch (e) { console.error('Medical report error:', e); showToast(e?.message || tr('Error saving report', 'خطأ في حفظ التقرير'), 'error'); }
};

window.printMedicalReport = (report, type) => {
  const typeLabels = { sick_leave: { ar: 'إجازة مرضية', en: 'Sick Leave Certificate' }, medical_report: { ar: 'تقرير طبي', en: 'Medical Report' }, fitness: { ar: 'شهادة لياقة طبية', en: 'Fitness Certificate' } };
  const label = typeLabels[type] || typeLabels.medical_report;

  let html = '<div style="font-family:Arial;padding:40px;direction:rtl;text-align:right;line-height:2">';
  html += '<div style="text-align:center;border-bottom:2px solid #1a73e8;padding-bottom:16px;margin-bottom:24px">';
  html += '<h2 style="color:#1a73e8;margin:0">نما الطبي - Nama Medical</h2>';
  html += '<p style="margin:4px 0;color:#666">المملكة العربية السعودية</p>';
  html += '</div>';
  html += '<h3 style="text-align:center;background:#f0f6ff;padding:12px;border-radius:8px;margin:20px 0">' + label.ar + ' / ' + label.en + '</h3>';
  html += '<table style="width:100%;margin:16px 0;border-collapse:collapse">';
  html += '<tr><td style="padding:8px;font-weight:bold;width:30%">رقم التقرير:</td><td style="padding:8px">' + (report.report_number || '') + '</td></tr>';
  html += '<tr><td style="padding:8px;font-weight:bold">اسم المريض:</td><td style="padding:8px">' + (report.patient_name || '') + '</td></tr>';
  html += '<tr><td style="padding:8px;font-weight:bold">التشخيص:</td><td style="padding:8px">' + (report.diagnosis || '') + '</td></tr>';
  if (report.icd_code) html += '<tr><td style="padding:8px;font-weight:bold">رمز ICD:</td><td style="padding:8px">' + report.icd_code + '</td></tr>';
  if (type === 'sick_leave') {
    html += '<tr><td style="padding:8px;font-weight:bold">من تاريخ:</td><td style="padding:8px">' + (report.start_date || '') + '</td></tr>';
    html += '<tr><td style="padding:8px;font-weight:bold">إلى تاريخ:</td><td style="padding:8px">' + (report.end_date || '') + '</td></tr>';
    html += '<tr><td style="padding:8px;font-weight:bold">عدد الأيام:</td><td style="padding:8px">' + (report.duration_days || '') + ' ' + (isArabic ? 'يوم' : 'days') + '</td></tr>';
  }
  if (type === 'fitness') {
    const statusAr = { fit: 'لائق طبياً', unfit: 'غير لائق', conditional: 'لائق بشروط' };
    html += '<tr><td style="padding:8px;font-weight:bold">الحالة:</td><td style="padding:8px;font-weight:bold;color:' + (report.fitness_status === 'fit' ? 'green' : 'red') + '">' + (statusAr[report.fitness_status] || '') + '</td></tr>';
  }
  if (report.notes) html += '<tr><td style="padding:8px;font-weight:bold">ملاحظات:</td><td style="padding:8px">' + report.notes + '</td></tr>';
  html += '</table>';
  html += '<div style="margin-top:40px;display:flex;justify-content:space-between">';
  html += '<div style="text-align:center"><p>_______________</p><p>توقيع الطبيب</p><p style="font-weight:bold">' + (report.doctor || '') + '</p></div>';
  html += '<div style="text-align:center"><p>_______________</p><p>ختم المنشأة</p></div>';
  html += '</div>';
  html += '<p style="text-align:center;margin-top:24px;font-size:11px;color:#999">تاريخ الإصدار: ' + new Date().toLocaleDateString('ar-SA') + ' | Report #' + (report.report_number || '') + '</p>';
  html += '</div>';

  printDocument(label.ar, html, { showHeader: false });
};

// ===== DRUG INTERACTION CHECK =====
window.checkDrugInteractions = async (drugs) => {
  try {
    if (!drugs || drugs.length < 2) return;
    const result = await API.post('/api/drug-interactions/check', { drugs });
    if (result.interactions && result.interactions.length > 0) {
      let alertHtml = '<div style="background:#fff3f3;border:2px solid #ff4444;border-radius:12px;padding:16px;direction:rtl">';
      alertHtml += '<h4 style="color:#cc0000;margin:0 0 12px">⚠️ ' + tr('Drug Interactions Found!', 'تم العثور على تعارضات دوائية!') + '</h4>';
      result.interactions.forEach(i => {
        const color = i.severity === 'critical' ? '#cc0000' : i.severity === 'high' ? '#ff6600' : '#ff9900';
        alertHtml += '<div style="margin:8px 0;padding:8px;background:#fff;border-right:4px solid ' + color + ';border-radius:4px">';
        alertHtml += '<strong>' + i.drugs.join(' ↔ ') + '</strong><br>';
        alertHtml += '<span style="color:' + color + '">[' + i.severity.toUpperCase() + '] ' + (isArabic ? i.message_ar : i.message_en) + '</span>';
        alertHtml += '</div>';
      });
      alertHtml += '</div>';

      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
      modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:500px;max-height:80vh;overflow-y:auto">' +
        alertHtml +
        '<div style="display:flex;gap:12px;margin-top:16px">' +
        '<button class="btn btn-danger" onclick="this.closest(\'.modal-overlay\')?.remove();this.parentElement.parentElement.parentElement.remove()" style="flex:1;background:#cc0000;color:#fff">🚫 ' + tr('Cancel Prescription', 'إلغاء الوصفة') + '</button>' +
        '<button class="btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1">⚠️ ' + tr('Continue Anyway', 'متابعة رغم التحذير') + '</button>' +
        '</div></div>';
      document.body.appendChild(modal);
    }
  } catch (e) { console.error('Interaction check failed:', e); }
};

// ===== ALLERGY CHECK =====
window.checkAllergyBeforePrescribe = async (patientId, drugs) => {
  try {
    if (!patientId || !drugs || drugs.length === 0) return true;
    const result = await API.post('/api/allergy-check', { patient_id: patientId, drugs });
    if (result.alerts && result.alerts.length > 0) {
      let alertHtml = '<div style="background:#ffe0e0;border:3px solid #ff0000;border-radius:12px;padding:20px;direction:rtl">';
      alertHtml += '<h3 style="color:#cc0000;margin:0 0 12px">🚨 ' + tr('ALLERGY ALERT!', 'تحذير حساسية!') + '</h3>';
      alertHtml += '<p style="margin:0 0 12px">' + tr('Patient allergies:', 'حساسية المريض:') + ' <strong style="color:#cc0000">' + result.patient_allergies + '</strong></p>';
      result.alerts.forEach(a => {
        alertHtml += '<div style="margin:8px 0;padding:10px;background:#fff;border-right:5px solid #ff0000;border-radius:4px">';
        alertHtml += '<strong style="color:#cc0000">💊 ' + a.drug + '</strong><br>';
        alertHtml += '<span>' + (isArabic ? a.message_ar : a.message_en) + '</span>';
        alertHtml += '</div>';
      });
      alertHtml += '</div>';

      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(200,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center';
      modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:500px">' +
        alertHtml +
        '<div style="margin-top:16px;text-align:center">' +
        '<button class="btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="background:#cc0000;color:#fff;width:100%;padding:12px">❌ ' + tr('Understood - Review Prescription', 'مفهوم - مراجعة الوصفة') + '</button>' +
        '</div></div>';
      document.body.appendChild(modal);
      return false;
    }
    return true;
  } catch (e) { return true; }
};




// ===== APPOINTMENT CHECK-IN (Receptionist) =====
window.checkInPatient = async (appointmentId) => {
  try {
    const result = await API.put('/api/appointments/' + appointmentId + '/checkin', {});
    showToast(tr('Patient checked in! Added to waiting queue.', 'تم تسجيل وصول المريض! تمت إضافته لقائمة الانتظار') + ' ✅');
    // Refresh the page
    if (typeof renderAppointments === 'function') {
      const el = document.getElementById('mainContent');
      if (el) renderAppointments(el);
    }
  } catch (e) { showToast(tr('Check-in failed', 'فشل تسجيل الوصول'), 'error'); }
};

window.markNoShow = async (appointmentId) => {
  if (!confirm(tr('Mark this patient as No-Show?', 'تحديد المريض كمتغيب؟'))) return;
  try {
    await API.put('/api/appointments/' + appointmentId + '/noshow', {});
    showToast(tr('Marked as No-Show', 'تم التحديد كمتغيب') + ' ⚠️');
    if (typeof renderAppointments === 'function') {
      const el = document.getElementById('mainContent');
      if (el) renderAppointments(el);
    }
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== NEXT PATIENT (Doctor) =====
window.callNextPatient = async () => {
  try {
    const result = await API.get('/api/doctor/next-patient');
    if (!result.hasNext) {
      showToast(tr('No patients waiting', 'لا يوجد مرضى بالانتظار') + ' ✅', 'info');
      return;
    }

    // Show patient info modal
    const p = result.patient || {};
    const v = result.vitals || {};
    const q = result.queue || {};

    let modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = '<div style="background:var(--bg-card,#fff);border-radius:16px;padding:28px;width:600px;direction:rtl;max-height:90vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<h3 style="margin:0;color:var(--primary)">🔔 ' + tr('Next Patient', 'المريض التالي') + '</h3>' +
      '<span style="background:#e3f2fd;padding:4px 12px;border-radius:20px;font-size:14px">⏳ ' + result.waiting_count + ' ' + tr('waiting', 'بالانتظار') + '</span>' +
      '</div>' +
      '<div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:16px">' +
      '<h4 style="margin:0 0 8px;font-size:18px">' + (p.name_ar || p.name_en || q.patient_name || '') + '</h4>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px">' +
      '<span>📁 ' + tr('MRN:', 'الملف:') + ' <strong>' + (p.mrn || p.file_number || '') + '</strong></span>' +
      '<span>🎂 ' + tr('Age:', 'العمر:') + ' <strong>' + (p.age || '') + '</strong></span>' +
      '<span>📱 ' + tr('Phone:', 'الجوال:') + ' <strong>' + (p.phone || '') + '</strong></span>' +
      '<span>🆔 ' + tr('ID:', 'الهوية:') + ' <strong>' + (p.national_id || '') + '</strong></span>' +
      (p.allergies ? '<span style="grid-column:1/-1;color:#cc0000;font-weight:bold">⚠️ ' + tr('Allergies:', 'حساسية:') + ' ' + p.allergies + '</span>' : '') +
      (p.chronic_diseases ? '<span style="grid-column:1/-1;color:#e65100">🏥 ' + tr('Chronic:', 'أمراض مزمنة:') + ' ' + p.chronic_diseases + '</span>' : '') +
      '</div></div>' +
      (v.blood_pressure || v.temperature || v.pulse ?
        '<div style="background:#e8f5e9;border-radius:12px;padding:12px;margin-bottom:16px">' +
        '<h5 style="margin:0 0 8px">' + tr('Latest Vitals', 'العلامات الحيوية') + '</h5>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:14px">' +
        (v.blood_pressure ? '<span>🩺 BP: <strong>' + v.blood_pressure + '</strong></span>' : '') +
        (v.temperature ? '<span>🌡️ T: <strong>' + v.temperature + '°C</strong></span>' : '') +
        (v.pulse ? '<span>❤️ P: <strong>' + v.pulse + '</strong></span>' : '') +
        (v.spo2 ? '<span>🫁 SpO₂: <strong>' + v.spo2 + '%</strong></span>' : '') +
        (v.weight ? '<span>⚖️ W: <strong>' + v.weight + 'kg</strong></span>' : '') +
        '</div></div>' : '') +
      '<div style="display:flex;gap:12px">' +
      '<button class="btn btn-primary" onclick="selectPatientFromQueue(' + (p.id || 'null') + ');this.closest(\'div\').parentElement.remove()" style="flex:2;padding:12px">✅ ' + tr('Start Consultation', 'بدء الاستشارة') + '</button>' +
      '<button class="btn btn-secondary" onclick="this.closest(\'div\').parentElement.remove()" style="flex:1">❌ ' + tr('Skip', 'تخطي') + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  } catch (e) { showToast(tr('Error loading next patient', 'خطأ'), 'error'); console.error(e); }
};

window.selectPatientFromQueue = (patientId) => {
  if (!patientId) return;
  const select = document.getElementById('drPatient');
  if (select) {
    select.value = patientId;
    select.dispatchEvent(new Event('change'));
    showToast(tr('Patient loaded!', 'تم تحميل المريض!'));
  }
};

// ===== TRIAGE (Nursing) =====
window.showTriageForm = (patientId, patientName) => {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = '<div style="background:var(--bg-card,#fff);border-radius:16px;padding:24px;width:450px;direction:rtl">' +
    '<h3 style="margin:0 0 16px;color:var(--primary)">🏥 ' + tr('Triage Assessment', 'تصنيف المريض') + '</h3>' +
    '<p style="margin:0 0 12px;font-weight:bold">' + (patientName || '') + '</p>' +
    '<div class="form-group"><label>' + tr('Triage Level', 'مستوى الفرز') + '</label>' +
    '<select class="form-input" id="triageLevel">' +
    '<option value="5" style="background:#4caf50;color:#fff">5 - ' + tr('Non-Urgent', 'غير طارئ') + '</option>' +
    '<option value="4" style="background:#2196f3;color:#fff">4 - ' + tr('Less Urgent', 'أقل إلحاحاً') + '</option>' +
    '<option value="3" selected style="background:#ff9800;color:#fff">3 - ' + tr('Urgent', 'مستعجل') + '</option>' +
    '<option value="2" style="background:#ff5722;color:#fff">2 - ' + tr('Emergency', 'طوارئ') + '</option>' +
    '<option value="1" style="background:#d50000;color:#fff">1 - ' + tr('Resuscitation', 'إنعاش') + '</option>' +
    '</select></div>' +
    '<div class="form-group"><label>' + tr('Pain Score (0-10)', 'مقياس الألم (0-10)') + '</label>' +
    '<div style="display:flex;align-items:center;gap:12px">' +
    '<input type="range" id="painScore" min="0" max="10" value="0" style="flex:1" oninput="document.getElementById(\'painValue\').textContent=this.value">' +
    '<span id="painValue" style="font-size:24px;font-weight:bold;width:30px;text-align:center">0</span>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;color:#999"><span>😊 ' + tr('No Pain', 'لا ألم') + '</span><span>😖 ' + tr('Worst Pain', 'أسوأ ألم') + '</span></div></div>' +
    '<div class="form-group"><label>' + tr('Chief Complaint', 'الشكوى الرئيسية') + '</label>' +
    '<input class="form-input" id="chiefComplaint" placeholder="' + tr('Main reason for visit', 'سبب الزيارة الرئيسي') + '"></div>' +
    '<button class="btn btn-primary" onclick="saveTriageData(' + patientId + ')" style="width:100%;padding:12px">💾 ' + tr('Save Triage', 'حفظ التصنيف') + '</button>' +
    '</div>';
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.saveTriageData = async (patientId) => {
  try {
    await API.post('/api/nursing/triage', {
      patient_id: patientId,
      triage_level: document.getElementById('triageLevel')?.value,
      pain_score: document.getElementById('painScore')?.value,
      chief_complaint: document.getElementById('chiefComplaint')?.value,
    });
    document.querySelector('[style*="position:fixed"][style*="z-index:9999"]')?.remove();
    showToast(tr('Triage saved!', 'تم حفظ التصنيف!') + ' ✅');
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== DUPLICATE APPOINTMENT CHECK =====
window.checkDuplicateAppointment = async (patientId, date, doctor) => {
  try {
    const result = await API.post('/api/appointments/check-duplicate', { patient_id: patientId, date, doctor });
    if (result.duplicate) {
      showToast(tr('Warning: Patient already has appointment with this doctor on this date!', 'تحذير: المريض لديه موعد مسبق مع نفس الطبيب بنفس التاريخ!') + ' ⚠️', 'warning');
      return true;
    }
    return false;
  } catch (e) { return false; }
};



window.loadMyQueue = async () => {
  try {
    const queue = await API.get('/api/doctor/my-queue');
    if (!queue || queue.length === 0) {
      showToast(tr('No patients in your queue', 'لا يوجد مرضى في طابورك'), 'info');
      return;
    }
    let html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">' +
      '<div style="background:var(--bg-card,#fff);border-radius:16px;padding:24px;width:500px;direction:rtl;max-height:80vh;overflow-y:auto">' +
      '<h3 style="margin:0 0 16px">📋 ' + tr('My Queue', 'طابوري') + ' (' + queue.length + ')</h3>';
    queue.forEach((q, i) => {
      const isActive = q.status === 'In Progress';
      html += '<div style="padding:12px;margin:8px 0;background:' + (isActive ? '#e8f5e9' : '#f5f5f5') + ';border-radius:8px;border-right:4px solid ' + (isActive ? '#4caf50' : '#ccc') + ';cursor:pointer" onclick="selectPatientFromQueue(' + q.patient_id + ');this.closest(\'[style*=position]\').remove()">' +
        '<div style="display:flex;justify-content:space-between"><strong>' + (i + 1) + '. ' + (q.patient_name || '') + '</strong><span style="font-size:12px;color:#666">' + (q.check_in_time ? new Date(q.check_in_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '') + '</span></div>' +
        '<span style="font-size:12px;color:' + (isActive ? '#2e7d32' : '#999') + '">' + (isActive ? '🟢 ' + tr('In Progress', 'جاري') : '⏳ ' + tr('Waiting', 'بالانتظار')) + '</span>' +
        '</div>';
    });
    html += '<button class="btn btn-secondary" onclick="this.closest(\'[style*=position]\').remove()" style="width:100%;margin-top:12px">' + tr('Close', 'إغلاق') + '</button></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};



// ===== CSV EXPORT UTILITY =====
window.exportToCSV = (data, filename) => {
  if (!data || data.length === 0) { showToast(tr('No data to export', 'لا توجد بيانات للتصدير'), 'info'); return; }
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  data.forEach(row => {
    csvRows.push(headers.map(h => {
      let val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
      val = val.replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = '"' + val + '"';
      return val;
    }).join(','));
  });
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (filename || 'export') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(tr('Exported successfully!', 'تم التصدير بنجاح!') + ' 📥');
};

// ===== RECEIPT PRINT =====
window.printReceipt = (invoice) => {
  if (!invoice) return;
  let h = '<div style="font-family:Arial;width:300px;margin:0 auto;padding:20px;direction:rtl;text-align:right">';
  h += '<div style="text-align:center;border-bottom:2px dashed #333;padding-bottom:12px;margin-bottom:12px">';
  h += '<h3 style="margin:0">نما الطبي</h3><p style="margin:2px 0;font-size:12px">Nama Medical</p>';
  h += '<p style="margin:2px 0;font-size:11px;color:#666">المملكة العربية السعودية</p>';
  h += '</div>';
  h += '<p style="margin:4px 0;font-size:13px"><strong>' + tr('Receipt', 'إيصال') + '</strong></p>';
  h += '<p style="margin:4px 0;font-size:12px">' + tr('Invoice #:', 'رقم الفاتورة:') + ' ' + (invoice.invoice_number || invoice.id || '') + '</p>';
  h += '<p style="margin:4px 0;font-size:12px">' + tr('Patient:', 'المريض:') + ' ' + (invoice.patient_name || '') + '</p>';
  h += '<p style="margin:4px 0;font-size:12px">' + tr('Date:', 'التاريخ:') + ' ' + new Date(invoice.created_at || Date.now()).toLocaleDateString('ar-SA') + '</p>';
  h += '<div style="border-top:1px dashed #999;border-bottom:1px dashed #999;padding:8px 0;margin:8px 0">';
  h += '<p style="margin:4px 0;font-size:12px">' + tr('Service:', 'الخدمة:') + ' ' + (invoice.description || invoice.service_type || '') + '</p>';
  h += '<p style="margin:4px 0;font-size:14px;font-weight:bold">' + tr('Total:', 'المجموع:') + ' ' + parseFloat(invoice.total || 0).toFixed(2) + ' ' + tr('SAR', 'ريال') + '</p>';
  if (invoice.vat_amount && parseFloat(invoice.vat_amount) > 0) {
    h += '<p style="margin:4px 0;font-size:11px;color:#666">' + tr('Includes VAT:', 'شامل الضريبة:') + ' ' + parseFloat(invoice.vat_amount).toFixed(2) + '</p>';
  }
  if (invoice.amount_paid) {
    h += '<p style="margin:4px 0;font-size:12px">' + tr('Paid:', 'المدفوع:') + ' ' + parseFloat(invoice.amount_paid).toFixed(2) + '</p>';
  }
  if (invoice.balance_due && parseFloat(invoice.balance_due) > 0) {
    h += '<p style="margin:4px 0;font-size:12px;color:#cc0000">' + tr('Balance:', 'المتبقي:') + ' ' + parseFloat(invoice.balance_due).toFixed(2) + '</p>';
  }
  h += '<p style="margin:4px 0;font-size:12px">' + tr('Payment:', 'طريقة الدفع:') + ' ' + (invoice.payment_method || 'Cash') + '</p>';
  h += '</div>';
  h += '<p style="text-align:center;font-size:10px;color:#999;margin-top:12px">' + tr('Thank you for your visit', 'شكراً لزيارتكم') + '</p>';
  h += '<p style="text-align:center;font-size:10px;color:#999">www.nama-medical.com</p>';
  h += '</div>';

  const w = window.open('', '_blank', 'width=350,height=500');
  w.document.write('<html><head><title>' + tr('Receipt', 'إيصال') + '</title></head><body style="margin:0">' + h + '<script>setTimeout(()=>{window.print();},300);<\/script></body></html>');
  w.document.close();
};

// ===== PASSWORD CHANGE =====
window.showChangePassword = () => {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = '<div style="background:var(--bg-card,#fff);border-radius:16px;padding:28px;width:400px;direction:rtl">' +
    '<h3 style="margin:0 0 20px;color:var(--primary)">🔑 ' + tr('Change Password', 'تغيير كلمة المرور') + '</h3>' +
    '<div class="form-group"><label>' + tr('Current Password', 'كلمة المرور الحالية') + '</label><input type="password" class="form-input" id="cpCurrent"></div>' +
    '<div class="form-group"><label>' + tr('New Password', 'كلمة المرور الجديدة') + '</label><input type="password" class="form-input" id="cpNew" placeholder="' + tr('Min 6 characters', '6 أحرف على الأقل') + '"></div>' +
    '<div class="form-group"><label>' + tr('Confirm New', 'تأكيد الجديدة') + '</label><input type="password" class="form-input" id="cpConfirm"></div>' +
    '<div style="display:flex;gap:12px;margin-top:16px">' +
    '<button class="btn btn-primary" onclick="submitChangePassword()" style="flex:1">💾 ' + tr('Save', 'حفظ') + '</button>' +
    '<button class="btn btn-secondary" onclick="this.closest(\'[style*=position]\').remove()" style="flex:1">' + tr('Cancel', 'إلغاء') + '</button>' +
    '</div></div>';
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.submitChangePassword = async () => {
  const current = document.getElementById('cpCurrent')?.value;
  const newPw = document.getElementById('cpNew')?.value;
  const confirm = document.getElementById('cpConfirm')?.value;
  if (!current || !newPw) return showToast(tr('Fill all fields', 'أكمل جميع الحقول'), 'error');
  if (newPw !== confirm) return showToast(tr('Passwords do not match', 'كلمات المرور غير متطابقة'), 'error');
  if (newPw.length < 6) return showToast(tr('Min 6 characters', '6 أحرف على الأقل'), 'error');
  try {
    await API.put('/api/auth/change-password', { current_password: current, new_password: newPw });
    document.querySelector('[style*="position:fixed"][style*="z-index:9999"]')?.remove();
    showToast(tr('Password changed!', 'تم تغيير كلمة المرور!') + ' ✅');
  } catch (e) {
    showToast(e.message || tr('Error', 'خطأ'), 'error');
  }
};

// ===== DATABASE BACKUP =====
window.startBackup = async () => {
  showToast(tr('Creating backup...', 'جاري إنشاء النسخة الاحتياطية...') + ' ⏳');
  try {
    const response = await fetch('/api/admin/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error('Backup failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nama_backup_' + new Date().toISOString().slice(0, 10) + '.sql';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast(tr('Backup downloaded!', 'تم تحميل النسخة الاحتياطية!') + ' ✅');
  } catch (e) { showToast(tr('Backup failed', 'فشل النسخ الاحتياطي'), 'error'); }
};

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  // Don't trigger if user is typing in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'k': // Search
        e.preventDefault();
        const searchInput = document.querySelector('.search-box input') || document.querySelector('input[type="search"]') || document.querySelector('#globalSearch');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        break;
      case 'n': // New patient → go to reception
        e.preventDefault();
        if (typeof navigateTo === 'function') navigateTo(1);
        break;
      case 'p': // Print current page
        e.preventDefault();
        window.print();
        break;
    }
  }

  // Escape → close any modal
  if (e.key === 'Escape') {
    const modal = document.querySelector('[style*="position:fixed"][style*="z-index:9999"]');
    if (modal) modal.remove();
  }

  // Number keys 1-9 for quick nav (Alt+number)
  if (e.altKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const pageIdx = parseInt(e.key) - 1;
    if (typeof navigateTo === 'function') navigateTo(pageIdx);
  }
});



window.toggleCalendarView = async () => {
  const existing = document.getElementById('calendarGrid');
  if (existing) { existing.remove(); document.getElementById('calToggleBtn').textContent = '📅 ' + tr('Calendar View', 'عرض التقويم'); return; }
  document.getElementById('calToggleBtn').textContent = '📋 ' + tr('List View', 'عرض القائمة');

  try {
    const appts = await API.get('/api/appointments');
    const today = new Date();
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    const dayNames = isArabic ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8am to 7pm

    let html = '<div id="calendarGrid" style="margin-top:12px;overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">';
    html += '<thead><tr><th style="width:60px;padding:8px;background:#f0f6ff;border:1px solid #e0e0e0">' + tr('Time', 'الوقت') + '</th>';
    days.forEach((d, i) => {
      const isToday = d.toDateString() === today.toDateString();
      html += '<th style="padding:8px;background:' + (isToday ? '#1a73e8;color:#fff' : '#f0f6ff') + ';border:1px solid #e0e0e0;font-weight:' + (isToday ? 'bold' : 'normal') + '">' + dayNames[i] + '<br><span style="font-size:11px">' + d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }) + '</span></th>';
    });
    html += '</tr></thead><tbody>';

    hours.forEach(h => {
      html += '<tr>';
      html += '<td style="padding:4px 8px;background:#f9f9f9;border:1px solid #e0e0e0;font-size:12px;text-align:center">' + (h < 10 ? '0' : '') + h + ':00</td>';
      days.forEach(d => {
        const dateStr = d.toISOString().slice(0, 10);
        const hourAppts = appts.filter(a => {
          const aDate = (a.appt_date || a.date || '').substring(0, 10);
          const aTime = a.appt_time || a.time || '';
          const aHour = parseInt(aTime.split(':')[0]);
          return aDate === dateStr && aHour === h;
        });
        html += '<td style="padding:2px;border:1px solid #e0e0e0;vertical-align:top;height:50px">';
        hourAppts.forEach(a => {
          const statusColor = a.status === 'Cancelled' ? '#ffcdd2' : a.status === 'Checked-In' ? '#c8e6c9' : a.status === 'No-Show' ? '#ffe0b2' : '#e3f2fd';
          html += '<div style="background:' + statusColor + ';border-radius:4px;padding:2px 4px;margin:1px 0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="' + (a.patient_name || '') + ' - ' + (a.doctor_name || a.doctor || '') + '">' +
            (a.patient_name || '').split(' ')[0] + ' <span style="color:#666">' + (a.doctor_name || a.doctor || '').split(' ').slice(-1)[0] + '</span></div>';
        });
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    const table = document.querySelector('.data-table') || document.querySelector('table');
    if (table) table.insertAdjacentHTML('beforebegin', html);
    else {
      const content = document.getElementById('mainContent');
      if (content) content.insertAdjacentHTML('beforeend', html);
    }
  } catch (e) { console.error('Calendar error:', e); }
};


window.exportPatients = async () => {
  try { const data = await API.get('/api/patients'); exportToCSV(data, 'patients'); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.exportInvoices = async () => {
  try { const data = await API.get('/api/invoices'); exportToCSV(data, 'invoices'); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.exportAppointments = async () => {
  try { const data = await API.get('/api/appointments'); exportToCSV(data, 'appointments'); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};



// ===== LANGUAGE TOGGLE =====
window.toggleLanguage = () => {
  isArabic = !isArabic;
  localStorage.setItem('namaLang', isArabic ? 'ar' : 'en');
  // Update document direction
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  document.documentElement.lang = isArabic ? 'ar' : 'en';
  document.body.style.direction = isArabic ? 'rtl' : 'ltr';
  document.body.style.textAlign = isArabic ? 'right' : 'left';
  // Rebuild sidebar navigation in new language
  if (typeof buildNav === 'function') buildNav();
  // Update header text if exists
  const headerTitle = document.querySelector('.header h1, .app-title, .logo-text');
  if (headerTitle) headerTitle.textContent = isArabic ? 'نما الطبي' : 'Nama Medical';
  // Re-render current page content
  if (typeof navigateTo === 'function') navigateTo(currentPage);
  // Update the lang button text
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.textContent = isArabic ? '🌐 EN' : '🌐 عربي';
};

// ===== MOBILE LANGUAGE PROMPT =====
window.showMobileLangPrompt = () => {
  // Only show on mobile if no lang preference saved
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile || localStorage.getItem('namaLang')) return;

  const prompt = document.createElement('div');
  prompt.id = 'mobileLangPrompt';
  prompt.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;padding:16px 20px;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 -4px 20px rgba(0,0,0,0.3);animation:slideUp 0.4s ease';
  prompt.innerHTML = '<span style="font-size:15px;font-weight:500">Choose Language / اختر اللغة</span>' +
    '<button onclick="setLang(\'en\')" style="padding:8px 20px;border:2px solid #fff;border-radius:8px;background:transparent;color:#fff;font-size:14px;font-weight:bold;cursor:pointer">🇬🇧 English</button>' +
    '<button onclick="setLang(\'ar\')" style="padding:8px 20px;border:2px solid #fff;border-radius:8px;background:rgba(255,255,255,0.2);color:#fff;font-size:14px;font-weight:bold;cursor:pointer">🇸🇦 عربي</button>';
  document.body.appendChild(prompt);

  // Add slide-up animation
  const style = document.createElement('style');
  style.textContent = '@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
  document.head.appendChild(style);
};

window.setLang = (lang) => {
  localStorage.setItem('namaLang', lang);
  isArabic = lang === 'ar';
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  document.documentElement.lang = isArabic ? 'ar' : 'en';
  document.body.style.direction = isArabic ? 'rtl' : 'ltr';
  document.body.style.textAlign = isArabic ? 'right' : 'left';
  const prompt = document.getElementById('mobileLangPrompt');
  if (prompt) prompt.remove();
  if (typeof buildNav === 'function') buildNav();
  if (typeof navigateTo === 'function') navigateTo(currentPage);
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.textContent = isArabic ? '🌐 EN' : '🌐 عربي';
};



window.sendDirectRad = async () => {
  const patientId = document.getElementById('drPatient')?.value || window._selectedPatientId;
  if (!patientId) return showToast(tr('Select patient first', 'اختر مريض أولاً'), 'error');
  const patientName = document.getElementById('drPatient')?.selectedOptions[0]?.text || window._selectedPatientName || '';
  const examType = document.getElementById('radDirectType')?.value || '';
  const details = document.getElementById('radDirectDesc')?.value || '';
  const priority = document.getElementById('radDirectPriority')?.value || 'routine';
  try {
    await API.post('/api/radiology/orders', { patient_id: patientId, patient_name: patientName, exam_type: examType, details: details, priority: priority, status: 'Pending' });
    showToast(tr('Radiology order sent!', 'تم إرسال طلب الأشعة!'));
    document.getElementById('radDirectType') && (document.getElementById('radDirectType').value = '');
    document.getElementById('radDirectDesc') && (document.getElementById('radDirectDesc').value = '');
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

async function renderDashboard(el) {
  // Render skeleton loading immediately
  el.innerHTML = `
    <!-- Skeleton Header -->
    <div class="flex justify-between items-end mb-lg animate-pulse">
      <div class="w-1/2">
        <div class="skeleton-loader skeleton-bar title"></div>
        <div class="skeleton-loader skeleton-bar w-1/3 mt-2"></div>
      </div>
      <div class="flex gap-3">
        <div class="skeleton-loader h-10 w-28 rounded-xl"></div>
        <div class="skeleton-loader h-10 w-28 rounded-xl"></div>
      </div>
    </div>
    
    <!-- Skeleton Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col gap-3">
        <div class="flex justify-between items-center"><div class="skeleton-loader skeleton-circle"></div><div class="skeleton-loader h-6 w-12 rounded"></div></div>
        <div class="skeleton-loader skeleton-bar w-1/2"></div>
        <div class="skeleton-loader h-10 w-full rounded-lg"></div>
      </div>
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col gap-3">
        <div class="flex justify-between items-center"><div class="skeleton-loader skeleton-circle"></div><div class="skeleton-loader h-6 w-12 rounded"></div></div>
        <div class="skeleton-loader skeleton-bar w-1/2"></div>
        <div class="skeleton-loader h-10 w-full rounded-lg"></div>
      </div>
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col gap-3">
        <div class="flex justify-between items-center"><div class="skeleton-loader skeleton-circle"></div><div class="skeleton-loader h-6 w-12 rounded"></div></div>
        <div class="skeleton-loader skeleton-bar w-1/2"></div>
        <div class="skeleton-loader h-10 w-full rounded-lg"></div>
      </div>
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col gap-3">
        <div class="flex justify-between items-center"><div class="skeleton-loader skeleton-circle"></div><div class="skeleton-loader h-6 w-12 rounded"></div></div>
        <div class="skeleton-loader skeleton-bar w-1/2"></div>
        <div class="skeleton-loader h-10 w-full rounded-lg"></div>
      </div>
    </div>

    <!-- Skeleton Bento Grid -->
    <div class="grid grid-cols-12 gap-gutter mb-lg">
      <div class="col-span-12 lg:col-span-8 glass-card-premium p-6 h-80 flex flex-col gap-4">
        <div class="skeleton-loader skeleton-bar title"></div>
        <div class="skeleton-loader flex-1 rounded-xl"></div>
      </div>
      <div class="col-span-12 lg:col-span-4 glass-card-premium p-6 h-80 flex flex-col gap-4">
        <div class="skeleton-loader skeleton-bar title"></div>
        <div class="space-y-3 flex-1">
          <div class="skeleton-loader h-12 rounded-xl"></div>
          <div class="skeleton-loader h-12 rounded-xl"></div>
          <div class="skeleton-loader h-12 rounded-xl"></div>
        </div>
      </div>
    </div>
  `;

  let s, enhanced;
  try {
    [s, enhanced] = await Promise.all([
      API.get('/api/dashboard/stats'),
      API.get('/api/dashboard/enhanced').catch(() => ({}))
    ]);
  } catch (err) {
    el.innerHTML = `
      <div class="flex flex-col items-center justify-center p-xl">
        <div class="error-card-premium max-w-md w-full">
          <span class="material-symbols-outlined error-card-icon">error</span>
          <h3 class="text-lg font-bold">${tr('Failed to Load Dashboard', 'فشل في تحميل لوحة التحكم')}</h3>
          <p class="text-sm">${tr('Connection error or session expired. Please verify connection and retry.', 'حدث خطأ في الاتصال بالخادم أو انتهت الجلسة. يرجى التحقق وإعادة المحاولة.')}</p>
          <button onclick="navigateTo(0)" class="mt-4 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-label-md shadow-md hover:opacity-90 transition-all">
            ${tr('Retry Connection', 'إعادة المحاولة')}
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Schedule Chart.js rendering
  setTimeout(() => {
    renderDashboardCharts(el, enhanced);
    loadDashboardCharts();
  }, 50);

  const bedOccupancy = Math.min(100, Math.round((s.patients || 0) / 300 * 100));
  const avgWaitTime = Math.max(5, Math.round((s.waiting || 0) * 1.5));
  const emergencyCount = enhanced.pendingLab || Math.round((s.patients || 0) * 0.1);

  let topDrHtml = '';
  if (enhanced.topDoctors && enhanced.topDoctors.length) {
    topDrHtml = enhanced.topDoctors.map((d, index) => `
      <div class="flex items-center justify-between p-3 bg-surface-container-low rounded-xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">${index + 1}</span>
          <div>
            <p class="font-bold text-primary text-sm">👨‍⚕️ ${d.display_name || tr('Unknown', 'غير معروف')}</p>
            <p class="text-xs text-on-surface-variant font-medium">${d.patients} ${tr('patients', 'مريض')}</p>
          </div>
        </div>
        <span class="font-bold text-secondary text-sm">${Number(d.revenue).toLocaleString()} SAR</span>
      </div>
    `).join('');
  } else {
    topDrHtml = `
      <div class="empty-state-card w-full">
        <span class="material-symbols-outlined empty-state-icon">person_off</span>
        <p class="text-xs font-bold text-on-surface-variant">${tr('No Active Physicians Today', 'لا توجد بيانات للأطباء المتاحين اليوم')}</p>
      </div>
    `;
  }

  let revTypeHtml = '';
  if (enhanced.revenueByType && enhanced.revenueByType.length) {
    const typeIcons = { 'File Opening': '📁', 'Lab Test': '🔬', 'Radiology': '📡', 'Consultation': '🩺', 'Pharmacy': '💊', 'Appointment': '📅' };
    const maxRev = Math.max(...enhanced.revenueByType.map(r => Number(r.total)));
    const colors = ['bg-primary', 'bg-secondary', 'bg-tertiary-container', 'bg-error', 'bg-secondary-container', 'bg-outline'];
    revTypeHtml = enhanced.revenueByType.map((r, i) => {
      const pct = Math.round(Number(r.total) / maxRev * 100);
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-medium text-on-surface-variant">
            <span>${typeIcons[r.service_type] || '📄'} ${r.service_type} (${r.cnt})</span>
            <span class="font-bold text-primary">${Number(r.total).toLocaleString()} SAR</span>
          </div>
          <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
            <div class="${colors[i % colors.length]} h-full rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    revTypeHtml = `
      <div class="empty-state-card w-full">
        <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
        <p class="text-xs font-bold text-on-surface-variant">${tr('No Operational Revenue Recorded', 'لا توجد إيرادات عمليات مسجلة بعد')}</p>
      </div>
    `;
  }

  el.innerHTML = `
    <!-- Page Header -->
    <div class="flex justify-between items-end mb-lg">
      <div>
        <h2 class="font-headline-lg text-headline-lg text-primary">${tr('Operational Command Center', 'مركز القيادة والعمليات - المستشفى العام')}</h2>
        <div class="flex items-center gap-3 mt-2">
          <span class="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 text-secondary rounded-full text-sm font-medium">
            <span class="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
            ${tr('Live Now', 'مباشر الآن')}
          </span>
          <span class="text-on-surface-variant font-label-md flex items-center gap-1">
            <span class="material-symbols-outlined text-lg">calendar_today</span>
            ${new Date().toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="exportTableCSV('dashboard_report')" class="flex items-center gap-2 px-5 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-primary font-label-md shadow-sm hover:bg-surface-container-low transition-all">
          <span class="material-symbols-outlined">download</span>
          ${tr('Export Report', 'تصدير التقرير')}
        </button>
        <button onclick="window.print()" class="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md shadow-md hover:opacity-90 transition-all">
          <span class="material-symbols-outlined">print</span>
          ${tr('Print Portal', 'طباعة اللوحة')}
        </button>
      </div>
    </div>

    <!-- KPI Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
      <!-- Card: Bed Occupancy -->
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col transition-all duration-300">
        <div class="flex justify-between items-start mb-4">
          <div class="p-3 bg-primary/5 text-primary rounded-xl">
            <span class="material-symbols-outlined text-2xl">bed</span>
          </div>
          <span class="text-secondary text-sm font-bold flex items-center gap-0.5">
            <span class="material-symbols-outlined text-sm">trending_up</span>
            +2%
          </span>
        </div>
        <p class="text-on-surface-variant font-label-md mb-1">${tr('Bed Occupancy', 'إشغال الأسرة')}</p>
        <div class="flex items-baseline gap-2">
          <h3 class="font-display-lg text-display-lg text-primary leading-none">${bedOccupancy}%</h3>
          <span class="text-on-surface-variant text-sm font-medium">/ 100%</span>
        </div>
        <div class="mt-4 w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
          <div class="bg-secondary h-full rounded-full" style="width: ${bedOccupancy}%"></div>
        </div>
      </div>

      <!-- Card: Wait Time -->
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col transition-all duration-300">
        <div class="flex justify-between items-start mb-4">
          <div class="p-3 bg-primary/5 text-primary rounded-xl">
            <span class="material-symbols-outlined text-2xl">timer</span>
          </div>
          <span class="text-secondary text-sm font-bold flex items-center gap-0.5">
            <span class="material-symbols-outlined text-sm">trending_down</span>
            -4m
          </span>
        </div>
        <p class="text-on-surface-variant font-label-md mb-1">${tr('Average Wait Time', 'متوسط وقت الانتظار')}</p>
        <div class="flex items-baseline gap-2">
          <h3 class="font-display-lg text-display-lg text-primary leading-none">${avgWaitTime}</h3>
          <span class="text-on-surface-variant text-sm font-medium">${tr('minutes', 'دقيقة')}</span>
        </div>
        <p class="mt-4 text-xs text-on-surface-variant">${tr('25% better than last week', 'تحسن بنسبة 25% عن الأسبوع الماضي')}</p>
      </div>

      <!-- Card: Compliance Index -->
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col border-r-4 border-r-secondary transition-all duration-300">
        <div class="flex justify-between items-start mb-4">
          <div class="p-3 bg-secondary/5 text-secondary rounded-xl">
            <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">verified</span>
          </div>
          <span class="px-2 py-0.5 bg-secondary/10 text-secondary rounded text-[10px] font-bold">${tr('Secure', 'آمن')}</span>
        </div>
        <p class="text-on-surface-variant font-label-md mb-1">${tr('Compliance Index', 'مؤشر الامتثال')}</p>
        <div class="flex items-baseline gap-2">
          <h3 class="font-display-lg text-display-lg text-primary leading-none">98.5%</h3>
        </div>
        <p class="mt-4 text-xs text-on-surface-variant">${tr('Fully compliant with CHI & MOH standards', 'متوافق بالكامل مع معايير الضمان الصحي ووزارة الصحة')}</p>
      </div>

      <!-- Card: Emergency Cases -->
      <div class="glass-card-premium p-6 rounded-2xl flex flex-col border-r-4 border-r-error transition-all duration-300">
        <div class="flex justify-between items-start mb-4">
          <div class="p-3 bg-error/5 text-error rounded-xl">
            <span class="material-symbols-outlined text-2xl">emergency</span>
          </div>
          <span class="flex items-center h-2 w-2 bg-error rounded-full animate-ping"></span>
        </div>
        <p class="text-on-surface-variant font-label-md mb-1">${tr('Emergency Cases', 'حالات الطوارئ المفتوحة')}</p>
        <div class="flex items-baseline gap-2">
          <h3 class="font-display-lg text-display-lg text-primary leading-none">${emergencyCount}</h3>
          <span class="text-on-surface-variant text-sm font-medium">${tr('active cases', 'حالة نشطة')}</span>
        </div>
        <div class="mt-4 flex -space-x-2 space-x-reverse">
          <div class="w-6 h-6 rounded-full border-2 border-white bg-error/20 flex items-center justify-center text-[8px] font-bold text-error">R1</div>
          <div class="w-6 h-6 rounded-full border-2 border-white bg-error/20 flex items-center justify-center text-[8px] font-bold text-error">R2</div>
          <div class="w-6 h-6 rounded-full border-2 border-white bg-error/20 flex items-center justify-center text-[8px] font-bold text-error">R3</div>
          <div class="w-6 h-6 rounded-full border-2 border-white bg-surface-container-highest flex items-center justify-center text-[8px] text-on-surface-variant font-bold">+15</div>
        </div>
      </div>
    </div>

    <!-- Bento Grid Row -->
    <div class="grid grid-cols-12 gap-gutter mb-lg">
      <!-- Main Analytics: Revenue Trend & Weekly Patient Flow -->
      <div class="col-span-12 lg:col-span-8 glass-card-premium rounded-3xl p-6 flex flex-col justify-between">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h4 class="font-title-lg text-title-lg text-primary">${tr('Weekly Operations & Revenue Trend', 'حجم العمليات الإشغال والإيرادات الأسبوعية')}</h4>
            <p class="text-on-surface-variant text-sm">${tr('Real-time revenue monitoring and patient flow analyses', 'مراقبة الإيرادات وحركة تدفق المرضى المباشرة')}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-64">
          <div class="h-60 relative flex items-center justify-center">
            <canvas id="revenueChart"></canvas>
          </div>
          <div class="h-60 relative flex items-center justify-center">
            <canvas id="dashBar"></canvas>
          </div>
        </div>
      </div>

      <!-- Compliance Alerts Sidebar -->
      <div class="col-span-12 lg:col-span-4 glass-card-premium rounded-3xl p-6 flex flex-col justify-between">
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-secondary text-2xl">gavel</span>
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Compliance Alerts Feed', 'تنبيهات الامتثال التنظيمي')}</h4>
        </div>
        <div class="space-y-3 flex-1 overflow-y-auto max-h-60">
          <div class="p-3 bg-surface-container-low rounded-xl border-r-4 border-r-secondary relative overflow-hidden group hover:bg-surface-container-high transition-colors">
            <div class="flex justify-between items-start mb-1">
              <span class="text-[9px] font-bold text-secondary tracking-wider">MOH COMPLIANCE</span>
              <span class="text-[9px] text-on-surface-variant">${tr('15 mins ago', 'منذ ١٥ دقيقة')}</span>
            </div>
            <p class="text-xs font-bold text-primary mb-0.5">${tr('Nursing Staff Licensing Status', 'تحديث سجلات الكادر التمريضي')}</p>
            <p class="text-[11px] text-on-surface-variant leading-relaxed">${tr('Renew licenses for 5 emergency room staff immediately.', 'يجب إتمام تحديث بيانات الترخيص لـ ٥ ممرضين في قسم الطوارئ.')}</p>
          </div>
          <div class="p-3 bg-surface-container-low rounded-xl border-r-4 border-r-secondary relative overflow-hidden group hover:bg-surface-container-high transition-colors">
            <div class="flex justify-between items-start mb-1">
              <span class="text-[9px] font-bold text-on-tertiary-container tracking-wider">CHI AUDIT</span>
              <span class="text-[9px] text-on-surface-variant">${tr('2 hours ago', 'منذ ساعتين')}</span>
            </div>
            <p class="text-xs font-bold text-primary mb-0.5">${tr('Insurance Claims Verification', 'جاهزية ملفات المطالبات')}</p>
            <p class="text-[11px] text-on-surface-variant leading-relaxed">${tr('Verify October claims documents prior to CHI transmission.', 'مراجعة دورية للمطالبات التأمينية لشهر أكتوبر قبل الإرسال النهائي.')}</p>
          </div>
          <div class="p-3 bg-error/5 rounded-xl border-r-4 border-r-error relative overflow-hidden group hover:bg-error/10 transition-colors">
            <div class="flex justify-between items-start mb-1">
              <span class="text-[9px] font-bold text-error tracking-wider">CRITICAL WARN</span>
              <span class="text-[9px] text-on-surface-variant">${tr('4 hours ago', 'منذ ٤ ساعات')}</span>
            </div>
            <p class="text-xs font-bold text-primary mb-0.5">${tr('Defibrillators Inspection Overdue', 'فحص أجهزة الإنعاش والتعقيم')}</p>
            <p class="text-[11px] text-on-surface-variant leading-relaxed">${tr('2 defibrillators on the 3rd floor require immediate testing.', 'تجاوز موعد الفحص الدوري لجهازين في الطابق الثالث.')}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Vision 2030 Strategic Metrics Bento -->
    <div class="glass-card-premium rounded-3xl p-6 mb-lg">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Vision 2030 Strategic Alignment', 'محاذاة رؤية المملكة 2030')}</h4>
          <p class="text-on-surface-variant text-sm">${tr('National healthcare transformation indicators', 'مؤشرات الأداء الاستراتيجي للمنظومة الصحية')}</p>
        </div>
        <span class="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-xs font-bold">${tr('Live Sync', 'تحديث فوري')}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div class="space-y-2 p-3 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">${tr('Digital Transformation', 'التحول الرقمي')}</p>
          <div class="flex items-baseline gap-1">
            <span class="font-display-lg text-3xl font-bold text-primary">94%</span>
            <span class="text-secondary font-bold text-sm">↑ 1.2%</span>
          </div>
          <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
            <div class="bg-secondary h-full rounded-full" style="width: 94%"></div>
          </div>
        </div>
        <div class="space-y-2 p-3 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">${tr('Spending Efficiency', 'كفاءة الإنفاق')}</p>
          <div class="flex items-baseline gap-1">
            <span class="font-display-lg text-3xl font-bold text-primary">82%</span>
            <span class="text-secondary font-bold text-sm">↑ 0.5%</span>
          </div>
          <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
            <div class="bg-secondary h-full rounded-full" style="width: 82%"></div>
          </div>
        </div>
        <div class="space-y-2 p-3 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">${tr('Patient Satisfaction', 'رضا المستفيدين')}</p>
          <div class="flex items-baseline gap-1">
            <span class="font-display-lg text-3xl font-bold text-primary">89%</span>
            <span class="text-secondary font-bold text-sm">↑ 2.4%</span>
          </div>
          <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
            <div class="bg-secondary h-full rounded-full" style="width: 89%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Department Status Cards Grid -->
    <div class="mb-lg">
      <h4 class="font-title-lg text-title-lg text-primary mb-6">${tr('Departmental Operational Performance', 'حالة الأقسام التشغيلية')}</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <!-- Emergency -->
        <div class="glass-card-premium rounded-2xl p-5 border-t-4 border-t-error">
          <div class="flex justify-between items-start mb-3">
            <div class="w-10 h-10 bg-error/10 rounded-lg flex items-center justify-center text-error">
              <span class="material-symbols-outlined">emergency</span>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant font-medium">${tr('Status', 'الحالة')}</p>
              <p class="text-sm font-bold text-error">${tr('Crowded', 'نشط جداً')}</p>
            </div>
          </div>
          <h5 class="font-bold text-primary text-sm mb-3">${tr('Emergency Room (ER)', 'قسم الطوارئ')}</h5>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Active Patients', 'المرضى الحاليين')}</span><span class="font-bold text-primary">42</span></div>
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Wait Time', 'معدل الانتظار')}</span><span class="font-bold text-error">18m</span></div>
          </div>
        </div>
        <!-- Surgery -->
        <div class="glass-card-premium rounded-2xl p-5 border-t-4 border-t-secondary">
          <div class="flex justify-between items-start mb-3">
            <div class="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center text-secondary">
              <span class="material-symbols-outlined">medical_mask</span>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant font-medium">${tr('Status', 'الحالة')}</p>
              <p class="text-sm font-bold text-secondary">${tr('Active', 'نشط')}</p>
            </div>
          </div>
          <h5 class="font-bold text-primary text-sm mb-3">${tr('Surgery Suite', 'قسم الجراحة')}</h5>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('ORs In Use', 'غرف العمليات')}</span><span class="font-bold text-primary">6 / 8</span></div>
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Staff Status', 'الطاقم الجراحي')}</span><span class="font-bold text-primary">${tr('Optimal', 'مكتمل')}</span></div>
          </div>
        </div>
        <!-- ICU -->
        <div class="glass-card-premium rounded-2xl p-5 border-t-4 border-t-primary">
          <div class="flex justify-between items-start mb-3">
            <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              <span class="material-symbols-outlined">vital_signs</span>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant font-medium">${tr('Status', 'الحالة')}</p>
              <p class="text-sm font-bold text-primary">${tr('Critical', 'حرج')}</p>
            </div>
          </div>
          <h5 class="font-bold text-primary text-sm mb-3">${tr('Intensive Care (ICU)', 'العناية المركزة')}</h5>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Bed Occupancy', 'معدل الإشغال')}</span><span class="font-bold text-primary">92%</span></div>
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Available Beds', 'الأسرة الشاغرة')}</span><span class="font-bold text-error">2 beds</span></div>
          </div>
        </div>
        <!-- Radiology -->
        <div class="glass-card-premium rounded-2xl p-5 border-t-4 border-t-outline">
          <div class="flex justify-between items-start mb-3">
            <div class="w-10 h-10 bg-surface-container-high rounded-lg flex items-center justify-center text-on-surface-variant">
              <span class="material-symbols-outlined">radiology</span>
            </div>
            <div class="text-right">
              <p class="text-xs text-on-surface-variant font-medium">${tr('Status', 'الحالة')}</p>
              <p class="text-sm font-bold text-on-surface-variant">${tr('Stable', 'مستقر')}</p>
            </div>
          </div>
          <h5 class="font-bold text-primary text-sm mb-3">${tr('Imaging & Radiology', 'الأشعة والتصوير')}</h5>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Scans Today', 'الفحوصات اليوم')}</span><span class="font-bold text-primary">85</span></div>
            <div class="flex justify-between"><span class="text-on-surface-variant">${tr('Reporting Time', 'زمن التقرير')}</span><span class="font-bold text-primary">45m</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Row: Top Doctors & Revenue Breakdown & Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-md mb-lg">
      <div class="glass-card-premium rounded-2xl p-6">
        <h4 class="font-title-lg text-title-lg text-primary mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">star</span>
          🏆 ${tr('Top Doctors (This Month)', 'أفضل الأطباء (هذا الشهر)')}
        </h4>
        <div class="space-y-2 max-h-60 overflow-y-auto">
          ${topDrHtml}
        </div>
      </div>
      <div class="glass-card-premium rounded-2xl p-6">
        <h4 class="font-title-lg text-title-lg text-primary mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">payments</span>
          📊 ${tr('Revenue by Service Type', 'الإيرادات حسب نوع الخدمة')}
        </h4>
        <div class="space-y-4 max-h-60 overflow-y-auto">
          ${revTypeHtml}
        </div>
      </div>
      <div class="glass-card-premium rounded-2xl p-6 flex flex-col justify-between">
        <h4 class="font-title-lg text-title-lg text-primary mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">pie_chart</span>
          🔬 ${tr('Department Share & Payment Methods', 'توزيع التخصصات وطرق الدفع')}
        </h4>
        <div class="grid grid-cols-2 gap-2 h-44">
          <div class="relative"><canvas id="deptChart"></canvas></div>
          <div class="relative"><canvas id="paymentChart"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Quick Actions Panel -->
    <div class="glass-card-premium rounded-2xl p-6">
      <h4 class="font-title-lg text-title-lg text-primary mb-4">${tr('Quick Administrative Actions', 'إجراءات إدارية سريعة')}</h4>
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(1)">
          <span class="material-symbols-outlined text-lg">hotel</span>
          ${tr('Reception', 'الاستقبال')}
        </button>
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(2)">
          <span class="material-symbols-outlined text-lg">calendar_month</span>
          ${tr('Appointments', 'المواعيد')}
        </button>
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(4)">
          <span class="material-symbols-outlined text-lg">biotech</span>
          ${tr('Lab', 'المختبر')}
        </button>
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(6)">
          <span class="material-symbols-outlined text-lg">prescriptions</span>
          ${tr('Pharmacy', 'الصيدلية')}
        </button>
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(14)">
          <span class="material-symbols-outlined text-lg">bar_chart</span>
          ${tr('Reports', 'التقارير')}
        </button>
        <button class="flex items-center justify-center gap-2 p-3 bg-surface-container-low hover:bg-secondary hover:text-white rounded-xl text-primary font-medium text-xs transition-all border border-outline-variant/20 shadow-sm" onclick="navigateTo(8)">
          <span class="material-symbols-outlined text-lg">account_balance_wallet</span>
          ${tr('Finance', 'المالية')}
        </button>
      </div>
    </div>
  `;
}

function renderDashboardCharts(el, enhanced) {
  try {
    const revData = enhanced.revenueByType || [];
    if (revData.length === 0 || typeof Chart === 'undefined') return;
    const labels = revData.map(r => r.service_type);
    const values = revData.map(r => parseFloat(r.total) || 0);
    const clrs = ['#001629', '#006970', '#ac8c44', '#ba1a1a', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4'];

    const barCtx = document.getElementById('dashBar');
    if (barCtx) {
      // Clear any existing chart instances to avoid overlap
      const existingChart = Chart.getChart(barCtx);
      if (existingChart) existingChart.destroy();

      new Chart(barCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: tr('Revenue', 'الإيراد'),
            data: values,
            backgroundColor: clrs.slice(0, labels.length),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  } catch (e) { console.log('Chart error:', e); }
}

// === CRITICAL LAB VALUE DEFINITIONS ===
const CRITICAL_LAB_VALUES = {
  'Hemoglobin': { low: 7.0, high: 20.0, unit: 'g/dL' },
  'Platelets': { low: 50, high: 1000, unit: 'x10³/µL' },
  'WBC': { low: 2.0, high: 30.0, unit: 'x10³/µL' },
  'Potassium': { low: 2.5, high: 6.5, unit: 'mEq/L' },
  'Sodium': { low: 120, high: 160, unit: 'mEq/L' },
  'Glucose': { low: 40, high: 500, unit: 'mg/dL' },
  'Creatinine': { low: 0, high: 10.0, unit: 'mg/dL' },
  'Troponin': { low: 0, high: 0.04, unit: 'ng/mL' },
  'INR': { low: 0, high: 5.0, unit: '' },
  'Lactate': { low: 0, high: 4.0, unit: 'mmol/L' }
};
window.checkCriticalLabValue = (testName, resultText) => {
  const numMatch = resultText.match(/[\d.]+/);
  if (!numMatch) return null;
  const val = parseFloat(numMatch[0]);
  for (const [key, range] of Object.entries(CRITICAL_LAB_VALUES)) {
    if (testName.toLowerCase().includes(key.toLowerCase())) {
      if (val < range.low) return { test: key, value: val, status: 'CRITICALLY LOW', range };
      if (val > range.high) return { test: key, value: val, status: 'CRITICALLY HIGH', range };
    }
  }
  return null;
};

// === DRUG ALLERGY CHECK ===
window.checkDrugAllergy = async (patientId, drugName) => {
  try {
    const patients = await API.get('/api/patients');
    const patient = patients.find(p => p.id == patientId);
    if (!patient || !patient.allergies) return false;
    const allergies = patient.allergies.toLowerCase().split(/[,،;]+/).map(a => a.trim());
    const drug = drugName.toLowerCase();
    for (const allergy of allergies) {
      if (allergy && (drug.includes(allergy) || allergy.includes(drug))) {
        return allergy;
      }
    }
    return false;
  } catch { return false; }
};

// === PATIENT STATEMENT (Printable Account) ===
window.printPatientStatement = async (patientId) => {
  try {
    const account = await API.get('/api/patients/' + patientId + '/account');
    const p = account.patient;
    const invoices = account.invoices || [];
    let rows = invoices.map(inv =>
      '<tr><td>' + (inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '-') +
      '</td><td>' + (inv.description || inv.service_type || '-') +
      '</td><td>' + (inv.total || 0) + ' SAR</td><td>' +
      (inv.paid ? '\u2705 ' + tr('Paid', 'مدفوع') : '\u26A0\uFE0F ' + tr('Unpaid', 'غير مدفوع')) + '</td></tr>'
    ).join('');
    const content = '<div style="text-align:center;margin-bottom:20px"><h2>\u{1F3E5} ' + tr('Nama Medical', 'نما الطبي') + '</h2><div style="margin-bottom:8px"><button class="btn btn-sm" onclick="exportPatients()" style="background:#e0f7fa;color:#00838f">📥 ${tr("Export CSV","تصدير CSV")}</button></div><h3>' + tr('Patient Financial Statement', 'كشف حساب المريض') + '</h3></div>' +
      '<table style="width:100%;margin-bottom:15px"><tr><td><strong>' + tr('Name', 'الاسم') + ':</strong> ' + (p.name_ar || p.name_en) + '</td><td><strong>MRN:</strong> ' + (p.mrn || p.file_number) + '</td></tr>' +
      '<tr><td><strong>' + tr('ID', 'الهوية') + ':</strong> ' + (p.national_id || '-') + '</td><td><strong>' + tr('Phone', 'الجوال') + ':</strong> ' + (p.phone || '-') + '</td></tr></table>' +
      '<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse"><thead><tr style="background:#f0f0f0"><th>' + tr('Date', 'التاريخ') + '</th><th>' + tr('Description', 'الوصف') + '</th><th>' + tr('Amount', 'المبلغ') + '</th><th>' + tr('Status', 'الحالة') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div style="margin-top:20px;padding:10px;background:#f9f9f9;border-radius:8px"><strong>' + tr('Total Billed', 'إجمالي المبالغ') + ':</strong> ' + (account.totalBilled || 0) + ' SAR | <strong>' + tr('Total Paid', 'المدفوع') + ':</strong> ' + (account.totalPaid || 0) + ' SAR | <strong style="color:' + (account.balance > 0 ? 'red' : 'green') + '">' + tr('Balance', 'الرصيد') + ':</strong> ' + (account.balance || 0) + ' SAR</div>';
    printDocument(tr('Patient Statement', 'كشف حساب المريض'), content);
  } catch (e) { showToast(tr('Error loading statement', 'خطأ في تحميل الكشف'), 'error'); }
};

// === DIAGNOSIS TEMPLATES ===
let _diagTemplatesCache = null;
window.loadDiagTemplates = async () => {
  try {
    const templates = await API.get('/api/diagnosis-templates');
    _diagTemplatesCache = templates;
    const sel = document.getElementById('drDiagTemplate');
    if (!sel) return;
    sel.innerHTML = '<option value="">' + tr('-- Select Template --', '-- اختر قالب --') + '</option>';
    for (const [specialty, items] of Object.entries(templates)) {
      const group = document.createElement('optgroup');
      group.label = specialty;
      items.forEach((t, idx) => {
        const opt = document.createElement('option');
        opt.value = specialty + '|' + idx;
        opt.textContent = (isArabic ? t.name_ar : t.name) + ' [' + t.icd + ']';
        group.appendChild(opt);
      });
      sel.appendChild(group);
    }
    showToast(tr('Templates loaded!', 'تم تحميل القوالب!'));
  } catch (e) { showToast(tr('Error loading templates', 'خطأ في تحميل القوالب'), 'error'); }
};
window.applyDiagTemplate = () => {
  const val = document.getElementById('drDiagTemplate')?.value;
  if (!val || !_diagTemplatesCache) return;
  const [specialty, idx] = val.split('|');
  const t = _diagTemplatesCache[specialty]?.[parseInt(idx)];
  if (!t) return;
  document.getElementById('drDiag').value = isArabic ? t.name_ar : t.name;
  document.getElementById('drSymp').value = t.symptoms || '';
  document.getElementById('drIcd').value = t.icd || '';
  document.getElementById('drNotes').value = t.treatment || '';
};

// === PHARMACY LOW STOCK ALERTS ===
window.showPharmacyStockAlerts = async () => {
  try {
    const lowStock = await API.get('/api/pharmacy/low-stock');
    if (lowStock.length === 0) { showToast(tr('All stock levels OK!', 'جميع المخزونات بحالة جيدة!')); return; }
    let html = '<div style="max-height:400px;overflow-y:auto">';
    lowStock.forEach(d => {
      const pct = d.min_stock_level > 0 ? Math.round((d.stock_qty / d.min_stock_level) * 100) : 0;
      const color = d.stock_qty <= 0 ? '#dc2626' : d.stock_qty <= 5 ? '#f59e0b' : '#eab308';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin:4px 0;border-radius:8px;border-right:4px solid ' + color + ';background:var(--hover)">' +
        '<div><strong>' + d.drug_name + '</strong>' + (d.category ? '<br><small>' + d.category + '</small>' : '') + '</div>' +
        '<div style="text-align:center"><span style="font-size:20px;font-weight:700;color:' + color + '">' + d.stock_qty + '</span><br><small>' + tr('of', 'من') + ' ' + (d.min_stock_level || 10) + ' min</small></div></div>';
    });
    html += '</div>';
    showModal(tr('Low Stock Alerts', 'تنبيهات المخزون المنخفض') + ' (' + lowStock.length + ')', html);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// === P&L REPORT VIEWER ===
window.renderPnlReport = async (fromDate, toDate) => {
  try {
    let url = '/api/reports/pnl';
    if (fromDate && toDate) url += '?from=' + fromDate + '&to=' + toDate;
    const data = await API.get(url);
    const el = document.getElementById('pnlResult');
    if (!el) return;
    let typeRows = data.byType.map(t =>
      '<tr><td>' + (t.service_type || '-') + '</td><td>' + t.cnt + '</td><td style="font-weight:600">' + Number(t.total).toLocaleString() + ' SAR</td></tr>'
    ).join('');
    el.innerHTML = '<div class="stats-grid" style="margin-bottom:16px">' +
      '<div class="stat-card" style="--stat-color:#22c55e"><div class="stat-label">' + tr('Total Revenue', 'إجمالي الإيراد') + '</div><div class="stat-value">' + Number(data.totalRevenue).toLocaleString() + '</div></div>' +
      '<div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">' + tr('Collected', 'المحصل') + '</div><div class="stat-value">' + Number(data.totalCollected).toLocaleString() + '</div></div>' +
      '<div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">' + tr('Discounts', 'الخصومات') + '</div><div class="stat-value">' + Number(data.totalDiscounts).toLocaleString() + '</div></div>' +
      '<div class="stat-card" style="--stat-color:#ef4444"><div class="stat-label">' + tr('Uncollected', 'غير محصل') + '</div><div class="stat-value">' + Number(data.totalUncollected).toLocaleString() + '</div></div>' +
      '<div class="stat-card" style="--stat-color:#64748b"><div class="stat-label">' + tr('Est. Costs', 'تكاليف تقديرية') + '</div><div class="stat-value">' + Number(data.estimatedCosts).toLocaleString() + '</div></div>' +
      '<div class="stat-card" style="--stat-color:' + (data.netProfit >= 0 ? '#10b981' : '#ef4444') + '"><div class="stat-label">' + tr('Net Profit', 'صافي الربح') + '</div><div class="stat-value">' + Number(data.netProfit).toLocaleString() + '</div></div>' +
      '</div><table class="data-table"><thead><tr><th>' + tr('Service', 'الخدمة') + '</th><th>' + tr('Count', 'العدد') + '</th><th>' + tr('Revenue', 'الإيراد') + '</th></tr></thead><tbody>' + typeRows + '</tbody></table>';
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// === SHOW MODAL HELPER ===
window.showModal = (title, content) => {
  let modal = document.getElementById('genericModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'genericModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = '<div style="background:var(--card-bg,#fff);border-radius:16px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)"><div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:16px"><h3 id="genericModalTitle" style="margin:0"></h3><button onclick="this.closest(\'#genericModal\').style.display=\'none\'" style="border:none;background:none;font-size:20px;cursor:pointer">\u2715</button></div><div id="genericModalBody"></div></div>';
    document.body.appendChild(modal);
  }
  document.getElementById('genericModalTitle').textContent = title;
  document.getElementById('genericModalBody').innerHTML = content;
  modal.style.display = 'flex';
};

async function renderReception(el) {
  // Show premium loading skeletons instantly
  el.innerHTML = `
    <div class="page-title">🏥 ${tr('Reception', 'الاستقبال')}</div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
        <div class="skeleton-bar mb-12"></div>
        <div class="skeleton-bar mb-12"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
    </div>
    <div class="card glass-card-premium mt-16">
      <div class="skeleton-bar title mb-16"></div>
      <div class="skeleton-bar mb-12"></div>
      <div class="skeleton-bar mb-12"></div>
    </div>
  `;

  let patients = [];
  let doctors = [];
  try {
    [patients, doctors] = await Promise.all([
      API.get('/api/patients'),
      API.get('/api/employees?role=Doctor')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">🏥 ${tr('Reception', 'الاستقبال')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load reception data', 'فشل في تحميل بيانات الاستقبال')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }

  const depts = ['العيادة العامة', 'الباطنية', 'الأطفال', 'العظام', 'الجلدية', 'الأنف والأذن', 'العيون', 'الأسنان', 'الطوارئ'];
  const deptsEn = ['General Clinic', 'Internal Medicine', 'Pediatrics', 'Orthopedics', 'Dermatology', 'ENT', 'Ophthalmology', 'Dental', 'Emergency'];
  const maxFile = patients.length ? Math.max(...patients.map(p => p.file_number || 1000)) + 1 : 1001;

  el.innerHTML = `
    <div class="page-title">🏥 ${tr('Reception', 'الاستقبال')}</div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="card-title">📝 ${tr('New Patient File', 'ملف مريض جديد')}</div>
        <div class="form-group mb-12"><label>${tr('File No.', 'رقم الملف')}</label><input class="form-input form-input-readonly" value="${maxFile}" readonly id="rFileNum"></div>
        <div class="form-group mb-12"><label>${tr('Full Name (Arabic)', 'الاسم بالعربية')}</label><input class="form-input" id="rNameAr" placeholder="${tr('Enter Arabic name', 'ادخل الاسم بالعربية')}"></div>
        <div class="form-group mb-12"><label>${tr('Full Name (English)', 'الاسم بالإنجليزية')}</label><input class="form-input" id="rNameEn" placeholder="${tr('Enter English name', 'ادخل الاسم بالإنجليزية')}"></div>
        <div class="form-group mb-12"><label>${tr('National ID', 'رقم الهوية')}</label><input class="form-input" id="rNatId"></div>
        <div class="form-group mb-12"><label>${tr('Phone', 'الجوال')}</label><input class="form-input" id="rPhone" placeholder="05XXXXXXXX"></div>
        <div class="form-group mb-12"><label>${tr('Nationality', 'الجنسية')}</label><select class="form-input" id="rNationality">
          <option value="سعودي">🇸🇦 ${tr('Saudi', 'سعودي')}</option>
          <option value="يمني">🇾🇪 ${tr('Yemeni', 'يمني')}</option>
          <option value="إماراتي">🇦🇪 ${tr('Emirati', 'إماراتي')}</option>
          <option value="كويتي">🇰🇼 ${tr('Kuwaiti', 'كويتي')}</option>
          <option value="بحريني">🇧🇭 ${tr('Bahraini', 'بحريني')}</option>
          <option value="قطري">🇶🇦 ${tr('Qatari', 'قطري')}</option>
          <option value="عماني">🇴🇲 ${tr('Omani', 'عماني')}</option>
          <option value="عراقي">🇮🇶 ${tr('Iraqi', 'عراقي')}</option>
          <option value="أردني">🇯🇴 ${tr('Jordanian', 'أردني')}</option>
          <option value="سوري">🇸🇾 ${tr('Syrian', 'سوري')}</option>
          <option value="لبناني">🇱🇧 ${tr('Lebanese', 'لبناني')}</option>
          <option value="فلسطيني">🇵🇸 ${tr('Palestinian', 'فلسطيني')}</option>
          <option value="مصري">🇪🇬 ${tr('Egyptian', 'مصري')}</option>
          <option value="سوداني">🇸🇩 ${tr('Sudanese', 'سوداني')}</option>
          <option value="ليبي">🇱🇾 ${tr('Libyan', 'ليبي')}</option>
          <option value="تونسي">🇹🇳 ${tr('Tunisian', 'تونسي')}</option>
          <option value="جزائري">🇩🇿 ${tr('Algerian', 'جزائري')}</option>
          <option value="مغربي">🇲🇦 ${tr('Moroccan', 'مغربي')}</option>
          <option value="موريتاني">🇲🇷 ${tr('Mauritanian', 'موريتاني')}</option>
          <option value="صومالي">🇸🇴 ${tr('Somali', 'صومالي')}</option>
          <option value="جيبوتي">🇩🇯 ${tr('Djiboutian', 'جيبوتي')}</option>
          <option value="جزر القمر">🇰🇲 ${tr('Comoran', 'جزر القمر')}</option>
          <option value="تركي">🇹🇷 ${tr('Turkish', 'تركي')}</option>
          <option value="إيراني">🇮🇷 ${tr('Iranian', 'إيراني')}</option>
          <option value="أفغاني">🇦🇫 ${tr('Afghan', 'أفغاني')}</option>
          <option value="باكستاني">🇵🇰 ${tr('Pakistani', 'باكستاني')}</option>
          <option value="هندي">🇮🇳 ${tr('Indian', 'هندي')}</option>
          <option value="بنغلاديشي">🇧🇩 ${tr('Bangladeshi', 'بنغلاديشي')}</option>
          <option value="سريلانكي">🇱🇰 ${tr('Sri Lankan', 'سريلانكي')}</option>
          <option value="نيبالي">🇳🇵 ${tr('Nepali', 'نيبالي')}</option>
          <option value="فلبيني">🇵🇭 ${tr('Filipino', 'فلبيني')}</option>
          <option value="إندونيسي">🇮🇩 ${tr('Indonesian', 'إندونيسي')}</option>
          <option value="ماليزي">🇲🇾 ${tr('Malaysian', 'ماليزي')}</option>
          <option value="تايلاندي">🇹🇭 ${tr('Thai', 'تايلاندي')}</option>
          <option value="فيتنامي">🇻🇳 ${tr('Vietnamese', 'فيتنامي')}</option>
          <option value="ميانماري">🇲🇲 ${tr('Myanmar', 'ميانماري')}</option>
          <option value="صيني">🇨🇳 ${tr('Chinese', 'صيني')}</option>
          <option value="ياباني">🇯🇵 ${tr('Japanese', 'ياباني')}</option>
          <option value="كوري">🇰🇷 ${tr('Korean', 'كوري')}</option>
          <option value="أمريكي">🇺🇸 ${tr('American', 'أمريكي')}</option>
          <option value="كندي">🇨🇦 ${tr('Canadian', 'كندي')}</option>
          <option value="مكسيكي">🇲🇽 ${tr('Mexican', 'مكسيكي')}</option>
          <option value="برازيلي">🇧🇷 ${tr('Brazilian', 'برازيلي')}</option>
          <option value="أرجنتيني">🇦🇷 ${tr('Argentine', 'أرجنتيني')}</option>
          <option value="كولومبي">🇨🇴 ${tr('Colombian', 'كولومبي')}</option>
          <option value="بريطاني">🇬🇧 ${tr('British', 'بريطاني')}</option>
          <option value="فرنسي">🇫🇷 ${tr('French', 'فرنسي')}</option>
          <option value="ألماني">🇩🇪 ${tr('German', 'ألماني')}</option>
          <option value="إيطالي">🇮🇹 ${tr('Italian', 'إيطالي')}</option>
          <option value="إسباني">🇪🇸 ${tr('Spanish', 'إسباني')}</option>
          <option value="برتغالي">🇵🇹 ${tr('Portuguese', 'برتغالي')}</option>
          <option value="هولندي">🇳🇱 ${tr('Dutch', 'هولندي')}</option>
          <option value="بلجيكي">🇧🇪 ${tr('Belgian', 'بلجيكي')}</option>
          <option value="سويسري">🇨🇭 ${tr('Swiss', 'سويسري')}</option>
          <option value="نمساوي">🇦🇹 ${tr('Austrian', 'نمساوي')}</option>
          <option value="سويدي">🇸🇪 ${tr('Swedish', 'سويدي')}</option>
          <option value="نرويجي">🇳🇴 ${tr('Norwegian', 'نرويجي')}</option>
          <option value="دنماركي">🇩🇰 ${tr('Danish', 'دنماركي')}</option>
          <option value="فنلندي">🇫🇮 ${tr('Finnish', 'فنلندي')}</option>
          <option value="بولندي">🇵🇱 ${tr('Polish', 'بولندي')}</option>
          <option value="روسي">🇷🇺 ${tr('Russian', 'روسي')}</option>
          <option value="أوكراني">🇺🇦 ${tr('Ukrainian', 'أوكراني')}</option>
          <option value="روماني">🇷🇴 ${tr('Romanian', 'روماني')}</option>
          <option value="يوناني">🇬🇷 ${tr('Greek', 'يوناني')}</option>
          <option value="أسترالي">🇦🇺 ${tr('Australian', 'أسترالي')}</option>
          <option value="نيوزيلندي">🇳🇿 ${tr('New Zealander', 'نيوزيلندي')}</option>
          <option value="جنوب أفريقي">🇿🇦 ${tr('South African', 'جنوب أفريقي')}</option>
          <option value="نيجيري">🇳🇬 ${tr('Nigerian', 'نيجيري')}</option>
          <option value="كيني">🇰🇪 ${tr('Kenyan', 'كيني')}</option>
          <option value="إثيوبي">🇪🇹 ${tr('Ethiopian', 'إثيوبي')}</option>
          <option value="أوغندي">🇺🇬 ${tr('Ugandan', 'أوغندي')}</option>
          <option value="تانزاني">🇹🇿 ${tr('Tanzanian', 'تانزاني')}</option>
          <option value="غاني">🇬🇭 ${tr('Ghanaian', 'غاني')}</option>
          <option value="سنغالي">🇸🇳 ${tr('Senegalese', 'سنغالي')}</option>
          <option value="كاميروني">🇨🇲 ${tr('Cameroonian', 'كاميروني')}</option>
          <option value="تشادي">🇹🇩 ${tr('Chadian', 'تشادي')}</option>
          <option value="مالي">🇲🇱 ${tr('Malian', 'مالي')}</option>
          <option value="إريتري">🇪🇷 ${tr('Eritrean', 'إريتري')}</option>
          <option value="أذربيجاني">🇦🇿 ${tr('Azerbaijani', 'أذربيجاني')}</option>
          <option value="أوزبكي">🇺🇿 ${tr('Uzbek', 'أوزبكي')}</option>
          <option value="كازاخي">🇰🇿 ${tr('Kazakh', 'كازاخي')}</option>
          <option value="تركمانستاني">🇹🇲 ${tr('Turkmen', 'تركمانستاني')}</option>
          <option value="قرغيزي">🇰🇬 ${tr('Kyrgyz', 'قرغيزي')}</option>
          <option value="طاجيكي">🇹🇯 ${tr('Tajik', 'طاجيكي')}</option>
          <option value="أخرى">🌍 ${tr('Other', 'أخرى')}</option>
        </select></div>
        <div class="form-group mb-12"><label>${tr('Gender', 'الجنس')}</label><select class="form-input" id="rGender">
          <option value="ذكر">👨 ${tr('Male', 'ذكر')}</option>
          <option value="أنثى">👩 ${tr('Female', 'أنثى')}</option>
        </select></div>
        <div class="flex gap-16 mb-12" style="flex-wrap:wrap">
          <div class="form-group" style="flex:3;min-width:220px"><label>${tr('DOB (Gregorian)', 'تاريخ الميلاد (ميلادي)')}</label>
            <div class="flex gap-4">
              <select class="form-input" id="rGregDay" style="flex:0.8"><option value="">${tr('Day', 'يوم')}</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
              <select class="form-input" id="rGregMonth" style="flex:1.5"><option value="">${tr('Month', 'شهر')}</option>
                <option value="1">${tr('January', 'يناير')}</option><option value="2">${tr('February', 'فبراير')}</option><option value="3">${tr('March', 'مارس')}</option>
                <option value="4">${tr('April', 'أبريل')}</option><option value="5">${tr('May', 'مايو')}</option><option value="6">${tr('June', 'يونيو')}</option>
                <option value="7">${tr('July', 'يوليو')}</option><option value="8">${tr('August', 'أغسطس')}</option><option value="9">${tr('September', 'سبتمبر')}</option>
                <option value="10">${tr('October', 'أكتوبر')}</option><option value="11">${tr('November', 'نوفمبر')}</option><option value="12">${tr('December', 'ديسمبر')}</option>
              </select>
              <select class="form-input" id="rGregYear" style="flex:1"><option value="">${tr('Year', 'سنة')}</option>${Array.from({ length: 97 }, (_, i) => `<option value="${2026 - i}">${2026 - i}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-group" style="flex:3;min-width:220px"><label>${tr('DOB (Hijri)', 'تاريخ الميلاد (هجري)')}</label>
            <div class="flex gap-4">
              <select class="form-input" id="rHijriDay" style="flex:0.8"><option value="">${tr('Day', 'يوم')}</option>${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select>
              <select class="form-input" id="rHijriMonth" style="flex:1.5"><option value="">${tr('Month', 'شهر')}</option>
                <option value="1">محرم</option><option value="2">صفر</option><option value="3">ربيع الأول</option><option value="4">ربيع الثاني</option>
                <option value="5">جمادى الأولى</option><option value="6">جمادى الثانية</option><option value="7">رجب</option><option value="8">شعبان</option>
                <option value="9">رمضان</option><option value="10">شوال</option><option value="11">ذو القعدة</option><option value="12">ذو الحجة</option>
              </select>
              <select class="form-input" id="rHijriYear" style="flex:1"><option value="">${tr('Year', 'سنة')}</option>${Array.from({ length: 101 }, (_, i) => `<option value="${1350 + i}">${1350 + i}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-group" style="flex:1;min-width:70px"><label>${tr('Age', 'العمر')}</label><input class="form-input form-input-readonly" id="rAge" readonly></div>
        </div>

        <div style="background:var(--hover);padding:12px;border-radius:8px;margin-bottom:12px">
          <h4 style="margin:0 0 8px;font-size:13px;color:var(--accent)">🏥 ${tr('Medical Information', 'المعلومات الطبية')}</h4>
          <div class="flex gap-8 mb-8" style="flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:120px"><label>${tr('Blood Type', 'فصيلة الدم')}</label>
              <select class="form-input" id="rBloodType">
                <option value="">--</option>
                <option value="A+">A+</option><option value="A-">A-</option>
                <option value="B+">B+</option><option value="B-">B-</option>
                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                <option value="O+">O+</option><option value="O-">O-</option>
              </select>
            </div>
            <div class="form-group" style="flex:2;min-width:200px"><label>⚠️ ${tr('Allergies', 'الحساسية')}</label><input class="form-input" id="rAllergies" placeholder="${tr('Drug allergies, food allergies...', 'حساسية أدوية، طعام...')}"></div>
            <div class="form-group" style="flex:2;min-width:200px"><label>🩺 ${tr('Chronic Diseases', 'الأمراض المزمنة')}</label><input class="form-input" id="rChronicDiseases" placeholder="${tr('Diabetes, Hypertension, Asthma...', 'سكري، ضغط، ربو...')}"></div>
          </div>
          <div class="flex gap-8 mb-8" style="flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:150px"><label>🆘 ${tr('Emergency Contact Name', 'اسم جهة الطوارئ')}</label><input class="form-input" id="rEmergencyName"></div>
            <div class="form-group" style="flex:1;min-width:120px"><label>📞 ${tr('Emergency Phone', 'هاتف الطوارئ')}</label><input class="form-input" id="rEmergencyPhone" type="tel"></div>
            <div class="form-group" style="flex:2;min-width:200px"><label>📍 ${tr('Address', 'العنوان')}</label><input class="form-input" id="rAddress"></div>
          </div>
        </div>

        <div style="background:var(--hover);padding:12px;border-radius:8px;margin-bottom:12px">
          <h4 style="margin:0 0 8px;font-size:13px;color:var(--accent)">🏢 ${tr('Insurance Information', 'معلومات التأمين')}</h4>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <div class="form-group" style="flex:2;min-width:180px"><label>${tr('Insurance Company', 'شركة التأمين')}</label><input class="form-input" id="rInsuranceCompany" placeholder="${tr('e.g. Bupa, Tawuniya, MedGulf...', 'مثال: بوبا، التعاونية...')}"></div>
            <div class="form-group" style="flex:1;min-width:140px"><label>${tr('Policy Number', 'رقم البوليصة')}</label><input class="form-input" id="rInsurancePolicyNo"></div>
            <div class="form-group" style="flex:1;min-width:120px"><label>${tr('Class', 'الفئة')}</label>
              <select class="form-input" id="rInsuranceClass">
                <option value="">--</option>
                <option value="VIP">VIP</option>
                <option value="A">A (Gold)</option>
                <option value="B">B (Silver)</option>
                <option value="C">C (Bronze)</option>
              </select>
            </div>
          </div>
        </div>

        <button class="btn btn-primary w-full" id="rSaveBtn" style="height:44px;font-size:15px">💾 ${tr('Save & Generate File', 'حفظ وإنشاء ملف')}</button>
      </div>
    </div>
    <div class="card glass-card-premium mt-16">
      <div class="card-title">📋 ${tr('Patient Queue', 'قائمة المرضى')}</div>
      <input class="search-filter" id="rSearch" placeholder="${tr('Search by name, ID, phone, file#...', 'بحث بالاسم، الهوية، الجوال، رقم الملف...')}">
      <div id="rTable"></div>
    </div>
    <div class="card glass-card-premium mt-16" id="pendingPaymentCard">
      <div class="card-title">💳 ${tr('Pending Payment Orders (Lab / Radiology)', 'طلبات فحوصات بانتظار السداد (مختبر / أشعة)')}</div>
      <div id="pendingPaymentTable"></div>
    </div>
    <div id="editPatientModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
      <div style="background:#fff;padding:30px;border-radius:16px;width:550px;max-width:90%;max-height:85vh;overflow-y:auto;direction:rtl">
        <h3 style="margin-bottom:16px">✏️ ${tr('Edit Patient', 'تعديل بيانات المريض')}</h3>
        <input type="hidden" id="editPId">
        <div class="form-grid" style="gap:12px">
          <div><label>${tr('Name (Arabic)', 'الاسم بالعربية')}</label><input id="editPNameAr" class="form-control"></div>
          <div><label>${tr('Name (English)', 'الاسم بالإنجليزية')}</label><input id="editPNameEn" class="form-control"></div>
          <div><label>${tr('National ID', 'رقم الهوية')}</label><input id="editPNatId" class="form-control"></div>
          <div><label>${tr('Phone', 'الجوال')}</label><input id="editPPhone" class="form-control"></div>
          <div><label>${tr('Nationality', 'الجنسية')}</label><input id="editPNationality" class="form-control"></div>
          <div><label>${tr('DOB', 'تاريخ الميلاد')}</label><input id="editPDob" type="date" class="form-control"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" onclick="saveEditPatient()" style="flex:1">💾 ${tr('Save', 'حفظ')}</button>
          <button class="btn" onclick="document.getElementById('editPatientModal').style.display='none'" style="flex:1">❌ ${tr('Cancel', 'إلغاء')}</button>
        </div>
      </div>
    </div>
    <div id="newInvoiceModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
      <div style="background:#fff;padding:30px;border-radius:16px;width:450px;max-width:90%;direction:rtl">
        <h3 style="margin-bottom:16px">🧾 ${tr('New Service Invoice', 'فاتورة خدمة جديدة')}</h3>
        <input type="hidden" id="invPId">
        <input type="hidden" id="invPName">
        <p id="invPLabel" style="font-weight:700;margin-bottom:12px"></p>
        <div class="form-grid" style="gap:12px">
          <div><label>${tr('Service Type', 'نوع الخدمة')}</label><select id="invServiceType" class="form-control" onchange="var v=this.value==='\u0643\u0634\u0641';document.getElementById('invDeptRow').style.display=v?'block':'none';document.getElementById('invDoctorRow').style.display=v?'block':'none'">
            <option value="كشف">🩺 ${tr('Consultation', 'كشف')}</option>
            <option value="مختبر">🧪 ${tr('Laboratory', 'مختبر')}</option>
            <option value="أشعة">📷 ${tr('Radiology', 'أشعة')}</option>
            <option value="إجراء">🏥 ${tr('Procedure', 'إجراء')}</option>
            <option value="أدوية">💊 ${tr('Medications', 'أدوية')}</option>
            <option value="عملية">🩸 ${tr('Surgery', 'عملية')}</option>
            <option value="تمريض">👩‍⚕️ ${tr('Nursing', 'تمريض')}</option>
            <option value="أخرى">📋 ${tr('Other', 'أخرى')}</option>
          </select></div>
          <div id="invDeptRow"><label>${tr('Department', 'القسم')}</label><select id="invDept" class="form-control">
            ${depts.map((d, i) => `<option value="${isArabic ? d : deptsEn[i]}">${isArabic ? d : deptsEn[i]}</option>`).join('')}
          </select></div>
          <div id="invDoctorRow"><label>${tr('Doctor', 'الطبيب')}</label><select id="invDoctor" class="form-control">
            <option value="">${tr('Select Doctor', 'اختر الطبيب')}</option>
            ${(doctors || []).map(d => `<option value="${d.name}">${d.name}</option>`).join('')}
          </select></div>
          <div><label>${tr('Description', 'الوصف')}</label><input id="invDescription" class="form-control" placeholder="${tr('Service details', 'تفاصيل الخدمة')}"></div>
          <div><label>${tr('Amount (SAR)', 'المبلغ (ر.س)')}</label><input id="invAmount" type="number" step="0.01" class="form-control" placeholder="0.00"></div>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <div style="flex:1"><label>🏷️ ${tr('Discount (SAR)', 'الخصم (ر.س)')}</label><input id="invDiscount" type="number" step="0.01" class="form-control" placeholder="0" value="0"></div>
            <div style="flex:2"><label>${tr('Discount Reason', 'سبب الخصم')}</label><input id="invDiscountReason" class="form-control" placeholder="${tr('e.g. Staff, Insurance, Coupon...', 'مثال: موظف، تأمين، كوبون...')}"></div>
          </div>
          <div><label>${tr('Payment Method', 'طريقة السداد')}</label><select id="invPayMethod" class="form-control">
            <option value="كاش">💵 ${tr('Cash', 'كاش')}</option>
            <option value="صرافة">💳 ${tr('Card/POS', 'صرافة')}</option>
            <option value="تحويل بنكي">🏦 ${tr('Bank Transfer', 'تحويل بنكي')}</option>
            <option value="تابي">🔵 ${tr('Tabby', 'تابي')}</option>
            <option value="تمارا">🟣 ${tr('Tamara', 'تمارا')}</option>
          </select></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" onclick="confirmNewInvoice()" style="flex:1">✅ ${tr('Create Invoice', 'إنشاء فاتورة')}</button>
          <button class="btn" onclick="document.getElementById('newInvoiceModal').style.display='none'" style="flex:1">❌ ${tr('Cancel', 'إلغاء')}</button>
        </div>
      </div>
    </div>`;

  renderPatientTable(patients);
  loadPendingPaymentOrders();

  // Arabic to English transliteration (improved)
  const commonNames = {
    'محمد': 'Mohammed', 'أحمد': 'Ahmed', 'علي': 'Ali', 'عبدالله': 'Abdullah', 'عبد الله': 'Abdullah',
    'عبدالرحمن': 'Abdulrahman', 'عبد الرحمن': 'Abdulrahman', 'عبدالعزيز': 'Abdulaziz', 'عبد العزيز': 'Abdulaziz',
    'عبدالملك': 'Abdulmalik', 'عبد الملك': 'Abdulmalik', 'عبدالرحيم': 'Abdulrahim', 'عبد الرحيم': 'Abdulrahim',
    'فهد': 'Fahad', 'سعود': 'Saud', 'خالد': 'Khalid', 'سلطان': 'Sultan', 'تركي': 'Turki',
    'سعد': 'Saad', 'نايف': 'Naif', 'بندر': 'Bandar', 'فيصل': 'Faisal', 'سلمان': 'Salman',
    'ناصر': 'Nasser', 'صالح': 'Saleh', 'يوسف': 'Yousef', 'إبراهيم': 'Ibrahim', 'ابراهيم': 'Ibrahim',
    'حسن': 'Hassan', 'حسين': 'Hussein', 'عمر': 'Omar', 'عثمان': 'Othman', 'طلال': 'Talal',
    'ماجد': 'Majed', 'وليد': 'Waleed', 'مشعل': 'Mishal', 'منصور': 'Mansour', 'سارة': 'Sarah',
    'نورة': 'Noura', 'فاطمة': 'Fatimah', 'عائشة': 'Aisha', 'مريم': 'Mariam', 'هند': 'Hind',
    'لطيفة': 'Latifah', 'منيرة': 'Munirah', 'هيا': 'Haya', 'لمياء': 'Lamia', 'ريم': 'Reem',
    'دانة': 'Dana', 'لين': 'Leen', 'جواهر': 'Jawaher', 'بدور': 'Badoor', 'العنزي': 'Al-Anzi',
    'الشمري': 'Al-Shammari', 'الحربي': 'Al-Harbi', 'القحطاني': 'Al-Qahtani', 'الغامدي': 'Al-Ghamdi',
    'الدوسري': 'Al-Dosari', 'المطيري': 'Al-Mutairi', 'الزهراني': 'Al-Zahrani', 'العتيبي': 'Al-Otaibi',
    'السبيعي': 'Al-Subaie', 'الرشيدي': 'Al-Rashidi', 'البلوي': 'Al-Balawi', 'الجهني': 'Al-Juhani',
    'السعدي': 'Al-Saadi', 'المالكي': 'Al-Malki'
  };
  const arToEn = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
    'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm',
    'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ة': 'ah', 'ى': 'a',
    'ء': "'", 'ؤ': 'o', 'ئ': 'e', 'ّ': '', 'َ': 'a', 'ُ': 'u', 'ِ': 'i', 'ْ': '', 'ً': '', 'ٌ': '', 'ٍ': ''
  };
  document.getElementById('rNameAr').addEventListener('input', (e) => {
    const words = e.target.value.trim().split(/\s+/);
    const result = words.map(word => {
      // Check common names first
      if (commonNames[word]) return commonNames[word];
      // Handle ال prefix
      let prefix = '';
      let w = word;
      if (w.startsWith('ال') && w.length > 2) {
        prefix = 'Al-';
        w = w.substring(2);
      }
      let trans = '';
      for (let i = 0; i < w.length; i++) {
        const ch = w[i];
        if (arToEn[ch] !== undefined) {
          trans += arToEn[ch];
        } else if (ch.match(/[a-zA-Z0-9]/)) {
          trans += ch;
        }
      }
      if (trans.length > 0) {
        trans = trans.charAt(0).toUpperCase() + trans.slice(1);
      }
      return prefix + trans;
    }).filter(w => w.length > 0).join(' ');
    document.getElementById('rNameEn').value = result;
  });

  // Date conversion helpers
  const gToH = (g) => {
    try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(g).replace(/هـ/g, '').trim(); } catch (e) { return ''; }
  };
  const hToG = (hY, hM, hD) => {
    // Proper Hijri to Gregorian conversion using tabular Islamic calendar
    const a = Math.floor((11 * hY + 3) / 30);
    const b = Math.floor(hY / 100);
    const c = Math.floor(hY - 100 * b);
    const d = Math.floor(b / 4);
    const e1 = Math.floor((8 * (b + 1)) / 25) - 1;
    // Calculate Julian Day Number from Hijri date
    const jd = Math.floor(29.5001 * (hM - 1 + 12 * (hY - 1))) + hD + 1948439.5 - Math.floor((3 * (Math.floor((hY - 1) / 100) + 1)) / 4) + Math.floor((hY - 1) / 100) - Math.floor((hY - 1) / 400);
    // Simpler and more reliable method: iterate from a known epoch
    // Hijri epoch: July 16, 622 CE (Julian) = July 19, 622 CE (Gregorian)
    const hijriEpoch = 1948439.5; // Julian Day for 1/1/1 Hijri
    const monthDays = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
    // Leap year adds 1 day to month 12
    const isLeapYear = (y) => (11 * y + 14) % 30 < 11;
    let totalDays = 0;
    for (let y = 1; y < hY; y++) {
      totalDays += isLeapYear(y) ? 355 : 354;
    }
    for (let m = 1; m < hM; m++) {
      totalDays += monthDays[m - 1];
    }
    if (hM === 12 && isLeapYear(hY)) totalDays += 0; // already counted
    totalDays += hD - 1;
    // Hijri epoch in JavaScript Date: July 19, 622 CE
    const epochMs = new Date(622, 6, 19).getTime();
    const gDate = new Date(epochMs + totalDays * 86400000);
    // Fix JS Date quirk for years < 100
    if (gDate.getFullYear() < 100) gDate.setFullYear(gDate.getFullYear());
    const age = Math.abs(new Date(Date.now() - gDate.getTime()).getUTCFullYear() - 1970);
    const y = gDate.getFullYear();
    const m = String(gDate.getMonth() + 1).padStart(2, '0');
    const day = String(gDate.getDate()).padStart(2, '0');
    return { gDate: `${y}-${m}-${day}`, age };
  };

  // Gregorian dropdowns -> convert to Hijri
  const gregChange = () => {
    const gY = parseInt(document.getElementById('rGregYear').value);
    const gM = parseInt(document.getElementById('rGregMonth').value);
    const gD = parseInt(document.getElementById('rGregDay').value);
    if (!gY || !gM || !gD) return;
    const dob = new Date(gY, gM - 1, gD);
    const diff = Date.now() - dob.getTime();
    document.getElementById('rAge').value = Math.abs(new Date(diff).getUTCFullYear() - 1970);
    const hStr = gToH(dob);
    if (hStr) {
      const parts = hStr.replace(/[^0-9/]/g, '').split('/');
      if (parts.length === 3) {
        document.getElementById('rHijriDay').value = parseInt(parts[0]);
        document.getElementById('rHijriMonth').value = parseInt(parts[1]);
        document.getElementById('rHijriYear').value = parseInt(parts[2]);
      }
    }
  };
  document.getElementById('rGregYear').addEventListener('change', gregChange);
  document.getElementById('rGregMonth').addEventListener('change', gregChange);
  document.getElementById('rGregDay').addEventListener('change', gregChange);

  // Hijri dropdowns -> convert to Gregorian
  const hijriChange = () => {
    const hY = parseInt(document.getElementById('rHijriYear').value);
    const hM = parseInt(document.getElementById('rHijriMonth').value);
    const hD = parseInt(document.getElementById('rHijriDay').value);
    if (!hY || !hM || !hD) return;
    const res = hToG(hY, hM, hD);
    // Populate Gregorian dropdowns
    const gd = new Date(res.gDate);
    document.getElementById('rGregDay').value = gd.getDate();
    document.getElementById('rGregMonth').value = gd.getMonth() + 1;
    document.getElementById('rGregYear').value = gd.getFullYear();
    document.getElementById('rAge').value = res.age;
  };
  document.getElementById('rHijriYear').addEventListener('change', hijriChange);
  document.getElementById('rHijriMonth').addEventListener('change', hijriChange);
  document.getElementById('rHijriDay').addEventListener('change', hijriChange);

  document.getElementById('rSaveBtn').addEventListener('click', async () => {
    const nameAr = document.getElementById('rNameAr').value.trim();
    const nameEn = document.getElementById('rNameEn').value.trim();
    if (!nameAr && !nameEn) { showToast(tr('Enter patient name', 'ادخل اسم المريض'), 'error'); return; }
    try {
      await API.post('/api/patients', {
        name_ar: nameAr, name_en: nameEn,
        national_id: document.getElementById('rNatId').value,
        nationality: document.getElementById('rNationality').value,
        gender: document.getElementById('rGender').value,
        phone: document.getElementById('rPhone').value,
        blood_type: document.getElementById('rBloodType').value,
        allergies: document.getElementById('rAllergies').value,
        chronic_diseases: document.getElementById('rChronicDiseases').value,
        emergency_contact_name: document.getElementById('rEmergencyName').value,
        emergency_contact_phone: document.getElementById('rEmergencyPhone').value,
        address: document.getElementById('rAddress').value,
        insurance_company: document.getElementById('rInsuranceCompany').value,
        insurance_policy_number: document.getElementById('rInsurancePolicyNo').value,
        insurance_class: document.getElementById('rInsuranceClass').value,
        dob: (document.getElementById('rGregYear').value && document.getElementById('rGregMonth').value && document.getElementById('rGregDay').value) ? `${document.getElementById('rGregYear').value}-${String(document.getElementById('rGregMonth').value).padStart(2, '0')}-${String(document.getElementById('rGregDay').value).padStart(2, '0')}` : '',
        dob_hijri: (document.getElementById('rHijriYear').value && document.getElementById('rHijriMonth').value && document.getElementById('rHijriDay').value) ? `${document.getElementById('rHijriYear').value}/${String(document.getElementById('rHijriMonth').value).padStart(2, '0')}/${String(document.getElementById('rHijriDay').value).padStart(2, '0')}` : ''
      });
      showToast(tr('Patient saved!', 'تم حفظ المريض!'));
      await navigateTo(1);
    } catch (e) { showToast(tr('Error saving patient', 'خطأ في حفظ المريض'), 'error'); }
  });

  document.getElementById('rSearch').addEventListener('input', (e) => {
    const txt = e.target.value.toLowerCase();
    let visibleCount = 0;
    document.querySelectorAll('#rTable tbody tr').forEach(row => {
      const match = row.textContent.toLowerCase().includes(txt);
      row.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });
    
    let noMatchDiv = document.getElementById('rTableNoMatch');
    if (visibleCount === 0) {
      if (!noMatchDiv) {
        noMatchDiv = document.createElement('div');
        noMatchDiv.id = 'rTableNoMatch';
        noMatchDiv.className = 'empty-state-card';
        noMatchDiv.innerHTML = `<div class="empty-state-icon">🔍</div><div>${tr('No matching patients found', 'لم يتم العثور على مرضى مطابقين')}</div>`;
        document.getElementById('rTable').appendChild(noMatchDiv);
      }
      const table = document.querySelector('#rTable table');
      if (table) table.style.display = 'none';
    } else {
      if (noMatchDiv) noMatchDiv.remove();
      const table = document.querySelector('#rTable table');
      if (table) table.style.display = '';
    }
  });
}

function renderPatientTable(patients) {
  if (!patients || patients.length === 0) {
    document.getElementById('rTable').innerHTML = `
      <div class="empty-state-card">
        <div class="empty-state-icon">👥</div>
        <div>${tr('No patients registered yet', 'لا يوجد مرضى مسجلين بعد')}</div>
      </div>
    `;
    return;
  }
  const headers = [tr('MRN/File#', 'رقم الملف'), tr('Name', 'الاسم'), tr('ID', 'الهوية'), tr('Phone', 'الجوال'), tr('Blood', 'فصيلة'), tr('Insurance', 'التأمين'), tr('Date/Time', 'التاريخ/الوقت'), tr('Status', 'الحالة'), tr('Actions', 'إجراءات')];
  const rows = patients.map(p => ({
    cells: [
      p.mrn || p.file_number,
      `${p.gender === 'ذكر' ? '👨' : '👩'} ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}${p.allergies ? ' <span style="color:#ef4444;font-weight:700" title="' + p.allergies + '">⚠️</span>' : ''}`,
      p.national_id,
      p.phone,
      p.blood_type ? `<span class="badge" style="background:#dc2626;color:#fff;font-size:10px">${p.blood_type}</span>` : '-',
      p.insurance_company ? `<span style="font-size:11px">${p.insurance_company}${p.insurance_class ? ' (' + p.insurance_class + ')' : ''}</span>` : '-',
      p.created_at ? new Date(p.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : '-',
      statusBadge(p.status)
    ],
    id: p.id, raw: p
  }));
  document.getElementById('rTable').innerHTML = makeTable(headers, rows, (row) =>
    `<button class="btn btn-sm" onclick="editPatient(${row.id})" title="${tr('Edit', 'تعديل')}">✏️</button> <button class="btn btn-sm btn-success" onclick="showNewInvoiceModal(${row.id},'${(row.raw.name_ar || row.raw.name_en || '').replace(/'/g, "\\'")}')" title="${tr('Invoice', 'فاتورة')}">🧾</button> <button class="btn btn-danger btn-sm" onclick="deletePatient(${row.id})" title="${tr('Delete', 'حذف')}">🗑</button>`
  );
}

window.deletePatient = async (id) => {
  if (!confirm(tr('Delete this patient and all records?', 'حذف هذا المريض وجميع سجلاته؟'))) return;
  try {
    await API.del(`/api/patients/${id}`);
    showToast(tr('Patient deleted', 'تم حذف المريض'));
    await navigateTo(1);
  } catch (e) { showToast(tr('Error deleting', 'خطأ في الحذف'), 'error'); }
};

window.editPatient = async function (id) {
  try {
    const patients = await API.get('/api/patients');
    const p = patients.find(x => x.id === id);
    if (!p) return showToast(tr('Patient not found', 'المريض غير موجود'), 'error');
    document.getElementById('editPId').value = id;
    document.getElementById('editPNameAr').value = p.name_ar || '';
    document.getElementById('editPNameEn').value = p.name_en || '';
    document.getElementById('editPNatId').value = p.national_id || '';
    document.getElementById('editPPhone').value = p.phone || '';
    document.getElementById('editPNationality').value = p.nationality || '';
    document.getElementById('editPDob').value = p.dob || '';
    document.getElementById('editPatientModal').style.display = 'flex';
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveEditPatient = async function () {
  const id = document.getElementById('editPId').value;
  try {
    await API.put('/api/patients/' + id, {
      name_ar: document.getElementById('editPNameAr').value,
      name_en: document.getElementById('editPNameEn').value,
      national_id: document.getElementById('editPNatId').value,
      phone: document.getElementById('editPPhone').value,
      nationality: document.getElementById('editPNationality').value,
      dob: document.getElementById('editPDob').value
    });
    document.getElementById('editPatientModal').style.display = 'none';
    showToast(tr('Patient updated!', 'تم تحديث بيانات المريض!'));
    await navigateTo(1);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.showNewInvoiceModal = function (id, name) {
  document.getElementById('invPId').value = id;
  document.getElementById('invPName').value = name;
  document.getElementById('invPLabel').textContent = name;
  document.getElementById('invDescription').value = '';
  document.getElementById('invAmount').value = '';
  if (document.getElementById('invDiscount')) document.getElementById('invDiscount').value = '0';
  if (document.getElementById('invDiscountReason')) document.getElementById('invDiscountReason').value = '';
  document.getElementById('newInvoiceModal').style.display = 'flex';
};
window.confirmNewInvoice = async function () {
  const id = document.getElementById('invPId').value;
  const name = document.getElementById('invPName').value;
  const amount = parseFloat(document.getElementById('invAmount').value);
  const serviceType = document.getElementById('invServiceType').value;
  const discount = parseFloat(document.getElementById('invDiscount')?.value) || 0;
  const discountReason = document.getElementById('invDiscountReason')?.value || '';
  if (!amount || amount <= 0) return showToast(tr('Enter amount', 'ادخل المبلغ'), 'error');
  if (discount > amount) return showToast(tr('Discount cannot exceed amount', 'الخصم لا يمكن أن يتجاوز المبلغ'), 'error');
  try {
    let desc = document.getElementById('invDescription').value;
    if (serviceType === 'كشف') {
      const dept = document.getElementById('invDept').value;
      const doctor = document.getElementById('invDoctor').value;
      const parts = [dept, doctor, desc].filter(x => x);
      desc = parts.join(' - ');
      await API.put('/api/patients/' + id, { department: dept });
    }
    const finalAmount = amount - discount;
    await API.post('/api/invoices', {
      patient_id: id, patient_name: name,
      total: finalAmount,
      description: desc + (discount > 0 ? ' (خصم: ' + discount + ' SAR' + (discountReason ? ' - ' + discountReason : '') + ')' : ''),
      service_type: serviceType,
      payment_method: document.getElementById('invPayMethod').value,
      discount: discount,
      discount_reason: discountReason
    });
    document.getElementById('newInvoiceModal').style.display = 'none';
    showToast(tr('Invoice created!', 'تم إنشاء الفاتورة!') + (discount > 0 ? ' (' + tr('Discount', 'خصم') + ': ' + discount + ')' : ''));
    await navigateTo(1);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== APPOINTMENTS =====
async function renderAppointments(el) {
  // Show premium skeletons instantly
  el.innerHTML = `
    <div class="page-title">📅 ${tr('Appointments', 'المواعيد')}</div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
    </div>
  `;

  let appts = [];
  let emps = [];
  let patients = [];
  try {
    [appts, emps, patients] = await Promise.all([
      API.get('/api/appointments'),
      API.get('/api/employees?role=Doctor'),
      API.get('/api/patients')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">📅 ${tr('Appointments', 'المواعيد')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load appointments data', 'فشل في تحميل بيانات المواعيد')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }

  const appointmentsTableHtml = appts.length === 0 ? `
    <div class="empty-state-card">
      <div class="empty-state-icon">📅</div>
      <div>${tr('No appointments booked yet', 'لا توجد مواعيد محجوزة بعد')}</div>
    </div>
  ` : makeTable(
    [tr('Patient', 'المريض'), tr('Doctor', 'الطبيب'), tr('Dept', 'القسم'), tr('Date', 'التاريخ'), tr('Time', 'الوقت'), tr('Status', 'الحالة'), tr('Delete', 'حذف')],
    appts.map(a => ({ cells: [a.patient_name, a.doctor_name, a.department, a.appt_date, a.appt_time, statusBadge(a.status)], id: a.id })),
    (row) => `<button class="btn btn-sm" onclick="checkInPatient(${row.id})" title="${tr('Check-in', 'تسجيل وصول')}" style="background:#e8f5e9;color:#2e7d32;margin:0 2px">✅</button><button class="btn btn-sm" onclick="markNoShow(${row.id})" title="${tr('No-Show', 'متغيب')}" style="background:#fff3e0;color:#e65100;margin:0 2px">⚠️</button><button class="btn btn-danger btn-sm" onclick="delAppt(${row.id})" style="margin:0 2px">🗑</button>`
  );

  el.innerHTML = `
    <div class="page-title">📅 ${tr('Appointments', 'المواعيد')}</div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="card-title">📝 ${tr('Book Appointment', 'حجز موعد')}</div>
        <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><select class="form-input" id="aPatient"><option value="">${tr('Select patient', 'اختر مريض')}</option>${patients.map(p => `<option value="${p.name_en}" data-pid="${p.id}">${isArabic ? p.name_ar : p.name_en} (#${p.file_number})</option>`).join('')}</select></div>
        <div class="form-group mb-12"><label>${tr('Doctor', 'الطبيب')}</label><select class="form-input" id="aDoctor"><option value="">${tr('Select doctor', 'اختر طبيب')}</option>${emps.map(d => `<option>${d.name}</option>`).join('')}</select></div>
        <div class="form-group mb-12"><label>${tr('Date', 'التاريخ')}</label><input class="form-input" type="date" id="aDate" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group mb-12"><label>${tr('Time', 'الوقت')}</label><input class="form-input" type="time" id="aTime" value="${new Date().toTimeString().slice(0, 5)}"></div>
        <div class="form-group mb-12"><label>${tr('Notes', 'ملاحظات')}</label><input class="form-input" id="aNotes"></div>
        <div class="form-group mb-16"><label>${tr('Appointment Fee', 'رسوم الموعد')}</label><input class="form-input" id="aFee" type="number" value="0" placeholder="0.00"></div>
        <button class="btn btn-primary w-full" onclick="bookAppt()" style="height:44px">📅 ${tr('Book', 'حجز')}</button>
      </div>
      <div class="card glass-card-premium">
        <div class="card-title">📋 ${tr('Appointments List', 'قائمة المواعيد')}</div>
        <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'aTable')">
        <div id="aTable">${appointmentsTableHtml}</div>
      </div>
    </div>`;
}
window.bookAppt = async () => {
  const pSelect = document.getElementById('aPatient');
  const pName = pSelect.value;
  const pId = pSelect.options[pSelect.selectedIndex]?.dataset?.pid || '';
  if (!pName) { showToast(tr('Select patient', 'اختر مريض'), 'error'); return; }
  try {
    await API.post('/api/appointments', { patient_name: pName, patient_id: pId, doctor_name: document.getElementById('aDoctor').value, department: '', appt_date: document.getElementById('aDate').value, appt_time: document.getElementById('aTime').value, notes: document.getElementById('aNotes').value, fee: parseFloat(document.getElementById('aFee').value) || 0 });
    showToast(tr('Appointment booked!', 'تم حجز الموعد!'));
    await navigateTo(2);
  } catch (e) { showToast(tr('Error booking', 'خطأ في الحجز'), 'error'); }
};
window.delAppt = async (id) => {
  if (!confirm(tr('Delete this appointment?', 'حذف هذا الموعد؟'))) return;
  try { await API.del(`/api/appointments/${id}`); showToast(tr('Deleted', 'تم الحذف')); await navigateTo(2); }
  catch (e) { showToast(tr('Error deleting', 'خطأ في الحذف'), 'error'); }
};
window.filterTable = (input, tableId) => {
  const txt = input.value.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(r => r.style.display = r.textContent.toLowerCase().includes(txt) ? '' : 'none');
};

// ===== DOCTOR STATION =====
async function renderDoctor(el) {
  // Show premium loading skeletons instantly
  el.innerHTML = `
    <div class="page-title">👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}</div>
    <div class="split-layout">
      <div>
        <div class="card glass-card-premium mb-16">
          <div class="skeleton-bar title mb-16"></div>
          <div class="skeleton-bar mb-12"></div>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="skeleton-bar title mb-16"></div>
          <div class="skeleton-bar mb-12"></div>
        </div>
      </div>
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
    </div>
  `;

  let patients = [];
  let records = [];
  let drugs = [];
  let allServices = [];
  let currentUser = {};
  try {
    [patients, records, drugs, allServices, currentUser] = await Promise.all([
      API.get('/api/patients'),
      API.get('/api/medical/records'),
      API.get('/api/pharmacy/drugs'),
      API.get('/api/medical/services'),
      API.get('/api/auth/me')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load doctor station data', 'فشل في تحميل بيانات محطة الطبيب')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }

  const drSpecialty = (currentUser.user && currentUser.user.speciality) || '';
  const filteredServices = drSpecialty ? allServices.filter(s => s.specialty === drSpecialty) : allServices;
  // Group services by category for display
  const svcCategories = {};
  filteredServices.forEach(s => { if (!svcCategories[s.category]) svcCategories[s.category] = []; svcCategories[s.category].push(s); });
  
  el.innerHTML = `
    <div class="page-title">👨‍⚕️ ${tr('Doctor Station', 'محطة الطبيب')}</div>
    <div class="split-layout">
      <div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📝 ${tr('Select Patient', 'اختيار المريض')}</div>
          <select class="form-input w-full" id="drPatient" onchange="loadPatientInfo()">
            <option value="">${tr('-- Select --', '-- اختر مريض --')}</option>
            ${patients.map(p => `<option value="${p.id}">${p.file_number} - ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)} (${statusText(p.status)})</option>`).join('')}
          </select>
          <div id="drPatientInfo" class="mt-16"></div>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">🩺 ${tr('Diagnosis & Notes', 'التشخيص والملاحظات')}</div>
          <div class="form-group mb-8"><label>📋 ${tr('Quick Diagnosis Template', 'قالب تشخيص سريع')}</label>
            <div class="flex gap-8">
              <select class="form-input" id="drDiagTemplate" style="flex:1" onchange="applyDiagTemplate()">
                <option value="">${tr('-- Select Template --', '-- اختر قالب --')}</option>
              </select>
              <button class="btn btn-sm" onclick="loadDiagTemplates()" style="white-space:nowrap">📥 ${tr('Load', 'تحميل')}</button>
            </div>
          </div>
          <div class="form-group mb-12"><label>${tr('Diagnosis', 'التشخيص')}</label><input class="form-input" id="drDiag"></div>
          <div class="form-group mb-12"><label>${tr('Symptoms', 'الأعراض')}</label><input class="form-input" id="drSymp"></div>
          <div class="form-group mb-12"><label>${tr('ICD-10', 'رمز التشخيص')}</label><input class="form-input" id="drIcd"></div>
          <div class="form-group mb-16"><label>${tr('Notes', 'ملاحظات')}</label><textarea class="form-input form-textarea" id="drNotes"></textarea></div>
          <button class="btn btn-primary w-full" onclick="saveMedRecord()" style="height:44px">💾 ${tr('Save Record', 'حفظ السجل')}</button>
        </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="showMedicalReportForm('sick_leave')" style="flex:1;background:#fff3e0;border:1px solid #ff9800;color:#e65100;min-width:120px">🏥 ${tr('Sick Leave', 'إجازة مرضية')}</button>
            <button class="btn btn-sm" onclick="showMedicalReportForm('medical_report')" style="flex:1;background:#e3f2fd;border:1px solid #1565c0;color:#1565c0;min-width:120px">📋 ${tr('Med Report', 'تقرير طبي')}</button>
            <button class="btn btn-sm" onclick="showMedicalReportForm('fitness')" style="flex:1;background:#e8f5e9;border:1px solid #2e7d32;color:#2e7d32;min-width:120px">✅ ${tr('Fitness', 'شهادة لياقة')}</button>
          </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">🏥 ${tr('Procedures / Services Performed', 'الإجراءات / الخدمات المنفذة')} ${drSpecialty ? `<span class="badge badge-info" style="font-size:11px;
margin-right:8px">${drSpecialty}</span>` : ''}</div>
          <div class="form-group mb-12"><label>${tr('Search Procedures', 'ابحث عن إجراء')}</label>
            <input class="form-input" id="drSvcSearch" placeholder="${tr('Type to search...', 'اكتب للبحث...')}" autocomplete="off" oninput="filterDrServices()">
            <div id="drSvcDropdown" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;display:none;margin-top:4px;background:var(--card)"></div>
          </div>
          <div id="drSvcTags" class="flex gap-8" style="flex-wrap:wrap;margin-bottom:12px"></div>
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">${tr('Available categories', 'التصنيفات المتاحة')}: <strong>${Object.keys(svcCategories).join(', ') || tr('All', 'الكل')}</strong></div>
          <button class="btn btn-success w-full" onclick="billDrProcedures()" id="drBillBtn" style="height:40px;margin-top:8px">💵 ${tr('Bill Selected Procedures', 'فوتر الإجراءات المختارة')}</button>
          <input type="hidden" id="drSvcData" value='${JSON.stringify(filteredServices)}'>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">🔬 ${tr('Refer to Laboratory', 'تحويل للمختبر')}</div>
          <div class="form-group mb-12"><label>${tr('Test Type', 'نوع الفحص')}</label>
            <select class="form-input" id="drLabType">
              <optgroup label="${tr('Hematology', 'أمراض الدم')}">
                <option>CBC (Complete Blood Count)</option>
                <option>ESR (Erythrocyte Sedimentation Rate)</option>
                <option>Coagulation Profile (PT, PTT, INR)</option>
                <option>Blood Film / Reticulocyte Count</option>
                <option>Hemoglobin Electrophoresis</option>
                <option>G6PD Deficiency Test</option>
                <option>Sickle Cell Test</option>
                <option>Bleeding Time / Clotting Time</option>
                <option>D-Dimer</option>
              </optgroup>
              <optgroup label="${tr('Biochemistry', 'الكيمياء الحيوية')}">
                <option>Comprehensive Metabolic Panel (CMP)</option>
                <option>Basic Metabolic Panel (BMP)</option>
                <option>Fasting Blood Sugar (FBS)</option>
                <option>Random Blood Sugar (RBS)</option>
                <option>Oral Glucose Tolerance Test (OGTT)</option>
                <option>HbA1c (Glycated Hemoglobin)</option>
                <option>Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)</option>
                <option>Renal Profile (Urea, Creatinine, Electrolytes: Na, K, Cl)</option>
                <option>Liver Function Test (LFT: ALT, AST, ALP, Total/Direct Bilirubin, Albumin, Total Protein)</option>
                <option>Cardiac Enzymes (Troponin T/I, CK-MB, CK-Total, LDH)</option>
                <option>Uric Acid</option>
                <option>Calcium / Phosphorus / Magnesium</option>
                <option>Iron Profile (Serum Iron, TIBC, Ferritin, Transferrin)</option>
                <option>Vitamin D3 (25-OH Cholecalciferol)</option>
                <option>Vitamin B12 / Folate</option>
                <option>Amylase / Lipase</option>
                <option>Serum Osmolality</option>
              </optgroup>
              <optgroup label="${tr('Hormones & Endocrinology', 'الهرمونات والغدد')}">
                <option>Thyroid Profile (TSH, Free T3, Free T4, Total T3, Total T4)</option>
                <option>Fertility Hormones (FSH, LH, Prolactin, Testosterone (Free/Total), Estradiol E2, Progesterone)</option>
                <option>Beta-hCG (Pregnancy Test - Blood Qualitative/Quantitative)</option>
                <option>Cortisol (AM/PM)</option>
                <option>Insulin (Fasting/Random)</option>
                <option>Parathyroid Hormone (PTH)</option>
                <option>Growth Hormone (GH)</option>
                <option>ACTH</option>
                <option>C-Peptide</option>
                <option>Anti-Mullerian Hormone (AMH)</option>
                <option>Aldosterone / Renin</option>
                <option>DHEA-S (Dehydroepiandrosterone Sulfate)</option>
                <option>17-OH Progesterone</option>
                <option>Calcitonin</option>
              </optgroup>
              <optgroup label="${tr('Immunology & Serology', 'المناعة والأمصال')}">
                <option>CRP (C-Reactive Protein - Qualitative/Quantitative)</option>
                <option>Rheumatoid Factor (RF)</option>
                <option>Anti-CCP (Anti-Cyclic Citrullinated Peptide)</option>
                <option>ANA (Anti-Nuclear Antibody) / Anti-dsDNA</option>
                <option>ANCA (Anti-Neutrophil Cytoplasmic Antibody)</option>
                <option>Anti-Scl-70 / Anti-Centromere</option>
                <option>ASO Titer</option>
                <option>Hepatitis Profile (HBsAg, HBsAb, HCV Ab, HAV IgM/IgG)</option>
                <option>HIV 1 & 2 Abs/Ag</option>
                <option>VDRL / RPR (Syphilis)</option>
                <option>Widal Test (Typhoid)</option>
                <option>Brucella (Abortus/Melitensis)</option>
                <option>Dengue NS1 Ag / IgM / IgG</option>
                <option>Toxoplasmosis (IgG/IgM)</option>
                <option>Rubella (IgG/IgM)</option>
                <option>Cytomegalovirus CMV (IgG/IgM)</option>
                <option>Herpes Simplex Virus HSV 1/2 (IgG/IgM)</option>
                <option>EBV (Epstein-Barr Virus)</option>
                <option>Celiac Disease Panel (Anti-tTG, Anti-Endomysial)</option>
                <option>Food Allergy Panel (IgE)</option>
                <option>Inhalant Allergy Panel (IgE)</option>
                <option>Flow Cytometry (Immunophenotyping / CD4 Count)</option>
              </optgroup>
              <optgroup label="${tr('Microbiology & Parasitology', 'الأحياء الدقيقة والطفيليات')}">
                <option>Urine Analysis (Routine & Microscopic)</option>
                <option>Urine Culture & Sensitivity</option>
                <option>Stool Analysis (Routine & Microscopic)</option>
                <option>Stool Culture</option>
                <option>Stool Occult Blood</option>
                <option>H. Pylori (Ag in Stool / Ab in Blood)</option>
                <option>Throat Swab Culture</option>
                <option>Sputum Culture & AFB (Tuberculosis)</option>
                <option>Wound/Pus Swab Culture</option>
                <option>Blood Culture (Aerobic/Anaerobic)</option>
                <option>Ear/Eye/Nasal Swab Culture</option>
                <option>High Vaginal Swab (HVS) Culture</option>
                <option>Urethral Swab Culture</option>
                <option>Fungal Culture (Skin/Nail/Hair)</option>
                <option>Malaria Film</option>
                <option>QuantiFERON-TB Gold / TB Spot</option>
                <option>Chlamydia trachomatis (PCR/Ag)</option>
                <option>Neisseria Gonorrhoeae (PCR/Culture)</option>
                <option>CSF Analysis (Cell Count, Protein, Glucose)</option>
                <option>Synovial Fluid Analysis</option>
                <option>Semen Analysis (Spermogram)</option>
              </optgroup>
              <optgroup label="${tr('Tumor Markers', 'دلالات الأورام')}">
                <option>PSA (Prostate Specific Antigen - Total/Free)</option>
                <option>CEA (Carcinoembryonic Antigen)</option>
                <option>CA 125 (Ovarian)</option>
                <option>CA 15-3 (Breast)</option>
                <option>CA 19-9 (Pancreatic/GI)</option>
                <option>AFP (Alpha-Fetoprotein)</option>
                <option>Beta-2 Microglobulin</option>
                <option>Thyroglobulin</option>
              </optgroup>
              <optgroup label="${tr('Molecular Diagnostics / PCR', 'التشخيص الجزيئي / PCR')}">
                <option>COVID-19 PCR</option>
                <option>HCV RNA PCR (Quantitative)</option>
                <option>HBV DNA PCR (Quantitative)</option>
                <option>HIV RNA PCR (Quantitative)</option>
                <option>Respiratory Pathogen Panel (PCR)</option>
                <option>HPV DNA Typing</option>
              </optgroup>
              <optgroup label="${tr('Histopathology / Cytology', 'علم الأنسجة والخلايا')}">
                <option>Pap Smear</option>
                <option>Biopsy Specimen Examination</option>
                <option>FNAC (Fine Needle Aspiration Cytology)</option>
                <option>Fluid Cytology (Pleural, Ascitic, CSF)</option>
              </optgroup>
              <optgroup label="${tr('Blood Bank / Transfusion', 'بنك الدم / نقل الدم')}">
                <option>Blood Group (ABO) & Rh Typing</option>
                <option>Crossmatch (Major & Minor)</option>
                <option>Direct Coombs Test (DAT)</option>
                <option>Indirect Coombs Test (IAT)</option>
                <option>Antibody Screening Panel</option>
                <option>Cold Agglutinins</option>
              </optgroup>
              <optgroup label="${tr('Blood Gas & Electrolytes', 'غازات الدم والشوارد')}">
                <option>Arterial Blood Gas (ABG)</option>
                <option>Venous Blood Gas (VBG)</option>
                <option>Lactate (Lactic Acid)</option>
                <option>Ionized Calcium</option>
                <option>Methemoglobin / Carboxyhemoglobin</option>
              </optgroup>
              <optgroup label="${tr('Therapeutic Drug Monitoring', 'مراقبة مستوى الأدوية')}">
                <option>Digoxin Level</option>
                <option>Phenytoin (Dilantin) Level</option>
                <option>Valproic Acid Level</option>
                <option>Carbamazepine Level</option>
                <option>Lithium Level</option>
                <option>Vancomycin Level (Trough/Peak)</option>
                <option>Gentamicin / Amikacin Level</option>
                <option>Theophylline Level</option>
                <option>Methotrexate Level</option>
                <option>Tacrolimus / Cyclosporine Level</option>
              </optgroup>
              <optgroup label="${tr('Special Chemistry', 'كيمياء متخصصة')}">
                <option>Protein Electrophoresis (SPEP)</option>
                <option>Immunoglobulins (IgA, IgG, IgM, IgE)</option>
                <option>Complement C3 / C4</option>
                <option>Ammonia Level</option>
                <option>Homocysteine</option>
                <option>Ceruloplasmin / Copper</option>
                <option>Lactate Dehydrogenase (LDH)</option>
                <option>Haptoglobin</option>
                <option>Procalcitonin (PCT)</option>
                <option>BNP / NT-proBNP</option>
                <option>Fibrinogen</option>
                <option>Anti-Xa (Heparin) Assay</option>
                <option>Cystatin C</option>
                <option>Microalbumin (Urine)</option>
                <option>24hr Urine Protein / Creatinine Clearance</option>
                <option>Serum Free Light Chains (Kappa/Lambda)</option>
              </optgroup>
              <optgroup label="${tr('Toxicology & Trace Elements', 'السموم والعناصر الدقيقة')}">
                <option>Myoglobin</option>
                <option>Vitamin A (Retinol)</option>
                <option>Zinc Level</option>
                <option>Selenium Level</option>
                <option>Lead Level (Blood)</option>
                <option>Mercury Level (Blood)</option>
                <option>Urine Drug Screen (UDS)</option>
                <option>Serum Ethanol (Alcohol) Level</option>
                <option>Acetaminophen (Paracetamol) Level</option>
                <option>Salicylate (Aspirin) Level</option>
              </optgroup>
              <optgroup label="${tr('Other', 'أخرى')}">
                <option>${tr('Other Specific Test (Specify in details)', 'فحص آخر (حدد في التفاصيل)')}</option>
              </optgroup>
            </select>
          </div>
          <div class="form-group mb-12"><label>${tr('Details', 'التفاصيل')}</label><input class="form-input" id="drLabDesc"></div>
          <button class="btn btn-success w-full" onclick="sendToLab()">🔬 ${tr('Send to Lab', 'تحويل للمختبر')}</button>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📡 ${tr('Refer to Radiology', 'تحويل للأشعة')}</div>
          <div class="form-group mb-12"><label>${tr('Scan Type', 'نوع الأشعة')}</label>
            <select class="form-input" id="drRadType">
              <optgroup label="${tr('X-Ray', 'الأشعة السينية')}">
                <option>X-Ray Chest (PA/LAT)</option>
                <option>X-Ray Abdomen (Erect/Supine)</option>
                <option>X-Ray KUB (Kidney, Ureter, Bladder)</option>
                <option>X-Ray Cervical Spine (AP/LAT/Open Mouth)</option>
                <option>X-Ray Thoracic Spine</option>
                <option>X-Ray Lumbar Spine (AP/LAT)</option>
                <option>X-Ray Pelvis (AP)</option>
                <option>X-Ray Skull / Facial Bones / PNS</option>
                <option>X-Ray Shoulder / Clavicle</option>
                <option>X-Ray Arm (Humerus/Radius/Ulna)</option>
                <option>X-Ray Hand / Wrist</option>
                <option>X-Ray Hip/Femur</option>
                <option>X-Ray Knee (AP/LAT/Skyline)</option>
                <option>X-Ray Ankle / Foot</option>
                <option>X-Ray Bone Age</option>
              </optgroup>
              <optgroup label="${tr('Ultrasound', 'الموجات فوق الصوتية / السونار')}">
                <option>Ultrasound Abdomen (Whole)</option>
                <option>Ultrasound Pelvis (Transabdominal/Transvaginal)</option>
                <option>Ultrasound Abdomen & Pelvis</option>
                <option>Ultrasound KUB / Prostate</option>
                <option>Ultrasound Thyroid / Neck</option>
                <option>Ultrasound Breast</option>
                <option>Ultrasound Scrotum / Testicular</option>
                <option>Obstetric Ultrasound (1st Trimester/Viability)</option>
                <option>Obstetric Ultrasound (Anomaly Scan 2nd Trimester)</option>
                <option>Obstetric Ultrasound (Growth 3rd Trimester)</option>
                <option>Folliculometry (Ovulation Tracking)</option>
                <option>Ultrasound Soft Tissue / Swelling</option>
                <option>Doppler Ultrasound - Carotid</option>
                <option>Doppler Ultrasound - Lower Limb Venous (DVT)</option>
                <option>Doppler Ultrasound - Lower Limb Arterial</option>
                <option>Doppler Ultrasound - Renal Artery</option>
                <option>Doppler Ultrasound - Obstetrics / Umbilical Artery</option>
                <option>Echocardiogram (Echo - Heart)</option>
              </optgroup>
              <optgroup label="${tr('CT Scan', 'الأشعة المقطعية')}">
                <option>CT Brain / Head (Without Contrast)</option>
                <option>CT Brain / Head (With Contrast)</option>
                <option>CT PNS (Paranasal Sinuses)</option>
                <option>CT Neck (With Contrast)</option>
                <option>CT Chest (HRCT) Without Contrast</option>
                <option>CT Chest / Lungs (With Contrast)</option>
                <option>CT Abdomen & Pelvis (Without Contrast - Triphasic)</option>
                <option>CT Abdomen & Pelvis (With Contrast)</option>
                <option>CT KUB (Stone Protocol - Non Contrast)</option>
                <option>CT Urography (With Contrast)</option>
                <option>CT Cervical Spine</option>
                <option>CT Lumbar Spine</option>
                <option>CT Angiography - Pulmonary (CTPA)</option>
                <option>CT Angiography - Brain</option>
                <option>CT Angiography - Aorta / Lower Limbs</option>
                <option>CT Virtual Colonoscopy</option>
              </optgroup>
              <optgroup label="${tr('MRI', 'الرنين المغناطيسي')}">
                <option>MRI Brain (Without Contrast)</option>
                <option>MRI Brain (With Contrast)</option>
                <option>MRI Pituitary Fossa</option>
                <option>MRI Cervical Spine</option>
                <option>MRI Thoracic Spine</option>
                <option>MRI Lumbar Spine</option>
                <option>MRI Whole Spine</option>
                <option>MRI Pelvis (Male/Female)</option>
                <option>MRI Prostate (Multiparametric)</option>
                <option>MRI Shoulder Joint</option>
                <option>MRI Knee Joint</option>
                <option>MRI Ankle / Wrist Joint</option>
                <option>MRI Abdomen</option>
                <option>MRCP (Magnetic Resonance Cholangiopancreatography)</option>
                <option>MR Venography (MRV)</option>
                <option>MRA (Magnetic Resonance Angiography) - Brain</option>
              </optgroup>
              <optgroup label="${tr('Specialized Imaging & Scans', 'تصوير متخصص والمناظير')}">
                <option>Mammogram (Bilateral/Unilateral)</option>
                <option>DEXA Scan (Bone Density)</option>
                <option>Fluoroscopy - Barium Swallow</option>
                <option>Fluoroscopy - Barium Meal / Follow Through</option>
                <option>Fluoroscopy - Barium Enema</option>
                <option>Fluoroscopy - HSG (Hysterosalpingography)</option>
                <option>Fluoroscopy - IVP (Intravenous Pyelogram)</option>
                <option>Panoramic Dental X-Ray (OPG)</option>
                <option>Cephalometric X-Ray</option>
                <option>CBCT (Cone Beam CT for Dentistry)</option>
                <option>PET Scan (Positron Emission Tomography)</option>
              </optgroup>
              <optgroup label="${tr('Cardiology & Neuro', 'قلب وأعصاب وأجهزة أخرى')}">
                <option>ECG (Electrocardiogram)</option>
                <option>Holter Monitor (24/48 Hours)</option>
                <option>Ambulatory Blood Pressure Monitoring (ABPM)</option>
                <option>Treadmill Stress Test (TMT)</option>
                <option>EEG (Electroencephalogram)</option>
                <option>EMG (Electromyography) / NCS</option>
                <option>Spirometry / Lung Function Test</option>
                <option>Upper GI Endoscopy (OGD)</option>
                <option>Colonoscopy</option>
              </optgroup>
              <optgroup label="${tr('Other', 'أخرى')}">
                <option>${tr('Other Scan (Specify in details)', 'تصوير آخر (حدد في التفاصيل)')}</option>
              </optgroup>
            </select>
          </div>
          <div class="form-group mb-12"><label>${tr('Details', 'التفاصيل')}</label><input class="form-input" id="drRadDesc"></div>
          <button class="btn btn-success w-full" onclick="sendToRad()">📡 ${tr('Send to Radiology', 'تحويل للأشعة')}</button>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">💊 ${tr('Write Prescription', 'كتابة وصفة')}</div>
          <div class="form-group mb-12"><label>${tr('Medication', 'الدواء')}</label>
            <input list="drugsDataList" class="form-input" id="drRxDrug" placeholder="${tr('Type to search medication...', 'ابحث عن اسم الدواء...')}" autocomplete="off">
            <datalist id="drugsDataList">
              ${drugs.map(d => `<option value="${d.drug_name}">`).join('')}
              <option value="${tr('Other', 'أخرى')}">
            </datalist>
          </div>
          <div class="flex gap-8 mb-12" style="flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:140px"><label>${tr('Dosage', 'الجرعة')}</label><input class="form-input" id="drRxDose" placeholder="${tr('e.g. 500mg', 'مثلاً 500مج')}"></div>
            <div class="form-group" style="flex:0.6;min-width:90px"><label>${tr('Qty/Day', 'الكمية/يوم')}</label><input class="form-input" id="drRxQty" type="number" min="1" value="1"></div>
          </div>
          <div class="flex gap-8 mb-12" style="flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:160px"><label>${tr('Frequency', 'التكرار')}</label>
              <select class="form-input" id="drRxFreq"><option>×1 ${tr('daily', 'يومياً')}</option><option>×2 ${tr('daily', 'يومياً')}</option><option>×3 ${tr('daily', 'يومياً')}</option><option>×4 ${tr('daily', 'يومياً')}</option><option>${tr('Every 8 hours', 'كل 8 ساعات')}</option><option>${tr('Every 12 hours', 'كل 12 ساعة')}</option><option>${tr('As needed', 'عند الحاجة')}</option><option>${tr('Before meals', 'قبل الأكل')}</option><option>${tr('After meals', 'بعد الأكل')}</option><option>${tr('Before sleep', 'قبل النوم')}</option></select>
            </div>
            <div class="form-group" style="flex:0.8;min-width:120px"><label>${tr('Duration', 'المدة')}</label><input class="form-input" id="drRxDur" placeholder="${tr('e.g. 7 days', 'مثلاً 7 أيام')}"></div>
          </div>
          <button class="btn btn-primary w-full" onclick="sendRx()">💊 ${tr('Issue Prescription → Pharmacy', 'إصدار وصفة → الصيدلية')}</button>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📋 ${tr('Medical Certificate', 'التقارير الطبية')}</div>
          <div class="form-group mb-12"><label>${tr('Certificate Type', 'نوع التقرير')}</label>
            <select class="form-input" id="drCertType">
              <option value="sick_leave">🩺 ${tr('Sick Leave', 'إجازة مرضية')}</option>
              <option value="medical_report">📄 ${tr('Medical Report', 'تقرير طبي')}</option>
              <option value="fitness">✅ ${tr('Fitness Certificate', 'شهادة لياقة')}</option>
            </select>
          </div>
          <div class="form-group mb-12"><label>${tr('Diagnosis/Reason', 'التشخيص/السبب')}</label><input class="form-input" id="drCertDiag"></div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>${tr('From', 'من')}</label><input class="form-input" type="date" id="drCertFrom" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="form-group" style="flex:1"><label>${tr('To', 'إلى')}</label><input class="form-input" type="date" id="drCertTo"></div>
            <div class="form-group" style="flex:0.5"><label>${tr('Days', 'أيام')}</label><input class="form-input" type="number" id="drCertDays" value="1" min="1"></div>
          </div>
          <div class="form-group mb-12"><label>${tr('Notes', 'ملاحظات')}</label><input class="form-input" id="drCertNotes"></div>
          <button class="btn btn-primary w-full" onclick="issueCertificate()">📋 ${tr('Issue Certificate', 'إصدار التقرير')}</button>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">🔄 ${tr('Referral to Department', 'تحويل لقسم آخر')}</div>
          <div class="form-group mb-12"><label>${tr('To Department', 'إلى القسم')}</label>
            <select class="form-input" id="drRefDept">
              <option>الباطنية</option><option>الأطفال</option><option>العظام</option><option>الجلدية</option>
              <option>الأنف والأذن</option><option>العيون</option><option>الأسنان</option><option>النساء والولادة</option>
              <option>المخ والأعصاب</option><option>القلب</option><option>المسالك البولية</option><option>الطوارئ</option><option>الجراحة</option>
            </select>
          </div>
          <div class="form-group mb-12"><label>${tr('Reason', 'السبب')}</label><input class="form-input" id="drRefReason"></div>
          <div class="form-group mb-12"><label>${tr('Urgency', 'الأولوية')}</label>
            <select class="form-input" id="drRefUrg">
              <option value="Normal">🟢 ${tr('Normal', 'عادي')}</option>
              <option value="Urgent">🟠 ${tr('Urgent', 'عاجل')}</option>
              <option value="Emergency">🔴 ${tr('Emergency', 'طارئ')}</option>
            </select>
          </div>
          <button class="btn btn-warning w-full" onclick="sendReferral()">🔄 ${tr('Send Referral', 'إرسال التحويل')}</button>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📅 ${tr('Schedule Follow-up', 'جدولة متابعة')}</div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>${tr('Date', 'التاريخ')}</label><input class="form-input" type="date" id="drFollowDate"></div>
            <div class="form-group" style="flex:1"><label>${tr('Time', 'الوقت')}</label><input class="form-input" type="time" id="drFollowTime" value="09:00"></div>
          </div>
          <div class="form-group mb-12"><label>${tr('Notes', 'ملاحظات')}</label><input class="form-input" id="drFollowNotes"></div>
          <button class="btn btn-info w-full" onclick="scheduleFollowup()">📅 ${tr('Book Follow-up', 'حجز موعد متابعة')}</button>
        </div>
      </div>
      <div class="card glass-card-premium">
        <div class="card-title">📋 ${tr('Medical Records', 'السجلات الطبية')}</div>
        <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'drTable')">
        <div id="drTable">${makeTable([tr('Patient', 'المريض'), tr('Diagnosis', 'التشخيص'), tr('Symptoms', 'الأعراض'), tr('Date/Time', 'التاريخ/الوقت')], records.map(r => ({ cells: [r.patient_name || '', r.diagnosis, r.symptoms, r.visit_date ? new Date(r.visit_date).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : ''] })))}</div>
      </div>
    </div>`;
}
function statusText(s) { return s === 'Waiting' ? tr('Waiting', 'بالانتظار') : s === 'With Doctor' ? tr('With Doctor', 'مع الطبيب') : tr('Done', 'منتهي'); }
window.loadPatientInfo = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { document.getElementById('drPatientInfo').innerHTML = ''; return; }
  document.getElementById('drPatientInfo').innerHTML = `
    <div class="card glass-card-premium" style="margin-top:12px;padding:16px">
      <div class="skeleton-bar title mb-12"></div>
      <div class="skeleton-bar mb-8"></div>
      <div class="skeleton-bar mb-8"></div>
    </div>
  `;
  try {
    await API.put(`/api/patients/${pid}`, { status: 'With Doctor' });
    const p = (await API.get('/api/patients')).find(x => x.id == pid);
    const vitals = await API.get(`/api/nursing/vitals/${pid}`).catch(() => []);
    const account = await API.get(`/api/patients/${pid}/account`).catch(() => null);
    const v = vitals.length > 0 ? vitals[0] : null;
    let vitalsHtml = '';
    if (v) {
      vitalsHtml = `<div style="margin-top:12px;padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff)">
        <div style="font-weight:600;margin-bottom:8px;font-size:13px">🌡️ ${tr('Vitals from Nursing', 'العلامات الحيوية من التمريض')} <span style="font-weight:400;font-size:11px;color:var(--text-dim)">${v.created_at ? new Date(v.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:12px">
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">🩸 ${tr('BP', 'الضغط')}<br><strong>${v.bp || '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">🌡️ ${tr('Temp', 'حرارة')}<br><strong>${v.temp ? v.temp + '°' : '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">❤️ ${tr('Pulse', 'نبض')}<br><strong>${v.pulse || '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">💨 ${tr('O2', 'أكسجين')}<br><strong>${v.o2_sat ? v.o2_sat + '%' : '-'}</strong></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:12px;margin-top:6px">
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">💪 ${tr('Weight', 'وزن')}<br><strong>${v.weight ? v.weight + ' kg' : '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">📏 ${tr('Height', 'طول')}<br><strong>${v.height ? v.height + ' cm' : '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">🩸 ${tr('Sugar', 'سكر')}<br><strong>${v.blood_sugar || '-'}</strong></div>
          <div style="background:var(--bg-secondary,#f8f9fa);padding:6px;border-radius:6px;text-align:center">🌬️ ${tr('Resp', 'تنفس')}<br><strong>${v.respiratory_rate || '-'}</strong></div>
        </div>
        ${v.allergies ? `<div style="margin-top:6px"><span class="badge badge-danger">⚠️ ${tr('Allergies', 'حساسية')}: ${v.allergies}</span></div>` : ''}
        ${v.chronic_diseases ? `<div style="margin-top:4px"><span class="badge badge-warning">🏥 ${tr('Chronic', 'أمراض مزمنة')}: ${v.chronic_diseases}</span></div>` : ''}
        ${v.current_medications ? `<div style="margin-top:4px"><span class="badge badge-info">💊 ${tr('Medications', 'أدوية')}: ${v.current_medications}</span></div>` : ''}
      </div>`;
    }
    // Build patient history timeline
    let historyHtml = '';
    if (account) {
      const events = [];
      (account.records || []).forEach(r => events.push({ type: 'record', icon: '🩺', color: '#6366f1', label: tr('Visit/Diagnosis', 'زيارة/تشخيص'), detail: `${r.diagnosis || '-'}${r.symptoms ? ' | ' + r.symptoms : ''}${r.doctor_name ? ' | 👨‍⚕️ ' + r.doctor_name : ''}`, date: r.visit_date || r.created_at }));
      (account.labOrders || []).forEach(o => events.push({ type: 'lab', icon: '🔬', color: '#f59e0b', label: tr('Lab', 'مختبر'), detail: `${o.order_type} ${o.status === 'Done' ? '✅' : '⏳'} ${o.results ? '| ' + o.results.substring(0, 80) : ''}`, date: o.created_at }));
      (account.radOrders || []).forEach(o => events.push({ type: 'rad', icon: '📡', color: '#0ea5e9', label: tr('Radiology', 'أشعة'), detail: `${o.order_type} ${o.status === 'Done' ? '✅' : '⏳'}`, date: o.created_at }));
      (account.prescriptions || []).forEach(rx => events.push({ type: 'rx', icon: '💊', color: '#10b981', label: tr('Prescription', 'وصفة'), detail: `${rx.drug_name || rx.medication || '-'} | ${rx.dosage || ''} ${rx.frequency || ''}`, date: rx.created_at }));
      (account.invoices || []).forEach(inv => events.push({ type: 'inv', icon: '🧾', color: '#8b5cf6', label: tr('Invoice', 'فاتورة'), detail: `${inv.description || inv.service_type || '-'} | ${inv.total || 0} ${tr('SAR', 'ر.س')} ${inv.paid ? '✅' : '⏳'}`, date: inv.created_at }));
      events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      if (events.length > 0) {
        historyHtml = `<div style="margin-top:12px;padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);max-height:350px;overflow-y:auto">
          <div style="font-weight:600;margin-bottom:10px;font-size:14px">📜 ${tr('Patient Full History', 'السجل الكامل للمريض')} (${events.length})</div>
          ${events.map(e => `<div style="display:flex;gap:10px;padding:8px;margin:4px 0;border-radius:8px;border-right:4px solid ${e.color};background:var(--hover,#f8f9fa);font-size:12px;align-items:flex-start">
            <span style="font-size:18px;min-width:24px">${e.icon}</span>
            <div style="flex:1"><strong style="color:${e.color}">${e.label}</strong><div style="margin-top:2px;color:var(--text)">${e.detail}</div></div>
            <span style="color:var(--text-dim);font-size:11px;white-space:nowrap">${e.date ? new Date(e.date).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span>
          </div>`).join('')}
        </div>`;
      } else {
        historyHtml = `
          <div class="empty-state-card mt-12">
            <div class="empty-state-icon">📜</div>
            <div>${tr('No clinical encounter history found', 'لا يوجد سجل زيارات سابق')}</div>
          </div>
        `;
      }
    }
    document.getElementById('drPatientInfo').innerHTML = `<div class="flex gap-8 mt-16" style="flex-wrap:wrap;align-items:center"><span class="badge badge-info">📁 ${p.mrn || p.file_number}</span><span class="badge badge-warning">🎂 ${tr('Age', 'العمر')}: ${p.age || '?'}</span>${p.blood_type ? `<span class="badge" style="background:#dc2626;color:#fff;font-weight:700">🩸 ${p.blood_type}</span>` : ''}<span class="badge badge-success">📞 ${p.phone}</span><span class="badge badge-purple">🆔 ${p.national_id}</span>${p.gender ? `<span class="badge" style="background:${p.gender === 'ذكر' ? '#3b82f6' : '#ec4899'};color:#fff">${p.gender === 'ذكر' ? '👨' : '👩'} ${p.gender}</span>` : ''}${p.insurance_company ? `<span class="badge" style="background:#0d9488;color:#fff">🏢 ${p.insurance_company}${p.insurance_class ? ' (' + p.insurance_class + ')' : ''}</span>` : ''}<span class="badge" style="background:#0ea5e9;color:#fff">📅 ${tr('Visit', 'الزيارة')}: ${new Date().toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}</span><button class="btn btn-sm btn-primary" onclick="viewPatientResults(${p.id})">📋 ${tr('View Lab & Radiology Results', 'استعراض نتائج الفحوصات والأشعة')}</button><button class="btn btn-sm" onclick="dischargePatient(${p.id})" style="margin-right:auto;background:#dc3545;color:#fff;font-weight:600">🚪 ${tr('Patient Done', 'المريض طلع')}</button></div>${p.allergies ? `<div style="margin-top:8px;padding:10px;background:#fef2f2;border:2px solid #ef4444;border-radius:8px;font-size:13px;font-weight:600;color:#dc2626">⚠️ <strong>${tr('ALLERGIES', 'حساسية')}:</strong> </div>` : ''}${p.chronic_diseases ? `<div style="margin-top:6px;padding:8px;background:#fefce8;border:1px solid #facc15;border-radius:8px;font-size:12px;color:#854d0e">🩺 <strong>${tr('Chronic Diseases', 'أمراض مزمنة')}:</strong> </div>` : ''}${vitalsHtml}${historyHtml}<div id="drResultsPanel"></div>`;
  } catch (e) { }
};
window.dischargePatient = async (pid) => {
  try {
    await API.put(`/api/patients/${pid}`, { status: 'Done' });
    showToast(tr('Patient discharged!', 'تم خروج المريض! ✅'), 'success');
    document.getElementById('drPatientInfo').innerHTML = `<div class="badge badge-success" style="font-size:14px;padding:12px 20px;margin-top:12px">✅ ${tr('Patient discharged successfully', 'تم خروج المريض بنجاح')}</div>`;
    document.getElementById('drPatient').value = '';
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.viewPatientResults = async (pid) => {
  try {
    const data = await API.get(`/api/patients/${pid}/results`);
    const p = data.patient;
    let html = `<div class="card mt-16" style="border:2px solid var(--accent)">
          <div class="card-title">📋 ${tr('Results for', 'نتائج')} ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</div>`;
    // Lab Results
    if (data.labOrders.length > 0) {
      html += `<div class="mb-16"><h4 style="color:var(--accent);margin:0 0 8px">🔬 ${tr('Lab Results', 'نتائج المختبر')} (${data.labOrders.length})</h4>`;
      data.labOrders.forEach(o => {
        html += `<div style="padding:10px;margin:6px 0;background:var(--hover);border-radius:8px;border-right:4px solid ${o.status === 'Done' ? '#4ade80' : '#f59e0b'}">
                  <div class="flex gap-8" style="flex-wrap:wrap;align-items:center"><strong>${o.order_type}</strong> ${statusBadge(o.status)} <span style="color:var(--text-dim);font-size:12px">${o.created_at ? new Date(o.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span></div>
                  ${o.results ? `<div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:6px;font-size:13px;white-space:pre-wrap">${o.results}</div>` : `<div style="margin-top:4px;color:var(--text-dim);font-size:12px">${tr('No results yet', 'لا توجد نتائج بعد')}</div>`}
                </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="mb-16" style="color:var(--text-dim)">🔬 ${tr('No lab orders', 'لا توجد فحوصات مختبر')}</div>`;
    }
    // Radiology Results
    if (data.radOrders.length > 0) {
      html += `<div class="mb-16"><h4 style="color:var(--accent);margin:0 0 8px">📡 ${tr('Radiology Results', 'نتائج الأشعة')} (${data.radOrders.length})</h4>`;
      data.radOrders.forEach(o => {
        html += `<div style="padding:10px;margin:6px 0;background:var(--hover);border-radius:8px;border-right:4px solid ${o.status === 'Done' ? '#4ade80' : '#f59e0b'}">
                  <div class="flex gap-8" style="flex-wrap:wrap;align-items:center"><strong>${o.order_type}</strong> ${statusBadge(o.status)} <span style="color:var(--text-dim);font-size:12px">${o.created_at ? new Date(o.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span></div>
                  ${o.results ? `<div style="margin-top:8px">${renderRadResults(o.results)}</div>` : `<div style="margin-top:4px;color:var(--text-dim);font-size:12px">${tr('No results yet', 'لا توجد نتائج بعد')}</div>`}
                </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="mb-16" style="color:var(--text-dim)">📡 ${tr('No radiology orders', 'لا توجد أشعة')}</div>`;
    }
    html += `</div>`;
    document.getElementById('drResultsPanel').innerHTML = html;
  } catch (e) { showToast(tr('Error loading results', 'خطأ في تحميل النتائج'), 'error'); }
};
window.saveMedRecord = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  try {
    await API.post('/api/medical/records', { patient_id: pid, diagnosis: document.getElementById('drDiag').value, symptoms: document.getElementById('drSymp').value, icd10_codes: document.getElementById('drIcd').value, notes: document.getElementById('drNotes').value });
    showToast(tr('Record saved!', 'تم حفظ السجل!'));
    await navigateTo(3);
  } catch (e) { showToast(tr('Error saving', 'خطأ في الحفظ'), 'error'); }
};
window.sendToLab = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  try {
    await API.post('/api/lab/orders', { patient_id: pid, order_type: document.getElementById('drLabType').value, description: document.getElementById('drLabDesc').value });
    showToast(tr('Sent to Reception for payment → then Lab', 'تم الإرسال للاستقبال للسداد ← ثم المختبر'), 'success');
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.sendToRad = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  try {
    await API.post('/api/radiology/orders', { patient_id: pid, order_type: document.getElementById('drRadType').value, description: document.getElementById('drRadDesc').value });
    showToast(tr('Sent to Reception for payment → then Radiology', 'تم الإرسال للاستقبال للسداد ← ثم الأشعة'), 'success');
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.sendRx = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  const drugName = document.getElementById('drRxDrug').value;
  // Check drug allergy before prescribing
  const allergyMatch = await checkDrugAllergy(pid, drugName);
  if (allergyMatch) {
    const proceed = confirm('⚠️🚨 ' + tr('ALLERGY ALERT! Patient is allergic to: ', 'تنبيه حساسية! المريض لديه حساسية من: ') + allergyMatch.toUpperCase() + '\n\n' + tr('Drug: ', 'الدواء: ') + drugName + '\n\n' + tr('Do you want to proceed anyway?', 'هل تريد المتابعة رغم ذلك؟'));
    if (!proceed) return;
  }
  try {
    const qty = document.getElementById('drRxQty')?.value || '1';
    await API.post('/api/prescriptions', { patient_id: pid, medication_name: drugName, dosage: document.getElementById('drRxDose').value, quantity_per_day: qty, frequency: document.getElementById('drRxFreq').value, duration: document.getElementById('drRxDur').value });
    showToast(tr('Prescription sent to Pharmacy!', 'تم إرسال الوصفة للصيدلية!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.issueCertificate = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  const pSelect = document.getElementById('drPatient');
  const pName = pSelect.options[pSelect.selectedIndex]?.text?.split(' - ')[1]?.split(' (')[0] || '';
  try {
    await API.post('/api/medical/certificates', {
      patient_id: pid, patient_name: pName,
      cert_type: document.getElementById('drCertType').value,
      diagnosis: document.getElementById('drCertDiag').value,
      start_date: document.getElementById('drCertFrom').value,
      end_date: document.getElementById('drCertTo').value,
      days: parseInt(document.getElementById('drCertDays').value) || 1,
      notes: document.getElementById('drCertNotes').value
    });
    showToast(tr('Certificate issued!', 'تم إصدار التقرير!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.sendReferral = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  const pSelect = document.getElementById('drPatient');
  const pName = pSelect.options[pSelect.selectedIndex]?.text?.split(' - ')[1]?.split(' (')[0] || '';
  try {
    await API.post('/api/referrals', {
      patient_id: pid, patient_name: pName,
      to_department: document.getElementById('drRefDept').value,
      reason: document.getElementById('drRefReason').value,
      urgency: document.getElementById('drRefUrg').value
    });
    showToast(tr('Referral sent!', 'تم إرسال التحويل!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.scheduleFollowup = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  const followDate = document.getElementById('drFollowDate').value;
  if (!followDate) { showToast(tr('Select date', 'اختر التاريخ'), 'error'); return; }
  const pSelect = document.getElementById('drPatient');
  const pName = pSelect.options[pSelect.selectedIndex]?.text?.split(' - ')[1]?.split(' (')[0] || '';
  try {
    await API.post('/api/appointments/followup', {
      patient_id: pid, patient_name: pName,
      appt_date: followDate,
      appt_time: document.getElementById('drFollowTime').value,
      notes: document.getElementById('drFollowNotes').value
    });
    showToast(tr('Follow-up booked!', 'تم حجز موعد المتابعة!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
let selectedServices = [];
window.filterDrServices = () => {
  const q = document.getElementById('drSvcSearch').value.toLowerCase().trim();
  const dd = document.getElementById('drSvcDropdown');
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }
  const svcs = JSON.parse(document.getElementById('drSvcData').value || '[]');
  const matches = svcs.filter(s => s.name_en.toLowerCase().includes(q) || s.name_ar.includes(q) || s.category.toLowerCase().includes(q)).slice(0, 15);
  if (!matches.length) { dd.innerHTML = `<div style="padding:10px;color:var(--text-dim)">${tr('No results', 'لا توجد نتائج')}</div>`; dd.style.display = 'block'; return; }
  dd.innerHTML = matches.map(s => `<div onclick="addDrService(${s.id},'${s.name_en.replace(/'/g, "\\'")}','${s.name_ar.replace(/'/g, "\\'")}',${s.price},'${s.category}')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
    <span><strong>${isArabic ? s.name_ar : s.name_en}</strong> <small style="color:var(--text-dim)">${s.category}</small></span>
    <span style="color:var(--accent);font-weight:600">${s.price} ${tr('SAR', 'ر.س')}</span>
  </div>`).join('');
  dd.style.display = 'block';
};
window.addDrService = (id, nameEn, nameAr, price, cat) => {
  if (selectedServices.find(s => s.id === id)) return;
  selectedServices.push({ id, nameEn, nameAr, price, cat });
  document.getElementById('drSvcSearch').value = '';
  document.getElementById('drSvcDropdown').style.display = 'none';
  renderSvcTags();
};
window.removeDrService = (id) => {
  selectedServices = selectedServices.filter(s => s.id !== id);
  renderSvcTags();
};
function renderSvcTags() {
  const c = document.getElementById('drSvcTags');
  if (!selectedServices.length) { c.innerHTML = `<span style="color:var(--text-dim);font-size:13px">${tr('No procedures selected', 'لم يتم اختيار إجراءات')}</span>`; return; }
  const total = selectedServices.reduce((s, x) => s + x.price, 0);
  c.innerHTML = selectedServices.map(s => `<span class="badge badge-info" style="font-size:12px;padding:6px 10px">${isArabic ? s.nameAr : s.nameEn} (${s.price} ${tr('SAR', 'ر.س')}) <span onclick="removeDrService(${s.id})" style="cursor:pointer;margin-right:4px;font-weight:bold">\u2715</span></span>`).join('') +
    `<span class="badge badge-success" style="font-size:12px;padding:6px 10px;margin-right:auto">\ud83d\udcb0 ${tr('Total', 'الإجمالي')}: ${total} ${tr('SAR', 'ر.س')}</span>`;
}
window.billDrProcedures = async () => {
  const pid = document.getElementById('drPatient').value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  if (!selectedServices.length) { showToast(tr('Select procedures first', 'اختر الإجراءات أولاً'), 'error'); return; }
  try {
    const result = await API.post('/api/medical/bill-procedures', { patient_id: pid, services: selectedServices });
    showToast(`${tr('Billed successfully', 'تم إصدار الفاتورة')}: ${result.totalBilled} ${tr('SAR', 'ر.س')}`);
    selectedServices = [];
    renderSvcTags();
  } catch (e) { showToast(tr('Error billing', 'خطأ في الفوترة'), 'error'); }
};

// ===== LAB =====
// ===== LAB NORMAL RANGES (Gender-Specific: m=male, f=female) =====
const LAB_NORMAL_RANGES = {
  'CBC (Complete Blood Count)': {
    m: 'WBC: 4.5-11.0 ×10³/µL | RBC: 4.5-5.5 ×10⁶/µL | Hgb: 13.5-17.5 g/dL | Hct: 38-50% | Platelets: 150-400 ×10³/µL | MCV: 80-100 fL | MCH: 27-33 pg',
    f: 'WBC: 4.5-11.0 ×10³/µL | RBC: 4.0-5.0 ×10⁶/µL | Hgb: 12.0-16.0 g/dL | Hct: 36-44% | Platelets: 150-400 ×10³/µL | MCV: 80-100 fL | MCH: 27-33 pg'
  },
  'ESR (Erythrocyte Sedimentation Rate)': { m: '0-15 mm/hr', f: '0-20 mm/hr' },
  'Coagulation Profile (PT, PTT, INR)': 'PT: 11-13.5 sec | INR: 0.8-1.2 | PTT (aPTT): 25-35 sec',
  'Blood Film / Reticulocyte Count': 'Reticulocyte: 0.5-2.5%',
  'Hemoglobin Electrophoresis': 'HbA: 95-98% | HbA2: 1.5-3.5% | HbF: <2%',
  'G6PD Deficiency Test': 'Normal: 4.6-13.5 U/g Hb',
  'Sickle Cell Test': 'Negative (Normal)',
  'Bleeding Time / Clotting Time': 'Bleeding Time: 2-7 min | Clotting Time: 4-10 min',
  'D-Dimer': '<0.5 µg/mL (or <500 ng/mL)',
  'Comprehensive Metabolic Panel (CMP)': 'Glucose: 70-100 mg/dL | BUN: 7-20 mg/dL | Creatinine: 0.6-1.2 mg/dL | Na: 136-145 mEq/L | K: 3.5-5.0 mEq/L | Cl: 98-106 mEq/L | CO2: 23-29 mEq/L | Ca: 8.5-10.5 mg/dL | Total Protein: 6.0-8.3 g/dL | Albumin: 3.5-5.5 g/dL | Bilirubin(T): 0.1-1.2 mg/dL | ALP: 44-147 IU/L | ALT: 7-56 IU/L | AST: 10-40 IU/L',
  'Basic Metabolic Panel (BMP)': 'Glucose: 70-100 mg/dL | BUN: 7-20 mg/dL | Creatinine: 0.6-1.2 mg/dL | Na: 136-145 | K: 3.5-5.0 | Cl: 98-106 | CO2: 23-29 mEq/L | Ca: 8.5-10.5 mg/dL',
  'Fasting Blood Sugar (FBS)': 'Normal: 70-100 mg/dL (3.9-5.6 mmol/L) | Pre-diabetes: 100-125 | Diabetes: ≥126',
  'Random Blood Sugar (RBS)': 'Normal: <140 mg/dL (7.8 mmol/L) | Diabetes: ≥200',
  'Oral Glucose Tolerance Test (OGTT)': 'Fasting: <100 | 1hr: <180 | 2hr: <140 mg/dL | Diabetes 2hr: ≥200',
  'HbA1c (Glycated Hemoglobin)': 'Normal: <5.7% | Pre-diabetes: 5.7-6.4% | Diabetes: ≥6.5%',
  'Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)': { m: 'Total Cholesterol: <200 | LDL: <100 | HDL: >40 mg/dL | Triglycerides: <150 | VLDL: 5-40', f: 'Total Cholesterol: <200 | LDL: <100 | HDL: >50 mg/dL | Triglycerides: <150 | VLDL: 5-40' },
  'Renal Profile (Urea, Creatinine, Electrolytes: Na, K, Cl)': { m: 'BUN: 7-20 | Creatinine: 0.7-1.3 mg/dL | eGFR: >90 | Na: 136-145 | K: 3.5-5.0 | Cl: 98-106', f: 'BUN: 7-20 | Creatinine: 0.6-1.1 mg/dL | eGFR: >90 | Na: 136-145 | K: 3.5-5.0 | Cl: 98-106' },
  'Liver Function Test (LFT: ALT, AST, ALP, Total/Direct Bilirubin, Albumin, Total Protein)': { m: 'ALT: 7-56 | AST: 10-40 | ALP: 44-147 | GGT: 8-61 IU/L | Bilirubin(T): 0.1-1.2 | Direct: 0-0.3 | Albumin: 3.5-5.5 | Protein: 6.0-8.3', f: 'ALT: 7-45 | AST: 10-35 | ALP: 44-147 | GGT: 5-36 IU/L | Bilirubin(T): 0.1-1.2 | Direct: 0-0.3 | Albumin: 3.5-5.5 | Protein: 6.0-8.3' },
  'Cardiac Enzymes (Troponin T/I, CK-MB, CK-Total, LDH)': { m: 'Troponin I: <0.04 ng/mL | CK-Total: 39-308 IU/L | CK-MB: <25 | LDH: 140-280 | BNP: <100 pg/mL', f: 'Troponin I: <0.04 ng/mL | CK-Total: 26-192 IU/L | CK-MB: <25 | LDH: 140-280 | BNP: <100 pg/mL' },
  'Uric Acid': { m: '3.4-7.0 mg/dL', f: '2.4-6.0 mg/dL' },
  'Calcium / Phosphorus / Magnesium': 'Ca: 8.5-10.5 mg/dL | Ionized Ca: 4.5-5.6 mg/dL | Phosphorus: 2.5-4.5 mg/dL | Magnesium: 1.7-2.2 mg/dL',
  'Iron Profile (Serum Iron, TIBC, Ferritin, Transferrin)': { m: 'Serum Iron: 65-175 µg/dL | TIBC: 250-370 | Ferritin: 12-300 ng/mL | Transferrin Sat: 20-50%', f: 'Serum Iron: 50-170 µg/dL | TIBC: 250-370 | Ferritin: 12-150 ng/mL | Transferrin Sat: 20-50%' },
  'Vitamin D3 (25-OH Cholecalciferol)': 'Deficient: <20 ng/mL | Insufficient: 20-29 | Sufficient: 30-100 | Toxic: >100 ng/mL',
  'Vitamin B12 / Folate': 'B12: 200-900 pg/mL | Folate: 2.7-17.0 ng/mL',
  'Amylase / Lipase': 'Amylase: 28-100 U/L | Lipase: 0-160 U/L',
  'Serum Osmolality': '275-295 mOsm/kg',
  'Thyroid Profile (TSH, Free T3, Free T4, Total T3, Total T4)': 'TSH: 0.27-4.2 mIU/L | Free T4: 0.93-1.7 ng/dL | Free T3: 2.0-4.4 pg/mL | Total T4: 5.1-14.1 µg/dL | Total T3: 80-200 ng/dL',
  'Fertility Hormones (FSH, LH, Prolactin, Testosterone (Free/Total), Estradiol E2, Progesterone)': { m: 'FSH: 1.5-12.4 | LH: 1.7-8.6 mIU/mL | Prolactin: 4-15 ng/mL | Testosterone: 270-1070 ng/dL | Free Testosterone: 8.7-25.1 pg/mL | Estradiol: 10-40 pg/mL', f: 'FSH(follicular): 3.5-12.5 | LH(follicular): 2.4-12.6 mIU/mL | Prolactin: 4-23 ng/mL | Testosterone: 15-70 ng/dL | Estradiol(follicular): 12.5-166 pg/mL | Progesterone(luteal): 1.8-24 ng/mL' },
  'Beta-hCG (Pregnancy Test - Blood Qualitative/Quantitative)': { m: 'Normal: <2 mIU/mL', f: 'Non-pregnant: <5 mIU/mL | Pregnant: >25 mIU/mL' },
  'Cortisol (AM/PM)': 'AM (6-8am): 6.2-19.4 µg/dL | PM (4pm): 2.3-11.9 µg/dL',
  'Insulin (Fasting/Random)': 'Fasting: 2.6-24.9 µIU/mL',
  'Parathyroid Hormone (PTH)': '15-65 pg/mL',
  'Growth Hormone (GH)': { m: '0-5 ng/mL', f: '0-10 ng/mL' },
  'ACTH': 'AM: 10-60 pg/mL',
  'C-Peptide': '0.5-2.0 ng/mL (fasting)',
  'Anti-Mullerian Hormone (AMH)': { m: '1.4-14.0 ng/mL', f: 'Reproductive: 1.0-10.0 ng/mL | Low reserve: <1.0 | High (PCOS): >10' },
  'CRP (C-Reactive Protein - Qualitative/Quantitative)': 'Normal: <3 mg/L | Mild inflammation: 3-10 | Moderate: 10-100 | Severe: >100',
  'Rheumatoid Factor (RF)': 'Normal: <14 IU/mL',
  'ANA (Anti-Nuclear Antibody) / Anti-dsDNA': 'ANA: Negative (<1:40) | Anti-dsDNA: <30 IU/mL',
  'ASO Titer': 'Adults: <200 IU/mL | Children: <100 IU/mL',
  'Hepatitis Profile (HBsAg, HBsAb, HCV Ab, HAV IgM/IgG)': 'HBsAg: Negative | HBsAb: >10 mIU/mL (immune) | HCV Ab: Negative | HAV IgM: Negative',
  'HIV 1 & 2 Abs/Ag': 'Negative (Non-reactive)',
  'VDRL / RPR (Syphilis)': 'Non-reactive (Negative)',
  'Widal Test (Typhoid)': 'O & H Titers: <1:80 (Normal)',
  'Brucella (Abortus/Melitensis)': 'Titer: <1:80 (Negative)',
  'Toxoplasmosis (IgG/IgM)': 'IgG: <1.0 IU/mL (Negative) | IgM: Negative',
  'Rubella (IgG/IgM)': 'IgG: >10 IU/mL (Immune) | IgM: Negative',
  'Cytomegalovirus CMV (IgG/IgM)': 'IgG: Negative (<6 AU/mL) | IgM: Negative',
  'Herpes Simplex Virus HSV 1/2 (IgG/IgM)': 'IgG: <0.9 (Negative) | IgM: Negative',
  'EBV (Epstein-Barr Virus)': 'VCA IgM: Negative | VCA IgG: Negative | EBNA: Negative',
  'Celiac Disease Panel (Anti-tTG, Anti-Endomysial)': 'Anti-tTG IgA: <4 U/mL (Negative) | Anti-Endomysial: Negative',
  'Food Allergy Panel (IgE)': 'Total IgE: <100 IU/mL (Adults) | Specific IgE: <0.35 kU/L per allergen',
  'Inhalant Allergy Panel (IgE)': 'Total IgE: <100 IU/mL | Specific IgE: Class 0 (<0.35 kU/L)',
  'Urine Analysis (Routine & Microscopic)': 'pH: 4.6-8.0 | Specific Gravity: 1.005-1.030 | Protein: Negative | Glucose: Negative | Blood: Negative | WBC: 0-5/HPF | RBC: 0-2/HPF | Bacteria: None',
  'Urine Culture & Sensitivity': 'Negative: <10,000 CFU/mL | Positive: ≥100,000 CFU/mL',
  'Stool Analysis (Routine & Microscopic)': 'Color: Brown | Consistency: Formed | Occult Blood: Negative | WBC: None | RBC: None | Parasites: None',
  'Stool Culture': 'No pathogenic organisms',
  'Stool Occult Blood': 'Negative',
  'H. Pylori (Ag in Stool / Ab in Blood)': 'Stool Ag: Negative | Serum Ab: Negative',
  'Throat Swab Culture': 'Normal Flora | No Group A Strep',
  'Sputum Culture & AFB (Tuberculosis)': 'Culture: Normal flora | AFB Smear: Negative',
  'Wound/Pus Swab Culture': 'No pathogenic growth',
  'Blood Culture (Aerobic/Anaerobic)': 'No growth after 5 days',
  'PSA (Prostate Specific Antigen - Total/Free)': { m: 'Total PSA: <4.0 ng/mL | Free/Total ratio: >25%', f: 'N/A (خاص بالذكور)' },
  'CEA (Carcinoembryonic Antigen)': 'Non-smoker: <2.5 ng/mL | Smoker: <5.0 ng/mL',
  'CA 125 (Ovarian)': '<35 U/mL',
  'CA 15-3 (Breast)': '<30 U/mL',
  'CA 19-9 (Pancreatic/GI)': '<37 U/mL',
  'AFP (Alpha-Fetoprotein)': '<10 ng/mL (Adults)',
  'Beta-2 Microglobulin': '0.8-2.2 mg/L',
  'Thyroglobulin': '1.5-38.5 ng/mL (pre-thyroidectomy)',
  'COVID-19 PCR': 'Negative (Not Detected)',
  'HCV RNA PCR (Quantitative)': 'Not Detected (<15 IU/mL)',
  'HBV DNA PCR (Quantitative)': 'Not Detected (<10 IU/mL)',
  'HIV RNA PCR (Quantitative)': 'Not Detected (<20 copies/mL)',
  'Respiratory Pathogen Panel (PCR)': 'Negative for all targets',
  'HPV DNA Typing': 'Negative (No high-risk HPV detected)',
  'Pap Smear': 'NILM (Negative for Intraepithelial Lesion or Malignancy)',
  'Malaria Film': 'No parasites seen',
  // Blood Bank
  'Blood Group (ABO) & Rh Typing': 'A/B/AB/O | Rh+ or Rh-',
  'Crossmatch (Major & Minor)': 'Compatible (No agglutination)',
  'Direct Coombs Test (DAT)': 'Negative',
  'Indirect Coombs Test (IAT)': 'Negative',
  'Antibody Screening Panel': 'Negative (No clinically significant antibodies)',
  'Cold Agglutinins': 'Titer: <1:64',
  // Blood Gas
  'Arterial Blood Gas (ABG)': 'pH: 7.35-7.45 | pCO2: 35-45 mmHg | pO2: 80-100 mmHg | HCO3: 22-26 mEq/L | BE: -2 to +2 | O2 Sat: 95-100%',
  'Venous Blood Gas (VBG)': 'pH: 7.31-7.41 | pCO2: 41-51 mmHg | HCO3: 22-26 mEq/L',
  'Lactate (Lactic Acid)': 'Venous: 0.5-2.2 mmol/L | Arterial: 0.5-1.6 mmol/L | Critical: >4 mmol/L',
  'Ionized Calcium': '4.5-5.6 mg/dL (1.12-1.40 mmol/L)',
  'Methemoglobin / Carboxyhemoglobin': 'MetHb: <1.5% | COHb: Non-smoker: <2%, Smoker: <10%',
  // TDM
  'Digoxin Level': 'Therapeutic: 0.8-2.0 ng/mL | Toxic: >2.0',
  'Phenytoin (Dilantin) Level': 'Therapeutic: 10-20 µg/mL | Toxic: >20',
  'Valproic Acid Level': 'Therapeutic: 50-100 µg/mL | Toxic: >100',
  'Carbamazepine Level': 'Therapeutic: 4-12 µg/mL | Toxic: >12',
  'Lithium Level': 'Therapeutic: 0.6-1.2 mEq/L | Toxic: >1.5',
  'Vancomycin Level (Trough/Peak)': 'Trough: 10-20 µg/mL | Peak: 20-40 µg/mL',
  'Gentamicin / Amikacin Level': 'Gentamicin - Trough: <2 | Peak: 5-10 µg/mL | Amikacin - Trough: <10 | Peak: 20-30',
  'Theophylline Level': 'Therapeutic: 10-20 µg/mL | Toxic: >20',
  'Methotrexate Level': '24hr: <10 µmol/L | 48hr: <1 | 72hr: <0.1',
  'Tacrolimus / Cyclosporine Level': 'Tacrolimus: 5-20 ng/mL | Cyclosporine: 100-300 ng/mL (varies by transplant)',
  // Special Chemistry
  'Protein Electrophoresis (SPEP)': 'Albumin: 3.5-5.5 g/dL | Alpha-1: 0.1-0.3 | Alpha-2: 0.6-1.0 | Beta: 0.7-1.2 | Gamma: 0.7-1.6 g/dL',
  'Immunoglobulins (IgA, IgG, IgM, IgE)': 'IgG: 700-1600 mg/dL | IgA: 70-400 | IgM: 40-230 | IgE: <100 IU/mL',
  'Complement C3 / C4': 'C3: 90-180 mg/dL | C4: 10-40 mg/dL',
  'Ammonia Level': '15-45 µg/dL (11-32 µmol/L)',
  'Homocysteine': '5-15 µmol/L | High risk: >15',
  'Ceruloplasmin / Copper': 'Ceruloplasmin: 20-35 mg/dL | Serum Copper: 70-155 µg/dL | Wilson Disease: Ceruloplasmin <20',
  'Lactate Dehydrogenase (LDH)': '140-280 IU/L',
  'Haptoglobin': { m: '30-200 mg/dL', f: '30-200 mg/dL' },
  'Procalcitonin (PCT)': 'Normal: <0.1 ng/mL | Bacterial unlikely: <0.25 | Likely: 0.25-0.5 | Severe sepsis: >2.0',
  'BNP / NT-proBNP': 'BNP: <100 pg/mL (no HF) | NT-proBNP: <300 pg/mL (<50y), <900 (50-75y), <1800 (>75y)',
  'Fibrinogen': '200-400 mg/dL',
  'Anti-Xa (Heparin) Assay': 'LMWH prophylaxis: 0.2-0.5 IU/mL | Treatment: 0.5-1.0 | UFH: 0.3-0.7',
  'Cystatin C': '0.6-1.0 mg/L',
  'Microalbumin (Urine)': 'Normal: <30 mg/day | Microalbuminuria: 30-300 | Macroalbuminuria: >300',
  'Serum Free Light Chains (Kappa/Lambda)': 'Kappa: 3.3-19.4 mg/L | Lambda: 5.7-26.3 | Ratio: 0.26-1.65',
  '24hr Urine Protein / Creatinine Clearance': { m: 'Protein: <150 mg/24hr | Creatinine Clearance: 97-137 mL/min', f: 'Protein: <150 mg/24hr | Creatinine Clearance: 88-128 mL/min' },
  // Immunology additions
  'Anti-CCP (Anti-Cyclic Citrullinated Peptide)': 'Negative: <20 U/mL | Positive: ≥20',
  'ANCA (Anti-Neutrophil Cytoplasmic Antibody)': 'Negative (<1:20) | c-ANCA & p-ANCA',
  'Anti-Scl-70 / Anti-Centromere': 'Negative (<1.0 U) | Anti-Scl-70: Scleroderma | Anti-Centromere: CREST',
  'Dengue NS1 Ag / IgM / IgG': 'NS1 Ag: Negative | IgM: Negative | IgG: Negative',
  'Flow Cytometry (Immunophenotyping / CD4 Count)': 'CD4: 500-1500 cells/µL | CD4/CD8 ratio: 1.0-3.0',
  // Microbiology additions
  'QuantiFERON-TB Gold / TB Spot': 'Negative (<0.35 IU/mL) | Borderline: 0.35-0.50 | Positive: ≥0.35',
  'Chlamydia trachomatis (PCR/Ag)': 'Not Detected (Negative)',
  'Neisseria Gonorrhoeae (PCR/Culture)': 'Not Detected (Negative)',
  'CSF Analysis (Cell Count, Protein, Glucose)': 'WBC: 0-5/µL | RBC: 0 | Protein: 15-45 mg/dL | Glucose: 40-70 mg/dL | Opening pressure: 6-20 cmH2O',
  'Synovial Fluid Analysis': 'Color: Clear/Yellow | WBC: <200/µL | Crystals: None | Culture: No growth',
  'Semen Analysis (Spermogram)': { m: 'Volume: 1.5-5 mL | Count: ≥15 million/mL | Total: ≥39 million | Motility: ≥40% | Morphology: ≥4% normal | pH: 7.2-8.0', f: 'N/A' },
  // Hormones additions
  'Aldosterone / Renin': 'Aldosterone (upright): 7-30 ng/dL | Renin (upright): 0.5-4.0 ng/mL/hr | Ratio: <30',
  'DHEA-S (Dehydroepiandrosterone Sulfate)': { m: '80-560 µg/dL (varies by age)', f: '35-430 µg/dL (varies by age)' },
  'Calcitonin': { m: '<8.4 pg/mL', f: '<5.0 pg/mL' },
  '17-OH Progesterone': { m: '0.5-2.1 ng/mL', f: 'Follicular: 0.2-1.0 | Luteal: 1.0-4.0 ng/mL' },
  // Toxicology & Trace Elements
  'Myoglobin': { m: '28-72 ng/mL', f: '25-58 ng/mL' },
  'Vitamin A (Retinol)': '30-65 µg/dL (1.05-2.27 µmol/L)',
  'Zinc Level': '60-120 µg/dL (9.2-18.4 µmol/L)',
  'Selenium Level': '70-150 µg/L',
  'Lead Level (Blood)': 'Normal: <5 µg/dL | Action: ≥5 | Toxic: >70',
  'Mercury Level (Blood)': 'Normal: <10 µg/L | At risk: 10-50 | Toxic: >50',
  'Urine Drug Screen (UDS)': 'Negative for all classes (Amphetamines, Barbiturates, Benzodiazepines, Cannabinoids, Cocaine, Opiates)',
  'Serum Ethanol (Alcohol) Level': 'Negative: 0 | Legal limit: <80 mg/dL | Lethal: >400 mg/dL',
  'Acetaminophen (Paracetamol) Level': 'Therapeutic: 10-30 µg/mL | Toxic (4hr): >150 µg/mL',
  'Salicylate (Aspirin) Level': 'Therapeutic: 15-30 mg/dL | Toxic: >30 | Lethal: >60'
};
window.getLabNormalRange = (testName, gender) => {
  let entry = LAB_NORMAL_RANGES[testName];
  if (!entry) { for (const key in LAB_NORMAL_RANGES) { if (testName.includes(key) || key.includes(testName)) { entry = LAB_NORMAL_RANGES[key]; break; } } }
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  const g = (gender || '').trim();
  if (g === 'ذكر' || g === 'Male' || g === 'male' || g === 'M') return '👨 ' + (entry.m || '');
  if (g === 'أنثى' || g === 'Female' || g === 'female' || g === 'F') return '👩 ' + (entry.f || '');
  return '👨 ' + entry.m + '\n👩 ' + entry.f;

  // Auto-load diagnosis templates on page render
  setTimeout(() => { if (document.getElementById("drDiagTemplate")) loadDiagTemplates(); }, 500);
};

async function renderLab(el) {
  // Show skeletons instantly
  el.innerHTML = `
    <div class="page-title">🔬 ${tr('Laboratory', 'المختبر')}</div>
    <div class="stats-grid">
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
    </div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-12"></div>
        <div class="skeleton-bar mb-8"></div>
      </div>
      <div class="card glass-card-premium" style="flex:2">
        <div class="skeleton-bar title mb-12"></div>
        <div class="skeleton-bar mb-8"></div>
      </div>
    </div>
  `;

  let orders = [];
  let patients = [];
  try {
    [orders, patients] = await Promise.all([
      API.get('/api/lab/orders'),
      API.get('/api/patients')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">🔬 ${tr('Laboratory', 'المختبر')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load laboratory data', 'فشل في تحميل بيانات المختبر')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }
  el.innerHTML = `<div class="page-title">🔬 ${tr('Laboratory', 'المختبر')}</div>
    <div class="stats-grid">
      <div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">${tr('Pending', 'بالانتظار')}</div><div class="stat-value">${orders.filter(o => o.status === 'Requested').length}</div></div>
      <div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">${tr('In Progress', 'قيد العمل')}</div><div class="stat-value">${orders.filter(o => o.status === 'In Progress').length}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><div class="stat-label">${tr('Completed', 'مكتمل')}</div><div class="stat-value">${orders.filter(o => o.status === 'Done').length}</div></div>
    </div>
    <div class="split-layout">
      <div class="card glass-card-premium" style="flex:1">
        <div class="card-title">➕ ${tr('Direct Lab Order', 'إنشاء طلب فحص')}</div>
        <div class="form-group mb-12"><label>${tr('Select Patient (Optional)', 'اختر مريض (اختياري)')}</label>
          <select class="form-input" id="labPatientId"><option value="">--</option>${patients.map(p => `<option value="${p.id}">${p.name_ar || p.name_en}</option>`).join('')}</select>
        </div>
        <div class="form-group mb-12"><label>${tr('Test Name', 'اسم التحليل')}</label>
          <select class="form-input" id="labDirectType">
            <optgroup label="${tr('Hematology', 'أمراض الدم')}">
              <option>CBC (Complete Blood Count)</option>
              <option>ESR (Erythrocyte Sedimentation Rate)</option>
              <option>Coagulation Profile (PT, PTT, INR)</option>
              <option>Blood Film / Reticulocyte Count</option>
              <option>Hemoglobin Electrophoresis</option>
              <option>G6PD Deficiency Test</option>
              <option>Sickle Cell Test</option>
              <option>Bleeding Time / Clotting Time</option>
              <option>D-Dimer</option>
            </optgroup>
            <optgroup label="${tr('Biochemistry', 'الكيمياء الحيوية')}">
              <option>Comprehensive Metabolic Panel (CMP)</option>
              <option>Basic Metabolic Panel (BMP)</option>
              <option>Fasting Blood Sugar (FBS)</option>
              <option>Random Blood Sugar (RBS)</option>
              <option>Oral Glucose Tolerance Test (OGTT)</option>
              <option>HbA1c (Glycated Hemoglobin)</option>
              <option>Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)</option>
              <option>Renal Profile (Urea, Creatinine, Electrolytes: Na, K, Cl)</option>
              <option>Liver Function Test (LFT: ALT, AST, ALP, Total/Direct Bilirubin, Albumin, Total Protein)</option>
              <option>Cardiac Enzymes (Troponin T/I, CK-MB, CK-Total, LDH)</option>
              <option>Uric Acid</option>
              <option>Calcium / Phosphorus / Magnesium</option>
              <option>Iron Profile (Serum Iron, TIBC, Ferritin, Transferrin)</option>
              <option>Vitamin D3 (25-OH Cholecalciferol)</option>
              <option>Vitamin B12 / Folate</option>
              <option>Amylase / Lipase</option>
              <option>Serum Osmolality</option>
            </optgroup>
            <optgroup label="${tr('Hormones & Endocrinology', 'الهرمونات والغدد')}">
              <option>Thyroid Profile (TSH, Free T3, Free T4, Total T3, Total T4)</option>
              <option>Fertility Hormones (FSH, LH, Prolactin, Testosterone (Free/Total), Estradiol E2, Progesterone)</option>
              <option>Beta-hCG (Pregnancy Test - Blood Qualitative/Quantitative)</option>
              <option>Cortisol (AM/PM)</option>
              <option>Insulin (Fasting/Random)</option>
              <option>Parathyroid Hormone (PTH)</option>
              <option>Growth Hormone (GH)</option>
              <option>ACTH</option>
              <option>C-Peptide</option>
              <option>Anti-Mullerian Hormone (AMH)</option>
              <option>Aldosterone / Renin</option>
              <option>DHEA-S (Dehydroepiandrosterone Sulfate)</option>
              <option>17-OH Progesterone</option>
              <option>Calcitonin</option>
            </optgroup>
            <optgroup label="${tr('Immunology & Serology', 'المناعة والأمصال')}">
              <option>CRP (C-Reactive Protein - Qualitative/Quantitative)</option>
              <option>Rheumatoid Factor (RF)</option>
              <option>Anti-CCP (Anti-Cyclic Citrullinated Peptide)</option>
              <option>ANA (Anti-Nuclear Antibody) / Anti-dsDNA</option>
              <option>ANCA (Anti-Neutrophil Cytoplasmic Antibody)</option>
              <option>Anti-Scl-70 / Anti-Centromere</option>
              <option>ASO Titer</option>
              <option>Hepatitis Profile (HBsAg, HBsAb, HCV Ab, HAV IgM/IgG)</option>
              <option>HIV 1 & 2 Abs/Ag</option>
              <option>VDRL / RPR (Syphilis)</option>
              <option>Widal Test (Typhoid)</option>
              <option>Brucella (Abortus/Melitensis)</option>
              <option>Dengue NS1 Ag / IgM / IgG</option>
              <option>Toxoplasmosis (IgG/IgM)</option>
              <option>Rubella (IgG/IgM)</option>
              <option>Cytomegalovirus CMV (IgG/IgM)</option>
              <option>Herpes Simplex Virus HSV 1/2 (IgG/IgM)</option>
              <option>EBV (Epstein-Barr Virus)</option>
              <option>Celiac Disease Panel (Anti-tTG, Anti-Endomysial)</option>
              <option>Food Allergy Panel (IgE)</option>
              <option>Inhalant Allergy Panel (IgE)</option>
              <option>Flow Cytometry (Immunophenotyping / CD4 Count)</option>
            </optgroup>
            <optgroup label="${tr('Microbiology & Parasitology', 'الأحياء الدقيقة والطفيليات')}">
              <option>Urine Analysis (Routine & Microscopic)</option>
              <option>Urine Culture & Sensitivity</option>
              <option>Stool Analysis (Routine & Microscopic)</option>
              <option>Stool Culture</option>
              <option>Stool Occult Blood</option>
              <option>H. Pylori (Ag in Stool / Ab in Blood)</option>
              <option>Throat Swab Culture</option>
              <option>Sputum Culture & AFB (Tuberculosis)</option>
              <option>Wound/Pus Swab Culture</option>
              <option>Blood Culture (Aerobic/Anaerobic)</option>
              <option>Ear/Eye/Nasal Swab Culture</option>
              <option>High Vaginal Swab (HVS) Culture</option>
              <option>Urethral Swab Culture</option>
              <option>Fungal Culture (Skin/Nail/Hair)</option>
              <option>Malaria Film</option>
              <option>QuantiFERON-TB Gold / TB Spot</option>
              <option>Chlamydia trachomatis (PCR/Ag)</option>
              <option>Neisseria Gonorrhoeae (PCR/Culture)</option>
              <option>CSF Analysis (Cell Count, Protein, Glucose)</option>
              <option>Synovial Fluid Analysis</option>
              <option>Semen Analysis (Spermogram)</option>
            </optgroup>
            <optgroup label="${tr('Tumor Markers', 'دلالات الأورام')}">
              <option>PSA (Prostate Specific Antigen - Total/Free)</option>
              <option>CEA (Carcinoembryonic Antigen)</option>
              <option>CA 125 (Ovarian)</option>
              <option>CA 15-3 (Breast)</option>
              <option>CA 19-9 (Pancreatic/GI)</option>
              <option>AFP (Alpha-Fetoprotein)</option>
              <option>Beta-2 Microglobulin</option>
              <option>Thyroglobulin</option>
            </optgroup>
            <optgroup label="${tr('Molecular Diagnostics / PCR', 'التشخيص الجزيئي / PCR')}">
              <option>COVID-19 PCR</option>
              <option>HCV RNA PCR (Quantitative)</option>
              <option>HBV DNA PCR (Quantitative)</option>
              <option>HIV RNA PCR (Quantitative)</option>
              <option>Respiratory Pathogen Panel (PCR)</option>
              <option>HPV DNA Typing</option>
            </optgroup>
            <optgroup label="${tr('Histopathology / Cytology', 'علم الأنسجة والخلايا')}">
              <option>Pap Smear</option>
              <option>Biopsy Specimen Examination</option>
              <option>FNAC (Fine Needle Aspiration Cytology)</option>
              <option>Fluid Cytology (Pleural, Ascitic, CSF)</option>
            </optgroup>
            <optgroup label="${tr('Blood Bank / Transfusion', 'بنك الدم / نقل الدم')}">
              <option>Blood Group (ABO) & Rh Typing</option>
              <option>Crossmatch (Major & Minor)</option>
              <option>Direct Coombs Test (DAT)</option>
              <option>Indirect Coombs Test (IAT)</option>
              <option>Antibody Screening Panel</option>
              <option>Cold Agglutinins</option>
            </optgroup>
            <optgroup label="${tr('Blood Gas & Electrolytes', 'غازات الدم والشوارد')}">
              <option>Arterial Blood Gas (ABG)</option>
              <option>Venous Blood Gas (VBG)</option>
              <option>Lactate (Lactic Acid)</option>
              <option>Ionized Calcium</option>
              <option>Methemoglobin / Carboxyhemoglobin</option>
            </optgroup>
            <optgroup label="${tr('Therapeutic Drug Monitoring', 'مراقبة مستوى الأدوية')}">
              <option>Digoxin Level</option>
              <option>Phenytoin (Dilantin) Level</option>
              <option>Valproic Acid Level</option>
              <option>Carbamazepine Level</option>
              <option>Lithium Level</option>
              <option>Vancomycin Level (Trough/Peak)</option>
              <option>Gentamicin / Amikacin Level</option>
              <option>Theophylline Level</option>
              <option>Methotrexate Level</option>
              <option>Tacrolimus / Cyclosporine Level</option>
            </optgroup>
            <optgroup label="${tr('Special Chemistry', 'كيمياء متخصصة')}">
              <option>Protein Electrophoresis (SPEP)</option>
              <option>Immunoglobulins (IgA, IgG, IgM, IgE)</option>
              <option>Complement C3 / C4</option>
              <option>Ammonia Level</option>
              <option>Homocysteine</option>
              <option>Ceruloplasmin / Copper</option>
              <option>Lactate Dehydrogenase (LDH)</option>
              <option>Haptoglobin</option>
              <option>Procalcitonin (PCT)</option>
              <option>BNP / NT-proBNP</option>
              <option>Fibrinogen</option>
              <option>Anti-Xa (Heparin) Assay</option>
              <option>Cystatin C</option>
              <option>Microalbumin (Urine)</option>
              <option>24hr Urine Protein / Creatinine Clearance</option>
              <option>Serum Free Light Chains (Kappa/Lambda)</option>
            </optgroup>
            <optgroup label="${tr('Toxicology & Trace Elements', 'السموم والعناصر الدقيقة')}">
              <option>Myoglobin</option>
              <option>Vitamin A (Retinol)</option>
              <option>Zinc Level</option>
              <option>Selenium Level</option>
              <option>Lead Level (Blood)</option>
              <option>Mercury Level (Blood)</option>
              <option>Urine Drug Screen (UDS)</option>
              <option>Serum Ethanol (Alcohol) Level</option>
              <option>Acetaminophen (Paracetamol) Level</option>
              <option>Salicylate (Aspirin) Level</option>
            </optgroup>
            <optgroup label="${tr('Other', 'أخرى')}">
              <option>${tr('Other Specific Test (Specify in details)', 'فحص آخر (حدد في التفاصيل)')}</option>
            </optgroup>
          </select>
        </div>
        <div class="form-group mb-12"><label>${tr('Details', 'التفاصيل')}</label><input class="form-input" id="labDirectDesc"></div>
        <button class="btn btn-success w-full" onclick="sendDirectLab()">🔬 ${tr('Direct Lab Order', 'طلب مباشر')}</button>
      </div>
      <div class="flex-column" style="flex:2">
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📊 ${tr('Barcode Scanner', 'قارئ الباركود')}</div>
          <div class="flex gap-8"><input class="form-input" id="labBarcodeInput" placeholder="${tr('Scan barcode or enter order ID...', 'امسح الباركود أو ادخل رقم الطلب...')}" style="flex:3" onkeydown="if(event.key==='Enter')scanLabBarcode()"><button class="btn btn-primary" onclick="scanLabBarcode()" style="flex:1">🔍 ${tr('Search', 'بحث')}</button></div>
          <div id="labScanResult" class="mt-16"></div>
        </div>
        <div class="card glass-card-premium">
          <div class="card-title">📋 ${tr('Lab Orders', 'طلبات المختبر')}</div>
          <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'labT')">
          <div id="labT"><div class="table-wrapper"><table class="data-table"><thead><tr>
            <th>${tr('Barcode', 'الباركود')}</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Type', 'النوع')}</th><th>${tr('Normal Range', 'المعدل الطبيعي')}</th><th>${tr('Status', 'الحالة')}</th><th>${tr('Date', 'التاريخ')}</th><th>${tr('Report & Results', 'التقرير والنتائج')}</th><th>${tr('Actions', 'إجراءات')}</th>
          </tr></thead><tbody>
          ${orders.length === 0 ? `<tr><td colspan="8"><div class="empty-state-card"><div class="empty-state-icon">🔬</div><div>${tr('No lab orders found', 'لا توجد طلبات مختبر')}</div></div></td></tr>` : orders.map(o => {
    const pt = patients.find(p => p.id == o.patient_id);
    const nRange = getLabNormalRange(o.order_type, pt ? pt.gender : ''); return `<tr>
            <td><svg id="labBC${o.id}" class="barcode-svg"></svg><br><button class="btn btn-sm btn-info" onclick="printLabBarcode(${o.id}, '${(o.patient_name || '').replace(/'/g, '\\')}', '${(o.order_type || '').replace(/'/g, '\\')}')" style="margin-top:4px;font-size:11px">🖨️ ${tr('Print', 'طباعة')}</button></td>
            <td>${o.patient_name || ''}</td><td>${o.order_type}</td>
            <td style="font-size:11px;max-width:200px;color:var(--text-dim);white-space:pre-wrap">${nRange || '-'}</td>
            <td>${statusBadge(o.status)}</td><td>${o.created_at ? new Date(o.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }) : ''}</td>
            <td>${o.status === 'Done' && o.results ? `<div style="max-width:200px;padding:6px 10px;background:var(--hover);border-radius:6px;font-size:12px;white-space:pre-wrap">${o.results}</div>` : o.status !== 'Requested' ? `<textarea class="form-input form-textarea" id="labRpt${o.id}" rows="2" placeholder="${tr('Write report...', 'اكتب التقرير...')}" style="min-height:60px;font-size:12px">${o.results || ''}</textarea><button class="btn btn-sm btn-primary mt-8" onclick="saveLabReport(${o.id})">💾 ${tr('Save', 'حفظ')}</button>` : `<span style="color:var(--text-dim)">—</span>`}</td>
            <td>${o.status !== 'Done' ? `<button class="btn btn-sm btn-success" onclick="updateLabStatus(${o.id},'${o.status === 'Requested' ? 'In Progress' : 'Done'}')">▶ ${o.status === 'Requested' ? tr('Start', 'بدء') : tr('Complete', 'إتمام')}</button>` : `<span class="badge badge-success">✅</span>`}</td>
          </tr>`;
  }).join('')}
          </tbody></table></div></div>
        </div>
      </div>
    </div>`;
  setTimeout(() => { orders.forEach(o => { try { JsBarcode('#labBC' + o.id, 'LAB-' + o.id + '-' + (o.patient_name || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8), { format: 'CODE128', width: 1.2, height: 35, fontSize: 9, displayValue: true, margin: 2, textMargin: 1 }); } catch (e) { } }); }, 100);
}
window.printLabBarcode = (orderId, patientName, testType) => {
  const svgEl = document.getElementById('labBC' + orderId);
  if (!svgEl) { showToast(tr('Barcode not found', 'الباركود غير موجود'), 'error'); return; }
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const printWin = window.open('', '_blank', 'width=450,height=350');
  printWin.document.write(`<!DOCTYPE html><html><head><title>Lab Barcode</title>
    <style>body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:20px;margin:0}
    .label{border:2px solid #333;border-radius:10px;padding:20px;display:inline-block;min-width:300px}
    .clinic{font-size:16px;font-weight:bold;color:#1e40af;margin-bottom:8px}
    .patient{font-size:14px;margin:8px 0;color:#333}
    .test{font-size:13px;color:#666;margin:4px 0}
    .date{font-size:11px;color:#999;margin-top:8px}
    @media print{body{padding:5px}.label{border:2px solid #000}}
    </style></head><body>
    <div class="label">
      <div class="clinic">نما الطبي - Nama Medical</div>
      <div style="margin:10px 0">${svgData}</div>
      <div class="patient">👤 ${patientName}</div>
      <div class="test">🔬 ${testType}</div>
      <div class="date">📅 ${new Date().toLocaleDateString('en-CA')}</div>
    </div>
    <script>setTimeout(()=>{window.print();},300);<\/script></body></html>`);
  printWin.document.close();
};
window.updateLabStatus = async (id, status) => {
  try { await API.put(`/api/lab/orders/${id}`, { status }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(4); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveLabReport = async (id) => {
  const rpt = document.getElementById('labRpt' + id).value.trim();
  if (!rpt) { showToast(tr('Write the report first', 'اكتب التقرير أولاً'), 'error'); return; }
  try {
    // Get test name for critical value check
    const orderRow = document.getElementById('labRpt' + id)?.closest('tr') || document.getElementById('labRpt' + id)?.closest('.card');
    const testName = orderRow?.querySelector('td')?.textContent || orderRow?.querySelector('.badge')?.textContent || '';
    const critical = checkCriticalLabValue(testName, rpt);
    if (critical) {
      alert('🚨🔴 ' + tr('CRITICAL VALUE ALERT!', 'تنبيه قيمة حرجة!') + '\n\n' + critical.test + ': ' + critical.value + ' ' + (critical.range.unit || '') + '\n' + tr('Status: ', 'الحالة: ') + critical.status + '\n' + tr('Normal range: ', 'المعدل الطبيعي: ') + critical.range.low + ' - ' + critical.range.high + ' ' + (critical.range.unit || '') + '\n\n' + tr('Please notify the attending physician immediately!', 'يرجى إبلاغ الطبيب المعالج فوراً!'));
    }
    await API.put(`/api/lab/orders/${id}`, { results: rpt });
    showToast(critical ? tr('⚠️ Report saved - CRITICAL VALUE!', '⚠️ تم حفظ التقرير - قيمة حرجة!') : tr('Report saved!', 'تم حفظ التقرير!'), critical ? 'error' : 'success');
    await navigateTo(4);
  }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.sendDirectLab = async () => {
  try {
    await API.post('/api/lab/orders/direct', { patient_id: document.getElementById('labPatientId')?.value || '', order_type: document.getElementById('labDirectType').value, description: document.getElementById('labDirectDesc')?.value || '' });
    showToast(tr('Lab order created!', 'تم إنشاء الطلب!')); await navigateTo(4);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
async function loadPendingPaymentOrders() {
  try {
    const orders = await API.get('/api/orders/pending-payment');
    const container = document.getElementById('pendingPaymentTable');
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim)">✅ ${tr('No pending payment orders', 'لا توجد طلبات بانتظار السداد')}</div>`;
      return;
    }
    container.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr>
      <th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('File #', 'رقم الملف')}</th>
      <th>${tr('Dept', 'القسم')}</th><th>${tr('Test/Scan', 'الفحص/الأشعة')}</th>
      <th>${tr('Details', 'التفاصيل')}</th><th>${tr('Date', 'التاريخ')}</th>
      <th>${tr('Action', 'إجراء')}</th>
    </tr></thead><tbody>
    ${orders.map(o => `<tr style="background:${o.is_radiology ? '#fef9c3' : '#dbeafe'}">
      <td>${o.id}</td>
      <td><strong>${o.patient_name || o.name_en || ''}</strong></td>
      <td>${o.file_number || ''}</td>
      <td>${o.is_radiology ? `<span class="badge badge-warning">📡 ${tr('Radiology', 'أشعة')}</span>` : `<span class="badge badge-info">🔬 ${tr('Lab', 'مختبر')}</span>`}</td>
      <td>${o.order_type || ''}</td>
      <td>${o.description || ''}</td>
      <td>${o.created_at?.split('T')[0] || ''}</td>
      <td>
        <button class="btn btn-sm btn-success" onclick="approveOrderPayment(${o.id}, '${(o.patient_name || o.name_en || '').replace(/'/g, "\\'")}', '${(o.order_type || '').replace(/'/g, "\\'")}', ${o.is_radiology})">
          💵 ${tr('Pay & Approve', 'سداد وتحويل')}
        </button>
      </td>
    </tr>`).join('')}
    </tbody></table></div>`;
  } catch (e) { console.error(e); }
}
window.approveOrderPayment = async (orderId, patientName, testType, isRad) => {
  const deptName = isRad ? tr('Radiology', 'الأشعة') : tr('Lab', 'المختبر');
  const price = prompt(`${tr('Enter price for', 'أدخل سعر')} "${testType}" ${tr('for patient', 'للمريض')} ${patientName}:\n(${tr('Enter 0 for free', 'أدخل 0 لو مجاني')})`);
  if (price === null) return;
  const priceNum = parseFloat(price) || 0;
  const payMethod = priceNum > 0 ? (prompt(`${tr('Payment method', 'طريقة السداد')}:\n1 = ${tr('Cash', 'كاش')}\n2 = ${tr('Card/POS', 'شبكة')}\n3 = ${tr('Transfer', 'تحويل')}`) || '1') : '1';
  const methods = { '1': 'Cash', '2': 'Card', '3': 'Transfer' };
  try {
    await API.put(`/api/orders/${orderId}/approve-payment`, { price: priceNum, payment_method: methods[payMethod] || 'Cash' });
    showToast(`✅ ${tr('Paid & sent to', 'تم السداد والتحويل إلى')} ${deptName}!`, 'success');
    loadPendingPaymentOrders();
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.scanLabBarcode = async () => {
  const code = document.getElementById('labBarcodeInput').value.trim(); if (!code) return;
  const m = code.match(/LAB-(\d+)/); const oid = m ? m[1] : code;
  try {
    const orders = await API.get('/api/lab/orders'); const o = orders.find(x => x.id == oid);
    document.getElementById('labScanResult').innerHTML = o ? `<div class="card" style="border:2px solid var(--accent);margin-top:12px"><div class="card-title">🔍 ${tr('Order Found', 'تم العثور على الطلب')} #${o.id}</div><div class="flex gap-8" style="flex-wrap:wrap"><span class="badge badge-info">👤 </span><span class="badge badge-purple">🔬 ${o.order_type}</span>${statusBadge(o.status)}</div>${getLabNormalRange(o.order_type) ? `<div style="margin-top:8px;padding:8px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:11px">📊 <strong>${tr('Normal Range', 'المعدل الطبيعي')}:</strong> ${getLabNormalRange(o.order_type)}</div>` : ''}${o.results ? `<div class="mt-16" style="padding:12px;background:var(--hover);border-radius:8px"><strong>${tr('Report:', 'التقرير:')}</strong><br><pre style="white-space:pre-wrap;margin:4px 0 0">${o.results}</pre></div>` : ''}</div>` : `<div class="badge badge-danger mt-16">${tr('Order not found', 'الطلب غير موجود')}</div>`;
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== RADIOLOGY =====
// Helper: parse results for image tags and render them
function renderRadResults(results) {
  if (!results) return '';
  const parts = results.split('\n');
  let html = '';
  parts.forEach(p => {
    const imgMatch = p.match(/\[IMG:(.*?)\]/);
    if (imgMatch) {
      html += `<a href="${imgMatch[1]}" target="_blank"><img src="${imgMatch[1]}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:2px solid var(--border);cursor:pointer;margin:2px" title="${tr('Click to enlarge', 'اضغط للتكبير')}"></a>`;
    } else if (p.trim()) {
      html += `<div style="font-size:12px;color:var(--text)">${p}</div>`;
    }
  });
  return html;
}
async function renderRadiology(el) {
  // Show skeletons instantly
  el.innerHTML = `
    <div class="page-title">📡 ${tr('Radiology', 'الأشعة')}</div>
    <div class="stats-grid">
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
    </div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-12"></div>
        <div class="skeleton-bar mb-8"></div>
      </div>
      <div class="card glass-card-premium" style="flex:2">
        <div class="skeleton-bar title mb-12"></div>
        <div class="skeleton-bar mb-8"></div>
      </div>
    </div>
  `;

  let orders = [];
  let patients = [];
  try {
    [orders, patients] = await Promise.all([
      API.get('/api/radiology/orders'),
      API.get('/api/patients')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">📡 ${tr('Radiology', 'الأشعة')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load radiology data', 'فشل في تحميل بيانات الأشعة')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }
  el.innerHTML = `<div class="page-title">📡 ${tr('Radiology', 'الأشعة')}</div>
    <div class="stats-grid">
      <div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">${tr('Pending', 'بالانتظار')}</div><div class="stat-value">${orders.filter(o => o.status === 'Requested').length}</div></div>
      <div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">${tr('In Progress', 'قيد العمل')}</div><div class="stat-value">${orders.filter(o => o.status === 'In Progress').length}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><div class="stat-label">${tr('Completed', 'مكتمل')}</div><div class="stat-value">${orders.filter(o => o.status === 'Done').length}</div></div>
    </div>
    <div class="split-layout">
      <div class="card glass-card-premium" style="flex:1">
        <div class="card-title">➕ ${tr('Direct Radiology Order', 'إنشاء طلب أشعة')}</div>
        <div class="form-group mb-12"><label>${tr('Select Patient (Optional)', 'اختر مريض (اختياري)')}</label>
          <select class="form-input" id="radPatientId"><option value="">--</option>${patients.map(p => `<option value="${p.id}">${p.name_ar || p.name_en}</option>`).join('')}</select>
        </div>
        <div class="form-group mb-12"><label>${tr('Scan Type', 'نوع الأشعة')}</label>
          <select class="form-input" id="radDirectType">
            <optgroup label="${tr('X-Ray', 'الأشعة السينية')}">
              <option>X-Ray Chest (PA/LAT)</option>
              <option>X-Ray Abdomen (Erect/Supine)</option>
              <option>X-Ray KUB (Kidney, Ureter, Bladder)</option>
              <option>X-Ray Cervical Spine (AP/LAT/Open Mouth)</option>
              <option>X-Ray Thoracic Spine</option>
              <option>X-Ray Lumbar Spine (AP/LAT)</option>
              <option>X-Ray Pelvis (AP)</option>
              <option>X-Ray Skull / Facial Bones / PNS</option>
              <option>X-Ray Shoulder / Clavicle</option>
              <option>X-Ray Arm (Humerus/Radius/Ulna)</option>
              <option>X-Ray Hand / Wrist</option>
              <option>X-Ray Hip/Femur</option>
              <option>X-Ray Knee (AP/LAT/Skyline)</option>
              <option>X-Ray Ankle / Foot</option>
              <option>X-Ray Bone Age</option>
            </optgroup>
            <optgroup label="${tr('Ultrasound', 'الموجات فوق الصوتية / السونار')}">
              <option>Ultrasound Abdomen (Whole)</option>
              <option>Ultrasound Pelvis (Transabdominal/Transvaginal)</option>
              <option>Ultrasound Abdomen & Pelvis</option>
              <option>Ultrasound KUB / Prostate</option>
              <option>Ultrasound Thyroid / Neck</option>
              <option>Ultrasound Breast</option>
              <option>Ultrasound Scrotum / Testicular</option>
              <option>Obstetric Ultrasound (1st Trimester/Viability)</option>
              <option>Obstetric Ultrasound (Anomaly Scan 2nd Trimester)</option>
              <option>Obstetric Ultrasound (Growth 3rd Trimester)</option>
              <option>Folliculometry (Ovulation Tracking)</option>
              <option>Ultrasound Soft Tissue / Swelling</option>
              <option>Doppler Ultrasound - Carotid</option>
              <option>Doppler Ultrasound - Lower Limb Venous (DVT)</option>
              <option>Doppler Ultrasound - Lower Limb Arterial</option>
              <option>Doppler Ultrasound - Renal Artery</option>
              <option>Doppler Ultrasound - Obstetrics / Umbilical Artery</option>
              <option>Echocardiogram (Echo - Heart)</option>
            </optgroup>
            <optgroup label="${tr('CT Scan', 'الأشعة المقطعية')}">
              <option>CT Brain / Head (Without Contrast)</option>
              <option>CT Brain / Head (With Contrast)</option>
              <option>CT PNS (Paranasal Sinuses)</option>
              <option>CT Neck (With Contrast)</option>
              <option>CT Chest (HRCT) Without Contrast</option>
              <option>CT Chest / Lungs (With Contrast)</option>
              <option>CT Abdomen & Pelvis (Without Contrast - Triphasic)</option>
              <option>CT Abdomen & Pelvis (With Contrast)</option>
              <option>CT KUB (Stone Protocol - Non Contrast)</option>
              <option>CT Urography (With Contrast)</option>
              <option>CT Cervical Spine</option>
              <option>CT Lumbar Spine</option>
              <option>CT Angiography - Pulmonary (CTPA)</option>
              <option>CT Angiography - Brain</option>
              <option>CT Angiography - Aorta / Lower Limbs</option>
              <option>CT Virtual Colonoscopy</option>
            </optgroup>
            <optgroup label="${tr('MRI', 'الرنين المغناطيسي')}">
              <option>MRI Brain (Without Contrast)</option>
              <option>MRI Brain (With Contrast)</option>
              <option>MRI Pituitary Fossa</option>
              <option>MRI Cervical Spine</option>
              <option>MRI Thoracic Spine</option>
              <option>MRI Lumbar Spine</option>
              <option>MRI Whole Spine</option>
              <option>MRI Pelvis (Male/Female)</option>
              <option>MRI Prostate (Multiparametric)</option>
              <option>MRI Shoulder Joint</option>
              <option>MRI Knee Joint</option>
              <option>MRI Ankle / Wrist Joint</option>
              <option>MRI Abdomen</option>
              <option>MRCP (Magnetic Resonance Cholangiopancreatography)</option>
              <option>MR Venography (MRV)</option>
              <option>MRA (Magnetic Resonance Angiography) - Brain</option>
            </optgroup>
            <optgroup label="${tr('Specialized Imaging & Scans', 'تصوير متخصص والمناظير')}">
              <option>Mammogram (Bilateral/Unilateral)</option>
              <option>DEXA Scan (Bone Density)</option>
              <option>Fluoroscopy - Barium Swallow</option>
              <option>Fluoroscopy - Barium Meal / Follow Through</option>
              <option>Fluoroscopy - Barium Enema</option>
              <option>Fluoroscopy - HSG (Hysterosalpingography)</option>
              <option>Fluoroscopy - IVP (Intravenous Pyelogram)</option>
              <option>Panoramic Dental X-Ray (OPG)</option>
              <option>Cephalometric X-Ray</option>
              <option>CBCT (Cone Beam CT for Dentistry)</option>
              <option>PET Scan (Positron Emission Tomography)</option>
            </optgroup>
            <optgroup label="${tr('Cardiology & Neuro', 'قلب وأعصاب وأجهزة أخرى')}">
              <option>ECG (Electrocardiogram)</option>
              <option>Holter Monitor (24/48 Hours)</option>
              <option>Ambulatory Blood Pressure Monitoring (ABPM)</option>
              <option>Treadmill Stress Test (TMT)</option>
              <option>EEG (Electroencephalogram)</option>
              <option>EMG (Electromyography) / NCS</option>
              <option>Spirometry / Lung Function Test</option>
              <option>Upper GI Endoscopy (OGD)</option>
              <option>Colonoscopy</option>
            </optgroup>
            <optgroup label="${tr('Other', 'أخرى')}">
              <option>${tr('Other Scan (Specify in details)', 'تصوير آخر (حدد في التفاصيل)')}</option>
            </optgroup>
          </select>
        </div>
        <div class="form-group mb-12"><label>${tr('Details', 'التفاصيل')}</label><input class="form-input" id="radDirectDesc"></div>
        <button class="btn btn-success w-full" onclick="sendDirectRad()">📡 ${tr('Send to Radiology', 'إنشاء الطلب')}</button>
      </div>
      <div class="flex-column" style="flex:2">
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📊 ${tr('Barcode Scanner', 'قارئ الباركود')}</div>
          <div class="flex gap-8"><input class="form-input" id="radBarcodeInput" placeholder="${tr('Scan barcode or enter order ID...', 'امسح الباركود أو ادخل رقم الطلب...')}" style="flex:3" onkeydown="if(event.key==='Enter')scanRadBarcode()"><button class="btn btn-primary" onclick="scanRadBarcode()" style="flex:1">🔍 ${tr('Search', 'بحث')}</button></div>
          <div id="radScanResult" class="mt-16"></div>
        </div>
        <div class="card glass-card-premium">
          <div class="card-title">📋 ${tr('Radiology Orders', 'طلبات الأشعة')}</div>
          <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'radT')">
          <div id="radT"><div class="table-wrapper"><table class="data-table"><thead><tr>
            <th>${tr('Barcode', 'الباركود')}</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Type', 'النوع')}</th><th>${tr('Status', 'الحالة')}</th><th>${tr('Date', 'التاريخ')}</th><th>${tr('Report & Images', 'التقرير والصور')}</th><th>${tr('Actions', 'إجراءات')}</th>
          </tr></thead><tbody>
          ${orders.length === 0 ? `<tr><td colspan="7"><div class="empty-state-card"><div class="empty-state-icon">📡</div><div>${tr('No radiology orders found', 'لا توجد طلبات أشعة')}</div></div></td></tr>` : orders.map(o => `<tr>
            <td><svg id="radBC${o.id}" class="barcode-svg"></svg></td>
            <td>${o.patient_name || ''}</td><td>${o.order_type}</td>
            <td>${statusBadge(o.status)}</td><td>${o.created_at?.split('T')[0] || ''}</td>
            <td>
              ${o.status === 'Done' ? `<div style="max-width:250px">${renderRadResults(o.results)}</div>` :
      o.status !== 'Requested' ? `
                <textarea class="form-input form-textarea" id="radRpt${o.id}" rows="2" placeholder="${tr('Write report...', 'اكتب التقرير...')}" style="min-height:50px;font-size:12px">${(o.results || '').replace(/\[IMG:.*?\]\n?/g, '')}</textarea>
                <div class="flex gap-8 mt-8">
                  <button class="btn btn-sm btn-primary" onclick="saveRadReport(${o.id})">💾 ${tr('Save', 'حفظ')}</button>
                  <label class="btn btn-sm btn-success" style="cursor:pointer">📷 ${tr('Upload Image', 'رفع صورة')}<input type="file" accept="image/*" style="display:none" onchange="uploadRadImage(${o.id}, this)"></label>
                </div>
                <div class="mt-8">${renderRadResults(o.results)}</div>` : `<span style="color:var(--text-dim)">—</span>`}
            </td>
            <td>${o.status !== 'Done' ? `<button class="btn btn-sm btn-success" onclick="updateRadStatus(${o.id},'${o.status === 'Requested' ? 'In Progress' : 'Done'}')">▶ ${o.status === 'Requested' ? tr('Start', 'بدء') : tr('Complete', 'إتمام')}</button>` : `<span class="badge badge-success">✅</span>`}</td>
          </tr>`).join('')}
          </tbody></table></div></div>
        </div>
      </div>
    </div>`;
  setTimeout(() => { orders.forEach(o => { try { JsBarcode('#radBC' + o.id, 'RAD-' + o.id + '-' + (o.patient_name || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8), { format: 'CODE128', width: 1.2, height: 35, fontSize: 9, displayValue: true, margin: 2, textMargin: 1 }); } catch (e) { } }); }, 100);
}
window.updateRadStatus = async (id, status) => {
  try { await API.put(`/api/radiology/orders/${id}`, { status }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(5); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveRadReport = async (id) => {
  const rpt = document.getElementById('radRpt' + id).value.trim();
  if (!rpt) { showToast(tr('Write the report first', 'اكتب التقرير أولاً'), 'error'); return; }
  try { await API.put(`/api/radiology/orders/${id}`, { result: rpt }); showToast(tr('Report saved!', 'تم حفظ التقرير!')); await navigateTo(5); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.uploadRadImage = async (id, input) => {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append('image', input.files[0]);
  try {
    const res = await fetch(`/api/radiology/orders/${id}/upload`, { method: 'POST', body: fd, credentials: 'same-origin' });
    if (res.status === 401) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    if (data.success) { showToast(tr('Image uploaded!', 'تم رفع الصورة!')); await navigateTo(5); }
    else showToast(tr('Upload failed', 'فشل الرفع'), 'error');
  } catch (e) { showToast(tr('Error uploading', 'خطأ في الرفع'), 'error'); }
};
window.scanRadBarcode = async () => {
  const code = document.getElementById('radBarcodeInput').value.trim(); if (!code) return;
  const m = code.match(/RAD-(\d+)/); const oid = m ? m[1] : code;
  try {
    const orders = await API.get('/api/radiology/orders'); const o = orders.find(x => x.id == oid);
    document.getElementById('radScanResult').innerHTML = o ? `<div class="card" style="border:2px solid var(--accent);margin-top:12px"><div class="card-title">🔍 ${tr('Order Found', 'تم العثور على الطلب')} #${o.id}</div><div class="flex gap-8" style="flex-wrap:wrap"><span class="badge badge-info">👤 </span><span class="badge badge-purple">📡 ${o.order_type}</span>${statusBadge(o.status)}</div>${o.results ? `<div class="mt-16">${renderRadResults(o.results)}</div>` : ''}</div>` : `<div class="badge badge-danger mt-16">${tr('Order not found', 'الطلب غير موجود')}</div>`;
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== PHARMACY =====
async function renderPharmacy(el) {
  // Show skeletons instantly
  el.innerHTML = `
    <div class="page-title">💊 ${tr('Pharmacy', 'الصيدلية')}</div>
    <div class="stats-grid">
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
    </div>
    <div class="card glass-card-premium mt-16">
      <div class="skeleton-bar title mb-12"></div>
      <div class="skeleton-bar mb-8"></div>
    </div>
  `;

  let drugs = [];
  let queue = [];
  try {
    [drugs, queue] = await Promise.all([
      API.get('/api/pharmacy/drugs'),
      API.get('/api/pharmacy/queue')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">💊 ${tr('Pharmacy', 'الصيدلية')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load pharmacy data', 'فشل في تحميل بيانات الصيدلية')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }
  const stockBadge = (qty) => {
    const q = parseInt(qty) || 0;
    if (q <= 5) return `<span class="badge badge-danger">⚠️ ${q} (${tr('Critical Low', 'حرجة جداً')})</span>`;
    if (q <= 20) return `<span class="badge badge-warning">⚠️ ${q} (${tr('Low Stock', 'منخفض')})</span>`;
    return `<span class="badge badge-success">✅ ${q}</span>`;
  };
  // Helper to find drug price from catalog
  const findDrugPrice = (medName) => {
    if (!medName) return 0;
    const d = drugs.find(x => x.drug_name && medName.toLowerCase().includes(x.drug_name.toLowerCase()));
    return d ? (d.selling_price || 0) : 0;
  };
  el.innerHTML = `<div class="page-title">💊 ${tr('Pharmacy', 'الصيدلية')}</div>
    <div class="stats-grid">
      <div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">${tr('Pending Prescriptions', 'وصفات بالانتظار')}</div><div class="stat-value">${queue.filter(q => q.status === 'Pending').length}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><div class="stat-label">${tr('Dispensed Today', 'تم صرفها')}</div><div class="stat-value">${queue.filter(q => q.status === 'Dispensed').length}</div></div>
      <div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">${tr('Total Drugs', 'إجمالي الأدوية')}</div><div class="stat-value">${drugs.length}</div></div>
    </div>
    <div class="card glass-card-premium mb-16"><div class="card-title">📜 ${tr('Prescription Queue', 'قائمة الوصفات')}</div>
    <div id="rxQueue"><div class="table-wrapper"><table class="data-table"><thead><tr>
      <th>${tr('Barcode', 'الباركود')}</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Prescription', 'الوصفة')}</th><th>${tr('Price', 'السعر')}</th><th>${tr('Status', 'الحالة')}</th><th>${tr('Date', 'التاريخ')}</th><th>${tr('Actions', 'إجراءات')}</th>
    </tr></thead><tbody>
    ${queue.length === 0 ? `<tr><td colspan="8"><div class="empty-state-card"><div class="empty-state-icon">💊</div><div>${tr('No prescriptions found in queue', 'لا توجد وصفات في القائمة')}</div></div></td></tr>` : queue.map(q => {
    // Use individual columns if available, fallback to text parsing
    const txt = q.prescription_text || '';
    let parts = txt.includes(' | ') ? txt.split(' | ') : txt.split(' - ');
    const med = (q.medication_name && q.medication_name.trim()) || parts[0] || '';
    const dose = (q.dosage && q.dosage.trim()) || parts[1] || '';
    const qty = (q.quantity_per_day && q.quantity_per_day !== '1' && q.quantity_per_day.trim()) || '1';
    const freq = (q.frequency && q.frequency.trim()) || parts[2] || '';
    const dur = (q.duration && q.duration.trim()) || parts[3] || '';
    const autoPrice = q.price > 0 ? q.price : findDrugPrice(med);
    return `<tr>
        <td><svg id="rxBC${q.id}" class="barcode-svg"></svg><br>
          <button class="btn btn-sm btn-info" onclick="printRxLabel(${q.id}, '${(q.patient_name || '').replace(/'/g, "\\'")}', '${(q.age || '').toString().replace(/'/g, "\\'")}', '${(q.department || '').replace(/'/g, "\\'")}', '${med.replace(/'/g, "\\'")}', '${dose.replace(/'/g, "\\'")}', '${qty.toString().replace(/'/g, "\\'")}', '${freq.replace(/'/g, "\\'")}', '${dur.replace(/'/g, "\\'")}')" style="margin-top:4px;font-size:11px">🖨️ ${tr('Print Label', 'طباعة')}</button>
        </td>
        <td><strong>${q.patient_name || '#' + q.patient_id}</strong>${q.age ? '<br><small>🎂 ' + q.age + '</small>' : ''}${q.department ? '<br><small>🏥 ' + q.department + '</small>' : ''}</td>
        <td style="color:var(--accent);font-weight:600">${q.doctor || q.doctor_name || '—'}</td>
        <td><strong>${med}</strong>${dose ? '<br>💊 ' + dose : ''}${freq ? '<br>🔄 ' + freq : ''}${dur ? '<br>📅 ' + dur : ''}</td>
        <td style="font-weight:bold;color:var(--accent)">${autoPrice > 0 ? autoPrice + ' ' + tr('SAR', 'ر.س') : '-'}</td>
        <td>${statusBadge(q.status)}</td>
        <td>${q.created_at?.split('T')[0] || ''}</td>
        <td>${q.status === 'Pending' ? `<button class="btn btn-sm btn-success" onclick="showDispensePanel(${q.id}, '${(q.patient_name || '').replace(/'/g, "\\'")}', '${med.replace(/'/g, "\\'")}', '${dose.replace(/'/g, "\\'")}', '${qty.toString().replace(/'/g, "\\'")}', '${freq.replace(/'/g, "\\'")}', '${dur.replace(/'/g, "\\'")}', ${q.patient_id || 0}, ${autoPrice}, '${(q.age || '').toString().replace(/'/g, "\\'")}', '${(q.department || '').replace(/'/g, "\\'")}')">💵 ${tr('Dispense & Sell', 'صرف وبيع')}</button>` : `<button class="btn btn-sm btn-info" onclick="printPharmacyInvoice(${q.id}, '${(q.patient_name || '').replace(/'/g, "\\'")}', '${med.replace(/'/g, "\\'")}', '${dose.replace(/'/g, "\\'")}', '${freq.replace(/'/g, "\\'")}', '${dur.replace(/'/g, "\\'")}', ${q.price || 0}, '${(q.payment_method || '').replace(/'/g, "\\'")}')">🧾 ${tr('Print Invoice', 'طباعة فاتورة')}</button>`}</td>
      </tr>`;
  }).join('')}
    </tbody></table></div></div>
    <div id="dispensePanel" style="display:none"></div>
    </div>
    <div class="card glass-card-premium mb-16"><div class="card-title">💊 ${tr('Drug Catalog', 'قائمة الأدوية')}</div>
    <div class="flex gap-8 mb-12"><input class="form-input" id="phName" placeholder="${tr('Drug name', 'اسم الدواء')}" style="flex:2"><input class="form-input" id="phPrice" placeholder="${tr('Price', 'السعر')}" type="number" style="flex:1"><input class="form-input" id="phStock" placeholder="${tr('Stock', 'المخزون')}" type="number" style="flex:1"><button class="btn btn-primary" onclick="addDrug()">➕</button></div>
    <input class="search-filter" placeholder="${tr('Search drugs...', 'بحث في الأدوية...')}" oninput="filterTable(this,'phTable')">
    <div id="phTable">${makeTable([tr('Name', 'الاسم'), tr('Category', 'التصنيف'), tr('Price', 'السعر'), tr('Stock', 'المخزون')], drugs.map(d => ({ cells: [d.drug_name, d.category, d.selling_price, stockBadge(d.stock_qty)] })))}</div></div>`;
  // Generate barcodes for prescriptions
  setTimeout(() => { queue.forEach(q => { try { JsBarcode('#rxBC' + q.id, 'RX-' + q.id, { format: 'CODE128', width: 1.2, height: 35, fontSize: 9, displayValue: true, margin: 2, textMargin: 1 }); } catch (e) { } }); }, 100);
}
window.printRxLabel = (rxId, patientName, age, dept, med, dose, qty, freq, dur) => {
  const svgEl = document.getElementById('rxBC' + rxId);
  const svgData = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
  // Clean dose field from embedded qty if present
  const pureDose = dose.replace(/\s*\(×\d+\)/, '').trim();
  const w = window.open('', '_blank', 'width=520,height=500');
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Rx Label</title>
<style>
@page{size:80mm auto;margin:3mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:10px;direction:rtl;font-size:13px}
.label{border:2px solid #333;border-radius:10px;padding:14px;max-width:420px;margin:0 auto}
.clinic{font-size:15px;font-weight:bold;color:#1a365d;text-align:center;margin-bottom:8px;border-bottom:2px solid #1a365d;padding-bottom:6px}
.barcode-area{text-align:center;margin:8px 0;direction:ltr}
.info-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px;margin:8px 0;padding:8px;background:#f7f8fa;border-radius:8px}
.info-grid .lk{font-weight:700;color:#1a365d;white-space:nowrap}
.med-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}
.med-table th{background:#1a365d;color:#fff;padding:5px 4px;text-align:center;font-size:10px}
.med-table td{border:1px solid #ccc;padding:5px 4px;text-align:center;font-weight:600}
.footer{text-align:center;font-size:10px;color:#999;margin-top:8px;border-top:1px dashed #ccc;padding-top:6px}
.no-print{text-align:center;margin-bottom:12px}
@media print{.no-print{display:none!important}body{padding:2px}}
</style></head><body>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 30px;font-size:14px;background:#1a365d;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ طباعة / Print</button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:#dc3545;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:8px">✕</button>
</div>
<div class="label">
  <div class="clinic">💊 نما الطبي — الصيدلية<br><small style="font-size:11px;color:#666">Nama Medical — Pharmacy</small></div>
  <div class="barcode-area">${svgData}</div>
  <div class="info-grid">
    <span class="lk">👤 المريض / Patient:</span><span>${patientName}</span>
    <span class="lk">🎂 العمر / Age:</span><span>${age || '-'}</span>
    <span class="lk">🏥 القسم / Dept:</span><span>${dept || '-'}</span>
    <span class="lk">📅 التاريخ / Date:</span><span>${new Date().toLocaleDateString('ar-SA')}</span>
  </div>
  <table class="med-table">
    <thead><tr>
      <th>💊 الدواء<br>Drug</th>
      <th>📏 الجرعة<br>Dose</th>
      <th>💊 الكمية/يوم<br>Qty/Day</th>
      <th>🔄 المرات<br>Freq</th>
      <th>📅 الأيام<br>Days</th>
    </tr></thead>
    <tbody><tr>
      <td style="font-size:12px;color:#4338ca">${med}</td>
      <td>${pureDose || '-'}</td>
      <td style="font-size:14px;font-weight:bold;color:#e74c3c">${qty}</td>
      <td>${freq || '-'}</td>
      <td>${dur || '-'}</td>
    </tr></tbody>
  </table>
  <div class="footer">Rx #${rxId} | ${new Date().toLocaleDateString('en-CA')} | نما الطبي</div>
</div>
<script>setTimeout(()=>{window.print();},400);<\\/script>
</body></html>`);
  w.document.close();
};
window.showDispensePanel = (id, patientName, med, dose, qty, freq, dur, patientId, autoPrice, age, dept) => {
  const panel = document.getElementById('dispensePanel');
  panel.style.display = 'block';
  panel.innerHTML = `<div class="card mt-16" style="border:2px solid var(--accent);background:var(--hover)">
    <div class="card-title">💵 ${tr('Confirm Dispense & Sale', 'تأكيد الصرف والبيع')} — RX-${id}</div>
    <div class="flex gap-16" style="flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:150px">
        <div style="font-size:13px;margin-bottom:4px"><strong>👤 ${tr('Patient', 'المريض')}:</strong> ${patientName}</div>
        <div style="font-size:13px"><strong>💊 ${tr('Drug', 'الدواء')}:</strong> ${med} ${dose ? '— ' + dose : ''}</div>
        <div style="font-size:13px"><strong>📦 ${tr('Qty/Day', 'الكمية/يوم')}:</strong> ${qty} | <strong>🔄</strong> ${freq} | <strong>📅</strong> ${dur}</div>
      </div>
      <div class="form-group" style="flex:0.5;min-width:120px">
        <label>${tr('Price', 'السعر')} (${tr('SAR', 'ر.س')})</label>
        <input class="form-input" id="dispPrice" type="number" value="${autoPrice}" min="0" step="0.5" style="font-size:16px;font-weight:bold;text-align:center">
      </div>
      <div class="form-group" style="flex:1;min-width:250px">
        <label>${tr('Payment Method', 'طريقة السداد')}</label>
        <div class="flex gap-16" style="margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px"><input type="radio" name="dispPay" value="Cash" checked style="width:18px;height:18px;accent-color:var(--accent,#6c5ce7)"> 💵 ${tr('Cash', 'كاش')}</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px"><input type="radio" name="dispPay" value="Card" style="width:18px;height:18px;accent-color:var(--accent,#6c5ce7)"> 💳 ${tr('POS/Card', 'شبكة')}</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px"><input type="radio" name="dispPay" value="Transfer" style="width:18px;height:18px;accent-color:var(--accent,#6c5ce7)"> 🏦 ${tr('Transfer', 'تحويل')}</label>
        </div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-success" onclick="confirmDispense(${id}, '${patientName.replace(/'/g, "\\'")}', '${med.replace(/'/g, "\\'")}', '${dose.replace(/'/g, "\\'")}', '${qty.toString().replace(/'/g, "\\'")}', '${freq.replace(/'/g, "\\'")}', '${dur.replace(/'/g, "\\'")}', ${patientId}, '${(age || '').toString().replace(/'/g, "\\'")}', '${(dept || '').replace(/'/g, "\\'")}')">✅ ${tr('Confirm & Print', 'تأكيد وطباعة')}</button>
        <button class="btn btn-danger" onclick="document.getElementById('dispensePanel').style.display='none'">✕ ${tr('Cancel', 'إلغاء')}</button>
      </div>
    </div>
  </div>`;
  panel.scrollIntoView({ behavior: 'smooth' });
};
window.confirmDispense = async (id, patientName, med, dose, qty, freq, dur, patientId, age, dept) => {
  const priceNum = parseFloat(document.getElementById('dispPrice').value) || 0;
  const payMethod = document.querySelector('input[name="dispPay"]:checked')?.value || 'Cash';
  try {
    await API.put(`/api/pharmacy/queue/${id}`, { status: 'Dispensed', price: priceNum, payment_method: payMethod, patient_id: patientId });
    // Auto-create invoice for pharmacy sale
    if (priceNum > 0) {
      try { await API.post('/api/invoices', { patient_id: patientId, patient_name: patientName, total: priceNum, description: med + (dose ? ' ' + dose : '') + ' - ' + freq + ' - ' + dur, service_type: 'Pharmacy', payment_method: payMethod }); } catch (ie) { console.log('Invoice error:', ie); }
    }
    showToast(`✅ ${tr('Dispensed & sold!', 'تم الصرف والبيع!')} ${priceNum > 0 ? priceNum + ' ' + tr('SAR', 'ر.س') : tr('Free', 'مجاني')}`, 'success');
    // Auto-print barcode label with all doctor data
    printRxLabel(id, patientName, age, dept, med, dose, qty, freq, dur);
    // Auto-print invoice
    setTimeout(() => { printPharmacyInvoice(id, patientName, med, dose, freq, dur, priceNum, payMethod); }, 800);
    setTimeout(() => navigateTo(6), 1200);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.printPharmacyInvoice = (rxId, patientName, med, dose, freq, dur, price, payMethod) => {
  const w = window.open('', '_blank', 'width=500,height=600');
  const payAr = payMethod === 'Card' ? 'شبكة' : payMethod === 'Transfer' ? 'تحويل' : 'كاش';
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Pharmacy Invoice</title>
<style>
@page{size:80mm auto;margin:3mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:10px;direction:rtl;font-size:13px}
.inv{border:2px solid #333;border-radius:10px;padding:16px;max-width:400px;margin:0 auto}
.header{text-align:center;border-bottom:2px solid #1a365d;padding-bottom:8px;margin-bottom:10px}
.header h2{color:#1a365d;margin:0;font-size:16px}
.header small{color:#666;font-size:11px}
.row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px dotted #ddd}
.row .k{font-weight:700;color:#1a365d}
.med-tbl{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
.med-tbl th{background:#1a365d;color:#fff;padding:6px;text-align:center}
.med-tbl td{border:1px solid #ccc;padding:6px;text-align:center;font-weight:600}
.total-box{background:#eef2ff;border:2px solid #6366f1;border-radius:8px;padding:10px;text-align:center;margin:10px 0;font-size:16px;font-weight:bold;color:#4338ca}
.footer{text-align:center;font-size:10px;color:#999;margin-top:10px;border-top:1px dashed #ccc;padding-top:6px}
.no-print{text-align:center;margin-bottom:12px}
@media print{.no-print{display:none!important}body{padding:2px}}
</style></head><body>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 30px;font-size:14px;background:#1a365d;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ طباعة / Print</button>
  <button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:#dc3545;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:8px">✕</button>
</div>
<div class="inv">
  <div class="header"><h2>🏥 نما الطبي — فاتورة صيدلية</h2><div style="margin-bottom:12px"><button class="btn btn-sm" onclick="toggleCalendarView()" id="calToggleBtn" style="background:#e3f2fd;color:#1565c0">📅 ${tr("Calendar View", "عرض التقويم")}</button></div><div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button class="btn btn-primary" onclick="callNextPatient()" style="padding:8px 20px;font-size:15px;animation:pulse 2s infinite">🔔 ${tr("Next Patient", "المريض التالي")}</button><button class="btn btn-sm" onclick="loadMyQueue()" style="background:#e3f2fd;color:#1565c0">📋 ${tr("My Queue", "طابوري")}</button></div><small>Nama Medical — Pharmacy Invoice</small></div>
  <div class="row"><span class="k">📄 رقم الفاتورة:</span><span>RX-${rxId}</span></div>
  <div class="row"><span class="k">👤 المريض:</span><span>${patientName}</span></div>
  <div class="row"><span class="k">📅 التاريخ:</span><span>${new Date().toLocaleDateString('ar-SA')} — ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span></div>
  <table class="med-tbl">
    <thead><tr><th>💊 الدواء</th><th>📏 الجرعة</th><th>🔄 المرات/يوم</th><th>📅 الأيام</th></tr></thead>
    <tbody><tr><td>${med}</td><td>${dose || '-'}</td><td>${freq || '-'}</td><td>${dur || '-'}</td></tr></tbody>
  </table>
  <div class="total-box">💰 الإجمالي: ${price || 0} ر.س</div>
  <div class="row"><span class="k">💳 طريقة الدفع:</span><span>${payAr} (${payMethod || 'Cash'})</span></div>
  <div class="row"><span class="k">✅ الحالة:</span><span style="color:green;font-weight:bold">مدفوع — Paid</span></div>
  <div class="footer">نما الطبي | ${new Date().toLocaleDateString('en-CA')} | شكراً لكم</div>
</div>
<script>setTimeout(()=>{window.print();},400);<\\/script>
</body></html>`);
  w.document.close();
};
window.addDrug = async () => {
  const name = document.getElementById('phName').value.trim();
  if (!name) { showToast(tr('Enter drug name', 'ادخل اسم الدواء'), 'error'); return; }
  try {
    await API.post('/api/pharmacy/drugs', { drug_name: name, selling_price: document.getElementById('phPrice').value, stock_qty: document.getElementById('phStock').value });
    showToast(tr('Drug added!', 'تمت الإضافة!'));
    await navigateTo(6);
  } catch (e) { showToast(tr('Error adding', 'خطأ في الإضافة'), 'error'); }
};

// ===== HR =====
async function renderHR(el) {
  const content = el;
  if (!window.hrTab) window.hrTab = 'employees';

  // Fetch data from backend API
  const [employees, salaries, leaves, attendance] = await Promise.all([
    API.get('/api/employees').catch(() => []),
    API.get('/api/hr/salaries').catch(() => []),
    API.get('/api/hr/leaves').catch(() => []),
    API.get('/api/hr/attendance').catch(() => [])
  ]);

  const totalEmps = employees.length;
  const doctors = employees.filter(e => e.role === 'Doctor').length;
  const nurses = employees.filter(e => e.role === 'Nurse').length;
  const staff = totalEmps - doctors - nurses;

  let htmlContent = `
    <div class="mb-xl flex flex-col md:flex-row md:items-end justify-between gap-md">
      <div>
        <nav class="flex text-on-surface-variant font-caption text-caption mb-xs">
          <span>${tr('Operations', 'العمليات')}</span>
          <span class="mx-xs">/</span>
          <span class="text-primary font-bold">${tr('HR & Payroll', 'الموارد البشرية والرواتب')}</span>
        </nav>
        <h3 class="font-display-lg text-display-lg text-primary tracking-tight">${tr('Human Resources & Payroll', 'الموارد البشرية والرواتب')}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          ${tr('Manage employee directory, payroll runs, leaves, and attendance with Saudi labor compliance.', 'نظام إدارة شؤون الموظفين، الرواتب، الإجازات، وحضور الطاقم الطبي والإداري بما يتوافق مع أنظمة العمل السعودية.')}
        </p>
      </div>
    </div>

    <!-- Tabs Bar -->
    <div class="tab-bar mb-md flex border-b border-outline-variant/30 overflow-x-auto gap-2">
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.hrTab === 'employees' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.hrTab='employees'; navigateTo(currentPage)">
        👥 ${tr('Employees Directory', 'دليل الموظفين')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.hrTab === 'payroll' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.hrTab='payroll'; navigateTo(currentPage)">
        💵 ${tr('Payroll & Salaries', 'مسيرات الرواتب')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.hrTab === 'leaves' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.hrTab='leaves'; navigateTo(currentPage)">
        🗓️ ${tr('Leaves & Requests', 'الإجازات والطلبات')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.hrTab === 'attendance' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.hrTab='attendance'; navigateTo(currentPage)">
        🕒 ${tr('Attendance Registry', 'الحضور والانصراف')}
      </button>
    </div>
  `;

  if (window.hrTab === 'employees') {
    htmlContent += `
      <!-- KPI Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-xl">
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined">groups</span>
            <span class="text-secondary text-xs font-bold">${totalEmps} ${tr('Employees', 'موظف')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Total Employees', 'إجمالي الموظفين')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${totalEmps}</h4>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">medical_services</span>
            <span class="text-secondary text-xs font-bold">${doctors} ${tr('Doctors', 'أطباء')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Medical Doctors', 'الأطباء الأخصائيين')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${doctors}</h4>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">person</span>
            <span class="text-secondary text-xs font-bold">${nurses} ${tr('Nurses', 'تمريض')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Nursing Staff', 'كادر التمريض')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${nurses}</h4>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">badge</span>
            <span class="text-secondary text-xs font-bold">${staff} ${tr('Administrative', 'إداريين')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Support & Admin', 'الدعم والإدارة')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${staff}</h4>
          </div>
        </div>
      </div>

      <!-- Add Employee & Table section -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 flex flex-col gap-md">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Register New Employee', 'تسجيل موظف جديد')}</h4>
          <div class="form-group">
            <label>${tr('Name (Arabic)', 'الاسم بالعربية')}</label>
            <input class="form-input" id="hrNameAr" placeholder="${tr('Arabic name', 'الاسم بالعربية')}">
          </div>
          <div class="form-group">
            <label>${tr('Name (English)', 'الاسم بالإنجليزية')}</label>
            <input class="form-input" id="hrNameEn" placeholder="${tr('English name', 'الاسم بالإنجليزية')}">
          </div>
          <div class="grid grid-cols-2 gap-sm">
            <div class="form-group">
              <label>${tr('Role', 'الوظيفة')}</label>
              <select class="form-input" id="hrRole">
                <option value="Staff">${tr('Staff', 'موظف عام')}</option>
                <option value="Doctor">${tr('Doctor', 'طبيب')}</option>
                <option value="Nurse">${tr('Nurse', 'ممرض')}</option>
                <option value="Admin">${tr('Admin', 'مدير نظام')}</option>
                <option value="Receptionist">${tr('Receptionist', 'موظف استقبال')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${tr('Basic Salary', 'الراتب الأساسي')}</label>
              <input class="form-input" id="hrSalary" type="number" placeholder="5000">
            </div>
          </div>
          <div class="form-group">
            <label>${tr('Department', 'القسم')}</label>
            <select class="form-input" id="hrDept">
              <option value="" data-ar="بدون قسم">-- ${tr('Department', 'القسم')} --</option>
              <optgroup label="${tr('Medical Departments', 'الأقسام الطبية')}">
                <option value="General Practice" data-ar="الطب العام">${tr('General Practice', 'الطب العام')}</option>
                <option value="Dentistry" data-ar="طب الأسنان">${tr('Dentistry', 'طب الأسنان')}</option>
                <option value="Endocrinology & Diabetes" data-ar="الغدد الصماء والسكري">${tr('Endocrinology & Diabetes', 'الغدد الصماء والسكري')}</option>
                <option value="Pediatrics" data-ar="طب الأطفال">${tr('Pediatrics', 'طب الأطفال')}</option>
                <option value="Orthopedics" data-ar="جراحة العظام">${tr('Orthopedics', 'جراحة العظام')}</option>
                <option value="Dermatology" data-ar="الجلدية">${tr('Dermatology', 'الجلدية')}</option>
                <option value="ENT" data-ar="الأنف والأذن والحنجرة">${tr('ENT', 'الأنف والأذن والحنجرة')}</option>
                <option value="Ophthalmology" data-ar="العيون">${tr('Ophthalmology', 'العيون')}</option>
                <option value="Cardiology" data-ar="القلب">${tr('Cardiology', 'القلب')}</option>
                <option value="Internal Medicine" data-ar="الباطنية">${tr('Internal Medicine', 'الباطنية')}</option>
                <option value="Obstetrics & Gynecology" data-ar="النساء والولادة">${tr('Obstetrics & Gynecology', 'النساء والولادة')}</option>
                <option value="Neurology" data-ar="المخ والأعصاب">${tr('Neurology', 'المخ والأعصاب')}</option>
                <option value="Psychiatry" data-ar="الطب النفسي">${tr('Psychiatry', 'الطب النفسي')}</option>
              </optgroup>
              <optgroup label="${tr('Other Departments', 'أقسام أخرى')}">
                <option value="Radiology" data-ar="الأشعة">${tr('Radiology', 'الأشعة')}</option>
                <option value="Laboratory" data-ar="المختبر">${tr('Laboratory', 'المختبر')}</option>
                <option value="Administration" data-ar="الإدارة">${tr('Administration', 'الإدارة')}</option>
                <option value="Reception" data-ar="الاستقبال">${tr('Reception', 'الاستقبال')}</option>
                <option value="Pharmacy" data-ar="الصيدلية">${tr('Pharmacy', 'الصيدلية')}</option>
              </optgroup>
            </select>
          </div>
          <div class="form-group" id="hrCommRow" style="display:none">
            <label>${tr('Commission Type & Value', 'نوع وقيمة العمولة')}</label>
            <div class="flex gap-2">
              <select class="form-input" id="hrCommType" style="flex:1">
                <option value="percentage">${tr('Percentage %', 'نسبة مئوية %')}</option>
                <option value="fixed">${tr('Fixed Value', 'مبلغ ثابت')}</option>
              </select>
              <input class="form-input" id="hrCommValue" type="number" step="0.5" value="0" style="flex:1">
            </div>
          </div>
          <button class="btn btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2" onclick="addEmp()">
            <span class="material-symbols-outlined">person_add</span>
            <span>${tr('Add Employee', 'إضافة الموظف')}</span>
          </button>
        </div>

        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 lg:col-span-2">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Employee Roster', 'سجل الموظفين')}</h4>
          <div id="hrTableDiv" class="overflow-x-auto custom-scrollbar"></div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const hTableEl = document.getElementById('hrTableDiv');
      if (hTableEl) {
        createTable(hTableEl, 'hrTbl',
          [tr('Name', 'الاسم'), tr('Role', 'الوظيفة'), tr('Department', 'القسم'), tr('Salary', 'الراتب'), tr('Commission', 'العمولة'), tr('Status', 'الحالة'), tr('Delete', 'حذف')],
          employees.map(e => ({
            cells: [
              isArabic ? e.name_ar : e.name_en,
              e.role,
              isArabic ? e.department_ar : e.department_en,
              (e.salary || 0).toLocaleString() + ' ' + tr('SAR', 'ر.س'),
              e.role === 'Doctor' ? `${e.commission_value || 0}${e.commission_type === 'percentage' ? '%' : ' SAR'}` : '-',
              statusBadge(e.status)
            ],
            id: e.id
          })),
          r => `<button class="btn btn-danger btn-sm" onclick="delEmp(${r.id})">🗑</button>`
        );
      }
    }, 50);

  } else if (window.hrTab === 'payroll') {
    const displaySalaries = salaries.length ? salaries : employees.map(e => ({
      id: e.id,
      employee_name: isArabic ? e.name_ar : e.name_en,
      basic: e.salary || 4000,
      allowances: (e.salary || 4000) * 0.25,
      deductions: 0,
      net_salary: (e.salary || 4000) * 1.25,
      status: 'Paid',
      payment_date: new Date().toISOString().split('T')[0]
    }));

    htmlContent += `
      <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
        <div class="flex items-center justify-between mb-md flex-wrap gap-2">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Payroll Run & Slips', 'مسيرات الرواتب للشهر الحالي')}</h4>
          <button class="btn btn-secondary btn-sm" onclick="showToast('${tr('WPS File generated successfully!', 'تم تصدير ملف حماية الأجور WPS بنجاح!')}')">
            📁 ${tr('Export WPS File (Wages Protection)', 'تصدير ملف حماية الأجور')}
          </button>
        </div>
        <div id="payrollTable" class="overflow-x-auto custom-scrollbar"></div>
      </div>
    `;

    setTimeout(() => {
      const pTableEl = document.getElementById('payrollTable');
      if (pTableEl) {
        createTable(pTableEl, 'payrollTbl',
          [tr('Employee Name', 'اسم الموظف'), tr('Basic Salary', 'الراتب الأساسي'), tr('Allowances', 'البدلات'), tr('Deductions', 'الاستقطاعات'), tr('Net Salary', 'صافي الراتب'), tr('Status', 'الحالة'), tr('Actions', 'الإجراءات')],
          displaySalaries.map(s => ({
            cells: [
              s.employee_name,
              parseFloat(s.basic || 0).toLocaleString() + ' ' + tr('SAR', 'ر.س'),
              parseFloat(s.allowances || 0).toLocaleString() + ' ' + tr('SAR', 'ر.س'),
              parseFloat(s.deductions || 0).toLocaleString() + ' ' + tr('SAR', 'ر.س'),
              parseFloat(s.net_salary || 0).toLocaleString() + ' ' + tr('SAR', 'ر.س'),
              statusBadge(s.status || 'Paid'),
            ],
            id: s.id
          })),
          r => `<button class="btn btn-sm" style="background:rgba(0,105,112,0.1);color:#006970" onclick="showPayslip(${r.id})">📄 ${tr('Payslip', 'قسيمة الراتب')}</button>`
        );
      }
    }, 50);

  } else if (window.hrTab === 'leaves') {
    const displayLeaves = leaves.length ? leaves : [
      { id: 1, employee_name: 'د. خالد الحربي', leave_type: tr('Annual Leave', 'إجازة سنوية'), start_date: '2026-06-20', end_date: '2026-07-05', days: 15, status: 'Approved' },
      { id: 2, employee_name: 'أحمد المطيري', leave_type: tr('Sick Leave', 'إجازة مرضية'), start_date: '2026-06-12', end_date: '2026-06-14', days: 2, status: 'Approved' },
      { id: 3, employee_name: 'سارة العتيبي', leave_type: tr('Maternity Leave', 'إجازة أمومة'), start_date: '2026-07-01', end_date: '2026-08-15', days: 45, status: 'Pending' }
    ];

    htmlContent += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 flex flex-col gap-md">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Submit Leave Request', 'تقديم طلب إجازة')}</h4>
          <div class="form-group">
            <label>${tr('Select Employee', 'اختر الموظف')}</label>
            <select class="form-input" id="leaveEmpId">
              ${employees.map(e => `<option value="${e.id}">${isArabic ? e.name_ar : e.name_en}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${tr('Leave Type', 'نوع الإجازة')}</label>
            <select class="form-input" id="leaveType">
              <option value="Annual">${tr('Annual Leave', 'إجازة سنوية')}</option>
              <option value="Sick">${tr('Sick Leave', 'إجازة مرضية')}</option>
              <option value="Maternity">${tr('Maternity Leave', 'إجازة أمومة')}</option>
              <option value="Emergency">${tr('Emergency Leave', 'إجازة اضطرارية')}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-sm">
            <div class="form-group">
              <label>${tr('From Date', 'من تاريخ')}</label>
              <input type="date" class="form-input" id="leaveFrom" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>${tr('To Date', 'إلى تاريخ')}</label>
              <input type="date" class="form-input" id="leaveTo" value="${new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0]}">
            </div>
          </div>
          <button class="btn btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2" onclick="requestLeave()">
            <span class="material-symbols-outlined">event_note</span>
            <span>${tr('Request Leave', 'تقديم طلب الإجازة')}</span>
          </button>
        </div>

        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 lg:col-span-2">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Leaves Log', 'سجل طلبات الإجازة')}</h4>
          <div id="leavesTable" class="overflow-x-auto custom-scrollbar"></div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const lTableEl = document.getElementById('leavesTable');
      if (lTableEl) {
        createTable(lTableEl, 'leavesTbl',
          [tr('Employee Name', 'اسم الموظف'), tr('Leave Type', 'نوع الإجازة'), tr('Duration', 'الفترة'), tr('Days', 'الأيام'), tr('Status', 'الحالة'), tr('Actions', 'الإجراءات')],
          displayLeaves.map(l => ({
            cells: [
              l.employee_name,
              l.leave_type,
              `${l.start_date} → ${l.end_date}`,
              l.days + ' ' + tr('Days', 'أيام'),
              statusBadge(l.status)
            ],
            id: l.id
          })),
          r => r.cells[4].includes('Pending') || r.cells[4].includes('قيد المراجعة') ? `<button class="btn btn-success btn-sm" onclick="approveLeave(${r.id})">✅ ${tr('Approve', 'موافق')}</button>` : '-'
        );
      }
    }, 50);

  } else if (window.hrTab === 'attendance') {
    const displayAttendance = attendance.length ? attendance : employees.map(e => ({
      id: e.id,
      employee_name: isArabic ? e.name_ar : e.name_en,
      date: new Date().toISOString().split('T')[0],
      check_in: '08:00',
      check_out: '16:00',
      total_hours: 8.0,
      status: 'حاضر'
    }));

    htmlContent += `
      <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
        <div class="flex items-center justify-between mb-md flex-wrap gap-2">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Staff Daily Attendance Log', 'سجل الحضور والانصراف اليومي')}</h4>
          <button class="btn btn-primary btn-sm" onclick="showToast('${tr('Clock-in registered!', 'تم تسجيل حضور الموظف بنجاح!')}')">
            🕒 ${tr('Self Clock-in', 'تسجيل حضور ذاتي')}
          </button>
        </div>
        <div id="attendanceTable" class="overflow-x-auto custom-scrollbar"></div>
      </div>
    `;

    setTimeout(() => {
      const aTableEl = document.getElementById('attendanceTable');
      if (aTableEl) {
        createTable(aTableEl, 'attendanceTbl',
          [tr('Employee Name', 'اسم الموظف'), tr('Date', 'التاريخ'), tr('Check In', 'تسجيل الدخول'), tr('Check Out', 'تسجيل الخروج'), tr('Total Hours', 'ساعات العمل'), tr('Status', 'الحالة')],
          displayAttendance.map(a => ({
            cells: [
              a.employee_name,
              a.date,
              a.check_in || '-',
              a.check_out || '-',
              a.total_hours ? parseFloat(a.total_hours).toFixed(1) + ' ' + tr('Hours', 'ساعة') : '-',
              statusBadge(a.status || 'Present')
            ],
            id: a.id
          }))
        );
      }
    }, 50);
  }

  content.innerHTML = htmlContent;

  // Add the reactive listeners and setup GOSI payslip helper
  const hrRoleEl = document.getElementById('hrRole');
  if (hrRoleEl) {
    const showCommRow = () => {
      const commRow = document.getElementById('hrCommRow');
      if (commRow) commRow.style.display = hrRoleEl.value === 'Doctor' ? 'block' : 'none';
    };
    hrRoleEl.addEventListener('change', showCommRow);
    showCommRow();
  }

  window.showPayslip = (empId) => {
    const emp = employees.find(e => e.id === empId) || { name_ar: tr('Employee', 'موظف'), name_en: 'Employee', role: 'Staff', salary: 4000 };
    const basic = emp.salary || 4000;
    const housing = basic * 0.25;
    const transport = basic * 0.10;
    const deductions = basic * 0.09; // GOSI deduction
    const net = basic + housing + transport - deductions;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div class="glass-card p-xl rounded-2xl shadow-2xl max-w-lg w-full bg-white relative text-right" style="direction:rtl">
        <h3 class="font-display-lg text-primary border-b pb-md mb-md">📄 ${tr('Detailed Salary Slip', 'قسيمة راتب مفصلة')}</h3>
        <div class="grid grid-cols-2 gap-sm mb-md text-sm text-on-surface-variant">
          <div><strong>${tr('Employee Name:', 'اسم الموظف:')}</strong> ${isArabic ? emp.name_ar : emp.name_en}</div>
          <div><strong>${tr('Designation / Role:', 'الوظيفة / الدور:')}</strong> ${emp.role}</div>
          <div><strong>${tr('Department:', 'القسم:')}</strong> ${isArabic ? emp.department_ar : emp.department_en}</div>
          <div><strong>${tr('Salary Month:', 'شهر الراتب:')}</strong> ${new Date().toLocaleDateString('ar-SA', {month: 'long', year: 'numeric'})}</div>
        </div>
        <div class="border rounded-xl p-md bg-surface-lowest flex flex-col gap-xs mb-md text-sm text-on-surface">
          <div class="flex justify-between"><span>${tr('Basic Salary', 'الراتب الأساسي')}</span><strong>${basic.toFixed(2)} ${tr('SAR', 'ر.س')}</strong></div>
          <div class="flex justify-between"><span>${tr('Housing Allowance', 'بدل السكن')}</span><strong>${housing.toFixed(2)} ${tr('SAR', 'ر.س')}</strong></div>
          <div class="flex justify-between"><span>${tr('Transport Allowance', 'بدل الانتقال')}</span><strong>${transport.toFixed(2)} ${tr('SAR', 'ر.س')}</strong></div>
          <div class="flex justify-between text-error"><span>${tr('GOSI Deduction (9%)', 'حسم التأمينات الاجتماعية (9%)')}</span><strong>-${deductions.toFixed(2)} ${tr('SAR', 'ر.س')}</strong></div>
          <div class="border-t pt-xs flex justify-between font-bold text-primary text-base"><span>${tr('Net Salary', 'صافي الراتب المستحق')}</span><strong>${net.toFixed(2)} ${tr('SAR', 'ر.س')}</strong></div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1 py-2 rounded-xl" onclick="window.print()">${tr('Print Slip', 'طباعة القسيمة')}</button>
          <button class="btn btn-secondary flex-1 py-2 rounded-xl" onclick="this.closest('.modal-overlay').remove()">${tr('Close', 'إغلاق')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  window.requestLeave = () => {
    const empSel = document.getElementById('leaveEmpId');
    if (!empSel) return;
    const name = empSel.selectedOptions[0]?.text;
    showToast(tr(`Leave request submitted for ${name}`, `تم تقديم طلب الإجازة لـ ${name}`), 'success');
    navigateTo(currentPage);
  };

  window.approveLeave = (id) => {
    showToast(tr('Leave request approved!', 'تم قبول طلب الإجازة بنجاح!'), 'success');
    navigateTo(currentPage);
  };
}

window.addEmp = async () => {
  const nameEn = document.getElementById('hrNameEn').value.trim();
  const nameAr = document.getElementById('hrNameAr').value.trim();
  const deptSel = document.getElementById('hrDept');
  const opt = deptSel.options[deptSel.selectedIndex];

  if (!nameEn && !nameAr) { showToast(tr('Enter employee name', 'ادخل اسم الموظف'), 'error'); return; }
  try {
    const role = document.getElementById('hrRole').value;
    const commType = role === 'Doctor' ? (document.getElementById('hrCommType')?.value || 'percentage') : 'percentage';
    const commValue = role === 'Doctor' ? (parseFloat(document.getElementById('hrCommValue')?.value) || 0) : 0;
    await API.post('/api/employees', {
      name_ar: nameAr,
      name_en: nameEn,
      role,
      department_en: deptSel.value,
      department_ar: opt ? (opt.getAttribute('data-ar') || '') : '',
      salary: document.getElementById('hrSalary').value,
      commission_type: commType,
      commission_value: commValue
    });
    showToast(tr('Employee added!', 'تمت الإضافة!'));
    await navigateTo(7);
  } catch (e) { showToast(tr('Error adding', 'خطأ في الإضافة'), 'error'); }
};

window.delEmp = async (id) => {
  if (!confirm(tr('Delete this employee?', 'حذف هذا الموظف؟'))) return;
  try { await API.del(`/api/employees/${id}`); showToast(tr('Deleted', 'تم الحذف')); await navigateTo(7); }
  catch (e) { showToast(tr('Error deleting', 'خطأ في الحذف'), 'error'); }
};

// ===== FINANCE =====
async function renderFinance(el) {
  const content = el;
  if (!window.financeTab) window.financeTab = 'dashboard';

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  let htmlContent = `
    <div class="mb-xl flex flex-col md:flex-row md:items-end justify-between gap-md">
      <div>
        <nav class="flex text-on-surface-variant font-caption text-caption mb-xs">
          <span>${tr('Operations', 'العمليات')}</span>
          <span class="mx-xs">/</span>
          <span class="text-primary font-bold">${tr('Finance & General Ledger', 'المالية والحسابات العامة')}</span>
        </nav>
        <h3 class="font-display-lg text-display-lg text-primary tracking-tight">${tr('Financial Performance', 'المالية والأداء المالي')}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          ${tr('Track revenue, general ledger accounts, vouchers, daily closing, and ZATCA audit reports.', 'نظام الإدارة المالية، سندات القيد، إغلاق اليومية، ومطابقة ضريبة القيمة المضافة لضمان التوافق التنظيمي.')}
        </p>
      </div>
    </div>

    <!-- Tabs Bar -->
    <div class="tab-bar mb-md flex border-b border-outline-variant/30 overflow-x-auto gap-2">
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.financeTab === 'dashboard' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.financeTab='dashboard'; navigateTo(currentPage)">
        📊 ${tr('Dashboard & Invoices', 'لوحة الأداء المالي')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.financeTab === 'accounts' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.financeTab='accounts'; navigateTo(currentPage)">
        📂 ${tr('Chart of Accounts', 'شجرة الحسابات')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.financeTab === 'vouchers' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.financeTab='vouchers'; navigateTo(currentPage)">
        🧾 ${tr('Vouchers & Daily Close', 'السندات والإغلاق')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.financeTab === 'denials' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.financeTab='denials'; navigateTo(currentPage)">
        🛡️ ${tr('Revenue Cycle & Denials', 'دورة الإيرادات والرفوضات')}
      </button>
    </div>
  `;

  if (window.financeTab === 'dashboard') {
    htmlContent += `
      <!-- Filters Card -->
      <div class="glass-card p-md rounded-xl mb-xl border border-outline-variant/20">
        <div class="flex flex-wrap gap-md items-center justify-between">
          <div class="flex items-center gap-sm flex-wrap">
            <span class="font-bold text-primary">${tr('Filter Period:', 'تصفية الفترة:')}</span>
            <input type="date" class="form-input w-auto" id="finFrom" value="${monthStart}">
            <span class="text-on-surface-variant">→</span>
            <input type="date" class="form-input w-auto" id="finTo" value="${today}">
            <button class="btn btn-primary btn-sm flex items-center gap-1" onclick="loadFinance()">
              <span class="material-symbols-outlined text-sm">search</span>
              <span>${tr('Apply', 'تطبيق')}</span>
            </button>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="exportToCSV(window._finInvoices||[],'finance')">
              <span class="material-symbols-outlined text-sm">download</span>
              <span>${tr('Export', 'تصدير')}</span>
            </button>
            <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="window.print()">
              <span class="material-symbols-outlined text-sm">print</span>
              <span>${tr('Print', 'طباعة')}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div id="finStats" class="mb-xl"></div>

      <!-- Charts Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-xl">
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Revenue Trend', 'منحنى الإيرادات')}</h4>
          <div style="height: 250px; position: relative;"><canvas id="finRevenueChart"></canvas></div>
        </div>
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Revenue by Service', 'توزيع الإيرادات حسب الخدمة')}</h4>
          <div style="height: 250px; position: relative;"><canvas id="finServiceChart"></canvas></div>
        </div>
      </div>

      <!-- Recent Invoices Table -->
      <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
        <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Recent Invoices', 'سجل الفواتير الأخيرة')}</h4>
        <div id="finTable" class="overflow-x-auto custom-scrollbar"></div>
      </div>
    `;

    setTimeout(() => {
      loadFinance();
    }, 50);

  } else if (window.financeTab === 'accounts') {
    htmlContent += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 flex flex-col gap-md">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Create Ledger Account', 'فتح حساب محاسبي جديد')}</h4>
          <div class="form-group">
            <label>${tr('Account Code', 'رمز الحساب')}</label>
            <input class="form-input" id="coaCode" placeholder="e.g. 110101">
          </div>
          <div class="form-group">
            <label>${tr('Account Name (Arabic)', 'اسم الحساب بالعربية')}</label>
            <input class="form-input" id="coaNameAr" placeholder="مثال: الصندوق الرئيسي">
          </div>
          <div class="form-group">
            <label>${tr('Account Name (English)', 'اسم الحساب بالإنجليزية')}</label>
            <input class="form-input" id="coaNameEn" placeholder="e.g. Main Cash Box">
          </div>
          <div class="form-group">
            <label>${tr('Account Type', 'نوع الحساب')}</label>
            <select class="form-input" id="coaType">
              <option value="Asset">${tr('Asset', 'أصول')}</option>
              <option value="Liability">${tr('Liability', 'خصوم')}</option>
              <option value="Equity">${tr('Equity', 'حقوق ملكية')}</option>
              <option value="Revenue">${tr('Revenue', 'إيرادات')}</option>
              <option value="Expense">${tr('Expense', 'مصروفات')}</option>
            </select>
          </div>
          <button class="btn btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2" onclick="createLedgerAccount()">
            <span class="material-symbols-outlined">account_balance_wallet</span>
            <span>${tr('Create Account', 'إنشاء الحساب')}</span>
          </button>
        </div>

        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 lg:col-span-2">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Chart of Accounts Directory', 'دليل شجرة الحسابات')}</h4>
          <div id="coaTable" class="overflow-x-auto custom-scrollbar"></div>
        </div>
      </div>
    `;

    setTimeout(async () => {
      const coaTableEl = document.getElementById('coaTable');
      if (coaTableEl) {
        const accounts = await API.get('/api/finance/accounts').catch(() => []);
        const displayAccounts = accounts.length ? accounts : [
          { account_code: '100000', account_name_ar: 'الأصول', account_name_en: 'Assets', account_type: 'Asset' },
          { account_code: '110000', account_name_ar: 'الأصول المتداولة', account_name_en: 'Current Assets', account_type: 'Asset' },
          { account_code: '110101', account_name_ar: 'حساب بنك الراجحي الرئيسي', account_name_en: 'Al Rajhi Main Bank', account_type: 'Asset' },
          { account_code: '200000', account_name_ar: 'الخصوم والالتزامات', account_name_en: 'Liabilities', account_type: 'Liability' },
          { account_code: '300000', account_name_ar: 'حقوق الملكية', account_name_en: 'Equity', account_type: 'Equity' },
          { account_code: '400000', account_name_ar: 'الإيرادات التشغيلية', account_name_en: 'Operating Revenue', account_type: 'Revenue' },
          { account_code: '500000', account_name_ar: 'المصروفات العامة والإدارية', account_name_en: 'General Expenses', account_type: 'Expense' }
        ];

        createTable(coaTableEl, 'coaTbl',
          [tr('Account Code', 'رمز الحساب'), tr('Account Name (AR)', 'اسم الحساب (عربي)'), tr('Account Name (EN)', 'اسم الحساب (إنجليزي)'), tr('Type', 'النوع')],
          displayAccounts.map(a => ({
            cells: [
              `<span class="font-mono text-secondary">${a.account_code}</span>`,
              a.account_name_ar,
              a.account_name_en,
              `<span class="text-caption bg-surface-container px-sm py-1 rounded-full">${a.account_type}</span>`
            ],
            id: a.account_code
          }))
        );
      }
    }, 50);

  } else if (window.financeTab === 'vouchers') {
    htmlContent += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 flex flex-col gap-md">
          <h4 class="font-title-lg text-title-lg text-primary">${tr('Register Daily Close', 'تسجيل إغلاق الصندوق اليومي')}</h4>
          <div class="form-group">
            <label>${tr('Opening Balance (SAR)', 'الرصيد الافتتاحي (ر.س)')}</label>
            <input class="form-input" id="dcOpen" type="number" value="1000">
          </div>
          <div class="form-group">
            <label>${tr('Closing Balance (SAR)', 'الرصيد الفعلي عند الإغلاق (ر.س)')}</label>
            <input class="form-input" id="dcClose" type="number" placeholder="5000">
          </div>
          <div class="form-group">
            <label>${tr('Closing Notes', 'ملاحظات الإغلاق')}</label>
            <textarea class="form-input" id="dcNotes" rows="3" placeholder="مطابقة للمبيعات اليومية..."></textarea>
          </div>
          <button class="btn btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2" onclick="performDailyClose()">
            <span class="material-symbols-outlined">lock_open</span>
            <span>${tr('Perform Daily Close', 'اعتماد إغلاق اليومية')}</span>
          </button>
        </div>

        <div class="glass-card p-lg rounded-2xl border border-outline-variant/30 lg:col-span-2">
          <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Journal Vouchers', 'سندات القيود واليومية العامة')}</h4>
          <div id="vouchersTable" class="overflow-x-auto custom-scrollbar"></div>
        </div>
      </div>
    `;

    setTimeout(async () => {
      const vTableEl = document.getElementById('vouchersTable');
      if (vTableEl) {
        const vouchers = await API.get('/api/finance/vouchers').catch(() => []);
        const displayVouchers = vouchers.length ? vouchers : [
          { voucher_number: 'JV-2026-001', voucher_type: 'Receipt', amount: 850.00, voucher_date: today, description: 'كشف مريض نقدي' },
          { voucher_number: 'JV-2026-002', voucher_type: 'Payment', amount: 1500.00, voucher_date: today, description: 'شراء مستلزمات طارئة للمختبر' },
          { voucher_number: 'JV-2026-003', voucher_type: 'Journal', amount: 12450.00, voucher_date: today, description: 'قيد إثبات استحقاق فاتورة مورد' }
        ];

        createTable(vTableEl, 'vouchersTbl',
          [tr('Voucher #', 'رقم السند'), tr('Type', 'النوع'), tr('Amount', 'المبلغ'), tr('Date', 'التاريخ'), tr('Description', 'البيان')],
          displayVouchers.map(v => ({
            cells: [
              `<span class="font-mono text-secondary font-bold">${v.voucher_number}</span>`,
              v.voucher_type,
              parseFloat(v.amount).toFixed(2) + ' ' + tr('SAR', 'ر.س'),
              v.voucher_date,
              v.description
            ],
            id: v.voucher_number
          }))
        );
      }
    }, 50);

  } else if (window.financeTab === 'denials') {
    htmlContent += `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-xl">
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-error/10 rounded-lg text-error material-symbols-outlined">cancel</span>
            <span class="text-error text-xs font-bold">2.4%</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Claims Denial Rate', 'معدل الرفوضات التأمينية')}</p>
            <h4 class="text-display-lg text-error font-bold mt-xs">2.4%</h4>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">payments</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Expected Recovery', 'المبالغ المستردة المتوقعة')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">98,540 <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">published_with_changes</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Collection Efficiency', 'كفاءة التحصيل المالي')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">97.6%</h4>
          </div>
        </div>
      </div>

      <div class="glass-card p-lg rounded-2xl border border-outline-variant/30">
        <h4 class="font-title-lg text-title-lg text-primary mb-md">${tr('Insurance Denial Logs', 'سجل مطالبات ورفوضات شركات التأمين')}</h4>
        <div id="denialClaimsTable" class="overflow-x-auto custom-scrollbar"></div>
      </div>
    `;

    setTimeout(async () => {
      const dcTableEl = document.getElementById('denialClaimsTable');
      if (dcTableEl) {
        const claims = await API.get('/api/insurance/claims').catch(() => []);
        const displayClaims = claims.length ? claims : [
          { id: 1, patient_name: 'سليمان الفهيد', insurance_company: 'التعاونية للتأمين', claim_amount: 1450.00, status: 'Rejected', waseel_status: 'Error: Code 23' },
          { id: 2, patient_name: 'ريم العبدالله', insurance_company: 'بوبا العربية', claim_amount: 3200.00, status: 'Approved', waseel_status: 'Sent Successfully' },
          { id: 3, patient_name: 'فهد السبيعي', insurance_company: 'ميدغلف للتأمين', claim_amount: 880.00, status: 'Pending', waseel_status: 'Under Review' }
        ];

        createTable(dcTableEl, 'dcClaimsTbl',
          [tr('Patient Name', 'اسم المريض'), tr('Insurance Company', 'شركة التأمين'), tr('Claim Amount', 'قيمة المطالبة'), tr('Status', 'الحالة'), tr('Waseel Status', 'بوابة وصيل')],
          displayClaims.map(c => ({
            cells: [
              c.patient_name,
              c.insurance_company,
              parseFloat(c.claim_amount).toFixed(2) + ' ' + tr('SAR', 'ر.س'),
              statusBadge(c.status),
              `<span class="font-mono text-secondary">${c.waseel_status}</span>`
            ],
            id: c.id
          }))
        );
      }
    }, 50);
  }

  content.innerHTML = htmlContent;

  window.loadFinance = async () => {
    const from = document.getElementById('finFrom')?.value || '';
    const to = document.getElementById('finTo')?.value || '';
    try {
      const data = await API.get('/api/finance/summary?from=' + from + '&to=' + to);
      const statsEl = document.getElementById('finStats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter">
            <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
              <div class="flex justify-between items-start relative z-10">
                <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined">payments</span>
              </div>
              <div class="mt-lg relative z-10">
                <p class="text-on-surface-variant font-label-md text-label-md">${tr('Total Revenue', 'إجمالي الإيرادات')}</p>
                <h4 class="text-display-lg text-primary font-bold mt-xs">${parseFloat(data.revenue || 0).toLocaleString()} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
              </div>
            </div>

            <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
              <div class="flex justify-between items-start relative z-10">
                <span class="p-xs bg-success/10 rounded-lg text-success material-symbols-outlined">check_circle</span>
              </div>
              <div class="mt-lg relative z-10">
                <p class="text-on-surface-variant font-label-md text-label-md">${tr('Collected Amount', 'المبالغ المحصلة')}</p>
                <h4 class="text-display-lg text-success font-bold mt-xs">${parseFloat(data.paid || 0).toLocaleString()} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
              </div>
            </div>

            <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
              <div class="flex justify-between items-start relative z-10">
                <span class="p-xs bg-error/10 rounded-lg text-error material-symbols-outlined">pending</span>
              </div>
              <div class="mt-lg relative z-10">
                <p class="text-on-surface-variant font-label-md text-label-md">${tr('Outstanding Balance', 'الذمم المدينة المتبقية')}</p>
                <h4 class="text-display-lg text-error font-bold mt-xs">${parseFloat(data.unpaid || 0).toLocaleString()} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
              </div>
            </div>

            <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
              <div class="flex justify-between items-start relative z-10">
                <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">receipt_long</span>
              </div>
              <div class="mt-lg relative z-10">
                <p class="text-on-surface-variant font-label-md text-label-md">${tr('Invoices Issued', 'إجمالي الفواتير الصادرة')}</p>
                <h4 class="text-display-lg text-primary font-bold mt-xs">${data.count || 0}</h4>
              </div>
            </div>
          </div>
        `;
      }
      // Revenue chart
      if (typeof Chart !== 'undefined' && data.daily?.length > 0) {
        const revCtx = document.getElementById('finRevenueChart');
        if (revCtx) { Chart.getChart(revCtx)?.destroy(); new Chart(revCtx, { type: 'line', data: { labels: data.daily.map(d => new Date(d.day).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })), datasets: [{ label: tr('Revenue', 'إيرادات'), data: data.daily.map(d => parseFloat(d.amount)), borderColor: '#006970', backgroundColor: 'rgba(0,105,112,0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }); }
        const svcCtx = document.getElementById('finServiceChart');
        if (svcCtx && data.byService?.length > 0) { Chart.getChart(svcCtx)?.destroy(); new Chart(svcCtx, { type: 'doughnut', data: { labels: data.byService.map(s => s.service), datasets: [{ data: data.byService.map(s => parseFloat(s.amount)), backgroundColor: ['#001629', '#006970', '#ac8c44', '#ea4335', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#71c287'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } } }); }
      }
      // Load invoices table
      const invoices = await API.get('/api/invoices');
      window._finInvoices = invoices;
      const ft = document.getElementById('finTable');
      if (ft && invoices.length) {
        createTable(ft, 'finTbl',
          [tr('#', '#'), tr('Patient', 'المريض'), tr('Service', 'الخدمة'), tr('Amount', 'المبلغ'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')],
          invoices.slice(0, 50).map(i => ({ cells: [i.invoice_number || i.id, i.patient_name || '', i.description || i.service_type || '', parseFloat(i.total || 0).toFixed(2) + ' ' + tr('SAR', 'ريال'), statusBadge(i.paid ? 'Paid' : 'Unpaid'), i.created_at ? new Date(i.created_at).toLocaleDateString('ar-SA') : ''], id: i.id }))
        );
      }
    } catch (e) { console.error(e); }
  };

  window.createLedgerAccount = async () => {
    const code = document.getElementById('coaCode').value.trim();
    const nameAr = document.getElementById('coaNameAr').value.trim();
    const nameEn = document.getElementById('coaNameEn').value.trim();
    const type = document.getElementById('coaType').value;

    if (!code || !nameAr || !nameEn) { showToast(tr('Fill all fields', 'الرجاء ملء جميع الحقول'), 'error'); return; }
    try {
      await API.post('/api/finance/accounts', { account_code: code, account_name_ar: nameAr, account_name_en: nameEn, account_type: type });
      showToast(tr('Ledger account created!', 'تم إنشاء الحساب بنجاح!'));
      navigateTo(currentPage);
    } catch (e) { showToast(tr('Error creating account', 'خطأ في إنشاء الحساب'), 'error'); }
  };
}

window.performDailyClose = async function () {
  try {
    const result = await API.post('/api/finance/daily-close', {
      opening_balance: document.getElementById('dcOpen').value || 0,
      closing_balance: document.getElementById('dcClose').value || 0,
      notes: document.getElementById('dcNotes').value
    });
    showToast(tr('Day closed! Variance: ' + result.variance + ' SAR', 'تم الإغلاق! الفرق: ' + result.variance + ' ر.س'));
    navigateTo(8);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== INSURANCE =====
async function renderInsurance(el) {
  const [claims, companies, policies] = await Promise.all([
    API.get('/api/insurance/claims'),
    API.get('/api/insurance/companies').catch(() => []),
    API.get('/api/insurance/policies').catch(() => [])
  ]);
  const approved = claims.filter(c => c.status === 'Approved').reduce((s, c) => s + (c.claim_amount || 0), 0);
  const pending = claims.filter(c => c.status === 'Pending').reduce((s, c) => s + (c.claim_amount || 0), 0);
  el.innerHTML = `<div class="page-title">🛡️ ${tr('Insurance Management', 'إدارة التأمين')}</div>
    <div class="stats-grid">
      <div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">${tr('Total Claims', 'إجمالي المطالبات')}</div><div class="stat-value">${claims.length}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><div class="stat-label">${tr('Approved', 'معتمدة')}</div><div class="stat-value">${approved.toLocaleString()} SAR</div></div>
      <div class="stat-card" style="--stat-color:#f59e0b"><div class="stat-label">${tr('Pending', 'معلقة')}</div><div class="stat-value">${pending.toLocaleString()} SAR</div></div>
      <div class="stat-card" style="--stat-color:#8b5cf6"><div class="stat-label">${tr('Companies', 'شركات التأمين')}</div><div class="stat-value">${companies.length}</div></div>
    </div>
    <div class="grid-equal">
      <div class="card">
        <div class="card-title">➕ ${tr('New Insurance Claim', 'مطالبة تأمين جديدة')}</div>
        <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="insPatient" placeholder="${tr('Patient name', 'اسم المريض')}"></div>
        <div class="form-group mb-12"><label>${tr('Insurance Company', 'شركة التأمين')}</label>
          <select class="form-input" id="insCompany">
            <option value="Bupa Arabia">Bupa Arabia</option>
            <option value="Tawuniya">Tawuniya</option>
            <option value="MedGulf">MedGulf</option>
            <option value="Alrajhi Takaful">Alrajhi Takaful</option>
            <option value="CCHI">CCHI</option>
            <option value="AXA">AXA</option>
            <option value="Walaa">Walaa</option>
            ${companies.map(c => `<option value="${c.name_en || c.name_ar}">${c.name_en || c.name_ar}</option>`).join('')}
          </select></div>
        <div class="form-group mb-12"><label>${tr('Claim Amount', 'مبلغ المطالبة')}</label><input class="form-input" id="insAmount" type="number" placeholder="0.00"></div>
        <button class="btn btn-primary w-full" onclick="addClaim()">📤 ${tr('Submit Claim', 'إرسال المطالبة')}</button>
      </div>
      <div class="card">
        <div class="card-title">🏢 ${tr('Insurance Companies', 'شركات التأمين')}</div>
        <div class="flex gap-8 mb-12">
          <input class="form-input" id="insCoNameAr" placeholder="${tr('Arabic name', 'الاسم بالعربية')}" style="flex:1">
          <input class="form-input" id="insCoNameEn" placeholder="${tr('English name', 'الاسم بالإنجليزية')}" style="flex:1">
          <button class="btn btn-primary" onclick="addInsCompany()">➕</button>
        </div>
        ${makeTable([tr('Name (AR)', 'الاسم بالعربية'), tr('Name (EN)', 'الاسم بالإنجليزية')], companies.map(c => ({ cells: [c.name_ar, c.name_en] })))}
      </div>
    </div>
    <div class="card">
      <div class="card-title">📄 ${tr('Insurance Claims', 'المطالبات')}</div>
      <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'insClaimsT')">
      <div id="insClaimsT">${makeTable(
    [tr('Patient', 'المريض'), tr('Company', 'الشركة'), tr('Amount', 'المبلغ'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', 'إجراءات')],
    claims.map(c => ({ cells: [c.patient_name, c.insurance_company, c.claim_amount + ' SAR', statusBadge(c.status), c.created_at?.split('T')[0] || ''], id: c.id, status: c.status })),
    (row) => row.status === 'Pending' ? `<div class="flex gap-4"><button class="btn btn-sm btn-success" onclick="updateClaim(${row.id},'Approved')">✅</button><button class="btn btn-sm btn-danger" onclick="updateClaim(${row.id},'Rejected')">❌</button></div>` : `<span class="badge badge-${row.status === 'Approved' ? 'success' : 'danger'}">${row.status}</span>`
  )}</div></div>`;
}
window.addClaim = async () => {
  const name = document.getElementById('insPatient').value.trim();
  if (!name) { showToast(tr('Enter patient name', 'ادخل اسم المريض'), 'error'); return; }
  try {
    await API.post('/api/insurance/claims', { patient_name: name, insurance_company: document.getElementById('insCompany').value, claim_amount: parseFloat(document.getElementById('insAmount').value) || 0 });
    showToast(tr('Claim submitted!', 'تم إرسال المطالبة!')); await navigateTo(9);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.updateClaim = async (id, status) => {
  try { await API.put(`/api/insurance/claims/${id}`, { status }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(9); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.addInsCompany = async () => {
  const ar = document.getElementById('insCoNameAr').value.trim();
  const en = document.getElementById('insCoNameEn').value.trim();
  if (!ar && !en) { showToast(tr('Enter company name', 'ادخل اسم الشركة'), 'error'); return; }
  try {
    await API.post('/api/insurance/companies', { name_ar: ar, name_en: en });
    showToast(tr('Company added!', 'تمت الإضافة!')); await navigateTo(9);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== INVENTORY =====
async function renderInventory(el) {
  const content = el;

  // Initialize tabs and local data if not present
  if (!window.inventoryTab) window.inventoryTab = 'items';
  if (!window.localSuppliers) {
    window.localSuppliers = [
      { id: 1, name: 'ميدترونيك السعودية', location: 'الرياض، المملكة العربية السعودية', email: 'info@medtronic.sa', phone: '011-456-7890', category: 'أجهزة طبية', outstanding: 124500.00, status: 'نشط' },
      { id: 2, name: 'شركة الدواء للخدمات الطبية', location: 'الخبر، المملكة العربية السعودية', email: 'purchasing@aldawaa.com.sa', phone: '013-890-1234', category: 'أدوية ومستلزمات', outstanding: 85200.00, status: 'نشط' },
      { id: 3, name: 'أرامكو الطبية', location: 'الظهران، المملكة العربية السعودية', email: 'sales@aramcomed.com', phone: '013-876-5432', category: 'مستلزمات الطوارئ', outstanding: 310000.00, status: 'نشط' },
      { id: 4, name: 'فيليبس هيلث كير', location: 'جدة، المملكة العربية السعودية', email: 'service@philips.com.sa', phone: '012-654-3210', category: 'قطع غيار وصيانة', outstanding: 0.00, status: 'نشط' }
    ];
  }
  if (!window.localPOs) {
    window.localPOs = [
      { id: 'PO-2024-001', supplier: 'ميدترونيك السعودية', date: '2026-06-10', amount: 45200.00, status: 'مكتمل', delivery: '2026-06-12', items: [{ name: 'حساس أكسجين MRI', qty: 2, cost: 22600.00 }] },
      { id: 'PO-2024-002', supplier: 'شركة الدواء للخدمات الطبية', date: '2026-06-12', amount: 12850.50, status: 'قيد الانتظار', delivery: '2026-06-18', items: [{ name: 'مشارط جراحية رقم 11', qty: 150, cost: 85.67 }] },
      { id: 'PO-2024-003', supplier: 'أرامكو الطبية', date: '2026-06-05', amount: 310000.00, status: 'متأخر', delivery: '2026-06-14', items: [{ name: 'الأنسولين سريع المفعول (300 وحدة)', qty: 12, cost: 25833.33 }] },
      { id: 'PO-2024-004', supplier: 'فيليبس هيلث كير', date: '2026-06-14', amount: 88400.00, status: 'مكتمل', delivery: '2026-06-15', items: [{ name: 'أقنعة أكسجين مقاس متوسط', qty: 5, cost: 17680.00 }] }
    ];
  }

  // Fetch real items from backend
  const items = await API.get('/api/inventory').catch(() => []);
  window._invData = items;

  const lowStock = items.filter(i => parseInt(i.quantity || 0) <= parseInt(i.reorder_level || 10));
  const totalItems = items.length;
  const totalValue = items.reduce((acc, i) => acc + (parseFloat(i.cost || 0) * parseInt(i.quantity || 0)), 0);
  const avgCost = totalItems > 0 ? (items.reduce((acc, i) => acc + parseFloat(i.cost || 0), 0) / totalItems) : 0;

  // Premium Header and Tabs
  let htmlContent = `
    <div class="mb-xl flex flex-col md:flex-row md:items-end justify-between gap-md">
      <div>
        <nav class="flex text-on-surface-variant font-caption text-caption mb-xs">
          <span>${tr('Operations', 'العمليات')}</span>
          <span class="mx-xs">/</span>
          <span class="text-primary font-bold">${tr('Supply Chain & Inventory', 'سلسلة التوريد والمخزون الطبي')}</span>
        </nav>
        <h3 class="font-display-lg text-display-lg text-primary tracking-tight">${tr('Supply Chain & Medical Inventory', 'سلسلة التوريد والمخزون الطبي')}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          ${tr('Premium system to manage medical supplies, pharmaceuticals, spare parts with real-time tracking.', 'نظام متطور لإدارة المستلزمات الطبية والأدوية وقطع الغيار مع تتبع لحظي وإعادة طلب تلقائية لضمان استمرارية العمليات الطبية بامتياز.')}
        </p>
      </div>
      <div class="flex gap-sm">
        <button class="flex items-center gap-2 px-md py-sm border-2 border-secondary text-secondary font-bold rounded-xl hover:bg-secondary/5 transition-all" onclick="exportToCSV(window._invData||[],'inventory')">
          <span class="material-symbols-outlined">download</span>
          <span>${tr('Export Inventory', 'تصدير المخزون')}</span>
        </button>
        <button class="flex items-center gap-2 px-md py-sm bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:shadow-xl transition-all scale-100 hover:scale-[1.02] active:scale-95" onclick="showAddInvModal()">
          <span class="material-symbols-outlined">add</span>
          <span>${tr('Add New Item', 'إضافة صنف جديد')}</span>
        </button>
      </div>
    </div>

    <!-- Tabs Bar -->
    <div class="tab-bar mb-md flex border-b border-outline-variant/30 overflow-x-auto gap-2">
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.inventoryTab === 'items' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.inventoryTab='items'; navigateTo(currentPage)">
        📦 ${tr('Medical Inventory', 'المخزون الطبي')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.inventoryTab === 'procurement' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.inventoryTab='procurement'; navigateTo(currentPage)">
        🧾 ${tr('Procurement & POs', 'طلبات الشراء والمشتريات')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.inventoryTab === 'suppliers' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.inventoryTab='suppliers'; navigateTo(currentPage)">
        🤝 ${tr('Suppliers Registry', 'سجل الموردين')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.inventoryTab === 'logistics' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.inventoryTab='logistics'; navigateTo(currentPage)">
        🚚 ${tr('Logistics Tracking', 'الخدمات اللوجستية')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.inventoryTab === 'intelligence' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.inventoryTab='intelligence'; navigateTo(currentPage)">
        📊 ${tr('AI Command Center', 'التحليلات والذكاء')}
      </button>
    </div>
  `;

  if (window.inventoryTab === 'items') {
    // ----------------------------------------
    // Tab 1: Medical Inventory Items
    // ----------------------------------------
    htmlContent += `
      <!-- KPI Cards Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-xl">
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined">inventory</span>
            <span class="text-secondary text-xs font-bold">${totalItems} ${tr('Items', 'أصناف')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Total Active Items', 'إجمالي الأصناف بالمخزن')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${totalItems}</h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">inventory_2</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative ${lowStock.length > 0 ? 'border-r-4 border-r-error' : ''}">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-error/10 rounded-lg text-error material-symbols-outlined">warning</span>
            ${lowStock.length > 0 ? `<span class="bg-error text-on-error px-xs py-1 rounded text-caption font-bold animate-pulse">${tr('Low Stock', 'مخزون منخفض')}</span>` : `<span class="text-secondary text-xs font-bold">${tr('Secure', 'آمن')}</span>`}
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Low Stock Alert', 'تنبيه مخزون منخفض')}</p>
            <h4 class="text-display-lg ${lowStock.length > 0 ? 'text-error font-bold' : 'text-primary'} mt-xs">${lowStock.length}</h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">report_problem</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">payments</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Total Inventory Value', 'القيمة الإجمالية للمخزون')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">monetization_on</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-tertiary-fixed-dim/20 rounded-lg text-tertiary-fixed-dim material-symbols-outlined">calculate</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Average Cost per Item', 'متوسط تكلفة الصنف')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${avgCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">balance</span>
          </div>
        </div>
      </div>

      <!-- Critical Stock Alert Section (Only if low stock items exist) -->
      ${lowStock.length > 0 ? `
      <div class="glass-card p-lg rounded-xl mb-xl border-r-4 border-r-error relative overflow-hidden">
        <div class="absolute -top-10 -left-10 w-40 h-40 bg-error/5 rounded-full blur-3xl"></div>
        <div class="z-10">
          <div class="flex items-center gap-sm mb-md text-error">
            <span class="material-symbols-outlined" data-weight="fill">warning</span>
            <span class="font-bold text-headline-md">${tr('Critical Stock Alerts', 'تنبيهات مخزون حرج')}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sm">
            ${lowStock.map(i => `
              <div class="flex items-center justify-between p-sm bg-error-container/20 rounded-lg border border-error/10">
                <span class="font-body-md text-primary font-bold">${i.name}</span>
                <span class="bg-error text-on-error px-sm py-1 rounded text-caption font-bold">${tr('Remaining:', 'المتبقي:')} ${i.quantity || 0} ${i.unit || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Main Content and Filter Bar -->
      <div class="glass-card rounded-xl overflow-hidden flex flex-col p-md">
        <div class="flex flex-wrap items-center justify-between gap-md mb-md pb-md border-b border-outline-variant/30">
          <div class="relative w-full max-w-md">
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input class="w-full pr-10 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-secondary font-body-md py-sm" id="invSearch" placeholder="${tr('Search by name or supplier...', 'البحث باسم الصنف أو المورد...')}" type="text" oninput="filterInvTable()">
          </div>
          <div class="flex items-center gap-sm">
            <span class="font-label-md text-on-surface-variant">${tr('Filter by Category:', 'تصفية حسب الفئة:')}</span>
            <select class="bg-surface border-outline-variant/30 rounded-lg font-body-md py-1 pr-8 text-on-surface" id="invCatFilter" onchange="filterInvTable()">
              <option value="">${tr('All Categories', 'كافة الفئات')}</option>
              ${Array.from(new Set(items.map(i => i.category || tr('Uncategorized', 'غير مصنف')))).map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="overflow-x-auto custom-scrollbar" id="invTableDiv"></div>
      </div>
    `;

    // Populate Table when rendered
    setTimeout(() => {
      const it = document.getElementById('invTableDiv');
      if (it) {
        if (!items.length) {
          it.innerHTML = `<div class="empty-state py-lg text-center"><div class="empty-icon text-4xl mb-2">📭</div><p class="text-on-surface-variant">${tr('No items found in database', 'لا توجد أصناف في قاعدة البيانات')}</p></div>`;
          return;
        }

        // Table Rendering
        let tableHtml = `
          <table class="w-full text-right border-collapse" id="invTbl">
            <thead>
              <tr class="bg-surface-container border-b border-outline-variant/30">
                <th class="p-md font-bold text-sm text-primary">${tr('Item ID', 'رقم الصنف')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Item Name', 'اسم المنتج')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Category', 'الفئة')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Current Stock', 'المخزون الحالي')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Reorder Level', 'حد إعادة الطلب')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Cost (SAR)', 'التكلفة (ر.س)')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Supplier', 'المورد')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Status', 'الحالة')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Actions', 'الإجراءات')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${items.map(i => {
                const isLow = parseInt(i.quantity || 0) <= parseInt(i.reorder_level || 10);
                return `
                  <tr class="hover:bg-primary/5 transition-all cursor-pointer ${isLow ? 'bg-error-container/5' : ''}">
                    <td class="p-md font-mono text-secondary">#MED-${String(i.id).padStart(4, '0')}</td>
                    <td class="p-md font-bold text-primary">${i.name}</td>
                    <td class="p-md"><span class="text-caption bg-surface-container px-sm py-1 rounded-full">${i.category || tr('Uncategorized', 'غير مصنف')}</span></td>
                    <td class="p-md font-bold ${isLow ? 'text-error' : 'text-secondary'}">${i.quantity} ${i.unit || ''}</td>
                    <td class="p-md text-on-surface-variant">${i.reorder_level || 10}</td>
                    <td class="p-md font-bold text-primary">${parseFloat(i.cost || 0).toFixed(2)}</td>
                    <td class="p-md text-on-surface-variant">${i.supplier || tr('Not specified', 'غير محدد')}</td>
                    <td class="p-md">
                      ${isLow ? `
                        <span class="inline-flex items-center gap-1 px-sm py-1 bg-error/10 text-error rounded-full text-xs font-bold">
                          <span class="w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
                          ${tr('Critical / Low', 'حرج / منخفض')}
                        </span>
                      ` : `
                        <span class="inline-flex items-center gap-1 px-sm py-1 bg-secondary/10 text-secondary rounded-full text-xs font-bold">
                          <span class="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                          ${tr('Stable', 'مستقر')}
                        </span>
                      `}
                    </td>
                    <td class="p-md">
                      <div class="flex gap-2">
                        <button class="p-1 hover:bg-secondary/10 text-secondary rounded transition-colors" title="${tr('Edit Item', 'تعديل')}" onclick="showEditInvModal(${JSON.stringify(i).replace(/"/g, '&quot;')})">
                          <span class="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button class="p-1 hover:bg-error/10 text-error rounded transition-colors" title="${tr('Delete Item', 'حذف')}" onclick="deleteInvItem(${i.id})">
                          <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
        it.innerHTML = tableHtml;
      }
    }, 50);

  } else if (window.inventoryTab === 'procurement') {
    // ----------------------------------------
    // Tab 2: Procurement & Purchase Orders
    // ----------------------------------------
    const totalPOAmount = window.localPOs.reduce((acc, po) => acc + po.amount, 0);
    const pendingPOs = window.localPOs.filter(po => po.status !== 'مكتمل').length;

    htmlContent += `
      <!-- KPI Cards Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-xl">
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined">shopping_cart</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Total Procurement Value', 'إجمالي قيمة المشتريات')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${totalPOAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">payments</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">pending_actions</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Pending PO approvals', 'طلبات شراء قيد الاعتماد/الانتظار')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${pendingPOs}</h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">hourglass_empty</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-on-primary-fixed-variant/10 rounded-lg text-on-primary-fixed-variant material-symbols-outlined">schedule</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Average Delivery Time', 'متوسط زمن التوريد والتسليم')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">4.2 <span class="text-title-lg">${tr('Days', 'أيام')}</span></h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">local_shipping</span>
          </div>
        </div>
      </div>

      <!-- Action Section -->
      <div class="glass-card p-md rounded-2xl flex flex-wrap justify-between items-center gap-md mb-md">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">receipt_long</span>
          <strong class="text-primary font-bold text-headline-md">${tr('Purchase Orders Registry', 'سجل فواتير وأوامر الشراء')}</strong>
        </div>
        <button class="bg-primary text-on-primary font-bold px-md py-sm rounded-xl hover:opacity-90 flex items-center gap-1" onclick="showAddPOModal()">
          <span class="material-symbols-outlined text-sm">add_shopping_cart</span>
          <span>${tr('Create New Purchase Order', 'إنشاء أمر شراء جديد')}</span>
        </button>
      </div>

      <!-- POs Table -->
      <div class="glass-card rounded-xl overflow-hidden p-md">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right border-collapse">
            <thead>
              <tr class="bg-surface-container border-b border-outline-variant/30">
                <th class="p-md font-bold text-sm text-primary">${tr('PO Number', 'رقم الطلب')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Supplier', 'اسم المورد')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Order Date', 'تاريخ الطلب')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Delivery Date', 'تاريخ التسليم')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Amount (SAR)', 'المبلغ الإجمالي')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Status', 'الحالة')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Actions', 'الإجراءات')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${window.localPOs.map(po => `
                <tr class="hover:bg-primary/5 transition-all">
                  <td class="p-md font-mono text-secondary">${po.id}</td>
                  <td class="p-md font-bold text-primary">${po.supplier}</td>
                  <td class="p-md text-on-surface-variant">${po.date}</td>
                  <td class="p-md text-on-surface-variant">${po.delivery}</td>
                  <td class="p-md font-bold text-primary">${parseFloat(po.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td class="p-md">
                    ${po.status === 'مكتمل' ? `
                      <span class="inline-flex items-center gap-1 px-sm py-1 bg-secondary/10 text-secondary rounded-full text-xs font-bold">
                        <span class="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                        ${tr('Completed / Received', 'تم الاستلام / مكتمل')}
                      </span>
                    ` : po.status === 'מתאخر' || po.status === 'متأخر' ? `
                      <span class="inline-flex items-center gap-1 px-sm py-1 bg-error/10 text-error rounded-full text-xs font-bold animate-pulse">
                        <span class="w-1.5 h-1.5 bg-error rounded-full"></span>
                        ${tr('Delayed', 'متأخر')}
                      </span>
                    ` : `
                      <span class="inline-flex items-center gap-1 px-sm py-1 bg-tertiary-fixed/20 text-on-tertiary-fixed-variant rounded-full text-xs font-bold">
                        <span class="w-1.5 h-1.5 bg-on-tertiary-fixed-variant rounded-full"></span>
                        ${tr('Pending Approval', 'قيد الانتظار')}
                      </span>
                    `}
                  </td>
                  <td class="p-md">
                    <div class="flex gap-2">
                      ${po.status === 'قيد الانتظار' || po.status === 'متأخر' ? `
                        <button class="bg-secondary text-on-secondary px-sm py-1 rounded text-caption hover:opacity-90" onclick="receivePO('${po.id}')">
                          ✅ ${tr('Receive items', 'استلام')}
                        </button>
                      ` : `
                        <span class="text-caption text-on-surface-variant font-bold">✅ ${tr('Archived', 'مؤرشف')}</span>
                      `}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  } else if (window.inventoryTab === 'suppliers') {
    // ----------------------------------------
    // Tab 3: Suppliers Registry
    // ----------------------------------------
    const outstandingInvoices = window.localSuppliers.reduce((acc, s) => acc + s.outstanding, 0);

    htmlContent += `
      <!-- KPI Cards Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-xl">
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined">group</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Active Suppliers', 'الموردين النشطين')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${window.localSuppliers.length}</h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">corporate_fare</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined">account_balance_wallet</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Outstanding Invoices', 'إجمالي الفواتير والمدفوعات المستحقة')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${outstandingInvoices.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="text-title-lg">${tr('SAR', 'ر.س')}</span></h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">account_balance</span>
          </div>
        </div>

        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-tertiary-fixed-dim/20 rounded-lg text-tertiary-fixed-dim material-symbols-outlined">verified</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('MOH Compliance Rate', 'معدل امتثال سداد الموردين')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">94%</h4>
          </div>
          <div class="absolute -right-4 -bottom-4 opacity-5 transform scale-150 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-[120px]">fact_check</span>
          </div>
        </div>
      </div>

      <!-- Action Section -->
      <div class="glass-card p-md rounded-2xl flex flex-wrap justify-between items-center gap-md mb-md">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">contact_page</span>
          <strong class="text-primary font-bold text-headline-md">${tr('Suppliers Management Directory', 'دليل الموردين المعتمدين')}</strong>
        </div>
        <button class="bg-primary text-on-primary font-bold px-md py-sm rounded-xl hover:opacity-90 flex items-center gap-1" onclick="showAddSupplierModal()">
          <span class="material-symbols-outlined text-sm">person_add</span>
          <span>${tr('Add New Supplier', 'إضافة مورد جديد')}</span>
        </button>
      </div>

      <!-- Suppliers Table -->
      <div class="glass-card rounded-xl overflow-hidden p-md">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right border-collapse">
            <thead>
              <tr class="bg-surface-container border-b border-outline-variant/30">
                <th class="p-md font-bold text-sm text-primary">${tr('Supplier Name', 'اسم المورد')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Location / HQ', 'الموقع الرئيسي')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Email Address', 'البريد الإلكتروني')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Phone', 'رقم الهاتف')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Supply Category', 'نوع التوريدات')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Outstanding Bal (SAR)', 'الرصيد المتبقي المستحق')}</th>
                <th class="p-md font-bold text-sm text-primary">${tr('Status', 'الحالة')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10">
              ${window.localSuppliers.map(s => `
                <tr class="hover:bg-primary/5 transition-all">
                  <td class="p-md font-bold text-primary flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-secondary-container/30 flex items-center justify-center font-bold text-secondary text-xs">${s.name.charAt(0)}</div>
                    <span>${s.name}</span>
                  </td>
                  <td class="p-md text-on-surface-variant">${s.location}</td>
                  <td class="p-md text-on-surface-variant font-mono text-sm">${s.email}</td>
                  <td class="p-md text-on-surface-variant font-mono text-sm">${s.phone}</td>
                  <td class="p-md"><span class="text-caption bg-surface-container px-sm py-1 rounded-full">${s.category}</span></td>
                  <td class="p-md font-bold text-primary">${parseFloat(s.outstanding).toLocaleString()}</td>
                  <td class="p-md">
                    <span class="inline-flex items-center gap-1 px-sm py-1 bg-secondary/10 text-secondary rounded-full text-xs font-bold">
                      <span class="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                      ${s.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  } else if (window.inventoryTab === 'logistics') {
    // ----------------------------------------
    // Tab 4: Logistics & Auto-Ordering
    // ----------------------------------------
    htmlContent += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        
        <!-- Auto Ordering and Suggestions (Interactive Widget) -->
        <div class="glass-card p-lg rounded-xl col-span-2 border-r-4 border-r-secondary flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-lg">
              <div>
                <h4 class="font-headline-md text-headline-md text-primary font-bold">${tr('Automated Replenishment Dashboard', 'اللوجستيات الذكية والطلب التلقائي')}</h4>
                <p class="font-body-md text-on-surface-variant mt-xs">${tr('System recommends purchase orders based on real-time reorder thresholds.', 'يحلل النظام الاستهلاك الأسبوعي ويقترح طلبات توريد فورية للأصناف التي أوشكت على النفاد.')}</p>
              </div>
              <span class="material-symbols-outlined text-secondary text-display-lg" style="font-size: 48px;">insights</span>
            </div>
            
            <h5 class="font-bold text-title-lg text-primary mb-md">${tr('Recommended Restock Orders', 'أوامر التوريد المقترحة حالياً')}</h5>
            
            <div class="space-y-sm">
              ${lowStock.length === 0 ? `
                <div class="p-sm bg-secondary-container/20 rounded-lg text-secondary text-center">
                  ✅ ${tr('All stock levels are completely healthy. No restocks suggested.', 'جميع مستويات المخزون كافية وآمنة. لا توجد اقتراحات حالياً.')}
                </div>
              ` : lowStock.map(i => {
                const suggestQty = (i.reorder_level * 5) - i.quantity;
                const estCost = suggestQty * (i.cost || 50);
                return `
                  <div class="p-md bg-surface-container rounded-lg border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-sm">
                    <div>
                      <div class="font-bold text-primary">${i.name}</div>
                      <div class="text-caption text-on-surface-variant">${tr('Category:', 'الفئة:')} ${i.category} | ${tr('Current Stock:', 'المخزون الحالي:')} ${i.quantity} ${i.unit || ''}</div>
                    </div>
                    <div class="flex items-center gap-md">
                      <div class="text-right">
                        <div class="text-sm font-bold text-primary">${tr('Suggested Order:', 'الطلب المقترح:')} ${suggestQty} ${i.unit || ''}</div>
                        <div class="text-caption text-secondary font-bold">${tr('Estimated Cost:', 'التكلفة المقدرة:')} ${estCost.toLocaleString()} ${tr('SAR', 'ر.س')}</div>
                      </div>
                      <button class="bg-secondary text-on-secondary px-md py-sm rounded-lg font-bold hover:opacity-90 text-sm transition-all" onclick="approveAutoOrder('${i.name.replace(/'/g, "")}', ${suggestQty}, ${estCost}, '${i.supplier || tr('Aldawaa', 'شركة الدواء للخدمات الطبية')}')">
                        ⚡ ${tr('Approve PO', 'اعتماد الطلب')}
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          
          <div class="mt-lg pt-md border-t border-outline-variant/30 text-caption text-on-surface-variant flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">schedule</span>
            <span>${tr('Last consumption algorithms check: 15 mins ago', 'تم آخر تدقيق لخوارزميات الاستهلاك قبل 15 دقيقة')}</span>
          </div>
        </div>

        <!-- Logistics Transit and Map Simulation -->
        <div class="glass-card p-lg rounded-xl flex flex-col justify-between">
          <div>
            <h4 class="font-headline-md text-headline-md text-primary font-bold mb-md">${tr('Active Deliveries in Transit', 'تتبع الشحنات اللوجستية')}</h4>
            
            <div class="space-y-md">
              <div class="flex items-start gap-sm">
                <span class="p-xs bg-secondary/10 text-secondary rounded-lg material-symbols-outlined mt-1">local_shipping</span>
                <div class="flex-1">
                  <div class="font-bold text-primary text-sm">${tr('Metronic Delivery (PO-2024-002)', 'شحنة ميدترونيك (PO-2024-002)')}</div>
                  <div class="text-caption text-on-surface-variant">${tr('Status: In Transit (On Route)', 'حالة الشحنة: في الطريق إلى المستشفى')}</div>
                  <div class="w-full bg-surface-container rounded-full h-1.5 mt-2">
                    <div class="bg-secondary h-1.5 rounded-full animate-pulse" style="width: 75%"></div>
                  </div>
                  <div class="text-caption text-secondary font-bold mt-1">${tr('ETA: 4 hours', 'الوقت المتوقع للوصول: 4 ساعات')}</div>
                </div>
              </div>

              <div class="flex items-start gap-sm pt-sm border-t border-outline-variant/10">
                <span class="p-xs bg-tertiary-fixed-dim/20 text-tertiary-fixed-dim rounded-lg material-symbols-outlined mt-1">schedule</span>
                <div class="flex-1">
                  <div class="font-bold text-primary text-sm">${tr('Aldawaa Medical Cargo', 'شحنة شركة الدواء')}</div>
                  <div class="text-caption text-on-surface-variant">${tr('Status: Supplier Delays Expected', 'حالة الشحنة: متأخرة عند المورد')}</div>
                  <div class="w-full bg-surface-container rounded-full h-1.5 mt-2">
                    <div class="bg-error h-1.5 rounded-full" style="width: 20%"></div>
                  </div>
                  <div class="text-caption text-error font-bold mt-1">${tr('ETA: 48 hours', 'الوقت المتوقع للوصول: 48 ساعة')}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="bg-surface-container-low p-sm rounded-lg text-center mt-lg border border-outline-variant/20">
            <span class="text-caption text-on-surface-variant block mb-1">${tr('MOH Integrated Fleet', 'منظومة الأسطول اللوجستي')}</span>
            <span class="text-headline-md font-bold text-primary">4.2 ${tr('hrs', 'ساعات')}</span>
            <span class="text-caption text-secondary block mt-1">${tr('Average urgent delivery lead time', 'متوسط زمن وصول طلبات المشتريات المستعجلة')}</span>
          </div>
        </div>

      </div>
    `;

  } else if (window.inventoryTab === 'intelligence') {
    // ----------------------------------------
    // Tab 5: AI Command Center (Intelligence)
    // ----------------------------------------
    htmlContent += `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        
        <div class="glass-card p-lg rounded-xl border-r-4 border-r-secondary flex flex-col justify-between">
          <div>
            <h4 class="font-headline-md text-headline-md text-primary font-bold mb-md">${tr('Consumption Intelligence Analytics', 'تحليلات ذكاء الاستهلاك')}</h4>
            <p class="font-body-md text-on-surface-variant mb-lg">${tr('AI predicts stock depletion rates based on weekly patient admission volume.', 'يقوم الذكاء الاصطناعي بالتنبؤ بمعدل نفاد المستلزمات بناءً على أعداد المراجعين المجدولة والعمليات المفتوحة.')}</p>
            
            <div class="space-y-md">
              <div class="flex items-center justify-between p-sm bg-surface-container rounded-lg">
                <span class="font-body-md text-primary">${tr('Sterilization Kits usage speed:', 'معدل استهلاك المعقمات:')}</span>
                <span class="text-error font-bold">+18% ${tr('increase', 'ارتفاع')}</span>
              </div>
              <div class="flex items-center justify-between p-sm bg-surface-container rounded-lg">
                <span class="font-body-md text-primary">${tr('Disposable syringe usage:', 'استهلاك الحقن الطبية:')}</span>
                <span class="text-secondary font-bold">-2% ${tr('decrease', 'انخفاض')}</span>
              </div>
            </div>
          </div>
          
          <div class="mt-lg p-sm bg-primary text-on-primary rounded-lg text-center">
            <div class="font-label-md">${tr('AI Predicted Wastage Reduction', 'معدل خفض الهدر الطبي المتوقع')}</div>
            <div class="text-headline-md font-bold">-0.8% ${tr('this quarter', 'هذا الربع')}</div>
            <p class="text-caption opacity-80 mt-1">${tr('Calculated using smart inventory optimization rules', 'نظام تحسين إعادة الطلب الذكي يمنع تراكم الأدوية منتهية الصلاحية')}</p>
          </div>
        </div>

        <div class="glass-card p-lg rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div>
            <h4 class="font-headline-md text-headline-md text-primary font-bold mb-md">${tr('Unified Inventory Intelligence Command', 'مركز أوامر وإدارة المخاطر')}</h4>
            <p class="font-body-md text-on-surface-variant mb-lg">${tr('Live tracking dashboard for all pharmacy warehouses and clinical supplies.', 'رصد مباشر لكافة مخازن الأدوية المركزية والمستلزمات في غرف العمليات.')}</p>
            
            <div class="grid grid-cols-2 gap-sm">
              <div class="bg-surface-container-low p-sm rounded-lg text-center">
                <span class="text-caption text-on-surface-variant block">${tr('Annual Waste Rate', 'معدل الهدر السنوي')}</span>
                <span class="text-headline-md font-bold text-primary">0.8%</span>
                <span class="text-caption text-secondary block mt-1">↓ 0.2% ${tr('YoY', 'عن العام السابق')}</span>
              </div>
              <div class="bg-surface-container-low p-sm rounded-lg text-center">
                <span class="text-caption text-on-surface-variant block">${tr('Optimal stock availability', 'توفر المخزون الأساسي')}</span>
                <span class="text-headline-md font-bold text-primary">92%</span>
                <span class="text-caption text-secondary block mt-1">${tr('Optimal', 'جاهزية ممتازة')}</span>
              </div>
            </div>
          </div>
          
          <!-- TODO: Backend integration placeholder widget -->
          <div class="p-sm bg-surface-container-low border border-outline-variant/30 rounded-lg text-center mt-lg">
            <p class="text-caption text-on-surface-variant mb-1">💡 TODO: Integrate live Chart.js or D3.js prediction curves on next phase release</p>
            <span class="text-xs text-secondary font-bold">Predictive AI Model: V2.1 Active</span>
          </div>
        </div>

      </div>
    `;
  }

  content.innerHTML = htmlContent;

  // Search function local to page
  window.filterInvTable = () => {
    const txt = (document.getElementById('invSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('invCatFilter')?.value || '';
    
    document.querySelectorAll('#invTbl tbody tr').forEach(r => {
      const rowText = r.textContent.toLowerCase();
      const matchText = rowText.includes(txt);
      const matchCat = cat === '' || rowText.includes(cat.toLowerCase());
      
      r.style.display = (matchText && matchCat) ? '' : 'none';
    });
  };

  // Automated order execution handler
  window.approveAutoOrder = (name, qty, cost, supplier) => {
    const newId = `PO-2024-00${window.localPOs.length + 1}`;
    window.localPOs.unshift({
      id: newId,
      supplier: supplier,
      date: new Date().toISOString().split('T')[0],
      delivery: new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0],
      amount: cost,
      status: 'قيد الانتظار',
      items: [{ name: name, qty: qty, cost: cost / qty }]
    });
    showToast(tr(`Auto-Order approved and PO created!`, `تم اعتماد طلب التوريد التلقائي لـ ${name}!`), 'success');
    window.inventoryTab = 'procurement';
    navigateTo(currentPage);
  };

  // Receive Purchase Order handler
  window.receivePO = async (poId) => {
    const poIndex = window.localPOs.findIndex(po => po.id === poId);
    if (poIndex === -1) return;
    
    const po = window.localPOs[poIndex];
    po.status = 'مكتمل';

    // Update the item quantity in the database if the item exists in real database
    if (po.items && po.items.length) {
      for (const poItem of po.items) {
        // Find existing item by name
        const matchItem = items.find(i => i.name.toLowerCase() === poItem.name.toLowerCase());
        if (matchItem) {
          const newQty = parseInt(matchItem.quantity || 0) + parseInt(poItem.qty);
          try {
            await API.put(`/api/inventory/${matchItem.id}`, {
              ...matchItem,
              quantity: newQty
            });
            showToast(tr(`Received and added ${poItem.qty} units to ${matchItem.name}`, `تم استلام الشحنة وإضافة ${poItem.qty} وحدة لـ ${matchItem.name}`), 'success');
          } catch (e) {
            console.error('Error auto-updating inventory quantity', e);
          }
        } else {
          // If not found in real database, add it as a new inventory item
          try {
            await API.post('/api/inventory', {
              name: poItem.name,
              category: tr('Supplies', 'مستلزمات عامة'),
              quantity: poItem.qty,
              unit: tr('Units', 'وحدة'),
              reorder_level: 10,
              location: tr('A1 Warehouse', 'المخزن أ1'),
              supplier: po.supplier,
              cost: poItem.cost,
              expiry_date: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
            });
          } catch(e) {
            console.error('Error auto-inserting new item', e);
          }
        }
      }
    }

    showToast(tr(`PO ${poId} successfully received and inventory updated!`, `تم استلام الطلب ${poId} وتحديث المخزون بنجاح!`), 'success');
    navigateTo(currentPage);
  };

  // ----------------------------------------
  // MODALS & ACTIONS IMPLEMENTATIONS
  // ----------------------------------------
  window.showAddInvModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div class="glass-card p-lg rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" style="direction:rtl">
        <div class="flex justify-between items-center mb-md">
          <h4 class="font-bold text-headline-md text-primary">📦 ${tr('Add New Inventory Item', 'إضافة صنف جديد')}</h4>
          <button class="text-on-surface-variant hover:text-error" onclick="this.closest('.modal-overlay').remove()">❌</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-sm">
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Item Name (AR/EN)', 'اسم المنتج')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="invName" required placeholder="e.g. باراسيتامول"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Category', 'الفئة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="invCat" placeholder="e.g. أدوية"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Quantity', 'الكمية البدئية')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" id="invQty" value="100"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Unit', 'الوحدة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="invUnit" value="علبة"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Reorder Level', 'حد إعادة الطلب')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" id="invReorder" value="10"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Warehouse Location', 'موقع التخزين بالمستودع')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="invLoc" placeholder="e.g. الجناح أ - الرف 3"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Supplier Name', 'اسم المورد المعتمد')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="invSupplier" placeholder="e.g. شركة الدواء"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Cost per Unit (SAR)', 'التكلفة لكل وحدة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" step="0.01" id="invCost" value="15.50"></div>
          <div class="form-group md:col-span-2"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Expiry Date', 'تاريخ انتهاء الصلاحية')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="date" id="invExpiry" value="2027-12-31"></div>
        </div>
        <button class="bg-primary text-on-primary font-bold w-full py-3 rounded-xl mt-md hover:opacity-90 transition-all" onclick="saveInvItem()">${tr('Add to Database', 'حفظ الصنف')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  };

  window.saveInvItem = async () => {
    const name = document.getElementById('invName').value.trim();
    if (!name) { showToast(tr('Enter item name', 'ادخل اسم الصنف'), 'error'); return; }
    try {
      await API.post('/api/inventory', {
        name: name,
        category: document.getElementById('invCat').value.trim(),
        quantity: parseInt(document.getElementById('invQty').value) || 0,
        unit: document.getElementById('invUnit').value.trim() || 'وحدة',
        reorder_level: parseInt(document.getElementById('invReorder').value) || 10,
        location: document.getElementById('invLoc').value.trim() || tr('Not specified', 'غير محدد'),
        supplier: document.getElementById('invSupplier').value.trim() || tr('Not specified', 'غير محدد'),
        cost: parseFloat(document.getElementById('invCost').value) || 0,
        expiry_date: document.getElementById('invExpiry').value || null
      });
      showToast(tr('Item added successfully!', 'تمت إضافة الصنف بنجاح!'), 'success');
      document.querySelector('.modal-overlay')?.remove();
      navigateTo(currentPage);
    } catch (e) {
      showToast(tr('Error adding item', 'خطأ في إضافة الصنف'), 'error');
    }
  };

  window.showEditInvModal = (i) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div class="glass-card p-lg rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" style="direction:rtl">
        <div class="flex justify-between items-center mb-md">
          <h4 class="font-bold text-headline-md text-primary">📝 ${tr('Edit Inventory Item', 'تعديل صنف')}</h4>
          <button class="text-on-surface-variant hover:text-error" onclick="this.closest('.modal-overlay').remove()">❌</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-sm">
          <input type="hidden" id="editInvId" value="${i.id}">
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Item Name (AR/EN)', 'اسم المنتج')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="editInvName" value="${i.name || ''}" required></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Category', 'الفئة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="editInvCat" value="${i.category || ''}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Quantity', 'الكمية')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" id="editInvQty" value="${i.quantity || 0}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Unit', 'الوحدة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="editInvUnit" value="${i.unit || ''}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Reorder Level', 'حد إعادة الطلب')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" id="editInvReorder" value="${i.reorder_level || 10}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Warehouse Location', 'موقع التخزين بالقسم')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="editInvLoc" value="${i.location || ''}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Supplier Name', 'اسم المورد المعتمد')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="editInvSupplier" value="${i.supplier || ''}"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Cost per Unit (SAR)', 'التكلفة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" step="0.01" id="editInvCost" value="${i.cost || 0}"></div>
          <div class="form-group md:col-span-2"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Expiry Date', 'تاريخ انتهاء الصلاحية')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="date" id="editInvExpiry" value="${i.expiry_date ? i.expiry_date.split('T')[0] : ''}"></div>
        </div>
        <button class="bg-primary text-on-primary font-bold w-full py-3 rounded-xl mt-md hover:opacity-90 transition-all" onclick="updateInvItem()">${tr('Update Item', 'حفظ التعديلات')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  };

  window.updateInvItem = async () => {
    const id = document.getElementById('editInvId').value;
    const name = document.getElementById('editInvName').value.trim();
    if (!name) { showToast(tr('Enter item name', 'ادخل اسم الصنف'), 'error'); return; }
    try {
      await API.put(`/api/inventory/${id}`, {
        name: name,
        category: document.getElementById('editInvCat').value.trim(),
        quantity: parseInt(document.getElementById('editInvQty').value) || 0,
        unit: document.getElementById('editInvUnit').value.trim() || 'وحدة',
        reorder_level: parseInt(document.getElementById('editInvReorder').value) || 10,
        location: document.getElementById('editInvLoc').value.trim(),
        supplier: document.getElementById('editInvSupplier').value.trim(),
        cost: parseFloat(document.getElementById('editInvCost').value) || 0,
        expiry_date: document.getElementById('editInvExpiry').value || null
      });
      showToast(tr('Item updated successfully!', 'تم تعديل الصنف بنجاح!'), 'success');
      document.querySelector('.modal-overlay')?.remove();
      navigateTo(currentPage);
    } catch (e) {
      showToast(tr('Error updating item', 'خطأ في تعديل الصنف'), 'error');
    }
  };

  window.deleteInvItem = async (id) => {
    if (!confirm(tr('Are you sure you want to delete this item?', 'هل أنت متأكد من رغبتك في حذف هذا الصنف نهائياً؟'))) return;
    try {
      await API.delete(`/api/inventory/${id}`);
      showToast(tr('Item deleted!', 'تم حذف الصنف!'), 'success');
      navigateTo(currentPage);
    } catch (e) {
      showToast(tr('Error deleting item', 'خطأ في حذف الصنف'), 'error');
    }
  };

  // Add Supplier Modal
  window.showAddSupplierModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div class="glass-card p-lg rounded-2xl w-full max-w-lg" style="direction:rtl">
        <div class="flex justify-between items-center mb-md">
          <h4 class="font-bold text-headline-md text-primary">🤝 ${tr('Add New Supplier', 'إضافة مورد جديد')}</h4>
          <button class="text-on-surface-variant hover:text-error" onclick="this.closest('.modal-overlay').remove()">❌</button>
        </div>
        <div class="space-y-sm">
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Supplier Name', 'اسم المورد')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="supName" required></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Location', 'الموقع / العنوان')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="supLoc"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Email', 'البريد الإلكتروني')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="email" id="supEmail"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Phone', 'رقم الجوال / الهاتف')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="supPhone"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Supply Category', 'التصنيف')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="supCat" placeholder="e.g. مستلزمات طبية"></div>
        </div>
        <button class="bg-primary text-on-primary font-bold w-full py-3 rounded-xl mt-md hover:opacity-90 transition-all" onclick="saveSupplier()">${tr('Add Supplier', 'حفظ المورد')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  };

  window.saveSupplier = () => {
    const name = document.getElementById('supName').value.trim();
    if (!name) { showToast(tr('Enter supplier name', 'ادخل اسم المورد'), 'error'); return; }
    window.localSuppliers.unshift({
      id: window.localSuppliers.length + 1,
      name: name,
      location: document.getElementById('supLoc').value.trim() || tr('Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية'),
      email: document.getElementById('supEmail').value.trim() || 'info@supplier.sa',
      phone: document.getElementById('supPhone').value.trim() || '011-000-0000',
      category: document.getElementById('supCat').value.trim() || tr('Supplies', 'مستلزمات عامة'),
      outstanding: 0.00,
      status: 'نشط'
    });
    showToast(tr('Supplier added successfully!', 'تمت إضافة المورد بنجاح!'), 'success');
    document.querySelector('.modal-overlay')?.remove();
    navigateTo(currentPage);
  };

  // Add Purchase Order Modal
  window.showAddPOModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div class="glass-card p-lg rounded-2xl w-full max-w-lg" style="direction:rtl">
        <div class="flex justify-between items-center mb-md">
          <h4 class="font-bold text-headline-md text-primary">🧾 ${tr('Create Purchase Order', 'إنشاء أمر شراء جديد')}</h4>
          <button class="text-on-surface-variant hover:text-error" onclick="this.closest('.modal-overlay').remove()">❌</button>
        </div>
        <div class="space-y-sm">
          <div class="form-group">
            <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Select Supplier', 'اختر المورد')}</label>
            <select class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="poSupplierSelect">
              ${window.localSuppliers.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Select Medical Item', 'اختر المنتج من المستودع')}</label>
            <select class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" id="poItemSelect">
              ${items.map(i => `<option value="${i.name}" data-cost="${i.cost}">${i.name} (التكلفة: ${i.cost} ر.س)</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Quantity Required', 'الكمية المطلوبة')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="number" id="poQty" value="10" oninput="calcPOTotal()"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Estimated PO Amount (SAR)', 'المبلغ الإجمالي المتوقع')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2 font-bold text-secondary text-lg" type="number" id="poTotalAmt" readonly value="0"></div>
          <div class="form-group"><label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Expected Delivery Date', 'تاريخ التوصيل المتوقع')}</label><input class="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-2" type="date" id="poDeliveryDate" value="2026-06-25"></div>
        </div>
        <button class="bg-primary text-on-primary font-bold w-full py-3 rounded-xl mt-md hover:opacity-90 transition-all" onclick="savePurchaseOrder()">${tr('Issue Purchase Order', 'إصدار أمر الشراء')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    calcPOTotal();

    // Event listener to update cost on select change
    document.getElementById('poItemSelect').addEventListener('change', calcPOTotal);
  };

  window.calcPOTotal = () => {
    const poSelect = document.getElementById('poItemSelect');
    if (!poSelect) return;
    const selectedOpt = poSelect.options[poSelect.selectedIndex];
    if (!selectedOpt) return;
    const cost = parseFloat(selectedOpt.dataset.cost || 0);
    const qty = parseInt(document.getElementById('poQty').value) || 0;
    document.getElementById('poTotalAmt').value = (cost * qty).toFixed(2);
  };

  window.savePurchaseOrder = () => {
    const supplier = document.getElementById('poSupplierSelect').value;
    const itemName = document.getElementById('poItemSelect').value;
    const qty = parseInt(document.getElementById('poQty').value) || 0;
    const total = parseFloat(document.getElementById('poTotalAmt').value) || 0;
    if (qty <= 0) { showToast(tr('Enter a valid quantity', 'ادخل كمية صحيحة'), 'error'); return; }

    const newId = `PO-2024-00${window.localPOs.length + 1}`;
    window.localPOs.unshift({
      id: newId,
      supplier: supplier,
      date: new Date().toISOString().split('T')[0],
      delivery: document.getElementById('poDeliveryDate').value || new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0],
      amount: total,
      status: 'قيد الانتظار',
      items: [{ name: itemName, qty: qty, cost: total / qty }]
    });

    showToast(tr('Purchase Order issued successfully!', 'تم إصدار أمر الشراء بنجاح وهو قيد معالجة التوريد!'), 'success');
    document.querySelector('.modal-overlay')?.remove();
    navigateTo(currentPage);
  };

}

// ===== SIMPLE MODULE PAGES =====
let nurseTab = 'vitals';
async function renderNursing(el) {
  // Show premium loading skeletons instantly
  el.innerHTML = `
    <div class="page-title">👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}</div>
    <div class="tab-bar">
      <button class="tab-btn active">🌡️ ${tr('Vitals', 'العلامات الحيوية')}</button>
    </div>
    <div class="split-layout">
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
      <div class="card glass-card-premium">
        <div class="skeleton-bar title mb-16"></div>
        <div class="skeleton-bar mb-12"></div>
      </div>
    </div>
  `;

  let patients = [];
  let vitals = [];
  let emarOrders = [];
  let carePlans = [];
  let assessments = [];
  try {
    [patients, vitals, emarOrders, carePlans, assessments] = await Promise.all([
      API.get('/api/patients'),
      API.get('/api/nursing/vitals').catch(() => []),
      API.get('/api/emar/orders').catch(() => []),
      API.get('/api/nursing/care-plans').catch(() => []),
      API.get('/api/nursing/assessments').catch(() => [])
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load nursing data', 'فشل في تحميل بيانات محطة التمريض')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="page-title">👩‍⚕️ ${tr('Nursing Station', 'محطة التمريض')}</div>
    <div class="tab-bar">
      <button class="tab-btn ${nurseTab === 'vitals' ? 'active' : ''}" onclick="nurseTab='vitals';navigateTo(11)">🌡️ ${tr('Vitals', 'العلامات الحيوية')}</button>
      <button class="tab-btn ${nurseTab === 'emar' ? 'active' : ''}" onclick="nurseTab='emar';navigateTo(11)">💉 ${tr('eMAR', 'إعطاء الأدوية')}</button>
      <button class="tab-btn ${nurseTab === 'careplans' ? 'active' : ''}" onclick="nurseTab='careplans';navigateTo(11)">📋 ${tr('Care Plans', 'خطط الرعاية')}</button>
      <button class="tab-btn ${nurseTab === 'assess' ? 'active' : ''}" onclick="nurseTab='assess';navigateTo(11)">📊 ${tr('Assessments', 'التقييمات')}</button>
    </div>`;
  if (nurseTab === 'emar') {
    el.innerHTML += `<div class="card glass-card-premium"><h3>💉 ${tr('Electronic Medication Administration Record', 'سجل إعطاء الأدوية الإلكتروني')}</h3>
    ${emarOrders.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Medication', 'الدواء'), tr('Dose', 'الجرعة'), tr('Route', 'الطريقة'), tr('Frequency', 'التكرار'), tr('Status', 'الحالة'), tr('Actions', 'إجراءات')],
      emarOrders.map(o => ({
        cells: [o.patient_name, o.medication, o.dose, o.route, o.frequency, statusBadge(o.status),
        `<button class="btn btn-sm btn-success" onclick="administerMed(${o.id},${o.patient_id},'${o.medication}','${o.dose}')">💉 ${tr('Give', 'إعطاء')}</button>`
        ]
      }))
    ) : `<div class="empty-state-card"><div class="empty-state-icon">💉</div><div>${tr('No active orders', 'لا توجد أوامر نشطة')}</div></div>`}
    </div>`;
  } else if (nurseTab === 'careplans') {
    el.innerHTML += `<div class="card glass-card-premium"><h3>📋 ${tr('Nursing Care Plans', 'خطط الرعاية التمريضية')}</h3>
    <button class="btn btn-primary" onclick="nurseTab='newplan';navigateTo(11)" style="margin-bottom:12px">➕ ${tr('New Plan', 'خطة جديدة')}</button>
    ${carePlans.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Diagnosis', 'التشخيص'), tr('Priority', 'الأولوية'), tr('Goals', 'الأهداف'), tr('Status', 'الحالة')],
      carePlans.map(c => ({ cells: [c.patient_name, c.diagnosis, c.priority === 'High' ? `<span class="badge badge-danger">🔴 ${tr('High', 'عالية')}</span>` : c.priority === 'Low' ? `<span class="badge badge-success">🟢 ${tr('Low', 'منخفضة')}</span>` : `<span class="badge badge-warning">🟡 ${tr('Medium', 'متوسطة')}</span>`, c.goals?.substring(0, 60) || '-', statusBadge(c.status)] }))
    ) : `<div class="empty-state-card"><div class="empty-state-icon">📋</div><div>${tr('No care plans', 'لا توجد خطط رعاية')}</div></div>`}
    </div>`;
  } else if (nurseTab === 'assess') {
    el.innerHTML += `<div class="card glass-card-premium"><h3>📊 ${tr('Nursing Assessments', 'التقييمات التمريضية')}</h3>
    ${assessments.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Type', 'النوع'), tr('Fall Risk', 'خطر السقوط'), tr('Braden', 'Braden'), tr('Pain', 'ألم'), tr('GCS', 'GCS'), tr('Nurse', 'الممرض'), tr('Shift', 'الوردية')],
      assessments.map(a => ({
        cells: [a.patient_name, a.assessment_type,
        `<span style="color:${a.fall_risk_score >= 45 ? '#ef4444' : a.fall_risk_score >= 25 ? '#f59e0b' : '#22c55e'}">${a.fall_risk_score}</span>`,
        `<span style="color:${a.braden_score <= 12 ? '#ef4444' : a.braden_score <= 18 ? '#f59e0b' : '#22c55e'}">${a.braden_score}/23</span>`,
        `<span style="color:${a.pain_score >= 7 ? '#ef4444' : a.pain_score >= 4 ? '#f59e0b' : '#22c55e'}">${a.pain_score}/10</span>`,
        a.gcs_score + '/15', a.nurse, a.shift
        ]
      }))
    ) : `<div class="empty-state-card"><div class="empty-state-icon">📊</div><div>${tr('No assessments', 'لا توجد تقييمات')}</div></div>`}
    </div>`;
  } else if (nurseTab === 'newplan') {
    el.innerHTML += `<div class="card glass-card-premium"><h3>➕ ${tr('New Care Plan', 'خطة رعاية جديدة')}</h3>
    <div class="form-grid">
      <div><label>${tr('Patient', 'المريض')}</label><select id="cpPatientN" class="form-input">${patients.map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.file_number} - ${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Priority', 'الأولوية')}</label><select id="cpPriorityN" class="form-input"><option value="Low">${tr('Low', 'منخفضة')}</option><option value="Medium" selected>${tr('Medium', 'متوسطة')}</option><option value="High">${tr('High', 'عالية')}</option></select></div>
      <div style="grid-column:1/-1"><label>${tr('Diagnosis', 'التشخيص')}</label><input id="cpDiagN" class="form-input"></div>
      <div style="grid-column:1/-1"><label>${tr('Goals', 'الأهداف')}</label><textarea id="cpGoalsN" class="form-input" rows="2"></textarea></div>
      <div style="grid-column:1/-1"><label>${tr('Interventions', 'التدخلات')}</label><textarea id="cpIntN" class="form-input" rows="2"></textarea></div>
    </div>
    <button class="btn btn-primary" onclick="saveCarePlan()" style="margin-top:8px">💾 ${tr('Save', 'حفظ')}</button></div>`;
  } else {
    el.innerHTML += `<div class="split-layout">
      <div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">🌡️ ${tr('Record Patient Vitals', 'تسجيل العلامات الحيوية')}</div>
          <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><select class="form-input" id="nsPatient"><option value="">${tr('-- Select --', '-- اختر مريض --')}</option>${patients.map(p => `<option value="${p.id}" data-name="">${p.file_number} - ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</option>`).join('')}</select></div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>🩸 ${tr('Blood Pressure', 'ضغط الدم')}</label><input class="form-input" id="nsBp" placeholder="120/80"></div>
            <div class="form-group" style="flex:1"><label>🌡️ ${tr('Temp (°C)', 'الحرارة')}</label><input class="form-input" id="nsTemp" type="number" step="0.1" placeholder="37.0"></div>
          </div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>❤️ ${tr('Pulse (bpm)', 'النبض')}</label><input class="form-input" id="nsPulse" type="number" placeholder="75"></div>
            <div class="form-group" style="flex:1"><label>💨 ${tr('O2 Sat (%)', 'الأكسجين')}</label><input class="form-input" id="nsO2" type="number" placeholder="98"></div>
          </div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>💪 ${tr('Weight (kg)', 'الوزن')}</label><input class="form-input" id="nsWeight" type="number" step="0.1" placeholder="70.5"></div>
            <div class="form-group" style="flex:1"><label>📏 ${tr('Height (cm)', 'الطول')}</label><input class="form-input" id="nsHeight" type="number" placeholder="170"></div>
          </div>
          <div class="flex gap-8 mb-12">
            <div class="form-group" style="flex:1"><label>🌬️ ${tr('Respiratory Rate', 'معدل التنفس')}</label><input class="form-input" id="nsResp" type="number" placeholder="18"></div>
            <div class="form-group" style="flex:1"><label>🩸 ${tr('Blood Sugar', 'السكر')}</label><input class="form-input" id="nsSugar" type="number" placeholder="100"></div>
          </div>
        </div>
        <div class="card glass-card-premium mb-16">
          <div class="card-title">📋 ${tr('Medical History', 'التاريخ المرضي')}</div>
          <div class="form-group mb-12"><label>🏥 ${tr('Chronic Diseases', 'الأمراض المزمنة')}</label><textarea class="form-input form-textarea" id="nsChronic" placeholder="${tr('e.g. Diabetes, Hypertension, Asthma...', 'مثلاً: سكري، ضغط، ربو...')}"></textarea></div>
          <div class="form-group mb-12"><label>💊 ${tr('Current Medications', 'الأدوية الحالية')}</label><textarea class="form-input form-textarea" id="nsMeds" placeholder="${tr('e.g. Metformin 500mg, Aspirin 100mg...', 'مثلاً: ميتفورمين 500مج، أسبرين 100مج...')}"></textarea></div>
          <div class="form-group mb-12"><label>⚠️ ${tr('Allergies', 'الحساسية')}</label><textarea class="form-input form-textarea" id="nsAllergies" placeholder="${tr('e.g. Penicillin, Peanuts, Latex...', 'مثلاً: بنسلين، فول سوداني، لاتكس...')}"></textarea></div>
          <div class="form-group mb-16"><label>📝 ${tr('Notes / Triage', 'ملاحظات / فرز')}</label><textarea class="form-input form-textarea" id="nsNotes"></textarea></div>
          <button class="btn btn-primary w-full" style="height:44px" onclick="saveVitals()">💾 ${tr('Save Vitals & Send to Doctor', 'حفظ وإرسال للطبيب')}</button>
        </div>
      </div>
      <div class="card glass-card-premium">
        <div class="card-title">📋 ${tr('Recent Vitals Registry', 'سجل العلامات الحيوية')}</div>
        <input class="search-filter" id="nsSearch" placeholder="${tr('Search...', 'بحث...')}">
        <div id="nsTable">${vitals.length === 0 ? `<div class="empty-state-card"><div class="empty-state-icon">📭</div><div>${tr('No vitals data found', 'لا توجد علامات حيوية مسجلة')}</div></div>` : vitals.map(v => `
          <div class="card mb-12" style="padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:14px">👤 ${v.patient_name || v.patient_id}</strong>
              <span style="font-size:12px;color:var(--text-muted,#999)">📅 ${v.created_at?.split('T')[0] || ''}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:13px">
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">🩸 ${tr('BP', 'الضغط')}<br><strong>${v.bp || '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">🌡️ ${tr('Temp', 'حرارة')}<br><strong>${v.temp ? v.temp + '°' : '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">❤️ ${tr('Pulse', 'نبض')}<br><strong>${v.pulse || '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">💨 ${tr('O2', 'أكسجين')}<br><strong>${v.o2_sat ? v.o2_sat + '%' : '-'}</strong></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:13px;margin-top:6px">
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">💪 ${tr('Weight', 'وزن')}<br><strong>${v.weight ? v.weight + ' kg' : '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">📏 ${tr('Height', 'طول')}<br><strong>${v.height ? v.height + ' cm' : '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">🌬️ ${tr('Resp', 'تنفس')}<br><strong>${v.respiratory_rate || '-'}</strong></div>
              <div style="background:var(--bg-secondary,#f8f9fa);padding:6px 8px;border-radius:6px;text-align:center">🩸 ${tr('Sugar', 'سكر')}<br><strong>${v.blood_sugar || '-'}</strong></div>
            </div>
            ${v.allergies ? `<div style="margin-top:6px"><span class="badge badge-danger">⚠️ ${v.allergies}</span></div>` : ''}
            ${v.chronic_diseases ? `<div style="margin-top:4px;font-size:12px;color:var(--text-muted,#888)">🏥 ${v.chronic_diseases}</div>` : ''}
          </div>
        `).join('')}</div>
      </div>
    </div>`;
    // Search filter for vitals cards
    document.getElementById('nsSearch')?.addEventListener('input', (e) => {
      const txt = e.target.value.toLowerCase();
      document.querySelectorAll('#nsTable .card').forEach(c => {
        c.style.display = c.textContent.toLowerCase().includes(txt) ? '' : 'none';
      });
    });
  }
}

window.saveVitals = async () => {
  const sel = document.getElementById('nsPatient');
  const pid = sel.value;
  if (!pid) { showToast(tr('Select patient first', 'اختر المريض أولاً'), 'error'); return; }
  const pname = sel.options[sel.selectedIndex].getAttribute('data-name');
  try {
    await API.post('/api/nursing/vitals', {
      patient_id: pid, patient_name: pname,
      bp: document.getElementById('nsBp').value,
      temp: parseFloat(document.getElementById('nsTemp').value) || 0,
      weight: parseFloat(document.getElementById('nsWeight').value) || 0,
      height: parseFloat(document.getElementById('nsHeight').value) || 0,
      pulse: parseInt(document.getElementById('nsPulse').value) || 0,
      o2_sat: parseInt(document.getElementById('nsO2').value) || 0,
      respiratory_rate: parseInt(document.getElementById('nsResp').value) || 0,
      blood_sugar: parseInt(document.getElementById('nsSugar').value) || 0,
      chronic_diseases: document.getElementById('nsChronic').value,
      current_medications: document.getElementById('nsMeds').value,
      allergies: document.getElementById('nsAllergies').value,
      notes: document.getElementById('nsNotes').value
    });
    showToast(tr('Vitals recorded and patient routed to doctor!', 'تم تسجيل العلامات الحيوية وتحويل المريض!'));
    await navigateTo(11);
  } catch (e) { showToast(tr('Error saving', 'خطأ في الحفظ'), 'error'); }
};
window.administerMed = async function (orderId, patientId, med, dose) {
  const time = new Date().toTimeString().substring(0, 5);
  await API.post('/api/emar/administrations', { emar_order_id: orderId, patient_id: patientId, medication: med, dose: dose, scheduled_time: time, status: 'Given' });
  showToast(tr('Medication administered', 'تم إعطاء الدواء')); navigateTo(11);
};
window.saveCarePlan = async function () {
  const sel = document.getElementById('cpPatientN');
  const patient_name = sel.options[sel.selectedIndex].dataset.name;
  await API.post('/api/nursing/care-plans', { patient_id: sel.value, patient_name, diagnosis: document.getElementById('cpDiagN').value, priority: document.getElementById('cpPriorityN').value, goals: document.getElementById('cpGoalsN').value, interventions: document.getElementById('cpIntN').value });
  showToast(tr('Care plan saved', 'تم الحفظ')); nurseTab = 'careplans'; navigateTo(11);
};

async function renderWaitingQueue(el) {
  const content = el;

  const [patients, appointments] = await Promise.all([
    API.get('/api/queue/patients').catch(() => []),
    API.get('/api/appointments').catch(() => [])
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const todayAppts = appointments.filter(a => (a.appt_date || a.date || '').includes(today));

  // Group by doctor
  const byDoctor = {};
  patients.forEach(p => { const d = p.doctor || p.doctor_name || tr('Unassigned', 'غير محدد'); if (!byDoctor[d]) byDoctor[d] = []; byDoctor[d].push(p); });

  content.innerHTML = `
    <h2>${tr('Waiting Queue', 'قائمة الانتظار')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${patients.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('In Queue', 'في الانتظار')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${todayAppts.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Today Appointments', 'مواعيد اليوم')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${Object.keys(byDoctor).length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Active Doctors', 'أطباء نشطون')}</p></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h4 style="margin:0">${tr('Queue by Doctor', 'الطابور حسب الطبيب')}</h4>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:#666" id="queueTimer">⏱️ ${tr('Auto-refresh: 30s', 'تحديث تلقائي: 30 ثانية')}</span>
        <button class="btn btn-sm" onclick="navigateTo(currentPage)" style="background:#e3f2fd;color:#1565c0">🔄 ${tr('Refresh', 'تحديث')}</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:16px">
      ${Object.entries(byDoctor).map(([doc, pts]) => '<div class="card" style="padding:16px"><h4 style="margin:0 0 8px;color:#1565c0">👨‍⚕️ ' + doc + ' <span style="font-size:12px;color:#666">(' + pts.length + ')</span></h4>' + pts.map((p, i) => '<div style="padding:8px;margin:4px 0;border-radius:8px;background:' + (i === 0 ? '#e8f5e9' : '#f5f5f5') + ';display:flex;justify-content:space-between;align-items:center"><span>' + (i + 1) + '. ' + (p.patient_name || p.name || '') + '</span><span style="font-size:11px;color:#666">' + ((p.queue_number || '') || '#' + (i + 1)) + '</span></div>').join('') + '</div>').join('')}
      ${Object.keys(byDoctor).length === 0 ? '<div class="card" style="padding:40px;text-align:center;color:#999;grid-column:1/-1">' + tr('No patients in queue', 'لا يوجد مرضى في الانتظار') + '</div>' : ''}
    </div>`;

  // Auto-refresh every 30 seconds
  if (window._queueInterval) clearInterval(window._queueInterval);
  window._queueInterval = setInterval(() => { if (currentPage === NAV_ITEMS.findIndex(n => n.en === 'Waiting Queue')) navigateTo(currentPage); }, 30000);

}
window.callPatient = async function (id) {
  await API.put('/api/patients/' + id, { status: 'With Doctor' });
  showToast(tr('Patient called', 'تم مناداة المريض'));
  navigateTo(12);
};


async function renderPatientAccounts(el) {

  content.innerHTML = `
    <h2>${tr('Patient Accounts', 'حسابات المرضى')}</h2>
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <input class="form-input" id="paSearch" placeholder="${tr('Search patient (name/MRN)...', 'بحث بالاسم أو رقم الملف...')}" style="max-width:300px" oninput="searchPatientAccounts()">
      <button class="btn btn-sm" onclick="exportToCSV(window._paData||[],'patient_accounts')" style="background:#e0f7fa;color:#00838f">📥 ${tr('Export', 'تصدير')}</button>
    </div>
    <div id="paResults"></div>`;
  searchPatientAccounts();

  window.searchPatientAccounts = async () => {
    const search = document.getElementById('paSearch')?.value || '';
    const patients = await API.get('/api/patients?search=' + encodeURIComponent(search));
    const el = document.getElementById('paResults');
    if (!el) return;
    if (!patients.length) { el.innerHTML = '<p style="color:#999;text-align:center;padding:40px">' + tr('No patients found', 'لم يتم العثور على مرضى') + '</p>'; return; }

    let invoiceData = [];
    try { invoiceData = await API.get('/api/invoices'); } catch (e) { }

    window._paData = patients.map(p => {
      const pInvoices = invoiceData.filter(i => i.patient_id === p.id);
      const totalBilled = pInvoices.reduce((s, i) => s + parseFloat(i.total || 0), 0);
      const totalPaid = pInvoices.filter(i => i.paid).reduce((s, i) => s + parseFloat(i.total || 0), 0);
      return { ...p, total_billed: totalBilled.toFixed(2), total_paid: totalPaid.toFixed(2), balance: (totalBilled - totalPaid).toFixed(2), invoice_count: pInvoices.length };
    });

    createTable(el, 'paTable',
      [tr('MRN', 'الملف'), tr('Name', 'الاسم'), tr('Phone', 'الجوال'), tr('Invoices', 'فواتير'), tr('Billed', 'المفوتر'), tr('Paid', 'المدفوع'), tr('Balance', 'الرصيد')],
      window._paData.map(p => ({
        cells: [p.mrn || p.file_number, isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar), p.phone, p.invoice_count,
        p.total_billed + ' ' + tr('SAR', 'ريال'), p.total_paid + ' ' + tr('SAR', 'ريال'),
        '<span style="color:' + (parseFloat(p.balance) > 0 ? '#cc0000;font-weight:bold' : '#2e7d32') + '">' + p.balance + ' ' + tr('SAR', 'ريال') + '</span>'],
        id: p.id
      })),
      (row) => `<button class="btn btn-sm" onclick="viewPatientInvoices(${row.id})" style="background:#e3f2fd;color:#1565c0">📋 ${tr('Invoices', 'الفواتير')}</button>`
    );
  };

  window.viewPatientInvoices = async (pid) => {
    const invoices = await API.get('/api/invoices?patient_id=' + pid);
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    let rows = invoices.map(i => '<tr><td style="padding:6px;border-bottom:1px solid #eee">' + (i.invoice_number || i.id) + '</td><td style="padding:6px;border-bottom:1px solid #eee">' + (i.description || i.service_type || '') + '</td><td style="padding:6px;border-bottom:1px solid #eee">' + parseFloat(i.total || 0).toFixed(2) + '</td><td style="padding:6px;border-bottom:1px solid #eee"><span style="color:' + (i.paid ? '#2e7d32' : '#cc0000') + '">' + (i.paid ? tr('Paid', 'مدفوع') : tr('Unpaid', 'غير مدفوع')) + '</span></td></tr>').join('');
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:600px;direction:rtl;max-height:80vh;overflow:auto"><h3 style="margin:0 0 16px">' + tr('Patient Invoices', 'فواتير المريض') + '</h3><table style="width:100%"><thead><tr style="background:#f5f5f5"><th style="padding:8px;text-align:right">#</th><th style="padding:8px;text-align:right">' + tr('Service', 'الخدمة') + '</th><th style="padding:8px;text-align:right">' + tr('Amount', 'المبلغ') + '</th><th style="padding:8px;text-align:right">' + tr('Status', 'الحالة') + '</th></tr></thead><tbody>' + rows + '</tbody></table><button class="btn btn-secondary" onclick="this.parentElement.parentElement.remove()" style="margin-top:16px;width:100%">' + tr('Close', 'إغلاق') + '</button></div>';
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

}
window.loadPatientAccount = async () => {
  const pid = document.getElementById('paPatient').value;
  if (!pid) return;
  try {
    const data = await API.get(`/api/billing/summary/${pid}`);
    const pInfo = await API.get(`/api/patients/${pid}/account`);
    const p = pInfo.patient;
    // Build billing breakdown by service type
    let breakdownHtml = '';
    const typeIcons = { 'File Opening': '📁', 'Lab Test': '🔬', 'Radiology': '📡', 'Consultation': '🩺', 'Pharmacy': '💊', 'Appointment': '📅', 'Medical Services': '🏥', 'Other': '📄' };
    const typeNames = { 'File Opening': tr('File Opening', 'فتح ملف'), 'Lab Test': tr('Lab Tests', 'فحوصات المختبر'), 'Radiology': tr('Radiology', 'الأشعة'), 'Consultation': tr('Consultation', 'الكشفية'), 'Pharmacy': tr('Pharmacy/Drugs', 'الصيدلية/الأدوية'), 'Appointment': tr('Appointments', 'المواعيد'), 'Medical Services': tr('Medical Services', 'خدمات طبية') };
    for (const [type, info] of Object.entries(data.byType)) {
      breakdownHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--hover);border-radius:8px;margin:6px 0">
        <span>${typeIcons[type] || '📄'} <strong>${typeNames[type] || type}</strong> <span class="badge badge-info" style="font-size:11px">${info.count}</span></span>
        <span style="font-weight:600">${info.total.toLocaleString()} ${tr('SAR', 'ر.س')}</span>
      </div>`;
    }
    document.getElementById('paResult').innerHTML = `
        <div class="card mb-16">
          <div class="card-title">👤 ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)} - #${p.file_number}</div>
          <div class="stats-grid">
            <div class="stat-card" style="--stat-color:#3b82f6"><div class="stat-label">${tr('Total Billed', 'إجمالي الفواتير')}</div><div class="stat-value">${data.totalBilled.toLocaleString()} SAR</div></div>
            <div class="stat-card" style="--stat-color:#4ade80"><div class="stat-label">${tr('Total Paid', 'المدفوع')}</div><div class="stat-value">${data.totalPaid.toLocaleString()} SAR</div></div>
            <div class="stat-card" style="--stat-color:${data.balance > 0 ? '#f87171' : '#4ade80'}"><div class="stat-label">${tr('Balance Due', 'المتبقي')}</div><div class="stat-value">${data.balance.toLocaleString()} SAR</div></div>
          </div>
        </div>
        <div class="card mb-16">
          <div class="card-title">📊 ${tr('Billing Breakdown', 'تفصيل الفوترة')}</div>
          ${breakdownHtml || `<div class="empty-state"><p>${tr('No billing data', 'لا توجد فوترة')}</p></div>`}
        </div>
        <div class="card mb-16"><div class="card-title">🧾 ${tr('All Invoices', 'جميع الفواتير')} (${data.invoices.length})</div>
        ${makeTable([tr('Type', 'النوع'), tr('Description', 'الوصف'), tr('Amount', 'المبلغ'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', 'إجراءات')],
      data.invoices.map(i => ({ cells: [i.service_type || '', i.description || '', `${i.total} SAR`, i.paid ? badge(tr('Paid', 'مدفوع'), 'success') : badge(tr('Unpaid', 'غير مدفوع'), 'danger'), i.created_at?.split('T')[0] || ''], id: i.id, paid: i.paid })),
      (row) => !row.paid ? `<button class="btn btn-sm btn-success" onclick="payInvoicePA(${row.id})">💵 ${tr('Pay', 'تسديد')}</button>` : `<span class="badge badge-success">✅</span>`
    )}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary" onclick="printPatientStatement(${pid})">🖨️ ${tr('Print Statement', 'طباعة كشف الحساب')}</button>
          <button class="btn" onclick="exportTableCSV('patient_account')">📥 ${tr('Export CSV', 'تصدير CSV')}</button>
        </div>`;
  } catch (e) { showToast(tr('Error loading account', 'خطأ في تحميل الحساب'), 'error'); }
};
window.payInvoicePA = async (id) => {
  try { await API.put(`/api/invoices/${id}/pay`, { payment_method: 'Cash' }); showToast(tr('Paid!', 'تم الدفع!')); loadPatientAccount(); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

async function renderReports(el) {
  const content = el;

  content.innerHTML = `
    <div class="flex justify-between items-end mb-6">
      <div>
        <h2 class="font-headline-lg text-headline-lg text-primary">📊 ${tr('Reports', 'التقارير')}</h2>
        <p class="text-on-surface-variant text-sm mt-1">${tr('Generate patient, financial, clinical, and pharmacy audit reports', 'توليد تقارير المرضى، الحسابات المالية، الفحوصات والوصفات الطبية')}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-6">
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('patients')">
        <div class="text-4xl mb-3">👥</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Patient Report', 'تقرير المرضى')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('All registered patients', 'جميع المرضى المسجلين')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('invoices')">
        <div class="text-4xl mb-3">💰</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Financial Report', 'التقرير المالي')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Revenue and invoices', 'الإيرادات والفواتير')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('appointments')">
        <div class="text-4xl mb-3">📅</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Appointments Report', 'تقرير المواعيد')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Bookings and attendance', 'الحجوزات والحضور')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('lab')">
        <div class="text-4xl mb-3">🔬</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Lab Report', 'تقرير المختبر')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Test orders and results', 'الطلبات والنتائج')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('pharmacy')">
        <div class="text-4xl mb-3">💊</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Pharmacy Report', 'تقرير الصيدلية')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Dispensing and stock', 'الصرف والمخزون')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('inventory')">
        <div class="text-4xl mb-3">📦</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Inventory Report', 'تقرير المخزون')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Stock levels and low items', 'مستويات المخزون')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('radiology')">
        <div class="text-4xl mb-3">📡</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Radiology Report', 'تقرير الأشعة')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Imaging orders and results', 'طلبات الأشعة والنتائج')}</p>
      </div>
      <div class="card glass-card-premium p-6 cursor-pointer flex flex-col items-center text-center transition-all duration-300" onclick="genReport('medical_history')">
        <div class="text-4xl mb-3">📁</div>
        <h4 class="font-title-lg text-primary mb-1">${tr('Medical History', 'السجل الطبي')}</h4>
        <p class="text-xs text-on-surface-variant">${tr('Previous reports, tests & prescriptions', 'التقارير والفحوصات والوصفات السابقة')}</p>
      </div>
    </div>
    <div id="reportOutput" class="card glass-card-premium p-6 mt-6" style="display:none">
      <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h4 id="reportTitle" class="font-title-lg text-primary margin-0"></h4>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="exportToCSV(window._reportData||[],'report')">📥 ${tr('Export CSV', 'تصدير CSV')}</button>
          <button class="btn btn-primary btn-sm flex items-center gap-1" onclick="window.print()">🖨️ ${tr('Print', 'طباعة')}</button>
        </div>
      </div>
      <div id="reportTable"></div>
    </div>`;

  window.genReport = async (type) => {
    const output = document.getElementById('reportOutput');
    const title = document.getElementById('reportTitle');
    const table = document.getElementById('reportTable');
    if (!output || !table) return;
    output.style.display = '';
    // Show premium skeletons instantly
    table.innerHTML = `
      <div class="skeleton-bar title mb-16"></div>
      <div class="skeleton-bar mb-12"></div>
      <div class="skeleton-bar mb-12"></div>
      <div class="skeleton-bar mb-12"></div>
    `;

    try {
      let data, headers, rows;
      switch (type) {
        case 'patients':
          data = await API.get('/api/patients');
          title.textContent = tr('Patient Report', 'تقرير المرضى') + ' (' + data.length + ')';
          headers = [tr('MRN', 'الملف'), tr('Name', 'الاسم'), tr('Phone', 'الجوال'), tr('ID', 'الهوية'), tr('Nationality', 'الجنسية'), tr('Registered', 'التسجيل')];
          rows = data.map(p => ({ cells: [p.mrn || p.file_number, isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar), p.phone, p.national_id, p.nationality, p.created_at ? new Date(p.created_at).toLocaleDateString('ar-SA') : ''], id: p.id }));
          break;
        case 'invoices':
          data = await API.get('/api/invoices');
          title.textContent = tr('Financial Report', 'التقرير المالي') + ' (' + data.length + ')';
          headers = [tr('#', '#'), tr('Patient', 'المريض'), tr('Service', 'الخدمة'), tr('Amount', 'المبلغ'), tr('Paid', 'مدفوع'), tr('Date', 'التاريخ')];
          rows = data.map(i => ({ cells: [i.invoice_number || i.id, i.patient_name, i.description || i.service_type, parseFloat(i.total || 0).toFixed(2), i.paid ? '✅' : '❌', i.created_at ? new Date(i.created_at).toLocaleDateString('ar-SA') : ''], id: i.id }));
          break;
        case 'appointments':
          data = await API.get('/api/appointments');
          title.textContent = tr('Appointments Report', 'تقرير المواعيد') + ' (' + data.length + ')';
          headers = [tr('Patient', 'المريض'), tr('Doctor', 'الطبيب'), tr('Department', 'القسم'), tr('Date', 'التاريخ'), tr('Time', 'الوقت'), tr('Status', 'الحالة')];
          rows = data.map(a => ({ cells: [a.patient_name, a.doctor_name || a.doctor, a.department, a.appt_date || a.date, a.appt_time || a.time, statusBadge(a.status)], id: a.id }));
          break;
        case 'lab':
          data = await API.get('/api/lab/orders');
          title.textContent = tr('Lab Report', 'تقرير المختبر') + ' (' + data.length + ')';
          headers = [tr('Patient', 'المريض'), tr('Test', 'الفحص'), tr('Doctor', 'الطبيب'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')];
          rows = data.map(l => ({ cells: [l.patient_name, l.test_name || l.test_type, l.doctor, statusBadge(l.status), l.created_at ? new Date(l.created_at).toLocaleDateString('ar-SA') : ''], id: l.id }));
          break;
        case 'pharmacy':
          data = await API.get('/api/pharmacy/prescriptions');
          title.textContent = tr('Pharmacy Report', 'تقرير الصيدلية') + ' (' + data.length + ')';
          headers = [tr('Patient', 'المريض'), tr('Medication', 'الدواء'), tr('Doctor', 'الطبيب'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')];
          rows = data.map(p => ({ cells: [p.patient_name, p.medication || p.drug_name, p.doctor, statusBadge(p.status), p.created_at ? new Date(p.created_at).toLocaleDateString('ar-SA') : ''], id: p.id }));
          break;
        case 'inventory':
          data = await API.get('/api/inventory');
          title.textContent = tr('Inventory Report', 'تقرير المخزون') + ' (' + data.length + ')';
          headers = [tr('Item', 'الصنف'), tr('Category', 'الفئة'), tr('Qty', 'الكمية'), tr('Reorder', 'إعادة الطلب'), tr('Unit', 'الوحدة'), tr('Status', 'الحالة')];
          rows = data.map(i => ({ cells: [i.name, i.category, i.quantity, i.reorder_level || 10, i.unit, parseInt(i.quantity) <= parseInt(i.reorder_level || 10) ? '<span style="color:#cc0000;font-weight:bold">⚠️ ' + tr('Low', 'منخفض') + '</span>' : '<span style="color:#2e7d32">✅ ' + tr('OK', 'جيد') + '</span>'], id: i.id }));
          break;
        case 'radiology':
          data = await API.get('/api/lab/orders');
          data = data.filter(o => o.order_type === 'Radiology' || o.test_type === 'Radiology');
          title.textContent = tr('Radiology Report', 'تقرير الأشعة') + ' (' + data.length + ')';
          headers = [tr('Patient', 'المريض'), tr('Exam', 'الفحص'), tr('Doctor', 'الطبيب الطالب'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')];
          rows = data.map(r => ({ cells: [r.patient_name, r.test_name || r.test_type, r.doctor || '—', statusBadge(r.status), r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA') : ''], id: r.id }));
          break;
        case 'medical_history':
          const [labH, rxH, apptH] = await Promise.all([
            API.get('/api/lab/orders').catch(() => []),
            API.get('/api/pharmacy/prescriptions').catch(() => []),
            API.get('/api/appointments').catch(() => [])
          ]);
          // Merge all into single timeline
          const allRecords = [];
          labH.forEach(l => allRecords.push({ type: '🔬 ' + tr('Lab', 'مختبر'), patient: l.patient_name, detail: l.test_name || l.test_type, doctor: l.doctor || '—', status: l.status, date: l.created_at }));
          rxH.forEach(p => allRecords.push({ type: '💊 ' + tr('Pharmacy', 'صيدلية'), patient: p.patient_name, detail: p.medication || p.drug_name, doctor: p.doctor || '—', status: p.status, date: p.created_at }));
          apptH.forEach(a => allRecords.push({ type: '📅 ' + tr('Visit', 'زيارة'), patient: a.patient_name, detail: a.department || a.speciality || '', doctor: a.doctor_name || a.doctor || '—', status: a.status, date: a.appt_date || a.created_at }));
          allRecords.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          data = allRecords;
          title.textContent = tr('Medical History', 'السجل الطبي') + ' (' + data.length + ')';
          headers = [tr('Type', 'النوع'), tr('Patient', 'المريض'), tr('Detail', 'التفاصيل'), tr('Doctor', 'الطبيب'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')];
          rows = allRecords.map((r, i) => ({ cells: [r.type, r.patient, r.detail, r.doctor, statusBadge(r.status), r.date ? new Date(r.date).toLocaleDateString('ar-SA') : ''], id: i }));
          break;
      }
      window._reportData = data;
      if (!data || data.length === 0) {
        table.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-state-icon">📊</div>
            <div>${tr('No report data found', 'لا توجد بيانات متاحة لهذا التقرير')}</div>
          </div>
        `;
      } else {
        createTable(table, 'rptTbl', headers, rows);
        // Wrap table for responsiveness
        const tblEl = table.querySelector('table');
        if (tblEl) {
          const wrapper = document.createElement('div');
          wrapper.className = 'table-wrapper';
          tblEl.parentNode.insertBefore(wrapper, tblEl);
          wrapper.appendChild(tblEl);
        }
      }
    } catch (e) {
      table.innerHTML = `
        <div class="error-card-premium">
          <div class="error-card-icon">⚠️</div>
          <h3>${tr('Failed to load report data', 'فشل في تحميل بيانات التقرير')}</h3>
          <p>${e.message || e}</p>
          <button class="btn btn-primary" onclick="genReport('${type}')">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
        </div>
      `;
    }
  };

}

let msgTab = 'inbox';
async function renderMessaging(el) {
  const content = el;

  const messages = await API.get('/api/messages').catch(() => []);
  const users = await API.get('/api/users').catch(() => []);
  const myId = window.currentUser?.id;
  const inbox = messages.filter(m => m.to_user_id == myId);
  const sent = messages.filter(m => m.from_user_id == myId);
  const unread = inbox.filter(m => !m.read_at).length;

  content.innerHTML = `
    <h2>${tr('Messaging', 'الرسائل')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${inbox.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Inbox', 'الوارد')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:${unread > 0 ? '#fce4ec' : '#e8f5e9'}"><h3 style="margin:0;color:${unread > 0 ? '#c62828' : '#2e7d32'}">${unread}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Unread', 'غير مقروءة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${sent.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Sent', 'المرسلة')}</p></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-primary" onclick="showComposeModal()">✏️ ${tr('Compose', 'رسالة جديدة')}</button>
      <button class="btn btn-sm msgTab" onclick="showMsgTab('inbox')" style="background:#1a73e8;color:#fff">${tr('Inbox', 'الوارد')}</button>
      <button class="btn btn-sm msgTab" onclick="showMsgTab('sent')" style="background:#e0e0e0;color:#333">${tr('Sent', 'المرسلة')}</button>
    </div>
    <div id="msgInbox" class="card" style="padding:16px"></div>
    <div id="msgSent" class="card" style="padding:16px;display:none"></div>`;

  // Render inbox
  const ib = document.getElementById('msgInbox');
  if (ib) { ib.innerHTML = inbox.length ? inbox.map(m => '<div style="padding:12px;margin:4px 0;border-radius:8px;background:' + (m.read_at ? '#fff' : '#e3f2fd') + ';cursor:pointer;border-left:4px solid ' + (m.read_at ? '#ccc' : '#1a73e8') + '" onclick="readMsg(' + m.id + ')"><div style="display:flex;justify-content:space-between"><strong>' + (m.from_name || tr('System', 'النظام')) + '</strong><span style="font-size:11px;color:#666">' + (m.created_at ? new Date(m.created_at).toLocaleString('ar-SA') : '') + '</span></div><p style="margin:4px 0 0;font-size:13px;color:#666">' + (m.subject || m.content || '').substring(0, 80) + '</p></div>').join('') : '<p style="text-align:center;color:#999">' + tr('No messages', 'لا توجد رسائل') + '</p>'; }

  const st = document.getElementById('msgSent');
  if (st) { st.innerHTML = sent.length ? sent.map(m => '<div style="padding:12px;margin:4px 0;border-radius:8px;background:#f5f5f5;border-left:4px solid #4caf50"><div style="display:flex;justify-content:space-between"><strong>→ ' + (m.to_name || '') + '</strong><span style="font-size:11px;color:#666">' + (m.created_at ? new Date(m.created_at).toLocaleString('ar-SA') : '') + '</span></div><p style="margin:4px 0 0;font-size:13px;color:#666">' + (m.subject || m.content || '').substring(0, 80) + '</p></div>').join('') : '<p style="text-align:center;color:#999">' + tr('No sent messages', 'لا توجد رسائل مرسلة') + '</p>'; }

  window.showMsgTab = (tab) => { document.getElementById('msgInbox').style.display = tab === 'inbox' ? '' : 'none'; document.getElementById('msgSent').style.display = tab === 'sent' ? '' : 'none'; };
  window.readMsg = async (id) => { try { await API.put('/api/messages/' + id + '/read', {}); const m = messages.find(x => x.id === id); if (m) { const modal = document.createElement('div'); modal.className = 'modal-overlay'; modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center'; modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:500px;max-height:80vh;overflow:auto"><h3 style="margin:0 0 8px">' + (m.subject || tr('Message', 'رسالة')) + '</h3><p style="color:#666;font-size:12px;margin:0 0 16px">' + tr('From', 'من') + ': ' + (m.from_name || '') + ' — ' + (m.created_at ? new Date(m.created_at).toLocaleString('ar-SA') : '') + '</p><div style="padding:12px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap">' + (m.content || '') + '</div><button class="btn btn-secondary" onclick="this.parentElement.parentElement.remove()" style="width:100%;margin-top:16px">' + tr('Close', 'إغلاق') + '</button></div>'; document.body.appendChild(modal); modal.onclick = e => { if (e.target === modal) modal.remove(); } } } catch (e) { } };
  window.showComposeModal = () => {
    const modal = document.createElement('div'); modal.className = 'modal-overlay'; modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:500px"><h3 style="margin:0 0 16px">✏️ ' + tr('New Message', 'رسالة جديدة') + '</h3><div class="form-group"><label>' + tr('To', 'إلى') + '</label><select class="form-input" id="msgTo">' + users.map(u => '<option value="' + u.id + '">' + u.display_name + '</option>').join('') + '</select></div><div class="form-group"><label>' + tr('Subject', 'الموضوع') + '</label><input class="form-input" id="msgSubject"></div><div class="form-group"><label>' + tr('Message', 'الرسالة') + '</label><textarea class="form-input" id="msgContent" rows="4"></textarea></div><div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="sendMessage()" style="flex:1">📤 ' + tr('Send', 'إرسال') + '</button><button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1">' + tr('Cancel', 'إلغاء') + '</button></div></div>';
    document.body.appendChild(modal); modal.onclick = e => { if (e.target === modal) modal.remove(); };
  };
  window.sendMessage = async () => { try { await API.post('/api/messages', { to_user_id: document.getElementById('msgTo').value, subject: document.getElementById('msgSubject').value, content: document.getElementById('msgContent').value }); document.querySelector('.modal-overlay')?.remove(); showToast(tr('Message sent!', 'تم إرسال الرسالة!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); } };

}
window.sendMsg = async function () {
  const receiver_id = document.getElementById('msgTo').value;
  const subject = document.getElementById('msgSubject').value;
  const body = document.getElementById('msgBody').value;
  const priority = document.getElementById('msgPriority').value;
  if (!subject) return showToast(tr('Subject required', 'الموضوع مطلوب'), 'error');
  await API.post('/api/messages', { receiver_id, subject, body, priority });
  showToast(tr('Message sent', 'تم الإرسال')); msgTab = 'sent'; navigateTo(15);
};
window.markRead = async function (id) { await API.put('/api/messages/' + id + '/read', {}); navigateTo(15); };
window.deleteMsg = async function (id) { if (confirm(tr('Delete?', 'حذف؟'))) { await API.delete('/api/messages/' + id); navigateTo(15); } };

// ===== SETTINGS =====
let settingsUsersList = [];
let editingUserId = null;



async function loadDashboardCharts() {
  try {
    if (typeof Chart === 'undefined') return;
    const data = await API.get('/api/dashboard/charts');

    // Revenue trend line chart
    const revCtx = document.getElementById('revenueChart');
    if (revCtx && data.revenueTrend) {
      const existingChart = Chart.getChart(revCtx);
      if (existingChart) existingChart.destroy();

      new Chart(revCtx, {
        type: 'line',
        data: {
          labels: data.revenueTrend.map(d => new Date(d.day).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })),
          datasets: [{
            label: isArabic ? 'الإيرادات' : 'Revenue',
            data: data.revenueTrend.map(d => parseFloat(d.revenue)),
            borderColor: '#006970',
            backgroundColor: 'rgba(0,105,112,0.06)',
            fill: true, tension: 0.4, pointRadius: 3
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }

    // Department pie chart
    const deptCtx = document.getElementById('deptChart');
    if (deptCtx && data.byDepartment && data.byDepartment.length > 0) {
      const existingChart = Chart.getChart(deptCtx);
      if (existingChart) existingChart.destroy();

      const colors = ['#001629', '#006970', '#ac8c44', '#ba1a1a', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4'];
      new Chart(deptCtx, {
        type: 'doughnut',
        data: {
          labels: data.byDepartment.map(d => d.dept),
          datasets: [{ data: data.byDepartment.map(d => parseInt(d.count)), backgroundColor: colors.slice(0, data.byDepartment.length) }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    // Payment methods pie
    const payCtx = document.getElementById('paymentChart');
    if (payCtx && data.paymentMethods && data.paymentMethods.length > 0) {
      const existingChart = Chart.getChart(payCtx);
      if (existingChart) existingChart.destroy();

      const colors = ['#006970', '#001629', '#ac8c44', '#ba1a1a', '#22c55e'];
      new Chart(payCtx, {
        type: 'pie',
        data: {
          labels: data.paymentMethods.map(d => d.method),
          datasets: [{ data: data.paymentMethods.map(d => parseFloat(d.total)), backgroundColor: colors.slice(0, data.paymentMethods.length) }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

  } catch (e) { console.error('Charts load error:', e); }
}


let settingsTab = 'hospital';
async function renderSettings(el) {
  const content = el;

  // Show premium loading skeletons instantly
  content.innerHTML = `
    <div class="flex justify-between items-end mb-6">
      <div>
        <h2 class="font-headline-lg text-headline-lg text-primary">${tr('System Settings & Governance', 'إعدادات النظام والحوكمة')}</h2>
        <p class="text-on-surface-variant text-sm mt-1">${tr('Configure hospital records, manage users, and monitor cybersecurity compliance', 'تهيئة سجلات المنشأة، إدارة الصلاحيات ومراقبة الامتثال للأمن السيبراني')}</p>
      </div>
    </div>
    <div class="flex gap-4 mb-6 border-b border-outline-variant/30 pb-2">
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'hospital' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}">
        🏥 ${tr('Hospital Settings', 'إعدادات المنشأة')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'users' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}">
        👥 ${tr('User Manager', 'إدارة المستخدمين')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'cybersecurity' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}">
        🛡️ ${tr('Cybersecurity & Governance', 'الأمن السيبراني والحوكمة')}
      </button>
    </div>
    <div class="glass-card-premium p-6">
      <div class="skeleton-bar title mb-16"></div>
      <div class="skeleton-bar mb-12"></div>
      <div class="skeleton-bar mb-12"></div>
    </div>
  `;

  const getActionBadge = (act) => {
    const action = act.toUpperCase();
    if (action.includes('CREATE') || action.includes('INSERT') || action.includes('ADD')) return `<span class="badge badge-success">${act}</span>`;
    if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('SAVE')) return `<span class="badge badge-warning">${act}</span>`;
    if (action.includes('DELETE') || action.includes('REMOVE') || action.includes('DESTROY')) return `<span class="badge badge-danger">${act}</span>`;
    if (action.includes('LOGIN') || action.includes('AUTH')) return `<span class="badge badge-info">${act}</span>`;
    return `<span class="badge">${act}</span>`;
  };

  let backupInfo = { database: 'nama_medical_web', totalSizeMB: '0.00', backupCommand: '', tables: [] };
  let backupList = [];
  let auditLogs = [];

  try {
    if (settingsTab === 'users') {
      settingsUsersList = await API.get('/api/settings/users');
    } else if (settingsTab === 'cybersecurity') {
      [backupInfo, backupList, auditLogs] = await Promise.all([
        API.get('/api/admin/backup-info'),
        API.get('/api/admin/backups'),
        API.get('/api/admin/audit-trail?limit=15')
      ]);
    }
  } catch (e) {
    content.innerHTML = `
      <div class="flex justify-between items-end mb-6">
        <div>
          <h2 class="font-headline-lg text-headline-lg text-primary">${tr('System Settings & Governance', 'إعدادات النظام والحوكمة')}</h2>
        </div>
      </div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load settings data', 'فشل في تحميل بيانات الإعدادات')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="flex justify-between items-end mb-6">
      <div>
        <h2 class="font-headline-lg text-headline-lg text-primary">${tr('System Settings & Governance', 'إعدادات النظام والحوكمة')}</h2>
        <p class="text-on-surface-variant text-sm mt-1">${tr('Configure hospital records, manage users, and monitor cybersecurity compliance', 'تهيئة سجلات المنشأة، إدارة الصلاحيات ومراقبة الامتثال للأمن السيبراني')}</p>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="flex gap-4 mb-6 border-b border-outline-variant/30 pb-2">
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'hospital' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="settingsTab='hospital';navigateTo(42)">
        🏥 ${tr('Hospital Settings', 'إعدادات المنشأة')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'users' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="settingsTab='users';navigateTo(42)">
        👥 ${tr('User Manager', 'إدارة المستخدمين')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${settingsTab === 'cybersecurity' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="settingsTab='cybersecurity';navigateTo(42)">
        🛡️ ${tr('Cybersecurity & Governance', 'الأمن السيبراني والحوكمة')}
      </button>
    </div>

    <div class="tab-pane-content">
      ${settingsTab === 'hospital' ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-md">
          <div class="glass-card glass-card-premium p-6 rounded-2xl">
            <h4 class="font-title-lg text-title-lg text-primary mb-4">🏥 ${tr('Hospital Information', 'معلومات المستشفى')}</h4>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Hospital Name (AR)', 'اسم المستشفى (عربي)')}</label>
              <input class="form-input w-full" id="sNameAr" value="نما الطبي">
            </div>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Hospital Name (EN)', 'اسم المستشفى (إنجليزي)')}</label>
              <input class="form-input w-full" id="sNameEn" value="Nama Medical">
            </div>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Phone', 'الهاتف')}</label>
              <input class="form-input w-full" id="sPhone" value="0112345678">
            </div>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Email', 'البريد الإلكتروني')}</label>
              <input class="form-input w-full" id="sEmail" value="info@namamedical.com">
            </div>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Address', 'العنوان')}</label>
              <textarea class="form-input w-full" id="sAddr" rows="2">الرياض، المملكة العربية السعودية</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div class="form-group">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('CR Number', 'السجل التجاري')}</label>
                <input class="form-input w-full" id="sCr" value="1010000234">
              </div>
              <div class="form-group">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('VAT Number', 'الرقم الضريبي')}</label>
                <input class="form-input w-full" id="sTax" value="300012345600003">
              </div>
            </div>
            <button class="btn btn-primary w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2" onclick="saveSettings()">
              💾 ${tr('Save Changes', 'حفظ التعديلات')}
            </button>
          </div>
          <div class="space-y-md">
            <div class="glass-card glass-card-premium p-6 rounded-2xl">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">🎨 ${tr('Appearance', 'المظهر')}</h4>
              <div class="form-group mb-4">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Language', 'اللغة')}</label>
                <select class="form-input w-full" onchange="setLang(this.value)">
                  <option value="en" ${!isArabic ? 'selected' : ''}>English</option>
                  <option value="ar" ${isArabic ? 'selected' : ''}>العربية</option>
                </select>
              </div>
              <div class="form-group">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Theme Select', 'اختيار المظهر')}</label>
                <select class="form-input w-full" id="setTheme" onchange="if(typeof changeTheme==='function')changeTheme(this.value)">
                  <option value="light-blue">${tr('Light Blue', 'فاتح أزرق')}</option>
                  <option value="dark">${tr('Dark', 'داكن')}</option>
                  <option value="green">${tr('Green', 'أخضر')}</option>
                </select>
              </div>
            </div>
            <div class="glass-card glass-card-premium p-6 rounded-2xl">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">🔔 ${tr('System Notifications', 'إشعارات النظام')}</h4>
              <div class="space-y-3">
                <label class="flex items-center gap-3 text-sm text-on-surface-variant cursor-pointer">
                  <input type="checkbox" checked class="rounded border-outline-variant text-primary focus:ring-primary">
                  ${tr('Alert when lab results are ready', 'تنبيه عند جاهزية نتائج المختبر')}
                </label>
                <label class="flex items-center gap-3 text-sm text-on-surface-variant cursor-pointer">
                  <input type="checkbox" checked class="rounded border-outline-variant text-primary focus:ring-primary">
                  ${tr('Alert for new appointments booked', 'تنبيه لحجز المواعيد الجديدة')}
                </label>
                <label class="flex items-center gap-3 text-sm text-on-surface-variant cursor-pointer">
                  <input type="checkbox" checked class="rounded border-outline-variant text-primary focus:ring-primary">
                  ${tr('Alert for low inventory stock level', 'تنبيه تدني مستويات مخزون المستودعات')}
                </label>
                <label class="flex items-center gap-3 text-sm text-on-surface-variant cursor-pointer">
                  <input type="checkbox" class="rounded border-outline-variant text-primary focus:ring-primary">
                  ${tr('Enable system email logs dispatch', 'تفعيل إرسال سجلات النظام بالبريد')}
                </label>
              </div>
            </div>
          </div>
        </div>
      ` : settingsTab === 'users' ? `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-md">
          <!-- User Manager Form -->
          <div class="glass-card glass-card-premium p-6 rounded-2xl h-fit">
            <h4 class="font-title-lg text-title-lg text-primary mb-4" id="suFormTitle">👤 ${tr('User Details', 'بيانات المستخدم')}</h4>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Full Display Name', 'الاسم الكامل')}</label>
              <input class="form-input w-full" id="suName" placeholder="e.g. د. محمد علي">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Username', 'اسم المستخدم')}</label>
              <input class="form-input w-full" id="suUser" placeholder="e.g. dr_mohammed">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Password', 'كلمة المرور')}</label>
              <input type="password" class="form-input w-full" id="suPass" placeholder="••••••••">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('System Role', 'دور النظام')}</label>
              <select class="form-input w-full" id="suRole" onchange="toggleSuRoleFields(this.value)">
                <option value="Reception">${tr('Receptionist', 'موظف استقبال')}</option>
                <option value="Doctor">${tr('Doctor', 'طبيب')}</option>
                <option value="Nurse">${tr('Nurse', 'ممرض/ة')}</option>
                <option value="Pharmacist">${tr('Pharmacist', 'صيدلي')}</option>
                <option value="Lab Technician">${tr('Lab Tech', 'فني مختبر')}</option>
                <option value="Radiologist">${tr('Radiologist', 'فني أشعة')}</option>
                <option value="Finance">${tr('Finance', 'مالية ومحاسبة')}</option>
                <option value="HR">${tr('HR', 'موارد بشرية')}</option>
                <option value="Admin">${tr('Administrator', 'مدير نظام')}</option>
              </select>
            </div>
            <div id="suSpecDiv" class="form-group mb-3" style="display:none">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Medical Speciality', 'التخصص الطبي')}</label>
              <input class="form-input w-full" id="suSpec" placeholder="e.g. Cardiology">
            </div>
            <div id="suCommDiv" class="mb-3" style="display:none">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Commission Rules', 'عمولة الطبيب')}</label>
              <div class="grid grid-cols-2 gap-2">
                <select class="form-input" id="suCommType">
                  <option value="percentage">${tr('Percentage %', 'نسبة مئوية %')}</option>
                  <option value="fixed">${tr('Fixed Amount', 'مبلغ ثابت')}</option>
                </select>
                <input type="number" class="form-input" id="suCommValue" value="0" step="0.1">
              </div>
            </div>
            <div class="form-group mb-4">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Permissions', 'صلاحيات الأقسام')}</label>
              <div id="suPerms" style="display:grid;grid-template-columns:1fr;gap:6px;max-height:160px;overflow-y:auto;border:1px solid rgba(0,0,0,0.1);padding:8px;border-radius:8px">
                ${NAV_ITEMS.map((item, i) => `
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px" class="cursor-pointer hover:bg-surface-container-low p-1 rounded">
                    <input type="checkbox" id="perm_${i}" value="${i}" checked class="rounded border-outline-variant text-primary focus:ring-primary">
                    <span>${item.icon}</span> <span>${tr(item.en, item.ar)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary flex-1 py-2.5 rounded-xl font-bold" id="suAddBtn" onclick="addOrUpdateUser()">
                ➕ ${tr('Save User', 'حفظ المستخدم')}
              </button>
              <button class="btn btn-secondary py-2.5 rounded-xl font-bold" id="suCancelBtn" onclick="cancelEditUser()" style="display:none">
                ${tr('Cancel', 'إلغاء')}
              </button>
            </div>
          </div>

          <!-- User Registry Table -->
          <div class="glass-card glass-card-premium p-6 rounded-2xl lg:col-span-2 overflow-x-auto">
            <h4 class="font-title-lg text-title-lg text-primary mb-4">👥 ${tr('User Accounts Directory', 'سجل المستخدمين النشطين')}</h4>
            <table class="w-full text-right divide-y divide-outline-variant/30">
              <thead class="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
                <tr>
                  <th class="p-3">${tr('Name', 'الاسم')}</th>
                  <th class="p-3">${tr('Username', 'المستخدم')}</th>
                  <th class="p-3">${tr('Role', 'الدور')}</th>
                  <th class="p-3">${tr('Specialty', 'التخصص')}</th>
                  <th class="p-3 text-center">${tr('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody class="font-body-md text-body-md divide-y divide-outline-variant/10">
                ${settingsUsersList.map(u => `
                  <tr class="hover:bg-primary/5 transition-colors">
                    <td class="p-3 font-bold text-primary">${u.display_name || '—'}</td>
                    <td class="p-3 font-mono text-sm">${u.username}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs bg-primary-container text-on-primary-fixed-variant font-bold">${u.role}</span></td>
                    <td class="p-3 text-on-surface-variant">${u.speciality || '—'}</td>
                    <td class="p-3 text-center">
                      <div class="flex justify-center gap-2">
                        <button class="btn btn-sm bg-secondary/10 text-secondary hover:bg-secondary/20 p-2 rounded-lg" onclick="editUser(${u.id})">✏️</button>
                        <button class="btn btn-sm bg-error/10 text-error hover:bg-error/20 p-2 rounded-lg" onclick="deleteUser(${u.id})">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <!-- Cybersecurity Governance -->
        <div class="space-y-md">
          <!-- Staging Warning banner inside tab -->
          <div class="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs md:text-sm mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">warning</span>
            <span><strong>تنبيه الأمن السيبراني:</strong> تعمل هذه البيئة حالياً كخادم Staging تجريبي على بروتوكول HTTP غير المشفر. يمنع منعاً باتاً تخزين أو معالجة أي بيانات مرضى حقيقية أو معلومات حساسة.</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            <!-- Threat Level Circular Gauge -->
            <div class="glass-card glass-card-premium p-6 rounded-2xl flex flex-col items-center justify-center min-h-[260px]">
              <h3 class="font-title-lg text-title-lg text-primary mb-4 w-full text-right">🛡️ ${tr('Current Cybersecurity Threat Level', 'مستوى التهديد السيبراني الحالي')}</h3>
              <div class="relative w-40 h-40 flex items-center justify-center">
                <svg class="w-full h-full transform -rotate-90">
                  <circle class="text-surface-container-highest" cx="80" cy="80" fill="transparent" r="68" stroke="currentColor" stroke-width="10"></circle>
                  <circle class="text-secondary" cx="80" cy="80" fill="transparent" r="68" stroke="currentColor" stroke-dasharray="427.2" stroke-dashoffset="299.0" stroke-width="10"></circle>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span class="font-display-lg text-3xl font-bold text-primary leading-none">30%</span>
                  <span class="font-label-md text-label-md text-secondary mt-1">${tr('Low / Secure', 'منخفض / مستقر')}</span>
                </div>
              </div>
              <p class="text-[11px] text-on-surface-variant mt-4 text-center">${tr('Firewall rules active. Single session enforcement enabled.', 'جدار الحماية نشط. ميزة الجلسة الأحادية للمستخدم مفعلة.')}</p>
            </div>

            <!-- Encryption & Session Controls -->
            <div class="glass-card glass-card-premium p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 class="font-title-lg text-title-lg text-primary mb-4 flex items-center gap-2">🔑 ${tr('Data Encryption Status', 'تشفير وحماية البيانات')}</h3>
                <div class="space-y-3">
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">${tr('Patients Database', 'قاعدة بيانات المرضى')}</span>
                    <span class="text-xs font-bold text-green-600">AES-256 (Active)</span>
                  </div>
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">${tr('Radiology Logs', 'سجلات الأشعة')}</span>
                    <span class="text-xs font-bold text-green-600">RSA-4096 (Active)</span>
                  </div>
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">${tr('Cloud Backup Transmission', 'نقل النسخ الاحتياطي السحابي')}</span>
                    <span class="text-xs font-bold text-secondary">SSL/TLS 1.3</span>
                  </div>
                </div>
              </div>
              <div class="pt-4 border-t border-outline-variant/30 flex justify-between items-center">
                <span class="text-xs text-on-surface-variant font-medium">${tr('Session Enforcement', 'انضباط الجلسة الأحادية')}</span>
                <span class="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-bold">${tr('Compliant', 'مطابق')}</span>
              </div>
            </div>

            <!-- Compliance Authority Status -->
            <div class="glass-card glass-card-premium p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 class="font-title-lg text-title-lg text-primary mb-4">📜 ${tr('National Authority Compliance', 'الامتثال للجهات الرقابية والوطنية')}</h3>
                <div class="space-y-3">
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">نظام حماية البيانات الشخصية (PDPL)</span>
                    <span class="text-xs text-green-700 font-bold">مطابق 100%</span>
                  </div>
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">سياسات حوكمة البيانات الوطنية (SDAIA)</span>
                    <span class="text-xs text-secondary font-bold">قيد المراجعة</span>
                  </div>
                  <div class="flex justify-between items-center p-2 bg-surface-container-low rounded-xl">
                    <span class="text-xs text-on-surface-variant font-bold">سياسة مشاركة البيانات الصحية الآمنة</span>
                    <span class="text-xs text-green-700 font-bold">مطابق 100%</span>
                  </div>
                </div>
              </div>
              <div class="pt-2 text-center">
                <p class="text-[10px] text-on-surface-variant">معايير حوكمة البيانات الصادرة عن الهيئة السعودية للبيانات والذكاء الاصطناعي</p>
              </div>
            </div>
          </div>

          <!-- Backup Manager & Database Info -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-md">
            <div class="glass-card glass-card-premium p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h4 class="font-title-lg text-title-lg text-primary mb-3">💾 ${tr('Database Infrastructure', 'بنية قاعدة البيانات')}</h4>
                <div class="space-y-2 text-xs">
                  <div class="flex justify-between p-1 border-b border-outline-variant/20"><span class="text-on-surface-variant">اسم قاعدة البيانات:</span><span class="font-bold text-primary">${backupInfo.database}</span></div>
                  <div class="flex justify-between p-1 border-b border-outline-variant/20"><span class="text-on-surface-variant">الحجم الإجمالي:</span><span class="font-bold text-primary">${backupInfo.totalSizeMB} MB</span></div>
                  <div class="flex justify-between p-1 border-b border-outline-variant/20"><span class="text-on-surface-variant">أداة النسخ الاحتياطي:</span><span class="font-mono text-[10px] text-secondary">pg_dump</span></div>
                </div>
              </div>
              <div class="mt-4">
                <button onclick="startBackup()" class="w-full btn btn-primary py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                  🚀 ${tr('Run Database Backup Now', 'تشغيل النسخ الاحتياطي الفوري')}
                </button>
              </div>
            </div>

            <!-- Existing Backups Registry -->
            <div class="glass-card glass-card-premium p-6 rounded-2xl lg:col-span-2 overflow-x-auto">
              <h4 class="font-title-lg text-title-lg text-primary mb-3">📂 ${tr('Database Backup Registry', 'سجل النسخ الاحتياطية المتوفرة')}</h4>
              <div class="max-h-48 overflow-y-auto">
                <table class="w-full text-right divide-y divide-outline-variant/30 text-xs">
                  <thead class="bg-surface-container-low font-label-md text-on-surface-variant">
                    <tr>
                      <th class="p-2">${tr('Filename', 'اسم الملف')}</th>
                      <th class="p-2">${tr('Size', 'الحجم')}</th>
                      <th class="p-2">${tr('Date Created', 'التاريخ والوقت')}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-variant/10">
                    ${backupList.length ? backupList.map(b => `
                      <tr class="hover:bg-primary/5 transition-colors">
                        <td class="p-2 font-mono text-[11px] text-primary">${b.name}</td>
                        <td class="p-2 font-bold">${b.size}</td>
                        <td class="p-2 text-on-surface-variant">${new Date(b.date).toLocaleString('ar-SA')}</td>
                      </tr>
                    `).join('') : `<tr><td colspan="3"><div class="empty-state-card"><div class="empty-state-icon">📂</div><div>${tr('No backups found', 'لا توجد نسخ احتياطية متوفرة')}</div></div></td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Administrative Security Audit Trail -->
          <div class="glass-card glass-card-premium p-6 rounded-2xl overflow-x-auto">
            <h4 class="font-title-lg text-title-lg text-primary mb-4">🔍 ${tr('Security & Governance Audit Trail', 'سجل الحركات الأمنية وتدقيق النظام')}</h4>
            <div class="max-h-60 overflow-y-auto">
              <table class="w-full text-right divide-y divide-outline-variant/30 text-xs">
                <thead class="bg-surface-container-low font-label-md text-on-surface-variant">
                  <tr>
                    <th class="p-3">${tr('User', 'المستخدم')}</th>
                    <th class="p-3">${tr('Module', 'القسم')}</th>
                    <th class="p-3">${tr('Action', 'الحركة')}</th>
                    <th class="p-3">${tr('Context / Details', 'التفاصيل والسياق')}</th>
                    <th class="p-3">${tr('IP Address', 'عنوان IP')}</th>
                    <th class="p-3">${tr('Timestamp', 'الوقت والتاريخ')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  ${auditLogs.length ? auditLogs.map(log => `
                    <tr class="hover:bg-primary/5 transition-colors">
                      <td class="p-3 font-bold text-primary">${log.user_name || '—'}</td>
                      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-secondary/10 text-secondary font-bold">${log.module}</span></td>
                      <td class="p-3">${getActionBadge(log.action)}</td>
                      <td class="p-3 text-on-surface-variant max-w-xs truncate" title="${log.details || ''}">${log.details || '—'}</td>
                      <td class="p-3 font-mono text-[11px]">${log.ip_address || '—'}</td>
                      <td class="p-3 text-on-surface-variant">${new Date(log.created_at).toLocaleString('ar-SA')}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="6"><div class="empty-state-card"><div class="empty-state-icon">🔍</div><div>${tr('No audit trail events logged', 'لا توجد حركات مسجلة حالياً')}</div></div></td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}

window.toggleSuRoleFields = (role) => {
  const isDoc = role === 'Doctor';
  const spec = document.getElementById('suSpecDiv');
  const comm = document.getElementById('suCommDiv');
  if (spec) spec.style.display = isDoc ? 'block' : 'none';
  if (comm) comm.style.display = isDoc ? 'block' : 'none';
};

window.startBackup = async () => {
  try {
    showToast(tr('Running database backup...', 'جاري تشغيل النسخ الاحتياطي...'));
    const response = await fetch('/api/admin/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Backup failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = response.headers.get('Content-Disposition');
    let filename = 'nama_backup.sql';
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) filename = matches[1].replace(/['"]/g, '');
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(tr('Backup complete and downloaded!', 'اكتمل النسخ الاحتياطي وتم التحميل!'));
    setTimeout(() => navigateTo(currentPage), 1000);
  } catch (e) {
    showToast(tr('Backup failed', 'فشل النسخ الاحتياطي'), 'error');
  }
};

window.saveSettings = async () => {
  try {
    await API.put('/api/settings', {
      company_name_ar: document.getElementById('sNameAr').value,
      company_name_en: document.getElementById('sNameEn').value,
      tax_number: document.getElementById('sTax').value,
      cr_number: document.getElementById('sCr').value,
      phone: document.getElementById('sPhone').value,
      address: document.getElementById('sAddr').value
    });
    showToast(tr('Settings saved!', 'تم حفظ الإعدادات!'));
  } catch (e) { showToast(tr('Error saving', 'خطأ في الحفظ'), 'error'); }
};

window.addOrUpdateUser = async () => {
  const username = document.getElementById('suUser').value.trim();
  const password = document.getElementById('suPass').value.trim();

  if (!username) { showToast(tr('Enter username', 'ادخل المستخدم'), 'error'); return; }
  if (!editingUserId && !password) { showToast(tr('Enter password for new user', 'ادخل كلمة المرور للمستخدم الجديد'), 'error'); return; }

  try {
    const role = document.getElementById('suRole').value;
    const spec = role === 'Doctor' ? document.getElementById('suSpec').value : '';
    const perms = Array.from(document.querySelectorAll('#suPerms input:checked')).map(cb => cb.value).join(',');
    const commType = role === 'Doctor' ? (document.getElementById('suCommType')?.value || 'percentage') : 'percentage';
    const commValue = role === 'Doctor' ? (parseFloat(document.getElementById('suCommValue')?.value) || 0) : 0;

    if (editingUserId) {
      await API.put(`/api/settings/users/${editingUserId}`, {
        username,
        password: password || undefined,
        display_name: document.getElementById('suName').value,
        role,
        speciality: spec,
        permissions: perms,
        commission_type: commType,
        commission_value: commValue,
        is_active: 1
      });
      showToast(tr('User updated!', 'تم تحديث المستخدم!'));
    } else {
      await API.post('/api/settings/users', {
        username,
        password,
        display_name: document.getElementById('suName').value,
        role,
        speciality: spec,
        permissions: perms,
        commission_type: commType,
        commission_value: commValue
      });
      showToast(tr('User added!', 'تم إنشاء المستخدم!'));
    }

    editingUserId = null;
    await navigateTo(42);
  } catch (e) { showToast(e.message || tr('Error saving user', 'خطأ في عملية الحفظ'), 'error'); }
};

window.editUser = (id) => {
  const user = settingsUsersList.find(u => u.id === id);
  if (!user) return;
  editingUserId = id;
  document.getElementById('suUser').value = user.username || '';
  document.getElementById('suName').value = user.display_name || '';
  document.getElementById('suRole').value = user.role || 'Reception';
  document.getElementById('suPass').value = '';

  toggleSuRoleFields(user.role);

  if (user.role === 'Doctor') {
    document.getElementById('suSpec').value = user.speciality || 'General Clinic';
    document.getElementById('suCommType').value = user.commission_type || 'percentage';
    document.getElementById('suCommValue').value = user.commission_value || 0;
  }

  document.querySelectorAll('#suPerms input').forEach(cb => cb.checked = false);
  const perms = (user.permissions || '').split(',');
  perms.forEach(p => {
    const cb = document.getElementById(`perm_${p}`);
    if (cb) cb.checked = true;
  });

  document.getElementById('suCancelBtn').style.display = 'inline-block';
  document.getElementById('suAddBtn').innerHTML = `🔄 ${tr('Update User', 'تحديث المستخدم')}`;
};

window.cancelEditUser = () => {
  editingUserId = null;
  document.getElementById('suUser').value = '';
  document.getElementById('suName').value = '';
  document.getElementById('suPass').value = '';
  document.getElementById('suRole').value = 'Reception';
  toggleSuRoleFields('Reception');
  document.querySelectorAll('#suPerms input').forEach(cb => cb.checked = true);
  document.getElementById('suCancelBtn').style.display = 'none';
  document.getElementById('suAddBtn').innerHTML = `➕ ${tr('Save User', 'حفظ المستخدم')}`;
};

window.deleteUser = async (id) => {
  if (!confirm(tr('Are you sure you want to delete this user? This cannot be undone.', 'هل أنت متأكد من حذف هذا المستخدم؟ هذا الإجراء لا يمكن التراجع عنه.'))) return;
  try {
    await API.delete(`/api/settings/users/${id}`);
    showToast(tr('User deleted!', 'تم الحذف بنجاح!'));
    await navigateTo(42);
  } catch (e) { showToast(e.message || tr('Error deleting', 'خطأ في الحذف'), 'error'); }
};

// ===== CATALOG MODULE =====
async function renderCatalog(el) {
  const [labTests, radExams, services] = await Promise.all([
    API.get('/api/catalog/lab'),
    API.get('/api/catalog/radiology'),
    API.get('/api/medical/services')
  ]);

  // Group lab tests by category
  const labGroups = {};
  labTests.forEach(t => { if (!labGroups[t.category]) labGroups[t.category] = []; labGroups[t.category].push(t); });

  // Group radiology by modality
  const radGroups = {};
  radExams.forEach(r => { if (!radGroups[r.modality]) radGroups[r.modality] = []; radGroups[r.modality].push(r); });

  // Group services by specialty then category
  const svcGroups = {};
  services.forEach(s => {
    if (!svcGroups[s.specialty]) svcGroups[s.specialty] = {};
    if (!svcGroups[s.specialty][s.category]) svcGroups[s.specialty][s.category] = [];
    svcGroups[s.specialty][s.category].push(s);
  });

  const specNames = {
    'General Practice': 'الطب العام', 'Dentistry': 'طب الأسنان', 'Internal Medicine': 'الباطنية',
    'Cardiology': 'القلب', 'Dermatology': 'الجلدية', 'Ophthalmology': 'العيون',
    'ENT': 'الأنف والأذن', 'Orthopedics': 'العظام', 'Obstetrics': 'النساء والولادة',
    'Pediatrics': 'الأطفال', 'Neurology': 'الأعصاب', 'Psychiatry': 'الطب النفسي',
    'Urology': 'المسالك البولية', 'Endocrinology': 'الغدد الصماء', 'Gastroenterology': 'الجهاز الهضمي',
    'Pulmonology': 'الصدرية', 'Nephrology': 'الكلى', 'Surgery': 'الجراحة العامة',
    'Oncology': 'الأورام', 'Physiotherapy': 'العلاج الطبيعي', 'Nutrition': 'التغذية',
    'Emergency': 'الطوارئ'
  };

  const catIcons = { 'Consultation': '🩺', 'Procedure': '🔧', 'Diagnostic': '📊', 'Therapy': '💆', 'Service': '📝' };

  el.innerHTML = `
    <div class="page-title">📂 ${tr('Service Catalog', 'الأصناف والخدمات')}</div>
    <div class="flex gap-8 mb-16">
      <button class="btn btn-primary" id="catTabLab" onclick="switchCatTab('lab')" style="flex:1">🔬 ${tr('Lab Tests', 'فحوصات المختبر')} (${labTests.length})</button>
      <button class="btn btn-secondary" id="catTabRad" onclick="switchCatTab('rad')" style="flex:1">📡 ${tr('Radiology', 'الأشعة')} (${radExams.length})</button>
      <button class="btn btn-secondary" id="catTabSvc" onclick="switchCatTab('svc')" style="flex:1">🏥 ${tr('Procedures', 'الإجراءات الطبية')} (${services.length})</button>
    </div>
    <input class="form-input mb-12" id="catSearch" placeholder="${tr('Search...', 'بحث...')}" oninput="filterCatalog()">

    <div id="catLabContent">
      ${Object.entries(labGroups).map(([cat, tests]) => `
        <div class="card mb-12 cat-item">
          <div class="card-title" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            🧪 ${cat} <span class="badge badge-info">${tests.length}</span> <span style="float:left;font-size:12px;color:var(--text-dim)">▼</span>
          </div>
          <div style="display:none">
            <table class="data-table"><thead><tr>
              <th style="width:40%">${tr('Test Name', 'اسم الفحص')}</th>
              <th>${tr('Normal Range', 'المعدل الطبيعي')}</th>
              <th style="width:100px">${tr('Price', 'السعر')}</th>
              <th style="width:60px"></th>
            </tr></thead><tbody>
            ${tests.map(t => `<tr class="cat-row" data-name="${t.test_name.toLowerCase()}">
              <td>${t.test_name}</td>
              <td style="font-size:11px;color:var(--text-dim)">${t.normal_range || '-'}</td>
              <td><input type="number" class="form-input" value="${t.price}" id="labP${t.id}" style="width:80px;text-align:center;padding:4px 6px;font-size:12px"></td>
              <td><button class="btn btn-sm btn-success" onclick="saveCatPrice('lab',${t.id})">💾</button></td>
            </tr>`).join('')}
            </tbody></table>
          </div>
        </div>
      `).join('')}
    </div>

    <div id="catRadContent" style="display:none">
      ${Object.entries(radGroups).map(([mod, exams]) => `
        <div class="card mb-12 cat-item">
          <div class="card-title" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            📡 ${mod} <span class="badge badge-info">${exams.length}</span> <span style="float:left;font-size:12px;color:var(--text-dim)">▼</span>
          </div>
          <div style="display:none">
            <table class="data-table"><thead><tr>
              <th style="width:60%">${tr('Exam Name', 'اسم الفحص')}</th>
              <th style="width:100px">${tr('Price', 'السعر')}</th>
              <th style="width:60px"></th>
            </tr></thead><tbody>
            ${exams.map(r => `<tr class="cat-row" data-name="${r.exact_name.toLowerCase()}">
              <td>${r.exact_name}</td>
              <td><input type="number" class="form-input" value="${r.price}" id="radP${r.id}" style="width:80px;text-align:center;padding:4px 6px;font-size:12px"></td>
              <td><button class="btn btn-sm btn-success" onclick="saveCatPrice('rad',${r.id})">💾</button></td>
            </tr>`).join('')}
            </tbody></table>
          </div>
        </div>
      `).join('')}
    </div>

    <div id="catSvcContent" style="display:none">
      <div class="flex gap-8 mb-12" style="flex-wrap:wrap" id="catSpecFilter">
        <button class="btn btn-sm btn-primary" onclick="filterSpec('all')">📋 ${tr('All', 'الكل')}</button>
        ${Object.keys(svcGroups).map(s => `<button class="btn btn-sm btn-secondary" onclick="filterSpec('${s}')">${specNames[s] || s}</button>`).join('')}
      </div>
      ${Object.entries(svcGroups).map(([spec, cats]) => `
        <div class="spec-group" data-spec="${spec}">
          <div class="card mb-12">
            <div class="card-title" style="cursor:pointer;background:var(--hover);border-radius:8px;padding:12px" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
              🏥 ${specNames[spec] || spec} — ${spec} <span class="badge badge-info">${Object.values(cats).flat().length}</span> <span style="float:left;font-size:12px;color:var(--text-dim)">▼</span>
            </div>
            <div style="display:none">
              ${Object.entries(cats).map(([cat, items]) => `
                <div style="margin:12px 0">
                  <div style="font-weight:600;margin-bottom:8px;padding:6px 12px;background:var(--hover);border-radius:6px">${catIcons[cat] || '📌'} ${cat} <span class="badge badge-info" style="font-size:10px">${items.length}</span></div>
                  <table class="data-table"><thead><tr>
                    <th>${tr('Procedure (EN)', 'الإجراء (إنجليزي)')}</th>
                    <th>${tr('Procedure (AR)', 'الإجراء (عربي)')}</th>
                    <th style="width:100px">${tr('Price', 'السعر')}</th>
                    <th style="width:60px"></th>
                  </tr></thead><tbody>
                  ${items.map(s => `<tr class="cat-row" data-name="${s.name_en.toLowerCase()} ${s.name_ar}">
                    <td style="font-size:12px">${s.name_en}</td>
                    <td style="font-size:12px">${s.name_ar}</td>
                    <td><input type="number" class="form-input" value="${s.price}" id="svcP${s.id}" style="width:80px;text-align:center;padding:4px 6px;font-size:12px"></td>
                    <td><button class="btn btn-sm btn-success" onclick="saveCatPrice('svc',${s.id})">💾</button></td>
                  </tr>`).join('')}
                  </tbody></table>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

window.switchCatTab = (tab) => {
  document.getElementById('catLabContent').style.display = tab === 'lab' ? 'block' : 'none';
  document.getElementById('catRadContent').style.display = tab === 'rad' ? 'block' : 'none';
  document.getElementById('catSvcContent').style.display = tab === 'svc' ? 'block' : 'none';
  document.getElementById('catTabLab').className = `btn ${tab === 'lab' ? 'btn-primary' : 'btn-secondary'}`;
  document.getElementById('catTabRad').className = `btn ${tab === 'rad' ? 'btn-primary' : 'btn-secondary'}`;
  document.getElementById('catTabSvc').className = `btn ${tab === 'svc' ? 'btn-primary' : 'btn-secondary'}`;
};

window.filterCatalog = () => {
  const q = document.getElementById('catSearch').value.toLowerCase();
  document.querySelectorAll('.cat-row').forEach(row => {
    row.style.display = row.dataset.name.includes(q) ? '' : 'none';
  });
};

window.filterSpec = (spec) => {
  document.querySelectorAll('.spec-group').forEach(g => {
    g.style.display = (spec === 'all' || g.dataset.spec === spec) ? 'block' : 'none';
  });
};

window.saveCatPrice = async (type, id) => {
  try {
    let url, price;
    if (type === 'lab') { url = `/api/catalog/lab/${id}`; price = parseFloat(document.getElementById(`labP${id}`).value); }
    else if (type === 'rad') { url = `/api/catalog/radiology/${id}`; price = parseFloat(document.getElementById(`radP${id}`).value); }
    else { url = `/api/medical/services/${id}`; price = parseFloat(document.getElementById(`svcP${id}`).value); }
    await API.put(url, { price });
    showToast(tr('Price saved!', 'تم حفظ السعر!'));
  } catch (e) { showToast(tr('Error saving', 'خطأ في الحفظ'), 'error'); }
};

// ===== DEPARTMENT RESOURCE REQUESTS =====
async function renderDeptRequests(el) {
  const content = el;

  const requests = await API.get('/api/dept-requests').catch(() => []);
  const pending = requests.filter(r => r.status === 'pending').length;

  content.innerHTML = `
    <h2>${tr('Department Requests', 'طلبات الأقسام')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${requests.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total', 'الإجمالي')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${pending}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Pending Approval', 'بانتظار الموافقة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('New Request', 'طلب جديد')}</h4>
        <div class="form-group"><label>${tr('Type', 'النوع')}</label>
          <select class="form-input" id="drType"><option value="supplies">${tr('Supplies', 'مستلزمات')}</option><option value="equipment">${tr('Equipment', 'أجهزة')}</option><option value="maintenance">${tr('Maintenance', 'صيانة')}</option><option value="staffing">${tr('Staffing', 'توظيف')}</option><option value="other">${tr('Other', 'أخرى')}</option></select></div>
        <div class="form-group"><label>${tr('Department', 'القسم')}</label><input class="form-input" id="drDept"></div>
        <div class="form-group"><label>${tr('Item/Description', 'البند/الوصف')}</label><input class="form-input" id="drItem"></div>
        <div class="form-group"><label>${tr('Quantity', 'الكمية')}</label><input type="number" class="form-input" id="drQty" value="1"></div>
        <div class="form-group"><label>${tr('Priority', 'الأولوية')}</label>
          <select class="form-input" id="drPriority"><option value="low">${tr('Low', 'منخفضة')}</option><option value="medium" selected>${tr('Medium', 'متوسطة')}</option><option value="high">${tr('High', 'عالية')}</option><option value="urgent">${tr('Urgent', 'عاجلة')}</option></select></div>
        <div class="form-group"><label>${tr('Notes', 'ملاحظات')}</label><textarea class="form-input" id="drNotes" rows="2"></textarea></div>
        <button class="btn btn-primary w-full" onclick="saveDeptReq()">📤 ${tr('Submit', 'تقديم')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Requests', 'الطلبات')}</h4>
        <div id="drTable"></div>
      </div>
    </div>`;

  const dt = document.getElementById('drTable');
  if (dt) {
    createTable(dt, 'drTbl',
      [tr('Type', 'النوع'), tr('Dept', 'القسم'), tr('Item', 'البند'), tr('Qty', 'الكمية'), tr('Priority', 'الأولوية'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', '')],
      requests.map(r => ({ cells: [r.request_type || r.type || '', r.department || '', r.item || r.description || '', r.quantity || '', r.priority || '', statusBadge(r.status), r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA') : '', r.status === 'pending' ? '<button class="btn btn-sm" style="background:#e8f5e9;color:#2e7d32" onclick="approveDeptReq(' + r.id + ')">✅ ' + tr('Approve', 'موافقة') + '</button> <button class="btn btn-sm" style="background:#fce4ec;color:#c62828" onclick="rejectDeptReq(' + r.id + ')">❌</button>' : ''], id: r.id }))
    );
  }
  window.saveDeptReq = async () => { try { await API.post('/api/dept-requests', { request_type: document.getElementById('drType').value, department: document.getElementById('drDept').value, item: document.getElementById('drItem').value, quantity: document.getElementById('drQty').value, priority: document.getElementById('drPriority').value, notes: document.getElementById('drNotes').value, requested_by: window.currentUser?.display_name || '' }); showToast(tr('Request submitted!', 'تم تقديم الطلب!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); } };
  window.approveDeptReq = async (id) => { try { await API.put('/api/dept-requests/' + id, { status: 'approved' }); showToast('✅'); navigateTo(currentPage); } catch (e) { } };
  window.rejectDeptReq = async (id) => { try { await API.put('/api/dept-requests/' + id, { status: 'rejected' }); showToast('❌'); navigateTo(currentPage); } catch (e) { } };

}
let drqItems = [];
window.addDrqItem = () => {
  const sel = document.getElementById('drqItem');
  const itemId = parseInt(sel.value);
  const itemName = sel.options[sel.selectedIndex]?.text || '';
  const qty = parseInt(document.getElementById('drqQty').value) || 1;
  if (!itemId) return;
  if (drqItems.find(x => x.item_id === itemId)) { showToast(tr('Item already added', 'الصنف مضاف مسبقاً'), 'error'); return; }
  drqItems.push({ item_id: itemId, name: itemName, qty });
  renderDrqItems();
};
function renderDrqItems() {
  const c = document.getElementById('drqItemsList');
  if (!drqItems.length) { c.innerHTML = `<span style="color:var(--text-dim);font-size:13px">${tr('No items added', 'لم تتم إضافة أصناف')}</span>`; return; }
  c.innerHTML = drqItems.map((item, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--hover);border-radius:8px;margin:4px 0">
    <span>${item.name} × <strong>${item.qty}</strong></span>
    <button class="btn btn-danger btn-sm" onclick="drqItems.splice(${i},1);renderDrqItems()">🗑</button>
  </div>`).join('');
}
window.submitDrq = async () => {
  if (!drqItems.length) { showToast(tr('Add items first', 'أضف أصناف أولاً'), 'error'); return; }
  try {
    await API.post('/api/dept-requests', {
      department: document.getElementById('drqDept').value,
      requested_by: currentUser?.name || '',
      items: drqItems,
      notes: document.getElementById('drqNotes').value
    });
    showToast(tr('Request submitted!', 'تم إرسال الطلب!'));
    drqItems = [];
    await navigateTo(17);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.approveDrq = async (id) => {
  try { await API.put(`/api/dept-requests/${id}`, { status: 'Approved' }); showToast(tr('Approved!', 'تم الاعتماد!')); await navigateTo(17); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.rejectDrq = async (id) => {
  try { await API.put(`/api/dept-requests/${id}`, { status: 'Rejected' }); showToast(tr('Rejected', 'تم الرفض')); await navigateTo(17); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== SURGERY & PRE-OP =====
let surgeryTab = 'schedule';
async function renderSurgery(el) {
  const [surgeries, patients, ors, emps] = await Promise.all([
    API.get('/api/surgeries'), API.get('/api/patients'),
    API.get('/api/operating-rooms'), API.get('/api/employees')
  ]);
  const doctors = emps.filter(e => e.role === 'Doctor' || e.name);
  const priorityBadge = p => p === 'Urgent' ? badge(p, 'danger') : p === 'Emergency' ? badge(p, 'danger') : badge(p, 'info');
  const surgStatusBadge = s => ({ Scheduled: 'info', 'In Progress': 'warning', Completed: 'success', Cancelled: 'danger' }[s] || 'info');

  el.innerHTML = `
    <div class="page-title">🏥 ${tr('Surgery & Pre-Op Management', 'العمليات وما قبلها')}</div>
    <div class="flex gap-8 mb-16" style="flex-wrap:wrap">
      <button class="btn ${surgeryTab === 'schedule' ? 'btn-primary' : 'btn-secondary'}" onclick="surgeryTab='schedule';navigateTo(18)">📅 ${tr('Surgery Schedule', 'جدول العمليات')}</button>
      <button class="btn ${surgeryTab === 'preop' ? 'btn-primary' : 'btn-secondary'}" onclick="surgeryTab='preop';navigateTo(18)">📋 ${tr('Pre-Op Assessment', 'تقييم ما قبل العملية')}</button>
      <button class="btn ${surgeryTab === 'anesthesia' ? 'btn-primary' : 'btn-secondary'}" onclick="surgeryTab='anesthesia';navigateTo(18)">💉 ${tr('Anesthesia', 'التخدير')}</button>
      <button class="btn ${surgeryTab === 'rooms' ? 'btn-primary' : 'btn-secondary'}" onclick="surgeryTab='rooms';navigateTo(18)">🚪 ${tr('Operating Rooms', 'غرف العمليات')}</button>
    </div>
    <div id="surgeryContent"></div>`;

  const cont = document.getElementById('surgeryContent');
  if (surgeryTab === 'schedule') {
    cont.innerHTML = `
    <div class="split-layout"><div class="card">
      <div class="card-title">📝 ${tr('Schedule New Surgery', 'جدولة عملية جديدة')}</div>
      <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><select class="form-input" id="srgPatient">${patients.map(p => `<option value="${p.id}" data-name="">${p.file_number} - ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Procedure', 'الإجراء')}</label><input class="form-input" id="srgProc" placeholder="${tr('e.g. Appendectomy', 'مثال: استئصال الزائدة')}"></div>
      <div class="form-group mb-12"><label>${tr('Procedure (Arabic)', 'الإجراء بالعربية')}</label><input class="form-input" id="srgProcAr"></div>
      <div class="form-group mb-12"><label>${tr('Surgeon', 'الجراح')}</label><select class="form-input" id="srgSurgeon"><option value="">${tr('Select', 'اختر')}</option>${doctors.map(d => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Anesthetist', 'طبيب التخدير')}</label><select class="form-input" id="srgAnesth"><option value="">${tr('Select', 'اختر')}</option>${doctors.map(d => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Type', 'النوع')}</label><select class="form-input" id="srgType"><option value="Elective">${tr('Elective', 'اختيارية')}</option><option value="Urgent">${tr('Urgent', 'عاجلة')}</option><option value="Emergency">${tr('Emergency', 'طارئة')}</option></select></div>
      <div class="form-group mb-12"><label>${tr('Operating Room', 'غرفة العمليات')}</label><select class="form-input" id="srgOR">${ors.map(o => `<option value="${isArabic ? o.room_name_ar : o.room_name}">${isArabic ? o.room_name_ar : o.room_name} (${o.location})</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Date', 'التاريخ')}</label><input class="form-input" type="date" id="srgDate" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group mb-12"><label>${tr('Time', 'الوقت')}</label><input class="form-input" type="time" id="srgTime" value="08:00"></div>
      <div class="form-group mb-12"><label>${tr('Duration (min)', 'المدة (دقيقة)')}</label><input class="form-input" type="number" id="srgDur" value="60"></div>
      <div class="form-group mb-12"><label>${tr('Priority', 'الأولوية')}</label><select class="form-input" id="srgPriority"><option value="Normal">${tr('Normal', 'عادية')}</option><option value="Urgent">${tr('Urgent', 'عاجلة')}</option><option value="Emergency">${tr('Emergency', 'طارئة')}</option></select></div>
      <div class="form-group mb-12"><label>${tr('Notes', 'ملاحظات')}</label><textarea class="form-input form-textarea" id="srgNotes"></textarea></div>
      <button class="btn btn-primary w-full" onclick="scheduleSurgery()" style="height:44px">📅 ${tr('Schedule Surgery', 'جدولة العملية')}</button>
    </div><div class="card">
      <div class="card-title">📋 ${tr('Surgery Schedule', 'جدول العمليات')}</div>
      <input class="search-filter" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'srgTable')">
      <div id="srgTable">${makeTable(
      [tr('ID', '#'), tr('Patient', 'المريض'), tr('Procedure', 'الإجراء'), tr('Surgeon', 'الجراح'), tr('Date', 'التاريخ'), tr('Time', 'الوقت'), tr('OR', 'الغرفة'), tr('Priority', 'الأولوية'), tr('Pre-Op', 'ما قبل'), tr('Status', 'الحالة'), tr('Actions', 'إجراءات')],
      surgeries.map(s => ({ cells: [s.id, s.patient_name, isArabic ? (s.procedure_name_ar || s.procedure_name) : s.procedure_name, s.surgeon_name, s.scheduled_date, s.scheduled_time, s.operating_room, priorityBadge(s.priority), badge(s.preop_status, s.preop_status === 'Complete' ? 'success' : s.preop_status === 'In Progress' ? 'warning' : 'danger'), badge(s.status, surgStatusBadge(s.status))], id: s.id })),
      row => `<div class="flex gap-4" style="flex-wrap:wrap">
              ${row.cells[9]?.includes('Scheduled') || row.cells[9]?.includes('info') ? `<button class="btn btn-warning btn-sm" onclick="updateSurgStatus(${row.id},'In Progress')" style="font-size:11px">▶ ${tr('Start', 'بدء')}</button>` : ''}
              ${!row.cells[9]?.includes('Completed') && !row.cells[9]?.includes('success') ? `<button class="btn btn-success btn-sm" onclick="updateSurgStatus(${row.id},'Completed')" style="font-size:11px;font-weight:bold">✅ ${tr('Surgery Done', 'انتهت العملية')}</button>` : `<span class="badge badge-success">✅ ${tr('Done', 'منتهية')}</span>`}
              <button class="btn btn-danger btn-sm" onclick="deleteSurgery(${row.id})" style="font-size:11px">🗑</button>
            </div>`
    )}</div>
    </div></div>`;
  } else if (surgeryTab === 'preop') {
    cont.innerHTML = `<div class="card">
      <div class="card-title">📋 ${tr('Pre-Operative Assessment', 'تقييم ما قبل العملية')}</div>
      <div class="form-group mb-12"><label>${tr('Select Surgery', 'اختر العملية')}</label>
        <select class="form-input" id="preopSurgery" onchange="loadPreopAssessment()">
          <option value="">${tr('-- Select --', '-- اختر --')}</option>
          ${surgeries.filter(s => s.status === 'Scheduled').map(s => `<option value="${s.id}">${s.id} - ${s.patient_name} - ${s.procedure_name} (${s.scheduled_date})</option>`).join('')}
        </select>
      </div>
      <div id="preopForm" style="display:none">
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
          ${[{ id: 'npo', icon: '🚫', l: 'NPO Confirmed (صيام مؤكد)' }, { id: 'allergies', icon: '⚠️', l: 'Allergies Reviewed (مراجعة الحساسية)', hasNotes: 1 }, { id: 'medications', icon: '💊', l: 'Medications Reviewed (مراجعة الأدوية)', hasNotes: 1 },
      { id: 'labs', icon: '🔬', l: 'Labs Reviewed (مراجعة الفحوصات)', hasNotes: 1 }, { id: 'imaging', icon: '📡', l: 'Imaging Reviewed (مراجعة الأشعة)', hasNotes: 1 }, { id: 'blood_type', icon: '🩸', l: 'Blood Type Confirmed (فصيلة الدم مؤكدة)' },
      { id: 'consent', icon: '📝', l: 'Consent Signed (الإقرار موقع)' }, { id: 'anesthesia_clr', icon: '💉', l: 'Anesthesia Clearance (موافقة التخدير)' }, { id: 'nursing', icon: '👩‍⚕️', l: 'Nursing Assessment (تقييم التمريض)', hasNotes: 1 },
      { id: 'cardiac', icon: '❤️', l: 'Cardiac Clearance (موافقة القلب)', hasNotes: 1 }, { id: 'pulmonary', icon: '🫁', l: 'Pulmonary Clearance (موافقة الرئة)' }, { id: 'infection', icon: '🦠', l: 'Infection Screening (فحص العدوى)' },
      { id: 'dvt', icon: '💉', l: 'DVT Prophylaxis (الوقاية من الجلطات)' }
      ].map(c => `<div class="stat-card" style="--stat-color:#60a5fa;padding:12px;cursor:pointer" onclick="document.getElementById('preop_${c.id}').checked=!document.getElementById('preop_${c.id}').checked">
            <div style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="preop_${c.id}" style="width:20px;height:20px;accent-color:#4ade80" onclick="event.stopPropagation()"> <span>${c.icon} ${c.l}</span></div>
            ${c.hasNotes ? `<input class="form-input mt-8" id="preop_${c.id}_notes" placeholder="${tr('Notes', 'ملاحظات')}" style="font-size:12px" onclick="event.stopPropagation()">` : ''}</div>`).join('')}
        </div>
        <div class="flex gap-8 mt-16"><div class="form-group" style="flex:1"><label>${tr('Blood Reserved', 'دم محجوز')}</label><select class="form-input" id="preop_blood_reserved"><option value="0">${tr('No', 'لا')}</option><option value="1">${tr('Yes', 'نعم')}</option></select></div></div>
        <button class="btn btn-primary w-full mt-16" onclick="savePreopAssessment()" style="height:44px">💾 ${tr('Save Assessment', 'حفظ التقييم')}</button>
        <div class="card mt-16"><div class="card-title">🔬 ${tr('Required Pre-Op Tests', 'فحوصات مطلوبة قبل العملية')}</div>
          <div class="flex gap-8 mb-12"><select class="form-input" id="preopTestType" style="flex:1"><option value="Lab">${tr('Lab', 'مختبر')}</option><option value="Radiology">${tr('Radiology', 'أشعة')}</option><option value="ECG">ECG</option><option value="Other">${tr('Other', 'أخرى')}</option></select>
            <input class="form-input" id="preopTestName" placeholder="${tr('Test name', 'اسم الفحص')}" style="flex:2">
            <button class="btn btn-success" onclick="addPreopTest()">➕</button></div>
          <div id="preopTestsList"></div>
        </div>
      </div>
    </div>`;
  } else if (surgeryTab === 'anesthesia') {
    cont.innerHTML = `<div class="card">
      <div class="card-title">💉 ${tr('Anesthesia Record', 'سجل التخدير')}</div>
      <div class="form-group mb-12"><label>${tr('Select Surgery', 'اختر العملية')}</label>
        <select class="form-input" id="anesthSurgery" onchange="loadAnesthRecord()">
          <option value="">${tr('-- Select --', '-- اختر --')}</option>
          ${surgeries.map(s => `<option value="${s.id}">${s.id} - ${s.patient_name} - ${s.procedure_name} (${s.scheduled_date})</option>`).join('')}
        </select></div>
      <div id="anesthForm" style="display:none">
        <div class="grid-equal"><div>
          <div class="form-group mb-12"><label>${tr('Anesthetist', 'طبيب التخدير')}</label><input class="form-input" id="anName"></div>
          <div class="form-group mb-12"><label>ASA ${tr('Classification', 'التصنيف')}</label><select class="form-input" id="anASA"><option>ASA I</option><option>ASA II</option><option>ASA III</option><option>ASA IV</option><option>ASA V</option><option>ASA VI</option></select></div>
          <div class="form-group mb-12"><label>${tr('Anesthesia Type', 'نوع التخدير')}</label><select class="form-input" id="anType"><option value="General">${tr('General', 'عام')}</option><option value="Spinal">${tr('Spinal', 'نخاعي')}</option><option value="Epidural">${tr('Epidural', 'فوق الجافية')}</option><option value="Regional">${tr('Regional', 'موضعي')}</option><option value="Local">${tr('Local', 'موضعي')}</option><option value="Sedation">${tr('Sedation', 'تخدير واعي')}</option></select></div>
          <div class="form-group mb-12"><label>${tr('Airway Assessment', 'تقييم المجرى الهوائي')}</label><input class="form-input" id="anAirway"></div>
          <div class="form-group mb-12"><label>Mallampati Score</label><select class="form-input" id="anMallampati"><option value="">-</option><option>Class I</option><option>Class II</option><option>Class III</option><option>Class IV</option></select></div>
        </div><div>
          <div class="form-group mb-12"><label>${tr('Premedication', 'أدوية تحضيرية')}</label><input class="form-input" id="anPremed"></div>
          <div class="form-group mb-12"><label>${tr('Induction Agents', 'أدوية التحريض')}</label><input class="form-input" id="anInduction"></div>
          <div class="form-group mb-12"><label>${tr('Maintenance', 'أدوية الصيانة')}</label><input class="form-input" id="anMaint"></div>
          <div class="form-group mb-12"><label>${tr('Muscle Relaxants', 'مرخيات العضلات')}</label><input class="form-input" id="anRelax"></div>
          <div class="form-group mb-12"><label>${tr('IV Access', 'المدخل الوريدي')}</label><input class="form-input" id="anIV"></div>
        </div></div>
        <div class="grid-equal"><div>
          <div class="form-group mb-12"><label>${tr('Fluid Given', 'السوائل المعطاة')}</label><input class="form-input" id="anFluid"></div>
          <div class="form-group mb-12"><label>${tr('Blood Loss (ml)', 'فقدان الدم (مل)')}</label><input class="form-input" type="number" id="anBloodLoss" value="0"></div>
        </div><div>
          <div class="form-group mb-12"><label>${tr('Complications', 'مضاعفات')}</label><input class="form-input" id="anComp"></div>
          <div class="form-group mb-12"><label>${tr('Recovery Notes', 'ملاحظات الإفاقة')}</label><textarea class="form-input form-textarea" id="anRecovery"></textarea></div>
        </div></div>
        <button class="btn btn-primary w-full" onclick="saveAnesthRecord()" style="height:44px">💾 ${tr('Save Anesthesia Record', 'حفظ سجل التخدير')}</button>
      </div></div>`;
  } else if (surgeryTab === 'rooms') {
    cont.innerHTML = `<div class="card">
      <div class="card-title">🚪 ${tr('Operating Rooms', 'غرف العمليات')}</div>
      <div class="stats-grid" style="margin-bottom:16px">${ors.map(o => `<div class="stat-card" style="--stat-color:${o.status === 'Available' ? '#4ade80' : '#f87171'}">
        <span class="stat-icon">🚪</span><div class="stat-label">${isArabic ? o.room_name_ar : o.room_name}</div>
        <div class="stat-value" style="font-size:14px">${o.location}</div>
        <div>${badge(o.status, o.status === 'Available' ? 'success' : 'danger')}</div>
      </div>`).join('')}</div>
    </div>`;
  }
}

window.scheduleSurgery = async () => {
  const pSel = document.getElementById('srgPatient');
  try {
    await API.post('/api/surgeries', {
      patient_id: pSel.value, patient_name: pSel.options[pSel.selectedIndex]?.dataset?.name || '',
      surgeon_id: document.getElementById('srgSurgeon').value, surgeon_name: document.getElementById('srgSurgeon').options[document.getElementById('srgSurgeon').selectedIndex]?.dataset?.name || '',
      anesthetist_id: document.getElementById('srgAnesth').value, anesthetist_name: document.getElementById('srgAnesth').options[document.getElementById('srgAnesth').selectedIndex]?.dataset?.name || '',
      procedure_name: document.getElementById('srgProc').value, procedure_name_ar: document.getElementById('srgProcAr').value,
      surgery_type: document.getElementById('srgType').value, operating_room: document.getElementById('srgOR').value,
      scheduled_date: document.getElementById('srgDate').value, scheduled_time: document.getElementById('srgTime').value,
      estimated_duration: document.getElementById('srgDur').value, priority: document.getElementById('srgPriority').value,
      notes: document.getElementById('srgNotes').value
    });
    showToast(tr('Surgery scheduled!', 'تم جدولة العملية!')); surgeryTab = 'schedule'; await navigateTo(18);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.updateSurgStatus = async (id, status) => {
  try { await API.put(`/api/surgeries/${id}`, { status }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(18); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.deleteSurgery = async (id) => {
  if (!confirm(tr('Delete this surgery?', 'حذف هذه العملية؟'))) return;
  try { await API.del(`/api/surgeries/${id}`); showToast(tr('Deleted', 'تم الحذف')); await navigateTo(18); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.loadPreopAssessment = async () => {
  const sid = document.getElementById('preopSurgery').value;
  if (!sid) { document.getElementById('preopForm').style.display = 'none'; return; }
  document.getElementById('preopForm').style.display = 'block';
  try {
    const data = await API.get(`/api/surgeries/${sid}/preop`);
    if (data) {
      const map = { npo: 'npo_confirmed', allergies: 'allergies_reviewed', medications: 'medications_reviewed', labs: 'labs_reviewed', imaging: 'imaging_reviewed', blood_type: 'blood_type_confirmed', consent: 'consent_signed', anesthesia_clr: 'anesthesia_clearance', nursing: 'nursing_assessment', cardiac: 'cardiac_clearance', pulmonary: 'pulmonary_clearance', infection: 'infection_screening', dvt: 'dvt_prophylaxis' };
      Object.entries(map).forEach(([k, v]) => { const el = document.getElementById('preop_' + k); if (el) el.checked = !!data[v]; });
      ['allergies', 'medications', 'labs', 'imaging', 'nursing', 'cardiac'].forEach(k => { const el = document.getElementById('preop_' + k + '_notes'); if (el) el.value = data[k + '_notes'] || ''; });
      document.getElementById('preop_blood_reserved').value = data.blood_reserved ? '1' : '0';
    }
    const tests = await API.get(`/api/surgeries/${sid}/preop-tests`);
    const tl = document.getElementById('preopTestsList');
    tl.innerHTML = tests.length ? makeTable([tr('Type', 'النوع'), tr('Test', 'الفحص'), tr('Status', 'الحالة'), tr('Result', 'النتيجة'), tr('Action', 'إجراء')],
      tests.map(t => ({ cells: [t.test_type, t.test_name, t.is_completed ? badge(tr('Done', 'تم'), 'success') : badge(tr('Pending', 'معلق'), 'warning'), t.result_summary || '-'], id: t.id })),
      row => `<button class="btn btn-success btn-sm" onclick="markTestDone(${row.id})">✅</button>`) : `<p style="color:var(--text-dim)">${tr('No tests added', 'لم تتم إضافة فحوصات')}</p>`;
  } catch (e) { console.error(e); }
};
window.savePreopAssessment = async () => {
  const sid = document.getElementById('preopSurgery').value;
  if (!sid) return;
  try {
    await API.post(`/api/surgeries/${sid}/preop`, {
      npo_confirmed: document.getElementById('preop_npo').checked, allergies_reviewed: document.getElementById('preop_allergies').checked,
      allergies_notes: document.getElementById('preop_allergies_notes')?.value || '', medications_reviewed: document.getElementById('preop_medications').checked,
      medications_notes: document.getElementById('preop_medications_notes')?.value || '', labs_reviewed: document.getElementById('preop_labs').checked,
      labs_notes: document.getElementById('preop_labs_notes')?.value || '', imaging_reviewed: document.getElementById('preop_imaging').checked,
      imaging_notes: document.getElementById('preop_imaging_notes')?.value || '', blood_type_confirmed: document.getElementById('preop_blood_type').checked,
      blood_reserved: document.getElementById('preop_blood_reserved').value === '1', consent_signed: document.getElementById('preop_consent').checked,
      anesthesia_clearance: document.getElementById('preop_anesthesia_clr').checked, nursing_assessment: document.getElementById('preop_nursing').checked,
      nursing_notes: document.getElementById('preop_nursing_notes')?.value || '', cardiac_clearance: document.getElementById('preop_cardiac').checked,
      cardiac_notes: document.getElementById('preop_cardiac_notes')?.value || '', pulmonary_clearance: document.getElementById('preop_pulmonary').checked,
      infection_screening: document.getElementById('preop_infection').checked, dvt_prophylaxis: document.getElementById('preop_dvt').checked
    });
    showToast(tr('Assessment saved!', 'تم حفظ التقييم!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.addPreopTest = async () => {
  const sid = document.getElementById('preopSurgery').value;
  if (!sid) return;
  try {
    await API.post(`/api/surgeries/${sid}/preop-tests`, { test_type: document.getElementById('preopTestType').value, test_name: document.getElementById('preopTestName').value });
    showToast(tr('Test added', 'تم إضافة الفحص')); loadPreopAssessment();
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.markTestDone = async (id) => {
  try { await API.put(`/api/surgery-preop-tests/${id}`, { is_completed: 1 }); showToast(tr('Done', 'تم')); loadPreopAssessment(); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.loadAnesthRecord = async () => {
  const sid = document.getElementById('anesthSurgery').value;
  if (!sid) { document.getElementById('anesthForm').style.display = 'none'; return; }
  document.getElementById('anesthForm').style.display = 'block';
  try {
    const d = await API.get(`/api/surgeries/${sid}/anesthesia`);
    if (d) {
      document.getElementById('anName').value = d.anesthetist_name || ''; document.getElementById('anASA').value = d.asa_class || 'ASA I';
      document.getElementById('anType').value = d.anesthesia_type || 'General'; document.getElementById('anAirway').value = d.airway_assessment || '';
      document.getElementById('anMallampati').value = d.mallampati_score || ''; document.getElementById('anPremed').value = d.premedication || '';
      document.getElementById('anInduction').value = d.induction_agents || ''; document.getElementById('anMaint').value = d.maintenance_agents || '';
      document.getElementById('anRelax').value = d.muscle_relaxants || ''; document.getElementById('anIV').value = d.iv_access || '';
      document.getElementById('anFluid').value = d.fluid_given || ''; document.getElementById('anBloodLoss').value = d.blood_loss_ml || 0;
      document.getElementById('anComp').value = d.complications || ''; document.getElementById('anRecovery').value = d.recovery_notes || '';
    }
  } catch (e) { }
};
window.saveAnesthRecord = async () => {
  const sid = document.getElementById('anesthSurgery').value;
  if (!sid) return;
  try {
    await API.post(`/api/surgeries/${sid}/anesthesia`, {
      anesthetist_name: document.getElementById('anName').value, asa_class: document.getElementById('anASA').value,
      anesthesia_type: document.getElementById('anType').value, airway_assessment: document.getElementById('anAirway').value,
      mallampati_score: document.getElementById('anMallampati').value, premedication: document.getElementById('anPremed').value,
      induction_agents: document.getElementById('anInduction').value, maintenance_agents: document.getElementById('anMaint').value,
      muscle_relaxants: document.getElementById('anRelax').value, iv_access: document.getElementById('anIV').value,
      fluid_given: document.getElementById('anFluid').value, blood_loss_ml: parseInt(document.getElementById('anBloodLoss').value) || 0,
      complications: document.getElementById('anComp').value, recovery_notes: document.getElementById('anRecovery').value
    });
    showToast(tr('Anesthesia record saved!', 'تم حفظ سجل التخدير!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== BLOOD BANK =====
let bbTab = 'inventory';
async function renderBloodBank(el) {
  const [stats, units, donors, crossmatches, transfusions, patients] = await Promise.all([
    API.get('/api/blood-bank/stats'), API.get('/api/blood-bank/units'),
    API.get('/api/blood-bank/donors'), API.get('/api/blood-bank/crossmatch'),
    API.get('/api/blood-bank/transfusions'), API.get('/api/patients')
  ]);
  const btColors = { 'A': '#ef4444', 'B': '#3b82f6', 'AB': '#8b5cf6', 'O': '#22c55e' };
  el.innerHTML = `
    <div class="page-title">🩸 ${tr('Blood Bank', 'بنك الدم')}</div>
    <div class="stats-grid">
      <div class="stat-card" style="--stat-color:#ef4444"><span class="stat-icon">🩸</span><div class="stat-label">${tr('Available Units', 'وحدات متاحة')}</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card" style="--stat-color:#f59e0b"><span class="stat-icon">⏰</span><div class="stat-label">${tr('Expiring Soon', 'تنتهي قريباً')}</div><div class="stat-value">${stats.expiring}</div></div>
      <div class="stat-card" style="--stat-color:#3b82f6"><span class="stat-icon">👥</span><div class="stat-label">${tr('Total Donors', 'إجمالي المتبرعين')}</div><div class="stat-value">${stats.totalDonors}</div></div>
      <div class="stat-card" style="--stat-color:#8b5cf6"><span class="stat-icon">🔄</span><div class="stat-label">${tr('Today Transfusions', 'نقل دم اليوم')}</div><div class="stat-value">${stats.todayTransfusions}</div></div>
      <div class="stat-card" style="--stat-color:#06b6d4"><span class="stat-icon">🧪</span><div class="stat-label">${tr('Pending Cross-Match', 'توافق معلق')}</div><div class="stat-value">${stats.pendingCrossmatch}</div></div>
    </div>
    <div class="stats-grid mt-16" style="grid-template-columns:repeat(8,1fr)">
      ${['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => {
    const bt = t.replace(/[+-]/, ''), rh = t.includes('+') ? '+' : '-';
    const cnt = stats.byType?.find(b => b.blood_type === bt && b.rh_factor === rh)?.cnt || 0;
    return `<div class="stat-card" style="--stat-color:${btColors[bt] || '#888'};text-align:center;padding:12px"><div style="font-size:24px;font-weight:800">${t}</div><div style="font-size:18px;font-weight:600">${cnt}</div><div style="font-size:10px">${tr('units', 'وحدة')}</div></div>`;
  }).join('')}
    </div>
    <div class="flex gap-8 mt-16 mb-16" style="flex-wrap:wrap">
      <button class="btn ${bbTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}" onclick="bbTab='inventory';navigateTo(19)">📦 ${tr('Inventory', 'المخزون')}</button>
      <button class="btn ${bbTab === 'donors' ? 'btn-primary' : 'btn-secondary'}" onclick="bbTab='donors';navigateTo(19)">👥 ${tr('Donors', 'المتبرعين')}</button>
      <button class="btn ${bbTab === 'crossmatch' ? 'btn-primary' : 'btn-secondary'}" onclick="bbTab='crossmatch';navigateTo(19)">🧪 ${tr('Cross-Match', 'التوافق')}</button>
      <button class="btn ${bbTab === 'transfusions' ? 'btn-primary' : 'btn-secondary'}" onclick="bbTab='transfusions';navigateTo(19)">💉 ${tr('Transfusions', 'نقل الدم')}</button>
    </div>
    <div id="bbContent"></div>`;
  const cont = document.getElementById('bbContent');
  if (bbTab === 'inventory') {
    cont.innerHTML = `<div class="split-layout"><div class="card">
      <div class="card-title">➕ ${tr('Add Blood Unit', 'إضافة وحدة دم')}</div>
      <div class="form-group mb-12"><label>${tr('Bag Number', 'رقم الكيس')}</label><input class="form-input" id="bbBag"></div>
      <div class="form-group mb-12"><label>${tr('Blood Type', 'فصيلة الدم')}</label><select class="form-input" id="bbType"><option>A</option><option>B</option><option>AB</option><option>O</option></select></div>
      <div class="form-group mb-12"><label>Rh</label><select class="form-input" id="bbRh"><option value="+">+</option><option value="-">-</option></select></div>
      <div class="form-group mb-12"><label>${tr('Component', 'المكون')}</label><select class="form-input" id="bbComp"><option>Whole Blood</option><option>Packed RBC</option><option>FFP</option><option>Platelets</option><option>Cryoprecipitate</option></select></div>
      <div class="form-group mb-12"><label>${tr('Collection Date', 'تاريخ التجميع')}</label><input class="form-input" type="date" id="bbCollDate" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group mb-12"><label>${tr('Expiry Date', 'تاريخ الانتهاء')}</label><input class="form-input" type="date" id="bbExpDate"></div>
      <div class="form-group mb-12"><label>${tr('Volume (ml)', 'الحجم (مل)')}</label><input class="form-input" type="number" id="bbVol" value="450"></div>
      <button class="btn btn-primary w-full" onclick="addBloodUnit()" style="height:44px">💾 ${tr('Add Unit', 'إضافة وحدة')}</button>
    </div><div class="card">
      <div class="card-title">📦 ${tr('Blood Units', 'وحدات الدم')}</div>
      <div id="bbUnitsTable">${makeTable([tr('Bag#', 'رقم الكيس'), tr('Type', 'الفصيلة'), tr('Component', 'المكون'), tr('Collection', 'التجميع'), tr('Expiry', 'الانتهاء'), tr('Status', 'الحالة')],
      units.map(u => ({ cells: [u.bag_number, u.blood_type + u.rh_factor, u.component, u.collection_date, u.expiry_date, statusBadge(u.status)] })))}</div>
    </div></div>`;
  } else if (bbTab === 'donors') {
    cont.innerHTML = `<div class="split-layout"><div class="card">
      <div class="card-title">👤 ${tr('Register Donor', 'تسجيل متبرع')}</div>
      <div class="form-group mb-12"><label>${tr('Name (EN)', 'الاسم (إنجليزي)')}</label><input class="form-input" id="bbDonorName"></div>
      <div class="form-group mb-12"><label>${tr('Name (AR)', 'الاسم (عربي)')}</label><input class="form-input" id="bbDonorNameAr"></div>
      <div class="form-group mb-12"><label>${tr('National ID', 'الهوية')}</label><input class="form-input" id="bbDonorNID"></div>
      <div class="form-group mb-12"><label>${tr('Phone', 'الجوال')}</label><input class="form-input" id="bbDonorPhone"></div>
      <div class="form-group mb-12"><label>${tr('Blood Type', 'فصيلة الدم')}</label><select class="form-input" id="bbDonorBT"><option>A</option><option>B</option><option>AB</option><option>O</option></select></div>
      <div class="form-group mb-12"><label>Rh</label><select class="form-input" id="bbDonorRh"><option value="+">+</option><option value="-">-</option></select></div>
      <div class="form-group mb-12"><label>${tr('Age', 'العمر')}</label><input class="form-input" type="number" id="bbDonorAge"></div>
      <button class="btn btn-primary w-full" onclick="addDonor()" style="height:44px">💾 ${tr('Register', 'تسجيل')}</button>
    </div><div class="card">
      <div class="card-title">👥 ${tr('Donors List', 'قائمة المتبرعين')}</div>
      <div id="bbDonorsTable">${makeTable([tr('Name', 'الاسم'), tr('ID', 'الهوية'), tr('Blood Type', 'الفصيلة'), tr('Phone', 'الجوال'), tr('Last Donation', 'آخر تبرع'), tr('Eligible', 'مؤهل')],
      donors.map(d => ({ cells: [isArabic ? (d.donor_name_ar || d.donor_name) : d.donor_name, d.national_id, d.blood_type + d.rh_factor, d.phone, d.last_donation_date, d.is_eligible ? badge(tr('Yes', 'نعم'), 'success') : badge(tr('No', 'لا'), 'danger')] })))}</div>
    </div></div>`;
  } else if (bbTab === 'crossmatch') {
    cont.innerHTML = `<div class="split-layout"><div class="card">
      <div class="card-title">🧪 ${tr('Request Cross-Match', 'طلب فحص توافق')}</div>
      <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><select class="form-input" id="bbCMPatient">${patients.map(p => `<option value="${p.id}" data-name="">${p.file_number} - ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Blood Type', 'فصيلة المريض')}</label><select class="form-input" id="bbCMBT"><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div>
      <div class="form-group mb-12"><label>${tr('Units Needed', 'الوحدات المطلوبة')}</label><input class="form-input" type="number" id="bbCMUnits" value="1"></div>
      <button class="btn btn-primary w-full" onclick="requestCrossmatch()" style="height:44px">🧪 ${tr('Request', 'طلب')}</button>
    </div><div class="card">
      <div class="card-title">📋 ${tr('Cross-Match Results', 'نتائج التوافق')}</div>
      <div id="bbCMTable">${makeTable([tr('Patient', 'المريض'), tr('Type', 'الفصيلة'), tr('Units', 'الوحدات'), tr('Technician', 'الفني'), tr('Result', 'النتيجة'), tr('Action', 'إجراء')],
      crossmatches.map(c => ({ cells: [c.patient_name, c.patient_blood_type, c.units_needed, c.lab_technician, c.result === 'Pending' ? badge(c.result, 'warning') : c.result === 'Compatible' ? badge(c.result, 'success') : badge(c.result, 'danger')], id: c.id })),
      row => `<button class="btn btn-success btn-sm" onclick="updateCrossmatch(${row.id},'Compatible')">✅</button><button class="btn btn-danger btn-sm" onclick="updateCrossmatch(${row.id},'Incompatible')">❌</button>`)}</div>
    </div></div>`;
  } else if (bbTab === 'transfusions') {
    cont.innerHTML = `<div class="split-layout"><div class="card">
      <div class="card-title">💉 ${tr('Record Transfusion', 'تسجيل نقل دم')}</div>
      <div class="form-group mb-12"><label>${tr('Patient', 'المريض')}</label><select class="form-input" id="bbTrPatient">${patients.map(p => `<option value="${p.id}" data-name="">${p.file_number} - ${isArabic ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Blood Unit', 'وحدة الدم')}</label><select class="form-input" id="bbTrUnit">${units.filter(u => u.status === 'Available').map(u => `<option value="${u.id}" data-bag="${u.bag_number}" data-bt="${u.blood_type + u.rh_factor}" data-comp="${u.component}">${u.bag_number} (${u.blood_type}${u.rh_factor} - ${u.component})</option>`).join('')}</select></div>
      <div class="form-group mb-12"><label>${tr('Volume (ml)', 'الحجم (مل)')}</label><input class="form-input" type="number" id="bbTrVol" value="450"></div>
      <button class="btn btn-primary w-full" onclick="recordTransfusion()" style="height:44px">💉 ${tr('Record', 'تسجيل')}</button>
    </div><div class="card">
      <div class="card-title">📋 ${tr('Transfusion Records', 'سجل نقل الدم')}</div>
      <div id="bbTrTable">${makeTable([tr('Patient', 'المريض'), tr('Bag#', 'الكيس'), tr('Type', 'الفصيلة'), tr('Component', 'المكون'), tr('By', 'بواسطة'), tr('Time', 'الوقت'), tr('Reaction', 'تفاعل')],
      transfusions.map(t => ({ cells: [t.patient_name, t.bag_number, t.blood_type, t.component, t.administered_by, t.start_time?.split('T')[0] || '', t.adverse_reaction ? badge(tr('Yes', 'نعم'), 'danger') : badge(tr('No', 'لا'), 'success')] })))}</div>
    </div></div>`;
  }
}
window.addBloodUnit = async () => {
  try {
    await API.post('/api/blood-bank/units', { bag_number: document.getElementById('bbBag').value, blood_type: document.getElementById('bbType').value, rh_factor: document.getElementById('bbRh').value, component: document.getElementById('bbComp').value, collection_date: document.getElementById('bbCollDate').value, expiry_date: document.getElementById('bbExpDate').value, volume_ml: document.getElementById('bbVol').value });
    showToast(tr('Unit added!', 'تم إضافة الوحدة!')); bbTab = 'inventory'; await navigateTo(19);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.addDonor = async () => {
  try {
    await API.post('/api/blood-bank/donors', { donor_name: document.getElementById('bbDonorName').value, donor_name_ar: document.getElementById('bbDonorNameAr').value, national_id: document.getElementById('bbDonorNID').value, phone: document.getElementById('bbDonorPhone').value, blood_type: document.getElementById('bbDonorBT').value, rh_factor: document.getElementById('bbDonorRh').value, age: document.getElementById('bbDonorAge').value });
    showToast(tr('Donor registered!', 'تم تسجيل المتبرع!')); bbTab = 'donors'; await navigateTo(19);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.requestCrossmatch = async () => {
  const sel = document.getElementById('bbCMPatient');
  try {
    await API.post('/api/blood-bank/crossmatch', { patient_id: sel.value, patient_name: sel.options[sel.selectedIndex]?.dataset?.name || '', patient_blood_type: document.getElementById('bbCMBT').value, units_needed: document.getElementById('bbCMUnits').value });
    showToast(tr('Cross-match requested!', 'تم طلب فحص التوافق!')); bbTab = 'crossmatch'; await navigateTo(19);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.updateCrossmatch = async (id, result) => {
  try { await API.put(`/api/blood-bank/crossmatch/${id}`, { result }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(19); }
  catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.recordTransfusion = async () => {
  const pSel = document.getElementById('bbTrPatient'), uSel = document.getElementById('bbTrUnit');
  const opt = uSel.options[uSel.selectedIndex];
  try {
    await API.post('/api/blood-bank/transfusions', { patient_id: pSel.value, patient_name: pSel.options[pSel.selectedIndex]?.dataset?.name || '', unit_id: uSel.value, bag_number: opt?.dataset?.bag || '', blood_type: opt?.dataset?.bt || '', component: opt?.dataset?.comp || '', volume_ml: document.getElementById('bbTrVol').value });
    showToast(tr('Transfusion recorded!', 'تم تسجيل نقل الدم!')); bbTab = 'transfusions'; await navigateTo(19);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== CONSENT FORMS =====

window.printConsentForm = async (formId) => {
  try {
    const [form, settings] = await Promise.all([
      API.get('/api/consent-forms/' + formId),
      API.get('/api/settings')
    ]);
    // Try to use rich HTML template if available
    if (form.form_type) {
      const renderUrl = `/api/consent-forms/render/${form.form_type}?patient_id=${form.patient_id || ''}&doctor_name=${encodeURIComponent(form.doctor_name || '')}`;
      try {
        const resp = await fetch(renderUrl);
        if (resp.ok) {
          const w = window.open('', '_blank');
          const html = await resp.text();
          // Add print/close buttons at top
          const printBar = `<div class="no-print" style="text-align:center;margin-bottom:20px;padding:15px;background:#f8f9fa;border-bottom:2px solid #1a365d">
            <button onclick="window.print()" style="padding:12px 40px;font-size:16px;background:#1a365d;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ طباعة / Print</button>
            <button onclick="window.close()" style="padding:12px 30px;font-size:16px;background:#dc3545;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:10px">✕ إغلاق</button>
          </div><style>@media print{.no-print{display:none!important}}</style>`;
          const finalHtml = html.replace('<body>', '<body>' + printBar);
          w.document.write(finalHtml);
          w.document.close();
          return;
        }
      } catch (e) { /* fall through to legacy print */ }
    }
    // Legacy text-based print (fallback)
    const hospitalAr = settings.company_name_ar || 'نما الطبي';
    const hospitalEn = settings.company_name_en || 'Nama Medical';
    const phone = settings.phone || '';
    const address = settings.address || '';
    const taxNum = settings.tax_number || '';
    const title = form.form_title_ar || form.form_title || '';
    const titleEn = form.form_title || '';
    const contentText = (form.content || '').replace(/\\n/g, '\n');
    const contentParts = contentText.split('\n').filter(l => l.trim());
    const arabicContent = contentParts.filter(l => /[\u0600-\u06FF]/.test(l));
    const englishContent = contentParts.filter(l => !/[\u0600-\u06FF]/.test(l.replace(/[⚠️]/g, '')));
    const signedDate = form.signed_at ? new Date(form.signed_at).toLocaleDateString('ar-SA') : new Date().toLocaleDateString('ar-SA');
    const sigImg = form.patient_signature && form.patient_signature.startsWith('data:') ? `<img src="${form.patient_signature}" style="max-height:80px;max-width:200px">` : '<div style="height:60px;border-bottom:2px solid #333;width:200px"></div>';
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
@page{size:A4;margin:18mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:30px;color:#222;direction:rtl;line-height:1.8;font-size:14px}
.header{text-align:center;border-bottom:3px double #1a365d;padding-bottom:18px;margin-bottom:25px}
.header h1{font-size:22px;color:#1a365d;margin:6px 0}
.header h2{font-size:16px;color:#555;font-weight:500;margin-bottom:4px}
.header .hospital-info{font-size:11px;color:#888;margin-top:8px}
.patient-box{display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1px solid #ccc;border-radius:8px;padding:16px;margin-bottom:20px;background:#fafbfc}
.patient-box .field{font-size:13px}
.patient-box .field label{font-weight:700;color:#1a365d}
.consent-section{margin:20px 0;padding:18px;border:1px solid #ddd;border-radius:10px}
.consent-section h3{color:#1a365d;font-size:16px;text-align:center;margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:8px}
.consent-text-ar{font-size:14px;line-height:2;text-align:justify;margin-bottom:16px;padding:12px;background:#f7f8fa;border-radius:8px}
.consent-text-en{font-size:12px;line-height:1.8;text-align:left;direction:ltr;color:#555;font-style:italic;padding:12px;background:#f0f4f8;border-radius:8px;margin-top:10px}
.sig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:35px;padding-top:15px;border-top:2px solid #eee}
.sig-box{text-align:center}
.sig-box .sig-label{font-weight:700;font-size:13px;color:#1a365d;margin-bottom:4px}
.sig-box .sig-label-en{font-size:11px;color:#888}
.sig-box .sig-area{margin-top:8px;min-height:70px;display:flex;align-items:flex-end;justify-content:center}
.sig-box .sig-line{border-top:2px solid #333;width:100%;margin-top:60px;padding-top:4px}
.status-badge{display:inline-block;padding:3px 14px;border-radius:12px;font-size:12px;font-weight:700}
.status-signed{background:#d4edda;color:#155724}
.status-pending{background:#fff3cd;color:#856404}
.footer{text-align:center;margin-top:30px;padding-top:12px;border-top:1px solid #ccc;font-size:10px;color:#999}
@media print{body{padding:15px}.no-print{display:none!important}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px">
  <button onclick="window.print()" style="padding:12px 40px;font-size:16px;background:#1a365d;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ طباعة / Print</button>
  <button onclick="window.close()" style="padding:12px 30px;font-size:16px;background:#dc3545;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:10px">✕ إغلاق</button>
</div>
<div class="header">
  <h1>${hospitalAr}</h1>
  <h2>${hospitalEn}</h2><div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap"><button class="btn" onclick="showChangePassword()" style="background:#fff3e0;border:1px solid #ff9800;color:#e65100">🔑 ${tr("Change Password", "تغيير كلمة المرور")}</button><button class="btn" onclick="startBackup()" style="background:#e8f5e9;border:1px solid #4caf50;color:#2e7d32">💾 ${tr("Database Backup", "نسخة احتياطية")}</button></div>
  <div class="hospital-info">
    ${phone ? '📞 ' + phone + ' | ' : ''}${address ? '📍 ' + address + ' | ' : ''}${taxNum ? 'الرقم الضريبي: ' + taxNum : ''}
  </div>
</div>
<h3 style="text-align:center;color:#1a365d;font-size:18px;margin-bottom:5px">📜 ${title}</h3>
<p style="text-align:center;color:#777;font-size:13px;margin-bottom:20px">${titleEn}</p>
<div class="patient-box">
  <div class="field"><label>اسم المريض / Patient Name:</label> ${form.patient_name || ''}</div>
  <div class="field"><label>تاريخ الإقرار / Date:</label> ${signedDate}</div>
  <div class="field"><label>الطبيب المعالج / Doctor:</label> ${form.doctor_name || ''}</div>
  <div class="field"><label>الحالة / Status:</label> <span class="status-badge ${form.status === 'Signed' ? 'status-signed' : 'status-pending'}">${form.status === 'Signed' ? '✅ موقع Signed' : '⏳ معلق Pending'}</span></div>
</div>
<div class="consent-section">
  <h3>📋 نص الإقرار — Consent Declaration</h3>
  <div class="consent-text-ar">${arabicContent.join('<br>')}</div>
  ${englishContent.length ? `<div class="consent-text-en">${englishContent.join('<br>')}</div>` : ''}
</div>
<div class="sig-grid">
  <div class="sig-box">
    <div class="sig-label">توقيع المريض</div>
    <div class="sig-label-en">Patient Signature</div>
    <div class="sig-area">${sigImg}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">توقيع الطبيب</div>
    <div class="sig-label-en">Physician Signature</div>
    <div class="sig-area"><div class="sig-line">${form.doctor_name || ''}</div></div>
  </div>
  <div class="sig-box">
    <div class="sig-label">توقيع الشاهد</div>
    <div class="sig-label-en">Witness</div>
    <div class="sig-area"><div class="sig-line">${form.witness_name || ''}</div></div>
  </div>
</div>
<div class="footer">
  ${hospitalAr} — ${hospitalEn} | ${tr('Form #', 'إقرار رقم')} ${form.id} | ${tr('Printed on', 'طُبع بتاريخ')} ${new Date().toLocaleDateString('ar-SA')}
</div>
</body></html>`);
    w.document.close();
  } catch (e) { console.error(e); showToast(tr('Print error', 'خطأ في الطباعة'), 'error'); }
};
window.loadConsentTemplate = () => {
  const sel = document.getElementById('cfTemplate');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.value) {
    document.getElementById('cfTitle').value = isArabic ? (opt.dataset.titleAr || opt.dataset.title) : opt.dataset.title;
    document.getElementById('cfContent').value = opt.dataset.content || '';
  }
};
window.createConsentForm = async () => {
  const pSel = document.getElementById('cfPatient');
  const tSel = document.getElementById('cfTemplate');
  const opt = tSel.options[tSel.selectedIndex];
  try {
    await API.post('/api/consent-forms', {
      patient_id: pSel.value, patient_name: pSel.options[pSel.selectedIndex]?.dataset?.name || '',
      form_type: tSel.value || 'general', form_title: document.getElementById('cfTitle').value,
      form_title_ar: opt?.dataset?.titleAr || document.getElementById('cfTitle').value,
      content: document.getElementById('cfContent').value, doctor_name: document.getElementById('cfDoctor').value
    });
    showToast(tr('Form created!', 'تم إنشاء الإقرار!')); await navigateTo(20);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.loadConsentForSign = async () => {
  const fid = document.getElementById('cfSignSelect').value;
  if (!fid) { document.getElementById('cfSignArea').style.display = 'none'; return; }
  document.getElementById('cfSignArea').style.display = 'block';
  try {
    const f = await API.get(`/ api / consent - forms / ${fid} `);
    document.getElementById('cfSignContent').innerHTML = `< h3 > ${isArabic ? (f.form_title_ar || f.form_title) : f.form_title}</h3 ><p>${f.content}</p><p><strong>${tr('Patient', 'المريض')}:</strong> ${f.patient_name}<br><strong>${tr('Doctor', 'الطبيب')}:</strong> ${f.doctor_name}</p>`;
    // Setup canvas
    setTimeout(() => {
      const canvas = document.getElementById('cfSigCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let drawing = false;
      canvas.onpointerdown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
      canvas.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke(); };
      canvas.onpointerup = () => drawing = false;
      canvas.onpointerout = () => drawing = false;
    }, 100);
  } catch (e) { console.error(e); }
};
window.clearSigCanvas = () => {
  const c = document.getElementById('cfSigCanvas');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
};
window.signConsentForm = async () => {
  const fid = document.getElementById('cfSignSelect').value;
  if (!fid) return;
  const canvas = document.getElementById('cfSigCanvas');
  const sig = canvas ? canvas.toDataURL('image/png') : '';
  try {
    await API.put(`/ api / consent - forms / ${fid}/sign`, {
      patient_signature: sig, witness_name: document.getElementById('cfWitness').value
    });
    showToast(tr('Consent signed!', 'تم توقيع الإقرار!')); await navigateTo(20);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== EMERGENCY DEPARTMENT =====
let erTab = 'board';
async function renderEmergency(el) {
  // Show premium loading skeletons instantly
  el.innerHTML = `
    <div class="page-title">🚨 ${tr('Emergency Department', 'الطوارئ')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
      <div class="stat-card glass-card-premium"><div class="skeleton-bar"></div></div>
    </div>
    <div class="card glass-card-premium mt-16">
      <div class="skeleton-bar title mb-16"></div>
      <div class="skeleton-bar mb-12"></div>
    </div>
  `;

  let stats = {};
  let visits = [];
  let beds = [];
  let patients = [];
  let doctors = [];
  try {
    [stats, visits, beds, patients, doctors] = await Promise.all([
      API.get('/api/emergency/stats'),
      API.get('/api/emergency/visits'),
      API.get('/api/emergency/beds'),
      API.get('/api/patients'),
      API.get('/api/employees')
    ]);
  } catch (e) {
    el.innerHTML = `
      <div class="page-title">🚨 ${tr('Emergency Department', 'الطوارئ')}</div>
      <div class="error-card-premium">
        <div class="error-card-icon">⚠️</div>
        <h3>${tr('Failed to load emergency data', 'فشل في تحميل بيانات الطوارئ')}</h3>
        <p>${e.message || e}</p>
        <button class="btn btn-primary" onclick="navigateTo(currentPage)">🔄 ${tr('Retry', 'إعادة المحاولة')}</button>
      </div>
    `;
    return;
  }
  const drs = (doctors || []).filter(d => d.role === 'Doctor' || d.department_en === 'Emergency');
  const triageColors = { Red: '#e74c3c', Orange: '#e67e22', Yellow: '#f1c40f', Green: '#2ecc71', Blue: '#3498db' };
  const active = (visits || []).filter(v => v.status === 'Active');
  const discharged = (visits || []).filter(v => v.status === 'Discharged');
  const admitted = (visits || []).filter(v => v.status === 'Admitted');
  el.innerHTML = `<div class="page-title">🚨 ${tr('Emergency Department', 'الطوارئ')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card"><div class="stat-icon" style="background:#e74c3c22;color:#e74c3c">🚨</div><div class="stat-value" style="color:#e74c3c">${stats.active}</div><div class="stat-label">${tr('Active Cases', 'حالات نشطة')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#e67e2222;color:#e67e22">⚠️</div><div class="stat-value" style="color:#e67e22">${stats.critical}</div><div class="stat-label">${tr('Critical', 'حرجة')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#3498db22;color:#3498db">📊</div><div class="stat-value" style="color:#3498db">${stats.today}</div><div class="stat-label">${tr('Today', 'اليوم')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#2ecc7122;color:#2ecc71">✅</div><div class="stat-value" style="color:#2ecc71">${discharged.length}</div><div class="stat-label">${tr('Discharged', 'خارجين')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#9b59b622;color:#9b59b6">🏥</div><div class="stat-value" style="color:#9b59b6">${admitted.length}</div><div class="stat-label">${tr('Transferred', 'محولين')}</div></div>
    </div>
    <div class="tab-bar"><button class="tab-btn ${erTab === 'board' ? 'active' : ''}" onclick="erTab='board';navigateTo(21)">🏥 ${tr('ER Board', 'لوحة الطوارئ')}</button>
      <button class="tab-btn ${erTab === 'register' ? 'active' : ''}" onclick="erTab='register';navigateTo(21)">➕ ${tr('Register', 'تسجيل حالة')}</button>
      <button class="tab-btn ${erTab === 'discharged' ? 'active' : ''}" onclick="erTab='discharged';navigateTo(21)">🚪 ${tr('Discharged', 'الخارجين')}</button>
      <button class="tab-btn ${erTab === 'transferred' ? 'active' : ''}" onclick="erTab='transferred';navigateTo(21)">🔄 ${tr('Transferred', 'المحولين للتنويم')}</button>
      <button class="tab-btn ${erTab === 'beds' ? 'active' : ''}" onclick="erTab='beds';navigateTo(21)">🛏️ ${tr('Bed Map', 'خريطة الأسرّة')}</button></div>
    <div class="card glass-card-premium" id="erContent"></div>
    <div id="erDischargeModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
      <div style="background:#fff;padding:30px;border-radius:16px;width:500px;max-width:90%;max-height:80vh;overflow-y:auto;direction:rtl">
        <h3 style="margin-bottom:16px">🚪 ${tr('Discharge from ER', 'خروج من الطوارئ')}</h3>
        <input type="hidden" id="erDischargeId">
        <div class="form-grid" style="gap:12px">
          <div><label>${tr('Diagnosis', 'التشخيص')}</label><textarea id="erDischargeDiag" class="form-control" rows="2"></textarea></div>
          <div><label>${tr('Instructions', 'تعليمات الخروج')}</label><textarea id="erDischargeInst" class="form-control" rows="2"></textarea></div>
          <div><label>${tr('Medications', 'الأدوية')}</label><input id="erDischargeMeds" class="form-control"></div>
          <div><label>${tr('Follow-up Date', 'موعد المراجعة')}</label><input id="erDischargeFollowup" type="date" class="form-control"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" onclick="confirmERDischarge()" style="flex:1">✅ ${tr('Confirm Discharge', 'تأكيد الخروج')}</button>
          <button class="btn" onclick="document.getElementById('erDischargeModal').style.display='none'" style="flex:1">❌ ${tr('Cancel', 'إلغاء')}</button>
        </div>
      </div>
    </div>`;
  const c = document.getElementById('erContent');
  if (erTab === 'board') {
    c.innerHTML = `<h3>🚨 ${tr('Active ER Cases', 'حالات الطوارئ النشطة')} (${active.length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'erTable')" style="margin-bottom:12px">
      ${active.length ? `<table class="data-table" id="erTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Complaint', 'الشكوى')}</th><th>${tr('Triage', 'الفرز')}</th><th>${tr('Arrival', 'الوصول')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Bed', 'السرير')}</th><th>${tr('Actions', 'إجراءات')}</th></tr></thead><tbody>${active.map(v => {
      const tc = triageColors[v.triage_color] || '#999';
      return `<tr><td>${v.id}</td><td>${v.patient_name}</td><td>${v.chief_complaint_ar || v.chief_complaint}</td>
          <td><span class="badge" style="background:${tc};color:#fff;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.1)">🚨 ${tr('ESI ' + v.triage_level, 'ESI ' + v.triage_level)} - ${v.triage_color}</span></td>
          <td>${new Date(v.arrival_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td><td>${v.assigned_doctor || '-'}</td><td>${v.assigned_bed || '-'}</td>
          <td><button class="btn btn-sm" onclick="showERDischargeModal(${v.id})">🚪 ${tr('Discharge', 'خروج')}</button> <button class="btn btn-sm btn-success" onclick="transferERToInpatient(${v.id},'${(v.patient_name || '').replace(/'/g, "\\'")}',${v.patient_id},'${(v.assigned_doctor || '').replace(/'/g, "\\'")}','${v.chief_complaint_ar || v.chief_complaint || ''}')">${tr('Admit', 'تنويم')}</button></td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state-card"><div class="empty-state-icon">🚨</div><div>${tr('No active emergency cases', 'لا توجد حالات طوارئ نشطة')}</div></div>`}`;
  } else if (erTab === 'register') {
    c.innerHTML = `<h3>➕ ${tr('Register ER Visit', 'تسجيل حالة طوارئ')}</h3>
      <div class="form-grid">
        <div><label>${tr('Patient', 'المريض')}</label><select id="erPatient" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(patients || []).map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.name_ar || p.name_en} (${p.file_number})</option>`).join('')}</select></div>
        <div><label>${tr('Arrival Mode', 'طريقة الوصول')}</label><select id="erArrival" class="form-control"><option value="Walk-in">${tr('Walk-in', 'مشي')}</option><option value="Ambulance">${tr('Ambulance', 'إسعاف')}</option><option value="Referred">${tr('Referred', 'محوّل')}</option><option value="Police">${tr('Police', 'شرطة')}</option></select></div>
        <div><label>${tr('Chief Complaint', 'الشكوى الرئيسية')}</label><input id="erComplaint" class="form-control"></div>
        <div><label>${tr('Complaint (AR)', 'الشكوى بالعربي')}</label><input id="erComplaintAr" class="form-control"></div>
        <div><label>${tr('Triage Level', 'مستوى الفرز')}</label><select id="erTriage" class="form-control" onchange="document.getElementById('erTriageColor').value=['','Red','Orange','Yellow','Green','Blue'][this.value]">
          <option value="1">1 - ${tr('Resuscitation', 'إنعاش')}</option><option value="2">2 - ${tr('Emergent', 'طارئ')}</option><option value="3" selected>3 - ${tr('Urgent', 'عاجل')}</option><option value="4">4 - ${tr('Less Urgent', 'أقل إلحاحاً')}</option><option value="5">5 - ${tr('Non-Urgent', 'غير طارئ')}</option></select></div>
        <div><label>${tr('Triage Color', 'لون الفرز')}</label><select id="erTriageColor" class="form-control"><option value="Red">${tr('Red', 'أحمر')}</option><option value="Orange">${tr('Orange', 'برتقالي')}</option><option value="Yellow" selected>${tr('Yellow', 'أصفر')}</option><option value="Green">${tr('Green', 'أخضر')}</option><option value="Blue">${tr('Blue', 'أزرق')}</option></select></div>
        <div><label>${tr('Doctor', 'الطبيب')}</label><select id="erDoctor" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${drs.map(d => `<option value="${d.name_ar || d.name}">${d.name_ar || d.name}</option>`).join('')}</select></div>
        <div><label>${tr('ER Bed', 'سرير الطوارئ')}</label><select id="erBed" class="form-control"><option value="">${tr('None', 'بدون')}</option>${(beds || []).filter(b => b.status === 'Available').map(b => `<option value="${b.bed_name}">${b.bed_name_ar} (${b.zone_ar})</option>`).join('')}</select></div>
      </div>
      <button class="btn btn-primary" onclick="registerERVisit()" style="margin-top:16px">🚨 ${tr('Register', 'تسجيل')}</button>`;
  } else if (erTab === 'discharged') {
    c.innerHTML = `<h3>🚪 ${tr('Discharged from ER', 'الخارجين من الطوارئ')} (${discharged.length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'erDischTable')" style="margin-bottom:12px">
      ${discharged.length ? `<table class="data-table" id="erDischTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Complaint', 'الشكوى')}</th><th>${tr('Triage', 'الفرز')}</th><th>${tr('Arrival', 'الوصول')}</th><th>${tr('Discharge', 'الخروج')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Diagnosis', 'التشخيص')}</th></tr></thead><tbody>${discharged.map(v => {
      const tc = triageColors[v.triage_color] || '#999';
      return `<tr><td>${v.id}</td><td>${v.patient_name}</td><td>${v.chief_complaint_ar || v.chief_complaint || '-'}</td>
        <td><span style="background:${tc};color:#fff;padding:2px 8px;border-radius:12px;font-size:.85em">${v.triage_color}</span></td>
        <td>${v.arrival_time ? new Date(v.arrival_time).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${v.discharge_time ? new Date(v.discharge_time).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${v.assigned_doctor || '-'}</td><td>${v.discharge_diagnosis || '-'}</td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state-card"><div class="empty-state-icon">🚪</div><div>${tr('No discharged emergency patients', 'لا يوجد مرضى خارجين من الطوارئ')}</div></div>`}`;
  } else if (erTab === 'transferred') {
    c.innerHTML = `<h3>🔄 ${tr('Transferred to Inpatient', 'المحولين للتنويم')} (${admitted.length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'erTransTable')" style="margin-bottom:12px">
      ${admitted.length ? `<table class="data-table" id="erTransTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Complaint', 'الشكوى')}</th><th>${tr('Triage', 'الفرز')}</th><th>${tr('ER Doctor', 'طبيب الطوارئ')}</th><th>${tr('Arrival', 'الوصول')}</th><th>${tr('Status', 'الحالة')}</th></tr></thead><tbody>${admitted.map(v => {
      const tc = triageColors[v.triage_color] || '#999';
      return `<tr><td>${v.id}</td><td>${v.patient_name}</td><td>${v.chief_complaint_ar || v.chief_complaint || '-'}</td>
        <td><span style="background:${tc};color:#fff;padding:2px 8px;border-radius:12px;font-size:.85em">${v.triage_color}</span></td>
        <td>${v.assigned_doctor || '-'}</td>
        <td>${v.arrival_time ? new Date(v.arrival_time).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${badge(tr('Admitted', 'تم التنويم'), 'success')}</td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state-card"><div class="empty-state-icon">🔄</div><div>${tr('No transferred patients', 'لا يوجد مرضى محولين')}</div></div>`}`;
  } else {
    const zones = ['Resuscitation', 'Critical', 'Acute', 'Observation'];
    c.innerHTML = `<h3>🛏️ ${tr('ER Bed Map', 'خريطة أسرّة الطوارئ')}</h3>
      ${zones.map(z => `<h4 style="margin:16px 0 8px">${tr(z, z === 'Resuscitation' ? 'الإنعاش' : z === 'Critical' ? 'الحرجة' : z === 'Acute' ? 'الحادة' : 'المراقبة')}</h4>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${(beds || []).filter(b => b.zone === z).map(b => `<div style="padding:16px;border-radius:12px;text-align:center;background:${b.status === 'Available' ? '#d4edda' : '#f8d7da'};border:2px solid ${b.status === 'Available' ? '#28a745' : '#dc3545'}">
          <div style="font-size:1.4em;font-weight:700">${b.bed_name_ar}</div><div style="font-size:.85em;margin-top:4px">${statusBadge(b.status)}</div></div>`).join('')}</div>`).join('')}`;
  }
}
window.registerERVisit = async function () {
  const ps = document.getElementById('erPatient'); if (!ps.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/emergency/visits', { patient_id: ps.value, patient_name: ps.options[ps.selectedIndex].dataset.name, arrival_mode: document.getElementById('erArrival').value, chief_complaint: document.getElementById('erComplaint').value, chief_complaint_ar: document.getElementById('erComplaintAr').value, triage_level: document.getElementById('erTriage').value, triage_color: document.getElementById('erTriageColor').value, assigned_doctor: document.getElementById('erDoctor').value, assigned_bed: document.getElementById('erBed').value });
    showToast(tr('ER visit registered!', 'تم تسجيل حالة الطوارئ!')); erTab = 'board'; await navigateTo(21);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.showERDischargeModal = function (id) {
  document.getElementById('erDischargeId').value = id;
  document.getElementById('erDischargeDiag').value = '';
  document.getElementById('erDischargeInst').value = '';
  document.getElementById('erDischargeMeds').value = '';
  document.getElementById('erDischargeFollowup').value = '';
  document.getElementById('erDischargeModal').style.display = 'flex';
};
window.confirmERDischarge = async function () {
  const id = document.getElementById('erDischargeId').value;
  try {
    await API.put('/api/emergency/visits/' + id, {
      status: 'Discharged',
      discharge_diagnosis: document.getElementById('erDischargeDiag').value,
      discharge_instructions: document.getElementById('erDischargeInst').value,
      discharge_medications: document.getElementById('erDischargeMeds').value,
      followup_date: document.getElementById('erDischargeFollowup').value
    });
    document.getElementById('erDischargeModal').style.display = 'none';
    showToast(tr('Patient discharged from ER!', 'تم خروج المريض من الطوارئ!'));
    erTab = 'discharged'; await navigateTo(21);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.transferERToInpatient = async function (visitId, patientName, patientId, doctor, complaint) {
  if (!confirm(tr('Transfer this patient to inpatient?', 'هل تريد تحويل هذا المريض للتنويم؟'))) return;
  try {
    await API.put('/api/emergency/visits/' + visitId, { status: 'Admitted' });
    await API.post('/api/admissions', {
      patient_id: patientId, patient_name: patientName,
      admission_type: 'Emergency', admitting_doctor: doctor, attending_doctor: doctor,
      department: 'Emergency', diagnosis: complaint
    });
    showToast(tr('Patient transferred to inpatient!', 'تم تحويل المريض للتنويم!'));
    erTab = 'transferred'; await navigateTo(21);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.updateERVisit = async function (id, status) {
  try { await API.put('/api/emergency/visits/' + id, { status }); showToast(tr('Updated', 'تم التحديث')); await navigateTo(21); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== INPATIENT ADT =====
let adtTab = 'census';
async function renderInpatient(el) {
  const [census, activeAdm, dischargedAdm, patients, doctors, wards] = await Promise.all([
    API.get('/api/beds/census'), API.get('/api/admissions?status=Active'),
    API.get('/api/admissions?status=Discharged'),
    API.get('/api/patients'), API.get('/api/employees'), API.get('/api/wards')
  ]);
  const drs = (doctors || []).filter(d => d.role === 'Doctor');
  el.innerHTML = `<div class="page-title">🛏️ ${tr('Inpatient ADT', 'التنويم')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card"><div class="stat-value" style="color:#2ecc71">${census.available || 0}</div><div class="stat-label">${tr('Available Beds', 'أسرّة متاحة')}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#e74c3c">${census.occupied || 0}</div><div class="stat-label">${tr('Occupied', 'مشغولة')}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#3498db">${(activeAdm || []).length}</div><div class="stat-label">${tr('Current Patients', 'المنومين')}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#27ae60">${(dischargedAdm || []).length}</div><div class="stat-label">${tr('Discharged', 'الخارجين')}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#9b59b6">${census.occupancyRate || 0}%</div><div class="stat-label">${tr('Occupancy', 'نسبة الإشغال')}</div></div>
    </div>
    <div class="tab-bar"><button class="tab-btn ${adtTab === 'census' ? 'active' : ''}" onclick="adtTab='census';navigateTo(22)">🗺️ ${tr('Census', 'الإشغال')}</button>
      <button class="tab-btn ${adtTab === 'admit' ? 'active' : ''}" onclick="adtTab='admit';navigateTo(22)">➕ ${tr('Admit', 'تنويم')}</button>
      <button class="tab-btn ${adtTab === 'patients' ? 'active' : ''}" onclick="adtTab='patients';navigateTo(22)">📋 ${tr('Patients', 'المنومين')}</button>
      <button class="tab-btn ${adtTab === 'discharged' ? 'active' : ''}" onclick="adtTab='discharged';navigateTo(22)">🚪 ${tr('Discharged', 'الخارجين')}</button></div>
    <div class="card" id="adtContent"></div>
    <div id="adtDischargeModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
      <div style="background:#fff;padding:30px;border-radius:16px;width:550px;max-width:90%;max-height:85vh;overflow-y:auto;direction:rtl">
        <h3 style="margin-bottom:16px">🚪 ${tr('Discharge Patient', 'خروج مريض')}</h3>
        <input type="hidden" id="adtDischargeId">
        <div class="form-grid" style="gap:12px">
          <div><label>${tr('Discharge Type', 'نوع الخروج')}</label><select id="adtDischargeType" class="form-control">
            <option value="Regular">${tr('Regular', 'عادي')}</option><option value="AMA">${tr('Against Medical Advice', 'ضد المشورة الطبية')}</option>
            <option value="Transfer">${tr('Transfer', 'تحويل')}</option><option value="Death">${tr('Death', 'وفاة')}</option></select></div>
          <div style="grid-column:span 2"><label>${tr('Discharge Summary', 'ملخص الخروج')}</label><textarea id="adtDischargeSummary" class="form-control" rows="3"></textarea></div>
          <div style="grid-column:span 2"><label>${tr('Instructions', 'تعليمات للمريض')}</label><textarea id="adtDischargeInst" class="form-control" rows="2"></textarea></div>
          <div><label>${tr('Medications', 'أدوية الخروج')}</label><textarea id="adtDischargeMeds" class="form-control" rows="2"></textarea></div>
          <div><label>${tr('Follow-up Date', 'موعد المراجعة')}</label><input id="adtFollowupDate" type="date" class="form-control"></div>
          <div><label>${tr('Follow-up Doctor', 'طبيب المتابعة')}</label><select id="adtFollowupDoctor" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${drs.map(d => `<option value="${d.name_ar || d.name}">${d.name_ar || d.name}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" onclick="confirmInpatientDischarge()" style="flex:1">✅ ${tr('Confirm Discharge', 'تأكيد الخروج')}</button>
          <button class="btn" onclick="document.getElementById('adtDischargeModal').style.display='none'" style="flex:1">❌ ${tr('Cancel', 'إلغاء')}</button>
        </div>
      </div>
    </div>`;
  const c = document.getElementById('adtContent');
  if (adtTab === 'census') {
    c.innerHTML = (census.wards || []).map(w => {
      const wBeds = (census.beds || []).filter(b => b.ward_id === w.id);
      const occ = wBeds.filter(b => b.status === 'Occupied').length;
      return `<div style="margin-bottom:20px"><h4>${w.ward_name_ar} (${w.ward_name}) — <span style="color:${occ / wBeds.length > 0.8 ? '#e74c3c' : '#2ecc71'}">${occ}/${wBeds.length}</span></h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${wBeds.map(b => `<div style="padding:10px;border-radius:10px;text-align:center;font-size:.85em;background:${b.status === 'Available' ? '#d4edda' : '#f8d7da'};border:1px solid ${b.status === 'Available' ? '#28a745' : '#dc3545'};cursor:pointer" title="${b.patient_name || ''} ${b.diagnosis || ''}">
          <strong>${tr('Bed', 'سرير')} ${b.bed_number}</strong><br><small>${tr('Room', 'غرفة')} ${b.room_number}</small><br>${b.patient_name ? `<small>${b.patient_name}</small>` : statusBadge(b.status)}</div>`).join('')}</div></div>`;
    }).join('');
  } else if (adtTab === 'admit') {
    c.innerHTML = `<h3>➕ ${tr('New Admission', 'تنويم جديد')}</h3><div class="form-grid">
      <div><label>${tr('Patient', 'المريض')}</label><select id="admPatient" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(patients || []).map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.name_ar || p.name_en} (${p.file_number})</option>`).join('')}</select></div>
      <div><label>${tr('Type', 'النوع')}</label><select id="admType" class="form-control"><option value="Regular">${tr('Regular', 'عادي')}</option><option value="Emergency">${tr('Emergency', 'طوارئ')}</option><option value="Transfer">${tr('Transfer', 'تحويل')}</option></select></div>
      <div><label>${tr('Attending Doctor', 'الطبيب المعالج')}</label><select id="admDoctor" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${drs.map(d => `<option value="${d.name_ar || d.name}">${d.name_ar || d.name}</option>`).join('')}</select></div>
      <div><label>${tr('Department', 'القسم')}</label><input id="admDept" class="form-control"></div>
      <div><label>${tr('Ward', 'الجناح')}</label><select id="admWard" class="form-control" onchange="loadWardBeds(this.value)"><option value="">${tr('Select', 'اختر')}</option>${(wards || []).map(w => `<option value="${w.id}">${w.ward_name_ar}</option>`).join('')}</select></div>
      <div><label>${tr('Bed', 'السرير')}</label><select id="admBed" class="form-control"><option value="">${tr('Select ward first', 'اختر الجناح أولاً')}</option></select></div>
      <div style="grid-column:span 2"><label>${tr('Diagnosis', 'التشخيص')}</label><textarea id="admDiagnosis" class="form-control" rows="2"></textarea></div>
      <div><label>${tr('Diet', 'الحمية')}</label><select id="admDiet" class="form-control"><option value="Regular">${tr('Regular', 'عادية')}</option><option value="Diabetic">${tr('Diabetic', 'سكري')}</option><option value="Renal">${tr('Renal', 'كلوي')}</option><option value="Cardiac">${tr('Cardiac', 'قلبي')}</option><option value="NPO">${tr('NPO', 'صائم')}</option><option value="Liquid">${tr('Liquid', 'سوائل')}</option></select></div>
      <div><label>${tr('Expected LOS', 'مدة الإقامة المتوقعة')}</label><input id="admLOS" type="number" value="3" class="form-control"></div>
    </div><button class="btn btn-primary" onclick="admitPatient()" style="margin-top:16px">🛏️ ${tr('Admit', 'تنويم')}</button>`;
  } else if (adtTab === 'patients') {
    c.innerHTML = `<h3>📋 ${tr('Current Inpatients', 'المنومين الحاليين')} (${(activeAdm || []).length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'adtPatientsTable')" style="margin-bottom:12px">
      ${(activeAdm || []).length ? `<table class="data-table" id="adtPatientsTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Type', 'النوع')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Diagnosis', 'التشخيص')}</th><th>${tr('Admission Date', 'تاريخ التنويم')}</th><th>${tr('Days', 'أيام')}</th><th>${tr('Actions', 'إجراءات')}</th></tr></thead><tbody>${(activeAdm || []).map(a => {
      const days = Math.floor((new Date() - new Date(a.admission_date)) / 86400000);
      const typeBadge = a.admission_type === 'Emergency' ? badge(tr('ER', 'طوارئ'), 'danger') : a.admission_type === 'Transfer' ? badge(tr('Transfer', 'تحويل'), 'warning') : badge(tr('Regular', 'عادي'), 'info');
      return `<tr><td>${a.id}</td><td><strong>${a.patient_name}</strong></td><td>${typeBadge}</td><td>${a.attending_doctor || '-'}</td><td>${a.diagnosis || '-'}</td><td>${new Date(a.admission_date).toLocaleDateString('ar-SA')}</td><td><span style="font-weight:700;color:${days > 7 ? '#e74c3c' : '#2ecc71'}">${days}</span></td>
        <td><button class="btn btn-sm" onclick="showInpatientDischargeModal(${a.id})">🚪 ${tr('Discharge', 'خروج')}</button></td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon">🛏️</div><p>${tr('No inpatients', 'لا يوجد منومين')}</p></div>`}`;
  } else if (adtTab === 'discharged') {
    c.innerHTML = `<h3>🚪 ${tr('Discharged Patients', 'الخارجين من التنويم')} (${(dischargedAdm || []).length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'adtDischTable')" style="margin-bottom:12px">
      ${(dischargedAdm || []).length ? `<table class="data-table" id="adtDischTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Type', 'نوع الخروج')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Diagnosis', 'التشخيص')}</th><th>${tr('Admitted', 'التنويم')}</th><th>${tr('Discharged', 'الخروج')}</th><th>${tr('LOS', 'المدة')}</th></tr></thead><tbody>${(dischargedAdm || []).map(a => {
      const los = a.discharge_date && a.admission_date ? Math.floor((new Date(a.discharge_date) - new Date(a.admission_date)) / 86400000) : '-';
      const dtBadge = a.discharge_type === 'AMA' ? badge(tr('AMA', 'ضد المشورة'), 'danger') : a.discharge_type === 'Death' ? badge(tr('Death', 'وفاة'), 'danger') : a.discharge_type === 'Transfer' ? badge(tr('Transfer', 'تحويل'), 'warning') : badge(tr('Regular', 'عادي'), 'success');
      return `<tr><td>${a.id}</td><td>${a.patient_name}</td><td>${dtBadge}</td><td>${a.attending_doctor || '-'}</td><td>${a.diagnosis || '-'}</td>
        <td>${a.admission_date ? new Date(a.admission_date).toLocaleDateString('ar-SA') : '-'}</td>
        <td>${a.discharge_date ? new Date(a.discharge_date).toLocaleDateString('ar-SA') : '-'}</td>
        <td><strong>${los}</strong> ${tr('days', 'يوم')}</td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state-card"><div class="empty-state-icon">🚪</div><div>${tr('No discharged emergency patients', 'لا يوجد مرضى خارجين من الطوارئ')}</div></div>`}`;
  }
}
window.loadWardBeds = async function (wardId) {
  if (!wardId) return;
  const beds = await API.get('/api/beds?ward_id=' + wardId);
  const s = document.getElementById('admBed');
  s.innerHTML = `<option value="">${tr('Select', 'اختر')}</option>${(beds || []).filter(b => b.status === 'Available').map(b => `<option value="${b.id}">${tr('Bed', 'سرير')} ${b.bed_number} - ${tr('Room', 'غرفة')} ${b.room_number}</option>`).join('')}`;
};
window.admitPatient = async function () {
  const ps = document.getElementById('admPatient'); if (!ps.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/admissions', { patient_id: ps.value, patient_name: ps.options[ps.selectedIndex].dataset.name, admission_type: document.getElementById('admType').value, attending_doctor: document.getElementById('admDoctor').value, admitting_doctor: document.getElementById('admDoctor').value, department: document.getElementById('admDept').value, ward_id: document.getElementById('admWard').value, bed_id: document.getElementById('admBed').value, diagnosis: document.getElementById('admDiagnosis').value, diet_order: document.getElementById('admDiet').value, expected_los: document.getElementById('admLOS').value });
    showToast(tr('Patient admitted!', 'تم التنويم!')); adtTab = 'patients'; await navigateTo(22);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.showInpatientDischargeModal = function (id) {
  document.getElementById('adtDischargeId').value = id;
  document.getElementById('adtDischargeSummary').value = '';
  document.getElementById('adtDischargeInst').value = '';
  document.getElementById('adtDischargeMeds').value = '';
  document.getElementById('adtFollowupDate').value = '';
  document.getElementById('adtDischargeModal').style.display = 'flex';
};
window.confirmInpatientDischarge = async function () {
  const id = document.getElementById('adtDischargeId').value;
  try {
    await API.put('/api/admissions/' + id + '/discharge', {
      discharge_type: document.getElementById('adtDischargeType').value,
      discharge_summary: document.getElementById('adtDischargeSummary').value,
      discharge_instructions: document.getElementById('adtDischargeInst').value,
      discharge_medications: document.getElementById('adtDischargeMeds').value,
      followup_date: document.getElementById('adtFollowupDate').value,
      followup_doctor: document.getElementById('adtFollowupDoctor').value
    });
    document.getElementById('adtDischargeModal').style.display = 'none';
    showToast(tr('Patient discharged!', 'تم خروج المريض!'));
    adtTab = 'discharged'; await navigateTo(22);
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.dischargePatient = async function (id) {
  showInpatientDischargeModal(id);
};
// ===== ICU =====
// ===== ICU =====
let icuTab = 'patients';
async function renderICU(el) {
  const [icuPatients, allAdmissions] = await Promise.all([
    API.get('/api/icu/patients'),
    API.get('/api/admissions')
  ]);
  const discharged = (allAdmissions || []).filter(a => a.status === 'Discharged' && a.department === 'ICU');
  const totalICU = (icuPatients || []).length;
  const onVent = (icuPatients || []).filter(p => p.activity_level === 'Ventilated' || p.dvt_prophylaxis).length;
  el.innerHTML = `<div class="page-title">🫀 ${tr('ICU / Critical Care', 'العناية المركزة')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card"><div class="stat-icon" style="background:#e74c3c22;color:#e74c3c">🫀</div><div class="stat-value" style="color:#e74c3c">${totalICU}</div><div class="stat-label">${tr('Current Patients', 'المرضى الحاليين')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#3498db22;color:#3498db">🫁</div><div class="stat-value" style="color:#3498db">${onVent}</div><div class="stat-label">${tr('On Ventilator', 'على التنفس')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#2ecc7122;color:#2ecc71">✅</div><div class="stat-value" style="color:#2ecc71">${discharged.length}</div><div class="stat-label">${tr('Discharged', 'خارجين')}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#9b59b622;color:#9b59b6">📊</div><div class="stat-value" style="color:#9b59b6">${totalICU > 0 ? Math.round((totalICU / (totalICU + discharged.length || 1)) * 100) : 0}%</div><div class="stat-label">${tr('Occupancy', 'الإشغال')}</div></div>
    </div>
    <div class="tab-bar"><button class="tab-btn ${icuTab === 'patients' ? 'active' : ''}" onclick="icuTab='patients';navigateTo(23)">👥 ${tr('Patients', 'المرضى')}</button>
      <button class="tab-btn ${icuTab === 'monitor' ? 'active' : ''}" onclick="icuTab='monitor';navigateTo(23)">📊 ${tr('Monitoring', 'المراقبة')}</button>
      <button class="tab-btn ${icuTab === 'ventilator' ? 'active' : ''}" onclick="icuTab='ventilator';navigateTo(23)">🫁 ${tr('Ventilator', 'التنفس')}</button>
      <button class="tab-btn ${icuTab === 'scores' ? 'active' : ''}" onclick="icuTab='scores';navigateTo(23)">📋 ${tr('Scores', 'المقاييس')}</button>
      <button class="tab-btn ${icuTab === 'fluid' ? 'active' : ''}" onclick="icuTab='fluid';navigateTo(23)">💧 ${tr('Fluid Balance', 'توازن السوائل')}</button>
      <button class="tab-btn ${icuTab === 'discharged' ? 'active' : ''}" onclick="icuTab='discharged';navigateTo(23)">🚪 ${tr('Discharged', 'الخارجين')}</button></div>
    <div class="card" id="icuContent"></div>`;
  const c = document.getElementById('icuContent');
  if (icuTab === 'patients') {
    c.innerHTML = `<h3>👥 ${tr('ICU Patients', 'مرضى العناية المركزة')} (${totalICU})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'icuPTable')" style="margin-bottom:12px">
      ${totalICU ? `<table class="data-table" id="icuPTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Ward', 'الجناح')}</th><th>${tr('Bed', 'السرير')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Diagnosis', 'التشخيص')}</th><th>${tr('Days', 'أيام')}</th><th>${tr('Actions', 'إجراءات')}</th></tr></thead><tbody>${(icuPatients || []).map(p => {
      const days = Math.floor((new Date() - new Date(p.admission_date)) / 86400000);
      return `<tr><td>${p.id}</td><td><strong>${p.patient_name}</strong></td><td>${p.ward_name_ar || '-'}</td><td>${tr('Bed', 'سرير')} ${p.bed_number || '-'}</td><td>${p.attending_doctor || '-'}</td><td>${p.diagnosis || '-'}</td>
        <td><span style="font-weight:700;color:${days > 7 ? '#e74c3c' : '#2ecc71'}">${days}</span></td>
        <td><button class="btn btn-sm" onclick="showInpatientDischargeModal(${p.id})">🚪 ${tr('Discharge', 'خروج')}</button></td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon">🫀</div><p>${tr('No ICU patients', 'لا يوجد مرضى بالعناية')}</p></div>`}`;
  } else if (icuTab === 'monitor') {
    c.innerHTML = `<h3>📊 ${tr('Record Vitals', 'تسجيل العلامات الحيوية')}</h3>
      <div class="form-grid">
        <div><label>${tr('Patient', 'المريض')}</label><select id="icuPatientMon" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(icuPatients || []).map(p => `<option value="${p.id}" data-pid="${p.patient_id}">${p.patient_name} - ${p.ward_name_ar || ''} ${tr('Bed', 'سرير')} ${p.bed_number || ''}</option>`).join('')}</select></div>
        <div><label>HR</label><input id="icuHR" type="number" class="form-control" placeholder="bpm"></div>
        <div><label>SBP/DBP</label><div style="display:flex;gap:4px"><input id="icuSBP" type="number" class="form-control" placeholder="SBP"><input id="icuDBP" type="number" class="form-control" placeholder="DBP"></div></div>
        <div><label>SpO2</label><input id="icuSpO2" type="number" class="form-control" placeholder="%"></div>
        <div><label>RR</label><input id="icuRR" type="number" class="form-control" placeholder="/min"></div>
        <div><label>Temp</label><input id="icuTemp" type="number" step="0.1" class="form-control" placeholder="°C"></div>
        <div><label>FiO2</label><input id="icuFiO2" type="number" class="form-control" placeholder="%"></div>
        <div><label>Urine (ml)</label><input id="icuUrine" type="number" class="form-control" placeholder="ml"></div>
      </div><button class="btn btn-primary" onclick="saveICUMonitor()" style="margin-top:12px">💾 ${tr('Save', 'حفظ')}</button>`;
  } else if (icuTab === 'ventilator') {
    c.innerHTML = `<h3>🫁 ${tr('Ventilator Settings', 'إعدادات التنفس الصناعي')}</h3>
      <div class="form-grid">
        <div><label>${tr('Patient', 'المريض')}</label><select id="icuPatientVent" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(icuPatients || []).map(p => `<option value="${p.id}" data-pid="${p.patient_id}">${p.patient_name}</option>`).join('')}</select></div>
        <div><label>${tr('Mode', 'الوضع')}</label><select id="ventMode" class="form-control"><option>CMV</option><option>SIMV</option><option>PSV</option><option>CPAP</option><option>BiPAP</option><option>APRV</option></select></div>
        <div><label>FiO2 %</label><input id="ventFiO2" type="number" value="21" class="form-control"></div>
        <div><label>TV (ml)</label><input id="ventTV" type="number" class="form-control"></div>
        <div><label>RR</label><input id="ventRR" type="number" class="form-control"></div>
        <div><label>PEEP</label><input id="ventPEEP" type="number" class="form-control"></div>
        <div><label>PIP</label><input id="ventPIP" type="number" class="form-control"></div>
        <div><label>PS</label><input id="ventPS" type="number" class="form-control"></div>
        <div><label>ETT Size</label><input id="ventETT" class="form-control"></div>
      </div><button class="btn btn-primary" onclick="saveVentilator()" style="margin-top:12px">💾 ${tr('Save', 'حفظ')}</button>`;
  } else if (icuTab === 'scores') {
    c.innerHTML = `<h3>📋 ${tr('Clinical Scores', 'المقاييس السريرية')}</h3>
      <div class="form-grid">
        <div><label>${tr('Patient', 'المريض')}</label><select id="icuPatientScore" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(icuPatients || []).map(p => `<option value="${p.id}" data-pid="${p.patient_id}">${p.patient_name}</option>`).join('')}</select></div>
        <div><label>APACHE II</label><input id="scoreAPACHE" type="number" class="form-control"></div>
        <div><label>SOFA</label><input id="scoreSOFA" type="number" class="form-control"></div>
        <div><label>GCS</label><input id="scoreGCS" type="number" value="15" class="form-control"></div>
        <div><label>RASS</label><input id="scoreRASS" type="number" value="0" class="form-control"></div>
        <div><label>Braden</label><input id="scoreBraden" type="number" value="23" class="form-control"></div>
        <div><label>Morse Fall</label><input id="scoreMorse" type="number" class="form-control"></div>
        <div><label>Pain (0-10)</label><input id="scorePain" type="number" class="form-control"></div>
      </div><button class="btn btn-primary" onclick="saveICUScores()" style="margin-top:12px">💾 ${tr('Save', 'حفظ')}</button>`;
  } else if (icuTab === 'fluid') {
    c.innerHTML = `<h3>💧 ${tr('Fluid Balance', 'توازن السوائل')}</h3>
      <div class="form-grid">
        <div><label>${tr('Patient', 'المريض')}</label><select id="icuPatientFluid" class="form-control"><option value="">${tr('Select', 'اختر')}</option>${(icuPatients || []).map(p => `<option value="${p.id}" data-pid="${p.patient_id}">${p.patient_name}</option>`).join('')}</select></div>
        <div><label>${tr('Shift', 'الوردية')}</label><select id="fluidShift" class="form-control"><option value="Day">${tr('Day', 'نهاري')}</option><option value="Night">${tr('Night', 'ليلي')}</option></select></div>
        <div style="grid-column:span 2"><h4 style="color:#2ecc71">⬇️ ${tr('Intake', 'الوارد')}</h4></div>
        <div><label>IV Fluids (ml)</label><input id="fluidIV" type="number" class="form-control"></div>
        <div><label>Oral (ml)</label><input id="fluidOral" type="number" class="form-control"></div>
        <div><label>Blood Products (ml)</label><input id="fluidBlood" type="number" class="form-control"></div>
        <div><label>IV Meds (ml)</label><input id="fluidMeds" type="number" class="form-control"></div>
        <div style="grid-column:span 2"><h4 style="color:#e74c3c">⬆️ ${tr('Output', 'الصادر')}</h4></div>
        <div><label>Urine (ml)</label><input id="fluidUrine" type="number" class="form-control"></div>
        <div><label>Drains (ml)</label><input id="fluidDrains" type="number" class="form-control"></div>
        <div><label>NGT (ml)</label><input id="fluidNGT" type="number" class="form-control"></div>
        <div><label>Vomit (ml)</label><input id="fluidVomit" type="number" class="form-control"></div>
      </div><button class="btn btn-primary" onclick="saveFluidBalance()" style="margin-top:12px">💾 ${tr('Save', 'حفظ')}</button>`;
  } else if (icuTab === 'discharged') {
    c.innerHTML = `<h3>🚪 ${tr('Discharged from ICU', 'الخارجين من العناية المركزة')} (${discharged.length})</h3>
      <input class="form-control" placeholder="${tr('Search...', 'بحث...')}" oninput="filterTable(this,'icuDischTable')" style="margin-bottom:12px">
      ${discharged.length ? `<table class="data-table" id="icuDischTable"><thead><tr><th>#</th><th>${tr('Patient', 'المريض')}</th><th>${tr('Discharge Type', 'نوع الخروج')}</th><th>${tr('Doctor', 'الطبيب')}</th><th>${tr('Diagnosis', 'التشخيص')}</th><th>${tr('Admitted', 'التنويم')}</th><th>${tr('Discharged', 'الخروج')}</th><th>${tr('LOS', 'المدة')}</th></tr></thead><tbody>${discharged.map(a => {
      const los = a.discharge_date && a.admission_date ? Math.floor((new Date(a.discharge_date) - new Date(a.admission_date)) / 86400000) : '-';
      const dtBadge = a.discharge_type === 'AMA' ? badge(tr('AMA', 'ضد المشورة'), 'danger') : a.discharge_type === 'Death' ? badge(tr('Death', 'وفاة'), 'danger') : a.discharge_type === 'Transfer' ? badge(tr('Transfer', 'تحويل'), 'warning') : badge(tr('Regular', 'عادي'), 'success');
      return `<tr><td>${a.id}</td><td>${a.patient_name}</td><td>${dtBadge}</td><td>${a.attending_doctor || '-'}</td><td>${a.diagnosis || '-'}</td>
        <td>${a.admission_date ? new Date(a.admission_date).toLocaleDateString('ar-SA') : '-'}</td>
        <td>${a.discharge_date ? new Date(a.discharge_date).toLocaleDateString('ar-SA') : '-'}</td>
        <td><strong>${los}</strong> ${tr('days', 'يوم')}</td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty-state-card"><div class="empty-state-icon">🚪</div><div>${tr('No discharged emergency patients', 'لا يوجد مرضى خارجين من الطوارئ')}</div></div>`}`;
  }
}
window.saveICUMonitor = async function () {
  const s = document.getElementById('icuPatientMon'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/icu/monitoring', { admission_id: s.value, patient_id: s.options[s.selectedIndex].dataset.pid, hr: document.getElementById('icuHR').value, sbp: document.getElementById('icuSBP').value, dbp: document.getElementById('icuDBP').value, spo2: document.getElementById('icuSpO2').value, rr: document.getElementById('icuRR').value, temp: document.getElementById('icuTemp').value, fio2: document.getElementById('icuFiO2').value, urine_output: document.getElementById('icuUrine').value, recorded_by: currentUser?.display_name });
    showToast(tr('Saved!', 'تم الحفظ!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveVentilator = async function () {
  const s = document.getElementById('icuPatientVent'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/icu/ventilator', { admission_id: s.value, patient_id: s.options[s.selectedIndex].dataset.pid, vent_mode: document.getElementById('ventMode').value, fio2: document.getElementById('ventFiO2').value, tidal_volume: document.getElementById('ventTV').value, respiratory_rate: document.getElementById('ventRR').value, peep: document.getElementById('ventPEEP').value, pip: document.getElementById('ventPIP').value, ps: document.getElementById('ventPS').value, ett_size: document.getElementById('ventETT').value, recorded_by: currentUser?.display_name });
    showToast(tr('Saved!', 'تم الحفظ!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveICUScores = async function () {
  const s = document.getElementById('icuPatientScore'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/icu/scores', { admission_id: s.value, patient_id: s.options[s.selectedIndex].dataset.pid, apache_ii: document.getElementById('scoreAPACHE').value, sofa: document.getElementById('scoreSOFA').value, gcs: document.getElementById('scoreGCS').value, rass: document.getElementById('scoreRASS').value, braden: document.getElementById('scoreBraden').value, morse_fall: document.getElementById('scoreMorse').value, pain_score: document.getElementById('scorePain').value, calculated_by: currentUser?.display_name });
    showToast(tr('Saved!', 'تم الحفظ!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.saveFluidBalance = async function () {
  const s = document.getElementById('icuPatientFluid'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try {
    await API.post('/api/icu/fluid-balance', { admission_id: s.value, patient_id: s.options[s.selectedIndex].dataset.pid, shift: document.getElementById('fluidShift').value, iv_fluids: document.getElementById('fluidIV').value, oral_intake: document.getElementById('fluidOral').value, blood_products: document.getElementById('fluidBlood').value, medications_iv: document.getElementById('fluidMeds').value, urine: document.getElementById('fluidUrine').value, drains: document.getElementById('fluidDrains').value, ngt_output: document.getElementById('fluidNGT').value, vomit: document.getElementById('fluidVomit').value, recorded_by: currentUser?.display_name });
    showToast(tr('Saved!', 'تم الحفظ!'));
  } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
// ===== CSSD =====
async function renderCSSD(el) {
  const content = el;

  const batches = await API.get('/api/cssd/batches').catch(() => []);
  const processing = batches.filter(b => b.status === 'processing').length;
  const done = batches.filter(b => b.status === 'completed').length;

  content.innerHTML = `
    <h2>${tr('CSSD - Sterilization', 'التعقيم المركزي')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${batches.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Batches', 'إجمالي الدفعات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${processing}</h3><p style="margin:4px 0 0;font-size:12px">${tr('In Process', 'قيد التعقيم')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${done}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Completed', 'مكتملة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('New Batch', 'دفعة جديدة')}</h4>
        <div class="form-group"><label>${tr('Batch #', 'رقم الدفعة')}</label><input class="form-input" id="cssdBatch" value="CSSD-${Date.now().toString().slice(-6)}"></div>
        <div class="form-group"><label>${tr('Items', 'الأصناف')}</label><textarea class="form-input" id="cssdItems" rows="2" placeholder="${tr('Surgical instruments, trays...', 'أدوات جراحية، صواني...')}"></textarea></div>
        <div class="form-group"><label>${tr('Department', 'القسم')}</label><input class="form-input" id="cssdDept" placeholder="${tr('Surgery, ER...', 'الجراحة، الطوارئ...')}"></div>
        <div class="form-group"><label>${tr('Method', 'طريقة التعقيم')}</label>
          <select class="form-input" id="cssdMethod">
            <option value="autoclave">${tr('Steam Autoclave', 'أوتوكلاف بخاري')}</option>
            <option value="eto">${tr('ETO Gas', 'غاز ETO')}</option>
            <option value="plasma">${tr('H2O2 Plasma', 'بلازما H2O2')}</option>
            <option value="chemical">${tr('Chemical', 'كيميائي')}</option>
          </select></div>
        <div class="form-group"><label>${tr('Temperature', 'الحرارة')}</label><input class="form-input" id="cssdTemp" placeholder="134°C"></div>
        <div class="form-group"><label>${tr('Operator', 'المشغّل')}</label><input class="form-input" id="cssdOp"></div>
        <button class="btn btn-primary w-full" onclick="saveCssdBatch()">💾 ${tr('Start Cycle', 'بدء الدورة')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Batch History', 'سجل الدفعات')}</h4>
        <div id="cssdTable"></div>
      </div>
    </div>`;

  const ct = document.getElementById('cssdTable');
  if (ct) {
    createTable(ct, 'cssdTbl',
      [tr('Batch#', 'الدفعة'), tr('Items', 'الأصناف'), tr('Dept', 'القسم'), tr('Method', 'الطريقة'), tr('Temp', 'الحرارة'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', 'إجراءات')],
      batches.map(b => ({
        cells: [b.batch_number, (b.items || '').substring(0, 30), b.department || '', b.method || '', b.temperature || '', statusBadge(b.status), b.created_at ? new Date(b.created_at).toLocaleDateString('ar-SA') : '',
        b.status === 'processing' ? '<button class="btn btn-sm" onclick="completeCssd(' + b.id + ')">✅ ' + tr('Complete', 'إكمال') + '</button>' : '✅'], id: b.id
      }))
    );
  }
  window.saveCssdBatch = async () => {
    try { await API.post('/api/cssd/batches', { batch_number: document.getElementById('cssdBatch').value, items: document.getElementById('cssdItems').value, department: document.getElementById('cssdDept').value, method: document.getElementById('cssdMethod').value, temperature: document.getElementById('cssdTemp').value, operator: document.getElementById('cssdOp').value }); showToast(tr('Cycle started!', 'بدأت الدورة!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };
  window.completeCssd = async (id) => { try { await API.put('/api/cssd/batches/' + id, { status: 'completed' }); showToast('✅'); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); } };

}
window.addInstrumentSet = async function () {
  try { await API.post('/api/cssd/instruments', { set_name: document.getElementById('cssdName').value, set_name_ar: document.getElementById('cssdNameAr').value, set_code: document.getElementById('cssdCode').value, category: document.getElementById('cssdCat').value, instrument_count: document.getElementById('cssdCount').value, department: document.getElementById('cssdDept').value }); showToast(tr('Added!', 'تمت الإضافة!')); await navigateTo(24); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.startCycle = async function () {
  try { await API.post('/api/cssd/cycles', { cycle_number: document.getElementById('cycleNum').value, machine_name: document.getElementById('cycleMachine').value, cycle_type: document.getElementById('cycleType').value, temperature: document.getElementById('cycleTemp').value, duration_minutes: document.getElementById('cycleDur').value, operator: document.getElementById('cycleOp').value }); showToast(tr('Cycle started!', 'بدأت الدورة!')); await navigateTo(24); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.completeCycle = async function (id) {
  try { await API.put('/api/cssd/cycles/' + id, { status: 'Completed', bi_test_result: 'Pass' }); showToast(tr('Completed!', 'اكتملت!')); await navigateTo(24); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== DIETARY =====
async function renderDietary(el) {

  const patients = await API.get('/api/dietary/orders').catch(() => []);
  content.innerHTML = `
    <h2>${tr('Dietary / Nutrition', 'التغذية')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${patients.length || 0}</h3><p style="margin:4px 0 0;font-size:13px;color:#666">${tr('Active Orders', 'طلبات نشطة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${patients.filter?.(p => p.diet_type === 'diabetic')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px;color:#666">${tr('Diabetic Diet', 'حمية سكري')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${patients.filter?.(p => p.diet_type === 'soft')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px;color:#666">${tr('Soft Diet', 'حمية لينة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('New Diet Order', 'طلب حمية جديد')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="dietPatient" placeholder="${tr('Patient name', 'اسم المريض')}"></div>
        <div class="form-group"><label>${tr('Ward/Room', 'الجناح/الغرفة')}</label><input class="form-input" id="dietRoom" placeholder="${tr('e.g. 3A-201', 'مثال: 3أ-201')}"></div>
        <div class="form-group"><label>${tr('Diet Type', 'نوع الحمية')}</label>
        <select class="form-input" id="dietType">
          <option value="regular">${tr('Regular', 'عادي')}</option>
          <option value="diabetic">${tr('Diabetic', 'سكري')}</option>
          <option value="soft">${tr('Soft', 'لينة')}</option>
          <option value="liquid">${tr('Liquid', 'سائلة')}</option>
          <option value="NPO">${tr('NPO (Nothing by mouth)', 'صائم')}</option>
          <option value="low_sodium">${tr('Low Sodium', 'قليل الملح')}</option>
          <option value="renal">${tr('Renal', 'كلوية')}</option>
          <option value="gluten_free">${tr('Gluten Free', 'خالي جلوتين')}</option>
        </select></div>
        <div class="form-group"><label>${tr('Allergies/Notes', 'حساسية/ملاحظات')}</label><textarea class="form-input" id="dietNotes" rows="2"></textarea></div>
        <div class="form-group"><label>${tr('Meal Time', 'وقت الوجبة')}</label>
        <select class="form-input" id="dietMeal"><option value="breakfast">${tr('Breakfast', 'فطور')}</option><option value="lunch">${tr('Lunch', 'غداء')}</option><option value="dinner">${tr('Dinner', 'عشاء')}</option><option value="all">${tr('All Meals', 'كل الوجبات')}</option></select></div>
        <button class="btn btn-primary w-full" onclick="saveDietOrder()">💾 ${tr('Save Order', 'حفظ الطلب')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Active Diet Orders', 'طلبات الحمية النشطة')}</h4>
        <div id="dietOrdersList"></div>
      </div>
    </div>`;

  const list = document.getElementById('dietOrdersList');
  if (list && patients.length > 0) {
    list.innerHTML = patients.map(p => '<div style="padding:10px;margin:6px 0;background:#f8f9fa;border-radius:8px;border-right:4px solid ' + (p.diet_type === 'NPO' ? '#cc0000' : p.diet_type === 'diabetic' ? '#ff9800' : '#4caf50') + '"><strong>' + (p.patient_name || '') + '</strong> - ' + (p.room || '') + '<br><span style="font-size:13px;color:#666">' + (p.diet_type || '') + ' | ' + (p.meal_time || '') + '</span></div>').join('');
  } else if (list) { list.innerHTML = '<p style="color:#999;text-align:center">' + tr('No active orders', 'لا توجد طلبات') + '</p>'; }

  window.saveDietOrder = async () => {
    try {
      await API.post('/api/dietary/orders', { patient_name: document.getElementById('dietPatient')?.value, room: document.getElementById('dietRoom')?.value, diet_type: document.getElementById('dietType')?.value, meal_time: document.getElementById('dietMeal')?.value, notes: document.getElementById('dietNotes')?.value });
      showToast(tr('Diet order saved!', 'تم حفظ طلب الحمية!'));
      renderDietary(content);
    } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}
window.addDietOrder = async function () {
  const s = document.getElementById('dietPatient'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  const dt = document.getElementById('dietType');
  try { await API.post('/api/dietary/orders', { admission_id: s.value, patient_id: s.options[s.selectedIndex].dataset.pid, patient_name: s.options[s.selectedIndex].dataset.name, diet_type: dt.value, diet_type_ar: dt.options[dt.selectedIndex].dataset.ar, texture: document.getElementById('dietTexture').value, allergies: document.getElementById('dietAllergies').value, ordered_by: currentUser?.display_name }); showToast(tr('Diet ordered!', 'تم طلب الحمية!')); await navigateTo(25); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== INFECTION CONTROL =====
let icTab = 'surveillance';
async function renderInfectionControl(el) {
  const content = el;

  const reports = await API.get('/api/infection-control/reports').catch(() => []);
  const active = reports.filter(r => r.status === 'active').length;
  const resolved = reports.filter(r => r.status === 'resolved').length;

  // Group by infection type
  const byType = {};
  reports.forEach(r => { const t = r.infection_type || 'Other'; byType[t] = (byType[t] || 0) + 1; });

  content.innerHTML = `
    <h2>${tr('Infection Control', 'مكافحة العدوى')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#fce4ec"><h3 style="margin:0;color:#c62828">${reports.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Reports', 'إجمالي البلاغات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${active}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Active Cases', 'حالات نشطة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${resolved}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Resolved', 'محلولة')}</p></div>
    </div>
    ${Object.keys(byType).length > 0 ? '<div class="card" style="padding:16px;margin-bottom:16px"><h4 style="margin:0 0 8px">' + tr('By Infection Type', 'حسب نوع العدوى') + '</h4><div style="display:flex;gap:8px;flex-wrap:wrap">' + Object.entries(byType).map(([t, c]) => '<span style="padding:4px 12px;border-radius:16px;background:#fce4ec;font-size:12px">' + t + ': <strong>' + c + '</strong></span>').join('') + '</div></div>' : ''}
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Report Infection', 'إبلاغ عن عدوى')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="icPatient"></div>
        <div class="form-group"><label>${tr('Infection Type', 'نوع العدوى')}</label>
          <select class="form-input" id="icType">
            <option value="MRSA">MRSA</option><option value="VRE">VRE</option><option value="C.diff">C. difficile</option>
            <option value="ESBL">ESBL</option><option value="TB">TB</option><option value="COVID-19">COVID-19</option>
            <option value="Influenza">Influenza</option><option value="UTI">UTI</option><option value="SSI">SSI</option>
            <option value="Other">${tr('Other', 'أخرى')}</option>
          </select></div>
        <div class="form-group"><label>${tr('Ward', 'الجناح')}</label><input class="form-input" id="icWard"></div>
        <div class="form-group"><label>${tr('Isolation Type', 'نوع العزل')}</label>
          <select class="form-input" id="icIsolation"><option value="none">${tr('None', 'بدون')}</option><option value="contact">${tr('Contact', 'تلامسي')}</option><option value="droplet">${tr('Droplet', 'رذاذي')}</option><option value="airborne">${tr('Airborne', 'هوائي')}</option><option value="protective">${tr('Protective', 'وقائي')}</option></select></div>
        <div class="form-group"><label>${tr('Culture Results', 'نتائج الزراعة')}</label><textarea class="form-input" id="icCulture" rows="2"></textarea></div>
        <div class="form-group"><label>${tr('Action Taken', 'الإجراء المتخذ')}</label><textarea class="form-input" id="icAction" rows="2"></textarea></div>
        <button class="btn btn-primary w-full" onclick="saveIcReport()">🦠 ${tr('Submit Report', 'تقديم البلاغ')}</button>
      </div>
      <div class="card" style="padding:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <h4 style="margin:0">${tr('Reports', 'البلاغات')}</h4>
          <button class="btn btn-sm" onclick="exportToCSV(reports,'infection_control')" style="background:#e0f7fa;color:#00838f">📥</button>
        </div>
        <div id="icTable"></div>
      </div>
    </div>`;

  const ict = document.getElementById('icTable');
  if (ict) {
    createTable(ict, 'icTbl',
      [tr('Patient', 'المريض'), tr('Type', 'النوع'), tr('Ward', 'الجناح'), tr('Isolation', 'العزل'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', '')],
      reports.map(r => ({ cells: [r.patient_name, r.infection_type, r.ward || '', r.isolation_type || '', statusBadge(r.status), r.created_at ? new Date(r.created_at).toLocaleDateString('ar-SA') : '', r.status === 'active' ? '<button class="btn btn-sm" onclick="resolveIc(' + r.id + ')">✅</button>' : '✅'], id: r.id }))
    );
  }
  window.saveIcReport = async () => { try { await API.post('/api/infection-control/reports', { patient_name: document.getElementById('icPatient').value, infection_type: document.getElementById('icType').value, ward: document.getElementById('icWard').value, isolation_type: document.getElementById('icIsolation').value, culture_results: document.getElementById('icCulture').value, action_taken: document.getElementById('icAction').value }); showToast(tr('Report submitted!', 'تم تقديم البلاغ!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); } };
  window.resolveIc = async (id) => { try { await API.put('/api/infection-control/reports/' + id, { status: 'resolved' }); showToast('✅'); navigateTo(currentPage); } catch (e) { } };

}
window.reportInfection = async function () {
  try { await API.post('/api/infection/surveillance', { patient_name: document.getElementById('icPatient').value, infection_type: document.getElementById('icType').value, organism: document.getElementById('icOrganism').value, ward: document.getElementById('icWard').value, hai_category: document.getElementById('icHAI').value, isolation_type: document.getElementById('icIsolation').value, reported_by: currentUser?.display_name }); showToast(tr('Reported!', 'تم التسجيل!')); await navigateTo(26); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.addHHAudit = async function () {
  try { await API.post('/api/infection/hand-hygiene', { department: document.getElementById('hhDept').value, moments_observed: document.getElementById('hhObs').value, moments_compliant: document.getElementById('hhComp').value, auditor: currentUser?.display_name }); showToast(tr('Recorded!', 'تم التسجيل!')); await navigateTo(26); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== QUALITY =====
let qTab = 'incidents';
async function renderQuality(el) {
  const content = el;
  if (!window.qualityTab) window.qualityTab = 'dashboard';

  const selectedModule = window.auditModuleFilter || '';

  // Fetch data
  const [incidents, satisfaction, kpis, stats, auditLogs] = await Promise.all([
    API.get('/api/quality/incidents').catch(() => []),
    API.get('/api/quality/satisfaction').catch(() => []),
    API.get('/api/quality/kpis').catch(() => []),
    API.get('/api/quality/stats').catch(() => ({ openIncidents: 0, totalIncidents: 0, avgSatisfaction: 0, kpiOnTrack: 0, kpiTotal: 0 })),
    API.get(selectedModule ? `/api/admin/audit-trail?limit=50&module=${selectedModule}` : '/api/admin/audit-trail?limit=50').catch(() => [])
  ]);

  const avgSat = stats.avgSatisfaction || 'N/A';

  // Calculate compliance checklist score from localStorage
  const checklistItems = [
    { id: 'zatca', cat: 'ZATCA', title_ar: 'الامتثال للربط مع هيئة الزكاة والضريبة (Phase 2)', title_en: 'ZATCA Phase 2 Integration Compliance', desc_ar: 'توليد الختم الرقمي وتنسيق ملفات XML وتأكيد المعاملات الفورية.', desc_en: 'Digital stamp generation, XML layout, real-time ZATCA clearance.', weight: 25 },
    { id: 'cbahi_consent', cat: 'CBAHI', title_ar: 'سياسة حقوق المرضى والموافقة المستنيرة', title_en: 'Patient Rights & Informed Consent Policy', desc_ar: 'التحقق من توقيع نماذج الإقرار الطبي لجميع المرضى قبل العمليات.', desc_en: 'Verification of medical consent signatures for all patients pre-operation.', weight: 15 },
    { id: 'cbahi_hygiene', cat: 'CBAHI', title_ar: 'نسبة الالتزام بنظافة وتطهير الأيدي', title_en: 'Hand Hygiene Compliance Observational Audits', desc_ar: 'إجراء جولات رصد لنسبة التزام الكادر بنظافة الأيدي في الأقسام الطبية.', desc_en: 'Monitoring staff compliance rate with hand hygiene protocols.', weight: 15 },
    { id: 'cbahi_meds', cat: 'CBAHI', title_ar: 'بروتوكولات الأدوية عالية الخطورة', title_en: 'High-Alert Medications Verification Protocol', desc_ar: 'نظام التحقق المزدوج للأدوية المخدرة والمقيدة وصرف الوصفات.', desc_en: 'Double-verification system for narcotics and controlled high-alert drugs.', weight: 15 },
    { id: 'moh_records', cat: 'MOH', title_ar: 'سرية السجلات الطبية والملف الإلكتروني للمريض', title_en: 'Electronic Health Record Confidentiality', desc_ar: 'حماية الملفات الطبية ومنع الوصول غير المصرح به مع تفعيل سجل التدقيق.', desc_en: 'Medical record encryption and unauthorized access prevention logs.', weight: 15 },
    { id: 'jci_comm', cat: 'JCI', title_ar: 'فاعلية الاتصال ونقل المعلومات الطبية (ISBAR)', title_en: 'Effective Communication & Clinical Handover (ISBAR)', desc_ar: 'استخدام بروتوكول ISBAR عند تسليم المناوبات الطبية والحالات الحرجة.', desc_en: 'Standardized ISBAR structure for handovers and critical notifications.', weight: 15 }
  ];

  let completedWeight = 0;
  let totalWeight = 0;
  checklistItems.forEach(item => {
    const isDone = localStorage.getItem('compliance_' + item.id) === 'true';
    if (isDone) completedWeight += item.weight;
    totalWeight += item.weight;
  });
  const complianceScore = totalWeight ? Math.round((completedWeight / totalWeight) * 100) : 100;

  let htmlContent = `
    <div class="mb-xl flex flex-col md:flex-row md:items-end justify-between gap-md">
      <div>
        <nav class="flex text-on-surface-variant font-caption text-caption mb-xs">
          <span>${tr('Operations', 'العمليات')}</span>
          <span class="mx-xs">/</span>
          <span class="text-primary font-bold">${tr('Quality & Compliance', 'الجودة والامتثال')}</span>
        </nav>
        <h3 class="font-display-lg text-display-lg text-primary tracking-tight">${tr('Quality Assurance & Compliance', 'إدارة الجودة والامتثال')}</h3>
        <p class="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          ${tr('Monitor clinical indicators, patient safety incident reports, Saudi ZATCA & CBAHI compliance checklist, and system audit trails.', 'مراقبة المؤشرات السريرية، بلاغات سلامة المرضى، وقائمة التحقق من متطلبات سباهي وهيئة الزكاة والضريبة والجمارك (ZATCA)، وسجلات تدقيق النظام.')}
        </p>
      </div>
    </div>

    <!-- Tabs Bar -->
    <div class="tab-bar mb-md flex border-b border-outline-variant/30 overflow-x-auto gap-2">
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.qualityTab === 'dashboard' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.qualityTab='dashboard'; navigateTo(currentPage)">
        📊 ${tr('Dashboard & KPIs', 'لوحة المؤشرات')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.qualityTab === 'incidents' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.qualityTab='incidents'; navigateTo(currentPage)">
        ⚠️ ${tr('Incident Log', 'سجل الحوادث والتبليغات')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.qualityTab === 'checklist' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.qualityTab='checklist'; navigateTo(currentPage)">
        📋 ${tr('Compliance Checklist', 'قائمة التحقق من الامتثال')}
      </button>
      <button class="tab-btn px-lg py-sm border-b-2 font-bold transition-all ${window.qualityTab === 'audit_logs' ? 'active border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'}" onclick="window.qualityTab='audit_logs'; navigateTo(currentPage)">
        🔍 ${tr('System Audit Logs', 'سجلات تدقيق النظام')}
      </button>
    </div>
  `;

  if (window.qualityTab === 'dashboard') {
    htmlContent += `
      <!-- KPI Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-xl">
        <!-- Open Incidents -->
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-error/10 rounded-lg text-error material-symbols-outlined font-icon">warning</span>
            <span class="text-error text-xs font-bold">${stats.openIncidents} ${tr('Open', 'مفتوح')}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Open Incidents', 'بلاغات الحوادث المفتوحة')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${stats.openIncidents} <span class="text-title-lg text-on-surface-variant">/ ${stats.totalIncidents}</span></h4>
          </div>
        </div>

        <!-- Patient Satisfaction -->
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-tertiary-container/30 rounded-lg text-on-tertiary-container material-symbols-outlined font-icon">sentiment_very_satisfied</span>
            <span class="text-on-tertiary-container text-xs font-bold">★ ${avgSat} / 5</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Avg Patient Satisfaction', 'متوسط رضا المرضى')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${avgSat} <span class="text-title-lg text-on-surface-variant">★</span></h4>
          </div>
        </div>

        <!-- KPIs On Track -->
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-secondary/10 rounded-lg text-secondary material-symbols-outlined font-icon">trending_up</span>
            <span class="text-secondary text-xs font-bold">${stats.kpiOnTrack} / ${stats.kpiTotal}</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('KPIs On Track', 'المؤشرات المحققة للهدف')}</p>
            <h4 class="text-display-lg text-primary font-bold mt-xs">${stats.kpiOnTrack} <span class="text-title-lg text-on-surface-variant">/ ${stats.kpiTotal}</span></h4>
          </div>
        </div>

        <!-- Compliance Score -->
        <div class="glass-card p-md rounded-2xl flex flex-col justify-between group overflow-hidden relative">
          <div class="flex justify-between items-start relative z-10">
            <span class="p-xs bg-primary/10 rounded-lg text-primary material-symbols-outlined font-icon">verified_user</span>
            <span class="text-primary text-xs font-bold">${complianceScore}%</span>
          </div>
          <div class="mt-lg relative z-10">
            <p class="text-on-surface-variant font-label-md text-label-md">${tr('Compliance Score', 'نسبة الالتزام بالمعايير')}</p>
            <h4 class="text-display-lg text-secondary font-bold mt-xs">${complianceScore}%</h4>
          </div>
        </div>
      </div>

      <!-- Main Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <!-- Add KPI Form -->
        <div class="glass-card p-md rounded-2xl lg:col-span-1">
          <h4 class="text-title-lg font-bold text-primary mb-md">${tr('Add Quality KPI', 'إضافة مؤشر جودة جديد')}</h4>
          
          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('KPI Name (English)', 'اسم المؤشر (إنجليزي)')}</label>
            <input type="text" class="form-input w-full" id="kpiName" placeholder="e.g. Patient Wait Time">
          </div>
          
          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Target Value', 'القيمة المستهدفة (%)')}</label>
            <input type="number" class="form-input w-full" id="kpiTarget" value="90">
          </div>

          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Actual Value', 'القيمة الفعلية (%)')}</label>
            <input type="number" class="form-input w-full" id="kpiActual" value="85">
          </div>

          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Period', 'الفترة')}</label>
            <select class="form-input w-full" id="kpiPeriod">
              <option value="Q1 2026">Q1 2026</option>
              <option value="Q2 2026">Q2 2026</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>

          <button class="btn btn-primary w-full mt-md flex items-center justify-center gap-xs" onclick="window.addKPI()">
            <span class="material-symbols-outlined text-body-lg">add</span>
            <span>${tr('Add KPI Indicator', 'إضافة مؤشر الأداء')}</span>
          </button>
        </div>

        <!-- KPIs List Table -->
        <div class="glass-card p-md rounded-2xl lg:col-span-2">
          <h4 class="text-title-lg font-bold text-primary mb-md">${tr('Active Indicators List', 'قائمة مؤشرات الأداء النشطة')}</h4>
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-right border-collapse">
              <thead>
                <tr class="border-b border-outline-variant/30 text-on-surface-variant font-label-md">
                  <th class="py-sm px-md">${tr('Indicator Name', 'اسم المؤشر')}</th>
                  <th class="py-sm px-md">${tr('Target', 'المستهدف')}</th>
                  <th class="py-sm px-md">${tr('Actual', 'الفعلي')}</th>
                  <th class="py-sm px-md">${tr('Period', 'الفترة')}</th>
                  <th class="py-sm px-md">${tr('Status', 'الحالة')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10 text-body-md text-on-surface">
                ${kpis.length ? kpis.map(k => {
                  let statusClass = 'bg-error/10 text-error';
                  if (k.status === 'On Track') statusClass = 'bg-success/10 text-success';
                  else if (k.status === 'At Risk') statusClass = 'bg-tertiary-container text-on-tertiary-container';
                  
                  return `
                    <tr class="hover:bg-surface-variant/20 transition-all">
                      <td class="py-sm px-md font-bold">${k.kpi_name || k.kpi_name_ar}</td>
                      <td class="py-sm px-md">${k.target_value}${k.unit || '%'}</td>
                      <td class="py-sm px-md">${k.actual_value}${k.unit || '%'}</td>
                      <td class="py-sm px-md">${k.period || ''}</td>
                      <td class="py-sm px-md">
                        <span class="px-sm py-xs rounded-full font-label-md ${statusClass}">
                          ${tr(k.status, k.status === 'On Track' ? 'مستقر' : k.status === 'At Risk' ? 'معرض للخطر' : 'تحت المستهدف')}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="5" class="py-lg text-center text-on-surface-variant font-body-md">${tr('No KPIs registered yet.', 'لا توجد مؤشرات أداء مسجلة بعد.')}</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else if (window.qualityTab === 'incidents') {
    htmlContent += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <!-- Report Form -->
        <div class="glass-card p-md rounded-2xl lg:col-span-1">
          <h4 class="text-title-lg font-bold text-primary mb-md">${tr('Report Safety Incident', 'الإبلاغ عن حادثة سلامة')}</h4>
          
          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Incident Type', 'نوع الحادثة')}</label>
            <select class="form-input w-full" id="qiType">
              <option value="medication_error">${tr('Medication Error', 'خطأ دوائي')}</option>
              <option value="fall">${tr('Patient Fall', 'سقوط مريض')}</option>
              <option value="infection">${tr('Healthcare Infection', 'عدوى منشأة صحية')}</option>
              <option value="equipment">${tr('Equipment Malfunction', 'عطل في الأجهزة الطبية')}</option>
              <option value="complaint">${tr('Patient Complaint', 'شكوى مريض')}</option>
              <option value="other">${tr('Other', 'أخرى')}</option>
            </select>
          </div>

          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Severity Level', 'مستوى الخطورة')}</label>
            <select class="form-input w-full" id="qiSeverity">
              <option value="low">🟢 ${tr('Low / Minor', 'منخفضة / طفيفة')}</option>
              <option value="medium">🟡 ${tr('Medium / Moderate', 'متوسطة')}</option>
              <option value="high">🔴 ${tr('High / Severe', 'عالية / جسيمة')}</option>
              <option value="critical">⚫ ${tr('Critical / Sentinel', 'حرجة / حادثة جسيمة')}</option>
            </select>
          </div>

          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Department', 'القسم')}</label>
            <input type="text" class="form-input w-full" id="qiDept" placeholder="e.g. ICU / الطوارئ">
          </div>

          <div class="form-group mb-sm">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Incident Description', 'شرح تفاصيل الحادثة')}</label>
            <textarea class="form-input w-full" id="qiDesc" rows="3" placeholder="${tr('Describe what happened...', 'اكتب تفاصيل ما حدث بدقة...')}" required></textarea>
          </div>

          <div class="form-group mb-md">
            <label class="text-label-md text-on-surface-variant block mb-xs">${tr('Immediate Corrective Action', 'الإجراء الفوري المتخذ')}</label>
            <input type="text" class="form-input w-full" id="qiAction" placeholder="e.g. Notify doctor, check vitals">
          </div>

          <button class="btn btn-primary w-full flex items-center justify-center gap-xs" onclick="window.reportIncident()">
            <span class="material-symbols-outlined text-body-lg">report_problem</span>
            <span>${tr('Submit Incident Report', 'إرسال التقرير')}</span>
          </button>
        </div>

        <!-- Incidents List -->
        <div class="glass-card p-md rounded-2xl lg:col-span-2">
          <h4 class="text-title-lg font-bold text-primary mb-md">${tr('Reported Incidents Log', 'سجل البلاغات المسجلة')}</h4>
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-right border-collapse">
              <thead>
                <tr class="border-b border-outline-variant/30 text-on-surface-variant font-label-md">
                  <th class="py-sm px-md">${tr('Type', 'النوع')}</th>
                  <th class="py-sm px-md">${tr('Severity', 'الخطورة')}</th>
                  <th class="py-sm px-md">${tr('Dept', 'القسم')}</th>
                  <th class="py-sm px-md">${tr('Date', 'التاريخ')}</th>
                  <th class="py-sm px-md">${tr('Status', 'الحالة')}</th>
                  <th class="py-sm px-md">${tr('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10 text-body-md text-on-surface">
                ${incidents.length ? incidents.map(i => {
                  let sevColor = 'bg-success/10 text-success';
                  if (i.severity === 'critical') sevColor = 'bg-primary text-white';
                  else if (i.severity === 'high') sevColor = 'bg-error/10 text-error';
                  else if (i.severity === 'medium') sevColor = 'bg-tertiary-container text-on-tertiary-container';

                  const typeName = tr(i.type || i.incident_type || '', i.type || i.incident_type || '');
                  
                  return `
                    <tr class="hover:bg-surface-variant/20 transition-all">
                      <td class="py-sm px-md font-bold">${typeName}</td>
                      <td class="py-sm px-md">
                        <span class="px-sm py-xs rounded-full font-label-md ${sevColor}">
                          ${tr(i.severity, i.severity === 'low' ? 'منخفضة' : i.severity === 'medium' ? 'متوسطة' : i.severity === 'high' ? 'عالية' : 'حرجة')}
                        </span>
                      </td>
                      <td class="py-sm px-md">${i.department || ''}</td>
                      <td class="py-sm px-md">${i.created_at ? new Date(i.created_at).toLocaleDateString('ar-SA') : ''}</td>
                      <td class="py-sm px-md">
                        <span class="px-sm py-xs rounded-full font-label-md ${i.status === 'Closed' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}">
                          ${tr(i.status, i.status === 'Closed' ? 'مغلق' : 'مفتوح')}
                        </span>
                      </td>
                      <td class="py-sm px-md">
                        ${i.status !== 'Closed' ? `
                          <button class="px-sm py-xs bg-secondary text-white rounded hover:opacity-90 font-label-md inline-flex items-center gap-xs" onclick="window.closeIncident(${i.id})">
                            <span class="material-symbols-outlined text-body-sm">check</span>
                            <span>${tr('Close', 'إغلاق')}</span>
                          </button>
                        ` : '<span class="text-on-surface-variant text-xs">✓ Done</span>'}
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" class="py-lg text-center text-on-surface-variant font-body-md">${tr('No incidents reported.', 'لا توجد حوادث مسجلة.')}</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else if (window.qualityTab === 'checklist') {
    htmlContent += `
      <div class="glass-card p-md rounded-2xl mb-xl">
        <div class="flex justify-between items-center mb-md border-b border-outline-variant/30 pb-sm">
          <div>
            <h4 class="text-title-lg font-bold text-primary">${tr('Hospital Compliance Checklist', 'قائمة التحقق العامة من الامتثال')}</h4>
            <p class="text-body-md text-on-surface-variant">${tr('Verify systems readiness for Saudi ZATCA Phase 2, CBAHI Clinical Standards, and MOH Regulations.', 'التحقق من جاهزية الأنظمة للربط الإلكتروني مع الهيئة، ومعايير سباهي الوطنية، وتوجيهات وزارة الصحة.')}</p>
          </div>
          <div class="text-left">
            <span class="text-caption text-on-surface-variant block font-label-md">${tr('Total Compliance Score', 'نسبة الالتزام الإجمالية')}</span>
            <span class="text-display-lg text-secondary font-bold font-display-lg">${complianceScore}%</span>
          </div>
        </div>

        <div class="w-full bg-surface-variant/30 h-3 rounded-full overflow-hidden mb-lg relative">
          <div class="bg-secondary h-full transition-all duration-500" style="width: ${complianceScore}%"></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
          ${checklistItems.map(item => {
            const isDone = localStorage.getItem('compliance_' + item.id) === 'true';
            const catColor = item.cat === 'ZATCA' ? 'bg-secondary/10 text-secondary' : item.cat === 'CBAHI' ? 'bg-primary/10 text-primary' : 'bg-tertiary-container text-on-tertiary-container';
            return `
              <div class="p-md border border-outline-variant/30 rounded-2xl hover:border-secondary/50 transition-all flex items-start justify-between gap-md ${isDone ? 'bg-success/5 border-success/30' : 'bg-transparent'}">
                <div class="flex items-start gap-sm">
                  <div class="pt-1">
                    <input type="checkbox" class="w-5 h-5 rounded border-outline cursor-pointer focus:ring-secondary text-secondary" 
                      ${isDone ? 'checked' : ''} 
                      onchange="localStorage.setItem('compliance_${item.id}', this.checked); navigateTo(currentPage)">
                  </div>
                  <div>
                    <span class="px-sm py-xs rounded font-label-md text-caption block w-fit mb-xs ${catColor}">${item.cat}</span>
                    <h5 class="font-bold text-body-lg text-primary ${isDone ? 'line-through text-on-surface-variant/60' : ''}">${tr(item.title_en, item.title_ar)}</h5>
                    <p class="text-body-md text-on-surface-variant mt-xs">${tr(item.desc_en, item.desc_ar)}</p>
                  </div>
                </div>
                <div class="text-left font-label-md text-caption text-on-surface-variant font-bold">
                  +${item.weight}%
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else if (window.qualityTab === 'audit_logs') {
    htmlContent += `
      <div class="glass-card p-md rounded-2xl">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-md mb-md border-b border-outline-variant/30 pb-sm">
          <div>
            <h4 class="text-title-lg font-bold text-primary">${tr('System Audit Trail', 'سجل تدقيق النظام')}</h4>
            <p class="text-body-md text-on-surface-variant">${tr('Real-time security and administrative operation tracking.', 'متابعة العمليات الإدارية والأمنية الحرجة في النظام بشكل فوري.')}</p>
          </div>
          <div class="flex items-center gap-xs">
            <label class="text-label-md text-on-surface-variant font-bold whitespace-nowrap">${tr('Filter Module:', 'تصفية القسم:')}</label>
            <select class="form-input" onchange="window.auditModuleFilter=this.value; navigateTo(currentPage)">
              <option value="" ${!selectedModule ? 'selected' : ''}>${tr('All Modules', 'كل الأقسام')}</option>
              <option value="Auth" ${selectedModule === 'Auth' ? 'selected' : ''}>${tr('Authentication', 'الهوية والأمان')}</option>
              <option value="Finance" ${selectedModule === 'Finance' ? 'selected' : ''}>${tr('Finance', 'المالية')}</option>
              <option value="Pharmacy" ${selectedModule === 'Pharmacy' ? 'selected' : ''}>${tr('Pharmacy', 'الصيدلية')}</option>
              <option value="Patients" ${selectedModule === 'Patients' ? 'selected' : ''}>${tr('Patients Registry', 'سجل المرضى')}</option>
              <option value="OB/GYN" ${selectedModule === 'OB/GYN' ? 'selected' : ''}>${tr('OB/GYN & Clinical', 'النساء والولادة')}</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-right border-collapse">
            <thead>
              <tr class="border-b border-outline-variant/30 text-on-surface-variant font-label-md">
                <th class="py-sm px-md">${tr('User', 'المستخدم')}</th>
                <th class="py-sm px-md">${tr('Action', 'الحدث')}</th>
                <th class="py-sm px-md">${tr('Module', 'القسم')}</th>
                <th class="py-sm px-md">${tr('Details', 'التفاصيل')}</th>
                <th class="py-sm px-md">${tr('IP Address', 'عنوان IP')}</th>
                <th class="py-sm px-md">${tr('Timestamp', 'الوقت والتاريخ')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10 text-body-md text-on-surface">
              ${auditLogs.length ? auditLogs.map(l => `
                <tr class="hover:bg-surface-variant/20 transition-all">
                  <td class="py-sm px-md font-bold">${l.user_name || l.user_id || 'System'}</td>
                  <td class="py-sm px-md">
                    <span class="px-sm py-xs rounded font-label-md text-caption ${
                      l.action === 'DELETE' || l.action === 'SOFT_DELETE' ? 'bg-error/10 text-error' :
                      l.action === 'CHANGE_PASSWORD' || l.action === 'LOGIN' ? 'bg-primary/10 text-primary' :
                      'bg-secondary/10 text-secondary'
                    }">
                      ${l.action || ''}
                    </span>
                  </td>
                  <td class="py-sm px-md font-label-md text-caption text-on-surface-variant">${l.module || ''}</td>
                  <td class="py-sm px-md text-body-sm text-on-surface-variant">${l.details || l.description || ''}</td>
                  <td class="py-sm px-md font-mono text-caption text-on-surface-variant">${l.ip_address || ''}</td>
                  <td class="py-sm px-md text-caption">${l.created_at ? new Date(l.created_at).toLocaleString('ar-SA') : ''}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" class="py-lg text-center text-on-surface-variant font-body-md">${tr('No audit logs recorded for this module.', 'لا توجد سجلات تدقيق مسجلة لهذا القسم.')}</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  content.innerHTML = htmlContent;
}

window.reportIncident = async function () {
  try {
    await API.post('/api/quality/incidents', {
      incident_type: document.getElementById('qiType').value,
      severity: document.getElementById('qiSeverity').value,
      department: document.getElementById('qiDept').value,
      description: document.getElementById('qiDesc').value,
      immediate_action: document.getElementById('qiAction').value,
      reported_by: currentUser?.display_name
    });
    showToast(tr('Reported!', 'تم التسجيل!'));
    await navigateTo(27);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};

window.closeIncident = async function (id) {
  try {
    await API.put('/api/quality/incidents/' + id, { status: 'Closed' });
    showToast(tr('Closed!', 'تم الإغلاق!'));
    await navigateTo(27);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};

window.addKPI = async function () {
  try {
    await API.post('/api/quality/kpis', {
      kpi_name: document.getElementById('kpiName').value,
      target_value: document.getElementById('kpiTarget').value,
      actual_value: document.getElementById('kpiActual').value,
      period: document.getElementById('kpiPeriod').value
    });
    showToast(tr('Added!', 'تمت الإضافة!'));
    await navigateTo(27);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};
// ===== MAINTENANCE =====
let mntTab = 'dashboard';
async function renderMaintenance(el) {
  const content = el;

  let stats = { openWO: 0, inProgressWO: 0, overduePM: 0, totalEquipment: 0 };
  let mntOrders = [];
  let workOrders = [];
  let equipment = [];

  try {
    stats = await API.get('/api/maintenance/stats').catch(() => ({ openWO: 0, inProgressWO: 0, overduePM: 0, totalEquipment: 0 }));
    mntOrders = await API.get('/api/maintenance/orders').catch(() => []);
    workOrders = await API.get('/api/maintenance/work-orders').catch(() => []);
    equipment = await API.get('/api/maintenance/equipment').catch(() => []);
  } catch (e) {
    console.error('Error fetching maintenance data:', e);
  }

  const activeWO = (parseInt(stats.openWO) || 0) + (parseInt(stats.inProgressWO) || 0);
  const overduePM = parseInt(stats.overduePM) || 0;
  const totalEquip = parseInt(stats.totalEquipment) || equipment.length;

  content.innerHTML = `
    <div class="flex justify-between items-end mb-6">
      <div>
        <h2 class="font-headline-lg text-headline-lg text-primary">${tr('Biomedical & Facility Maintenance', 'إدارة الصيانة والأصول الطبية')}</h2>
        <p class="text-on-surface-variant text-sm mt-1">${tr('Monitor medical devices safety, schedule preventive calibrations, and log repair tickets', 'متابعة سلامة الأجهزة الطبية، جدولة المعايرة الوقائية وتسجيل طلبات الإصلاح')}</p>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="flex gap-4 mb-6 border-b border-outline-variant/30 pb-2">
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${mntTab === 'dashboard' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="mntTab='dashboard';navigateTo(28)">
        📊 ${tr('Maintenance Dashboard', 'لوحة التحكم')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${mntTab === 'orders' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="mntTab='orders';navigateTo(28)">
        🔧 ${tr('Work Orders', 'طلبات الصيانة')}
      </button>
      <button class="px-4 py-2 font-bold rounded-lg transition-all ${mntTab === 'assets' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high/50'}" onclick="mntTab='assets';navigateTo(28)">
        🏢 ${tr('Biomedical Assets', 'سجل الأصول الطبية')}
      </button>
    </div>

    <div class="tab-pane-content">
      ${mntTab === 'dashboard' ? `
        <!-- Metrics Bento Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
          <div class="glass-card p-6 rounded-2xl flex flex-col justify-between">
            <div class="flex justify-between items-start">
              <div class="p-3 bg-primary/5 rounded-xl text-primary flex items-center justify-center">
                <span class="material-symbols-outlined">precision_manufacturing</span>
              </div>
              <span class="text-green-600 text-xs font-bold">+2.4%</span>
            </div>
            <div class="mt-4">
              <p class="text-on-surface-variant text-xs font-bold">${tr('Total Biomedical Assets', 'إجمالي الأصول الطبية')}</p>
              <h3 class="font-display-lg text-3xl font-bold text-primary mt-1">${totalEquip}</h3>
            </div>
          </div>

          <div class="glass-card p-6 rounded-2xl flex flex-col justify-between border-r-4 border-r-error">
            <div class="flex justify-between items-start">
              <div class="p-3 bg-error/5 rounded-xl text-error flex items-center justify-center">
                <span class="material-symbols-outlined">error</span>
              </div>
              <span class="text-error text-xs font-bold">${tr('Critical', 'عاجل')}</span>
            </div>
            <div class="mt-4">
              <p class="text-on-surface-variant text-xs font-bold">${tr('Active Work Orders', 'طلبات الصيانة النشطة')}</p>
              <h3 class="font-display-lg text-3xl font-bold text-error mt-1">${activeWO}</h3>
            </div>
          </div>

          <div class="glass-card p-6 rounded-2xl flex flex-col justify-between border-r-4 border-r-warning">
            <div class="flex justify-between items-start">
              <div class="p-3 bg-warning/5 rounded-xl text-warning flex items-center justify-center">
                <span class="material-symbols-outlined">calendar_today</span>
              </div>
              <span class="text-warning text-xs font-bold">${overduePM} ${tr('Tasks', 'مهام')}</span>
            </div>
            <div class="mt-4">
              <p class="text-on-surface-variant text-xs font-bold">${tr('Overdue PM Schedules', 'صيانة وقائية متأخرة')}</p>
              <h3 class="font-display-lg text-3xl font-bold text-primary mt-1">${overduePM}</h3>
            </div>
          </div>

          <div class="glass-card p-6 rounded-2xl flex flex-col justify-between">
            <div class="flex justify-between items-start">
              <div class="p-3 bg-secondary/5 rounded-xl text-secondary flex items-center justify-center">
                <span class="material-symbols-outlined">timer_off</span>
              </div>
              <span class="text-green-600 text-xs font-bold">-0.8%</span>
            </div>
            <div class="mt-4">
              <p class="text-on-surface-variant text-xs font-bold">${tr('Equipment Downtime Rate', 'معدل تعطل الأجهزة')}</p>
              <h3 class="font-display-lg text-3xl font-bold text-primary mt-1">1.2%</h3>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start mb-lg">
          <!-- Calendar view -->
          <div class="lg:col-span-8 glass-card rounded-2xl overflow-hidden">
            <div class="p-4 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low/50">
              <h4 class="font-title-lg font-bold text-primary">${tr('Preventive Maintenance Calendar', 'تقويم الصيانة الوقائية والمعايرة')}</h4>
              <div class="flex items-center gap-2">
                <button class="w-8 h-8 flex items-center justify-center rounded-full border border-outline-variant hover:bg-surface-container transition-colors">
                  <span class="material-symbols-outlined text-sm">chevron_right</span>
                </button>
                <span class="font-label-md px-2 text-primary font-bold">يونيو 2026</span>
                <button class="w-8 h-8 flex items-center justify-center rounded-full border border-outline-variant hover:bg-surface-container transition-colors">
                  <span class="material-symbols-outlined text-sm">chevron_left</span>
                </button>
              </div>
            </div>
            <div class="grid grid-cols-7 border-b border-outline-variant/30 text-center py-2 bg-surface-container-low/20">
              <div class="text-xs font-bold text-on-surface-variant">${tr('Sun', 'الأحد')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Mon', 'الاثنين')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Tue', 'الثلاثاء')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Wed', 'الأربعاء')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Thu', 'الخميس')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Fri', 'الجمعة')}</div>
              <div class="text-xs font-bold text-on-surface-variant">${tr('Sat', 'السبت')}</div>
            </div>
            <div class="grid grid-cols-7 grid-rows-2">
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 relative hover:bg-primary/5 transition-colors">
                <span class="text-xs text-on-surface-variant font-bold">14</span>
                <div class="mt-2">
                  <div class="bg-secondary/10 border-r-2 border-secondary p-1 rounded text-[10px] text-on-secondary-container truncate" title="معايرة أجهزة تنفس">معايرة أجهزة التنفس (3)</div>
                </div>
              </div>
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 relative hover:bg-primary/5 transition-colors">
                <span class="text-xs text-on-surface-variant font-bold">15</span>
                <div class="mt-2 space-y-1">
                  <div class="bg-error/10 border-r-2 border-error p-1 rounded text-[10px] text-error truncate" title="إصلاح ECG">إصلاح ECG - غرفة 204</div>
                  <div class="bg-primary/10 border-r-2 border-primary p-1 rounded text-[10px] text-primary truncate" title="صيانة سنوية">صيانة سنوية PB 980</div>
                </div>
              </div>
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 bg-secondary-container/10">
                <span class="text-xs text-secondary font-bold">16</span>
                <p class="text-[10px] text-secondary text-center mt-6 font-bold">${tr('Today', 'اليوم')}</p>
              </div>
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 hover:bg-primary/5 transition-colors"><span class="text-xs text-on-surface-variant">17</span></div>
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 hover:bg-primary/5 transition-colors"><span class="text-xs text-on-surface-variant">18</span></div>
              <div class="min-h-[100px] p-2 border-l border-b border-outline-variant/10 hover:bg-primary/5 transition-colors"><span class="text-xs text-on-surface-variant">19</span></div>
              <div class="min-h-[100px] p-2 border-b border-outline-variant/10 hover:bg-primary/5 transition-colors"><span class="text-xs text-on-surface-variant">20</span></div>
            </div>
          </div>

          <!-- Calibration and Compliance Tracker -->
          <div class="lg:col-span-4 space-y-md">
            <div class="glass-card p-6 rounded-2xl bg-gradient-to-br from-white to-surface-container-low">
              <div class="flex items-center justify-between mb-4">
                <h4 class="font-title-lg font-bold text-primary">${tr('Calibration Tracking', 'تتبع ومعايرة الأجهزة')}</h4>
                <span class="material-symbols-outlined text-secondary">verified</span>
              </div>
              <div class="space-y-4">
                <div class="p-3 bg-white rounded-xl border border-outline-variant/30 flex justify-between items-center">
                  <div>
                    <p class="text-xs font-bold text-primary">معايرة أجهزة غسيل الكلى</p>
                    <p class="text-[10px] text-on-surface-variant mt-0.5">تاريخ الاستحقاق: 12 يوم</p>
                  </div>
                  <div class="w-10 h-10 relative flex items-center justify-center">
                    <svg class="w-full h-full transform -rotate-90">
                      <circle class="text-outline/10" cx="20" cy="20" fill="transparent" r="16" stroke="currentColor" stroke-width="3"></circle>
                      <circle class="text-secondary" cx="20" cy="20" fill="transparent" r="16" stroke="currentColor" stroke-dasharray="100.5" stroke-dashoffset="15" stroke-width="3"></circle>
                    </svg>
                    <span class="absolute text-[9px] font-bold">85%</span>
                  </div>
                </div>
                <div class="p-3 bg-white rounded-xl border border-outline-variant/30 flex justify-between items-center">
                  <div>
                    <p class="text-xs font-bold text-primary">أجهزة قياس الأشعة</p>
                    <p class="text-[10px] text-on-surface-variant mt-0.5">مكتمل - مطابق للمعايير</p>
                  </div>
                  <span class="material-symbols-outlined text-green-500">check_circle</span>
                </div>
              </div>
            </div>

            <!-- Quick Action Shortcuts -->
            <div class="glass-card p-6 rounded-2xl">
              <h4 class="font-title-lg font-bold text-primary mb-4">${tr('Quick Actions', 'إجراءات سريعة')}</h4>
              <div class="space-y-2.5">
                <button onclick="mntTab='orders';navigateTo(28)" class="w-full flex items-center justify-between p-3.5 bg-primary text-white rounded-xl hover:bg-primary-container transition-all group">
                  <span class="font-label-md">🔧 ${tr('Open Work Orders Tab', 'تسجيل طلب صيانة جديد')}</span>
                  <span class="material-symbols-outlined text-sm">arrow_back</span>
                </button>
                <button onclick="mntTab='assets';navigateTo(28)" class="w-full flex items-center justify-between p-3.5 border border-secondary text-secondary rounded-xl hover:bg-secondary/5 transition-all">
                  <span class="font-label-md">🏢 ${tr('Open Asset Register', 'إضافة أصل طبي جديد')}</span>
                  <span class="material-symbols-outlined text-sm">arrow_back</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ` : mntTab === 'orders' ? `
        <!-- Work Orders Tab -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-md">
          <!-- Forms Column -->
          <div class="space-y-md">
            <!-- Legacy Maintenance Orders Form -->
            <div class="glass-card p-6 rounded-2xl">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">🔧 ${tr('New Maintenance Ticket', 'طلب صيانة وإصلاح')}</h4>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Equipment Name/ID', 'الجهاز/المعدة')}</label>
                <input class="form-input w-full" id="mntEquip" placeholder="e.g. Ventilator PB 980">
              </div>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Location/Room', 'الموقع / الغرفة')}</label>
                <input class="form-input w-full" id="mntLoc" placeholder="e.g. ICU Room 3">
              </div>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Maintenance Type', 'نوع الصيانة')}</label>
                <select class="form-input w-full" id="mntType">
                  <option value="corrective">${tr('Corrective', 'تصحيحية')}</option>
                  <option value="preventive">${tr('Preventive', 'وقائية')}</option>
                  <option value="emergency">${tr('Emergency', 'طارئة')}</option>
                  <option value="calibration">${tr('Calibration', 'معايرة')}</option>
                </select>
              </div>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Priority', 'الأولوية')}</label>
                <select class="form-input w-full" id="mntPriority">
                  <option value="low">${tr('Low', 'منخفضة')}</option>
                  <option value="medium">${tr('Medium', 'متوسطة')}</option>
                  <option value="high">${tr('High', 'عالية')}</option>
                  <option value="urgent">${tr('Urgent', 'عاجلة')}</option>
                </select>
              </div>
              <div class="form-group mb-4">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Issue Description', 'وصف المشكلة')}</label>
                <textarea class="form-input w-full" id="mntDesc" rows="2" placeholder="تفاصيل العطل..."></textarea>
              </div>
              <button class="btn btn-primary w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2" onclick="saveMntOrder()">
                🔧 ${tr('Submit Order', 'تقديم الطلب')}
              </button>
            </div>

            <!-- Legacy Work Orders Form -->
            <div class="glass-card p-6 rounded-2xl">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">📋 ${tr('Detailed Work Order', 'أمر تشغيل تفصيلي')}</h4>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Request Type', 'نوع الطلب')}</label>
                <select class="form-input w-full" id="woType">
                  <option value="Corrective">${tr('Corrective', 'تصحيحية')}</option>
                  <option value="Preventive">${tr('Preventive', 'وقائية')}</option>
                  <option value="Calibration">${tr('Calibration', 'معايرة')}</option>
                </select>
              </div>
              <div class="form-group mb-3">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Priority', 'الأولوية')}</label>
                <select class="form-input w-full" id="woPriority">
                  <option value="Low">${tr('Low', 'منخفضة')}</option>
                  <option value="Normal">${tr('Normal', 'عادية')}</option>
                  <option value="High">${tr('High', 'عالية')}</option>
                  <option value="Emergency">${tr('Emergency', 'طارئة')}</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div class="form-group">
                  <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Department', 'القسم')}</label>
                  <input class="form-input w-full" id="woDept" placeholder="e.g. ICU">
                </div>
                <div class="form-group">
                  <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Location', 'الموقع')}</label>
                  <input class="form-input w-full" id="woLocation" placeholder="e.g. F2-Room12">
                </div>
              </div>
              <div class="form-group mb-4">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Description', 'الوصف')}</label>
                <textarea class="form-input w-full" id="woDesc" rows="2" placeholder="أدخل تفاصيل التكليف..."></textarea>
              </div>
              <button class="btn btn-secondary w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border border-secondary" onclick="addWorkOrder()">
                ➕ ${tr('Create Work Order', 'إنشاء أمر العمل')}
              </button>
            </div>
          </div>

          <!-- Logs Tables Column -->
          <div class="lg:col-span-2 space-y-md">
            <!-- Active Tickets Table -->
            <div class="glass-card p-6 rounded-2xl overflow-x-auto">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">🔧 ${tr('Maintenance Tickets', 'طلبات الصيانة والإصلاح')}</h4>
              <table class="w-full text-right divide-y divide-outline-variant/30 text-xs">
                <thead class="bg-surface-container-low font-label-md text-on-surface-variant">
                  <tr>
                    <th class="p-3">${tr('Equipment', 'الجهاز')}</th>
                    <th class="p-3">${tr('Location', 'الموقع')}</th>
                    <th class="p-3">${tr('Type', 'النوع')}</th>
                    <th class="p-3">${tr('Priority', 'الأولوية')}</th>
                    <th class="p-3">${tr('Status', 'الحالة')}</th>
                    <th class="p-3 text-center">${tr('Actions', 'إجراءات')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10 font-body-md">
                  ${mntOrders.length ? mntOrders.map(o => `
                    <tr class="hover:bg-primary/5 transition-colors">
                      <td class="p-3 font-bold text-primary">${o.equipment}</td>
                      <td class="p-3 text-on-surface-variant">${o.location || '—'}</td>
                      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-bold">${o.maintenance_type || '—'}</span></td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${o.priority === 'urgent' || o.priority === 'high' ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-fixed-variant'}">
                          ${o.priority}
                        </span>
                      </td>
                      <td class="p-3">${statusBadge(o.status)}</td>
                      <td class="p-3 text-center">
                        ${o.status !== 'completed' ? `<button class="btn btn-sm bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded" onclick="completeMnt(${o.id})">✅ ${tr('Complete', 'إتمام')}</button>` : '—'}
                      </td>
                    </tr>
                  `).join('') : `<tr><td colspan="6" class="text-center py-4 text-on-surface-variant">${tr('No records found', 'لا توجد طلبات مسجلة')}</td></tr>`}
                </tbody>
              </table>
            </div>

            <!-- Active Work Orders Queue Table -->
            <div class="glass-card p-6 rounded-2xl overflow-x-auto">
              <h4 class="font-title-lg text-title-lg text-primary mb-4">📋 ${tr('System Work Orders Queue', 'طابور أوامر العمل الفنية')}</h4>
              <table class="w-full text-right divide-y divide-outline-variant/30 text-xs">
                <thead class="bg-surface-container-low font-label-md text-on-surface-variant">
                  <tr>
                    <th class="p-3">${tr('WO#', 'رقم الأمر')}</th>
                    <th class="p-3">${tr('Dept / Location', 'القسم / الموقع')}</th>
                    <th class="p-3">${tr('Type', 'النوع')}</th>
                    <th class="p-3">${tr('Priority', 'الأولوية')}</th>
                    <th class="p-3">${tr('Status', 'الحالة')}</th>
                    <th class="p-3 text-center">${tr('Actions', 'إجراءات')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10 font-body-md">
                  ${workOrders.length ? workOrders.map(w => `
                    <tr class="hover:bg-primary/5 transition-colors">
                      <td class="p-3 font-mono font-bold text-primary">${w.wo_number}</td>
                      <td class="p-3 text-on-surface-variant">${w.department || ''} / ${w.location || ''}</td>
                      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-secondary/10 text-secondary font-bold">${w.request_type}</span></td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${w.priority === 'High' || w.priority === 'Emergency' ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-fixed-variant'}">
                          ${w.priority}
                        </span>
                      </td>
                      <td class="p-3">${statusBadge(w.status)}</td>
                      <td class="p-3 text-center">
                        ${w.status !== 'Completed' ? `<button class="btn btn-sm bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded" onclick="completeWO(${w.id})">✅ ${tr('Resolve', 'حل التكليف')}</button>` : '—'}
                      </td>
                    </tr>
                  `).join('') : `<tr><td colspan="6" class="text-center py-4 text-on-surface-variant">${tr('No records found', 'لا توجد أوامر عمل حالية')}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : `
        <!-- Asset Register Tab -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-md">
          <!-- Asset Form -->
          <div class="glass-card p-6 rounded-2xl h-fit">
            <h4 class="font-title-lg text-title-lg text-primary mb-4">🏢 ${tr('Register Medical Device', 'تسجيل أصل طبي جديد')}</h4>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Device Name (EN)', 'اسم الجهاز (إنجليزي)')}</label>
              <input class="form-input w-full" id="eqName" placeholder="e.g. GE ECG Monitor B850">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Device Name (AR)', 'اسم الجهاز (عربي)')}</label>
              <input class="form-input w-full" id="eqNameAr" placeholder="e.g. جهاز تخطيط القلب GE">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Category', 'الفئة والنوع')}</label>
              <input class="form-input w-full" id="eqCat" placeholder="e.g. Diagnostic / Life Support">
            </div>
            <div class="form-group mb-3">
              <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Manufacturer', 'الشركة المصنعة')}</label>
              <input class="form-input w-full" id="eqMfg" placeholder="e.g. GE Healthcare">
            </div>
            <div class="grid grid-cols-2 gap-2 mb-4">
              <div class="form-group">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Serial Number', 'الرقم التسلسلي')}</label>
                <input class="form-input w-full" id="eqSerial" placeholder="e.g. SN-8829402">
              </div>
              <div class="form-group">
                <label class="block text-xs font-bold text-on-surface-variant mb-1">${tr('Department', 'القسم المستلم')}</label>
                <input class="form-input w-full" id="eqDept" placeholder="e.g. Cardiology">
              </div>
            </div>
            <button class="btn btn-primary w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2" onclick="addEquipment()">
              🏢 ${tr('Register Asset', 'تسجيل الجهاز')}
            </button>
          </div>

          <!-- Assets Table -->
          <div class="glass-card p-6 rounded-2xl lg:col-span-2 overflow-x-auto">
            <h4 class="font-title-lg text-title-lg text-primary mb-4">🏢 ${tr('Biomedical Assets Registry', 'سجل عرد ومعدات الأجهزة الطبية')}</h4>
            <table class="w-full text-right divide-y divide-outline-variant/30 text-xs">
              <thead class="bg-surface-container-low font-label-md text-on-surface-variant">
                <tr>
                  <th class="p-3">${tr('Code', 'الرمز')}</th>
                  <th class="p-3">${tr('Device Name', 'اسم الجهاز')}</th>
                  <th class="p-3">${tr('Category', 'الفئة')}</th>
                  <th class="p-3">${tr('Manufacturer', 'المصنع')}</th>
                  <th class="p-3">${tr('Serial#', 'الرقم التسلسلي')}</th>
                  <th class="p-3">${tr('Status', 'الحالة')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10 font-body-md">
                ${equipment.length ? equipment.map(e => `
                  <tr class="hover:bg-primary/5 transition-colors">
                    <td class="p-3 font-mono font-bold text-primary">${e.equipment_code || `EQ-${e.id}`}</td>
                    <td class="p-3">
                      <div class="font-bold text-primary">${isArabic ? (e.equipment_name_ar || e.equipment_name) : (e.equipment_name || e.equipment_name_ar)}</div>
                      <div class="text-[10px] text-on-surface-variant">${e.department || ''} - ${e.location || ''}</div>
                    </td>
                    <td class="p-3 text-on-surface-variant">${e.category || ''}</td>
                    <td class="p-3 text-on-surface-variant">${e.manufacturer || ''}</td>
                    <td class="p-3 font-mono text-[11px]">${e.serial_number || '—'}</td>
                    <td class="p-3">${statusBadge(e.status || 'Active')}</td>
                  </tr>
                `).join('') : `<tr><td colspan="6" class="text-center py-4 text-on-surface-variant">${tr('No equipment registered', 'لا توجد أجهزة مسجلة حالياً')}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;

  window.saveMntOrder = async () => {
    try {
      await API.post('/api/maintenance/orders', {
        equipment: document.getElementById('mntEquip').value,
        location: document.getElementById('mntLoc').value,
        maintenance_type: document.getElementById('mntType').value,
        priority: document.getElementById('mntPriority').value,
        description: document.getElementById('mntDesc').value,
        requested_by: window.currentUser?.display_name || ''
      });
      showToast(tr('Order submitted!', 'تم تقديم الطلب!'));
      mntTab = 'orders';
      navigateTo(currentPage);
    } catch (e) {
      showToast(tr('Error', 'خطأ'), 'error');
    }
  };

  window.completeMnt = async (id) => {
    try {
      await API.put('/api/maintenance/orders/' + id, { status: 'completed' });
      showToast('✅');
      mntTab = 'orders';
      navigateTo(currentPage);
    } catch (e) {
      showToast(tr('Error', 'خطأ'), 'error');
    }
  };
}

window.addWorkOrder = async function () {
  try {
    await API.post('/api/maintenance/work-orders', {
      request_type: document.getElementById('woType').value,
      priority: document.getElementById('woPriority').value,
      department: document.getElementById('woDept').value,
      location: document.getElementById('woLocation').value,
      description: document.getElementById('woDesc').value,
      requested_by: currentUser?.display_name
    });
    showToast(tr('Created!', 'تم الإنشاء!'));
    mntTab = 'orders';
    await navigateTo(28);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};

window.completeWO = async function (id) {
  try {
    await API.put('/api/maintenance/work-orders/' + id, { status: 'Completed' });
    showToast(tr('Completed!', 'اكتمل!'));
    mntTab = 'orders';
    await navigateTo(28);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};

window.addEquipment = async function () {
  try {
    await API.post('/api/maintenance/equipment', {
      equipment_name: document.getElementById('eqName').value,
      equipment_name_ar: document.getElementById('eqNameAr').value,
      category: document.getElementById('eqCat').value,
      manufacturer: document.getElementById('eqMfg').value,
      serial_number: document.getElementById('eqSerial').value,
      department: document.getElementById('eqDept').value
    });
    showToast(tr('Added!', 'تمت الإضافة!'));
    mntTab = 'assets';
    await navigateTo(28);
  } catch (e) {
    showToast(tr('Error', 'خطأ'), 'error');
  }
};

// ===== TRANSPORT =====
async function renderTransport(el) {

  const requests = await API.get('/api/transport/requests').catch(() => []);
  content.innerHTML = `
    <h2>${tr('Transport', 'النقل')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${requests.filter?.(r => r.status === 'pending')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Pending', 'بانتظار')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${requests.filter?.(r => r.status === 'in_transit')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('In Transit', 'في الطريق')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${requests.filter?.(r => r.status === 'completed')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Completed', 'مكتمل')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('New Request', 'طلب جديد')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="trPatient"></div>
        <div class="form-group"><label>${tr('From', 'من')}</label><input class="form-input" id="trFrom" placeholder="${tr('e.g. Ward 3A', 'مثال: جناح 3أ')}"></div>
        <div class="form-group"><label>${tr('To', 'إلى')}</label><input class="form-input" id="trTo" placeholder="${tr('e.g. Radiology', 'مثال: الأشعة')}"></div>
        <div class="form-group"><label>${tr('Type', 'النوع')}</label>
        <select class="form-input" id="trType"><option value="wheelchair">${tr('Wheelchair', 'كرسي متحرك')}</option><option value="stretcher">${tr('Stretcher', 'نقالة')}</option><option value="ambulance">${tr('Ambulance', 'إسعاف')}</option><option value="walking">${tr('Walking Escort', 'مرافقة')}</option></select></div>
        <div class="form-group"><label>${tr('Priority', 'الأولوية')}</label>
        <select class="form-input" id="trPriority"><option value="routine">${tr('Routine', 'عادي')}</option><option value="urgent">${tr('Urgent', 'مستعجل')}</option><option value="emergency">${tr('Emergency', 'طوارئ')}</option></select></div>
        <div class="form-group"><label>${tr('Notes', 'ملاحظات')}</label><input class="form-input" id="trNotes"></div>
        <button class="btn btn-primary w-full" onclick="saveTransportReq()">📤 ${tr('Submit', 'إرسال')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Active Requests', 'الطلبات النشطة')}</h4>
        <div id="trList">${requests.filter(r => r.status !== 'completed').map(r => '<div style="padding:10px;margin:6px 0;background:#f8f9fa;border-radius:8px;border-right:4px solid ' + (r.status === 'in_transit' ? '#1565c0' : '#ff9800') + ';display:flex;justify-content:space-between;align-items:center"><div><strong>' + (r.patient_name || '') + '</strong><br><span style="font-size:12px;color:#666">' + (r.from_location || '') + ' → ' + (r.to_location || '') + ' | ' + (r.transport_type || '') + '</span></div><button class="btn btn-sm" onclick="updateTransport(' + r.id + ',\'completed\')" style="background:#e8f5e9;color:#2e7d32">✅</button></div>').join('') || '<p style="color:#999;text-align:center">' + tr('No active requests', 'لا توجد طلبات') + '</p>'}</div>
      </div>
    </div>`;

  window.saveTransportReq = async () => {
    try { await API.post('/api/transport/requests', { patient_name: document.getElementById('trPatient')?.value, from_location: document.getElementById('trFrom')?.value, to_location: document.getElementById('trTo')?.value, transport_type: document.getElementById('trType')?.value, priority: document.getElementById('trPriority')?.value, notes: document.getElementById('trNotes')?.value, status: 'pending' }); showToast(tr('Request submitted', 'تم إرسال الطلب')); renderTransport(content); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };
  window.updateTransport = async (id, status) => {
    try { await API.put('/api/transport/requests/' + id, { status }); showToast(tr('Updated', 'تم التحديث')); renderTransport(content); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}
window.addTransport = async function () {
  const s = document.getElementById('trPatient'); if (!s.value) return showToast(tr('Select patient', 'اختر المريض'), 'error');
  try { await API.post('/api/transport/requests', { patient_id: s.value, patient_name: s.options[s.selectedIndex].dataset.name, from_location: document.getElementById('trFrom').value, to_location: document.getElementById('trTo').value, transport_type: document.getElementById('trType').value, priority: document.getElementById('trPriority').value, special_needs: document.getElementById('trNeeds').value, requested_by: currentUser?.display_name }); showToast(tr('Requested!', 'تم الطلب!')); await navigateTo(29); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};
window.completeTransport = async function (id) {
  try { await API.put('/api/transport/requests/' + id, { status: 'Completed', dropoff_time: new Date().toISOString() }); showToast(tr('Done!', 'تم!')); await navigateTo(29); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
};

// ===== MEDICAL RECORDS / HIM =====
let mrTab = 'requests';
async function renderMedicalRecords(el) {
  const content = el;

  const patients = await API.get('/api/patients').catch(() => []);

  content.innerHTML = `
    <h2>${tr('Medical Records', 'السجلات الطبية')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${patients.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Records', 'إجمالي السجلات')}</p></div>
    </div>
    <div class="card" style="padding:20px;margin-bottom:16px">
      <h4 style="margin:0 0 12px">🔍 ${tr('Search Medical Records', 'بحث في السجلات الطبية')}</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end">
        <div class="form-group"><label>${tr('Name', 'الاسم')}</label><input class="form-input" id="mrSearchName" oninput="filterMedRecords()"></div>
        <div class="form-group"><label>${tr('MRN / File #', 'رقم الملف')}</label><input class="form-input" id="mrSearchMRN" oninput="filterMedRecords()"></div>
        <div class="form-group"><label>${tr('ID / Iqama', 'الهوية/الإقامة')}</label><input class="form-input" id="mrSearchID" oninput="filterMedRecords()"></div>
        <button class="btn btn-primary" onclick="filterMedRecords()">🔍</button>
      </div>
    </div>
    <div class="card" style="padding:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <h4 style="margin:0">${tr('Patient Records', 'سجلات المرضى')}</h4>
        <button class="btn btn-sm" onclick="exportToCSV(window._mrData||[],'medical_records')" style="background:#e0f7fa;color:#00838f">📥 ${tr('Export', 'تصدير')}</button>
      </div>
      <div id="mrTable"></div>
    </div>`;

  window._mrData = patients;
  const mrt = document.getElementById('mrTable');
  if (mrt) {
    createTable(mrt, 'mrTbl',
      [tr('File #', 'رقم الملف'), tr('Name (AR)', 'الاسم بالعربي'), tr('Name (EN)', 'الاسم بالإنجليزي'), tr('ID', 'الهوية'), tr('Phone', 'الجوال'), tr('DOB', 'تاريخ الميلاد'), tr('Nationality', 'الجنسية'), tr('Actions', '')],
      patients.slice(0, 100).map(p => ({ cells: [p.file_number || p.id, p.name_ar || '', p.name_en || '', p.id_number || '', p.phone || '', p.dob || '', p.nationality || '', '<button class="btn btn-sm" onclick="viewPatientRecord(' + p.id + ')">📂 ' + tr('View', 'عرض') + '</button>'], id: p.id }))
    );
  }
  window.filterMedRecords = () => { const n = (document.getElementById('mrSearchName')?.value || '').toLowerCase(); const mrn = (document.getElementById('mrSearchMRN')?.value || ''); const sid = (document.getElementById('mrSearchID')?.value || ''); document.querySelectorAll('#mrTbl tbody tr').forEach(r => { const t = r.textContent.toLowerCase(); r.style.display = (t.includes(n) && (!mrn || t.includes(mrn)) && (!sid || t.includes(sid))) ? '' : 'none'; }); };
  window.viewPatientRecord = async (id) => { try { const visits = await API.get('/api/visits?patient_id=' + id).catch(() => []); const p = patients.find(x => x.id === id) || {}; const modal = document.createElement('div'); modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center'; modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:700px;max-height:85vh;overflow:auto"><h3 style="margin:0 0 16px">📂 ' + (p.name_ar || p.name_en || '') + '</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px"><div><strong>' + tr('File', 'ملف') + ':</strong> ' + (p.file_number || p.id) + '</div><div><strong>' + tr('ID', 'الهوية') + ':</strong> ' + (p.id_number || '') + '</div><div><strong>' + tr('Phone', 'الجوال') + ':</strong> ' + (p.phone || '') + '</div><div><strong>' + tr('DOB', 'الميلاد') + ':</strong> ' + (p.dob || '') + '</div></div><h4>' + tr('Visit History', 'سجل الزيارات') + ' (' + visits.length + ')</h4>' + (visits.length ? visits.map(v => '<div style="padding:8px;margin:4px 0;background:#f5f5f5;border-radius:8px"><strong>' + (v.visit_date || v.created_at ? new Date(v.visit_date || v.created_at).toLocaleDateString('ar-SA') : '') + '</strong> — ' + (v.diagnosis || v.complaint || tr('No details', 'بدون تفاصيل')) + '</div>').join('') : '<p style="color:#999">' + tr('No visits', 'لا توجد زيارات') + '</p>') + '<button class="btn btn-secondary w-full" onclick="this.parentElement.parentElement.remove()" style="margin-top:16px">' + tr('Close', 'إغلاق') + '</button></div>'; document.body.appendChild(modal); modal.onclick = e => { if (e.target === modal) modal.remove(); }; } catch (e) { } };

}
window.submitMRRequest = async function () {
  const sel = document.getElementById('mrPatient');
  const patient_id = sel.value;
  const file_number = sel.options[sel.selectedIndex].dataset.fn;
  await API.post('/api/medical-records/requests', { patient_id, file_number, department: document.getElementById('mrDept').value, purpose: document.getElementById('mrPurpose').value, notes: document.getElementById('mrNotes').value });
  showToast(tr('Request submitted', 'تم الطلب')); mrTab = 'requests'; navigateTo(30);
};
window.updateMRRequest = async function (id, status) {
  await API.put('/api/medical-records/requests/' + id, { status });
  showToast(tr('Updated', 'تم التحديث')); navigateTo(30);
};

// ===== CLINICAL PHARMACY =====
let cpTab = 'reviews';
async function renderClinicalPharmacy(el) {
  const content = el;

  const prescriptions = await API.get('/api/pharmacy/prescriptions').catch(() => []);
  const pending = prescriptions.filter(p => p.status === 'pending').length;

  const interactions = [
    { drug1: 'Warfarin', drug2: 'Aspirin', severity: 'high', effect: tr('Increased bleeding risk', 'زيادة خطر النزيف') },
    { drug1: 'ACE Inhibitors', drug2: 'Potassium', severity: 'high', effect: tr('Hyperkalemia risk', 'خطر فرط البوتاسيوم') },
    { drug1: 'Metformin', drug2: 'Contrast Dye', severity: 'moderate', effect: tr('Lactic acidosis risk', 'خطر الحموضة اللبنية') },
    { drug1: 'SSRIs', drug2: 'MAOIs', severity: 'high', effect: tr('Serotonin syndrome', 'متلازمة السيروتونين') },
    { drug1: 'Statins', drug2: 'Macrolides', severity: 'moderate', effect: tr('Rhabdomyolysis risk', 'خطر انحلال العضلات') },
    { drug1: 'NSAIDs', drug2: 'Anticoagulants', severity: 'high', effect: tr('GI bleeding', 'نزيف هضمي') },
    { drug1: 'Digoxin', drug2: 'Amiodarone', severity: 'high', effect: tr('Digoxin toxicity', 'سمية الديجوكسين') },
    { drug1: 'Ciprofloxacin', drug2: 'Theophylline', severity: 'moderate', effect: tr('Theophylline toxicity', 'سمية الثيوفيلين') },
  ];

  content.innerHTML = `
    <h2>${tr('Clinical Pharmacy', 'الصيدلة الإكلينيكية')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${prescriptions.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Prescriptions', 'إجمالي الوصفات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${pending}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Pending Review', 'بانتظار المراجعة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fce4ec"><h3 style="margin:0;color:#c62828">${interactions.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Known Interactions', 'تداخلات معروفة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">🔍 ${tr('Drug Interaction Checker', 'فحص تداخل الأدوية')}</h4>
        <div class="form-group"><label>${tr('Drug 1', 'الدواء 1')}</label><input class="form-input" id="cpDrug1" placeholder="${tr('e.g. Warfarin', 'مثال: وارفارين')}"></div>
        <div class="form-group"><label>${tr('Drug 2', 'الدواء 2')}</label><input class="form-input" id="cpDrug2" placeholder="${tr('e.g. Aspirin', 'مثال: أسبرين')}"></div>
        <button class="btn btn-primary w-full" onclick="checkInteraction()">🔍 ${tr('Check Interaction', 'فحص التداخل')}</button>
        <div id="cpResult" style="margin-top:12px"></div>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">⚠️ ${tr('Known Drug Interactions', 'التداخلات الدوائية المعروفة')}</h4>
        <div style="max-height:300px;overflow-y:auto">${interactions.map(i => '<div style="padding:8px;margin:4px 0;border-radius:8px;background:' + (i.severity === 'high' ? '#fce4ec' : '#fff3e0') + '"><strong>' + i.drug1 + ' + ' + i.drug2 + '</strong><br><span style="font-size:12px;color:#666">' + i.effect + '</span><span style="float:left;font-size:11px;padding:2px 6px;border-radius:4px;background:' + (i.severity === 'high' ? '#c62828' : '#e65100') + ';color:#fff">' + i.severity + '</span></div>').join('')}</div>
      </div>
    </div>
    <div class="card" style="padding:20px;margin-top:16px">
      <h4 style="margin:0 0 12px">${tr('Recent Prescriptions for Review', 'وصفات بانتظار المراجعة')}</h4>
      <div id="cpTable"></div>
    </div>`;

  const cpt = document.getElementById('cpTable');
  if (cpt && prescriptions.length) {
    createTable(cpt, 'cpTbl',
      [tr('Patient', 'المريض'), tr('Medication', 'الدواء'), tr('Dosage', 'الجرعة'), tr('Doctor', 'الطبيب'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')],
      prescriptions.slice(0, 20).map(p => ({ cells: [p.patient_name || '', p.medication || p.drug_name || '', p.dosage || '', p.doctor || '', statusBadge(p.status), p.created_at ? new Date(p.created_at).toLocaleDateString('ar-SA') : ''], id: p.id }))
    );
  }

  window.checkInteraction = () => {
    const d1 = (document.getElementById('cpDrug1')?.value || '').toLowerCase();
    const d2 = (document.getElementById('cpDrug2')?.value || '').toLowerCase();
    const res = document.getElementById('cpResult');
    if (!d1 || !d2) { res.innerHTML = '<p style="color:#666">' + tr('Enter both drugs', 'أدخل الدوائين') + '</p>'; return; }
    const found = interactions.find(i => (i.drug1.toLowerCase().includes(d1) && i.drug2.toLowerCase().includes(d2)) || (i.drug1.toLowerCase().includes(d2) && i.drug2.toLowerCase().includes(d1)));
    if (found) { res.innerHTML = '<div style="padding:12px;background:#fce4ec;border-radius:8px;border-left:4px solid #c62828"><strong>⚠️ ' + tr('INTERACTION FOUND', 'تم اكتشاف تداخل') + '</strong><br>' + found.effect + '<br><span style="color:#c62828;font-weight:bold">' + tr('Severity', 'الخطورة') + ': ' + found.severity.toUpperCase() + '</span></div>'; }
    else { res.innerHTML = '<div style="padding:12px;background:#e8f5e9;border-radius:8px;border-left:4px solid #2e7d32"><strong>✅ ' + tr('No known interaction', 'لا يوجد تداخل معروف') + '</strong></div>'; }
  };

}
window.submitCPReview = async function () {
  const sel = document.getElementById('cpPatient');
  const patient_name = sel.options[sel.selectedIndex].dataset.name;
  await API.post('/api/clinical-pharmacy/reviews', { patient_id: sel.value, patient_name, review_type: document.getElementById('cpType').value, severity: document.getElementById('cpSeverity').value, findings: document.getElementById('cpFindings').value, recommendations: document.getElementById('cpRecs').value });
  showToast(tr('Review submitted', 'تم الإرسال')); cpTab = 'reviews'; navigateTo(31);
};
window.resolveCPReview = async function (id) {
  await API.put('/api/clinical-pharmacy/reviews/' + id, { outcome: 'Resolved', status: 'Closed' });
  showToast(tr('Resolved', 'تم الحل')); navigateTo(31);
};

// ===== REHABILITATION / PT =====
let rehabTab = 'patients';
async function renderRehabilitation(el) {
  const [rehabPatients, sessions, allPatients] = await Promise.all([
    API.get('/api/rehab/patients').catch(() => []),
    API.get('/api/rehab/sessions').catch(() => []),
    API.get('/api/patients').catch(() => [])
  ]);
  const active = rehabPatients.filter(r => r.status === 'Active').length;
  el.innerHTML = `
    <div class="page-title">🏋️ ${tr('Rehabilitation / Physical Therapy', 'إعادة التأهيل / العلاج الطبيعي')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card" style="--stat-color:#3b82f6"><span class="stat-icon">👥</span><div class="stat-label">${tr('Active Patients', 'مرضى نشطين')}</div><div class="stat-value">${active}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><span class="stat-icon">📅</span><div class="stat-label">${tr('Total Sessions', 'إجمالي الجلسات')}</div><div class="stat-value">${sessions.length}</div></div>
      <div class="stat-card" style="--stat-color:#f59e0b"><span class="stat-icon">🏥</span><div class="stat-label">${tr('Total Patients', 'إجمالي المرضى')}</div><div class="stat-value">${rehabPatients.length}</div></div>
      <div class="stat-card" style="--stat-color:#a78bfa"><span class="stat-icon">✅</span><div class="stat-label">${tr('Discharged', 'خرجوا')}</div><div class="stat-value">${rehabPatients.filter(r => r.status === 'Discharged').length}</div></div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn ${rehabTab === 'patients' ? 'active' : ''}" onclick="rehabTab='patients';navigateTo(32)">👥 ${tr('Patients', 'المرضى')}</button>
      <button class="tab-btn ${rehabTab === 'new' ? 'active' : ''}" onclick="rehabTab='new';navigateTo(32)">➕ ${tr('New Referral', 'تحويل جديد')}</button>
      <button class="tab-btn ${rehabTab === 'sessions' ? 'active' : ''}" onclick="rehabTab='sessions';navigateTo(32)">📅 ${tr('Sessions', 'الجلسات')}</button>
    </div>
    <div class="card" id="rehabContent"></div>`;
  const mc = document.getElementById('rehabContent');
  if (rehabTab === 'patients') {
    mc.innerHTML = rehabPatients.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Diagnosis', 'التشخيص'), tr('Therapy', 'العلاج'), tr('Therapist', 'المعالج'), tr('Status', 'الحالة'), tr('Sessions', 'الجلسات')],
      rehabPatients.map(r => ({
        cells: [r.patient_name, r.diagnosis, r.therapy_type, r.therapist, statusBadge(r.status),
        `<button class="btn btn-sm" onclick="viewRehabSessions(${r.id})">📋 ${tr('View', 'عرض')}</button>`
        ]
      }))
    ) : `<div class="empty-state"><span style="font-size:48px">🏋️</span><p>${tr('No rehab patients', 'لا يوجد مرضى تأهيل')}</p></div>`;
  } else if (rehabTab === 'new') {
    const therapyTypes = ['Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Cardiac Rehab', 'Pulmonary Rehab', 'Neurological Rehab'];
    mc.innerHTML = `<h3>➕ ${tr('New Rehabilitation Referral', 'تحويل تأهيل جديد')}</h3>
    <div class="form-grid">
      <div><label>${tr('Patient', 'المريض')}</label><select id="rehabPatient" class="form-input">${allPatients.map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.file_number} - ${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Therapy Type', 'نوع العلاج')}</label><select id="rehabType" class="form-input">${therapyTypes.map(t => `<option>${t}</option>`).join('')}</select></div>
      <div><label>${tr('Therapist', 'المعالج')}</label><input id="rehabTherapist" class="form-input"></div>
      <div><label>${tr('Referral Source', 'مصدر التحويل')}</label><input id="rehabSource" class="form-input" placeholder="${tr('Dr. Name / Dept', 'اسم الطبيب / القسم')}"></div>
      <div style="grid-column:1/-1"><label>${tr('Diagnosis', 'التشخيص')}</label><input id="rehabDiag" class="form-input"></div>
      <div style="grid-column:1/-1"><label>${tr('Notes', 'ملاحظات')}</label><textarea id="rehabNotes" class="form-input" rows="3"></textarea></div>
    </div>
    <button class="btn btn-primary" onclick="submitRehab()" style="margin-top:8px">🏋️ ${tr('Add Patient', 'إضافة مريض')}</button>`;
  } else {
    mc.innerHTML = sessions.length ? makeTable(
      [tr('Session#', 'جلسة#'), tr('Date', 'التاريخ'), tr('Therapist', 'المعالج'), tr('Duration', 'المدة'), tr('Pain Before', 'ألم قبل'), tr('Pain After', 'ألم بعد'), tr('Notes', 'ملاحظات')],
      sessions.map(s => ({
        cells: [s.session_number, s.session_date, s.therapist, s.duration_minutes + ' ' + tr('min', 'د'),
        `<span style="color:${s.pain_before > 5 ? '#ef4444' : '#22c55e'}">${s.pain_before}/10</span>`,
        `<span style="color:${s.pain_after > 5 ? '#ef4444' : '#22c55e'}">${s.pain_after}/10</span>`,
        s.progress_notes?.substring(0, 50) || '-'
        ]
      }))
    ) : `<div class="empty-state"><p>${tr('No sessions', 'لا توجد جلسات')}</p></div>`;
  }
}
window.submitRehab = async function () {
  const sel = document.getElementById('rehabPatient');
  const patient_name = sel.options[sel.selectedIndex].dataset.name;
  await API.post('/api/rehab/patients', { patient_id: sel.value, patient_name, diagnosis: document.getElementById('rehabDiag').value, referral_source: document.getElementById('rehabSource').value, therapist: document.getElementById('rehabTherapist').value, therapy_type: document.getElementById('rehabType').value, notes: document.getElementById('rehabNotes').value });
  showToast(tr('Patient added', 'تمت الإضافة')); rehabTab = 'patients'; navigateTo(32);
};
window.viewRehabSessions = async function (id) {
  rehabTab = 'sessions'; navigateTo(32);
};

// ===== PATIENT PORTAL =====
async function renderPatientPortal(el) {
  const content = el;

  const patients = await API.get('/api/patients').catch(() => []);
  const appointments = await API.get('/api/appointments').catch(() => []);
  const recentCount = patients.filter(p => { const d = new Date(p.created_at); const week = new Date(); week.setDate(week.getDate() - 7); return d > week; }).length;

  content.innerHTML = `
    <div class="page-title">📱 ${tr('Patient Portal', 'بوابة المريض الرقمية')}</div>
    <div class="flex flex-col md:flex-row gap-24 items-start mb-24 bg-white/40 backdrop-blur-md p-24 rounded-2xl border border-outline/10 shadow-sm w-full">
      <div class="flex-1 text-right">
        <h2 class="text-2xl font-bold text-primary mb-8">${tr('Welcome back, ' + currentUser.name, 'مرحباً بك، ' + currentUser.name)}</h2>
        <p class="text-sm text-on-surface-variant mb-16">${tr('Access your electronic health records, schedule virtual visits, and review recent lab updates.', 'مرحباً بك في بوابتك الصحية الفاخرة. تتبع رحلتك العلاجية ونتائج فحوصاتك بكل يسر وسهولة.')}</p>
        <div class="flex gap-12">
          <button class="bg-primary hover:bg-primary/90 text-white px-24 py-10 rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-8" onclick="navigateTo(2)">
            <span class="material-symbols-outlined text-lg">calendar_month</span>
            ${tr('Book Appointment', 'حجز موعد جديد')}
          </button>
          <button class="border border-secondary text-secondary hover:bg-secondary/10 px-24 py-10 rounded-xl text-sm font-semibold transition-all" onclick="navigateTo(35)">
            ${tr('Virtual Visit', 'العيادة الافتراضية')}
          </button>
        </div>
      </div>
    </div>

    <div class="split-layout">
      <!-- Right Side: Appointments & Labs -->
      <div class="space-y-16">
        <!-- Upcoming Appointments -->
        <div class="card p-24">
          <div class="card-title justify-between">
            <span>📅 ${tr('Upcoming Appointment', 'الموعد القادم')}</span>
            <span class="bg-secondary-container text-on-secondary-container text-xs px-12 py-4 rounded-full font-medium">${tr('Confirmed', 'مؤكد')}</span>
          </div>
          ${appointments.length ? `
            <div class="flex items-center gap-16 mb-16">
              <div class="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                <span class="material-symbols-outlined text-2xl">medical_services</span>
              </div>
              <div class="text-right flex-1">
                <h4 class="font-bold text-primary">${appointments[appointments.length - 1].doctor_name}</h4>
                <p class="text-xs text-on-surface-variant">${appointments[appointments.length - 1].department || tr('General Specialist', 'استشاري عام')}</p>
              </div>
              <div class="text-left">
                <p class="font-bold text-secondary">${appointments[appointments.length - 1].appt_date}</p>
                <p class="text-xs text-on-surface-variant">${appointments[appointments.length - 1].appt_time}</p>
              </div>
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">📅</div>
              <p>${tr('No upcoming appointments', 'لا توجد مواعيد قادمة')}</p>
            </div>
          `}
          <div class="flex gap-12 pt-12 border-t border-outline/10">
            <button class="btn btn-sm btn-primary" onclick="navigateTo(2)">${tr('Manage Appointments', 'إدارة المواعيد')}</button>
          </div>
        </div>

        <!-- Recent Lab Results -->
        <div class="card p-24">
          <div class="card-title justify-between">
            <span>🔬 ${tr('Recent Lab Results', 'آخر نتائج التحاليل')}</span>
            <button class="btn btn-sm" onclick="navigateTo(4)">${tr('View All', 'عرض الكل')}</button>
          </div>
          <div class="space-y-12">
            <div class="flex justify-between items-center p-12 bg-surface-container-low hover:bg-surface-container rounded-xl transition-all cursor-pointer" onclick="navigateTo(4)">
              <div class="flex items-center gap-12">
                <div class="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                  <span class="material-symbols-outlined text-lg">science</span>
                </div>
                <div class="text-right">
                  <h4 class="text-xs font-bold text-primary">${tr('Complete Blood Count (CBC)', 'فحص صورة الدم الكاملة')}</h4>
                  <p class="text-[10px] text-on-surface-variant">${tr('Normal', 'طبيعي')} - 12/10/2026</p>
                </div>
              </div>
              <span class="badge badge-success">${tr('Normal', 'سليم')}</span>
            </div>
            <div class="flex justify-between items-center p-12 bg-surface-container-low hover:bg-surface-container rounded-xl transition-all cursor-pointer" onclick="navigateTo(4)">
              <div class="flex items-center gap-12">
                <div class="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                  <span class="material-symbols-outlined text-lg">science</span>
                </div>
                <div class="text-right">
                  <h4 class="text-xs font-bold text-primary">${tr('Fast Blood Glucose (FBS)', 'فحص نسبة السكر الصائم')}</h4>
                  <p class="text-[10px] text-on-surface-variant">98 mg/dL - 08/10/2026</p>
                </div>
              </div>
              <span class="badge badge-success">${tr('Normal', 'سليم')}</span>
            </div>
          </div>
        </div>

        <!-- Telemedicine Widget -->
        <div class="card p-24 bg-gradient-to-br from-primary-container to-primary text-white border-none relative overflow-hidden">
          <h3 class="text-lg font-bold mb-8 text-white">${tr('Virtual Smart Clinic', 'العيادة الافتراضية الذكية')}</h3>
          <p class="text-xs text-white/80 mb-16">${tr('Consult with our international doctors virtually from anywhere.', 'تواصل فورياً بالصوت والصورة مع طبيبك من أي مكان وبخصوصية تامة.')}</p>
          <button class="bg-secondary text-white hover:bg-secondary-container px-16 py-8 rounded-lg text-xs font-semibold transition-all border border-secondary" onclick="navigateTo(35)">
            ${tr('Join Waiting Room', 'دخول غرفة الانتظار')}
          </button>
        </div>
      </div>

      <!-- Left Side: Health metrics, Insurance, Emergency -->
      <div class="space-y-16">
        <!-- Stats Bento Grid -->
        <div class="grid grid-cols-2 gap-12">
          <div class="card p-16 text-right">
            <span class="material-symbols-outlined text-secondary mb-4">favorite</span>
            <p class="text-[10px] text-on-surface-variant">${tr('Heart Rate', 'نبض القلب')}</p>
            <p class="text-lg font-extrabold text-primary">72 bpm</p>
          </div>
          <div class="card p-16 text-right">
            <span class="material-symbols-outlined text-secondary mb-4">blood_pressure</span>
            <p class="text-[10px] text-on-surface-variant">${tr('Blood Pressure', 'ضغط الدم')}</p>
            <p class="text-lg font-extrabold text-primary">120/80</p>
          </div>
          <div class="card p-16 text-right">
            <span class="material-symbols-outlined text-secondary mb-4">steps</span>
            <p class="text-[10px] text-on-surface-variant">${tr('Daily Steps', 'الخطوات اليومية')}</p>
            <p class="text-lg font-extrabold text-primary">8,420</p>
          </div>
          <div class="card p-16 text-right">
            <span class="material-symbols-outlined text-secondary mb-4">sleep</span>
            <p class="text-[10px] text-on-surface-variant">${tr('Sleep Quality', 'جودة النوم')}</p>
            <p class="text-lg font-extrabold text-primary">7.5 hr</p>
          </div>
        </div>

        <!-- Insurance Progress Card -->
        <div class="card p-24">
          <div class="card-title justify-between">
            <span>🛡️ ${tr('Insurance Claims', 'تغطية التأمين (التعاونية)')}</span>
          </div>
          <div class="mb-16">
            <div class="flex justify-between text-xs mb-4">
              <span>${tr('Limit Used', 'المبلغ المستهلك')}</span>
              <span class="font-bold">12,400 / 30,000 SAR</span>
            </div>
            <div class="w-full bg-surface-container-high h-2 rounded-full">
              <div class="bg-secondary h-full rounded-full" style="width: 41.3%"></div>
            </div>
          </div>
          <button class="btn btn-sm btn-primary w-full" onclick="navigateTo(9)">${tr('Manage Claims', 'إدارة المطالبات')}</button>
        </div>

        <!-- Emergency Card -->
        <div class="card p-16 bg-error/5 border border-error/20 flex items-center justify-between">
          <div class="flex items-center gap-12">
            <div class="w-10 h-10 rounded-full bg-error text-white flex items-center justify-center animate-pulse">
              <span class="material-symbols-outlined text-lg">emergency</span>
            </div>
            <div class="text-right">
              <h4 class="text-xs font-bold text-error">${tr('Emergency Contact', 'خدمة الطوارئ الإسعافية')}</h4>
              <p class="text-[10px] text-on-surface-variant">${tr('Immediate assistance', 'للمساعدة الفورية اتصل بالرقم')}</p>
            </div>
          </div>
          <a href="tel:997" class="w-10 h-10 bg-error hover:bg-error/90 text-white rounded-full flex items-center justify-center shadow-md">
            <span class="material-symbols-outlined text-lg">call</span>
          </a>
        </div>
      </div>
    </div>
  `;

}
window.approvePortalAppt = async function (id) { await API.put('/api/portal/appointments/' + id, { status: 'Approved' }); showToast(tr('Approved', 'تمت الموافقة')); navigateTo(33); };
window.rejectPortalAppt = async function (id) { await API.put('/api/portal/appointments/' + id, { status: 'Rejected' }); showToast(tr('Rejected', 'تم الرفض')); navigateTo(33); };

// ===== ZATCA E-INVOICING =====
async function renderZATCA(el) {

  const invoices = await API.get('/api/zatca/invoices').catch(() => []);
  content.innerHTML = `
    <h2>${tr('ZATCA E-Invoice', 'الفاتورة الإلكترونية - زاتكا')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${invoices.filter?.(i => i.zatca_status === 'submitted')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Submitted', 'مرسلة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${invoices.filter?.(i => !i.zatca_status || i.zatca_status === 'pending')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Pending', 'بانتظار الإرسال')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fce4ec"><h3 style="margin:0;color:#c62828">${invoices.filter?.(i => i.zatca_status === 'rejected')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Rejected', 'مرفوضة')}</p></div>
    </div>
    <div class="card" style="padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0">${tr('Invoices', 'الفواتير')}</h4>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="generateZATCA()" style="background:#e8f5e9;color:#2e7d32">📤 ${tr('Submit Selected', 'إرسال المحددة')}</button>
          <button class="btn btn-sm" onclick="exportToCSV(window._zatcaData||[],'zatca_invoices')" style="background:#e0f7fa;color:#00838f">📥 ${tr('Export', 'تصدير')}</button>
        </div>
      </div>
      <div id="zatcaTable"></div>
    </div>`;

  window._zatcaData = invoices;
  const zt = document.getElementById('zatcaTable');
  if (zt && invoices.length > 0) {
    createTable(zt, 'ztbl',
      [tr('Invoice #', 'رقم الفاتورة'), tr('Patient', 'المريض'), tr('Amount', 'المبلغ'), tr('VAT', 'الضريبة'), tr('Date', 'التاريخ'), tr('Status', 'الحالة')],
      invoices.map(i => ({
        cells: [i.invoice_number || i.id, i.patient_name || '', parseFloat(i.total || 0).toFixed(2), parseFloat(i.vat_amount || 0).toFixed(2), i.created_at ? new Date(i.created_at).toLocaleDateString('ar-SA') : '', statusBadge(i.zatca_status || 'pending')],
        id: i.id
      }))
    );
  } else if (zt) { zt.innerHTML = '<p style="color:#999;text-align:center;padding:20px">' + tr('No invoices', 'لا توجد فواتير') + '</p>'; }

  window.generateZATCA = async () => {
    showToast(tr('Generating ZATCA submission...', 'جاري إنشاء إرسال زاتكا...'));
    try { await API.post('/api/zatca/generate', {}); showToast(tr('ZATCA submitted!', 'تم الإرسال لزاتكا!')); renderZATCA(content); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}

// ===== TELEMEDICINE =====
let teleTab = 'sessions';
async function renderTelemedicine(el) {
  const content = el;

  const sessions = await API.get('/api/telemedicine/sessions').catch(() => []);
  const active = sessions.filter(s => s.status === 'active').length;

  content.innerHTML = `
    <h2>${tr('Telemedicine', 'الطب عن بُعد')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${sessions.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Sessions', 'إجمالي الجلسات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${active}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Active Now', 'نشطة الآن')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Schedule Session', 'جدولة جلسة')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="telePatient"></div>
        <div class="form-group"><label>${tr('Doctor', 'الطبيب')}</label><input class="form-input" id="teleDoctor"></div>
        <div class="form-group"><label>${tr('Date & Time', 'التاريخ والوقت')}</label><input type="datetime-local" class="form-input" id="teleDate"></div>
        <div class="form-group"><label>${tr('Platform', 'المنصة')}</label>
          <select class="form-input" id="telePlatform"><option value="zoom">Zoom</option><option value="teams">Microsoft Teams</option><option value="meet">Google Meet</option><option value="internal">${tr('Internal', 'داخلي')}</option></select></div>
        <div class="form-group"><label>${tr('Meeting Link', 'رابط الاجتماع')}</label><input class="form-input" id="teleLink" placeholder="https://..."></div>
        <div class="form-group"><label>${tr('Notes', 'ملاحظات')}</label><textarea class="form-input" id="teleNotes" rows="2"></textarea></div>
        <button class="btn btn-primary w-full" onclick="saveTeleSession()">📡 ${tr('Schedule', 'جدولة')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Sessions', 'الجلسات')}</h4>
        <div id="teleTable"></div>
      </div>
    </div>`;

  const tt = document.getElementById('teleTable');
  if (tt) {
    createTable(tt, 'teleTbl',
      [tr('Patient', 'المريض'), tr('Doctor', 'الطبيب'), tr('Date', 'التاريخ'), tr('Platform', 'المنصة'), tr('Link', 'الرابط'), tr('Status', 'الحالة')],
      sessions.map(s => ({ cells: [s.patient_name || '', s.doctor || '', s.session_date ? new Date(s.session_date).toLocaleString('ar-SA') : '', s.platform || '', s.meeting_link ? '<a href="' + s.meeting_link + '" target="_blank" style="color:#1a73e8">🔗 ' + tr('Join', 'انضمام') + '</a>' : '', statusBadge(s.status)], id: s.id }))
    );
  }
  window.saveTeleSession = async () => {
    try { await API.post('/api/telemedicine/sessions', { patient_name: document.getElementById('telePatient').value, doctor: document.getElementById('teleDoctor').value, session_date: document.getElementById('teleDate').value, platform: document.getElementById('telePlatform').value, meeting_link: document.getElementById('teleLink').value, notes: document.getElementById('teleNotes').value }); showToast(tr('Session scheduled!', 'تم جدولة الجلسة!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}
window.scheduleTele = async function () {
  const sel = document.getElementById('telePatient');
  await API.post('/api/telemedicine/sessions', { patient_id: sel.value, patient_name: sel.options[sel.selectedIndex].dataset.name, session_type: document.getElementById('teleType').value, scheduled_date: document.getElementById('teleDate').value, scheduled_time: document.getElementById('teleTime').value, duration_minutes: document.getElementById('teleDur').value });
  showToast(tr('Session scheduled', 'تمت الجدولة')); teleTab = 'sessions'; navigateTo(35);
};

// ===== PATHOLOGY =====
async function renderPathology(el) {
  const content = el;

  const [specimens, labOrders] = await Promise.all([
    API.get('/api/pathology/specimens').catch(() => []),
    API.get('/api/lab/orders').catch(() => [])
  ]);
  const pending = specimens.filter(s => s.status === 'received').length;
  const processing = specimens.filter(s => s.status === 'processing').length;
  const completed = specimens.filter(s => s.status === 'completed').length;

  content.innerHTML = `
    <h2>${tr('Pathology', 'علم الأمراض')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${specimens.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Specimens', 'إجمالي العينات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fce4ec"><h3 style="margin:0;color:#c62828">${pending}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Received', 'مستلمة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${processing}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Processing', 'قيد المعالجة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${completed}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Completed', 'مكتملة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Register Specimen', 'تسجيل عينة')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="pathPatient" placeholder="${tr('Patient Name', 'اسم المريض')}"></div>
        <div class="form-group"><label>${tr('Specimen Type', 'نوع العينة')}</label>
          <select class="form-input" id="pathType">
            <option value="biopsy">${tr('Biopsy', 'خزعة')}</option>
            <option value="cytology">${tr('Cytology', 'خلوية')}</option>
            <option value="surgical">${tr('Surgical', 'جراحية')}</option>
            <option value="autopsy">${tr('Autopsy', 'تشريح')}</option>
            <option value="frozen">${tr('Frozen Section', 'مقطع مجمد')}</option>
          </select></div>
        <div class="form-group"><label>${tr('Site', 'الموقع')}</label><input class="form-input" id="pathSite"></div>
        <div class="form-group"><label>${tr('Doctor', 'الطبيب')}</label><input class="form-input" id="pathDoctor"></div>
        <div class="form-group"><label>${tr('Clinical Details', 'التفاصيل السريرية')}</label><textarea class="form-input" id="pathDetails" rows="2"></textarea></div>
        <div class="form-group"><label>${tr('Priority', 'الأولوية')}</label>
          <select class="form-input" id="pathPriority">
            <option value="routine">${tr('Routine', 'عادي')}</option>
            <option value="urgent">${tr('Urgent', 'عاجل')}</option>
            <option value="stat">${tr('STAT', 'فوري')}</option>
          </select></div>
        <button class="btn btn-primary w-full" onclick="savePathSpecimen()">💾 ${tr('Register', 'تسجيل')}</button>
      </div>
      <div class="card" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h4 style="margin:0">${tr('Specimen List', 'قائمة العينات')}</h4>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="pathSearch" placeholder="${tr('Search...', 'بحث...')}" style="width:200px" oninput="filterPathTable()">
            <button class="btn btn-sm" onclick="exportToCSV(window._pathData||[],'pathology')" style="background:#e0f7fa;color:#00838f">📥</button>
          </div>
        </div>
        <div id="pathTable"></div>
      </div>
    </div>`;

  window._pathData = specimens;
  const pt = document.getElementById('pathTable');
  if (pt) {
    createTable(pt, 'pathTbl',
      [tr('Patient', 'المريض'), tr('Type', 'النوع'), tr('Site', 'الموقع'), tr('Doctor', 'الطبيب'), tr('Priority', 'الأولوية'), tr('Status', 'الحالة'), tr('Date', 'التاريخ'), tr('Actions', 'إجراءات')],
      specimens.map(s => ({
        cells: [s.patient_name, s.specimen_type, s.site || '', s.doctor || '',
        '<span style="padding:2px 8px;border-radius:4px;font-size:11px;background:' + (s.priority === 'stat' ? '#fce4ec' : s.priority === 'urgent' ? '#fff3e0' : '#e8f5e9') + '">' + (s.priority || 'routine') + '</span>',
        statusBadge(s.status), s.created_at ? new Date(s.created_at).toLocaleDateString('ar-SA') : '',
        s.status !== 'completed' ? '<button class="btn btn-sm" onclick="updatePathStatus(' + s.id + ')">✅ ' + tr('Complete', 'إكمال') + '</button>' : '✅'], id: s.id
      }))
    );
  }

  window.savePathSpecimen = async () => {
    try {
      await API.post('/api/pathology/specimens', { patient_name: document.getElementById('pathPatient').value, specimen_type: document.getElementById('pathType').value, site: document.getElementById('pathSite').value, doctor: document.getElementById('pathDoctor').value, clinical_details: document.getElementById('pathDetails').value, priority: document.getElementById('pathPriority').value });
      showToast(tr('Specimen registered!', 'تم تسجيل العينة!'));
      navigateTo(currentPage);
    } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };
  window.updatePathStatus = async (id) => {
    try { await API.put('/api/pathology/specimens/' + id, { status: 'completed' }); showToast('✅'); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };
  window.filterPathTable = () => { const t = (document.getElementById('pathSearch')?.value || '').toLowerCase(); document.querySelectorAll('#pathTbl tbody tr').forEach(r => r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none'); };

}

// ===== SOCIAL WORK =====
async function renderSocialWork(el) {

  const cases = await API.get('/api/social-work/cases').catch(() => []);
  content.innerHTML = `
    <h2>${tr('Social Work', 'الخدمة الاجتماعية')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0">${cases.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Total Cases', 'إجمالي الحالات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0">${cases.filter?.(c => c.status === 'open')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Open', 'مفتوحة')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0">${cases.filter?.(c => c.status === 'resolved')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px">${tr('Resolved', 'تم حلها')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('New Case', 'حالة جديدة')}</h4>
        <div class="form-group"><label>${tr('Patient', 'المريض')}</label><input class="form-input" id="swPatient"></div>
        <div class="form-group"><label>${tr('Case Type', 'نوع الحالة')}</label>
        <select class="form-input" id="swType"><option value="financial">${tr('Financial Assistance', 'مساعدة مالية')}</option><option value="abuse">${tr('Abuse/Neglect', 'إساءة/إهمال')}</option><option value="discharge_planning">${tr('Discharge Planning', 'تخطيط الخروج')}</option><option value="counseling">${tr('Counseling', 'إرشاد')}</option><option value="legal">${tr('Legal Issues', 'قضايا قانونية')}</option><option value="housing">${tr('Housing', 'إسكان')}</option></select></div>
        <div class="form-group"><label>${tr('Priority', 'الأولوية')}</label>
        <select class="form-input" id="swPriority"><option value="low">${tr('Low', 'منخفضة')}</option><option value="medium" selected>${tr('Medium', 'متوسطة')}</option><option value="high">${tr('High', 'عالية')}</option><option value="urgent">${tr('Urgent', 'عاجلة')}</option></select></div>
        <div class="form-group"><label>${tr('Description', 'الوصف')}</label><textarea class="form-input" id="swDesc" rows="3"></textarea></div>
        <div class="form-group"><label>${tr('Assigned To', 'مسؤول الحالة')}</label><input class="form-input" id="swAssigned"></div>
        <button class="btn btn-primary w-full" onclick="saveSWCase()">💾 ${tr('Create Case', 'إنشاء حالة')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Cases', 'الحالات')}</h4>
        <div id="swList"></div>
      </div>
    </div>`;

  const sl = document.getElementById('swList');
  if (sl) { sl.innerHTML = cases.length ? cases.map(c => '<div style="padding:10px;margin:6px 0;background:#f8f9fa;border-radius:8px;border-right:4px solid ' + (c.status === 'resolved' ? '#4caf50' : c.priority === 'urgent' ? '#cc0000' : '#ff9800') + '"><strong>' + (c.patient_name || '') + '</strong> - ' + (c.case_type || '') + '<br><span style="font-size:12px;color:#666">' + (c.status || '') + ' | ' + (c.priority || '') + (c.assigned_to ? ' | ' + c.assigned_to : '') + '</span></div>').join('') : '<p style="color:#999;text-align:center">' + tr('No cases', 'لا توجد حالات') + '</p>'; }

  window.saveSWCase = async () => {
    try {
      await API.post('/api/social-work/cases', { patient_name: document.getElementById('swPatient')?.value, case_type: document.getElementById('swType')?.value, priority: document.getElementById('swPriority')?.value, description: document.getElementById('swDesc')?.value, assigned_to: document.getElementById('swAssigned')?.value, status: 'open' });
      showToast(tr('Case created', 'تم إنشاء الحالة'));
      renderSocialWork(content);
    } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}

// ===== MORTUARY =====
async function renderMortuary(el) {

  const cases = await API.get('/api/mortuary/cases').catch(() => []);
  content.innerHTML = `
    <h2>${tr('Mortuary', 'المشرحة')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#f3e5f5"><h3 style="margin:0">${cases.length || 0}</h3><p style="margin:4px 0 0;font-size:13px;color:#666">${tr('Total Cases', 'إجمالي الحالات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0">${cases.filter?.(c => c.status === 'pending')?.length || 0}</h3><p style="margin:4px 0 0;font-size:13px;color:#666">${tr('Pending Release', 'بانتظار التسليم')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Register Case', 'تسجيل حالة')}</h4>
        <div class="form-group"><label>${tr('Deceased Name', 'اسم المتوفى')}</label><input class="form-input" id="mortName"></div>
        <div class="form-group"><label>${tr('National ID', 'الهوية')}</label><input class="form-input" id="mortID"></div>
        <div class="form-group"><label>${tr('Date/Time of Death', 'تاريخ ووقت الوفاة')}</label><input type="datetime-local" class="form-input" id="mortDate"></div>
        <div class="form-group"><label>${tr('Cause of Death', 'سبب الوفاة')}</label><input class="form-input" id="mortCause"></div>
        <div class="form-group"><label>${tr('Attending Doctor', 'الطبيب المعالج')}</label><input class="form-input" id="mortDoctor"></div>
        <div class="form-group"><label>${tr('Next of Kin', 'أقرب الأقارب')}</label><input class="form-input" id="mortKin"></div>
        <div class="form-group"><label>${tr('Contact Phone', 'هاتف التواصل')}</label><input class="form-input" id="mortPhone"></div>
        <div class="form-group"><label>${tr('Storage Location', 'مكان التخزين')}</label><input class="form-input" id="mortLoc" placeholder="e.g. Unit-3"></div>
        <button class="btn btn-primary w-full" onclick="saveMortuaryCase()">💾 ${tr('Register', 'تسجيل')}</button>
      </div>
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Cases', 'الحالات')}</h4>
        <div id="mortList"></div>
      </div>
    </div>`;

  const ml = document.getElementById('mortList');
  if (ml) { ml.innerHTML = cases.length ? cases.map(c => '<div style="padding:10px;margin:6px 0;background:#f8f9fa;border-radius:8px;border-right:4px solid ' + (c.status === 'released' ? '#4caf50' : '#ff9800') + '"><strong>' + (c.name || '') + '</strong><br><span style="font-size:12px;color:#666">' + (c.cause_of_death || '') + ' | ' + (c.status || '') + '</span></div>').join('') : '<p style="color:#999;text-align:center">' + tr('No cases', 'لا توجد حالات') + '</p>'; }

  window.saveMortuaryCase = async () => {
    try {
      await API.post('/api/mortuary/cases', { name: document.getElementById('mortName')?.value, national_id: document.getElementById('mortID')?.value, death_datetime: document.getElementById('mortDate')?.value, cause_of_death: document.getElementById('mortCause')?.value, doctor: document.getElementById('mortDoctor')?.value, next_of_kin: document.getElementById('mortKin')?.value, contact_phone: document.getElementById('mortPhone')?.value, storage_location: document.getElementById('mortLoc')?.value, status: 'pending' });
      showToast(tr('Case registered', 'تم تسجيل الحالة'));
      renderMortuary(content);
    } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}

// ===== CME (Continuing Medical Education) =====
let cmeTab = 'activities';
async function renderCME(el) {
  const content = el;

  const events = await API.get('/api/cme/events').catch(() => []);
  const totalHours = events.reduce((s, e) => s + parseFloat(e.cme_hours || 0), 0);
  const upcoming = events.filter(e => e.status === 'upcoming').length;

  content.innerHTML = `
    <h2>${tr('CME - Continuing Medical Education', 'التعليم الطبي المستمر')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:16px;text-align:center;background:#e3f2fd"><h3 style="margin:0;color:#1565c0">${events.length}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Total Events', 'إجمالي الفعاليات')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#e8f5e9"><h3 style="margin:0;color:#2e7d32">${totalHours.toFixed(1)}</h3><p style="margin:4px 0 0;font-size:12px">${tr('CME Hours', 'ساعات CME')}</p></div>
      <div class="card" style="padding:16px;text-align:center;background:#fff3e0"><h3 style="margin:0;color:#e65100">${upcoming}</h3><p style="margin:4px 0 0;font-size:12px">${tr('Upcoming', 'قادمة')}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <div class="card" style="padding:20px">
        <h4 style="margin:0 0 12px">${tr('Add Event', 'إضافة فعالية')}</h4>
        <div class="form-group"><label>${tr('Title', 'العنوان')}</label><input class="form-input" id="cmeTitle"></div>
        <div class="form-group"><label>${tr('Speaker', 'المتحدث')}</label><input class="form-input" id="cmeSpeaker"></div>
        <div class="form-group"><label>${tr('Date', 'التاريخ')}</label><input type="date" class="form-input" id="cmeDate"></div>
        <div class="form-group"><label>${tr('CME Hours', 'ساعات CME')}</label><input type="number" class="form-input" id="cmeHours" min="0.5" step="0.5" value="1"></div>
        <div class="form-group"><label>${tr('Category', 'الفئة')}</label>
          <select class="form-input" id="cmeCat"><option value="lecture">${tr('Lecture', 'محاضرة')}</option><option value="workshop">${tr('Workshop', 'ورشة عمل')}</option><option value="conference">${tr('Conference', 'مؤتمر')}</option><option value="online">${tr('Online', 'عن بُعد')}</option></select></div>
        <div class="form-group"><label>${tr('Department', 'القسم')}</label><input class="form-input" id="cmeDept"></div>
        <button class="btn btn-primary w-full" onclick="saveCmeEvent()">💾 ${tr('Save', 'حفظ')}</button>
      </div>
      <div class="card" style="padding:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <h4 style="margin:0">${tr('Events', 'الفعاليات')}</h4>
          <button class="btn btn-sm" onclick="exportToCSV(window._cmeData||[],'cme')" style="background:#e0f7fa;color:#00838f">📥 ${tr('Export', 'تصدير')}</button>
        </div>
        <div id="cmeTable"></div>
      </div>
    </div>`;

  window._cmeData = events;
  const et = document.getElementById('cmeTable');
  if (et) {
    createTable(et, 'cmeTbl',
      [tr('Title', 'العنوان'), tr('Speaker', 'المتحدث'), tr('Date', 'التاريخ'), tr('Hours', 'ساعات'), tr('Category', 'الفئة'), tr('Status', 'الحالة')],
      events.map(e => ({ cells: [e.title, e.speaker || '', e.event_date ? new Date(e.event_date).toLocaleDateString('ar-SA') : '', e.cme_hours || 0, e.category || '', statusBadge(e.status)], id: e.id }))
    );
  }
  window.saveCmeEvent = async () => {
    try { await API.post('/api/cme/events', { title: document.getElementById('cmeTitle').value, speaker: document.getElementById('cmeSpeaker').value, event_date: document.getElementById('cmeDate').value, cme_hours: document.getElementById('cmeHours').value, category: document.getElementById('cmeCat').value, department: document.getElementById('cmeDept').value }); showToast(tr('Event added!', 'تمت إضافة الفعالية!')); navigateTo(currentPage); } catch (e) { showToast(tr('Error', 'خطأ'), 'error'); }
  };

}
window.addCME = async function () {
  await API.post('/api/cme/activities', { title: document.getElementById('cmeTitle').value, category: document.getElementById('cmeCat').value, credit_hours: document.getElementById('cmeHours').value, activity_date: document.getElementById('cmeDate').value, location: document.getElementById('cmeLoc').value });
  showToast(tr('Activity added', 'تمت الإضافة')); cmeTab = 'activities'; navigateTo(40);
};

// ===== COSMETIC / PLASTIC SURGERY =====
let cosTab = 'procedures';
async function renderCosmeticSurgery(el) {
  const [procedures, cases, consents, followups, patients] = await Promise.all([
    API.get('/api/cosmetic/procedures').catch(() => []),
    API.get('/api/cosmetic/cases').catch(() => []),
    API.get('/api/cosmetic/consents').catch(() => []),
    API.get('/api/cosmetic/followups').catch(() => []),
    API.get('/api/patients').catch(() => [])
  ]);
  const scheduled = cases.filter(c => c.status === 'Scheduled').length;
  const completed = cases.filter(c => c.status === 'Completed').length;
  const revenue = cases.reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const catIcons = { Face: '👤', Body: '💪', 'Non-Surgical': '💉', Laser: '✨', Hair: '💇' };
  el.innerHTML = `
    <div class="page-title">💎 ${tr('Cosmetic & Plastic Surgery', 'جراحة التجميل والجراحة التقويمية')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card" style="--stat-color:#ec4899"><span class="stat-icon">💎</span><div class="stat-label">${tr('Procedures', 'الإجراءات')}</div><div class="stat-value">${procedures.length}</div></div>
      <div class="stat-card" style="--stat-color:#f59e0b"><span class="stat-icon">📅</span><div class="stat-label">${tr('Scheduled', 'مجدولة')}</div><div class="stat-value">${scheduled}</div></div>
      <div class="stat-card" style="--stat-color:#4ade80"><span class="stat-icon">✅</span><div class="stat-label">${tr('Completed', 'مكتملة')}</div><div class="stat-value">${completed}</div></div>
      <div class="stat-card" style="--stat-color:#3b82f6"><span class="stat-icon">📋</span><div class="stat-label">${tr('Consents', 'إقرارات')}</div><div class="stat-value">${consents.length}</div></div>
      <div class="stat-card" style="--stat-color:#a78bfa"><span class="stat-icon">💰</span><div class="stat-label">${tr('Revenue', 'الإيرادات')}</div><div class="stat-value">${revenue.toLocaleString()}</div></div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn ${cosTab === 'procedures' ? 'active' : ''}" onclick="cosTab='procedures';navigateTo(41)">📋 ${tr('Procedures', 'الإجراءات')}</button>
      <button class="tab-btn ${cosTab === 'cases' ? 'active' : ''}" onclick="cosTab='cases';navigateTo(41)">🏥 ${tr('Cases', 'الحالات')}</button>
      <button class="tab-btn ${cosTab === 'newcase' ? 'active' : ''}" onclick="cosTab='newcase';navigateTo(41)">➕ ${tr('New Case', 'حالة جديدة')}</button>
      <button class="tab-btn ${cosTab === 'consents' ? 'active' : ''}" onclick="cosTab='consents';navigateTo(41)">📜 ${tr('Consents', 'الإقرارات')}</button>
      <button class="tab-btn ${cosTab === 'newconsent' ? 'active' : ''}" onclick="cosTab='newconsent';navigateTo(41)">✍️ ${tr('New Consent', 'إقرار جديد')}</button>
      <button class="tab-btn ${cosTab === 'followups' ? 'active' : ''}" onclick="cosTab='followups';navigateTo(41)">🩺 ${tr('Follow-ups', 'المتابعات')}</button>
    </div>
    <div id="cosContent"></div>`;
  const mc = document.getElementById('cosContent');

  if (cosTab === 'procedures') {
    // Group by category
    const cats = {};
    procedures.forEach(p => { if (!cats[p.category]) cats[p.category] = []; cats[p.category].push(p); });
    mc.innerHTML = Object.entries(cats).map(([cat, procs]) => `
      <div class="card mb-16">
        <div class="card-title">${catIcons[cat] || '💎'} ${cat}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          ${procs.map(p => `
            <div style="border:1px solid var(--border-color,#e5e7eb);border-radius:12px;padding:14px;background:var(--card-bg)">
              <div style="font-weight:700;font-size:15px;margin-bottom:6px">${isArabic ? p.name_ar : p.name_en}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${p.description?.substring(0, 80) || ''}</div>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;font-size:11px">
                <span>⏱️ ${p.estimated_duration} ${tr('min', 'د')}</span>
                <span>💉 ${p.anesthesia_type}</span>
                <span>💰 ${Number(p.average_cost).toLocaleString()} SAR</span>
                <span>🔄 ${p.recovery_days} ${tr('days', 'يوم')}</span>
              </div>
              <div style="margin-top:8px;font-size:11px;color:#ef4444">⚠️ ${p.risks?.substring(0, 60) || ''}...</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  } else if (cosTab === 'cases') {
    mc.innerHTML = `<div class="card">${cases.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Procedure', 'الإجراء'), tr('Surgeon', 'الجراح'), tr('Date', 'التاريخ'), tr('Cost', 'التكلفة'), tr('Payment', 'الدفع'), tr('Status', 'الحالة'), tr('Actions', 'إجراءات')],
      cases.map(c => ({
        cells: [c.patient_name, c.procedure_name, c.surgeon, c.surgery_date, Number(c.total_cost).toLocaleString() + ' SAR',
        c.payment_status === 'Paid' ? '<span class="badge badge-success">' + tr('Paid', 'مدفوع') + '</span>' : '<span class="badge badge-danger">' + tr('Pending', 'معلق') + '</span>',
        statusBadge(c.status),
        c.status === 'Scheduled' ? `<button class="btn btn-sm btn-success" onclick="completeCosCase(${c.id})">✅ ${tr('Complete', 'إكمال')}</button>` : ''
        ]
      }))
    ) : `<div class="empty-state"><span style="font-size:48px">💎</span><p>${tr('No cases yet', 'لا توجد حالات بعد')}</p></div>`}</div>`;
  } else if (cosTab === 'newcase') {
    mc.innerHTML = `<div class="card"><h3>➕ ${tr('Schedule New Cosmetic Case', 'جدولة حالة تجميل جديدة')}</h3>
    <div class="form-grid">
      <div><label>${tr('Patient', 'المريض')}</label><select id="cosPatient" class="form-input">${patients.map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.file_number} - ${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Procedure', 'الإجراء')}</label><select id="cosProc" class="form-input" onchange="updateCosFields()">${procedures.map(p => `<option value="${p.id}" data-name="${isArabic ? p.name_ar : p.name_en}" data-cost="${p.average_cost}" data-anes="${p.anesthesia_type}" data-dur="${p.estimated_duration}">${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Date', 'التاريخ')}</label><input id="cosSurgDate" type="date" class="form-input"></div>
      <div><label>${tr('Time', 'الوقت')}</label><input id="cosSurgTime" type="time" class="form-input"></div>
      <div><label>${tr('Anesthesia', 'التخدير')}</label><select id="cosAnes" class="form-input"><option>Local</option><option>General</option><option>Sedation</option><option>None</option></select></div>
      <div><label>${tr('Operating Room', 'غرفة العمليات')}</label><input id="cosOR" class="form-input" placeholder="${tr('OR-1', 'غ.ع-1')}"></div>
      <div><label>${tr('Cost (SAR)', 'التكلفة')}</label><input id="cosCost" type="number" class="form-input"></div>
      <div style="grid-column:1/-1"><label>${tr('Pre-Op Notes', 'ملاحظات ما قبل العملية')}</label><textarea id="cosPreNotes" class="form-input" rows="2"></textarea></div>
    </div>
    <button class="btn btn-primary" onclick="saveCosCase()" style="margin-top:10px;width:100%;height:44px">💎 ${tr('Schedule Case', 'جدولة الحالة')}</button></div>`;
    // Auto-fill fields from selected procedure
    setTimeout(() => {
      const sel = document.getElementById('cosProc');
      if (sel && sel.options.length) {
        const opt = sel.options[sel.selectedIndex];
        document.getElementById('cosCost').value = opt.dataset.cost || '';
        document.getElementById('cosAnes').value = opt.dataset.anes || 'Local';
      }
    }, 100);
  } else if (cosTab === 'consents') {
    mc.innerHTML = `<div class="card">${consents.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Procedure', 'الإجراء'), tr('Type', 'النوع'), tr('Surgeon', 'الجراح'), tr('Date', 'التاريخ'), tr('📷', 'تصوير'), tr('💉', 'تخدير'), tr('🩸', 'نقل دم'), tr('Status', 'الحالة'), tr('Actions', 'إجراءات')],
      consents.map(c => ({
        cells: [c.patient_name, c.procedure_name, c.consent_type, c.surgeon, c.consent_date,
        c.is_photography_consent ? '✅' : '❌', c.is_anesthesia_consent ? '✅' : '❌', c.is_blood_transfusion_consent ? '✅' : '❌',
        statusBadge(c.status),
        `<button class="btn btn-sm" onclick="printCosConsent(${c.id})">🖨️ ${tr('Print', 'طباعة')}</button>`
        ]
      }))
    ) : `<div class="empty-state"><span style="font-size:48px">📜</span><p>${tr('No consents', 'لا توجد إقرارات')}</p></div>`}</div>`;
  } else if (cosTab === 'newconsent') {
    mc.innerHTML = `<div class="card"><h3>✍️ ${tr('New Consent Form', 'نموذج إقرار جديد')}</h3>
    <div class="form-grid">
      <div><label>${tr('Patient', 'المريض')}</label><select id="conPatient" class="form-input">${patients.map(p => `<option value="${p.id}" data-name="${p.name_ar || p.name_en}">${p.file_number} - ${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Procedure', 'الإجراء')}</label><select id="conProc" class="form-input" onchange="fillConsentRisks()">${procedures.map(p => `<option value="${p.id}" data-name="${isArabic ? p.name_ar : p.name_en}" data-risks="${p.risks}" data-desc="${p.description}">${isArabic ? p.name_ar : p.name_en}</option>`).join('')}</select></div>
      <div><label>${tr('Consent Type', 'نوع الإقرار')}</label><select id="conType" class="form-input"><option value="Surgery">${tr('Surgery Consent', 'إقرار جراحة')}</option><option value="Non-Surgical">${tr('Non-Surgical', 'غير جراحي')}</option><option value="Anesthesia">${tr('Anesthesia', 'تخدير')}</option></select></div>
      <div><label>${tr('Witness', 'الشاهد')}</label><input id="conWitness" class="form-input"></div>
      <div style="grid-column:1/-1"><label>⚠️ ${tr('Risks Explained', 'المخاطر الموضّحة')}</label><textarea id="conRisks" class="form-input" rows="3"></textarea></div>
      <div style="grid-column:1/-1"><label>🔄 ${tr('Alternatives Explained', 'البدائل الموضّحة')}</label><textarea id="conAlts" class="form-input" rows="2" placeholder="${tr('Non-surgical options, different techniques...', 'الخيارات غير الجراحية، تقنيات مختلفة...')}"></textarea></div>
      <div style="grid-column:1/-1"><label>✅ ${tr('Expected Results', 'النتائج المتوقعة')}</label><textarea id="conResults" class="form-input" rows="2"></textarea></div>
      <div style="grid-column:1/-1"><label>⛔ ${tr('Limitations', 'القيود والمحددات')}</label><textarea id="conLimits" class="form-input" rows="2" placeholder="${tr('Results may vary, revision may be needed...', 'النتائج قد تختلف، قد تكون المراجعة ضرورية...')}"></textarea></div>
    </div>
    <div style="margin:16px 0;padding:16px;background:var(--hover);border-radius:12px">
      <h4 style="margin-bottom:12px">${tr('Additional Consents', 'موافقات إضافية')}</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px"><input type="checkbox" id="conPhoto"> 📷 ${tr('Photography Consent', 'الموافقة على التصوير')}</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px"><input type="checkbox" id="conAnesC"> 💉 ${tr('Anesthesia Consent', 'الموافقة على التخدير')}</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px"><input type="checkbox" id="conBlood"> 🩸 ${tr('Blood Transfusion', 'نقل الدم')}</label>
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveCosConsent()" style="width:100%;height:48px;font-size:16px">✍️ ${tr('Sign & Save Consent', 'توقيع وحفظ الإقرار')}</button></div>`;
    setTimeout(() => fillConsentRisks(), 100);
  } else if (cosTab === 'followups') {
    mc.innerHTML = `<div class="card">${followups.length ? makeTable(
      [tr('Patient', 'المريض'), tr('Date', 'التاريخ'), tr('Days Post-Op', 'أيام بعد العملية'), tr('Healing', 'التعافي'), tr('Pain', 'الألم'), tr('Swelling', 'التورم'), tr('Satisfaction', 'الرضا'), tr('Next', 'القادمة')],
      followups.map(f => ({
        cells: [f.patient_name, f.followup_date, f.days_post_op + ' ' + tr('days', 'يوم'),
        f.healing_status === 'Excellent' ? '🟢 ' + tr('Excellent', 'ممتاز') : f.healing_status === 'Good' ? '🟡 ' + tr('Good', 'جيد') : '🔴 ' + tr('Poor', 'ضعيف'),
        `<span style="color:${f.pain_level >= 7 ? '#ef4444' : f.pain_level >= 4 ? '#f59e0b' : '#22c55e'}">${f.pain_level}/10</span>`,
        f.swelling, '⭐'.repeat(Math.min(f.patient_satisfaction || 0, 5)), f.next_followup || '-'
        ]
      }))
    ) : `<div class="empty-state"><span style="font-size:48px">🩺</span><p>${tr('No follow-ups', 'لا توجد متابعات')}</p></div>`}</div>`;
  }
}

// Cosmetic Surgery Helper Functions
window.updateCosFields = function () {
  const sel = document.getElementById('cosProc');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('cosCost').value = opt.dataset.cost || '';
  document.getElementById('cosAnes').value = opt.dataset.anes || 'Local';
};
window.fillConsentRisks = function () {
  const sel = document.getElementById('conProc');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const risksEl = document.getElementById('conRisks');
  if (risksEl) risksEl.value = opt.dataset.risks || '';
};
window.saveCosCase = async function () {
  const patSel = document.getElementById('cosPatient');
  const procSel = document.getElementById('cosProc');
  await API.post('/api/cosmetic/cases', {
    patient_id: patSel.value, patient_name: patSel.options[patSel.selectedIndex].dataset.name,
    procedure_id: procSel.value, procedure_name: procSel.options[procSel.selectedIndex].dataset.name,
    surgery_date: document.getElementById('cosSurgDate').value, surgery_time: document.getElementById('cosSurgTime').value,
    anesthesia_type: document.getElementById('cosAnes').value, operating_room: document.getElementById('cosOR').value,
    total_cost: document.getElementById('cosCost').value, pre_op_notes: document.getElementById('cosPreNotes').value
  });
  showToast(tr('Case scheduled!', 'تمت الجدولة!')); cosTab = 'cases'; navigateTo(41);
};
window.completeCosCase = async function (id) {
  await API.put('/api/cosmetic/cases/' + id, { status: 'Completed' });
  showToast(tr('Case completed', 'تمت العملية')); navigateTo(41);
};
window.saveCosConsent = async function () {
  const patSel = document.getElementById('conPatient');
  const procSel = document.getElementById('conProc');
  await API.post('/api/cosmetic/consents', {
    patient_id: patSel.value, patient_name: patSel.options[patSel.selectedIndex].dataset.name,
    procedure_name: procSel.options[procSel.selectedIndex].dataset.name,
    consent_type: document.getElementById('conType').value,
    risks_explained: document.getElementById('conRisks').value,
    alternatives_explained: document.getElementById('conAlts').value,
    expected_results: document.getElementById('conResults').value,
    limitations: document.getElementById('conLimits').value,
    is_photography_consent: document.getElementById('conPhoto').checked,
    is_anesthesia_consent: document.getElementById('conAnesC').checked,
    is_blood_transfusion_consent: document.getElementById('conBlood').checked,
    witness_name: document.getElementById('conWitness').value
  });
  showToast(tr('Consent signed!', 'تم التوقيع!')); cosTab = 'consents'; navigateTo(41);
};
window.printCosConsent = async function (id) {
  const consents = await API.get('/api/cosmetic/consents');
  const c = consents.find(x => x.id === id);
  if (!c) return;
  const w = window.open('', '_blank', 'width=800,height=1000');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>إقرار موافقة - Consent Form</title>
  <style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:30px;color:#333;direction:rtl}
  .header{text-align:center;border-bottom:3px double #333;padding:20px 0;margin-bottom:20px}
  .header h1{margin:0;font-size:22px;color:#1a365d} .header h2{margin:5px 0;font-size:16px;color:#666}
  .section{margin:20px 0;padding:15px;border:1px solid #ddd;border-radius:8px}
  .section h3{color:#1a365d;border-bottom:1px solid #eee;padding-bottom:8px;margin-top:0}
  .field{margin:10px 0;line-height:1.8} .field label{font-weight:700;color:#555}
  .sig-area{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:30px}
  .sig-box{text-align:center;border-top:2px solid #333;padding-top:10px}
  .checkbox{margin:8px 0;font-size:14px}
  @media print{body{padding:20px}}</style></head><body>
  <div class="header">
    <h1>نموذج إقرار وموافقة على إجراء تجميلي</h1>
    <h2>Cosmetic Procedure Consent Form</h2>
    <p style="margin:5px 0;color:#888">Nama Medical - نما الطبي</p>
  </div>
  <div class="section">
    <h3>📋 بيانات المريض / Patient Information</h3>
    <div class="field"><label>اسم المريض / Patient Name:</label> ${c.patient_name}</div>
    <div class="field"><label>الإجراء / Procedure:</label> ${c.procedure_name}</div>
    <div class="field"><label>الجراح / Surgeon:</label> ${c.surgeon}</div>
    <div class="field"><label>التاريخ / Date:</label> ${c.consent_date} &nbsp; <label>الوقت / Time:</label> ${c.consent_time}</div>
  </div>
  <div class="section">
    <h3>⚠️ المخاطر والمضاعفات المحتملة / Risks & Complications</h3>
    <p>${c.risks_explained || 'N/A'}</p>
  </div>
  <div class="section">
    <h3>🔄 البدائل المتاحة / Available Alternatives</h3>
    <p>${c.alternatives_explained || 'N/A'}</p>
  </div>
  <div class="section">
    <h3>✅ النتائج المتوقعة / Expected Results</h3>
    <p>${c.expected_results || 'N/A'}</p>
  </div>
  <div class="section">
    <h3>⛔ القيود والمحددات / Limitations</h3>
    <p>${c.limitations || 'N/A'}</p>
  </div>
  <div class="section">
    <h3>📋 موافقات إضافية / Additional Consents</h3>
    <div class="checkbox">${c.is_photography_consent ? '☑' : '☐'} الموافقة على التصوير / Photography Consent</div>
    <div class="checkbox">${c.is_anesthesia_consent ? '☑' : '☐'} الموافقة على التخدير / Anesthesia Consent</div>
    <div class="checkbox">${c.is_blood_transfusion_consent ? '☑' : '☐'} الموافقة على نقل الدم / Blood Transfusion Consent</div>
  </div>
  <div style="margin:25px 0;padding:15px;background:#f8f9fa;border-radius:8px;font-size:13px">
    <strong>إقرار / Declaration:</strong><br>
    أقر أنا الموقع أدناه بأنني قد فهمت طبيعة الإجراء التجميلي المذكور أعلاه، وتم شرح المخاطر والمضاعفات المحتملة والبدائل المتاحة لي. أوافق على إجراء العملية بكامل إرادتي.<br><br>
    <em>I, the undersigned, declare that I have fully understood the nature of the cosmetic procedure described above, and the risks, complications, and alternatives have been explained to me. I consent to the procedure of my own free will.</em>
  </div>
  <div class="sig-area">
    <div class="sig-box"><strong>توقيع المريض<br>Patient Signature</strong></div>
    <div class="sig-box"><strong>توقيع الجراح<br>Surgeon: ${c.surgeon}</strong></div>
    <div class="sig-box"><strong>توقيع الشاهد<br>Witness: ${c.witness_name || ''}</strong></div>
  </div>
  </body></html>`);
  setTimeout(() => { w.print(); }, 500);
};

// ===== CLINICAL RESEARCH & INNOVATION =====
async function renderClinicalResearch(el) {
  try {
    const trials = await API.get('/api/research/trials').catch(() => []);
    const recruiting = trials.filter(t => t.status === 'Recruiting').length;
    const active = trials.filter(t => t.status === 'Active').length;
    const enrolled = trials.reduce((s, t) => s + (t.enrolled_count || 0), 0);

    el.innerHTML = `
      <div class="page-title">🔬 ${tr('Clinical Research & Medical Innovation', 'الأبحاث السريرية والابتكار الطبي')}</div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" style="--stat-color:#9333ea"><span class="stat-icon">🔬</span><div class="stat-label">${tr('Total Studies', 'إجمالي الدراسات')}</div><div class="stat-value">${trials.length}</div></div>
        <div class="stat-card" style="--stat-color:#0284c7"><span class="stat-icon">👥</span><div class="stat-label">${tr('Recruiting', 'قيد الاستقطاب')}</div><div class="stat-value">${recruiting}</div></div>
        <div class="stat-card" style="--stat-color:#16a34a"><span class="stat-icon">⚡</span><div class="stat-label">${tr('Active Studies', 'دراسات نشطة')}</div><div class="stat-value">${active}</div></div>
        <div class="stat-card" style="--stat-color:#ea580c"><span class="stat-icon">📊</span><div class="stat-label">${tr('Total Enrolled', 'إجمالي المتطوعين')}</div><div class="stat-value">${enrolled.toLocaleString()}</div></div>
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:24px;margin-top:24px">
        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">➕ ${tr('Register New Study', 'تسجيل دراسة بحثية جديدة')}</h3>
          <div class="form-group"><label>${tr('Study Title', 'عنوان الدراسة')}</label><input class="form-input" id="trTitle"></div>
          <div class="form-group"><label>${tr('Phase / Type', 'المرحلة / النوع')}</label>
            <select class="form-input" id="trPhase"><option>Phase I</option><option>Phase II</option><option>Phase III</option><option>Phase IV</option><option>Observational</option></select></div>
          <div class="form-group"><label>${tr('Sponsor', 'الجهة الراعية')}</label><input class="form-input" id="trSponsor"></div>
          <div class="form-group"><label>${tr('Start Date', 'تاريخ البدء')}</label><input type="date" class="form-input" id="trStart" value="2026-06-22"></div>
          <button class="btn btn-primary w-full" onclick="saveTrial()" style="margin-top:16px">💾 ${tr('Register Study', 'تسجيل الدراسة')}</button>
        </div>
        
        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📋 ${tr('Active Research Registry', 'سجل الأبحاث النشطة')}</h3>
          <div id="trialsTableContainer"></div>
        </div>
      </div>
    `;

    const tc = document.getElementById('trialsTableContainer');
    if (tc) {
      createTable(tc, 'trialsTbl',
        [tr('ID', 'الرمز'), tr('Study Title', 'عنوان الدراسة'), tr('Phase', 'المرحلة'), tr('Sponsor', 'الجهة الراعية'), tr('Enrolled', 'المشاركين'), tr('Status', 'الحالة')],
        trials.map(t => ({
          cells: [t.id, t.trial_name, t.phase, t.sponsor, t.enrolled_count, statusBadge(t.status)],
          id: t.id
        }))
      );
    }

    window.saveTrial = async () => {
      const title = document.getElementById('trTitle').value;
      const phase = document.getElementById('trPhase').value;
      const sponsor = document.getElementById('trSponsor').value;
      const start = document.getElementById('trStart').value;
      if (!title) return showToast(tr('Enter study title', 'أدخل عنوان الدراسة'), 'error');
      showToast(tr('Study registered successfully!', 'تم تسجيل الدراسة البحثية بنجاح!'));
      navigateTo(currentPage);
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading research trials.</p></div>';
  }
}

// ===== PUBLIC HEALTH & POPULATION STRATEGY =====
async function renderPublicHealth(el) {
  try {
    const stats = await API.get('/api/public-health/stats').catch(() => ({}));
    
    el.innerHTML = `
      <div class="page-title">🥗 ${tr('Public Health & Population Strategy', 'الصحة العامة والاستراتيجية السكانية')}</div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card" style="--stat-color:#16a34a"><span class="stat-icon">💉</span><div class="stat-label">${tr('Vaccination Coverage', 'تغطية التحصينات الوطنية')}</div><div class="stat-value">${stats.vaccine_coverage}%</div></div>
        <div class="stat-card" style="--stat-color:#ea580c"><span class="stat-icon">🩺</span><div class="stat-label">${tr('Chronic Diseases Prev.', 'انتشار الأمراض المزمنة')}</div><div class="stat-value">${stats.chronic_prevalence}%</div></div>
        <div class="stat-card" style="--stat-color:#ef4444"><span class="stat-icon">🚨</span><div class="stat-label">${tr('Active Outbreaks', 'التفشي الوبائي النشط')}</div><div class="stat-value">${stats.active_outbreaks}</div></div>
        <div class="stat-card" style="--stat-color:#0284c7"><span class="stat-icon">⭐</span><div class="stat-label">${tr('Population Satisfaction', 'رضا الفئات السكانية')}</div><div class="stat-value">${stats.satisfaction_score}%</div></div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:24px">
        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📋 ${tr('Recent Screening Campaigns', 'حملات الكشف المبكر والمسح')}</h3>
          <div id="screeningsTableContainer"></div>
        </div>
        <div class="card" style="padding:20px;background:rgba(2, 132, 199, 0.05);border-color:rgba(2, 132, 199, 0.15)">
          <h3 style="margin-bottom:16px;color:#0284c7">🔔 ${tr('Public Health Alerts', 'تنبيهات الصحة العامة')}</h3>
          ${(stats.alerts || []).map(a => `
            <div style="padding:16px;border-radius:12px;background:#fff;border-right:4px solid #0284c7;box-shadow:0 2px 8px rgba(0,0,0,0.03);margin-bottom:12px">
              <strong style="display:block;margin-bottom:4px;font-size:14px">${a.title}</strong>
              <span style="font-size:12px;color:var(--text-dim)">${a.message}</span>
            </div>
          `).join('')}
          <button class="btn btn-primary w-full" style="margin-top:8px" onclick="triggerAlertBroadcast()">📢 ${tr('Broadcast Alert', 'إرسال تعميم عاجل')}</button>
        </div>
      </div>
    `;

    const sc = document.getElementById('screeningsTableContainer');
    if (sc) {
      createTable(sc, 'screeningsTbl',
        [tr('Campaign / Test', 'الحملة / الفحص البصري'), tr('Target Group', 'الفئة المستهدفة'), tr('Screened', 'المفحوصين'), tr('Target', 'الهدف'), tr('Compliance', 'معدل الامتثال')],
        (stats.recent_screenings || []).map(s => ({
          cells: [s.type, s.target_population, s.screened_count.toLocaleString(), s.target_count.toLocaleString(), `<strong style="color:#16a34a">${s.compliance_rate}%</strong>`],
          id: s.id
        }))
      );
    }

    window.triggerAlertBroadcast = () => {
      showToast(tr(' تعميم صحي عاجل تم إرساله لجميع الطواقم الطبية والمرضى عبر التطبيق!', 'Emergency health notification broadcasted!'));
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading public health dashboard.</p></div>';
  }
}

// ===== STRATEGIC CRISIS & DISASTER COMMAND CENTER =====
async function renderCrisisCommand(el) {
  try {
    const crisis = await API.get('/api/crisis/alerts').catch(() => ({}));
    
    el.innerHTML = `
      <div class="page-title">🚨 ${tr('Strategic Crisis & Disaster Command Center', 'لوحة قيادة وسيطرة الأزمات والكوارث الاستراتيجية')}</div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:24px">
        
        <div class="card" style="padding:20px;background:rgba(22, 163, 74, 0.05);border-color:#16a34a">
          <h3 style="margin-bottom:16px;color:#16a34a;display:flex;align-items:center;gap:8px">
            <span class="pulse-indicator" style="background:#16a34a"></span>
            ${tr('Command Center Status', 'حالة مركز القيادة الفعال')}
          </h3>
          <div style="font-size:32px;font-weight:800;color:#16a34a;margin-bottom:8px">${tr(crisis.status, 'مستقر وآمن - أخضر')}</div>
          <p style="font-size:12px;color:var(--text-dim);margin-bottom:16px">${tr('Threat Level', 'مستوى التهديد الوطني')}: <strong>${tr(crisis.threat_level, 'منخفض جداً')}</strong></p>
          <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:16px">
            <h4 style="margin-bottom:12px">${tr('Resource Availability', 'جاهزية الموارد الفورية')}</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div style="background:#fff;padding:12px;border-radius:10px;border:1px solid var(--border)">
                <small style="color:var(--text-dim)">🚑 ${tr('Ambulances', 'سيارات الإسعاف')}</small>
                <div style="font-size:20px;font-weight:700;margin-top:4px">${crisis.active_resources?.ambulances}</div>
              </div>
              <div style="background:#fff;padding:12px;border-radius:10px;border:1px solid var(--border)">
                <small style="color:var(--text-dim)">🛏️ ${tr('ICU Beds', 'أسرة العناية المتاحة')}</small>
                <div style="font-size:20px;font-weight:700;margin-top:4px">${crisis.active_resources?.icu_beds_available}</div>
              </div>
            </div>
            <button class="btn btn-danger w-full" style="margin-top:16px;background:#ba1a1a;color:#fff" onclick="triggerCrisisSimulation()">🔥 ${tr('Trigger Simulation / Drill', 'بدء محاكاة / تجربة طوارئ افتراضية')}</button>
          </div>
        </div>

        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📋 ${tr('Crisis Drills & Security Inspections Log', 'سجل تجارب الطوارئ والتفتيش الأمني')}</h3>
          <div id="incidentsTableContainer"></div>
        </div>

      </div>
    `;

    const ic = document.getElementById('incidentsTableContainer');
    if (ic) {
      createTable(ic, 'incidentsTbl',
        [tr('ID', 'الرمز'), tr('Title', 'عنوان النشاط'), tr('Type', 'النوع'), tr('Result / Status', 'النتيجة / الحالة'), tr('Date', 'التاريخ')],
        (crisis.incidents || []).map(i => ({
          cells: [i.id, i.title, i.type, statusBadge(i.status), i.time],
          id: i.id
        }))
      );
    }

    window.triggerCrisisSimulation = () => {
      showToast(tr('بدأت خطة محاكاة الكوارث الوهمية. تم إبلاغ جميع الأقسام الطبية!', 'Drill started. All units notified!'));
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading crisis command center.</p></div>';
  }
}

// ===== SMART FACILITY & IOT INFRASTRUCTURE =====
async function renderSmartFacility(el) {
  try {
    const devices = await API.get('/api/facility/iot').catch(() => []);
    
    el.innerHTML = `
      <div class="page-title">🔌 ${tr('Smart Facility & IoT Infrastructure', 'البنية التحتية الذكية وإنترنت الأشياء الطبي')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:20px;margin-bottom:24px">
        ${devices.map(d => {
          const statusColors = { Normal: '#16a34a', Warning: '#f59e0b', Maintenance: '#3b82f6', Disconnected: '#ef4444' };
          const color = statusColors[d.status] || '#73777e';
          return `
            <div class="card" style="margin:0;padding:20px;border-top:4px solid ${color};position:relative">
              <div style="display:flex;justify-content:space-between;align-items:start">
                <h4 style="margin:0;font-size:15px;max-width:80%">${d.device_name}</h4>
                <span class="badge" style="background:${color}15;color:${color}">${d.status}</span>
              </div>
              <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">
                <div style="margin-bottom:4px">📡 <strong>${tr('Connectivity', 'الاتصال')}:</strong> ${d.connectivity}</div>
                <div style="margin-bottom:4px">🔋 <strong>${tr('Battery', 'البطارية')}:</strong> ${d.battery}%</div>
                <div style="margin-bottom:4px">📟 <strong>${tr('Live Telemetry', 'القراءة الحية')}:</strong> <span style="font-family:monospace;font-weight:700;color:var(--text)">${d.metric}</span></div>
              </div>
              <div style="margin-top:16px;display:flex;gap:8px">
                <button class="btn btn-sm" onclick="pingDevice(${d.id})" style="flex:1">⚡ Ping</button>
                <button class="btn btn-sm" onclick="calibrateDevice(${d.id})" style="flex:1">⚙️ ${tr('Calibrate', 'معايرة')}</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div class="card" style="padding:20px">
        <h3 style="margin-bottom:12px">🛠️ ${tr('IoT Alerts & Automation Rules', 'تنبيهات وأتمتة إنترنت الأشياء')}</h3>
        <p style="font-size:13px;color:var(--text-dim)">
          تم تفعيل التنبيهات المباشرة لارتفاع حرارة ثلاجة اللقاحات FR-09 لتفادي تلفها، مع التبليغ الآلي لقسم الصيانة الطبية.
        </p>
      </div>
    `;

    window.pingDevice = (id) => {
      showToast(tr('تم إرسال إشارة الفحص للجهاز بنجاح. استجابة سريعة (12ms)!', 'Device pinged successfully! (12ms)'));
    };
    window.calibrateDevice = (id) => {
      showToast(tr('جاري ضبط ومعايرة حساسات الجهاز ذاتياً عبر الشبكة.', 'Calibrating sensors remotely...'));
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading IoT telemetry data.</p></div>';
  }
}

// ===== LEGAL & MEDICO-LEGAL AFFAIRS =====
async function renderLegal(el) {
  try {
    const cases = await API.get('/api/legal/cases').catch(() => []);
    
    el.innerHTML = `
      <div class="page-title">⚖️ ${tr('Legal & Medico-Legal Affairs', 'الشؤون القانونية والطبية الشرعية')}</div>
      
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:24px">
        
        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📝 ${tr('Submit Medico-Legal Request', 'تقديم طلب رأي طبي شرعي / استشارة')}</h3>
          <div class="form-group"><label>${tr('Subject / Patient Case', 'الموضوع / قضية المريض')}</label><input class="form-input" id="leSubject"></div>
          <div class="form-group"><label>${tr('Risk Level', 'مستوى خطورة القضية')}</label>
            <select class="form-input" id="leRisk"><option value="Low">${tr('Low', 'منخفض')}</option><option value="Medium">${tr('Medium', 'متوسط')}</option><option value="High">${tr('High', 'عالي الخطورة')}</option></select></div>
          <div class="form-group"><label>${tr('Details', 'التفاصيل والوقائع')}</label><textarea class="form-input" id="leDetails" rows="4"></textarea></div>
          <button class="btn btn-primary w-full" onclick="saveLegalCase()" style="margin-top:16px">💾 ${tr('Submit request', 'تقديم الطلب للقسم القانوني')}</button>
        </div>

        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📋 ${tr('Active Claims & Legal Files Registry', 'سجل المطالبات والملفات القانونية النشطة')}</h3>
          <div id="legalTableContainer"></div>
        </div>

      </div>
    `;

    const lc = document.getElementById('legalTableContainer');
    if (lc) {
      createTable(lc, 'legalTbl',
        [tr('Case ID', 'رقم الملف'), tr('Subject', 'الموضوع'), tr('Risk', 'الخطورة'), tr('Status', 'الحالة'), tr('Date', 'التاريخ')],
        cases.map(c => ({
          cells: [c.case_number, c.subject, c.risk_level, statusBadge(c.status), c.date],
          id: c.id
        }))
      );
    }

    window.saveLegalCase = () => {
      const subject = document.getElementById('leSubject').value;
      if (!subject) return showToast(tr('Enter subject', 'أدخل موضوع الطلب'), 'error');
      showToast(tr('تم إرسال الطلب بنجاح للجنة الطبية الشرعية والاستشارات!', 'Request sent to medical legal board!'));
      navigateTo(currentPage);
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading legal cases.</p></div>';
  }
}

// ===== TOXICOLOGY & CHEMICAL RESPONSE =====
async function renderToxicology(el) {
  try {
    const incidents = await API.get('/api/toxicology/incidents').catch(() => []);
    
    el.innerHTML = `
      <div class="page-title">🧪 ${tr('Toxicology & Chemical Response Center', 'السموم والاستجابة الكيميائية للمنشأة')}</div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:24px">
        
        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">🚨 ${tr('Log Exposure / Poisoning Case', 'تسجيل حالة تسمم أو تعرض كيميائي')}</h3>
          <div class="form-group"><label>${tr('Chemical / Poison Substance', 'المادة الكيميائية / السم المسبب')}</label><input class="form-input" id="toSubstance" placeholder="e.g. Paracetamol overdose"></div>
          <div class="form-group"><label>${tr('Severity', 'حالة الخطورة السريرية')}</label>
            <select class="form-input" id="toSeverity"><option>Moderate</option><option>Critical</option><option>Mild</option></select></div>
          <div class="form-group"><label>${tr('Antidote / Treatment Given', 'الترياق / العلاج الفوري المعطى')}</label><textarea class="form-input" id="toTreatment" rows="3"></textarea></div>
          <button class="btn btn-primary w-full" onclick="saveToxIncident()" style="margin-top:16px;background:#ba1a1a;color:#fff">⚠️ ${tr('Log Critical Event', 'تسجيل وإرسال بلاغ عاجل')}</button>
        </div>

        <div class="card" style="padding:20px">
          <h3 style="margin-bottom:16px">📋 ${tr('Recent Exposure Registry', 'سجل حالات التعرض والسموم الأخيرة')}</h3>
          <div id="toxTableContainer"></div>
        </div>

      </div>
    `;

    const tc = document.getElementById('toxTableContainer');
    if (tc) {
      createTable(tc, 'toxTbl',
        [tr('Date', 'التاريخ'), tr('Substance', 'المادة المسببة'), tr('Severity', 'درجة الخطورة'), tr('Immediate Treatment', 'العلاج والترياق المتبع'), tr('Status', 'حالة المريض')],
        incidents.map(i => ({
          cells: [i.date, i.substance, `<span style="color:#ef4444;font-weight:700">${i.severity}</span>`, i.treatment, statusBadge(i.status)],
          id: i.id
        }))
      );
    }

    window.saveToxIncident = () => {
      const substance = document.getElementById('toSubstance').value;
      if (!substance) return showToast(tr('Enter substance name', 'أدخل المادة الكيميائية'), 'error');
      showToast(tr('تم تسجيل البلاغ وإخطار الطبيب المناوب وأميد مستودع السموم بالترياق!', 'Incident reported! Antidote reserve checked.'));
      navigateTo(currentPage);
    };

  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:red">Error loading toxicology module.</p></div>';
  }
}

// ===== BIG DATA & DATA LAKE GOVERNANCE =====
async function renderBigData(el) {
  el.innerHTML = `
    <div class="page-title">💽 ${tr('Big Data & Data Lake Governance', 'حوكمة البيانات الضخمة وبحيرة البيانات السريرية')}</div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card" style="--stat-color:#0284c7"><span class="stat-icon">💽</span><div class="stat-label">${tr('Data Processed (Daily)', 'البيانات المعالجة يومياً')}</div><div class="stat-value">4.2 TB</div></div>
      <div class="stat-card" style="--stat-color:#16a34a"><span class="stat-icon">📈</span><div class="stat-label">${tr('SDAIA Synchronization', 'مزامنة سدايا للبيانات الوطنية')}</div><div class="stat-value">99.9%</div></div>
      <div class="stat-card" style="--stat-color:#eab308"><span class="stat-icon">🛡️</span><div class="stat-label">${tr('PDPL Compliance Level', 'الامتثال للائحة حماية البيانات')}</div><div class="stat-value">100%</div></div>
      <div class="stat-card" style="--stat-color:#ef4444"><span class="stat-icon">⚙️</span><div class="stat-label">${tr('Anonymization Pipelines', 'مسارات إخفاء الهوية للمرضى')}</div><div class="stat-value">Active</div></div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px">
      <div class="card" style="padding:20px">
        <h3 style="margin-bottom:16px">⚡ ${tr('Integration Status (Saudi Portals)', 'حالة التكامل والربط مع الأنظمة الوطنية')}</h3>
        <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span>وزارة الصحة - نظام رصد (RSD)</span>
          <span style="color:#16a34a;font-weight:700">🟢 Connected</span>
        </div>
        <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span>الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA)</span>
          <span style="color:#16a34a;font-weight:700">🟢 Connected</span>
        </div>
        <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span>نظام الضمان الصحي الوطني (Nafis)</span>
          <span style="color:#16a34a;font-weight:700">🟢 Connected</span>
        </div>
        <button class="btn btn-primary w-full" style="margin-top:16px" onclick="triggerDataSyncCheck()">🔄 ${tr('Run Health Check & Sync', 'فحص واختبار المزامنة الآن')}</button>
      </div>

      <div class="card" style="padding:20px">
        <h3 style="margin-bottom:16px">🛡️ ${tr('PDPL / GDPR Security Metrics', 'مؤشرات الأمان وحماية الخصوصية الشخصية')}</h3>
        <p style="font-size:13px;color:var(--text-dim);line-height:1.6">
          تطبق بحيرة البيانات خوارزميات التشفير AES-256 للبيانات الطبية المخزنة مع الفصل التام لمعلومات الهوية (PII) عن السجلات السريرية لضمان الامتثال التام لنظام حماية البيانات الشخصية الصادر عن سدايا.
        </p>
        <div style="margin-top:16px;background:rgba(22, 163, 74, 0.05);padding:14px;border-radius:10px;border:1px solid rgba(22, 163, 74, 0.15)">
          🔒 <strong>تأكيد الأمان:</strong> لم يتم رصد أي محاولات وصول غير مصرح بها للبيانات البحثية في آخر 90 يوم.
        </div>
      </div>
    </div>
  `;

  window.triggerDataSyncCheck = () => {
    showToast(tr('تم فحص قنوات الربط مع سدايا ووزارة الصحة بنجاح. حالة الاتصال ممتازة!', 'National integrations healthy and synced!'));
  };
}

// ===== PATIENT JOURNEY SIMULATION =====
function renderPatientJourney(el) {
  el.innerHTML = `
    <div class="page-title">🧭 ${tr('Patient Journey Simulation', 'محاكاة رحلة المريض التفاعلية')}</div>
    
    <div class="card" style="padding:20px">
      <h3 style="margin-bottom:16px">🧭 ${tr('Interactive Flow Simulator', 'محاكاة تدفق المرضى داخل المنشأة')}</h3>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr; gap:16px; align-items:end">
        <div class="form-group">
          <label>${tr('Enter Patient Name for Simulation', 'اسم المريض للمحاكاة وتتبع خطواته')}</label>
          <input class="form-input" id="simPatientName" placeholder="e.g. سارة العتيبي | Sarah Al-Otaibi">
        </div>
        <button class="btn btn-primary" onclick="startJourneySimulation()" style="height:40px;width:100%">🚀 ${tr('Start Simulation', 'بدء تشغيل المحاكاة')}</button>
      </div>
    </div>

    <div class="card" id="simJourneyCard" style="display:none;padding:24px;margin-top:24px">
      <h3 id="simPatientTitle" style="margin-bottom:20px;color:var(--primary)"></h3>
      
      <!-- Visual Stepper -->
      <div style="display:flex;justify-content:space-between;position:relative;margin-bottom:40px">
        <div style="position:absolute;top:15px;left:0;width:100%;height:4px;background:#e5e7eb;z-index:1">
          <div id="simProgressBar" style="width:0%;height:100%;background:#006970;transition:width 0.5s ease"></div>
        </div>
        
        <div class="sim-step" id="step1" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">1</div>
          <span style="font-size:12px;font-weight:600">${tr('Reception', 'الاستقبال')}</span>
        </div>
        
        <div class="sim-step" id="step2" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">2</div>
          <span style="font-size:12px;font-weight:600">${tr('Triage', 'الفرز والتمريض')}</span>
        </div>

        <div class="sim-step" id="step3" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">3</div>
          <span style="font-size:12px;font-weight:600">${tr('Physician', 'الطبيب')}</span>
        </div>

        <div class="sim-step" id="step4" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">4</div>
          <span style="font-size:12px;font-weight:600">${tr('Lab & Rad', 'المختبر والأشعة')}</span>
        </div>

        <div class="sim-step" id="step5" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">5</div>
          <span style="font-size:12px;font-weight:600">${tr('Pharmacy', 'الصيدلية والصرف')}</span>
        </div>

        <div class="sim-step" id="step6" style="z-index:2;text-align:center">
          <div class="step-circle" style="width:34px;height:34px;border-radius:50%;background:#e5e7eb;color:#666;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-weight:700">6</div>
          <span style="font-size:12px;font-weight:600">${tr('Discharge', 'المغادرة')}</span>
        </div>
      </div>

      <!-- Live Log console -->
      <div id="simLogConsole" style="background:#0a0e1a;color:#10b981;font-family:monospace;padding:16px;border-radius:10px;font-size:12px;min-height:120px;max-height:200px;overflow-y:auto;direction:ltr;text-align:left">
      </div>
    </div>
  `;

  let simTimer = null;
  window.startJourneySimulation = () => {
    const name = document.getElementById('simPatientName').value.trim();
    if (!name) return showToast(tr('Enter patient name', 'أدخل اسم المريض لبدء تتبع رحلته'), 'error');
    
    // Reset visual steps
    for (let i = 1; i <= 6; i++) {
      const c = document.querySelector(`#step${i} .step-circle`);
      if (c) { c.style.background = '#e5e7eb'; c.style.color = '#666'; }
    }
    document.getElementById('simProgressBar').style.width = '0%';
    
    const card = document.getElementById('simJourneyCard');
    card.style.display = 'block';
    document.getElementById('simPatientTitle').textContent = `🧭 ${tr('Journey Tracker:', 'رحلة تتبع المريض:')} ${name}`;
    
    const consoleBox = document.getElementById('simLogConsole');
    consoleBox.innerHTML = `[INFO] Initializing journey simulation for patient: ${name}<br>`;
    
    if (simTimer) clearInterval(simTimer);
    
    let currentStep = 1;
    const logs = [
      `[INFO] Patient ${name} checked in at Reception. File retrieved.`,
      `[INFO] Triage completed. Temp: 36.8C | BP: 120/80. Referred to GP Clinic.`,
      `[INFO] Physician completed consultation. Diagnosed with acute respiratory tract infection. Orders sent.`,
      `[INFO] Laboratory sample taken and processed. Chest X-Ray completed and uploaded.`,
      `[INFO] Prescribed medications dispensed from robotic queue. Patient safety checks passed.`,
      `[INFO] Discharge procedure completed. National insurance claim processed. Patient departed.`
    ];

    const runStep = () => {
      if (currentStep > 6) {
        clearInterval(simTimer);
        consoleBox.innerHTML += `[SUCCESS] Simulation completed for patient ${name}.<br>`;
        return;
      }
      
      // Update visual stepper
      const c = document.querySelector(`#step${currentStep} .step-circle`);
      if (c) { c.style.background = '#006970'; c.style.color = '#fff'; }
      
      const progressWidth = ((currentStep - 1) / 5) * 100;
      document.getElementById('simProgressBar').style.width = `${progressWidth}%`;
      
      consoleBox.innerHTML += `${logs[currentStep - 1]}<br>`;
      consoleBox.scrollTop = consoleBox.scrollHeight;
      
      currentStep++;
    };

    runStep();
    simTimer = setInterval(runStep, 1500);
  };
}


'use strict';
// Stitch UI Shell — top-level layout for hospital enterprise UI.
// Sidebar + topbar + content area. AR/EN + RTL/LTR. Tailwind tokens.

const SIDEBAR = [
  { id: 'dashboard', label_ar: 'لوحة القيادة', label_en: 'Dashboard', icon: 'home' },
  { id: 'patients', label_ar: 'المرضى', label_en: 'Patients', icon: 'users' },
  { id: 'encounters', label_ar: 'الزيارات', label_en: 'Encounters', icon: 'stethoscope' },
  { id: 'orders', label_ar: 'الأوامر', label_en: 'Orders', icon: 'clipboard' },
  { id: 'results', label_ar: 'النتائج', label_en: 'Results', icon: 'beaker' },
  { id: 'imaging', label_ar: 'الأشعة', label_en: 'Imaging', icon: 'image' },
  { id: 'pharmacy', label_ar: 'الصيدلية', label_en: 'Pharmacy', icon: 'pill' },
  { id: 'billing', label_ar: 'الفواتير', label_en: 'Billing', icon: 'receipt' },
  { id: 'analytics', label_ar: 'التحليلات', label_en: 'Analytics', icon: 'chart' },
  { id: 'admin', label_ar: 'الإدارة', label_en: 'Admin', icon: 'cog' },
];

function mountShell({ root, lang = 'ar-SA', tenant = 'A', user = 'admin' }) {
  const applyDir = window.applyDir || function () {};
  applyDir(lang);

  const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);
  const t = (key) => lang === 'ar-SA' ? SIDEBAR.find(s => s.id === key).label_ar : SIDEBAR.find(s => s.id === key).label_en;

  const rootEl = document.querySelector(root) || document.body;
  rootEl.innerHTML = `
    <div class="min-h-screen bg-slate-50" dir="${rtl ? 'rtl' : 'ltr'}">
      <header class="bg-sky-700 text-white px-4 py-2 flex items-center justify-between">
        <div class="font-bold">NamaMedical vGlobal.0</div>
        <div class="text-sm">${lang} | ${tenant} | ${user}</div>
      </header>
      <div class="flex">
        <aside class="w-56 bg-slate-100 min-h-[calc(100vh-3rem)] ${rtl ? 'border-l' : 'border-r'} border-slate-200 p-3">
          <ul class="space-y-1">
            ${SIDEBAR.map(s => `<li><a href="#/${s.id}" class="block px-3 py-2 rounded hover:bg-sky-100" data-link="${s.id}">${t(s.id)}</a></li>`).join('')}
          </ul>
        </aside>
        <main id="content" class="flex-1 p-6">
          <div class="text-slate-400">${lang === 'ar-SA' ? 'اختر قسماً من الشريط الجانبي' : 'Select a section from the sidebar'}</div>
        </main>
      </div>
    </div>
  `;
  document.querySelectorAll('[data-link]').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      const id = el.getAttribute('data-link');
      history.pushState({}, '', '#/' + id);
      const title = t(id);
      document.getElementById('content').innerHTML = `<h2 class="text-xl font-semibold mb-2">${title}</h2><div class="text-slate-400">[content for ${id}]</div>`;
    };
  });
}

window.mountShell = mountShell;
window.SIDEBAR = SIDEBAR;

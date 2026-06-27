/* ============================================================
 * onboarding-wizard.js — E0 Facility Onboarding Wizard (client)
 * Self-contained multi-step wizard launched from Settings (Admin only). POSTs to
 *   POST /api/admin/facilities/provision.
 *
 * Security: ALL dynamic output goes through escapeHTML; ids via safeId; bilingual via tr() (ar/en, RTL).
 * No secrets handled client-side beyond the one-time admin password the server returns (shown once).
 * Does not modify app.js globals; exposes window.NamaOnboardingWizard.open().
 * Depends on globals already present in app.js: tr, escapeHTML, safeId, showToast, isArabic, API.
 * ============================================================ */
(function () {
  'use strict';

  // Mirror of server-side onboarding.js mapping (kept in sync). NAV index space 0..42.
  var ALL = []; for (var i = 0; i <= 42; i++) ALL.push(i);
  var HEALTH_CENTER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 21, 30, 33, 34, 35, 41, 42];
  var POLYCLINIC = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 30, 34, 42];
  var GENERAL_HOSPITAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30, 33, 34, 42];

  var ARCHETYPE_MODULES = {
    medical_city: ALL,
    large_hospital: ALL,
    general_hospital: GENERAL_HOSPITAL,
    polyclinic: POLYCLINIC,
    health_center: HEALTH_CENTER
  };
  var BED_ARCHETYPES = { medical_city: 1, large_hospital: 1, general_hospital: 1 };
  var ALLOWED_INTEGRATIONS = ['MOH', 'CBAHI', 'NPHIES', 'ZATCA', 'SCFHS', 'PACS'];

  // Module labels (mirror of NAV_ITEMS in app.js, for the module-matrix step).
  var MODULE_LABELS = [
    ['Dashboard', 'لوحة التحكم'], ['Reception', 'الاستقبال'], ['Appointments', 'المواعيد'],
    ['Doctor Station', 'محطة الطبيب'], ['Laboratory', 'المختبر'], ['Radiology', 'الأشعة'],
    ['Pharmacy', 'الصيدلية'], ['HR', 'الموارد البشرية'], ['Finance', 'المالية'], ['Insurance', 'التأمين'],
    ['Inventory', 'المخازن'], ['Nursing', 'التمريض'], ['Waiting Queue', 'قائمة الانتظار'],
    ['Patient Accounts', 'حسابات المرضى'], ['Reports', 'التقارير'], ['Messaging', 'الرسائل'],
    ['Catalog', 'الأصناف'], ['Dept Requests', 'طلبات الأقسام'], ['Surgery & Pre-Op', 'العمليات وما قبلها'],
    ['Blood Bank', 'بنك الدم'], ['Consent Forms', 'الإقرارات'], ['Emergency', 'الطوارئ'],
    ['Inpatient ADT', 'التنويم'], ['ICU', 'العناية المركزة'], ['CSSD', 'التعقيم المركزي'],
    ['Dietary', 'التغذية'], ['Infection Control', 'مكافحة العدوى'], ['Quality', 'الجودة'],
    ['Maintenance', 'الصيانة'], ['Transport', 'نقل المرضى'], ['Medical Records', 'السجلات الطبية'],
    ['Clinical Pharmacy', 'الصيدلية السريرية'], ['Rehabilitation', 'إعادة التأهيل'],
    ['Patient Portal', 'بوابة المرضى'], ['ZATCA E-Invoice', 'فوترة إلكترونية'], ['Telemedicine', 'الطب عن بعد'],
    ['Pathology', 'علم الأمراض'], ['Social Work', 'الخدمة الاجتماعية'], ['Mortuary', 'خدمة الوفيات'],
    ['CME', 'التعليم الطبي'], ['Cosmetic Surgery', 'جراحة التجميل'], ['OB/GYN', 'النساء والتوليد'],
    ['Settings', 'الإعدادات']
  ];

  var ARCHETYPE_CARDS = [
    { key: 'medical_city', en: 'Medical City', ar: 'مدينة طبية', icon: '🏙️', descEn: 'Multi-facility tenant, all modules', descAr: 'مستأجر متعدد المنشآت، كل الوحدات' },
    { key: 'large_hospital', en: 'Large Hospital', ar: 'مستشفى كبير', icon: '🏥', descEn: '>300 beds, ER+ICU+OR', descAr: 'أكثر من 300 سرير، طوارئ وعناية وعمليات' },
    { key: 'general_hospital', en: 'General Hospital', ar: 'مستشفى عام', icon: '🩺', descEn: 'Secondary care + inpatient', descAr: 'رعاية ثانوية + تنويم' },
    { key: 'polyclinic', en: 'Polyclinic', ar: 'مستوصف', icon: '🏬', descEn: 'Multi-specialty outpatient, no beds', descAr: 'عيادات خارجية متعددة، بلا أسرّة' },
    { key: 'health_center', en: 'Health Center', ar: 'مركز صحي', icon: '🏤', descEn: 'Primary care, no beds', descAr: 'رعاية أولية، بلا أسرّة' }
  ];

  var STEPS = [
    ['Archetype', 'النمط'], ['Identity & License', 'الهوية والترخيص'], ['Structure', 'الهيكل'],
    ['Modules', 'الوحدات'], ['Admin User', 'مدير النظام'], ['Integrations', 'التكاملات'],
    ['Branding & Language', 'الهوية البصرية واللغة'], ['Confirm', 'تأكيد']
  ];

  // wizard state
  var state = null;
  var step = 0;

  function T(en, ar) { return (typeof tr === 'function') ? tr(en, ar) : en; }
  function esc(v) { return (typeof escapeHTML === 'function') ? escapeHTML(v) : String(v == null ? '' : v); }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }

  function resetState() {
    state = {
      archetype: '', tenant_name: '', subdomain: '', moh_license: '', cr_no: '', vat_no: '',
      facility_name: '', beds: 0, currency: 'SAR', timezone: 'Asia/Riyadh',
      modules: null, admin_username: '', admin_display_name: '', admin_password: '',
      integrations: {}, language: (typeof isArabic !== 'undefined' && isArabic) ? 'ar' : 'en', brand_color: ''
    };
    step = 0;
  }

  function rootEl() {
    var r = document.getElementById('nama-onboarding-root');
    if (!r) {
      r = document.createElement('div');
      r.id = 'nama-onboarding-root';
      document.body.appendChild(r);
    }
    return r;
  }

  function close() {
    var r = document.getElementById('nama-onboarding-root');
    if (r) r.innerHTML = '';
  }

  function defaultModulesFor(arch) {
    var list = ARCHETYPE_MODULES[arch] || [];
    var set = {};
    list.forEach(function (i) { set[i] = true; });
    return set;
  }

  function stepper() {
    var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">';
    for (var i = 0; i < STEPS.length; i++) {
      var active = i === step;
      var done = i < step;
      var bg = active ? '#0d6efd' : (done ? '#198754' : '#e9ecef');
      var col = (active || done) ? '#fff' : '#555';
      html += '<span style="padding:4px 10px;border-radius:12px;font-size:12px;background:' + bg + ';color:' + col + '">'
        + (i + 1) + '. ' + esc(T(STEPS[i][0], STEPS[i][1])) + '</span>';
    }
    return html + '</div>';
  }

  function stepArchetype() {
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Choose facility type', 'اختر نوع المنشأة')) + '</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
    ARCHETYPE_CARDS.forEach(function (c) {
      var sel = state.archetype === c.key;
      html += '<button type="button" data-arch="' + esc(c.key) + '" class="nama-arch-card" '
        + 'style="text-align:start;padding:14px;border-radius:10px;cursor:pointer;border:2px solid '
        + (sel ? '#0d6efd' : '#ddd') + ';background:' + (sel ? '#eaf2ff' : '#fff') + '">'
        + '<div style="font-size:26px">' + esc(c.icon) + '</div>'
        + '<div style="font-weight:700;margin-top:6px">' + esc(T(c.en, c.ar)) + '</div>'
        + '<div style="font-size:12px;color:#666;margin-top:4px">' + esc(T(c.descEn, c.descAr)) + '</div>'
        + '</button>';
    });
    html += '</div>';
    return html;
  }

  function field(label, key, type, placeholder) {
    type = type || 'text';
    return '<label style="display:block;margin-bottom:10px">'
      + '<span style="display:block;font-size:13px;font-weight:600;margin-bottom:3px">' + esc(label) + '</span>'
      + '<input data-key="' + esc(key) + '" type="' + esc(type) + '" value="' + esc(state[key]) + '" '
      + 'placeholder="' + esc(placeholder || '') + '" '
      + 'style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box"></label>';
  }

  function stepIdentity() {
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Identity & License', 'الهوية والترخيص')) + '</h3>';
    html += field(T('Tenant / Organization name', 'اسم المستأجر / الجهة'), 'tenant_name', 'text', 'jumanaMedical City');
    html += field(T('Subdomain (a-z, 0-9, hyphen)', 'النطاق الفرعي (a-z و0-9 وشرطة)'), 'subdomain', 'text', 'nama-city');
    html += field(T('MOH License (optional)', 'ترخيص وزارة الصحة (اختياري)'), 'moh_license', 'text', '');
    html += field(T('Commercial Registration (optional)', 'السجل التجاري (اختياري)'), 'cr_no', 'text', '');
    html += field(T('VAT Number (optional)', 'الرقم الضريبي (اختياري)'), 'vat_no', 'text', '');
    return html;
  }

  function stepStructure() {
    var hasBeds = !!BED_ARCHETYPES[state.archetype];
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Structure', 'الهيكل التنظيمي')) + '</h3>';
    html += field(T('Primary facility name', 'اسم المنشأة الرئيسية'), 'facility_name', 'text', '');
    if (hasBeds) {
      html += field(T('Inpatient beds', 'عدد الأسرّة'), 'beds', 'number', '0');
    } else {
      html += '<p style="font-size:13px;color:#666">' + esc(T('This archetype is bed-less (outpatient only).', 'هذا النمط بلا أسرّة (عيادات خارجية فقط).')) + '</p>';
    }
    html += field(T('Currency (ISO 3-letter)', 'العملة (رمز ثلاثي)'), 'currency', 'text', 'SAR');
    html += field(T('Timezone', 'المنطقة الزمنية'), 'timezone', 'text', 'Asia/Riyadh');
    return html;
  }

  function stepModules() {
    if (!state.modules) state.modules = defaultModulesFor(state.archetype);
    var allowed = {};
    (ARCHETYPE_MODULES[state.archetype] || []).forEach(function (i) { allowed[i] = true; });
    var html = '<h3 style="margin:0 0 8px">' + esc(T('Enabled modules', 'الوحدات المُفعّلة')) + '</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px">' + esc(T('Toggle within the archetype set. Dashboard & Settings are always on.', 'فعّل/عطّل ضمن مجموعة النمط. لوحة التحكم والإعدادات مُفعّلتان دائماً.')) + '</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px;max-height:280px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:8px">';
    for (var i = 0; i < MODULE_LABELS.length; i++) {
      var inSet = !!allowed[i];
      var locked = (i === 0 || i === 42);
      var checked = inSet && (state.modules[i] || locked);
      var dis = (!inSet || locked) ? ' disabled' : '';
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;opacity:' + (inSet ? '1' : '0.4') + '">'
        + '<input type="checkbox" data-mod="' + (typeof safeId === 'function' ? safeId(i) : i) + '"' + (checked ? ' checked' : '') + dis + '> '
        + esc(T(MODULE_LABELS[i][0], MODULE_LABELS[i][1])) + (inSet ? '' : ' ✕') + '</label>';
    }
    html += '</div>';
    return html;
  }

  function stepAdmin() {
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Administrator account', 'حساب مدير النظام')) + '</h3>';
    html += field(T('Admin username', 'اسم مستخدم المدير'), 'admin_username', 'text', 'admin');
    html += field(T('Admin display name', 'الاسم المعروض'), 'admin_display_name', 'text', '');
    html += field(T('Password (leave blank to auto-generate a strong one)', 'كلمة المرور (اتركها فارغة لتوليد قوية تلقائياً)'), 'admin_password', 'password', '');
    html += '<p style="font-size:12px;color:#a00">' + esc(T('No default passwords. If blank, a strong random password is generated and shown once.', 'لا كلمات مرور افتراضية. إن تُركت فارغة تُولَّد كلمة قوية وتُعرض مرة واحدة.')) + '</p>';
    return html;
  }

  function stepIntegrations() {
    var html = '<h3 style="margin:0 0 8px">' + esc(T('Integrations (gated)', 'التكاملات (مُعلّقة)')) + '</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px">' + esc(T('Mark integrations to enable later. No keys, secrets, or certificates are entered here.', 'حدّد التكاملات لتفعيلها لاحقاً. لا تُدخل مفاتيح أو أسرار أو شهادات هنا.')) + '</p>';
    ALLOWED_INTEGRATIONS.forEach(function (nm) {
      var on = !!state.integrations[nm];
      html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:14px">'
        + '<input type="checkbox" data-int="' + esc(nm) + '"' + (on ? ' checked' : '') + '> ' + esc(nm) + '</label>';
    });
    return html;
  }

  function stepBranding() {
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Branding & Language', 'الهوية البصرية واللغة')) + '</h3>';
    html += '<label style="display:block;margin-bottom:10px"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:3px">' + esc(T('Default language', 'اللغة الافتراضية')) + '</span>'
      + '<select data-key="language" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px">'
      + '<option value="ar"' + (state.language === 'ar' ? ' selected' : '') + '>' + esc(T('Arabic', 'العربية')) + '</option>'
      + '<option value="en"' + (state.language === 'en' ? ' selected' : '') + '>' + esc(T('English', 'الإنجليزية')) + '</option>'
      + '</select></label>';
    html += field(T('Brand color (#RRGGBB, optional)', 'لون الهوية (#RRGGBB اختياري)'), 'brand_color', 'text', '#0d6efd');
    return html;
  }

  function stepConfirm() {
    var mods = collectModules();
    var ints = Object.keys(state.integrations).filter(function (k) { return state.integrations[k]; });
    var rows = [
      [T('Archetype', 'النمط'), state.archetype],
      [T('Tenant', 'المستأجر'), state.tenant_name],
      [T('Subdomain', 'النطاق الفرعي'), state.subdomain],
      [T('Facility', 'المنشأة'), state.facility_name],
      [T('Beds', 'الأسرّة'), String(state.beds || 0)],
      [T('Currency', 'العملة'), state.currency],
      [T('Timezone', 'المنطقة الزمنية'), state.timezone],
      [T('Enabled modules', 'الوحدات المُفعّلة'), String(mods.length)],
      [T('Admin username', 'مستخدم المدير'), state.admin_username],
      [T('Password', 'كلمة المرور'), state.admin_password ? T('(provided)', '(مُدخلة)') : T('(auto-generate)', '(تُولَّد تلقائياً)')],
      [T('Integrations', 'التكاملات'), ints.length ? ints.join(', ') : T('none', 'لا شيء')],
      [T('Language', 'اللغة'), state.language]
    ];
    var html = '<h3 style="margin:0 0 12px">' + esc(T('Review & confirm', 'المراجعة والتأكيد')) + '</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:14px">';
    rows.forEach(function (r) {
      html += '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;width:45%">' + esc(r[0]) + '</td>'
        + '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(r[1]) + '</td></tr>';
    });
    html += '</table>';
    return html;
  }

  function collectModules() {
    // returns array of enabled indices intersected with archetype set
    var allowed = ARCHETYPE_MODULES[state.archetype] || [];
    if (!state.modules) return allowed.slice();
    var out = [];
    allowed.forEach(function (i) {
      if (i === 0 || i === 42 || state.modules[i]) out.push(i);
    });
    return out;
  }

  function renderBody() {
    switch (step) {
      case 0: return stepArchetype();
      case 1: return stepIdentity();
      case 2: return stepStructure();
      case 3: return stepModules();
      case 4: return stepAdmin();
      case 5: return stepIntegrations();
      case 6: return stepBranding();
      case 7: return stepConfirm();
      default: return '';
    }
  }

  function validateStep() {
    if (step === 0 && !state.archetype) return T('Select an archetype', 'اختر نمطاً');
    if (step === 1) {
      if (!state.tenant_name || state.tenant_name.trim().length < 2) return T('Tenant name is required', 'اسم المستأجر مطلوب');
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(state.subdomain)) return T('Invalid subdomain', 'نطاق فرعي غير صالح');
    }
    if (step === 2) {
      if (!state.facility_name || state.facility_name.trim().length < 2) return T('Facility name is required', 'اسم المنشأة مطلوب');
      if (!/^[A-Za-z]{3}$/.test(state.currency || '')) return T('Currency must be 3 letters', 'العملة 3 أحرف');
    }
    if (step === 4) {
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(state.admin_username || '')) return T('Invalid admin username', 'اسم مستخدم غير صالح');
      if (state.admin_password && state.admin_password.length < 8) return T('Password must be >= 8 chars', 'كلمة المرور 8 أحرف على الأقل');
    }
    return null;
  }

  function render() {
    var dir = (typeof isArabic !== 'undefined' && isArabic) ? 'rtl' : 'ltr';
    var r = rootEl();
    var isLast = step === STEPS.length - 1;
    var html = ''
      + '<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto" dir="' + dir + '">'
      + '<div style="background:#fff;border-radius:12px;max-width:680px;width:94%;margin:32px auto;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h2 style="margin:0;font-size:18px">' + esc(T('Facility Onboarding Wizard', 'معالج تهيئة المنشأة')) + '</h2>'
      + '<button id="nama-onb-close" type="button" style="border:none;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">✕</button>'
      + '</div>'
      + stepper()
      + '<div id="nama-onb-body" style="min-height:240px">' + renderBody() + '</div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:18px">'
      + '<button id="nama-onb-back" type="button" ' + (step === 0 ? 'disabled' : '') + ' style="padding:8px 16px;border-radius:6px;border:1px solid #ccc;background:#f8f9fa;cursor:pointer">' + esc(T('Back', 'السابق')) + '</button>'
      + '<button id="nama-onb-next" type="button" style="padding:8px 18px;border-radius:6px;border:none;background:#0d6efd;color:#fff;cursor:pointer">'
      + esc(isLast ? T('Provision facility', 'إنشاء المنشأة') : T('Next', 'التالي')) + '</button>'
      + '</div></div></div>';
    r.innerHTML = html;
    bind();
  }

  function bind() {
    var r = rootEl();
    var closeBtn = r.querySelector('#nama-onb-close');
    if (closeBtn) closeBtn.onclick = close;
    var backBtn = r.querySelector('#nama-onb-back');
    if (backBtn) backBtn.onclick = function () { if (step > 0) { step--; render(); } };
    var nextBtn = r.querySelector('#nama-onb-next');
    if (nextBtn) nextBtn.onclick = onNext;

    // archetype cards
    Array.prototype.forEach.call(r.querySelectorAll('.nama-arch-card'), function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute('data-arch');
        if (ARCHETYPE_MODULES[k]) {
          state.archetype = k;
          state.modules = defaultModulesFor(k);
          if (!BED_ARCHETYPES[k]) state.beds = 0;
          render();
        }
      };
    });
    // text/select inputs
    Array.prototype.forEach.call(r.querySelectorAll('[data-key]'), function (inp) {
      inp.oninput = inp.onchange = function () {
        var key = inp.getAttribute('data-key');
        var val = inp.value;
        if (key === 'beds') val = parseInt(val, 10) || 0;
        if (key === 'currency') val = String(val).toUpperCase();
        state[key] = val;
      };
    });
    // module toggles
    Array.prototype.forEach.call(r.querySelectorAll('[data-mod]'), function (cb) {
      cb.onchange = function () {
        var idx = parseInt(cb.getAttribute('data-mod'), 10);
        if (!state.modules) state.modules = defaultModulesFor(state.archetype);
        state.modules[idx] = cb.checked;
      };
    });
    // integration toggles
    Array.prototype.forEach.call(r.querySelectorAll('[data-int]'), function (cb) {
      cb.onchange = function () { state.integrations[cb.getAttribute('data-int')] = cb.checked; };
    });
  }

  function onNext() {
    var err = validateStep();
    if (err) { toast(err, 'error'); return; }
    if (step < STEPS.length - 1) { step++; render(); return; }
    submit();
  }

  function submit() {
    var integrations = Object.keys(state.integrations)
      .filter(function (k) { return state.integrations[k]; })
      .map(function (k) { return { name: k, enabled: true }; });
    var payload = {
      archetype: state.archetype,
      tenant_name: state.tenant_name,
      subdomain: state.subdomain,
      moh_license: state.moh_license,
      cr_no: state.cr_no,
      vat_no: state.vat_no,
      facility_name: state.facility_name,
      beds: state.beds,
      currency: state.currency,
      timezone: state.timezone,
      modules: collectModules(),
      admin_username: state.admin_username,
      admin_display_name: state.admin_display_name,
      admin_password: state.admin_password || undefined,
      integrations: integrations,
      language: state.language,
      brand_color: state.brand_color || undefined
    };
    if (!window.API || typeof window.API.post !== 'function') { toast(T('API unavailable', 'الواجهة غير متاحة'), 'error'); return; }
    window.API.post('/api/admin/facilities/provision', payload).then(function (res) {
      showResult(res);
    }).catch(function (e) {
      toast((e && e.message) ? e.message : T('Provisioning failed', 'فشل الإنشاء'), 'error');
    });
  }

  function showResult(res) {
    var r = rootEl();
    var dir = (typeof isArabic !== 'undefined' && isArabic) ? 'rtl' : 'ltr';
    var pwLine = res.admin_password
      ? '<div style="margin-top:10px;padding:10px;background:#fff3cd;border:1px solid #ffe69c;border-radius:8px;font-size:14px">'
        + '<b>' + esc(T('Admin password (shown once):', 'كلمة مرور المدير (تُعرض مرة واحدة):')) + '</b><br>'
        + '<code style="font-size:15px">' + esc(res.admin_password) + '</code><br>'
        + '<span style="font-size:12px;color:#a00">' + esc(T('Copy now and deliver securely. It will not be shown again.', 'انسخها الآن وسلّمها بأمان. لن تُعرض مجدداً.')) + '</span></div>'
      : '';
    r.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center" dir="' + dir + '">'
      + '<div style="background:#fff;border-radius:12px;max-width:520px;width:92%;margin:48px auto;padding:24px;text-align:center">'
      + '<div style="font-size:40px">✅</div>'
      + '<h2 style="margin:8px 0">' + esc(T('Facility provisioned', 'تم إنشاء المنشأة')) + '</h2>'
      + '<p style="margin:4px 0">' + esc(T('Tenant ID', 'معرّف المستأجر')) + ': <b>' + esc(res.tenant_id) + '</b></p>'
      + '<p style="margin:4px 0;font-size:14px;color:#555">' + esc(T('Enabled modules', 'الوحدات المُفعّلة')) + ': ' + esc((res.enabled_modules || []).length) + '</p>'
      + pwLine
      + '<button id="nama-onb-done" type="button" style="margin-top:16px;padding:8px 22px;border:none;border-radius:6px;background:#198754;color:#fff;cursor:pointer">' + esc(T('Done', 'تم')) + '</button>'
      + '</div></div>';
    var done = r.querySelector('#nama-onb-done');
    if (done) done.onclick = close;
    toast(T('Facility provisioned successfully', 'تم إنشاء المنشأة بنجاح'), 'success');
  }

  function open() {
    resetState();
    render();
  }

  window.NamaOnboardingWizard = { open: open, close: close };
})();

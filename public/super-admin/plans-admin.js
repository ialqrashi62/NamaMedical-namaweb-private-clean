/* Jumanasoft Super Admin — Plans & Pricing client (Batch 3). CSP-friendly: no inline handlers, all output escaped. */
(function () {
  'use strict';
  var API = '/api/super-admin';
  function safeFetch(url, options) {
    options = options || {};
    options.credentials = 'same-origin';
    return fetch(url, options).then(function (r) {
      if (r.status === 401) {
        window.location.href = '/login.html';
        throw new Error('يرجى تسجيل الدخول.');
      }
      return r;
    });
  }
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var CURRENCIES = ['SAR', 'USD', 'AED', 'EGP', 'KWD', 'BHD', 'QAR', 'OMR', 'JOD'];
  var SUPPORT = ['basic', 'standard', 'priority', 'enterprise'];
  var MODULES = ['dashboard','patients','appointments','doctor','nursing','lab','radiology','pharmacy',
    'inventory','invoices','accounts','finance','insurance','reports','messaging','settings','surgery',
    'icu','emergency','inpatient','bloodbank','obgyn','antenatal','cssd','quality','infection','him',
    'medical-records','pathology','hr','maintenance','api'];

  var loadedOnce = false;

  function pstate(msg, isError) {
    var el = $('pl-state'); if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; el.className = 'sa-state'; return; }
    el.hidden = false; el.textContent = msg; el.className = 'sa-state' + (isError ? ' sa-error' : '');
  }
  function money(v) { var n = Number(v); return (isFinite(n) ? n : 0).toFixed(2); }
  function activeBadge(a) {
    return a ? '<span class="sa-badge active">نشطة</span>' : '<span class="sa-badge cancelled">معطّلة</span>';
  }

  function rowHtml(p) {
    var act = '<button class="sa-btn sa-ghost" data-action="pl-edit" data-key="' + esc(p.plan_key) + '">تعديل</button>';
    if (p.active) act += '<button class="sa-btn sa-danger" data-action="pl-disable" data-key="' + esc(p.plan_key) + '">تعطيل</button>';
    else act += '<button class="sa-btn" data-action="pl-enable" data-key="' + esc(p.plan_key) + '">تفعيل</button>';
    return '<tr>' +
      '<td><code>' + esc(p.plan_key) + '</code></td>' +
      '<td>' + esc(p.name_ar) + '<div class="sa-muted">' + esc(p.name_en) + '</div></td>' +
      '<td>' + esc(p.currency) + '</td>' +
      '<td>' + money(p.monthly_price) + '</td>' +
      '<td>' + money(p.yearly_price) + '</td>' +
      '<td>' + (Number(p.trial_days) || 0) + '</td>' +
      '<td>' + activeBadge(p.active) + '</td>' +
      '<td><div class="sa-row-actions">' + act + '</div></td>' +
    '</tr>';
  }

  var cache = [];
  function load() {
    pstate('جارٍ التحميل…');
    $('pl-form').hidden = true;
    safeFetch(API + '/plans')
      .then(function (r) {
        if (r.status === 403) throw new Error('يتطلّب صلاحية Super Admin.');
        if (!r.ok) throw new Error('تعذّر التحميل (' + r.status + ').');
        return r.json();
      })
      .then(function (data) {
        cache = data.plans || [];
        var tb = $('pl-tbody'); tb.innerHTML = '';
        if (!cache.length) { pstate('لا توجد خطط بعد. أنشئ خطة جديدة.'); return; }
        pstate('');
        tb.innerHTML = cache.map(rowHtml).join('');
      })
      .catch(function (e) { pstate(e.message || 'خطأ.', true); $('pl-tbody').innerHTML = ''; });
  }

  function field(label, id, value, type, attrs) {
    return '<label class="pf-field"><span>' + esc(label) + '</span>' +
      '<input id="' + id + '" class="sa-input" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + ' /></label>';
  }
  function selectField(label, id, options, value) {
    var opts = options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    return '<label class="pf-field"><span>' + esc(label) + '</span><select id="' + id + '" class="sa-input">' + opts + '</select></label>';
  }
  function checkField(label, id, checked) {
    return '<label class="pf-check"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + ' /> <span>' + esc(label) + '</span></label>';
  }

  function showForm(plan) {
    var f = $('pl-form'); f.hidden = false;
    var ent = (plan && plan.entitlements) || {};
    var mods = ent.modules_enabled || [];
    var isEdit = !!plan;
    var modBoxes = MODULES.map(function (m) {
      return '<label class="pf-mod"><input type="checkbox" data-mod="' + esc(m) + '"' + (mods.indexOf(m) > -1 ? ' checked' : '') + ' /> ' + esc(m) + '</label>';
    }).join('');
    f.innerHTML =
      '<h3>' + (isEdit ? 'تعديل خطة — ' + esc(plan.plan_key) : 'خطة جديدة') + '</h3>' +
      '<div class="pf-grid">' +
        field('المفتاح (plan_key)', 'pf-key', plan ? plan.plan_key : '', 'text', isEdit ? 'disabled' : 'placeholder="مثل pro_2026"') +
        selectField('العملة', 'pf-currency', CURRENCIES, plan ? plan.currency : 'SAR') +
        field('الاسم (عربي)', 'pf-name_ar', plan ? plan.name_ar : '') +
        field('الاسم (إنجليزي)', 'pf-name_en', plan ? plan.name_en : '') +
        field('السعر الشهري', 'pf-monthly', plan ? plan.monthly_price : '0', 'number', 'min="0" step="0.01"') +
        field('السعر السنوي', 'pf-yearly', plan ? plan.yearly_price : '0', 'number', 'min="0" step="0.01"') +
        field('أيام التجربة', 'pf-trial', plan ? plan.trial_days : '0', 'number', 'min="0" max="365"') +
        field('الترتيب', 'pf-sort', plan ? plan.sort_order : '0', 'number') +
        field('حد المستخدمين (فارغ=غير محدود)', 'pf-max_users', ent.max_users, 'number', 'min="0"') +
        field('حد الفروع (فارغ=غير محدود)', 'pf-max_branches', ent.max_branches, 'number', 'min="0"') +
        field('حد الفواتير/شهر (فارغ=غير محدود)', 'pf-max_invoices', ent.max_invoices_per_month, 'number', 'min="0"') +
        selectField('مستوى الدعم', 'pf-support', SUPPORT, ent.support_level || 'standard') +
      '</div>' +
      '<div class="pf-desc">' +
        '<label class="pf-field"><span>الوصف (عربي)</span><textarea id="pf-desc_ar" class="sa-input">' + esc(plan ? plan.description_ar : '') + '</textarea></label>' +
        '<label class="pf-field"><span>الوصف (إنجليزي)</span><textarea id="pf-desc_en" class="sa-input">' + esc(plan ? plan.description_en : '') + '</textarea></label>' +
      '</div>' +
      '<div class="pf-checks">' +
        checkField('وصول API', 'pf-api', ent.api_access) +
        checkField('نطاق مخصّص', 'pf-domain', ent.custom_domain) +
      '</div>' +
      '<div class="pf-mods"><div class="sa-muted">الوحدات المُفعّلة:</div>' + modBoxes + '</div>' +
      '<div id="pf-errors" class="sa-state sa-error" hidden></div>' +
      '<div class="pf-actions">' +
        '<button class="sa-btn" data-action="pl-save" data-key="' + esc(plan ? plan.plan_key : '') + '">حفظ</button>' +
        '<button class="sa-btn sa-ghost" data-action="pl-cancel">إلغاء</button>' +
      '</div>';
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function numOrEmpty(id) { var v = $(id).value.trim(); return v === '' ? '' : v; }
  function collect() {
    var mods = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-mod]'), function (cb) { if (cb.checked) mods.push(cb.getAttribute('data-mod')); });
    return {
      plan_key: $('pf-key').value.trim(),
      name_ar: $('pf-name_ar').value.trim(), name_en: $('pf-name_en').value.trim(),
      description_ar: $('pf-desc_ar').value, description_en: $('pf-desc_en').value,
      currency: $('pf-currency').value,
      monthly_price: $('pf-monthly').value, yearly_price: $('pf-yearly').value,
      trial_days: $('pf-trial').value, sort_order: $('pf-sort').value,
      max_users: numOrEmpty('pf-max_users'), max_branches: numOrEmpty('pf-max_branches'),
      max_invoices_per_month: numOrEmpty('pf-max_invoices'),
      support_level: $('pf-support').value,
      api_access: $('pf-api').checked, custom_domain: $('pf-domain').checked,
      modules_enabled: mods
    };
  }
  function showErrors(list) {
    var e = $('pf-errors'); if (!e) return;
    if (!list || !list.length) { e.hidden = true; e.textContent = ''; return; }
    e.hidden = false; e.textContent = 'تعذّر الحفظ: ' + list.join(' · ');
  }

  function save(key) {
    var body = collect();
    var isEdit = !!key;
    var url = isEdit ? (API + '/plans/' + encodeURIComponent(key)) : (API + '/plans');
    showErrors(null); pstate('جارٍ الحفظ…');
    safeFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 400) { showErrors(res.j.details || [res.j.error || 'تحقق غير صالح']); pstate(''); return; }
        if (res.status === 409) { showErrors([res.j.error || 'المفتاح موجود']); pstate(''); return; }
        if (res.status >= 400) throw new Error('فشل الحفظ (' + res.status + ').');
        $('pl-form').hidden = true; load();
      })
      .catch(function (e) { pstate(e.message || 'خطأ.', true); });
  }

  function setActive(key, enable) {
    if (!window.confirm((enable ? 'تفعيل' : 'تعطيل') + ' الخطة ' + key + '؟')) return;
    pstate('جارٍ المعالجة…');
    safeFetch(API + '/plans/' + encodeURIComponent(key) + '/' + (enable ? 'enable' : 'disable'), { method: 'POST' })
      .then(function (r) { if (!r.ok) throw new Error('فشل الإجراء (' + r.status + ').'); return r.json(); })
      .then(function () { load(); })
      .catch(function (e) { pstate(e.message || 'خطأ.', true); });
  }

  // ----- tenant plan assignment (called by super-admin.js details view) -----
  function mountTenantPlan(tenantId, el) {
    if (!el) return;
    el.innerHTML = '<div class="sa-muted">جارٍ تحميل خطة المستأجر…</div>';
    Promise.all([
      safeFetch(API + '/tenants/' + encodeURIComponent(tenantId) + '/plan').then(function (r) { return r.ok ? r.json() : { current: null }; }),
      safeFetch(API + '/plans').then(function (r) { return r.ok ? r.json() : { plans: [] }; })
    ]).then(function (out) {
      var current = out[0].current;
      var active = (out[1].plans || []).filter(function (p) { return p.active; });
      var opts = active.map(function (p) { return '<option value="' + esc(p.plan_key) + '">' + esc(p.plan_key) + ' — ' + esc(p.name_ar) + '</option>'; }).join('');
      el.innerHTML =
        '<h4>الخطة الحالية</h4>' +
        '<div class="sa-kv"><span class="k">الخطة</span><span>' + (current ? '<code>' + esc(current.plan_key) + '</code> <span class="sa-muted">(' + esc(current.assignment_source) + ')</span>' : '— لا خطة —') + '</span></div>' +
        (active.length
          ? '<div class="pf-assign"><select id="sa-assign-plan" class="sa-input">' + opts + '</select>' +
            '<button class="sa-btn" data-action="pl-assign" data-id="' + esc(tenantId) + '">تعيين الخطة</button></div>'
          : '<div class="sa-muted">لا توجد خطط نشطة لتعيينها.</div>') +
        '<div id="sa-ent-mount"></div>';
      mountEntitlements(tenantId, $('sa-ent-mount'));
    }).catch(function () { el.innerHTML = '<div class="sa-state sa-error">تعذّر تحميل خطة المستأجر.</div>'; });
  }

  // OBSERVE-only: show resolved entitlements when the resolver is enabled. Silently skipped otherwise (404/disabled).
  function mountEntitlements(tenantId, el) {
    if (!el) return;
    safeFetch(API + '/tenants/' + encodeURIComponent(tenantId) + '/entitlements')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.entitlements) return; // resolver disabled -> show nothing
        var e = d.entitlements;
        function lim(v) { return v == null ? 'غير محدود' : esc(v); }
        el.innerHTML =
          '<h4>الاستحقاقات المحسوبة <span class="sa-badge ' + (d.source === 'plan' ? 'active' : 'trial') + '">' + esc(d.source) + '</span> <span class="sa-muted">(' + esc(d.enforcement_mode) + ')</span></h4>' +
          '<div class="sa-kv">' +
          '<span class="k">حد المستخدمين</span><span>' + lim(e.max_users) + '</span>' +
          '<span class="k">حد الفروع</span><span>' + lim(e.max_branches) + '</span>' +
          '<span class="k">حد الفواتير/شهر</span><span>' + lim(e.max_invoices_per_month) + '</span>' +
          '<span class="k">مستوى الدعم</span><span>' + esc(e.support_level || 'standard') + '</span>' +
          '<span class="k">وصول API</span><span>' + (e.api_access ? 'نعم' : 'لا') + '</span>' +
          '<span class="k">نطاق مخصّص</span><span>' + (e.custom_domain ? 'نعم' : 'لا') + '</span>' +
          '<span class="k">الوحدات</span><span>' + ((e.modules_enabled && e.modules_enabled.length) ? e.modules_enabled.map(esc).join('، ') : '—') + '</span>' +
          '</div>';
      })
      .catch(function () { /* observe-only: never disrupt the tenant view */ });
  }

  function assign(tenantId) {
    var sel = $('sa-assign-plan'); if (!sel) return;
    var key = sel.value;
    if (!window.confirm('تعيين الخطة ' + key + ' للمستأجر #' + tenantId + '؟')) return;
    safeFetch(API + '/tenants/' + encodeURIComponent(tenantId) + '/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_key: key, assignment_source: 'manual' })
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 409) { window.alert(res.j.error || 'لا يمكن تعيين خطة معطّلة.'); return; }
        if (res.status >= 400) throw new Error(res.j.error || ('فشل التعيين (' + res.status + ').'));
        mountTenantPlan(tenantId, $('sa-plan-mount'));
      })
      .catch(function (e) { window.alert(e.message || 'خطأ.'); });
  }

  // delegation: act ONLY on pl-* actions (tenant actions handled by super-admin.js)
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-action]'); if (!b) return;
    var action = b.getAttribute('data-action');
    var key = b.getAttribute('data-key');
    if (action === 'pl-edit') { var p = cache.filter(function (x) { return x.plan_key === key; })[0]; if (p) showForm(p); }
    else if (action === 'pl-disable') setActive(key, false);
    else if (action === 'pl-enable') setActive(key, true);
    else if (action === 'pl-save') save(key);
    else if (action === 'pl-cancel') { $('pl-form').hidden = true; }
    else if (action === 'pl-assign') assign(b.getAttribute('data-id'));
  });

  var newBtn = $('pl-new'); if (newBtn) newBtn.addEventListener('click', function () { showForm(null); });
  var refBtn = $('pl-refresh'); if (refBtn) refBtn.addEventListener('click', load);
  document.addEventListener('sa-tab', function (ev) {
    if (ev.detail && ev.detail.tab === 'plans' && !loadedOnce) { loadedOnce = true; load(); }
  });

  window.SAPlans = { mountTenantPlan: mountTenantPlan };
})();

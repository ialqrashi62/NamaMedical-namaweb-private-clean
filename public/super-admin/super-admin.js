/* Jumanasoft Super Admin — Tenant Control Center client (CSP-friendly: no inline handlers). */
(function () {
  'use strict';
  var API = '/api/super-admin';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function state(msg, isError) {
    var el = $('sa-state');
    if (!msg) { el.hidden = true; el.textContent = ''; el.className = 'sa-state'; return; }
    el.hidden = false; el.textContent = msg; el.className = 'sa-state' + (isError ? ' sa-error' : '');
  }
  
  // Onboarding Wizard global dependencies mapping
  window.tr = function(en, ar) { return ar; };
  window.escapeHTML = function(s) { return esc(s); };
  window.safeId = function(v) { const n = Number(v); return (v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(n)) ? n : ''; };
  window.showToast = function(msg, type) { state(msg, type === 'error'); };
  window.isArabic = true;
  function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('ar'); } catch (e) { return esc(d); } }
  function badge(status) {
    var label = { active: 'نشط', trial: 'تجريبي', suspended: 'معلّق', cancelled: 'ملغى' }[status] || esc(status);
    return '<span class="sa-badge ' + esc(status) + '">' + label + '</span>';
  }

  function rowHtml(t) {
    var act = '';
    if (t.status === 'suspended') act += '<button class="sa-btn" data-action="reactivate" data-id="' + t.id + '">إعادة تفعيل</button>';
    else if (t.status === 'active' || t.status === 'trial') act += '<button class="sa-btn sa-danger" data-action="suspend" data-id="' + t.id + '">تعليق</button>';
    act += '<button class="sa-btn sa-ghost" data-action="details" data-id="' + t.id + '">تفاصيل</button>';
    return '<tr>' +
      '<td>' + esc(t.id) + '</td>' +
      '<td>' + esc(t.name) + '</td>' +
      '<td>' + esc(t.subdomain) + '</td>' +
      '<td>' + badge(t.status) + '</td>' +
      '<td>' + esc(t.plan) + '</td>' +
      '<td>' + fmtDate(t.created_at) + '</td>' +
      '<td><div class="sa-row-actions">' + act + '</div></td>' +
    '</tr>';
  }

  function load() {
    state('جارٍ التحميل…');
    $('sa-detail').hidden = true;
    var qs = new URLSearchParams();
    if ($('sa-status').value) qs.set('status', $('sa-status').value);
    if ($('sa-plan').value.trim()) qs.set('plan', $('sa-plan').value.trim());
    if ($('sa-search').value.trim()) qs.set('q', $('sa-search').value.trim());
    fetch(API + '/tenants?' + qs.toString(), { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 403) throw new Error('يتطلّب صلاحية Super Admin.');
        if (!r.ok) throw new Error('تعذّر التحميل (' + r.status + ').');
        return r.json();
      })
      .then(function (data) {
        var tb = $('sa-tbody'); tb.innerHTML = '';
        if (!data.tenants || !data.tenants.length) { state('لا يوجد مستأجرون مطابقون.'); return; }
        state('');
        tb.innerHTML = data.tenants.map(rowHtml).join('');
      })
      .catch(function (e) { state(e.message || 'خطأ.', true); $('sa-tbody').innerHTML = ''; });
  }

  function details(id) {
    state('جارٍ تحميل التفاصيل…');
    fetch(API + '/tenants/' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('تعذّر تحميل التفاصيل (' + r.status + ').'); return r.json(); })
      .then(function (data) {
        state('');
        var t = data.tenant; var d = $('sa-detail'); d.hidden = false;
        d.innerHTML = '<h3>تفاصيل المستأجر — ' + esc(t.name) + ' ' + badge(t.status) + '</h3>' +
          '<div class="sa-kv">' +
          '<span class="k">المعرّف</span><span>' + esc(t.id) + '</span>' +
          '<span class="k">النطاق الفرعي</span><span>' + esc(t.subdomain) + '</span>' +
          '<span class="k">الخطة</span><span>' + esc(t.plan) + '</span>' +
          '<span class="k">عدد المستخدمين</span><span>' + (t.users == null ? '—' : esc(t.users)) + '</span>' +
          '<span class="k">عدد المنشآت</span><span>' + (t.facilities == null ? '—' : esc(t.facilities)) + '</span>' +
          '<span class="k">آخر نشاط</span><span>' + fmtDate(t.last_activity) + '</span>' +
          '<span class="k">أُنشئ</span><span>' + fmtDate(t.created_at) + '</span>' +
          '</div>' +
          '<div id="sa-plan-mount" class="sa-plan-mount"></div>';
        if (window.SAPlans && window.SAPlans.mountTenantPlan) {
          window.SAPlans.mountTenantPlan(t.id, document.getElementById('sa-plan-mount'));
        }
      })
      .catch(function (e) { state(e.message || 'خطأ.', true); });
  }

  function changeStatus(id, action) {
    var verb = action === 'suspend' ? 'تعليق' : 'إعادة تفعيل';
    if (!window.confirm('تأكيد ' + verb + ' المستأجر #' + id + '؟')) return;
    state('جارٍ ' + verb + '…');
    fetch(API + '/tenants/' + encodeURIComponent(id) + '/' + action, { method: 'POST', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 409) return r.json().then(function (j) { throw new Error(j.error || 'انتقال حالة غير مسموح.'); });
        if (!r.ok) throw new Error('فشل الإجراء (' + r.status + ').');
        return r.json();
      })
      .then(function () { load(); })
      .catch(function (e) { state(e.message || 'خطأ.', true); });
  }

  function loadStats() {
    fetch(API + '/stats', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('تعذّر تحميل الإحصائيات'); return r.json(); })
      .then(function (data) {
        $('stat-revenue').textContent = parseFloat(data.total_revenue || 0).toLocaleString('ar-SA') + ' SAR';
        $('stat-tenants').textContent = parseInt(data.total_tenants || 0, 10).toLocaleString('ar-SA');
        $('stat-active-subs').textContent = parseInt(data.active_subscriptions || 0, 10).toLocaleString('ar-SA');

        var chartContainer = $('sa-chart-bars');
        chartContainer.innerHTML = '';
        if (!data.plans_breakdown || !data.plans_breakdown.length) {
          chartContainer.innerHTML = '<div class="sa-muted">لا يوجد اشتراكات نشطة بعد.</div>';
          return;
        }

        var total = data.plans_breakdown.reduce(function (sum, row) { return sum + row.count; }, 0) || 1;
        var labels = {
          free_trial: 'فترة تجريبية (Free Trial)',
          basic: 'الباقة الأساسية (Basic)',
          premium: 'الباقة المتميزة (Premium)',
          enterprise: 'باقة المنشآت (Enterprise)'
        };

        data.plans_breakdown.forEach(function (pb) {
          var label = labels[pb.plan_key] || pb.plan_key;
          var pct = Math.round((pb.count / total) * 100);
          var row = document.createElement('div');
          row.className = 'sa-chart-bar-row';
          row.innerHTML = 
            '<div class="sa-chart-bar-lbl">' + esc(label) + '</div>' +
            '<div class="sa-chart-bar-outer"><div class="sa-chart-bar-inner" style="width: ' + pct + '%"></div></div>' +
            '<div class="sa-chart-bar-val">' + esc(pb.count) + ' (' + pct + '%)</div>';
          chartContainer.appendChild(row);
        });
      })
      .catch(function (e) { console.error(e); });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-action]'); if (!b) return;
    var id = b.getAttribute('data-id'); var action = b.getAttribute('data-action');
    if (action === 'details') details(id);
    else if (action === 'suspend' || action === 'reactivate') changeStatus(id, action);
  });
  $('sa-refresh').addEventListener('click', load);
  $('sa-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
  $('sa-status').addEventListener('change', load);
  
  // Onboarding Wizard open handler
  var onboardBtn = $('sa-onboard-btn');
  if (onboardBtn) {
    onboardBtn.addEventListener('click', function() {
      if (window.NamaOnboardingWizard) window.NamaOnboardingWizard.open();
    });
  }

  // Tab switching (CSP-friendly delegation). Emits a 'sa-tab' CustomEvent so plans-admin can lazy-load.
  var tabs = document.getElementById('sa-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tab]'); if (!b) return;
      var tab = b.getAttribute('data-tab');
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (el) {
        el.classList.toggle('active', el === b);
      });
      var pt = $('panel-tenants'), pp = $('panel-plans'), po = $('panel-overview');
      if (pt) pt.hidden = (tab !== 'tenants');
      if (pp) pp.hidden = (tab !== 'plans');
      if (po) po.hidden = (tab !== 'overview');
      if (tab === 'overview') loadStats();
      if (tab === 'tenants') load();
      document.dispatchEvent(new CustomEvent('sa-tab', { detail: { tab: tab } }));
    });
  }
  loadStats();
})();

#!/usr/bin/env python3
"""
تطبيق تعديلين آمنين على app.js:
1. إضافة renderOVR و renderAuditLog إلى مصفوفة الصفحات
2. استبدال renderInfectionControl بنسخة محسّنة ذات تبويبات HAI
"""
import sys

path = r'public\js\app.js'

with open(path, 'rb') as f:
    content = f.read()

# ============================================================
# التعديل 1: إضافة renderOVR و renderAuditLog للصفحات
# ============================================================
old_pages = b"renderDental];"
new_pages = b"renderDental, renderSpecialties, renderOVR, renderAuditLog];"

if old_pages in content:
    content = content.replace(old_pages, new_pages, 1)
    print("OK: pages array updated")
else:
    print("WARN: pages array pattern not found, trying alternate...")
    # try without renderDental
    old2 = b"renderSettings, renderDental];"
    new2 = b"renderSettings, renderDental, renderSpecialties, renderOVR, renderAuditLog];"
    if old2 in content:
        content = content.replace(old2, new2, 1)
        print("OK: pages array updated (alternate)")
    else:
        print("ERROR: cannot find pages array")

# ============================================================
# التعديل 2: استبدال renderInfectionControl القديمة
# ============================================================

# الكود القديم (من L14313 إلى L14384 في الملف الأصلي)
old_ic_start = b"// ===== INFECTION CONTROL =====\r\nlet icTab = 'surveillance';\r\nasync function renderInfectionControl(el) {"
old_ic_end = b"window.addHHAudit = async function () {\r\n  try { await API.post('/api/infection/hand-hygiene', { department: document.getElementById('hhDept').value, moments_observed: document.getElementById('hhObs').value, moments_compliant: document.getElementById('hhComp').value, auditor: currentUser?.display_name }); showToast(tr('Recorded!', '\u062a\u0645 \u0627\u0644\u062a\u0633\u062c\u064a\u0644!')); await navigateTo(26); } catch (e) { showToast(tr('Error', '\u062e\u0637\u0623'), 'error'); }\r\n};"

start_pos = content.find(old_ic_start)
end_pos = content.find(old_ic_end)
if start_pos < 0:
    print("ERROR: cannot find IC start marker")
elif end_pos < 0:
    print("ERROR: cannot find IC end marker")
else:
    end_full = end_pos + len(old_ic_end)
    print(f"OK: IC block found at bytes {start_pos}-{end_full}")
    
    new_ic_block = (
        b"// ===== INFECTION CONTROL =====\r\n"
        b"async function renderInfectionControl(el) {\r\n"
        b"  const content = el;\r\n"
        b"  const reports = await API.get('/api/infection-control/reports').catch(() => []);\r\n"
        b"  const active = reports.filter(r => r.status === 'active').length;\r\n"
        b"  const byType = {};\r\n"
        b"  reports.forEach(r => { const t = r.infection_type || 'Other'; byType[t] = (byType[t] || 0) + 1; });\r\n"
        b"  const hai = { CLABSI: 0, CAUTI: 0, VAP: 0, SSI: 0, CDIFF: 0 };\r\n"
        b"  reports.forEach(r => { if (r.hai_category && hai[r.hai_category] !== undefined) hai[r.hai_category]++; });\r\n"
        b"  if (!window.icTab) window.icTab = 'dashboard';\r\n"
        b"\r\n"
        b"  content.innerHTML = `\r\n"
        b"    <div class=\"page-title\">\xf0\x9f\xa6\xa0 ${tr('Infection Control & HAI Surveillance','\xd9\x85\xd9\x83\xd8\xa7\xd9\x81\xd8\xad\xd8\xa9 \xd8\xa7\xd9\x84\xd8\xb9\xd8\xaf\xd9\x88\xd9\x89 \xd9\x88\xd8\xaa\xd8\xb1\xd8\xb5\xd8\xaf \xd8\xa7\xd9\x84\xd8\xb9\xd8\xaf\xd9\x88\xd9\x89 \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd8\xaa\xd8\xa8\xd8\xb7\xd8\xa9 \xd8\xa8\xd8\xa7\xd9\x84\xd8\xb1\xd8\xb9\xd8\xa7\xd9\x8a\xd8\xa9')}</div>\r\n"
        b"    <div style=\"display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:12px;flex-wrap:wrap\">\r\n"
        b"      <button class=\"btn ${window.icTab==='dashboard'?'btn-primary':'btn-secondary'}\" onclick=\"window.icTab='dashboard';navigateTo(26)\" style=\"font-size:12px\">\xf0\x9f\x93\x8a ${tr('HAI Dashboard','\xd9\x84\xd9\x88\xd8\xad\xd8\xa9 \xd8\xa7\xd9\x84\xd8\xaa\xd8\xb1\xd8\xb5\xd8\xaf')}</button>\r\n"
        b"      <button class=\"btn ${window.icTab==='report'?'btn-primary':'btn-secondary'}\" onclick=\"window.icTab='report';navigateTo(26)\" style=\"font-size:12px\">\xf0\x9f\xa6\xa0 ${tr('Report Infection','\xd8\xaa\xd8\xb3\xd8\xac\xd9\x8a\xd9\x84 \xd8\xb9\xd8\xaf\xd9\x88\xd9\x89')}</button>\r\n"
        b"      <button class=\"btn ${window.icTab==='hygiene'?'btn-primary':'btn-secondary'}\" onclick=\"window.icTab='hygiene';navigateTo(26)\" style=\"font-size:12px\">\xf0\x9f\xa4\xb2 ${tr('Hand Hygiene','\xd8\xb5\xd8\xad\xd8\xa9 \xd8\xa7\xd9\x84\xd8\xa3\xd9\x8a\xd8\xaf\xd9\x8a')}</button>\r\n"
        b"      <button class=\"btn ${window.icTab==='isolation'?'btn-primary':'btn-secondary'}\" onclick=\"window.icTab='isolation';navigateTo(26)\" style=\"font-size:12px\">\xf0\x9f\x9a\xaa ${tr('Isolation','\xd8\xa7\xd9\x84\xd8\xb9\xd8\xb2\xd9\x84')}</button>\r\n"
        b"    </div>\r\n"
        b"    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px\">\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #ef4444\"><div style=\"font-size:24px;font-weight:800;color:#ef4444\">${reports.length}</div><div style=\"font-size:11px;color:var(--text-muted)\">${tr('Total','\xd8\xa5\xd8\xac\xd9\x85\xd8\xa7\xd9\x84\xd9\x8a')}</div></div>\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #f97316\"><div style=\"font-size:24px;font-weight:800;color:#f97316\">${active}</div><div style=\"font-size:11px;color:var(--text-muted)\">${tr('Active','\xd9\x86\xd8\xb4\xd8\xb7\xd8\xa9')}</div></div>\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #8b5cf6\"><div style=\"font-size:24px;font-weight:800;color:#8b5cf6\">${hai.CLABSI}</div><div style=\"font-size:11px;color:var(--text-muted)\">CLABSI</div></div>\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #3b82f6\"><div style=\"font-size:24px;font-weight:800;color:#3b82f6\">${hai.CAUTI}</div><div style=\"font-size:11px;color:var(--text-muted)\">CAUTI</div></div>\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #06b6d4\"><div style=\"font-size:24px;font-weight:800;color:#06b6d4\">${hai.VAP}</div><div style=\"font-size:11px;color:var(--text-muted)\">VAP</div></div>\r\n"
        b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #22c55e\"><div style=\"font-size:24px;font-weight:800;color:#22c55e\">${hai.SSI}</div><div style=\"font-size:11px;color:var(--text-muted)\">SSI</div></div>\r\n"
        b"    </div>\r\n"
        b"    <div id=\"icTabContent\"></div>`;\r\n"
        b"\r\n"
        b"  const icCont = document.getElementById('icTabContent');\r\n"
        b"  if (!icCont) return;\r\n"
        b"\r\n"
        b"  if (window.icTab === 'dashboard') {\r\n"
        b"    icCont.innerHTML = `\r\n"
        b"      <div class=\"card\" style=\"padding:20px\">\r\n"
        b"        <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:16px\">\r\n"
        b"          <h4 style=\"margin:0\">\xf0\x9f\x93\x8b ${tr('Infection Reports','\xd8\xb3\xd8\xac\xd9\x84 \xd8\xa7\xd9\x84\xd8\xa8\xd9\x84\xd8\xa7\xd8\xba\xd8\xa7\xd8\xaa')}</h4>\r\n"
        b"          <button class=\"btn btn-sm btn-secondary\" onclick=\"exportToCSV([],'hai_reports')\">\xf0\x9f\x93\xa5 ${tr('Export','\xd8\xaa\xd8\xb5\xd8\xaf\xd9\x8a\xd8\xb1')}</button>\r\n"
        b"        </div>\r\n"
        b"        <div id=\"icTable\"></div>\r\n"
        b"      </div>`;\r\n"
        b"    const ict = document.getElementById('icTable');\r\n"
        b"    if (ict) createTable(ict,'icTbl',\r\n"
        b"      [tr('Patient','\xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd9\x8a\xd8\xb6'),tr('Type','\xd8\xa7\xd9\x84\xd9\x86\xd9\x88\xd8\xb9'),'HAI',tr('Ward','\xd8\xa7\xd9\x84\xd8\xac\xd9\x86\xd8\xa7\xd8\xad'),tr('Isolation','\xd8\xa7\xd9\x84\xd8\xb9\xd8\xb2\xd9\x84'),tr('Status','\xd8\xa7\xd9\x84\xd8\xad\xd8\xa7\xd9\x84\xd8\xa9'),tr('Date','\xd8\xa7\xd9\x84\xd8\xaa\xd8\xa7\xd8\xb1\xd9\x8a\xd8\xae'),''],\r\n"
        b"      reports.map(r=>({cells:[\r\n"
        b"        r.patient_name||'',r.infection_type||'',\r\n"
        b"        r.hai_category?rawHtml(`<span class=\"badge\" style=\"background:#8b5cf6;color:#fff\">${escapeHTML(r.hai_category)}</span>`):'--',\r\n"
        b"        r.ward||'',r.isolation_type||'',statusBadge(r.status),\r\n"
        b"        r.created_at?new Date(r.created_at).toLocaleDateString('ar-SA'):'',\r\n"
        b"        r.status==='active'?rawHtml(`<button class=\"btn btn-sm\" onclick=\"resolveIc(${parseInt(r.id,10)})\">\xe2\x9c\x85 ${tr('Resolve','\xd8\xad\xd9\x84')}</button>`):'\\xe2\\x9c\\x85'\r\n"
        b"      ],id:r.id}))\r\n"
        b"    );\r\n"
        b"\r\n"
        b"  } else if (window.icTab === 'report') {\r\n"
        b"    icCont.innerHTML = `\r\n"
        b"      <div class=\"card\" style=\"padding:20px;max-width:600px\">\r\n"
        b"        <h4 style=\"margin:0 0 16px;color:var(--primary)\">\xf0\x9f\xa6\xa0 ${tr('Report Infection Case','\xd8\xaa\xd8\xb3\xd8\xac\xd9\x8a\xd9\x84 \xd8\xad\xd8\xa7\xd9\x84\xd8\xa9 \xd8\xb9\xd8\xaf\xd9\x88\xd9\x89')}</h4>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Patient Name','\xd8\xa7\xd8\xb3\xd9\x85 \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd9\x8a\xd8\xb6')}</label><input class=\"form-input\" id=\"icPatient\" required></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Infection Type','\xd9\x86\xd9\x88\xd8\xb9 \xd8\xa7\xd9\x84\xd8\xb9\xd8\xaf\xd9\x88\xd9\x89')}</label>\r\n"
        b"          <select class=\"form-input\" id=\"icType\"><option value=\"MRSA\">MRSA</option><option value=\"VRE\">VRE</option><option value=\"C.diff\">C. difficile</option><option value=\"ESBL\">ESBL</option><option value=\"TB\">TB</option><option value=\"COVID-19\">COVID-19</option><option value=\"UTI\">UTI</option><option value=\"SSI\">SSI</option><option value=\"Other\">${tr('Other','\xd8\xa3\xd8\xae\xd8\xb1\xd9\x89')}</option></select></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">HAI ${tr('Category','\xd8\xa7\xd9\x84\xd9\x81\xd8\xa6\xd8\xa9')}</label>\r\n"
        b"          <select class=\"form-input\" id=\"icHAI\"><option value=\"\">${tr('None','\xd9\x84\xd8\xa7 \xd9\x8a\xd9\x88\xd8\xac\xd8\xaf')}</option><option value=\"CLABSI\">CLABSI</option><option value=\"CAUTI\">CAUTI</option><option value=\"VAP\">VAP</option><option value=\"SSI\">SSI</option><option value=\"CDIFF\">C.DIFF</option></select></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Ward','\xd8\xa7\xd9\x84\xd8\xac\xd9\x86\xd8\xa7\xd8\xad')}</label><input class=\"form-input\" id=\"icWard\"></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Isolation Type','\xd9\x86\xd9\x88\xd8\xb9 \xd8\xa7\xd9\x84\xd8\xb9\xd8\xb2\xd9\x84')}</label>\r\n"
        b"          <select class=\"form-input\" id=\"icIsolation\"><option value=\"none\">${tr('None','\xd8\xa8\xd8\xaf\xd9\x88\xd9\x86')}</option><option value=\"contact\">${tr('Contact','\xd8\xaa\xd9\x84\xd8\xa7\xd9\x85\xd8\xb3\xd9\x8a')}</option><option value=\"droplet\">${tr('Droplet','\xd8\xb1\xd8\xb0\xd8\xa7\xd8\xb0\xd9\x8a')}</option><option value=\"airborne\">${tr('Airborne','\xd9\x87\xd9\x88\xd8\xa7\xd8\xa6\xd9\x8a')}</option><option value=\"protective\">${tr('Protective','\xd9\x88\xd9\x82\xd8\xa7\xd8\xa6\xd9\x8a')}</option></select></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Organism','\xd8\xa7\xd9\x84\xd9\x83\xd8\xa7\xd8\xa6\xd9\x86 \xd8\xa7\xd9\x84\xd8\xaf\xd9\x82\xd9\x8a\xd9\x82')}</label><input class=\"form-input\" id=\"icOrganism\" placeholder=\"e.g. MRSA, Klebsiella\"></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Culture Results','\xd9\x86\xd8\xaa\xd8\xa7\xd8\xa6\xd8\xac \xd8\xa7\xd9\x84\xd8\xb2\xd8\xb1\xd8\xa7\xd8\xb9\xd8\xa9')}</label><textarea class=\"form-input\" id=\"icCulture\" rows=\"2\"></textarea></div>\r\n"
        b"        <div class=\"form-group\"><label class=\"form-label\">${tr('Action Taken','\xd8\xa7\xd9\x84\xd8\xa5\xd8\xac\xd8\xb1\xd8\xa7\xd8\xa1 \xd8\xa7\xd9\x84\xd9\x85\xd8\xaa\xd8\xae\xd8\xb0')}</label><textarea class=\"form-input\" id=\"icAction\" rows=\"2\"></textarea></div>\r\n"
        b"        <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"window.reportInfection()\">\xf0\x9f\xa6\xa0 ${tr('Submit Report','\xd8\xaa\xd9\x82\xd8\xaf\xd9\x8a\xd9\x85 \xd8\xa7\xd9\x84\xd8\xa8\xd9\x84\xd8\xa7\xd8\xba')}</button>\r\n"
        b"      </div>`;\r\n"
        b"\r\n"
        b"  } else if (window.icTab === 'hygiene') {\r\n"
        b"    const hhData = await API.get('/api/infection/hand-hygiene').catch(() => []);\r\n"
        b"    const hhAvg = hhData.length ? Math.round(hhData.reduce((s,h)=>s+(h.compliance_rate||(h.moments_observed?Math.round((h.moments_compliant/h.moments_observed)*100):0)),0)/hhData.length) : 0;\r\n"
        b"    icCont.innerHTML = `\r\n"
        b"      <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:20px\">\r\n"
        b"        <div class=\"card\" style=\"padding:20px\">\r\n"
        b"          <h4 style=\"margin:0 0 16px;color:var(--primary)\">\xf0\x9f\xa4\xb2 ${tr('Hand Hygiene Audit','\xd8\xaa\xd8\xaf\xd9\x82\xd9\x8a\xd9\x82 \xd9\x86\xd8\xb8\xd8\xa7\xd9\x81\xd8\xa9 \xd8\xa7\xd9\x84\xd8\xa3\xd9\x8a\xd8\xaf\xd9\x8a')}</h4>\r\n"
        b"          <div class=\"form-group\"><label class=\"form-label\">${tr('Department','\xd8\xa7\xd9\x84\xd9\x82\xd8\xb3\xd9\x85')}</label><input class=\"form-input\" id=\"hhDept\"></div>\r\n"
        b"          <div class=\"form-group\"><label class=\"form-label\">${tr('Moments Observed','\xd8\xa7\xd9\x84\xd9\x84\xd8\xad\xd8\xb8\xd8\xa7\xd8\xaa \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd8\xa7\xd9\x82\xd9\x8e\xd8\xa8\xd8\xa9')}</label><input class=\"form-input\" id=\"hhObs\" type=\"number\" min=\"1\"></div>\r\n"
        b"          <div class=\"form-group\"><label class=\"form-label\">${tr('Moments Compliant','\xd8\xa7\xd9\x84\xd9\x84\xd8\xad\xd8\xb8\xd8\xa7\xd8\xaa \xd8\xa7\xd9\x84\xd9\x85\xd9\x84\xd8\xaa\xd8\xb2\xd9\x85\xd8\xa9')}</label><input class=\"form-input\" id=\"hhComp\" type=\"number\" min=\"0\"></div>\r\n"
        b"          <div class=\"form-group\"><label class=\"form-label\">${tr('Shift','\xd8\xa7\xd9\x84\xd9\x85\xd9\x86\xd8\xa7\xd9\x88\xd8\xa8\xd8\xa9')}</label><select class=\"form-input\" id=\"hhShift\"><option>Morning</option><option>Afternoon</option><option>Night</option></select></div>\r\n"
        b"          <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"window.addHHAudit()\">\xe2\x9c\x8b ${tr('Record Audit','\xd8\xaa\xd8\xb3\xd8\xac\xd9\x8a\xd9\x84')}</button>\r\n"
        b"        </div>\r\n"
        b"        <div class=\"card\" style=\"padding:20px\">\r\n"
        b"          <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\r\n"
        b"            <h4 style=\"margin:0\">\xf0\x9f\x93\x88 ${tr('Compliance Trend','\xd8\xa7\xd8\xaa\xd8\xac\xd8\xa7\xd9\x87 \xd8\xa7\xd9\x84\xd8\xa7\xd9\x84\xd8\xaa\xd8\xb2\xd8\xa7\xd9\x85')}</h4>\r\n"
        b"            <div style=\"font-size:24px;font-weight:800;color:${hhAvg>=80?'#22c55e':hhAvg>=60?'#f97316':'#ef4444'}\">${hhAvg}%</div>\r\n"
        b"          </div>\r\n"
        b"          <div style=\"background:${hhAvg>=80?'#f0fdf4':hhAvg>=60?'#fff7ed':'#fef2f2'};padding:10px;border-radius:8px;margin-bottom:12px;font-size:12px\">\r\n"
        b"            WHO Target: >= 80% | CBAHI Min: >= 75%\r\n"
        b"            ${hhAvg>=80?' \xe2\x9c\x85 Compliant':hhAvg>=75?' \xe2\x9a\xa0\xef\xb8\x8f Near Target':' \xe2\x9d\x8c Below Target'}\r\n"
        b"          </div>\r\n"
        b"          ${hhData.length?`<table class=\"data-table\"><thead><tr><th>${tr('Dept','\xd8\xa7\xd9\x84\xd9\x82\xd8\xb3\xd9\x85')}</th><th>Obs</th><th>Comp</th><th>Rate</th><th>${tr('Date','\xd8\xa7\xd9\x84\xd8\xaa\xd8\xa7\xd8\xb1\xd9\x8a\xd8\xae')}</th></tr></thead><tbody>${hhData.slice(0,15).map(h=>{const r2=h.compliance_rate||(h.moments_observed?Math.round((h.moments_compliant/h.moments_observed)*100):0);return`<tr><td>${escapeHTML(h.department||'')}</td><td>${h.moments_observed||0}</td><td>${h.moments_compliant||0}</td><td style=\"font-weight:700;color:${r2>=80?'#22c55e':r2>=60?'#f97316':'#ef4444'}\">${r2}%</td><td style=\"font-size:11px\">${(h.created_at||'').slice(0,10)}</td></tr>`;}).join('')}</tbody></table>`:'<p style=\"text-align:center;color:var(--text-muted)\">' + tr('No audits yet','\xd9\x84\xd8\xa7 \xd9\x8a\xd9\x88\xd8\xac\xd8\xaf \xd8\xaa\xd8\xaf\xd9\x82\xd9\x8a\xd9\x82\xd8\xa7\xd8\xaa') + '</p>'}\r\n"
        b"        </div>\r\n"
        b"      </div>`;\r\n"
        b"\r\n"
        b"  } else if (window.icTab === 'isolation') {\r\n"
        b"    const isolated = reports.filter(r=>r.isolation_type&&r.isolation_type!=='none'&&r.status==='active');\r\n"
        b"    const isoColors={contact:'#f97316',droplet:'#3b82f6',airborne:'#ef4444',protective:'#22c55e'};\r\n"
        b"    icCont.innerHTML=`<div class=\"card\" style=\"padding:20px\">\r\n"
        b"      <h4 style=\"margin:0 0 16px\">\xf0\x9f\x9a\xaa ${tr('Active Isolation Rooms','\xd8\xba\xd8\xb1\xd9\x81 \xd8\xa7\xd9\x84\xd8\xb9\xd8\xb2\xd9\x84 \xd8\xa7\xd9\x84\xd9\x86\xd8\xb4\xd8\xb7\xd8\xa9')} (${isolated.length})</h4>\r\n"
        b"      ${!isolated.length?`<div style=\"text-align:center;padding:40px;color:var(--text-muted)\"><div style=\"font-size:48px\">\xe2\x9c\x85</div><p>${tr('No active isolations','\xd9\x84\xd8\xa7 \xd8\xaa\xd9\x88\xd8\xac\xd8\xaf \xd8\xb9\xd8\xb2\xd9\x84 \xd9\x86\xd8\xb4\xd8\xb7\xd8\xa9')}</p></div>`\r\n"
        b"      :`<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px\">${isolated.map(r=>`<div style=\"padding:14px;border-radius:10px;border:2px solid ${isoColors[r.isolation_type]||'#999'};background:${isoColors[r.isolation_type]||'#999'}15\"><div style=\"display:flex;justify-content:space-between;margin-bottom:6px\"><strong>${escapeHTML(r.patient_name||'')}</strong><span class=\"badge\" style=\"background:${isoColors[r.isolation_type]||'#999'};color:#fff;font-size:10px\">${(r.isolation_type||'').toUpperCase()}</span></div><div style=\"font-size:12px;color:var(--text-muted)\">\xf0\x9f\xa6\xa0 ${escapeHTML(r.infection_type||'')}${r.hai_category?' \\xc2\\xb7 <strong>'+escapeHTML(r.hai_category)+'</strong>':''}</div><div style=\"font-size:12px;color:var(--text-muted)\">\xf0\x9f\x8f\xa5 ${escapeHTML(r.ward||'\\xe2\\x80\\x94')}</div><div style=\"font-size:11px;color:var(--text-muted)\">\xf0\x9f\x93\x85 ${(r.created_at||'').slice(0,10)}</div><button class=\"btn btn-sm\" style=\"width:100%;margin-top:8px\" onclick=\"resolveIc(${parseInt(r.id,10)})\">\xe2\x9c\x85 ${tr('Resolve','\xd8\xa5\xd8\xba\xd9\x84\xd8\xa7\xd9\x82')}</button></div>`).join('')}</div>`}\r\n"
        b"    </div>`;\r\n"
        b"  }\r\n"
        b"\r\n"
        b"  window.resolveIc = async (id) => {\r\n"
        b"    try { await API.put('/api/infection-control/reports/'+id,{status:'resolved'}); showToast('\xe2\x9c\x85 '+tr('Case resolved','\xd8\xaa\xd9\x85 \xd8\xa7\xd9\x84\xd8\xa5\xd8\xba\xd9\x84\xd8\xa7\xd9\x82')); navigateTo(currentPage); }\r\n"
        b"    catch(e) { showToast(tr('Error','\xd8\xae\xd8\xb7\xd8\xa3'),'error'); }\r\n"
        b"  };\r\n"
        b"}\r\n"
        b"window.reportInfection = async function() {\r\n"
        b"  const p=document.getElementById('icPatient')?.value?.trim();\r\n"
        b"  const t=document.getElementById('icType')?.value;\r\n"
        b"  if(!p||!t) return showToast(tr('Patient name and type required','\xd9\x85\xd8\xb7\xd9\x84\xd9\x88\xd8\xa8 \xd8\xa7\xd8\xb3\xd9\x85 \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd9\x8a\xd8\xb6 \xd9\x88\xd8\xa7\xd9\x84\xd9\x86\xd9\x88\xd8\xb9'),'error');\r\n"
        b"  try {\r\n"
        b"    await API.post('/api/infection/surveillance',{patient_name:p,infection_type:t,organism:document.getElementById('icOrganism')?.value,ward:document.getElementById('icWard')?.value,hai_category:document.getElementById('icHAI')?.value,isolation_type:document.getElementById('icIsolation')?.value,culture_results:document.getElementById('icCulture')?.value,action_taken:document.getElementById('icAction')?.value,reported_by:currentUser?.display_name});\r\n"
        b"    showToast(tr('Reported!','\xd8\xaa\xd9\x85 \xd8\xa7\xd9\x84\xd8\xaa\xd8\xb3\xd8\xac\xd9\x8a\xd9\x84!'));\r\n"
        b"    await navigateTo(26);\r\n"
        b"  } catch(e){showToast(tr('Error','\xd8\xae\xd8\xb7\xd8\xa3'),'error');}\r\n"
        b"};\r\n"
        b"window.addHHAudit = async function() {\r\n"
        b"  const dept=document.getElementById('hhDept')?.value?.trim();\r\n"
        b"  const obs=parseInt(document.getElementById('hhObs')?.value)||0;\r\n"
        b"  const comp=parseInt(document.getElementById('hhComp')?.value)||0;\r\n"
        b"  if(!dept||!obs) return showToast(tr('Enter department and observations','\xd8\xa3\xd8\xaf\xd8\xae\xd9\x84 \xd8\xa7\xd9\x84\xd9\x82\xd8\xb3\xd9\x85 \xd9\x88\xd8\xb9\xd8\xaf\xd8\xaf \xd8\xa7\xd9\x84\xd9\x84\xd8\xad\xd8\xb8\xd8\xa7\xd8\xaa'),'error');\r\n"
        b"  if(comp>obs) return showToast(tr('Compliant cannot exceed observed','\xd8\xa7\xd9\x84\xd9\x85\xd9\x84\xd8\xaa\xd8\xb2\xd9\x85 \xd9\x84\xd8\xa7 \xd9\x8a\xd8\xaa\xd8\xac\xd8\xa7\xd9\x88\xd8\xb2 \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd8\xa7\xd9\x82\xd9\x8e\xd8\xa8'),'error');\r\n"
        b"  try {\r\n"
        b"    await API.post('/api/infection/hand-hygiene',{department:dept,moments_observed:obs,moments_compliant:comp,shift:document.getElementById('hhShift')?.value,auditor:currentUser?.display_name});\r\n"
        b"    showToast(tr('Audit recorded!','\xd8\xaa\xd9\x85 \xd8\xaa\xd8\xb3\xd8\xac\xd9\x8a\xd9\x84 \xd8\xa7\xd9\x84\xd8\xaa\xd8\xaf\xd9\x82\xd9\x8a\xd9\x82!'));\r\n"
        b"    await navigateTo(26);\r\n"
        b"  } catch(e){showToast(tr('Error','\xd8\xae\xd8\xb7\xd8\xa3'),'error');}\r\n"
        b"};"
    )
    
    content = content[:start_pos] + new_ic_block + b"\r\n" + content[end_full:]
    print(f"OK: renderInfectionControl replaced ({len(new_ic_block)} bytes)")

# ============================================================
# التعديل 3: إضافة renderOVR و renderAuditLog قبل // ===== QUALITY
# ============================================================
quality_marker = b"// ===== QUALITY ====="

ovr_auditlog_code = (
    b"// ===== OVR (Occurrence Variance Reports) =====\r\n"
    b"async function renderOVR(el) {\r\n"
    b"  const content = el;\r\n"
    b"  if (!window.ovrTab) window.ovrTab = 'list';\r\n"
    b"  const ovrs = await API.get('/api/ovr/reports').catch(() => []);\r\n"
    b"  const openCount = ovrs.filter(r=>r.status==='open').length;\r\n"
    b"  content.innerHTML = `\r\n"
    b"    <div class=\"page-title\">\xf0\x9f\x93\x8b ${tr('OVR - Occurrence Variance Reports','\xd8\xaa\xd9\x82\xd8\xa7\xd8\xb1\xd9\x8a\xd8\xb1 \xd8\xa7\xd9\x84\xd8\xa7\xd9\x86\xd8\xad\xd8\xb1\xd8\xa7\xd9\x81\xd8\xa7\xd8\xaa')}</div>\r\n"
    b"    <div style=\"display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap\">\r\n"
    b"      <button class=\"btn ${window.ovrTab==='list'?'btn-primary':'btn-secondary'}\" onclick=\"window.ovrTab='list';navigateTo(currentPage)\">\xf0\x9f\x93\x8b ${tr('Reports List','\xd9\x82\xd8\xa7\xd8\xa6\xd9\x85\xd8\xa9 \xd8\xa7\xd9\x84\xd8\xaa\xd9\x82\xd8\xa7\xd8\xb1\xd9\x8a\xd8\xb1')}</button>\r\n"
    b"      <button class=\"btn ${window.ovrTab==='new'?'btn-primary':'btn-secondary'}\" onclick=\"window.ovrTab='new';navigateTo(currentPage)\">\xe2\x9e\x95 ${tr('New Report','\xd8\xaa\xd9\x82\xd8\xb1\xd9\x8a\xd8\xb1 \xd8\xac\xd8\xaf\xd9\x8a\xd8\xaf')}</button>\r\n"
    b"    </div>\r\n"
    b"    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px\">\r\n"
    b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #3b82f6\"><div style=\"font-size:24px;font-weight:800;color:#3b82f6\">${ovrs.length}</div><div style=\"font-size:11px;color:var(--text-muted)\">${tr('Total OVRs','\xd8\xa5\xd8\xac\xd9\x85\xd8\xa7\xd9\x84\xd9\x8a')}</div></div>\r\n"
    b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #f97316\"><div style=\"font-size:24px;font-weight:800;color:#f97316\">${openCount}</div><div style=\"font-size:11px;color:var(--text-muted)\">${tr('Open','\xd9\x85\xd9\x81\xd8\xaa\xd9\x88\xd8\xad\xd8\xa9')}</div></div>\r\n"
    b"      <div class=\"card\" style=\"padding:14px;text-align:center;border-top:3px solid #22c55e\"><div style=\"font-size:24px;font-weight:800;color:#22c55e\">${ovrs.length-openCount}</div><div style=\"font-size:11px;color:var(--text-muted)\">${tr('Closed','\xd9\x85\xd8\xba\xd9\x84\xd9\x82\xd8\xa9')}</div></div>\r\n"
    b"    </div>\r\n"
    b"    <div id=\"ovrContent\"></div>`;\r\n"
    b"  const ovrCont = document.getElementById('ovrContent');\r\n"
    b"  if (!ovrCont) return;\r\n"
    b"  if (window.ovrTab === 'list') {\r\n"
    b"    ovrCont.innerHTML = `<div class=\"card\" style=\"padding:20px\"><div id=\"ovrTable\"></div></div>`;\r\n"
    b"    const ot = document.getElementById('ovrTable');\r\n"
    b"    if (ot) createTable(ot,'ovrTbl',\r\n"
    b"      [tr('ID','\xd8\xa7\xd9\x84\xd8\xb1\xd9\x82\xd9\x85'),tr('Type','\xd8\xa7\xd9\x84\xd9\x86\xd9\x88\xd8\xb9'),tr('Severity','\xd8\xa7\xd9\x84\xd8\xae\xd8\xb7\xd9\x88\xd8\xb1\xd8\xa9'),tr('Status','\xd8\xa7\xd9\x84\xd8\xad\xd8\xa7\xd9\x84\xd8\xa9'),tr('Reporter','\xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd8\xa7\xd8\xb3\xd9\x84'),tr('Date','\xd8\xa7\xd9\x84\xd8\xaa\xd8\xa7\xd8\xb1\xd9\x8a\xd8\xae')],\r\n"
    b"      ovrs.map(r=>({cells:[r.id,r.incident_type||'',r.severity||'',statusBadge(r.status||''),r.reporter_name||'',r.created_at?(new Date(r.created_at)).toLocaleDateString('ar-SA'):'']}))\r\n"
    b"    );\r\n"
    b"  } else if (window.ovrTab === 'new') {\r\n"
    b"    ovrCont.innerHTML = `<div class=\"card\" style=\"padding:20px;max-width:600px\">\r\n"
    b"      <h4 style=\"margin:0 0 16px\">\xe2\x9e\x95 ${tr('New OVR Report','\xd8\xaa\xd9\x82\xd8\xb1\xd9\x8a\xd8\xb1 \xd8\xa7\xd9\x86\xd8\xad\xd8\xb1\xd8\xa7\xd9\x81 \xd8\xac\xd8\xaf\xd9\x8a\xd8\xaf')}</h4>\r\n"
    b"      <div class=\"form-group\"><label class=\"form-label\">${tr('Incident Type','\xd9\x86\xd9\x88\xd8\xb9 \xd8\xa7\xd9\x84\xd8\xad\xd8\xa7\xd8\xaf\xd8\xab\xd8\xa9')}</label>\r\n"
    b"        <select class=\"form-input\" id=\"ovrType\"><option value=\"medication\">${tr('Medication Error','\xd8\xae\xd8\xb7\xd8\xa3 \xd8\xaf\xd9\x88\xd8\xa7\xd8\xa6\xd9\x8a')}</option><option value=\"fall\">${tr('Patient Fall','\xd8\xb3\xd9\x82\xd9\x88\xd8\xb7 \xd9\x85\xd8\xb1\xd9\x8a\xd8\xb6')}</option><option value=\"procedure\">${tr('Procedure Error','\xd8\xae\xd8\xb7\xd8\xa3 \xd8\xa5\xd8\xac\xd8\xb1\xd8\xa7\xd8\xa6\xd9\x8a')}</option><option value=\"equipment\">${tr('Equipment Failure','\xd8\xb9\xd8\xb7\xd9\x84 \xd8\xac\xd9\x87\xd8\xa7\xd8\xb2')}</option><option value=\"other\">${tr('Other','\xd8\xa3\xd8\xae\xd8\xb1\xd9\x89')}</option></select></div>\r\n"
    b"      <div class=\"form-group\"><label class=\"form-label\">${tr('Severity','\xd8\xa7\xd9\x84\xd8\xae\xd8\xb7\xd9\x88\xd8\xb1\xd8\xa9')}</label>\r\n"
    b"        <select class=\"form-input\" id=\"ovrSeverity\"><option value=\"low\">Low</option><option value=\"moderate\">Moderate</option><option value=\"high\">High</option><option value=\"critical\">Critical</option></select></div>\r\n"
    b"      <div class=\"form-group\"><label class=\"form-label\">${tr('Description','\xd8\xa7\xd9\x84\xd9\x88\xd8\xb5\xd9\x81')}</label><textarea class=\"form-input\" id=\"ovrDesc\" rows=\"3\"></textarea></div>\r\n"
    b"      <div class=\"form-group\"><label class=\"form-label\">${tr('Immediate Action','\xd8\xa7\xd9\x84\xd8\xa5\xd8\xac\xd8\xb1\xd8\xa7\xd8\xa1 \xd8\xa7\xd9\x84\xd9\x81\xd9\x88\xd8\xb1\xd9\x8a')}</label><textarea class=\"form-input\" id=\"ovrAction\" rows=\"2\"></textarea></div>\r\n"
    b"      <div class=\"form-group\"><label class=\"form-label\">${tr('Patient Involved','\xd9\x85\xd8\xb1\xd9\x8a\xd8\xb6 \xd9\x85\xd8\xb9\xd9\x86\xd9\x8a')}</label><input class=\"form-input\" id=\"ovrPatient\"></div>\r\n"
    b"      <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"window.submitOVR()\">\xf0\x9f\x93\x8b ${tr('Submit OVR','\xd8\xaa\xd9\x82\xd8\xaf\xd9\x8a\xd9\x85 \xd8\xa7\xd9\x84\xd8\xaa\xd9\x82\xd8\xb1\xd9\x8a\xd8\xb1')}</button>\r\n"
    b"    </div>`;\r\n"
    b"  }\r\n"
    b"  window.submitOVR = async () => {\r\n"
    b"    try { await API.post('/api/ovr/reports',{incident_type:document.getElementById('ovrType')?.value,severity:document.getElementById('ovrSeverity')?.value,description:document.getElementById('ovrDesc')?.value,immediate_action:document.getElementById('ovrAction')?.value,patient_name:document.getElementById('ovrPatient')?.value,reporter_name:currentUser?.display_name}); showToast(tr('OVR submitted','\xd8\xaa\xd9\x85 \xd8\xa7\xd9\x84\xd8\xaa\xd9\x82\xd8\xaf\xd9\x8a\xd9\x85')); window.ovrTab='list'; navigateTo(currentPage); } catch(e){showToast(tr('Error','\xd8\xae\xd8\xb7\xd8\xa3'),'error');}\r\n"
    b"  };\r\n"
    b"}\r\n"
    b"\r\n"
    b"// ===== AUDIT LOG =====\r\n"
    b"async function renderAuditLog(el) {\r\n"
    b"  const content = el;\r\n"
    b"  const [logs, modules] = await Promise.all([\r\n"
    b"    API.get('/api/admin/audit-trail?limit=100').catch(()=>[]),\r\n"
    b"    API.get('/api/admin/audit-trail/modules').catch(()=>[])\r\n"
    b"  ]);\r\n"
    b"  const modFilter = window.auditModFilter||'';\r\n"
    b"  const filtered = modFilter ? logs.filter(l=>l.module===modFilter) : logs;\r\n"
    b"  content.innerHTML = `\r\n"
    b"    <div class=\"page-title\">\xf0\x9f\x94\x90 ${tr('Audit Trail','\xd8\xb3\xd8\xac\xd9\x84 \xd8\xa7\xd9\x84\xd9\x85\xd8\xb1\xd8\xa7\xd8\xac\xd8\xb9\xd8\xa9')}</div>\r\n"
    b"    <div style=\"display:flex;gap:8px;margin-bottom:20px;align-items:center\">\r\n"
    b"      <select class=\"form-input\" style=\"max-width:200px\" onchange=\"window.auditModFilter=this.value;navigateTo(currentPage)\">\r\n"
    b"        <option value=\"\">${tr('All Modules','\xd8\xac\xd9\x85\xd9\x8a\xd8\xb9 \xd8\xa7\xd9\x84\xd9\x88\xd8\xad\xd8\xaf\xd8\xa7\xd8\xaa')}</option>\r\n"
    b"        ${(Array.isArray(modules)?modules:[]).map(m=>`<option value=\"${escapeHTML(m)}\" ${m===modFilter?'selected':''}>${escapeHTML(m)}</option>`).join('')}\r\n"
    b"      </select>\r\n"
    b"      <span style=\"color:var(--text-muted);font-size:13px\">${filtered.length} ${tr('records','\xd8\xb3\xd8\xac\xd9\x84')}</span>\r\n"
    b"      <button class=\"btn btn-sm btn-secondary\" style=\"margin-right:auto\" onclick=\"exportToCSV(filtered,'audit_log')\">\xf0\x9f\x93\xa5 ${tr('Export','\xd8\xaa\xd8\xb5\xd8\xaf\xd9\x8a\xd8\xb1')}</button>\r\n"
    b"    </div>\r\n"
    b"    <div class=\"card\" style=\"padding:20px\">\r\n"
    b"      <div id=\"auditTable\"></div>\r\n"
    b"    </div>`;\r\n"
    b"  const at = document.getElementById('auditTable');\r\n"
    b"  if (at) createTable(at,'auditTbl',\r\n"
    b"    [tr('Time','\xd8\xa7\xd9\x84\xd9\x88\xd9\x82\xd8\xaa'),tr('User','\xd8\xa7\xd9\x84\xd9\x85\xd8\xb3\xd8\xaa\xd8\xae\xd8\xaf\xd9\x85'),tr('Module','\xd8\xa7\xd9\x84\xd9\x88\xd8\xad\xd8\xaf\xd8\xa9'),tr('Action','\xd8\xa7\xd9\x84\xd8\xad\xd8\xaf\xd8\xab'),tr('Details','\xd8\xa7\xd9\x84\xd8\xaa\xd9\x81\xd8\xa7\xd8\xb5\xd9\x8a\xd9\x84'),tr('IP','\xd8\xa7\xd9\x84\xd8\xb9\xd9\x86\xd9\x88\xd8\xa7\xd9\x86')],\r\n"
    b"    filtered.map(l=>({cells:[\r\n"
    b"      l.created_at?new Date(l.created_at).toLocaleString('ar-SA'):'',\r\n"
    b"      l.display_name||l.user_id||'',\r\n"
    b"      l.module||'',\r\n"
    b"      l.action||'',\r\n"
    b"      typeof l.details==='object'?JSON.stringify(l.details).slice(0,80):String(l.details||'').slice(0,80),\r\n"
    b"      l.ip_address||''\r\n"
    b"    ]}))\r\n"
    b"  );\r\n"
    b"}\r\n"
    b"\r\n"
    b"function renderSpecialties(el) {\r\n"
    b"  el.innerHTML = `<div class=\"page-title\">\xf0\x9f\x94\xac ${tr('Specialties','\xd8\xa7\xd9\x84\xd8\xaa\xd8\xae\xd8\xb5\xd8\xb5\xd8\xa7\xd8\xaa')}</div><div class=\"card\" style=\"padding:20px\"><p>${tr('Coming soon...', '\xd9\x82\xd8\xb1\xd9\x8a\xd8\xa8\xd8\xa7\xd9\x8b...')}</p></div>`;\r\n"
    b"}\r\n"
    b"\r\n"
)

quality_pos = content.find(quality_marker)
if quality_pos < 0:
    print("ERROR: quality marker not found")
else:
    content = content[:quality_pos] + ovr_auditlog_code + content[quality_pos:]
    print(f"OK: OVR+AuditLog+Specialties added before Quality section")

with open(path, 'wb') as f:
    f.write(content)
print(f"DONE. File size: {len(content)} bytes")

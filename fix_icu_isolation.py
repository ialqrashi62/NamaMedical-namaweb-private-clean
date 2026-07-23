#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
إصلاح: حذف كود الـ Ventilator المُحتجز خطأً داخل isolation block في ICU
المشكلة: بعد السطر المحتوي على "No active isolations" 
         يأتي مباشرةً كود ventFiO2 خام بدلاً من isolated cards
"""

import re

path = r"public\js\app.js"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# نجد الكتلة الخاطئة: من `? \`<div...no active isolations\`` 
# وحتى `saveVentilator()` + `\`; \n  } else if (icuTab`
# ونستبدلها بالكود الصحيح: ? empty : isolated cards

# الكود الصحيح للـ isolation section
correct_isolation = '''            ? `<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:48px">✅</div><p>${tr('No active isolations','لا توجد عزل نشطة')}</p></div>`
            : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${isolated.map(r => `<div style="padding:14px;border-radius:10px;border:2px solid ${isoColors[r.isolation_type]||'#999'};background:${isoColors[r.isolation_type]||'#999'}15"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong>${escapeHTML(r.patient_name||'')}</strong><span class="badge" style="background:${isoColors[r.isolation_type]||'#999'};color:#fff;font-size:10px">${(r.isolation_type||'').toUpperCase()}</span></div><div style="font-size:12px;color:var(--text-muted)">🦠 ${escapeHTML(r.infection_type||'')}${r.hai_category?' · <strong>'+escapeHTML(r.hai_category)+'</strong>':''}</div><div style="font-size:12px;color:var(--text-muted)">🏥 ${escapeHTML(r.ward||'—')}</div><div style="font-size:11px;color:var(--text-muted)">📅 ${(r.created_at||'').slice(0,10)}</div><button class="btn btn-sm" style="width:100%;margin-top:8px" onclick="resolveIc(${parseInt(r.id,10)})">✅ ${tr('Mark Resolved','إغلاق')}</button></div>`).join('')}</div>`}
        </div>`;
  } else if (icuTab === 'infusions') {'''

# نجد ونحذف الكود الخاطئ
# نبحث عن النمط: "No active isolations" ثم أي شيء حتى `} else if (icuTab === 'infusions')`
pattern = r"(\? `<div style=\"text-align:center;padding:40px;color:var\(--text-muted\)\"><div style=\"font-size:48px\">✅</div><p>\$\{tr\('No active isolations','لا توجد عزل نشطة'\)\}</p></div>`).*?(\} else if \(icuTab === 'infusions'\))"

match = re.search(pattern, content, re.DOTALL)
if match:
    print(f"✅ وُجد النمط الخاطئ في موضع: {match.start()}-{match.end()}")
    fixed = content[:match.start()] + correct_isolation + "\n" + content[match.end():]
    with open(path, "w", encoding="utf-8") as f:
        f.write(fixed)
    print("✅ تم الإصلاح بنجاح")
else:
    print("⚠️ النمط لم يُوجد — جاري البحث اليدوي...")
    # ابحث عن ventFiO2
    idx = content.find("ventFiO2")
    if idx >= 0:
        print(f"ventFiO2 موجود عند: {idx}")
        print("السياق حوله:")
        print(repr(content[max(0,idx-200):idx+200]))
    else:
        print("لم يُوجد ventFiO2 في الملف — الملف نظيف!")

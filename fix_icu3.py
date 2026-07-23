import sys

path = r'public\js\app.js'

# قراءة binary لتجنب مشاكل encoding
with open(path, 'rb') as f:
    raw = f.read()

# opt1_end at byte 920581 + len("</p></div>`") = 920581+11 = 920592
# infusions_pos at byte 921382

opt1_end = 920592
infusions_pos = 921382
infusions_marker = b"} else if (icuTab === 'infusions')"

# التحقق من المواضع
print("Byte at opt1_end:", repr(raw[opt1_end:opt1_end+100]))
print("Byte at infusions:", repr(raw[infusions_pos:infusions_pos+50]))

# الكود الصحيح كـ bytes
correct_bytes = (
    b"\n            : `<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px\">"
    b"${isolated.map(r => `<div style=\"padding:14px;border-radius:10px;border:2px solid ${isoColors[r.isolation_type]||'#999'};background:${isoColors[r.isolation_type]||'#999'}15\">"
    b"<div style=\"display:flex;justify-content:space-between;margin-bottom:6px\">"
    b"<strong>${escapeHTML(r.patient_name||'')}</strong>"
    b"<span class=\"badge\" style=\"background:${isoColors[r.isolation_type]||'#999'};color:#fff;font-size:10px\">${(r.isolation_type||'').toUpperCase()}</span>"
    b"</div>"
    b"<div style=\"font-size:12px;color:var(--text-muted)\">\xf0\x9f\xa6\xa0 ${escapeHTML(r.infection_type||'')}${r.hai_category?' \xc2\xb7 <strong>'+escapeHTML(r.hai_category)+'</strong>':''}</div>"
    b"<div style=\"font-size:12px;color:var(--text-muted)\">\xf0\x9f\x8f\xa5 ${escapeHTML(r.ward||'\xe2\x80\x94')}</div>"
    b"<div style=\"font-size:11px;color:var(--text-muted)\">\xf0\x9f\x93\x85 ${(r.created_at||'').slice(0,10)}</div>"
    b"<button class=\"btn btn-sm\" style=\"width:100%;margin-top:8px\" onclick=\"resolveIc(${parseInt(r.id,10)})\">"
    b"\xe2\x9c\x85 ${tr('Mark Resolved','\xd8\xa5\xd8\xba\xd9\x84\xd8\xa7\xd9\x82')}</button>"
    b"</div>`).join('')}</div>`}\n"
    b"        </div>`;\n"
    b"  "
)

fixed = raw[:opt1_end] + correct_bytes + infusions_marker + raw[infusions_pos + len(infusions_marker):]

with open(path, 'wb') as f:
    f.write(fixed)

print("Done! Original:", len(raw), "New:", len(fixed))

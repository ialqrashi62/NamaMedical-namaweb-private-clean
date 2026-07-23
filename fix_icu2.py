import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'public\js\app.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find ventFiO2 position
vent_pos = content.find('ventFiO2')
print(f"ventFiO2 at byte: {vent_pos}")

# The bad block starts just after the "No active isolations" ternary first option ends (the backtick)
# Pattern: ...`\n        <div><label>FiO2 %<...>
# We need to find the position where the isolation ternary SHOULD have a colon but instead has ventilator HTML

# Find the isolation ternary question mark line
no_isolations_marker = "No active isolations','\u0644\u0627 \u062a\u0648\u062c\u062f \u0639\u0632\u0644 \u0646\u0634\u0637\u0629')"
no_iso_pos = content.find(no_isolations_marker)
print(f"'No active isolations' at: {no_iso_pos}")

# Find end of that first backtick option (the closing backtick after </p></div>`)
first_opt_end = content.find("</p></div>`", no_iso_pos)
print(f"First option end backtick at: {first_opt_end}")
# The first option ends at first_opt_end + len("</p></div>`")
opt1_end = first_opt_end + len("</p></div>`")
print(f"Text right after option 1: {repr(content[opt1_end:opt1_end+100])}")

# Find where } else if (icuTab === 'infusions') starts
infusions_marker = "} else if (icuTab === 'infusions')"
infusions_pos = content.find(infusions_marker, no_iso_pos)
print(f"'infusions' marker at: {infusions_pos}")
print(f"Text just before infusions: {repr(content[infusions_pos-50:infusions_pos])}")

# Now replace everything from opt1_end to infusions_pos with the correct code
correct_replacement = """\n            : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${isolated.map(r => `<div style="padding:14px;border-radius:10px;border:2px solid ${isoColors[r.isolation_type]||'#999'};background:${isoColors[r.isolation_type]||'#999'}15"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong>${escapeHTML(r.patient_name||'')}</strong><span class="badge" style="background:${isoColors[r.isolation_type]||'#999'};color:#fff;font-size:10px">${(r.isolation_type||'').toUpperCase()}</span></div><div style="font-size:12px;color:var(--text-muted)">\ud83e\udda0 ${escapeHTML(r.infection_type||'')}${r.hai_category?' \xb7 <strong>'+escapeHTML(r.hai_category)+'</strong>':''}</div><div style="font-size:12px;color:var(--text-muted)">\ud83c\udfe5 ${escapeHTML(r.ward||'\u2014')}</div><div style="font-size:11px;color:var(--text-muted)">\ud83d\udcc5 ${(r.created_at||'').slice(0,10)}</div><button class="btn btn-sm" style="width:100%;margin-top:8px" onclick="resolveIc(${parseInt(r.id,10)})">\u2705 ${tr('Mark Resolved','\u0625\u063a\u0644\u0627\u0642')}</button></div>`).join('')}</div>`}
        </div>`;
  """

fixed = content[:opt1_end] + correct_replacement + infusions_marker + content[infusions_pos + len(infusions_marker):]

with open(path, 'w', encoding='utf-8') as f:
    f.write(fixed)

print("Done! File written.")
print(f"Original length: {len(content)}, New length: {len(fixed)}")

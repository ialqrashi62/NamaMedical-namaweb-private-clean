#!/usr/bin/env python3
"""Split v2 HTML into 3 separate files + render each as PDF."""
import re
from pathlib import Path

HTML = Path("docs/diagrams/JumanaMedical_Diagrams_v2.html").read_text(encoding="utf-8")

body_open = HTML.find('<body>') + len('<body>')
header_template = HTML[:body_open]
footer_template = '\n</body>\n</html>'

dom_start = HTML.find('<section id="dom-1"')
sec6_start = HTML.find('<h2 id="sec6"')

part1 = HTML[body_open:dom_start]
part2 = HTML[dom_start:sec6_start]
part3 = HTML[sec6_start:HTML.rfind('</body>')]

def write_part(content, fname, title):
    full = header_template + f'\n<h1 style="page-break-after:always;font-size:1pt;color:white">{title}</h1>\n' + content + footer_template
    Path(fname).write_text(full, encoding="utf-8")
    print(f"Wrote {fname} ({len(full):,} bytes)")

write_part(part1, "docs/diagrams/jumana_part1.html", "Part 1: Architecture, Flow, Isolation")
write_part(part2, "docs/diagrams/jumana_part2.html", "Part 2: Domain ERD (15 domains, all tables)")
write_part(part3, "docs/diagrams/jumana_part3.html", "Part 3: Inventory + Workflows + Safety + Waves")

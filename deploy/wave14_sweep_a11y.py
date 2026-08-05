#!/usr/bin/env python3
"""
Wave 14 — Station a11y sweep (smarter version).
Strategy:
1. Add type="button" to every bare <button> that lacks type attribute.
2. If a button tag has visible text content (between > and </button>) and no aria-label,
   inject aria-label="<the text>".
3. If no visible text (icon-only) AND no aria-label, skip (don't add junk like "Action").
   The station file author should add proper labels separately.
4. Skip <button> tags that already have aria-label or type="button".

This is token-safe: ~100-line script, idempotent.
"""
import re, sys, pathlib

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/var/www/namaweb/public/js")
TARGETS = sorted(ROOT.glob("*-station.js"))

# Match a complete <button ...>...</button> pair, multi-line safe.
BTN_PAIR_RE = re.compile(
    r"<button\b([^>]*)>([\s\S]*?)</button>",
    re.IGNORECASE
)

# Strip HTML tags + collapse whitespace from body to derive a label.
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")

def derive_label(body):
    """Return a clean aria-label from button body, or None if unusable."""
    text = TAG_RE.sub(" ", body)
    text = WS_RE.sub(" ", text).strip()
    if len(text) < 1 or len(text) > 80:
        return None
    return text

def has_attr(attrs, name):
    """Check whether attribute list contains `name=` (case-insensitive, value-flexible)."""
    return re.search(r'\b' + re.escape(name) + r'\s*=', attrs, re.IGNORECASE) is not None

total_files = 0
total_inserted = 0
for fp in TARGETS:
    txt = fp.read_text(encoding="utf-8", errors="replace")
    out = []
    last_end = 0
    inserted = 0
    for m in BTN_PAIR_RE.finditer(txt):
        attrs, body = m.group(1), m.group(2)
        out.append(txt[last_end:m.start(2)-len(">")])  # up to body
        new_attrs = attrs
        changes = []
        if not has_attr(attrs, "type"):
            new_attrs = ' type="button"' + new_attrs
            changes.append("type")
        if not has_attr(attrs, "aria-label"):
            label = derive_label(body)
            if label:
                safe = label.replace("&", "&amp;").replace('"', "&quot;")
                new_attrs = ' aria-label="' + safe + '"' + new_attrs
                changes.append("aria-label")
        out.append("<button" + new_attrs + ">")
        out.append(body)
        out.append("</button>")
        last_end = m.end()
        if changes:
            inserted += 1
    if inserted > 0:
        out.append(txt[last_end:])
        new_txt = "".join(out)
        fp.write_text(new_txt, encoding="utf-8")
        total_files += 1
        total_inserted += inserted
        print(f"  {fp.name}: +{inserted} button(s) patched")
    else:
        print(f"  {fp.name}: 0 changes")

print(f"\nTOTAL: {total_inserted} buttons patched across {total_files} of {len(TARGETS)} files")

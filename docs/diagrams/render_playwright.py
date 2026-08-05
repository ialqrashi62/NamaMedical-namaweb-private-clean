#!/usr/bin/env python3
"""Render HTML files to PDF using Playwright (proper page-by-page rendering)."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import sys

def render(html_path: Path, pdf_path: Path):
    """Render an HTML file to PDF via Chromium headless via Playwright."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.goto(f"file:///{html_path.as_posix()}", wait_until="networkidle", timeout=60000)
        # Force the browser to honor print CSS + page breaks
        page.emulate_media(media="print")
        page.pdf(
            path=str(pdf_path),
            format="A4",
            landscape=True,
            print_background=True,
            margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"},
            prefer_css_page_size=True,
        )
        browser.close()
    print(f"  Rendered {html_path.name} -> {pdf_path.name}")

base = Path("docs/diagrams")
parts = ["jumana_part1.html", "jumana_part2.html", "jumana_part3.html"]
for p in parts:
    src = base / p
    dst = base / p.replace(".html", ".pdf")
    if src.exists():
        render(src, dst)
    else:
        print(f"  MISSING: {src}")

# Also try the full v2
v2 = base / "JumanaMedical_Diagrams_v2.html"
if v2.exists():
    render(v2, v2.with_suffix(".pdf"))

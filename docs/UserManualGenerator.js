'use strict';
// User Manual — generates PDF-ready HTML by combining modules + sections + screenshots.
// In production: uses puppeteer/playwright to render PDF.

class UserManualGenerator {
  constructor(opts = {}) {
    this.title = opts.title || 'NamaMedical User Manual';
    this.sections = [];
  }

  addSection({ id, title, body, screenshots = [] }) {
    this.sections.push({ id, title, body, screenshots });
  }

  render() {
    const sectionsHtml = this.sections.map(s => `
      <section id="${s.id}">
        <h2>${s.title}</h2>
        <div>${s.body}</div>
        ${s.screenshots.map(src => `<figure><img src="${src}" alt="${s.title}" /></figure>`).join('')}
      </section>
    `).join('\n');
    return `<!doctype html><html><head><title>${this.title}</title><style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 2em; }
      h1, h2 { color: #0c4a6e; }
      figure { margin: 1em 0; }
      img { max-width: 100%; }
    </style></head><body>
      <h1>${this.title}</h1>
      <nav>${this.sections.map(s => `<a href="#${s.id}">${s.title}</a>`).join(' | ')}</nav>
      ${sectionsHtml}
    </body></html>`;
  }
}

module.exports = { UserManualGenerator };

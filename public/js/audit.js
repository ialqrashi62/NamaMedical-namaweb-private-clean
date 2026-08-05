'use strict';
function escapeHTML(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function safeUrl(u) { if (typeof u !== 'string') return ''; if (u.startsWith('/') || u.startsWith('http')) return u; return ''; }

document.getElementById('search').onclick = async () => {
  const t = escapeHTML(document.getElementById('tenantId').value);
  if (!t) return;
  const r = await fetch('/api/v4/audit/search?tenantId=' + encodeURIComponent(t));
  const j = await r.json();
  document.getElementById('result').textContent = JSON.stringify(j, null, 2);
};
document.getElementById('verify').onclick = async () => {
  const t = escapeHTML(document.getElementById('tenantId').value);
  if (!t) return;
  const r = await fetch('/api/v4/audit/search?tenantId=' + encodeURIComponent(t));
  const j = await r.json();
  // Naive verify: re-hash via browser SubtleCrypto would be ideal; here we
  // mark "verify-by-server" as a separate endpoint.
  document.getElementById('result').textContent = 'Server verify via /api/v4/audit/verify (planned).';
};

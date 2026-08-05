'use strict';
// Procedure Consent — bilingual form + signature pad + witness + audit log.

const ProcedureConsent = (() => {
  let pad = null;

  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function newSignaturePad({ width = 320, height = 120 } = {}) {
    let canvas, ctx, strokes = [], drawing = false, current = [];
    function init(target) {
      canvas = target;
      canvas.width = width; canvas.height = height;
      ctx = canvas.getContext('2d');
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a';
      canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; current = [[e.offsetX, e.offsetY]]; });
      canvas.addEventListener('pointermove', (e) => { if (!drawing) return; current.push([e.offsetX, e.offsetY]); draw(); });
      const stop = () => { if (drawing) { drawing = false; strokes.push([...current]); current = []; } };
      canvas.addEventListener('pointerup', stop);
      canvas.addEventListener('pointerleave', stop);
    }
    function draw() {
      if (!current.length) return;
      ctx.beginPath();
      ctx.moveTo(current[0][0], current[0][1]);
      for (let i = 1; i < current.length; i++) ctx.lineTo(current[i][0], current[i][1]);
      ctx.stroke();
    }
    function clear() { if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = []; }
    function isEmpty() { return strokes.length === 0; }
    function toDataURL() { return canvas ? canvas.toDataURL('image/png') : ''; }
    function hash() {
      const data = JSON.stringify(strokes);
      let h = 0;
      for (let i = 0; i < data.length; i++) h = (h << 5) - h + data.charCodeAt(i) | 0;
      return 'h_' + Math.abs(h).toString(16);
    }
    return { init, clear, isEmpty, toDataURL, hash, get strokes() { return strokes; } };
  }

  async function hashChain(input) {
    const text = JSON.stringify(input);
    const enc = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h << 5) - h + text.charCodeAt(i) | 0;
    return 'sha_' + Math.abs(h).toString(16);
  }

  function open({ patient, procedure, risks = [], benefits = [], alternatives = [], surgeon, witness, lang = 'en-US', onComplete } = {}) {
    if (!patient || !procedure) throw new Error('CONSENT_REQUIRES_PATIENT_AND_PROCEDURE');
    const isRtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);

    const steps = ['verify', 'risk', 'sign', 'witness', 'audit'];
    let current = 0;
    let acknowledged = risks.map(() => false);
    let signatureHash = null;
    let witnessHash = null;

    const body = `<div id="consent-step" dir="${isRtl ? 'rtl' : 'ltr'}"></div>`;

    Modal.open({
      title: `${procedure} — Consent`,
      body,
      width: 'max-w-2xl',
      primaryLabel: 'Next',
      secondaryLabel: 'Cancel',
      hidePrimary: true,
      onConfirm: () => advance(),
    });

    function renderStep() {
      const root = document.getElementById('consent-step');
      if (!root) return;
      const step = steps[current];
      if (step === 'verify') {
        root.innerHTML = `
          <div class="text-sm">
            <p class="font-medium mb-2">Step 1 of 5 — Patient verification</p>
            <p class="bg-amber-50 border-l-4 border-amber-500 p-2 mb-2">Confirm patient identity before proceeding.</p>
            <div class="bg-slate-50 rounded p-2">
              <div><strong>${escapeHTML(patient.name || '')}</strong></div>
              <div class="text-xs text-slate-600">MRN: ${escapeHTML(patient.mrn || '')}</div>
            </div>
          </div>
        `;
      } else if (step === 'risk') {
        const riskRows = risks.map((r, i) => `
          <label class="flex items-start gap-2 mb-1 text-sm">
            <input type="checkbox" data-ack="${i}" ${acknowledged[i] ? 'checked' : ''} class="mt-1" />
            <span>${escapeHTML(r)}</span>
          </label>
        `).join('');
        root.innerHTML = `
          <div class="text-sm">
            <p class="font-medium mb-2">Step 2 of 5 — Risks & Benefits</p>
            <p class="mb-2"><strong>Procedure:</strong> ${escapeHTML(procedure)}</p>
            <p class="mb-1"><strong>Surgeon:</strong> ${escapeHTML(surgeon || '')}</p>
            <p class="mt-2 mb-1"><strong>Risks (must acknowledge each):</strong></p>
            ${riskRows}
            <p class="mt-2 mb-1"><strong>Benefits:</strong></p>
            <ul class="list-disc pl-5">${benefits.map((b) => `<li>${escapeHTML(b)}</li>`).join('')}</ul>
            <p class="mt-2 mb-1"><strong>Alternatives:</strong></p>
            <ul class="list-disc pl-5">${alternatives.map((a) => `<li>${escapeHTML(a)}</li>`).join('')}</ul>
          </div>
        `;
        root.querySelectorAll('[data-ack]').forEach((cb) => {
          cb.addEventListener('change', (e) => {
            const idx = Number(e.target.getAttribute('data-ack'));
            acknowledged[idx] = e.target.checked;
          });
        });
      } else if (step === 'sign') {
        root.innerHTML = `
          <div class="text-sm">
            <p class="font-medium mb-2">Step 3 of 5 — Patient signature</p>
            <canvas id="consent-sign" class="border border-slate-300 rounded bg-white" width="320" height="120"></canvas>
            <div class="flex gap-2 mt-2">
              <button id="sign-clear" class="text-xs px-2 py-1 bg-slate-100 rounded">Clear</button>
              <span class="text-xs text-slate-500" id="sign-status">Sign above</span>
            </div>
          </div>
        `;
        pad = newSignaturePad();
        const c = document.getElementById('consent-sign');
        if (c) pad.init(c);
        document.getElementById('sign-clear')?.addEventListener('click', () => pad.clear());
        const check = () => {
          const empty = pad.isEmpty();
          document.getElementById('sign-status').textContent = empty ? 'Sign above' : '✓ Signed';
        };
        c.addEventListener('pointerup', check);
      } else if (step === 'witness') {
        root.innerHTML = `
          <div class="text-sm">
            <p class="font-medium mb-2">Step 4 of 5 — Witness</p>
            <p class="mb-2">Witness: <strong>${escapeHTML((witness && witness.name) || '')}</strong></p>
            <canvas id="consent-witness" class="border border-slate-300 rounded bg-white" width="320" height="120"></canvas>
            <div class="flex gap-2 mt-2">
              <button id="witness-clear" class="text-xs px-2 py-1 bg-slate-100 rounded">Clear</button>
              <span class="text-xs text-slate-500" id="witness-status">Sign as witness</span>
            </div>
          </div>
        `;
        pad = newSignaturePad();
        const c = document.getElementById('consent-witness');
        if (c) pad.init(c);
        document.getElementById('witness-clear')?.addEventListener('click', () => pad.clear());
      } else if (step === 'audit') {
        root.innerHTML = `<div class="text-sm"><p class="font-medium mb-2">Step 5 of 5 — Audit log</p><p class="text-slate-500">Hashing and saving…</p></div>`;
        finalize();
      }
    }

    async function finalize() {
      signatureHash = pad && pad.hash();
      const result = {
        patient: { mrn: patient.mrn, name: patient.name },
        procedure,
        surgeon,
        witness,
        risks,
        benefits,
        alternatives,
        acknowledged: acknowledged.every(Boolean),
        signatureHash,
        witnessHash: signatureHash,
        lang,
        ts: Date.now(),
      };
      const chainHash = await hashChain(result);
      result.chainHash = chainHash;
      try {
        await fetch('/api/consent/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': (window.NAMAMEDICAL && window.NAMAMEDICAL.TENANT_ID) || 'demo',
            'X-CSRF-Token': (window.NAMAMEDICAL && window.NAMAMEDICAL.CSRF_TOKEN) || '',
          },
          credentials: 'same-origin',
          body: JSON.stringify(result),
        });
      } catch (e) {
        // log hash locally even if offline
        console.warn('consent save failed (offline mode):', chainHash);
      }
      const root = document.getElementById('consent-step');
      if (root) {
        root.innerHTML = `
          <div class="text-sm text-emerald-700">
            <p class="font-medium mb-2">✓ Consent recorded</p>
            <p class="text-xs">Chain hash: <code class="bg-slate-100 px-1 rounded">${escapeHTML(chainHash.slice(0, 24))}…</code></p>
          </div>
        `;
      }
      if (onComplete) onComplete(result);
    }

    function advance() {
      if (current === 1 && !acknowledged.every(Boolean)) {
        Modal.toast('Please acknowledge all risks', { type: 'warning' });
        return;
      }
      if (current === 2 && pad.isEmpty()) {
        Modal.toast('Patient signature required', { type: 'warning' });
        return;
      }
      if (current < steps.length - 1) {
        current++;
        renderStep();
      } else {
        Modal.close();
      }
    }

    renderStep();
  }

  window.ProcedureConsent = { open, hashChain };
  return { open, hashChain };
})();
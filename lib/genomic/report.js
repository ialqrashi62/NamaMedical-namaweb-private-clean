// lib/genomic/report.js
// PgxReport — orchestrates the genomic workflow:
//   - generate(): pull a patient's variants, classify phenotypes, build a
//                 CPIC-aligned report
//   - explain():  human-readable summary for clinicians / patients
//   - history():  list every report ever generated for a patient
//
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).
// Hash-chained audit entries (RAIL-10) are emitted on every generate call.

'use strict';

const crypto = require('crypto');
const Variants = require('./variants');
const Storage = require('./storage');

function PgxReport(opts) {
  opts = opts || {};
  const store = opts.store || Storage.newGenomicStore();
  const history = []; // local report history (per-instance)
  let lastChain = '0'.repeat(64); // genesis hash for the chain

  function chainHash(prev, payload) {
    const h = crypto.createHash('sha256');
    h.update(prev);
    h.update('|');
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  }

  function generate({ tenantId, patientId, actorId, genes }) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!patientId) return { ok: false, error: 'PATIENT_REQUIRED' };
    // Pull all variants for the patient
    let variants = store.listForPatient({ tenantId: tenantId, patientId: patientId });
    // Optional filter to a specific gene set
    if (Array.isArray(genes) && genes.length > 0) {
      const allow = Object.create(null);
      for (const g of genes) allow[String(g).toUpperCase()] = true;
      variants = variants.filter(function (v) { return !!allow[v.gene]; });
    }
    const report = Variants.pgxReportForPatient({
      tenantId: tenantId,
      patientId: patientId,
      variants: variants
    });
    // Audit chain entry (RAIL-10). We do NOT log patient identifiers in
    // plain text — only a sha256 fingerprint of (tenantId+patientId).
    const fingerprint = crypto
      .createHash('sha256')
      .update(tenantId + '::' + patientId)
      .digest('hex');
    const auditPayload = {
      kind: 'pgx_report_generated',
      tenantId: tenantId,
      patientFp: fingerprint,
      actorId: actorId || null,
      findingCount: report.findings.length,
      ts: report.generatedAt
    };
    const chain = chainHash(lastChain, auditPayload);
    lastChain = chain;
    const stored = {
      reportId: 'pgx_' + chain.slice(0, 16),
      tenantId: tenantId,
      patientId: patientId,
      generatedAt: report.generatedAt,
      findings: report.findings,
      audit: {
        prevHash: (history.length === 0 ? null : history[history.length - 1].audit.hash),
        hash: chain,
        fingerprint: fingerprint
      }
    };
    history.push(stored);
    return { ok: true, report: stored };
  }

  function explain({ report }) {
    if (!report || !report.findings) {
      return { ok: false, error: 'REPORT_REQUIRED' };
    }
    const lines = [];
    lines.push('PGx Report — ' + (report.generatedAt || 'unknown date'));
    if (!report.findings.length) {
      lines.push('No curated drug-gene findings for this patient.');
    } else {
      for (const f of report.findings) {
        lines.push(
          '• ' + f.gene + ' (' + f.drug + ') — ' + f.phenotype +
          ' → ' + f.recommendation + ' [' + f.guideline + ']'
        );
      }
    }
    return { ok: true, explanation: lines.join('\n') };
  }

  function historyFor({ tenantId, patientId }) {
    if (!tenantId || !patientId) return { ok: false, error: 'MISSING_KEY' };
    const out = [];
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (h.tenantId === tenantId && h.patientId === patientId) {
        out.push({
          reportId: h.reportId,
          generatedAt: h.generatedAt,
          findingCount: h.findings.length,
          hash: h.audit.hash
        });
      }
    }
    return { ok: true, history: out };
  }

  function chainHead() {
    return lastChain;
  }

  return {
    generate: generate,
    explain: explain,
    history: historyFor,
    chainHead: chainHead
  };
}

module.exports = PgxReport;

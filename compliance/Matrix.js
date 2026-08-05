'use strict';
// Compliance Matrix — maps controls to implementations.
// Each control has: id, framework, requirement, status, evidence.

class ComplianceMatrix {
  constructor() {
    this.controls = [];
  }

  addControl(control) {
    if (!control.id || !control.framework || !control.requirement) throw new Error('CONTROL_INVALID');
    this.controls.push(control);
  }

  updateStatus(id, status, evidence) {
    const c = this.controls.find(x => x.id === id);
    if (!c) throw new Error('CONTROL_UNKNOWN');
    c.status = status;       // 'met' | 'partial' | 'gap'
    c.evidence = evidence;
    c.lastUpdated = new Date().toISOString();
  }

  byFramework(framework) {
    return this.controls.filter(c => c.framework === framework);
  }

  coverageReport() {
    const out = {};
    for (const c of this.controls) {
      if (!out[c.framework]) out[c.framework] = { met: 0, partial: 0, gap: 0, total: 0 };
      out[c.framework][c.status || 'gap']++;
      out[c.framework].total++;
    }
    return out;
  }
}

module.exports = { ComplianceMatrix };

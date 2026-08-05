'use strict';
// Training Videos — script generator for each module.

class TrainingVideoScripts {
  constructor() {
    this.scripts = [];
  }

  add({ module, targetRole, durationMin, outline }) {
    if (!module || !targetRole || !durationMin) throw new Error('SCRIPT_INVALID');
    this.scripts.push({ module, targetRole, durationMin, outline });
  }

  list() { return this.scripts; }

  render({ module }) {
    const s = this.scripts.find(x => x.module === module);
    if (!s) return null;
    return {
      ...s,
      shots: s.outline.map((line, i) => ({ shot: i + 1, narration: line, durationSec: 30 })),
      totalSec: s.outline.length * 30,
    };
  }
}

module.exports = { TrainingVideoScripts };

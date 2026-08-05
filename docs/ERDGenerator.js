'use strict';
// ERD Generator — emits Mermaid diagram from entity definitions.

class ERDGenerator {
  constructor() {
    this.entities = [];
  }

  addEntity({ name, attributes }) {
    if (!name || !attributes) throw new Error('ENTITY_INVALID');
    this.entities.push({ name, attributes });
  }

  addRelation({ from, to, kind, label }) {
    if (!from || !to || !kind) throw new Error('RELATION_INVALID');
    this._relations = this._relations || [];
    this._relations.push({ from, to, kind, label });
  }

  render() {
    const lines = ['erDiagram'];
    for (const e of this.entities) {
      lines.push(`    ${e.name} {`);
      for (const a of e.attributes) {
        lines.push(`        ${a.type} ${a.name}${a.pk ? ' PK' : a.fk ? ' FK' : ''}`);
      }
      lines.push('    }');
    }
    if (this._relations) {
      for (const r of this._relations) {
        lines.push(`    ${r.from} ${r.kind} ${r.to} : ${r.label || ''}`);
      }
    }
    return lines.join('\n');
  }
}

module.exports = { ERDGenerator };

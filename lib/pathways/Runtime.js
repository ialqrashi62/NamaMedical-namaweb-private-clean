'use strict';
// Runtime — executes a compiled pathway step by step. Each step may evaluate
// a condition; the next pointer is followed (or the alternate `fail` when the
// condition evaluates false).

function newRuntime() {
  function run({ compiled, facts }) {
    const trace = [];
    let cur = compiled.entry;
    let safety = 0;
    while (cur && safety < 100) {
      const node = compiled.graph[cur];
      if (!node) break;
      let passed = true;
      if (node.condition) {
        passed = !!evaluate(node.condition, facts || {});
      }
      trace.push({ id: node.id, kind: node.kind, passed, next: node.next });
      if (!passed) break;
      cur = node.next;
      safety++;
    }
    return { ok: true, trace };
  }
  function evaluate(expr, facts) {
    // Tiny expression DSL: "key>value" or "key==value" or truthy key.
    const m = String(expr).match(/^(\w+)(>=|<=|==|!=|>|<)(.+)$/);
    if (!m) return !!facts[expr];
    const [, k, op, v] = m;
    const lhs = facts[k];
    const rhs = isNaN(v) ? v.replace(/^['"]|['"]$/g, '') : Number(v);
    switch (op) {
      case '==': return lhs == rhs;
      case '!=': return lhs != rhs;
      case '>': return lhs > rhs;
      case '<': return lhs < rhs;
      case '>=': return lhs >= rhs;
      case '<=': return lhs <= rhs;
      default: return false;
    }
  }
  return { run, evaluate };
}

module.exports = { newRuntime };

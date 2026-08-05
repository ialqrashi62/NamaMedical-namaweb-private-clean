'use strict';
// Compiler — turns a validated pathway into an executable graph (adjacency list).

function compile(pathway) {
  const graph = {};
  for (const s of pathway.steps) {
    graph[s.id] = { id: s.id, name: s.name, kind: s.kind, next: s.next || null, condition: s.condition || null };
  }
  return { id: pathway.id, name: pathway.name, graph, entry: pathway.steps[0].id };
}

module.exports = { compile };

'use strict';
// Knowledge Graph — adds nodes and edges. findRelated walks breadth-first.

function newKnowledgeGraph() {
  const nodes = new Map();
  const edges = new Map(); // node → [{to, rel}]
  function addNode(id, attrs) { nodes.set(id, { id, ...attrs }); }
  function addEdge(from, to, rel) {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push({ to, rel });
  }
  function findRelated(start, hopCount = 2) {
    const seen = new Set([start]);
    let frontier = [start];
    for (let h = 0; h < hopCount; h++) {
      const next = [];
      for (const n of frontier) {
        for (const e of edges.get(n) || []) {
          if (!seen.has(e.to)) {
            seen.add(e.to);
            next.push(e.to);
          }
        }
      }
      frontier = next;
    }
    return Array.from(seen);
  }
  return { addNode, addEdge, findRelated, _nodes: nodes };
}

module.exports = { newKnowledgeGraph };

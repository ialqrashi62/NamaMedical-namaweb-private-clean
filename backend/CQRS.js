'use strict';
// CQRS — Command/Query Responsibility Segregation.
// Commands: write-side, applied to an event store.
// Queries: read-side, served from a materialized view.

class CQRS {
  constructor(opts = {}) {
    this.events = opts.events || [];
    this.snapshots = opts.snapshots || new Map();
  }

  command({ aggregate, id, type, payload }) {
    if (!aggregate || !id || !type) throw new Error('COMMAND_INVALID');
    const event = { id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), aggregate, aggregateId: id, type, payload, ts: Date.now() };
    this.events.push(event);
    this._project(event);
    return event;
  }

  query({ view, id }) {
    const snap = this.snapshots.get(view + ':' + id);
    return snap || null;
  }

  _project(event) {
    const key = event.aggregate + ':' + event.aggregateId;
    if (!this.snapshots.has(key)) this.snapshots.set(key, { id: event.aggregateId, version: 0, history: [] });
    const snap = this.snapshots.get(key);
    snap.version++;
    snap.history.push({ type: event.type, payload: event.payload });
  }

  replay(aggregate) {
    const matching = this.events.filter(e => e.aggregate === aggregate);
    const grouped = {};
    for (const e of matching) {
      if (!grouped[e.aggregateId]) grouped[e.aggregateId] = { id: e.aggregateId, version: 0, history: [] };
      grouped[e.aggregateId].version++;
      grouped[e.aggregateId].history.push({ type: e.type, payload: e.payload });
    }
    return Object.values(grouped);
  }
}

module.exports = { CQRS };

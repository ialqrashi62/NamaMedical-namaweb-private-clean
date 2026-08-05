'use strict';
// Metrics.js — Prometheus-style in-process metrics registry.
// No external dep (no prom-client) — owner may swap with prom-client later
// by re-implementing the same surface in lib/Metrics.production.js.

class Counter {
  constructor(opts) { this.name = opts.name; this.help = opts.help || ''; this.labelNames = opts.labelNames || []; this.values = new Map(); }
  inc(labels = {}, value = 1) {
    const k = this._key(labels);
    const cur = this.values.get(k) || { labels, value: 0 };
    cur.value += value;
    this.values.set(k, cur);
  }
  reset() { this.values.clear(); }
  _key(labels) { return this.labelNames.map(n => String(labels[n] || '')).join('|'); }
  serialize() {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    for (const v of this.values.values()) {
      const labels = this.labelNames.length
        ? '{' + this.labelNames.map(n => `${n}="${String(v.labels[n] || '').replace(/"/g, '')}"`).join(',') + '}'
        : '';
      out += `${this.name}${labels} ${v.value}\n`;
    }
    return out;
  }
}

class Histogram {
  constructor(opts) {
    this.name = opts.name; this.help = opts.help || '';
    this.labelNames = opts.labelNames || [];
    this.buckets = opts.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.values = new Map();
  }
  observe(labels = {}, value = 0) {
    const k = this._key(labels);
    let v = this.values.get(k);
    if (!v) { v = { labels, sum: 0, count: 0, buckets: this.buckets.map(() => 0) }; this.values.set(k, v); }
    v.sum += value;
    v.count += 1;
    for (let i = 0; i < this.buckets.length; i++) if (value <= this.buckets[i]) v.buckets[i]++;
  }
  reset() { this.values.clear(); }
  _key(labels) { return this.labelNames.map(n => String(labels[n] || '')).join('|'); }
  serialize() {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    for (const v of this.values.values()) {
      const labels = this.labelNames.length ? '{' + this.labelNames.map(n => `${n}="${String(v.labels[n] || '').replace(/"/g, '')}"`).join(',') + '}' : '';
      for (let i = 0; i < this.buckets.length; i++) {
        out += `${this.name}_bucket{${this.labelNames.length ? this.labelNames.map(n => `${n}="${String(v.labels[n] || '').replace(/"/g, '')}"`).join(',') + ',' : ''}le="${this.buckets[i]}"} ${v.buckets[i]}\n`;
      }
      out += `${this.name}_bucket{${this.labelNames.length ? this.labelNames.map(n => `${n}="${String(v.labels[n] || '').replace(/"/g, '')}"`).join(',') + ',' : ''}le="+Inf"} ${v.count}\n`;
      out += `${this.name}_sum${labels} ${v.sum}\n`;
      out += `${this.name}_count${labels} ${v.count}\n`;
    }
    return out;
  }
}

class Gauge {
  constructor(opts) { this.name = opts.name; this.help = opts.help || ''; this.labelNames = opts.labelNames || []; this.values = new Map(); }
  set(labels = {}, value = 0) {
    const k = this._key(labels);
    this.values.set(k, { labels, value });
  }
  inc(labels = {}, v = 1) { const k = this._key(labels); const cur = this.values.get(k) || { labels, value: 0 }; cur.value += v; this.values.set(k, cur); }
  _key(labels) { return this.labelNames.map(n => String(labels[n] || '')).join('|'); }
  serialize() {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
    for (const v of this.values.values()) {
      const labels = this.labelNames.length ? '{' + this.labelNames.map(n => `${n}="${String(v.labels[n] || '').replace(/"/g, '')}"`).join(',') + '}' : '';
      out += `${this.name}${labels} ${v.value}\n`;
    }
    return out;
  }
}

class Registry {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
  }
  counter(opts) { const m = new Counter(opts); this.metrics.set(opts.name, m); this.counters.set(opts.name, m); return m; }
  histogram(opts) { const m = new Histogram(opts); this.metrics.set(opts.name, m); this.histograms.set(opts.name, m); return m; }
  gauge(opts) { const m = new Gauge(opts); this.metrics.set(opts.name, m); this.gauges.set(opts.name, m); return m; }
  serialize() {
    let out = '';
    for (const m of this.metrics.values()) out += m.serialize();
    return out;
  }
  reset() { for (const m of this.metrics.values()) m.values.clear(); }
}

// Default registry + business metrics
const REGISTRY = new Registry();

const engineRunsTotal = REGISTRY.counter({
  name: 'nama_engine_runs_total',
  help: 'Total engine invocations',
  labelNames: ['dept', 'status'],
});
const engineLatencySec = REGISTRY.histogram({
  name: 'nama_engine_latency_seconds',
  help: 'Engine execution latency',
  labelNames: ['dept'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
const redFlagsFired = REGISTRY.counter({
  name: 'nama_red_flags_fired_total',
  help: 'Red-flag firings by severity',
  labelNames: ['severity', 'dept'],
});
const drugBlocks = REGISTRY.counter({
  name: 'nama_drug_blocks_total',
  help: 'Drug safety blocks',
  labelNames: ['reason'],
});
const ragHits = REGISTRY.gauge({
  name: 'nama_rag_chunks_per_run',
  help: 'RAG chunks returned per engine run',
  labelNames: ['dept'],
});

module.exports = {
  Registry, Counter, Histogram, Gauge,
  REGISTRY,
  engineRunsTotal, engineLatencySec, redFlagsFired, drugBlocks, ragHits,
};

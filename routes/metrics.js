'use strict';
// metrics endpoint — Prometheus scrape target.
// Adds HTTP request metrics + custom business metrics.

const { REGISTRY } = require('../lib/Metrics');

const httpRequests = REGISTRY.counter({
  name: 'nama_http_requests_total',
  help: 'HTTP requests by route + status',
  labelNames: ['route', 'method', 'status'],
});
const httpLatency = REGISTRY.histogram({
  name: 'nama_http_latency_seconds',
  help: 'HTTP latency by route',
  labelNames: ['route', 'method'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
const authFailures = REGISTRY.counter({
  name: 'nama_auth_failures_total',
  help: 'Authentication / RBAC failures',
  labelNames: ['reason'],
});
const auditWrites = REGISTRY.counter({
  name: 'nama_audit_writes_total',
  help: 'Audit events written',
  labelNames: ['sink'],
});
const ragLatency = REGISTRY.histogram({
  name: 'nama_rag_search_seconds',
  help: 'RAG search latency',
  labelNames: ['adapter'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
});

function metricsHandler(req, res) {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(REGISTRY.serialize());
}

function observeHttp(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ns = Number(process.hrtime.bigint() - start);
    const sec = ns / 1e9;
    const route = req.route && req.route.path
      ? (req.baseUrl || '') + req.route.path
      : req.path;
    httpRequests.inc({ route, method: req.method, status: String(res.statusCode) });
    httpLatency.observe({ route, method: req.method }, sec);
  });
  next();
}

module.exports = {
  metricsHandler,
  observeHttp,
  httpRequests,
  httpLatency,
  authFailures,
  auditWrites,
  ragLatency,
};

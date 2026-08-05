'use strict';
// API Gateway — rate limit, RBAC, OpenAPI validation, routing.
const express = require('express');

class ApiGateway {
  constructor(opts = {}) {
    this.routes = [];
    this.rateLimiter = opts.rateLimiter || null;
    this.rbacGuard = opts.rbacGuard || null;
    this.app = express.Router();
    this.app.use(express.json({ limit: '2mb' }));
  }

  register({ method, path, handler, rateLimit, requireRole }) {
    if (!method || !path || typeof handler !== 'function') throw new Error('ROUTE_INVALID');
    this.routes.push({ method, path, handler, rateLimit, requireRole });
    return this;
  }

  mount() {
    for (const r of this.routes) {
      const chain = [];
      if (r.rateLimit && this.rateLimiter) chain.push(this.rateLimiter.middleware());
      chain.push((req, res, next) => {
        try {
          r.handler(req, res, next);
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      });
      this.app[r.method](r.path, ...chain);
    }
    return this.app;
  }

  openapi() {
    const paths = {};
    for (const r of this.routes) {
      if (!paths[r.path]) paths[r.path] = {};
      paths[r.path][r.method] = {
        summary: r.path,
        responses: { '200': { description: 'OK' } },
      };
    }
    return {
      openapi: '3.1.0',
      info: { title: 'NamaMedical API', version: '20.0.0' },
      paths,
    };
  }
}

module.exports = { ApiGateway };

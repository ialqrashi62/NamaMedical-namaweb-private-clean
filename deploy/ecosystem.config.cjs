// ecosystem.config.cjs — PM2 config for NamaMedical
// Used by: pm2 start ecosystem.config.cjs (production)
// Sandbox : pm2 start ecosystem.config.cjs --env sandbox
// DEPLOY_TARGET=live  => refuses without DEPLOY_ALLOWED_OWNER=1

'use strict';

module.exports = {
  apps: [
    {
      name: 'nama-medical-erp',
      cwd: './',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        RAILS_INVARIANT: 'true',
        AUDIT_DEBUG: '0',
        CSP_ENFORCE: 'false',
      },
      env_sandbox: {
        NODE_ENV: 'sandbox',
        PORT: 3100,
        AUDIT_DEBUG: '1',
        SKIP_DB_INIT: '1',
        DEPLOY_TARGET: 'sandbox',
      },
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
    {
      name: 'nama-dept-api',
      cwd: './',
      script: './routes/dept_attach.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        DEPT_SMOKE_PORT: 3210,
      },
    },
    {
      name: 'nama-mynama-portal',
      cwd: './mynama',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        MYNAMA_PORT: 3220,
      },
    },
  ],
};

// Safety guard: refuse to run live without explicit opt-in.
if (process.env.DEPLOY_TARGET === 'live' && process.env.DEPLOY_ALLOWED_OWNER !== '1') {
  console.error('=========================');
  console.error('REFUSING LIVE DEPLOY: AGENTS.md §2.4 requires explicit owner approval.');
  console.error('Run with DEPLOY_TARGET=live DEPLOY_ALLOWED_OWNER=1');
  console.error('=========================');
  process.exit(2);
}

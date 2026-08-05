'use strict';
// Hetzner Deploy DSL — uploads files + runs commands via OpenSSH (scp + ssh).
// Uses C:\Users\ice\.ssh\hetzner_key (OpenSSH, no passphrase). DO NOT touch the key.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sshArgs(keyPath) {
  return [
    '-i', keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
  ];
}

function scp(src, dst, keyPath) {
  const args = [...sshArgs(keyPath), src, dst];
  return spawnSync('scp', args, { encoding: 'utf8' });
}

function ssh(command, keyPath, host) {
  const args = [...sshArgs(keyPath), `${host}`, command];
  return spawnSync('ssh', args, { encoding: 'utf8' });
}

function Hetzner() {}

Hetzner.deploy = function ({ host, user, keyPath, remoteDir, files = [], run = [], cwd = process.cwd() } = {}) {
  if (!host) throw new Error('HETZNER_HOST_REQUIRED');
  if (!keyPath) throw new Error('HETZNER_KEY_REQUIRED');
  if (!fs.existsSync(keyPath)) throw new Error('HETZNER_KEY_MISSING:' + keyPath);
  const target = `${user || 'root'}@${host}`;
  const report = { files: [], commands: [], ok: true };

  for (const f of files) {
    const local = path.isAbsolute(f) ? f : path.join(cwd, f);
    if (!fs.existsSync(local)) {
      report.ok = false;
      report.files.push({ file: f, ok: false, err: 'LOCAL_MISSING' });
      continue;
    }
    const rel = f.replace(/\\/g, '/');
    const dst = `${target}:${remoteDir}/${rel}`;
    const r = scp(local, dst, keyPath);
    const ok = r.status === 0;
    report.files.push({ file: f, ok, out: (r.stdout || '').slice(0, 200), err: ok ? '' : (r.stderr || '').slice(0, 200) });
    if (!ok) report.ok = false;
  }

  for (const cmd of run) {
    const r = ssh(cmd, keyPath, target);
    const ok = r.status === 0;
    report.commands.push({ cmd, ok, out: (r.stdout || '').slice(0, 500), err: ok ? '' : (r.stderr || '').slice(0, 500) });
    if (!ok) report.ok = false;
  }

  return report;
};

Hetzner.testSsh = function ({ host, user, keyPath } = {}) {
  if (!keyPath || !fs.existsSync(keyPath)) return { ok: false, err: 'KEY_MISSING' };
  const target = `${user || 'root'}@${host}`;
  const r = ssh('whoami && hostname && uptime', keyPath, target);
  return {
    ok: r.status === 0,
    out: (r.stdout || '').trim(),
    err: r.status === 0 ? '' : (r.stderr || '').trim(),
  };
};

module.exports = Hetzner;

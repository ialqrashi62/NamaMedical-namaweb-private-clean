'use strict';

/**
 * PromptRegistry — single source for compiled prompt JSON.
 * Loaded from .ai-brain/02-prompt-engineering/PROMPT_REGISTRY.yaml
 * at boot time.
 */
const fs = require('fs');
const path = require('path');

let _cache = null;

function loadRegistry(opts = {}) {
  if (_cache) return _cache;
  const candidates = [
    opts.path,
    process.env.PROMPT_REGISTRY_PATH,
    path.join(process.cwd(), '.ai-brain', '02-prompt-engineering', 'PROMPT_REGISTRY.yaml'),
    path.join(process.cwd(), '..', '.ai-brain', '02-prompt-engineering', 'PROMPT_REGISTRY.yaml'),
    path.join(__dirname, '..', '..', '.ai-brain', '02-prompt-engineering', 'PROMPT_REGISTRY.yaml'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        // Lightweight YAML parser — pull only `prompts:` block + `id` + `version`.
        const prompts = parsePromptsBlock(raw);
        _cache = { path: p, prompts, loadedAt: new Date().toISOString() };
        return _cache;
      }
    } catch (e) {
      // continue
    }
  }
  _cache = { path: null, prompts: defaultPrompts(), loadedAt: new Date().toISOString() };
  return _cache;
}

function defaultPrompts() {
  // Minimal fallbacks so engines don't crash if registry missing.
  return [
    {
      id: 'PROMPT:INITIAL_ASSESSMENT',
      version: '1.0.0',
      safety_class: 'critical',
      requires_red_flag_check: true,
      requires_drug_check: true,
      requires_citation: true,
      citations_required: 3,
      max_tokens: 1500,
      temperature: 0.1,
      model_target: 'gpt-4o',
    },
  ];
}

function parsePromptsBlock(yamlText) {
  const out = [];
  const lines = yamlText.split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    if (/^\s*- id:/.test(line)) {
      if (cur) out.push(cur);
      cur = { id: line.replace(/^\s*- id:\s*/, '').trim() };
      continue;
    }
    if (cur && /^\s+\w+:/.test(line)) {
      const m = line.match(/^\s+([\w_]+):\s*(.+?)\s*$/);
      if (m) cur[m[1]] = stripQuotes(m[2]);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function get(promptId, version) {
  const r = loadRegistry();
  const candidates = r.prompts.filter(p => p.id === promptId);
  if (candidates.length === 0) return null;
  if (version) {
    const v = candidates.filter(p => p.version === version);
    if (v.length > 0) return v[0];
  }
  return candidates[candidates.length - 1];
}

function reset() {
  _cache = null;
}

module.exports = {
  loadRegistry,
  get,
  reset,
};

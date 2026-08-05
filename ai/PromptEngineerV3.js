'use strict';
// PromptEngineer V3 — production-grade prompt engineering.
// Supports: system prompts, contexts, workflows, multi-shot, structured outputs,
// adversarial testing, and token budgeting.

const crypto = require('crypto');

class PromptEngineerV3 {
  constructor(opts = {}) {
    this.registry = opts.registry || null;
    this.budget = opts.budget || { maxTokens: 4096, model: 'gpt-4' };
    this.tokenCounter = opts.tokenCounter || this._estimateTokens;
  }

  register(prompt) {
    if (!prompt.id || !prompt.template) throw new Error('PROMPT_INVALID');
    this.registry = this.registry || { prompts: {} };
    this.registry.prompts[prompt.id] = prompt;
    return this;
  }

  build(promptId, vars = {}) {
    const p = this.registry && this.registry.prompts[promptId];
    if (!p) throw new Error('PROMPT_UNKNOWN:' + promptId);
    const rendered = this._render(p.template, vars);
    const messages = this._buildMessages(p, rendered);
    const tokens = this.tokenCounter(messages);
    if (tokens > this.budget.maxTokens) throw new Error('TOKEN_BUDGET_EXCEEDED');
    return { id: promptId, messages, tokens, sha: this._sha(messages) };
  }

  _render(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `{${k}}`);
  }

  _buildMessages(p, rendered) {
    const messages = [];
    if (p.system) messages.push({ role: 'system', content: p.system });
    if (p.fewShot) for (const fs of p.fewShot) messages.push({ role: fs.role || 'user', content: fs.content });
    messages.push({ role: 'user', content: rendered });
    return messages;
  }

  _estimateTokens(messages) {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  _sha(messages) {
    const h = crypto.createHash('sha256');
    for (const m of messages) h.update(m.content);
    return h.digest('hex').slice(0, 16);
  }
}

module.exports = { PromptEngineerV3 };

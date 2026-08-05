'use strict';
// Helpdesk — ticket system with priority, status, SLA.
class Helpdesk {
  constructor() {
    this.tickets = [];
  }

  open({ tenantId, userId, subject, body, priority }) {
    if (!tenantId || !userId || !subject) throw new Error('TICKET_PARAMS_REQUIRED');
    const ticket = {
      id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      tenantId,
      userId,
      subject,
      body: body || '',
      priority: priority || 'normal',
      status: 'open',
      createdAt: Date.now(),
      history: [{ kind: 'open', ts: Date.now() }],
    };
    this.tickets.push(ticket);
    return ticket;
  }

  respond({ id, response, agent }) {
    const t = this.tickets.find(x => x.id === id);
    if (!t) throw new Error('TICKET_UNKNOWN');
    t.history.push({ kind: 'respond', response, agent, ts: Date.now() });
    t.status = 'pending';
    return t;
  }

  close({ id, reason }) {
    const t = this.tickets.find(x => x.id === id);
    if (!t) throw new Error('TICKET_UNKNOWN');
    t.status = 'closed';
    t.history.push({ kind: 'close', reason, ts: Date.now() });
    return t;
  }

  openByPriority(priority) {
    return this.tickets.filter(t => t.status !== 'closed' && t.priority === priority);
  }
}

module.exports = { Helpdesk };

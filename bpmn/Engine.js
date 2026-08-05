'use strict';
// BPMN lite — process model with tasks, gateways, events.
// Each process: tasks (with assignee/duration), gateways (xor/and), events (start/end).

class BPMNEngine {
  constructor(opts = {}) {
    this.processes = new Map();
    this.instances = new Map();
  }

  defineProcess(process) {
    if (!process.id || !process.tasks || !process.start) throw new Error('PROCESS_INVALID');
    this.processes.set(process.id, process);
    return this;
  }

  startInstance({ processId, vars = {} }) {
    const p = this.processes.get(processId);
    if (!p) throw new Error('PROCESS_UNKNOWN');
    const id = 'inst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const inst = { id, processId, vars, current: [p.start], history: [], finished: false };
    this.instances.set(id, inst);
    return inst;
  }

  advance({ instanceId, taskId, outcome }) {
    const inst = this.instances.get(instanceId);
    if (!inst) throw new Error('INSTANCE_UNKNOWN');
    const p = this.processes.get(inst.processId);
    const task = p.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('TASK_UNKNOWN');
    inst.history.push({ taskId, outcome, ts: Date.now() });
    const next = task.next;
    if (!next) {
      inst.finished = true;
      return inst;
    }
    if (Array.isArray(next) || (next && typeof next === 'object' && !(next instanceof String))) {
      // XOR gateway or object map: pick based on outcome
      if (outcome && next[outcome]) inst.current = [next[outcome]];
      else if (next.default) inst.current = [next.default];
      else throw new Error('NO_BRANCH');
    } else {
      inst.current = [next];
    }
    return inst;
  }

  state(instanceId) {
    return this.instances.get(instanceId);
  }
}

module.exports = { BPMNEngine };

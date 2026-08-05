'use strict';
// Agile Task Tracker — sprint, story, task, burndown.

class TaskTracker {
  constructor() {
    this.sprints = [];
    this.tasks = [];
  }

  startSprint({ name, capacity }) {
    if (!name) throw new Error('SPRINT_NAME_REQUIRED');
    const id = 's-' + Date.now();
    const sprint = { id, name, capacity, startedAt: Date.now(), endedAt: null };
    this.sprints.push(sprint);
    return sprint;
  }

  addTask({ sprintId, title, estimate, assignee }) {
    const s = this.sprints.find(x => x.id === sprintId);
    if (!s) throw new Error('SPRINT_UNKNOWN');
    const task = { id: 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), sprintId, title, estimate: estimate || 1, assignee, status: 'todo' };
    this.tasks.push(task);
    return task;
  }

  setStatus({ taskId, status }) {
    const t = this.tasks.find(x => x.id === taskId);
    if (!t) throw new Error('TASK_UNKNOWN');
    if (!['todo', 'in_progress', 'done'].includes(status)) throw new Error('STATUS_INVALID');
    t.status = status;
  }

  burndown({ sprintId }) {
    const tasks = this.tasks.filter(t => t.sprintId === sprintId);
    const total = tasks.reduce((s, t) => s + t.estimate, 0);
    const done = tasks.filter(t => t.status === 'done').reduce((s, t) => s + t.estimate, 0);
    return { total, done, remaining: total - done };
  }
}

module.exports = { TaskTracker };

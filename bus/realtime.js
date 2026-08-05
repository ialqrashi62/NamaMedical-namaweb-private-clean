'use strict';
// Real-time bus (in-memory). Per-tenant topic. Ordering preserved per topic.
// Backed by an in-memory queue per topic; subscribers receive a fan-out copy.
// In production this is replaced with Redis Streams; the API surface is the same.

function newRealtimeBus() {
  const topics = new Map(); // topicKey → { tenantId, queue: [], subscribers: Set<id> }
  const subFns = new Map(); // subId → fn(message)

  function topicKey(tenantId, topic) {
    return tenantId + ':' + topic;
  }
  function ensureTopic(tenantId, topic) {
    const k = topicKey(tenantId, topic);
    if (!topics.has(k)) topics.set(k, { tenantId, queue: [], subscribers: new Set() });
    return topics.get(k);
  }

  function publish(tenantId, topic, payload) {
    if (!tenantId || !topic) throw new Error('TOPIC_REQUIRED');
    const t = ensureTopic(tenantId, topic);
    const msg = { id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                  tenantId, topic, payload, ts: Date.now() };
    t.queue.push(msg);
    // Fan-out (in-order)
    for (const sid of t.subscribers) {
      const fn = subFns.get(sid);
      if (fn) fn(msg);
    }
    return msg.id;
  }

  function subscribe(tenantId, topic, fn) {
    if (typeof fn !== 'function') throw new Error('SUBSCRIBER_FN_REQUIRED');
    const t = ensureTopic(tenantId, topic);
    const id = 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    subFns.set(id, fn);
    t.subscribers.add(id);
    // Replay queue
    for (const m of t.queue) fn(m);
    return { id, unsubscribe: () => {
      t.subscribers.delete(id);
      subFns.delete(id);
    } };
  }

  function tail(tenantId, topic) {
    const k = topicKey(tenantId, topic);
    const t = topics.get(k);
    if (!t) return [];
    return t.queue.slice();
  }

  function drop(tenantId, topic) {
    topics.delete(topicKey(tenantId, topic));
  }

  return { publish, subscribe, tail, drop, _topics: topics };
}

module.exports = { newRealtimeBus };

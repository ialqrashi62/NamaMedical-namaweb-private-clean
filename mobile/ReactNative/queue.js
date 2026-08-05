'use strict';
// Offline queue (mobile). FIFO with priority. Each entry has a key, payload,
// timestamp, and a retry counter. Network re-establishment triggers drain().

function newOfflineQueue() {
  const queue = [];
  let retry = 0;
  let maxRetries = 5;

  function enqueue(item) {
    if (!item || !item.key) throw new Error('KEY_REQUIRED');
    queue.push({ ...item, t: Date.now(), retries: 0 });
  }
  function peek() { return queue[0]; }
  function size() { return queue.length; }
  function clear() { queue.length = 0; }
  async function drain(send) {
    const sent = [];
    while (queue.length) {
      const item = queue.shift();
      try {
        await send(item);
        sent.push({ key: item.key, ok: true });
      } catch (e) {
        item.retries += 1;
        if (item.retries < maxRetries) {
          queue.unshift(item); // retry in-place
          sent.push({ key: item.key, ok: false, err: e.message, retry: true });
          break;
        }
        sent.push({ key: item.key, ok: false, err: e.message });
      }
    }
    return sent;
  }
  function setMaxRetries(n) { maxRetries = n; }
  return { enqueue, peek, size, clear, drain, setMaxRetries, _queue: queue };
}

module.exports = { newOfflineQueue };

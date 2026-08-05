'use strict';
// Redis Streams adapter (stub). In sandbox we use the in-memory bus; in
// production this is a thin wrapper around XADD/XREAD. The shape is identical
// to bus/realtime.js so callers can swap without changes.

function newRedisStreamsAdapter() {
  // Stub: returns the same interface as realtime.js but flags production mode.
  const fallthrough = require('./realtime').newRealtimeBus();
  return Object.assign({}, fallthrough, { _backend: 'redis-stub' });
}

module.exports = { newRedisStreamsAdapter };

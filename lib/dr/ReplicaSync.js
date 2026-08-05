'use strict';
// ReplicaSync — tracks WAL lag between primary and secondary, in milliseconds.
// In production this streams `pg_recvlogical` output and measures gap.

function newReplicaSync() {
  let primary = 0;
  let secondary = 0;
  function write(walPos) { primary = walPos; }
  function replay(walPos) { secondary = walPos; }
  function lag() {
    return Math.max(0, primary - secondary);
  }
  function status() {
    const l = lag();
    return { primary, secondary, lag: l, healthy: l < 5000 };
  }
  return { write, replay, lag, status };
}

module.exports = { newReplicaSync };

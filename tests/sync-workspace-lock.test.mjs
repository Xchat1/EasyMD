import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquireWorkspaceLock, WORKSPACE_LOCK_NAME } from '../src/utils/workspaceLock.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function lockManager(beforeCallback = async () => {}) {
  let held = false;
  const calls = [];
  return {
    calls,
    isHeld: () => held,
    request: async (name, options, callback) => {
      calls.push({ name, options });
      const lock = held ? null : { name };
      if (lock) held = true;
      try {
        await beforeCallback();
        await callback(lock);
      } finally {
        if (lock) held = false;
      }
    },
  };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('one writer holds the lock and another window is immediately a reader', async () => {
  const manager = lockManager();
  const firstStatuses = [];
  const first = acquireWorkspaceLock(manager, (status) => firstStatuses.push(status));
  await nextTurn();
  assert.deepEqual(firstStatuses, ['writer']);
  const secondStatuses = [];
  const second = acquireWorkspaceLock(manager, (status) => secondStatuses.push(status));
  await second.settled;
  assert.deepEqual(secondStatuses, ['reader']);
  assert.deepEqual(manager.calls[0], { name: WORKSPACE_LOCK_NAME, options: { mode: 'exclusive', ifAvailable: true } });
  first.dispose();
  await first.settled;
  assert.equal(manager.isHeld(), false);
  second.dispose();
});

test('cleanup before the browser request begins neither takes a lock nor updates state', async () => {
  const manager = lockManager();
  const statuses = [];
  const lease = acquireWorkspaceLock(manager, (status) => statuses.push(status));
  lease.dispose();
  lease.dispose();
  await lease.settled;
  assert.deepEqual(statuses, []);
  assert.equal(manager.calls.length, 0);
  assert.equal(manager.isHeld(), false);
});

test('StrictMode remount waits for an already-granted but not-yet-delivered lock to release', async () => {
  const gate = deferred();
  const manager = lockManager(() => gate.promise);
  const staleStatuses = [];
  const first = acquireWorkspaceLock(manager, (status) => staleStatuses.push(status));
  await nextTurn();
  assert.equal(manager.isHeld(), true);
  first.dispose();
  const currentStatuses = [];
  const second = acquireWorkspaceLock(manager, (status) => currentStatuses.push(status));
  await nextTurn();
  assert.equal(manager.calls.length, 1, 'the remounted effect waits for the disposed request');
  gate.resolve();
  await first.settled;
  await nextTurn();
  assert.deepEqual(staleStatuses, []);
  assert.deepEqual(currentStatuses, ['writer']);
  second.dispose();
  await second.settled;
  assert.equal(manager.isHeld(), false);
});

test('a newly opened window can write after the former writer releases its lock', async () => {
  const manager = lockManager();
  const first = acquireWorkspaceLock(manager, () => {});
  await nextTurn();
  first.dispose();
  const statuses = [];
  const next = acquireWorkspaceLock(manager, (status) => statuses.push(status));
  await nextTurn();
  assert.deepEqual(statuses, ['writer']);
  next.dispose();
  await Promise.all([first.settled, next.settled]);
});

test('missing Web Locks reports unsupported; request failures fail closed as reader', async () => {
  const fallbackStatuses = [];
  const unsupported = acquireWorkspaceLock(undefined, (status) => fallbackStatuses.push(status));
  await unsupported.settled;
  assert.deepEqual(fallbackStatuses, ['unsupported']);
  unsupported.dispose();
  const failedStatuses = [];
  const failure = acquireWorkspaceLock({ request: async () => { throw new Error('denied'); } }, (status) => failedStatuses.push(status));
  await failure.settled;
  assert.deepEqual(failedStatuses, ['reader']);
  failure.dispose();
});

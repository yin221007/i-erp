import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  canonicalizeMaintenanceJob,
  createMaintenanceQueue,
  signMaintenanceJob,
  verifyMaintenanceJob
} from '../../server/services/maintenance-jobs.js';

const SECRET = 'maintenance-test-secret-at-least-32-characters';
const NOW = new Date('2026-06-14T01:00:00.000Z');
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const NONCE = '22222222-2222-4222-8222-222222222222';

function unsignedJob(overrides = {}) {
  return {
    schemaVersion: 1,
    id: JOB_ID,
    operation: 'restore',
    backupId: '20260613T225651Z-upgrade',
    requestedBy: 'u-1',
    requestedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    nonce: NONCE,
    ...overrides
  };
}

async function createQueueRoot() {
  return mkdtemp(path.join(tmpdir(), 'ierp-maintenance-queue-'));
}

test('canonical serialization is deterministic and excludes the signature', () => {
  const first = unsignedJob();
  const second = {
    nonce: NONCE,
    requestedBy: 'u-1',
    operation: 'restore',
    schemaVersion: 1,
    backupId: '20260613T225651Z-upgrade',
    expiresAt: first.expiresAt,
    id: JOB_ID,
    requestedAt: first.requestedAt,
    signature: 'ignored'
  };

  assert.equal(
    canonicalizeMaintenanceJob(first),
    canonicalizeMaintenanceJob(second)
  );
  assert.equal(canonicalizeMaintenanceJob(first).includes('signature'), false);
});

test('signed jobs verify and any field tampering is rejected', () => {
  const job = signMaintenanceJob(unsignedJob(), SECRET);

  assert.equal(verifyMaintenanceJob(job, SECRET, { now: NOW }), true);
  assert.equal(
    verifyMaintenanceJob({ ...job, requestedBy: 'attacker' }, SECRET, {
      now: NOW
    }),
    false
  );
  assert.equal(
    verifyMaintenanceJob({ ...job, extra: 'command' }, SECRET, { now: NOW }),
    false
  );
});

test('expired jobs and invalid schemas are rejected', () => {
  const expired = signMaintenanceJob(
    unsignedJob({
      requestedAt: '2026-06-14T00:00:00.000Z',
      expiresAt: '2026-06-14T00:05:00.000Z'
    }),
    SECRET
  );
  const badOperation = signMaintenanceJob(
    unsignedJob({ operation: 'shell' }),
    SECRET
  );

  assert.equal(verifyMaintenanceJob(expired, SECRET, { now: NOW }), false);
  assert.equal(verifyMaintenanceJob(badOperation, SECRET, { now: NOW }), false);
});

test('enqueue atomically writes a signed request with a private file mode', async () => {
  const queueRoot = await createQueueRoot();
  const queue = createMaintenanceQueue({
    queueRoot,
    secret: SECRET,
    now: () => NOW,
    randomUUID: (() => {
      const values = [JOB_ID, NONCE];
      return () => values.shift();
    })()
  });

  const safeJob = await queue.enqueue({
    operation: 'restore',
    backupId: '20260613T225651Z-upgrade',
    requestedBy: 'u-1'
  });
  const stored = JSON.parse(
    await readFile(path.join(queueRoot, 'pending', `${JOB_ID}.json`), 'utf8')
  );

  assert.deepEqual(safeJob, {
    id: JOB_ID,
    operation: 'restore',
    backupId: '20260613T225651Z-upgrade',
    requestedBy: 'u-1',
    requestedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    state: 'pending'
  });
  assert.equal(verifyMaintenanceJob(stored, SECRET, { now: NOW }), true);
  assert.equal(Object.hasOwn(safeJob, 'signature'), false);
  assert.equal(Object.hasOwn(safeJob, 'nonce'), false);
});

test('queue rejects a second job while pending or running work exists', async () => {
  const queueRoot = await createQueueRoot();
  const queue = createMaintenanceQueue({
    queueRoot,
    secret: SECRET,
    now: () => NOW
  });
  await mkdir(path.join(queueRoot, 'running'), { recursive: true });
  await writeFile(
    path.join(queueRoot, 'running', `${JOB_ID}.json`),
    JSON.stringify(signMaintenanceJob(unsignedJob(), SECRET))
  );

  await assert.rejects(
    () =>
      queue.enqueue({
        operation: 'backup',
        requestedBy: 'u-1'
      }),
    error => error?.code === 'MAINTENANCE_JOB_ACTIVE'
  );
});

test('concurrent enqueue attempts create only one pending job', async () => {
  const queueRoot = await createQueueRoot();
  const queue = createMaintenanceQueue({
    queueRoot,
    secret: SECRET,
    now: () => NOW
  });

  const results = await Promise.allSettled([
    queue.enqueue({ operation: 'backup', requestedBy: 'u-1' }),
    queue.enqueue({ operation: 'backup', requestedBy: 'u-2' })
  ]);
  const pending = await import('node:fs/promises').then(fs =>
    fs.readdir(path.join(queueRoot, 'pending'))
  );

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(pending.length, 1);
});

test('nonce consumption rejects replayed signed jobs', async () => {
  const queueRoot = await createQueueRoot();
  const queue = createMaintenanceQueue({
    queueRoot,
    secret: SECRET,
    now: () => NOW
  });
  const job = signMaintenanceJob(unsignedJob(), SECRET);

  await queue.verifyAndConsume(job);
  await assert.rejects(
    () => queue.verifyAndConsume(job),
    error => error?.code === 'MAINTENANCE_JOB_REPLAY'
  );
});

test('status reads return sanitized data and reject malformed status files', async () => {
  const queueRoot = await createQueueRoot();
  const queue = createMaintenanceQueue({
    queueRoot,
    secret: SECRET,
    now: () => NOW
  });
  await mkdir(path.join(queueRoot, 'status'), { recursive: true });
  await writeFile(
    path.join(queueRoot, 'status', `${JOB_ID}.json`),
    JSON.stringify({
      id: JOB_ID,
      operation: 'restore',
      backupId: '20260613T225651Z-upgrade',
      state: 'running',
      phase: 'pre_restore_backup',
      message: '正在创建恢复前快照',
      updatedAt: NOW.toISOString(),
      hostPath: '/volume2/private',
      signature: 'private'
    })
  );

  assert.deepEqual(await queue.getStatus(JOB_ID), {
    id: JOB_ID,
    operation: 'restore',
    backupId: '20260613T225651Z-upgrade',
    state: 'running',
    phase: 'pre_restore_backup',
    message: '正在创建恢复前快照',
    updatedAt: NOW.toISOString()
  });

  await writeFile(
    path.join(queueRoot, 'status', `${NONCE}.json`),
    '{"state":"running"}'
  );
  await assert.rejects(() => queue.getStatus(NONCE), /invalid status/i);
});

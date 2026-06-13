import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBackupsToDelete } from '../../server/services/backup.js';

const GB = 1024 ** 3;

function backup(id, {
  kind = 'daily',
  status = 'complete',
  sizeBytes = GB,
  locked = false,
  createdAt
} = {}) {
  return {
    id,
    kind,
    status,
    sizeBytes,
    locked,
    createdAt: createdAt || `2026-06-${id.padStart(2, '0')}T00:00:00.000Z`
  };
}

test('retention keeps seven newest daily backups', () => {
  const backups = Array.from({ length: 10 }, (_, index) =>
    backup(String(index + 1))
  );

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds.sort(), ['1', '2', '3']);
});

test('retention keeps three newest unlocked upgrade snapshots and all locked ones', () => {
  const backups = [
    backup('1', { kind: 'upgrade' }),
    backup('2', { kind: 'upgrade', locked: true }),
    backup('3', { kind: 'upgrade' }),
    backup('4', { kind: 'upgrade' }),
    backup('5', { kind: 'upgrade' })
  ];

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds, ['1']);
  assert.equal(result.deleteIds.includes('2'), false);
});

test('capacity cleanup removes oldest complete unlocked backups first', () => {
  const backups = [
    backup('1', { sizeBytes: 200 * GB }),
    backup('2', { sizeBytes: 200 * GB }),
    backup('3', { sizeBytes: 50 * GB, locked: true })
  ];

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 200 * GB
  });

  assert.deepEqual(result.deleteIds, ['1']);
});

test('capacity cleanup refuses backup when locked data prevents enough space', () => {
  const backups = [
    backup('1', { sizeBytes: 300 * GB, locked: true }),
    backup('2', { sizeBytes: 150 * GB, locked: true })
  ];

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 100 * GB
  });

  assert.equal(result.refused, true);
  assert.match(result.reason, /500 GB|capacity/i);
  assert.deepEqual(result.deleteIds, []);
});

test('incomplete generations are deleted and never treated as restore backups', () => {
  const backups = [
    backup('1', { status: 'incomplete' }),
    backup('2', { status: 'complete' })
  ];

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds, ['1']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectBackupsToDelete } from '../../server/services/backup.js';

const GB = 1024 ** 3;
const retentionScriptUrl = new URL(
  '../../scripts/apply-backup-retention.js',
  import.meta.url
);

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

test('retention keeps six newest daily backups', () => {
  const backups = Array.from({ length: 10 }, (_, index) =>
    backup(String(index + 1))
  );

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 6,
    upgradeRetention: 3,
    manualRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds.sort(), ['1', '2', '3', '4']);
});

test('retention script applies the six-daily policy', async () => {
  const source = await readFile(retentionScriptUrl, 'utf8');

  assert.match(source, /dailyRetention:\s*6/);
  assert.match(source, /upgradeRetention:\s*3/);
  assert.match(source, /manualRetention:\s*3/);
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
    manualRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds, ['1']);
  assert.equal(result.deleteIds.includes('2'), false);
});

test('retention keeps three newest manual backups', () => {
  const backups = Array.from({ length: 5 }, (_, index) =>
    backup(String(index + 1), { kind: 'manual' })
  );

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    manualRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds, ['1', '2']);
});

test('locked pre-restore snapshots are retained unless capacity must be refused', () => {
  const backups = [
    backup('1', {
      kind: 'pre-restore',
      locked: true,
      sizeBytes: 300 * GB
    }),
    backup('2', {
      kind: 'pre-restore',
      locked: true,
      sizeBytes: 150 * GB
    })
  ];

  const result = selectBackupsToDelete(backups, {
    dailyRetention: 7,
    upgradeRetention: 3,
    manualRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 100 * GB
  });

  assert.equal(result.refused, true);
  assert.deepEqual(result.deleteIds, []);
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
    manualRetention: 3,
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
    manualRetention: 3,
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
    manualRetention: 3,
    capacityBytes: 500 * GB,
    requiredBytes: 0
  });

  assert.deepEqual(result.deleteIds, ['1']);
});

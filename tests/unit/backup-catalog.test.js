import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBackupCatalog } from '../../server/services/backup-catalog.js';

const REQUIRED_FILES = [
  'complete',
  'database.sql.gz',
  'uploads.tar.gz',
  'table-counts.tsv'
];

async function createRoot() {
  return mkdtemp(path.join(tmpdir(), 'ierp-backup-catalog-'));
}

async function createBackup(root, id, metadata = {}, options = {}) {
  const directory = path.join(root, id);
  await mkdir(directory);

  for (const file of REQUIRED_FILES) {
    if (!options.missing?.includes(file)) {
      await writeFile(path.join(directory, file), file === 'complete' ? '' : file);
    }
  }

  const completeMetadata = {
    id,
    kind: id.split('-').at(-1),
    status: 'complete',
    createdAt: '2026-06-13T22:56:51Z',
    sizeBytes: 293203968,
    uploadFileCount: 113,
    ...metadata
  };
  await writeFile(
    path.join(directory, 'metadata.json'),
    options.rawMetadata ?? JSON.stringify(completeMetadata)
  );
  await writeFile(
    path.join(directory, 'manifest.sha256'),
    options.manifest ?? `${'a'.repeat(64)}  database.sql.gz\n`
  );

  if (options.restoreDrill) {
    const manifest = await import('node:fs/promises').then(fs =>
      fs.readFile(path.join(directory, 'manifest.sha256'))
    );
    await writeFile(
      path.join(directory, 'restore-drill.ok'),
      `status=success\nmanifest_sha256=${createHash('sha256').update(manifest).digest('hex')}\n`
    );
  }

  return directory;
}

test('catalog returns sanitized complete backup metadata newest first', async () => {
  const root = await createRoot();
  await createBackup(root, '20260613T225651Z-upgrade', {}, { restoreDrill: true });
  await createBackup(root, '20260612T225651Z-daily', {
    createdAt: '2026-06-12T22:56:51Z'
  });

  const catalog = createBackupCatalog({ backupRoot: root });
  const backups = await catalog.list();

  assert.deepEqual(backups[0], {
    id: '20260613T225651Z-upgrade',
    kind: 'upgrade',
    status: 'complete',
    createdAt: '2026-06-13T22:56:51.000Z',
    sizeBytes: 293203968,
    uploadFileCount: 113,
    locked: false,
    restoreDrillVerified: true,
    selectable: true,
    issues: []
  });
  assert.equal(JSON.stringify(backups).includes(root), false);
});

test('catalog marks recognized backups unselectable when required files are missing', async () => {
  const root = await createRoot();
  await createBackup(
    root,
    '20260613T225651Z-upgrade',
    {},
    { missing: ['uploads.tar.gz'] }
  );

  const [backup] = await createBackupCatalog({ backupRoot: root }).list();

  assert.equal(backup.selectable, false);
  assert.equal(backup.status, 'invalid');
  assert.deepEqual(backup.issues, ['missing:uploads.tar.gz']);
});

test('catalog rejects malformed or mismatched metadata without exposing its contents', async () => {
  const root = await createRoot();
  await createBackup(
    root,
    '20260613T225651Z-upgrade',
    {},
    { rawMetadata: '{"password":"secret"' }
  );
  await createBackup(root, '20260612T225651Z-daily', {
    id: '20260611T225651Z-daily'
  });

  const backups = await createBackupCatalog({ backupRoot: root }).list();

  assert.equal(backups.length, 2);
  assert.ok(backups.every(backup => backup.status === 'invalid'));
  assert.ok(backups.every(backup => backup.selectable === false));
  assert.equal(JSON.stringify(backups).includes('secret'), false);
});

test('catalog ignores invalid names, incomplete generations, files, and symlinks', async () => {
  const root = await createRoot();
  const outside = await createRoot();
  await createBackup(outside, '20260613T225651Z-upgrade');
  await mkdir(path.join(root, '.incomplete-20260613T225651Z-upgrade'));
  await mkdir(path.join(root, '../ignored-outside'), { recursive: true });
  await writeFile(path.join(root, 'not-a-backup'), 'file');
  await mkdir(path.join(root, '20260613T225651Z-unknown'));
  await symlink(
    path.join(outside, '20260613T225651Z-upgrade'),
    path.join(root, '20260614T225651Z-upgrade')
  );

  const backups = await createBackupCatalog({ backupRoot: root }).list();

  assert.deepEqual(backups, []);
});

test('catalog rejects a configured root that resolves through a symlink', async () => {
  const parent = await createRoot();
  const realRoot = path.join(parent, 'real');
  const linkedRoot = path.join(parent, 'linked');
  await mkdir(realRoot);
  await symlink(realRoot, linkedRoot);

  await assert.rejects(
    () => createBackupCatalog({ backupRoot: linkedRoot }).list(),
    /symbolic link/i
  );
});

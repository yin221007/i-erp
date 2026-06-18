import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const restoreScriptUrl = new URL(
  '../../scripts/restore-drill.sh',
  import.meta.url
);
const backupRouteUrl = new URL(
  '../../server/routes/backup.js',
  import.meta.url
);

test('restore drill rejects backups without completion and checksum validation', async () => {
  const source = await readFile(restoreScriptUrl, 'utf8');

  assert.match(source, /complete/);
  assert.match(source, /sha256sum\s+--check/);
});

test('restore drill imports into a generated temporary database', async () => {
  const source = await readFile(restoreScriptUrl, 'utf8');

  assert.match(source, /ierp_restore_/);
  assert.match(source, /CREATE DATABASE/);
  assert.doesNotMatch(source, /DROP DATABASE.*DB_NAME/);
});

test('restore drill verifies table counts and upload archive contents', async () => {
  const source = await readFile(restoreScriptUrl, 'utf8');

  assert.match(source, /table-counts\.tsv/);
  assert.match(source, /uploads\.tar\.gz/);
  assert.match(source, /uploadFileCount/);
});

test('restore drill is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', restoreScriptUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

test('backend no longer contains live TRUNCATE restore logic', async () => {
  const source = await readFile(backupRouteUrl, 'utf8');

  assert.doesNotMatch(source, /TRUNCATE TABLE/);
  assert.match(source, /\/backup\/import/);
  assert.match(source, /status\(410\)/);
});

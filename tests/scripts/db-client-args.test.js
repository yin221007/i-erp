import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const helperUrl = new URL('scripts/db-client-args.sh', root);

function loadArgs(mode) {
  return spawnSync(
    '/bin/bash',
    [
      '-c',
      'source "$1"; printf "%s\\n" "${DB_CLIENT_ARGS[@]}"',
      'bash',
      helperUrl.pathname
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, DB_CLIENT_TLS: mode }
    }
  );
}

test('database clients explicitly disable TLS for the legacy NAS database', () => {
  const result = loadArgs('disabled');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '--skip-ssl');
});

test('database clients can require TLS when the database is upgraded', () => {
  const result = loadArgs('required');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '--ssl');
});

test('database client TLS mode rejects unknown values', () => {
  const result = loadArgs('unknown');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB_CLIENT_TLS/);
});

test('all maintenance scripts pass the shared TLS arguments', async () => {
  for (const name of [
    'scripts/backup.sh',
    'scripts/restore-drill.sh',
    'scripts/deploy-lib.sh',
    'scripts/rollback.sh'
  ]) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.match(source, /DB_CLIENT_ARGS/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const scriptUrl = new URL('../../scripts/backup.sh', import.meta.url);

test('backup script streams database output directly into gzip', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /mariadb-dump[\s\S]*\|\s*gzip/);
  assert.doesNotMatch(source, /\$\(\s*mariadb-dump/);
});

test('backup script uses a single-job lock and incomplete generation directory', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /\.backup\.lock/);
  assert.match(source, /\.incomplete-/);
  assert.match(source, /complete/);
});

test('backup script checks free bytes and free percentage before dumping', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /MIN_FREE_BYTES/);
  assert.match(source, /MIN_FREE_PERCENT/);
  assert.match(source, /\bdf\b/);
});

test('backup script writes checksums and metadata before atomic promotion', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /manifest\.sha256/);
  assert.match(source, /metadata\.json/);
  assert.match(source, /\bmv\b/);
});

test('backup script is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', scriptUrl.pathname], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});

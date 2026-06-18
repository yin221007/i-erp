import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const scriptUrl = new URL('../../scripts/verify-release.sh', import.meta.url);

test('release gate performs clean install, tests, build, audit, and script checks', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  for (const marker of [
    'npm ci',
    'npm test',
    'npm run build',
    'npm audit',
    'bash -n',
    'docker compose'
  ]) {
    assert.match(source, new RegExp(marker.replace(' ', '\\s+')));
  }
});

test('release gate is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', scriptUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

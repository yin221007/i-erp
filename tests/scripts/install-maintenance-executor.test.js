import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const installerUrl = new URL(
  '../../scripts/install-maintenance-executor.sh',
  import.meta.url
);

test('installer is idempotent and uses a fixed release and wrapper path', async () => {
  const source = await readFile(installerUrl, 'utf8');

  assert.match(source, /IERP_RELEASE_ROOT/);
  assert.match(source, /\/volume2\/docker\/ierp/);
  assert.match(source, /\/volume2\/docker\/ierp-maintenance\/run\.sh/);
  assert.match(source, /install -d/);
  assert.match(source, /install -m 700/);
  assert.doesNotMatch(source, /\brm -rf\b/);
});

test('installer protects the queue and signing secret without printing it', async () => {
  const source = await readFile(installerUrl, 'utf8');

  assert.match(source, /MAINTENANCE_JOB_SECRET/);
  assert.match(source, /openssl rand -hex 32/);
  assert.match(source, /chmod 600/);
  assert.match(source, /chmod 700/);
  assert.doesNotMatch(source, /echo "\$MAINTENANCE_JOB_SECRET"/);
  assert.doesNotMatch(source, /set -x/);
});

test('installer documents the exact root-owned Synology scheduler command', async () => {
  const source = await readFile(installerUrl, 'utf8');

  assert.match(source, /Synology Task Scheduler/);
  assert.match(source, /User: root/);
  assert.match(
    source,
    /bash \/volume2\/docker\/ierp-maintenance\/run\.sh/
  );
});

test('executor wrapper uses syslog instead of an unbounded private log file', async () => {
  const source = await readFile(installerUrl, 'utf8');

  assert.match(source, /\blogger\b/);
  assert.doesNotMatch(source, />>.*\.log/);
});

test('installer is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', installerUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

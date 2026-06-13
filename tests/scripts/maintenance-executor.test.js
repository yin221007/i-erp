import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const executorUrl = new URL(
  '../../scripts/maintenance-executor.sh',
  import.meta.url
);
const helperUrl = new URL(
  '../../scripts/maintenance-job-cli.js',
  import.meta.url
);
const backupDockerfileUrl = new URL('../../Dockerfile.backup', import.meta.url);

test('executor accepts no positional input and claims one fixed-schema job atomically', async () => {
  const source = await readFile(executorUrl, 'utf8');

  assert.doesNotMatch(source, /\$\{1:-/);
  assert.doesNotMatch(source, /main "\$@"/);
  assert.doesNotMatch(source, /\beval\b/);
  assert.match(source, /pending/);
  assert.match(source, /running/);
  assert.match(source, /\bmv\b/);
  assert.match(source, /maintenance-job-cli\.js/);
  assert.match(source, /verify-and-consume/);
});

test('executor dispatches only backup and restore operations', async () => {
  const source = await readFile(executorUrl, 'utf8');

  assert.match(source, /case "\$operation" in/);
  assert.match(source, /backup\)/);
  assert.match(source, /restore\)/);
  assert.match(source, /run_manual_backup/);
  assert.match(source, /run_guarded_restore/);
  assert.doesNotMatch(source, /\$\(\s*\$operation/);
});

test('manual backup failure cannot fall through to a completed status', async () => {
  const source = await readFile(executorUrl, 'utf8');

  assert.match(source, /if ! app_compose --profile backup run/);
  assert.match(source, /return 1/);
});

test('job verification runs inside the immutable backup image', async () => {
  const [executor, helper, dockerfile] = await Promise.all([
    readFile(executorUrl, 'utf8'),
    readFile(helperUrl, 'utf8'),
    readFile(backupDockerfileUrl, 'utf8')
  ]);

  assert.match(executor, /--entrypoint node/);
  assert.match(executor, /IERP_BACKUP_IMAGE/);
  assert.doesNotMatch(executor, /require_command[^\n]*\bnode\b/);
  assert.match(helper, /createMaintenanceQueue/);
  assert.match(helper, /verifyAndConsume/);
  assert.match(dockerfile, /maintenance-jobs\.js/);
  assert.match(dockerfile, /maintenance-job-cli\.js/);
});

test('executor writes status atomically and never exposes the signing secret', async () => {
  const source = await readFile(executorUrl, 'utf8');

  assert.match(source, /\.tmp/);
  assert.match(source, /\bmv\b/);
  assert.doesNotMatch(source, /printf[^\n]*MAINTENANCE_JOB_SECRET/);
  assert.doesNotMatch(source, /set -x/);
});

test('maintenance replaces the frontend in a fixed port-safe order', async () => {
  const restore = await readFile(
    new URL('../../scripts/maintenance-restore.sh', import.meta.url),
    'utf8'
  );
  const startFunction = restore.slice(
    restore.indexOf('start_maintenance_response()'),
    restore.indexOf('create_pre_restore_backup()')
  );
  const resumeFunction = restore.slice(
    restore.indexOf('resume_public_application()'),
    restore.indexOf('automatic_rollback()')
  );

  assert.ok(startFunction.indexOf('app_compose stop frontend') >= 0);
  assert.ok(
    startFunction.indexOf('maintenance_compose up -d') >
      startFunction.indexOf('app_compose stop frontend')
  );
  assert.ok(resumeFunction.indexOf('stop_maintenance_response') >= 0);
  assert.ok(
    resumeFunction.indexOf('up -d frontend') >
      resumeFunction.indexOf('stop_maintenance_response')
  );
});

test('executor scripts are valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', executorUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const deployUrl = new URL(
  '../../scripts/deploy-blue-green.sh',
  import.meta.url
);
const rollbackUrl = new URL('../../scripts/rollback.sh', import.meta.url);
const restoreDrillUrl = new URL(
  '../../scripts/restore-drill.sh',
  import.meta.url
);

test('deployment gates clone rehearsal, snapshot, cutover, and auto rollback', async () => {
  const source = await readFile(deployUrl, 'utf8');
  const orderedMarkers = [
    '# STEP 1: verify_restore_drill',
    '# STEP 2: build_candidate_images',
    '# STEP 3: start_clone_candidate',
    '# STEP 4: BUSINESS_SMOKE_CONFIRMATION',
    '# STEP 5: MAINTENANCE_CONFIRMATION',
    '# STEP 6: create_upgrade_snapshot',
    '# STEP 7: start_production_candidate',
    '# STEP 8: LUCKY_CUTOVER_CONFIRMATION'
  ];
  let previous = -1;
  for (const marker of orderedMarkers) {
    const position = source.indexOf(marker);
    assert.ok(position > previous, `${marker} must appear in deployment order`);
    previous = position;
  }

  assert.match(source, /rollback\.sh/);
  assert.match(source, /AUTO_ROLLBACK/);
  assert.match(source, /trap automatic_rollback EXIT/);
  assert.match(source, /\[\[ "\$status" -eq 0 \]\] && exit 0/);
  assert.doesNotMatch(source, /lucky.*(?:api|token)/i);
});

test('rollback verifies a named snapshot before restoring data and old stack', async () => {
  const source = await readFile(rollbackUrl, 'utf8');

  const verify = source.indexOf('# STEP 1: verify_snapshot');
  const stopGreen = source.indexOf('# STEP 2: stop_green_stack');
  const restoreDatabase = source.indexOf('# STEP 3: restore_database');
  const restoreUploads = source.indexOf('# STEP 4: restore_uploads');
  const startOld = source.indexOf('# STEP 5: start_old_stack');
  assert.ok(verify >= 0);
  assert.ok(stopGreen > verify);
  assert.ok(restoreDatabase > stopGreen);
  assert.ok(restoreUploads > restoreDatabase);
  assert.ok(startOld > restoreUploads);
  assert.match(source, /ROLLBACK_CONFIRMATION/);
  assert.doesNotMatch(source, /lucky.*(?:api|token)/i);
});

test('restore drill records a manifest-bound success marker', async () => {
  const source = await readFile(restoreDrillUrl, 'utf8');

  assert.match(source, /restore-drill\.ok/);
  assert.match(source, /manifest_sha256/);
  assert.match(source, /status=success/);
});

test('deployment isolates clone jobs and wires production to the supervised queue', async () => {
  const source = await readFile(deployUrl, 'utf8');

  assert.match(source, /GREEN_CLONE_MAINTENANCE_QUEUE_PATH/);
  assert.match(
    source,
    /GREEN_MAINTENANCE_QUEUE_PATH="\$GREEN_CLONE_MAINTENANCE_QUEUE_PATH"[\s\S]*start_clone_candidate/
  );
  assert.match(
    source,
    /GREEN_MAINTENANCE_QUEUE_PATH="\$MAINTENANCE_QUEUE_PATH"[\s\S]*start_production_candidate/
  );
});

test('deployment builds the immutable maintenance response image', async () => {
  const source = await readFile(deployUrl, 'utf8');

  assert.match(source, /docker-compose\.maintenance\.yml/);
  assert.match(source, /build maintenance/);
});

test('deployment scripts are valid Bash syntax', () => {
  for (const url of [deployUrl, rollbackUrl]) {
    const result = spawnSync('/bin/bash', ['-n', url.pathname], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

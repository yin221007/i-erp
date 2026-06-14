import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const restoreUrl = new URL(
  '../../scripts/maintenance-restore.sh',
  import.meta.url
);

test('guarded restore follows the verified destructive phase order', async () => {
  const source = await readFile(restoreUrl, 'utf8');
  const markers = [
    '# PHASE 1: verify_selected_snapshot',
    '# PHASE 2: run_restore_drill',
    '# PHASE 3: start_maintenance_response',
    '# PHASE 4: create_pre_restore_backup',
    '# PHASE 5: stop_application',
    '# PHASE 6: restore_database',
    '# PHASE 7: restore_uploads',
    '# PHASE 8: start_application',
    '# PHASE 9: verify_and_finish'
  ];

  let previous = -1;
  for (const marker of markers) {
    const position = source.indexOf(marker);
    assert.ok(position > previous, `${marker} must appear in restore order`);
    previous = position;
  }
});

test('restore uses fixed roots and validates the backup id before constructing paths', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(source, /BACKUP_PATH/);
  assert.match(source, /UPLOADS_PATH/);
  assert.match(source, /\^\[0-9\]\{8\}T\[0-9\]\{6\}Z-/);
  assert.doesNotMatch(source, /\$\{1:-/);
  assert.doesNotMatch(source, /main "\$@"/);
  assert.doesNotMatch(source, /\beval\b/);
});

test('restore uses the deployed green stack for the app and the base stack for backups', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(source, /IERP_APP_COMPOSE_FILE/);
  assert.match(source, /IERP_BACKUP_COMPOSE_FILE/);
  assert.match(source, /application_compose/);
  assert.match(source, /backup_compose/);
  assert.match(source, /GREEN_DB_NAME="\$\{GREEN_DB_NAME:-\$DB_NAME\}"/);
  assert.match(
    source,
    /GREEN_UPLOADS_PATH="\$\{GREEN_UPLOADS_PATH:-\$UPLOADS_PATH\}"/
  );
  assert.match(
    source,
    /GREEN_MAINTENANCE_QUEUE_PATH="\$\{GREEN_MAINTENANCE_QUEUE_PATH:-\$MAINTENANCE_QUEUE_PATH\}"/
  );
});

test('every destructive restore failure triggers pre-restore rollback', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(source, /trap automatic_rollback EXIT/);
  assert.match(source, /destructive_started=1/);
  assert.match(source, /restore_database_from_snapshot "\$pre_restore_snapshot"/);
  assert.match(source, /restore_uploads_from_snapshot "\$pre_restore_snapshot"/);
  assert.match(source, /start_application/);
  assert.match(source, /write_status failed/);
});

test('validation failures before maintenance leave the running app untouched', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(
    source,
    /\[\[ "\$maintenance_started" -eq 0 &&\s+"\$frontend_stopped" -eq 0 &&\s+"\$destructive_started" -eq 0 \]\]/
  );
  assert.match(source, /validation_failed/);
});

test('maintenance startup failure restarts a frontend that was already stopped', async () => {
  const source = await readFile(restoreUrl, 'utf8');
  const start = source.slice(
    source.indexOf('start_maintenance_response()'),
    source.indexOf('create_pre_restore_backup()')
  );
  const recovery = source.slice(
    source.indexOf('automatic_rollback()'),
    source.indexOf('trap automatic_rollback EXIT')
  );

  assert.match(start, /frontend_stopped=1/);
  assert.match(recovery, /frontend_stopped/);
  assert.match(recovery, /resume_public_application/);
});

test('restored data is verified before the public frontend resumes', async () => {
  const source = await readFile(restoreUrl, 'utf8');
  const verify = source.lastIndexOf(
    'compare_table_counts "$selected_snapshot" "$DB_NAME"'
  );
  const resume = source.lastIndexOf('resume_public_application');

  assert.ok(verify > 0);
  assert.ok(resume > verify);
});

test('automatic rollback blocks writes and stops the backend before restoring', async () => {
  const source = await readFile(restoreUrl, 'utf8');
  const rollback = source.indexOf('automatic_rollback()');
  const stop = source.indexOf('stop_application', rollback);
  const restore = source.indexOf(
    'restore_database_from_snapshot "$pre_restore_snapshot"',
    rollback
  );

  assert.ok(stop > rollback);
  assert.ok(restore > stop);
});

test('automatic rollback isolates fatal recovery steps and evaluates every result', async () => {
  const source = await readFile(restoreUrl, 'utf8');
  const recovery = source.slice(
    source.indexOf('automatic_rollback()'),
    source.indexOf('trap automatic_rollback EXIT')
  );

  assert.match(
    recovery,
    /if \( restore_database_from_snapshot "\$pre_restore_snapshot" \); then/
  );
  assert.match(
    recovery,
    /if \( restore_uploads_from_snapshot "\$pre_restore_snapshot" \); then/
  );
  assert.match(recovery, /if \( start_application \); then/);
  assert.match(recovery, /if \( resume_public_application \); then/);
});

test('uploads restore is staged and promoted instead of extracted over live files', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(source, /validate_upload_archive/);
  assert.match(source, /\*\/\.\.\/*/);
  assert.match(source, /\^\[lh\]/);
  assert.match(source, /restore-staging/);
  assert.match(source, /tar -xzf/);
  assert.match(source, /\bmv\b/);
  assert.match(source, /if ! \(\s*tar -xzf/);
  assert.match(source, /rm -rf -- "\$staging"/);
  assert.doesNotMatch(source, /tar -xzf[^\n]*-C "\$UPLOADS_PATH"/);
});

test('verified success removes bounded upload quarantine directories', async () => {
  const source = await readFile(restoreUrl, 'utf8');

  assert.match(source, /cleanup_upload_quarantines\(\)/);
  assert.match(source, /-maxdepth 1/);
  assert.match(source, /before-restore-/);
  assert.match(source, /cleanup_upload_quarantines[\s\S]*write_status completed/);
  assert.match(
    source,
    /cleanup_upload_quarantines[\s\S]*automatic rollback completed/
  );
});

test('maintenance restore script is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', restoreUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

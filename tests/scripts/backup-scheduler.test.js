import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  readFile,
  writeFile
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const schedulerUrl = new URL('scripts/backup-scheduler.sh', root);

async function runScheduler({
  date,
  time,
  marker = ''
}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ierp-scheduler-'));
  const binDirectory = path.join(directory, 'bin');
  const backupRoot = path.join(directory, 'backups');
  const schedulerPath = path.join(directory, 'backup-scheduler.sh');
  const backupPath = path.join(directory, 'backup.sh');
  const logPath = path.join(directory, 'backup.log');
  await writeFile(schedulerPath, await readFile(schedulerUrl, 'utf8'));
  await writeFile(backupPath, `#!/usr/bin/env bash
printf '%s|%s\\n' "$BACKUP_KIND" "$BACKUP_ID" >> "$BACKUP_TEST_LOG"
`);
  await writeFile(path.join(directory, 'date'), `#!/usr/bin/env bash
case "$*" in
  "+%F") printf '%s\\n' "$FAKE_DATE" ;;
  "+%H") printf '%s\\n' "\${FAKE_TIME%:*}" ;;
  "+%M") printf '%s\\n' "\${FAKE_TIME#*:}" ;;
  "-u +%Y%m%dT%H%M%SZ") printf '20260615T000000Z\\n' ;;
  *) exit 64 ;;
esac
`);
  await writeFile(path.join(directory, 'mkdir'), `#!/usr/bin/env bash
/bin/mkdir "$@"
`);
  await chmod(schedulerPath, 0o755);
  await chmod(backupPath, 0o755);
  await chmod(path.join(directory, 'date'), 0o755);
  await chmod(path.join(directory, 'mkdir'), 0o755);
  spawnSync('/bin/mkdir', ['-p', binDirectory, backupRoot]);
  spawnSync('/bin/mv', [
    path.join(directory, 'date'),
    path.join(binDirectory, 'date')
  ]);
  spawnSync('/bin/mv', [
    path.join(directory, 'mkdir'),
    path.join(binDirectory, 'mkdir')
  ]);
  if (marker) {
    await writeFile(
      path.join(backupRoot, '.last-daily-backup-slot'),
      `${marker}\n`
    );
  }

  const result = spawnSync('/bin/bash', [schedulerPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      BACKUP_ROOT: backupRoot,
      BACKUP_SCHEDULER_RUN_ONCE: '1',
      BACKUP_SCHEDULE_MORNING: '06:30',
      BACKUP_SCHEDULE_EVENING: '18:30',
      BACKUP_TEST_LOG: logPath,
      FAKE_DATE: date,
      FAKE_TIME: time
    }
  });

  return {
    result,
    backupLog: await readFile(logPath, 'utf8').catch(() => ''),
    marker: await readFile(
      path.join(backupRoot, '.last-daily-backup-slot'),
      'utf8'
    ).catch(() => '')
  };
}

test('scheduler declares two Beijing-time daily backup slots', async () => {
  const source = await readFile(schedulerUrl, 'utf8');

  assert.match(source, /\.last-daily-backup-slot/);
  assert.match(source, /BACKUP_SCHEDULE_MORNING/);
  assert.match(source, /BACKUP_SCHEDULE_EVENING/);
  assert.match(source, /BACKUP_KIND=daily/);
  assert.match(source, /backup\.sh/);
});

test('scheduler runs morning and evening slots once without replaying old days', async () => {
  const beforeMorning = await runScheduler({
    date: '2026-06-15',
    time: '06:29'
  });
  assert.equal(beforeMorning.result.status, 0, beforeMorning.result.stderr);
  assert.equal(beforeMorning.backupLog, '');

  const morning = await runScheduler({
    date: '2026-06-15',
    time: '06:30'
  });
  assert.equal(morning.result.status, 0, morning.result.stderr);
  assert.match(morning.backupLog, /^daily\|/);
  assert.equal(morning.marker, '2026-06-15|morning\n');

  const afterMorningRestart = await runScheduler({
    date: '2026-06-15',
    time: '12:00',
    marker: '2026-06-15|morning'
  });
  assert.equal(
    afterMorningRestart.result.status,
    0,
    afterMorningRestart.result.stderr
  );
  assert.equal(afterMorningRestart.backupLog, '');

  const evening = await runScheduler({
    date: '2026-06-15',
    time: '18:30',
    marker: '2026-06-15|morning'
  });
  assert.equal(evening.result.status, 0, evening.result.stderr);
  assert.match(evening.backupLog, /^daily\|/);
  assert.equal(evening.marker, '2026-06-15|evening\n');

  const afterEveningRestart = await runScheduler({
    date: '2026-06-15',
    time: '23:00',
    marker: '2026-06-15|evening'
  });
  assert.equal(
    afterEveningRestart.result.status,
    0,
    afterEveningRestart.result.stderr
  );
  assert.equal(afterEveningRestart.backupLog, '');

  const nextDay = await runScheduler({
    date: '2026-06-16',
    time: '07:00',
    marker: '2026-06-15|evening'
  });
  assert.equal(nextDay.result.status, 0, nextDay.result.stderr);
  assert.match(nextDay.backupLog, /^daily\|/);
  assert.equal(nextDay.marker, '2026-06-16|morning\n');
});

test('scheduler is valid Bash syntax', () => {
  const result = spawnSync('/bin/bash', ['-n', schedulerUrl.pathname], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

test('scheduler container is bounded and has no Docker socket', async () => {
  const compose = parse(
    await readFile(new URL('docker-compose.yml', root), 'utf8')
  );
  const service = compose.services['backup-scheduler'];

  assert.equal(service.mem_limit, '512m');
  assert.equal(service.restart, 'unless-stopped');
  assert.match(service.user, /NAS_UID/);
  assert.equal(
    service.volumes.some(volume => String(volume).includes('docker.sock')),
    false
  );
});

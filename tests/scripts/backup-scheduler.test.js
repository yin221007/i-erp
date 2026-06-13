import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const schedulerUrl = new URL('scripts/backup-scheduler.sh', root);

test('scheduler records one successful daily backup per local date', async () => {
  const source = await readFile(schedulerUrl, 'utf8');

  assert.match(source, /\.last-daily-backup/);
  assert.match(source, /BACKUP_SCHEDULE_HOUR/);
  assert.match(source, /BACKUP_SCHEDULE_MINUTE/);
  assert.match(source, /BACKUP_KIND=daily/);
  assert.match(source, /backup\.sh/);
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

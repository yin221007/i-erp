import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

test('deployment database checks use the backup image client', async () => {
  const source = await readFile(
    new URL('scripts/deploy-lib.sh', root),
    'utf8'
  );

  assert.match(source, /docker run --rm -i[\s\S]*--entrypoint mariadb/);
  assert.match(source, /IERP_BACKUP_IMAGE/);
  assert.match(source, /db_client/);
});

test('rollback uses shared containerized database commands', async () => {
  const source = await readFile(
    new URL('scripts/rollback.sh', root),
    'utf8'
  );

  assert.match(source, /db_dump/);
  assert.match(source, /db_client/);
  assert.doesNotMatch(source, /^\s*mariadb(?:-dump)?\s+\\/m);
});

test('deployment scripts do not require host MariaDB binaries', async () => {
  for (const name of [
    'scripts/deploy-blue-green.sh',
    'scripts/rollback.sh'
  ]) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /require_command[^\n]*mariadb/);
  }
});

test('database passwords are never placed in MariaDB command arguments', async () => {
  const sources = await Promise.all([
    readFile(new URL('../../scripts/deploy-lib.sh', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/backup.sh', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/restore-drill.sh', import.meta.url), 'utf8')
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /--password/);
    assert.match(source, /MYSQL_PWD/);
  }
});

test('deployment scripts do not require host Node.js', async () => {
  for (const name of [
    'scripts/deploy-blue-green.sh',
    'scripts/rollback.sh'
  ]) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /require_command[^\n]*\bnode\b/);
  }
});

test('upload metadata is read with Node.js from the backup image', async () => {
  const source = await readFile(
    new URL('scripts/deploy-lib.sh', root),
    'utf8'
  );

  assert.match(source, /--entrypoint node/);
  assert.match(source, /\/snapshot\/metadata\.json/);
  assert.doesNotMatch(source, /^\s*node -e/m);
});

test('deployment builds the versioned backup image before database checks', async () => {
  const source = await readFile(
    new URL('scripts/deploy-blue-green.sh', root),
    'utf8'
  );

  assert.match(source, /--profile backup build backup/);
});

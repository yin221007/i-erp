import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../server/config.js';

const validEnvironment = {
  NODE_ENV: 'test',
  DB_HOST: 'db',
  DB_USER: 'ierp',
  DB_PASSWORD: 'secret',
  DB_NAME: 'ierp',
  SESSION_SECRET: 'a'.repeat(32),
  PUBLIC_ORIGINS: 'https://erp.example.test',
  BACKUP_ROOT: '/app/backups',
  MAINTENANCE_QUEUE_ROOT: '/app/maintenance-queue',
  MAINTENANCE_JOB_SECRET: 'b'.repeat(32)
};

test('configuration rejects a missing database password', () => {
  const { DB_PASSWORD: _removed, ...environment } = validEnvironment;

  assert.throws(() => loadConfig(environment), /DB_PASSWORD/);
});

test('configuration uses only the supplied database password', () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.db.password, 'secret');
  assert.equal(config.secretEncryptionKey, validEnvironment.SESSION_SECRET);
});

test('session secret must contain at least 32 characters', () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, SESSION_SECRET: 'too-short' }),
    /SESSION_SECRET/
  );
});

test('public origins are normalized into an allowlist', () => {
  const config = loadConfig({
    ...validEnvironment,
    PUBLIC_ORIGINS: 'https://erp.example.test, https://erp-backup.example.test/'
  });

  assert.deepEqual(config.publicOrigins, [
    'https://erp.example.test',
    'https://erp-backup.example.test'
  ]);
});

test('maintenance paths and signing secret are required', () => {
  for (const name of [
    'BACKUP_ROOT',
    'MAINTENANCE_QUEUE_ROOT',
    'MAINTENANCE_JOB_SECRET'
  ]) {
    const environment = { ...validEnvironment };
    delete environment[name];
    assert.throws(() => loadConfig(environment), new RegExp(name));
  }
});

test('maintenance signing secret must contain at least 32 characters', () => {
  assert.throws(
    () =>
      loadConfig({
        ...validEnvironment,
        MAINTENANCE_JOB_SECRET: 'too-short'
      }),
    /MAINTENANCE_JOB_SECRET/
  );
});

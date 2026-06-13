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
  PUBLIC_ORIGINS: 'https://erp.example.test'
};

test('configuration rejects a missing database password', () => {
  const { DB_PASSWORD: _removed, ...environment } = validEnvironment;

  assert.throws(() => loadConfig(environment), /DB_PASSWORD/);
});

test('configuration uses only the supplied database password', () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.db.password, 'secret');
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

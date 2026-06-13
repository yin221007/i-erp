import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { MIGRATION_VERSIONS } from '../../server/migrations.js';

class HealthPool {
  constructor({ migrations = MIGRATION_VERSIONS, databaseError = null } = {}) {
    this.migrations = migrations;
    this.databaseError = databaseError;
  }

  async query(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT 1 AS ok') {
      if (this.databaseError) throw this.databaseError;
      return [[{ ok: 1 }], []];
    }
    if (normalized.startsWith('SELECT version FROM schema_migrations')) {
      return [this.migrations.map(version => ({ version })), []];
    }
    throw new Error(`Unexpected health SQL: ${normalized}`);
  }
}

const config = {
  trustProxy: 1,
  publicOrigins: ['https://erp.example.test']
};

test('readiness succeeds only when the database and migrations are ready', async () => {
  const readyApp = createApp({ pool: new HealthPool(), config });
  await request(readyApp)
    .get('/health/ready')
    .expect(200)
    .expect({ status: 'ready' });

  const pendingApp = createApp({
    pool: new HealthPool({ migrations: MIGRATION_VERSIONS.slice(0, -1) }),
    config
  });
  const pending = await request(pendingApp).get('/health/ready').expect(503);
  assert.deepEqual(pending.body.pendingMigrations, [MIGRATION_VERSIONS.at(-1)]);

  const failedApp = createApp({
    pool: new HealthPool({ databaseError: new Error('offline') }),
    config
  });
  await request(failedApp)
    .get('/health/ready')
    .expect(503)
    .expect({ status: 'not_ready' });
});

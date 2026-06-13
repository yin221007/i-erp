import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations } from '../../server/migrations.js';
import {
  hashPassword,
  verifyPassword
} from '../../server/auth/passwords.js';

class FakeMigrationDatabase {
  constructor({ users = [], production = [] } = {}) {
    this.users = new Map(users.map(record => [record.id, structuredClone(record)]));
    this.production = new Map(
      production.map(record => [record.rowId, structuredClone(record.data)])
    );
    this.aiModels = new Map();
    this.migrations = new Set();
    this.snapshot = null;
  }

  async getConnection() {
    return this;
  }

  async beginTransaction() {
    this.snapshot = {
      users: structuredClone(this.users),
      production: structuredClone(this.production),
      aiModels: structuredClone(this.aiModels),
      migrations: structuredClone(this.migrations)
    };
  }

  async commit() {
    this.snapshot = null;
  }

  async rollback() {
    if (!this.snapshot) return;
    this.users = this.snapshot.users;
    this.production = this.snapshot.production;
    this.aiModels = this.snapshot.aiModels;
    this.migrations = this.snapshot.migrations;
    this.snapshot = null;
  }

  release() {}

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('CREATE TABLE IF NOT EXISTS')) return [[], []];

    if (normalized.startsWith('SELECT version FROM schema_migrations')) {
      return [[...this.migrations].map(version => ({ version })), []];
    }

    if (normalized.startsWith('SELECT id, json_data FROM users')) {
      return [[...this.users].map(([id, data]) => ({
        id,
        json_data: JSON.stringify(data)
      })), []];
    }

    if (normalized.startsWith('UPDATE users SET json_data')) {
      const [json, id] = parameters;
      this.users.set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('SELECT id, json_data FROM production')) {
      return [[...this.production].map(([id, data]) => ({
        id,
        json_data: JSON.stringify(data)
      })), []];
    }

    if (normalized.startsWith('UPDATE production SET json_data')) {
      const [json, id] = parameters;
      this.production.set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('INSERT INTO schema_migrations')) {
      this.migrations.add(parameters[0]);
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('INSERT IGNORE INTO ai_models')) {
      const [
        id,
        provider,
        modelId,
        displayName,
        enabled,
        reasoning,
        contextLimit,
        maxOutputTokens,
        sortOrder
      ] = parameters;
      if (!this.aiModels.has(id)) {
        this.aiModels.set(id, {
          id,
          provider,
          modelId,
          displayName,
          enabled,
          reasoning,
          contextLimit,
          maxOutputTokens,
          sortOrder
        });
      }
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Unexpected SQL in fake database: ${normalized}`);
  }
}

test('password migration preserves the accepted password and runs once', async () => {
  const database = new FakeMigrationDatabase({
    users: [{
      id: 'u-1',
      username: 'admin',
      nickname: 'admin',
      password: 'password',
      isDefaultAdmin: true
    }]
  });
  let hashCalls = 0;
  const countedHasher = async password => {
    hashCalls += 1;
    return hashPassword(password);
  };

  await runMigrations(database, { passwordHasher: countedHasher });
  const firstHash = database.users.get('u-1').password;
  await runMigrations(database, { passwordHasher: countedHasher });

  assert.match(firstHash, /^scrypt\$v1\$/);
  assert.equal(await verifyPassword('password', firstHash), true);
  assert.equal(database.users.get('u-1').password, firstHash);
  assert.equal(hashCalls, 1);
  assert.equal(database.migrations.has('002_hash_user_passwords'), true);
});

test('production migration assigns projectId as the stable JSON id', async () => {
  const database = new FakeMigrationDatabase({
    production: [{
      rowId: 'legacy-row',
      data: { projectId: 'project-7', projectName: 'Project Seven' }
    }]
  });

  await runMigrations(database);

  assert.equal(database.production.get('legacy-row').id, 'project-7');
  assert.equal(database.migrations.has('003_normalize_production_ids'), true);
});

test('duplicate production project IDs roll back and remain unmarked', async () => {
  const database = new FakeMigrationDatabase({
    production: [
      { rowId: 'row-1', data: { projectId: 'duplicate' } },
      { rowId: 'row-2', data: { projectId: 'duplicate' } }
    ]
  });

  await assert.rejects(() => runMigrations(database), /duplicate/i);

  assert.equal(database.production.get('row-1').id, undefined);
  assert.equal(database.production.get('row-2').id, undefined);
  assert.equal(database.migrations.has('003_normalize_production_ids'), false);
});

test('AI model migration seeds current official models idempotently', async () => {
  const database = new FakeMigrationDatabase();

  await runMigrations(database);
  await runMigrations(database);

  assert.deepEqual([...database.aiModels.keys()], [
    'deepseek-v4-flash',
    'deepseek-v4-pro'
  ]);
  assert.equal(database.migrations.has('004_create_ai_tables'), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATION_VERSIONS,
  runMigrations
} from '../../server/migrations.js';
import {
  hashPassword,
  verifyPassword
} from '../../server/auth/passwords.js';

class FakeMigrationDatabase {
  constructor({
    users = [],
    production = [],
    aiModels = [],
    clients = [],
    equipment = [],
    docs = [],
    projects = [],
    archives = [],
    approvals = [],
    recycleBin = []
  } = {}) {
    this.users = new Map(users.map(record => [record.id, structuredClone(record)]));
    this.production = new Map(
      production.map(record => [record.rowId, structuredClone(record.data)])
    );
    this.aiModels = new Map(
      aiModels.map(model => [model.id, structuredClone(model)])
    );
    this.clients = new Map(clients.map(record => [record.id, structuredClone(record)]));
    this.equipment = new Map(equipment.map(record => [record.id, structuredClone(record)]));
    this.docs = new Map(docs.map(record => [record.id, structuredClone(record)]));
    this.projects = new Map(projects.map(record => [record.id, structuredClone(record)]));
    this.archives = new Map(archives.map(record => [record.id, structuredClone(record)]));
    this.approvals = new Map(approvals.map(record => [record.id, structuredClone(record)]));
    this.recycleBin = new Map(recycleBin.map(record => [record.id, structuredClone(record)]));
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
      clients: structuredClone(this.clients),
      equipment: structuredClone(this.equipment),
      docs: structuredClone(this.docs),
      projects: structuredClone(this.projects),
      archives: structuredClone(this.archives),
      approvals: structuredClone(this.approvals),
      recycleBin: structuredClone(this.recycleBin),
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
    this.clients = this.snapshot.clients;
    this.equipment = this.snapshot.equipment;
    this.docs = this.snapshot.docs;
    this.projects = this.snapshot.projects;
    this.archives = this.snapshot.archives;
    this.approvals = this.snapshot.approvals;
    this.recycleBin = this.snapshot.recycleBin;
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


    for (const table of ['clients', 'equipment', 'docs']) {
      if (normalized.startsWith(`SELECT id, json_data FROM \`${table}\``)) {
        return [[...this[table]].map(([id, data]) => ({
          id,
          json_data: JSON.stringify(data)
        })), []];
      }

      if (normalized.startsWith(`UPDATE \`${table}\` SET json_data`)) {
        const [json, id] = parameters;
        this[table].set(id, JSON.parse(json));
        return [{ affectedRows: 1 }, []];
      }
    }

    for (const table of ['projects', 'archives']) {
      if (normalized.startsWith(`SELECT id, json_data FROM ${table}`)) {
        return [[...this[table]].map(([id, data]) => ({
          id,
          json_data: JSON.stringify(data)
        })), []];
      }
    }

    if (normalized.startsWith('INSERT INTO archives')) {
      const [id, json] = parameters;
      this.archives.set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('SELECT id, json_data FROM recycle_bin')) {
      return [[...this.recycleBin].map(([id, data]) => ({
        id,
        json_data: JSON.stringify(data)
      })), []];
    }

    if (normalized === 'SELECT id FROM approvals WHERE id = ? FOR UPDATE') {
      return [this.approvals.has(parameters[0])
        ? [{ id: parameters[0] }]
        : [], []];
    }

    if (normalized.startsWith('INSERT INTO approvals')) {
      const [id, json] = parameters;
      this.approvals.set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized === 'DELETE FROM recycle_bin WHERE id = ?') {
      const deleted = this.recycleBin.delete(parameters[0]);
      return [{ affectedRows: deleted ? 1 : 0 }, []];
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

    if (normalized.startsWith('UPDATE production SET id = ?, json_data')) {
      const [nextId, json, previousId] = parameters;
      const previous = this.production.get(previousId);
      if (!previous) return [{ affectedRows: 0 }, []];
      this.production.delete(previousId);
      this.production.set(nextId, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('UPDATE production SET id = ? WHERE id = ?')) {
      const [nextId, previousId] = parameters;
      const previous = this.production.get(previousId);
      if (!previous) return [{ affectedRows: 0 }, []];
      this.production.delete(previousId);
      this.production.set(nextId, previous);
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

test('production migrations align both JSON and database IDs with projectId', async () => {
  const database = new FakeMigrationDatabase({
    production: [{
      rowId: 'legacy-row',
      data: { projectId: 'project-7', projectName: 'Project Seven' }
    }]
  });

  await runMigrations(database);

  assert.equal(database.production.has('legacy-row'), false);
  assert.equal(database.production.get('project-7').id, 'project-7');
  assert.equal(database.migrations.has('003_normalize_production_ids'), true);
  assert.equal(database.migrations.has('011_align_production_primary_keys'), true);
});

test('production primary key migration safely handles crossed legacy IDs', async () => {
  const database = new FakeMigrationDatabase({
    production: [
      {
        rowId: 'project-b',
        data: { projectId: 'project-a', projectName: 'Project A' }
      },
      {
        rowId: 'legacy-b',
        data: { projectId: 'project-b', projectName: 'Project B' }
      }
    ]
  });

  await runMigrations(database);

  assert.deepEqual([...database.production.keys()].sort(), ['project-a', 'project-b']);
  assert.equal(database.production.get('project-a').id, 'project-a');
  assert.equal(database.production.get('project-b').id, 'project-b');
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
    'deepseek-v4-pro',
    'minimax-m3'
  ]);
  assert.deepEqual(database.aiModels.get('minimax-m3'), {
    id: 'minimax-m3',
    provider: 'minimax',
    modelId: 'MiniMax-M3',
    displayName: 'MiniMax M3',
    enabled: 1,
    reasoning: 1,
    contextLimit: 1_000_000,
    maxOutputTokens: 128_000,
    sortOrder: 30
  });
  assert.equal(database.migrations.has('004_create_ai_tables'), true);
  assert.equal(database.migrations.has('007_seed_minimax_model'), true);
});

test('AI model migration does not overwrite an existing MiniMax model', async () => {
  const existingModel = {
    id: 'minimax-m3',
    provider: 'minimax',
    modelId: 'MiniMax-M3',
    displayName: 'MiniMax M3 Custom',
    enabled: 0,
    reasoning: 1,
    contextLimit: 1_000_000,
    maxOutputTokens: 64_000,
    sortOrder: 99
  };
  const database = new FakeMigrationDatabase({
    aiModels: [existingModel]
  });

  await runMigrations(database);

  assert.deepEqual(database.aiModels.get('minimax-m3'), existingModel);
});

test('system secret storage is added through an idempotent additive migration', async () => {
  const database = new FakeMigrationDatabase();

  await runMigrations(database);
  await runMigrations(database);

  assert.equal(database.migrations.has('005_create_system_secrets'), true);
});

test('maintenance audit storage is added through an idempotent additive migration', async () => {
  const database = new FakeMigrationDatabase();

  await runMigrations(database);
  await runMigrations(database);

  assert.equal(database.migrations.has('006_create_maintenance_jobs'), true);
});

test('user permission migration keeps legacy accounts writable explicitly', async () => {
  const database = new FakeMigrationDatabase({
    users: [
      { id: 'u-1', username: 'legacy', nickname: 'legacy', password: 'scrypt$v1$hash', role: 'User' },
      { id: 'u-2', username: 'readonly', nickname: 'readonly', password: 'scrypt$v1$hash', role: 'User', permission: 'Read' }
    ]
  });

  await runMigrations(database);

  assert.equal(database.users.get('u-1').permission, 'ReadWrite');
  assert.equal(database.users.get('u-2').permission, 'Read');
  assert.equal(database.migrations.has('008_backfill_user_permissions'), true);
});

test('owner-scoped resource migration assigns legacy shared records to the default administrator', async () => {
  const admin = { id: 'u-admin', username: 'admin', nickname: '管理员', password: 'scrypt$v1$hash', role: 'Admin', isDefaultAdmin: true };
  const database = new FakeMigrationDatabase({
    users: [admin],
    clients: [{ id: 'c-1', companyName: '旧客户' }],
    equipment: [{ id: 'e-1', name: '旧设备' }],
    docs: [{ id: 'd-1', title: '旧文档' }]
  });

  await runMigrations(database, { passwordHasher: async value => value });

  assert.equal(database.clients.get('c-1').creatorId, 'u-admin');
  assert.equal(database.equipment.get('e-1').creatorName, '管理员');
  assert.equal(database.docs.get('d-1').creatorId, 'u-admin');
  assert.equal(database.migrations.has('009_backfill_owner_scoped_resources'), true);
});

test('project attachment migration creates missing archives once and preserves existing links', async () => {
  const attachment = {
    id: 'invoice-legacy',
    name: '历史发票.pdf',
    url: '/api/uploads/history.pdf',
    type: 'application/pdf',
    size: '128 KB',
    uploadDate: '2026-01-01T00:00:00.000Z',
    category: 'Invoice'
  };
  const existingAttachment = {
    id: 'drawing-existing',
    name: '已有图纸.pdf',
    url: '/api/uploads/existing.pdf',
    type: 'application/pdf',
    size: '256 KB',
    uploadDate: '2026-01-02T00:00:00.000Z',
    category: 'Drawing'
  };
  const database = new FakeMigrationDatabase({
    projects: [{
      id: 'project-1',
      name: '迁移测试工程',
      manager: '项目经理',
      nodes: [{
        id: 'node-1',
        attachments: [attachment, existingAttachment]
      }]
    }],
    archives: [{
      id: existingAttachment.id,
      title: '已有图纸',
      projectId: 'project-1',
      url: existingAttachment.url
    }]
  });

  await runMigrations(database);
  await runMigrations(database);

  assert.equal(database.archives.size, 2);
  assert.deepEqual(database.archives.get(attachment.id), {
    id: attachment.id,
    title: '历史发票',
    category: 'Invoice',
    projectName: '迁移测试工程',
    projectId: 'project-1',
    fileType: 'PDF',
    size: '128 KB',
    uploadDate: '2026-01-01T00:00:00.000Z',
    uploader: '项目经理',
    url: '/api/uploads/history.pdf',
    createdAt: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(
    database.migrations.has('010_backfill_project_attachment_archives'),
    true
  );
});

test('approved deletion approvals accidentally recycled are restored for idempotent execution', async () => {
  const approval = {
    id: 'approval-history-1',
    title: '删除历史档案',
    type: 'Deletion',
    applicantId: 'u-applicant',
    applicantName: '申请人',
    department: '工程部',
    strategy: 'OR_SIGN',
    approverIds: ['u-admin'],
    approverNamesDisplay: '管理员',
    status: 'Approved',
    currentContent: '申请删除档案',
    currentAttachments: [],
    versions: [{
      version: 1,
      content: '申请删除档案',
      attachments: [],
      submittedAt: '2026-07-28T22:00:00.000Z',
      outcomes: [{
        status: 'Approved',
        approverId: 'u-admin',
        approverName: '管理员',
        comment: '同意',
        date: '2026-07-28T23:00:00.000Z'
      }]
    }],
    createdAt: '2026-07-28T22:00:00.000Z',
    updatedAt: '2026-07-28T23:00:00.000Z',
    relatedId: 'archive-1',
    relatedType: 'archives'
  };
  const database = new FakeMigrationDatabase({
    recycleBin: [{
      id: 'recycle-approval-1',
      originalId: approval.id,
      resourceType: 'approvals',
      deletedAt: '2026-07-28T23:23:29.996Z',
      data: approval
    }]
  });

  await runMigrations(database);
  await runMigrations(database);

  assert.equal(database.recycleBin.has('recycle-approval-1'), false);
  assert.deepEqual(database.approvals.get(approval.id), approval);
  assert.equal(
    database.migrations.has('012_restore_auto_deleted_approval_history'),
    true
  );
});

test('recent additive migrations keep their required order', () => {
  assert.equal(MIGRATION_VERSIONS.at(-4), '009_backfill_owner_scoped_resources');
  assert.equal(MIGRATION_VERSIONS.at(-3), '010_backfill_project_attachment_archives');
  assert.equal(MIGRATION_VERSIONS.at(-2), '011_align_production_primary_keys');
  assert.equal(MIGRATION_VERSIONS.at(-1), '012_restore_auto_deleted_approval_history');
});

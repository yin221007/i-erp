import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { hashPassword } from '../../server/auth/passwords.js';

class FakeResourcePool {
  constructor(users, resources) {
    this.users = new Map(users.map(user => [user.id, structuredClone(user)]));
    this.resources = new Map(
      Object.entries(resources).map(([name, records]) => [
        name,
        new Map(records.map(record => [record.id, structuredClone(record)]))
      ])
    );
    this.sessions = new Map();
    this.projectSequences = new Map();
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM users') && normalized.includes('JSON_EXTRACT')) {
      const user = [...this.users.values()].find(
        item => item.nickname.toLowerCase() === parameters[0]
      );
      return [user ? [{ id: user.id, json_data: JSON.stringify(user) }] : [], []];
    }

    if (normalized.startsWith('INSERT INTO auth_sessions')) {
      const [id, tokenHash, userId, , , , , expiresAt, absoluteExpiresAt] =
        parameters;
      this.sessions.set(id, {
        id,
        tokenHash,
        userId,
        expiresAt,
        absoluteExpiresAt,
        revokedAt: null
      });
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.includes('FROM auth_sessions AS sessions')) {
      const [tokenHash, now] = parameters;
      const session = [...this.sessions.values()].find(
        item =>
          item.tokenHash === tokenHash &&
          !item.revokedAt &&
          item.expiresAt > now &&
          item.absoluteExpiresAt > now
      );
      if (!session) return [[], []];
      return [[{
        session_id: session.id,
        expires_at: session.expiresAt,
        absolute_expires_at: session.absoluteExpiresAt,
        json_data: JSON.stringify(this.users.get(session.userId))
      }], []];
    }

    if (normalized.startsWith('UPDATE auth_sessions SET last_seen_at')) {
      return [{ affectedRows: 1 }, []];
    }

    if (normalized === 'SELECT json_data FROM users WHERE id = ? LIMIT 1') {
      const user = this.users.get(parameters[0]);
      return [user ? [{ json_data: JSON.stringify(user) }] : [], []];
    }

    if (normalized === 'SELECT json_data FROM users') {
      return [[...this.users.values()].map(user => ({
        json_data: JSON.stringify(user)
      })), []];
    }

    if (normalized.startsWith('INSERT IGNORE INTO project_contract_sequences')) {
      const [year] = parameters;
      if (!this.projectSequences.has(year)) this.projectSequences.set(year, 0);
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('SELECT last_number FROM project_contract_sequences')) {
      const [year] = parameters;
      return [[{ last_number: this.projectSequences.get(year) }], []];
    }

    if (normalized === 'SELECT id, json_data FROM projects ORDER BY id FOR UPDATE') {
      const projects = this.resources.get('projects') || new Map();
      return [[...projects].map(([id, data]) => ({
        id,
        json_data: JSON.stringify(data)
      })), []];
    }

    if (normalized.startsWith('UPDATE project_contract_sequences SET last_number')) {
      const [lastNumber, year] = parameters;
      this.projectSequences.set(year, lastNumber);
      return [{ affectedRows: 1 }, []];
    }

    const recordByIdMatch = normalized.match(
      /^SELECT json_data FROM `([a-z_]+)` WHERE id = \? LIMIT 1$/
    );
    if (recordByIdMatch) {
      const table = recordByIdMatch[1];
      const records = table === 'users'
        ? this.users
        : this.resources.get(table) || new Map();
      const record = records.get(parameters[0]);
      return [record ? [{ json_data: JSON.stringify(record) }] : [], []];
    }

    const replaceMatch = normalized.match(
      /^(?:INSERT|REPLACE) INTO `([a-z_]+)` \(id, json_data, updated_at\) VALUES \(\?, \?, CURRENT_TIMESTAMP\)$/
    );
    if (replaceMatch) {
      const [id, jsonData] = parameters;
      const record = JSON.parse(jsonData);
      const table = replaceMatch[1];
      const records = table === 'users'
        ? this.users
        : this.resources.get(table) || new Map();
      records.set(id, record);
      if (table !== 'users') this.resources.set(table, records);
      return [{ affectedRows: 1 }, []];
    }

    const tableMatch = normalized.match(
      /^SELECT json_data FROM `([a-z_]+)`(?: ORDER BY created_at ASC)?$/
    );
    if (tableMatch) {
      const table = tableMatch[1];
      const records = table === 'users'
        ? this.users
        : this.resources.get(table) || new Map();
      return [[...records.values()].map(json_data => ({
        json_data: JSON.stringify(json_data)
      })), []];
    }

    throw new Error(`Unexpected SQL in fake resource pool: ${normalized}`);
  }

  async getConnection() {
    return {
      query: this.query.bind(this),
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined
    };
  }
}

const config = {
  trustProxy: 1,
  publicOrigins: ['https://erp.example.test']
};

async function createResourceTestApp() {
  const users = [
    {
      id: 'u-1',
      nickname: 'admin',
      password: await hashPassword('admin-password'),
      department: '总经办',
      role: 'Admin',
      isDefaultAdmin: true,
      avatar: ''
    },
    {
      id: 'u-2',
      nickname: 'alice',
      password: await hashPassword('alice-password'),
      department: '工程部',
      role: 'User',
      permission: 'ReadWrite',
      avatar: '',
      preferences: {
        sound: true,
        webhooks: { pushPlusToken: 'private-token' }
      }
    },
    {
      id: 'u-3',
      nickname: 'sales-manager',
      password: await hashPassword('sales-manager-password'),
      department: '销售部',
      role: 'Manager',
      permission: 'ReadWrite',
      avatar: ''
    }
  ];
  const pool = new FakeResourcePool(users, {
    projects: [
      {
        id: 'p-1',
        name: 'Project',
        manager: 'alice',
        nodes: [{ id: 'node-1', title: '设备定位', phase: '进场施工' }]
      },
      { id: 'p-sales', name: 'Sales Project', manager: 'sales-manager' },
      { id: 'p-hidden', name: 'Hidden', manager: 'admin' }
    ],
    payments: [{
      id: 'pay-hidden',
      projectId: 'p-hidden',
      projectName: 'Hidden',
      managerName: 'admin'
    }],
    ai_messages: [
      { id: 'a-1', userId: 'u-2', content: 'mine' },
      { id: 'a-2', userId: 'u-1', content: 'other' }
    ]
  });
  return { app: createApp({ pool, config }), pool };
}

async function login(app) {
  const response = await request(app)
    .post('/auth/login')
    .send({ username: 'alice', password: 'alice-password' })
    .expect(200);
  return response.headers['set-cookie'][0].split(';')[0];
}

async function loginAdmin(app) {
  const response = await request(app)
    .post('/auth/login')
    .send({ username: 'admin', password: 'admin-password' })
    .expect(200);
  return response.headers['set-cookie'][0].split(';')[0];
}

async function loginSalesManager(app) {
  const response = await request(app)
    .post('/auth/login')
    .send({
      username: 'sales-manager',
      password: 'sales-manager-password'
    })
    .expect(200);
  return response.headers['set-cookie'][0].split(';')[0];
}

test('resource reads require a server session', async () => {
  const { app } = await createResourceTestApp();

  await request(app).get('/projects').expect(401);
  await request(app).get('/users').set('x-user-id', 'u-1').expect(401);
});

test('user reads remove passwords and webhook credentials', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await login(app);
  const response = await request(app)
    .get('/users')
    .set('Cookie', cookie)
    .expect(200);

  assert.equal(response.body.length, 3);
  assert.equal(response.body.some(user => 'password' in user), false);
  assert.equal(
    response.body.some(user => user.preferences?.webhooks),
    false
  );
});

test('updating safe user fields preserves hidden credentials and preferences', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await loginAdmin(app);
  const originalPassword = pool.users.get('u-1').password;
  pool.users.set('u-1', {
    ...pool.users.get('u-1'),
    lastReadMap: { general: '2026-07-18T00:00:00.000Z' },
    preferences: {
      sound: true,
      webhooks: { pushPlusToken: 'private-token' }
    }
  });

  await request(app)
    .put('/users/u-1')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'u-1',
      nickname: 'admin',
      department: '总经办',
      role: 'Admin',
      isDefaultAdmin: true,
      avatar: ''
    })
    .expect(200);

  assert.equal(pool.users.get('u-1').password, originalPassword);
  assert.deepEqual(pool.users.get('u-1').lastReadMap, {
    general: '2026-07-18T00:00:00.000Z'
  });
  assert.deepEqual(pool.users.get('u-1').preferences, {
    sound: true,
    webhooks: { pushPlusToken: 'private-token' }
  });
});

test('user creation validates passwords and case-insensitive unique usernames', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await loginAdmin(app);

  await request(app)
    .post('/users')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'u-duplicate',
      nickname: 'ADMIN',
      password: 'new-password',
      department: '工程部',
      role: 'User',
      permission: 'ReadWrite',
      avatar: ''
    })
    .expect(409);

  await request(app)
    .post('/users')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'u-empty-password',
      nickname: 'new-user',
      password: '',
      department: '工程部',
      role: 'User',
      permission: 'ReadWrite',
      avatar: ''
    })
    .expect(400);
});

test('AI message reads return only the authenticated user records', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await login(app);
  const response = await request(app)
    .get('/ai_messages')
    .set('Cookie', cookie)
    .expect(200);

  assert.deepEqual(response.body.map(message => message.id), ['a-1']);
});

test('unknown resource identifiers are rejected before database access', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await login(app);

  await request(app)
    .get('/projects%3B%20DROP%20TABLE%20users')
    .set('Cookie', cookie)
    .expect(404);
});

test('create rejects an existing id instead of replacing a hidden record', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);

  await request(app)
    .post('/payments')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'pay-hidden',
      projectId: 'p-1',
      projectName: 'Project',
      managerName: 'alice'
    })
    .expect(409);

  assert.equal(pool.resources.get('payments').get('pay-hidden').projectId, 'p-hidden');
});

test('project creation assigns server UUID and a company annual contract code', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);
  const response = await request(app)
    .post('/projects')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'client-forged-id',
      code: 'PJ-CLIENT-FORGED',
      name: '服务器编号工程',
      clientName: '测试建设单位',
      manager: 'alice',
      internalContractNo: '',
      nodes: []
    })
    .expect(201);

  assert.match(
    response.body.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.match(response.body.code, /^\d{4}-\d{2}-001$/);
  assert.equal(response.body.internalContractNo, response.body.code);
  assert.notEqual(response.body.id, 'client-forged-id');
  assert.notEqual(response.body.code, 'PJ-CLIENT-FORGED');
  assert.deepEqual(
    pool.resources.get('projects').get(response.body.id),
    response.body
  );
});

test('manual project codes take priority and duplicate codes are rejected', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await login(app);
  const first = await request(app)
    .post('/projects')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      name: '人工编号工程',
      clientName: '测试建设单位',
      manager: 'alice',
      internalContractNo: ' IN-2026-088 ',
      nodes: []
    })
    .expect(201);
  assert.equal(first.body.code, 'IN-2026-088');
  assert.equal(first.body.internalContractNo, 'IN-2026-088');

  await request(app)
    .post('/projects')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      name: '重复人工编号工程',
      clientName: '测试建设单位',
      manager: 'alice',
      internalContractNo: 'in-2026-088',
      nodes: []
    })
    .expect(409);
});

test('project identity, code and creation time stay immutable after creation', async () => {
  const { app } = await createResourceTestApp();
  const cookie = await login(app);
  const created = await request(app)
    .post('/projects')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      name: '不可变编号工程',
      clientName: '测试建设单位',
      manager: 'alice',
      internalContractNo: '',
      nodes: []
    })
    .expect(201);

  const updated = await request(app)
    .put(`/projects/${created.body.id}`)
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      ...created.body,
      id: 'forged-project-id',
      code: 'FORGED-CODE',
      internalContractNo: 'FORGED-CODE',
      createdAt: '1999-01-01T00:00:00.000Z',
      name: '允许更新的工程名称'
    })
    .expect(200);

  assert.equal(updated.body.id, created.body.id);
  assert.equal(updated.body.code, created.body.code);
  assert.equal(updated.body.internalContractNo, created.body.internalContractNo);
  assert.equal(updated.body.createdAt, created.body.createdAt);
  assert.equal(updated.body.name, '允许更新的工程名称');
});

test('approval creation always persists an initial auditable version', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);
  const createdAt = '2026-07-29T00:00:00.000Z';
  const response = await request(app)
    .post('/approvals')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'approval-1',
      title: '删除申请',
      type: 'Deletion',
      strategy: 'OR_SIGN',
      approverIds: ['u-1'],
      approverNamesDisplay: 'admin',
      status: 'Pending',
      currentContent: '申请删除档案',
      currentAttachments: [],
      versions: [],
      createdAt,
      updatedAt: createdAt,
      relatedId: 'archive-1',
      relatedType: 'archives'
    })
    .expect(201);

  assert.deepEqual(response.body.versions, [{
    version: 1,
    content: '申请删除档案',
    attachments: [],
    submittedAt: createdAt,
    outcomes: []
  }]);
  assert.deepEqual(
    pool.resources.get('approvals').get('approval-1').versions,
    response.body.versions
  );
});

test('sales project manager can create and update production data only for the assigned project', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await loginSalesManager(app);

  await request(app)
    .post('/production')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'p-sales',
      projectId: 'p-sales',
      projectName: 'Sales Project',
      items: [{ id: 'item-1', name: '工作台', quantity: 1, status: 'Waiting' }]
    })
    .expect(201);

  assert.equal(pool.resources.get('production').get('p-sales').items.length, 1);

  await request(app)
    .put('/production/p-sales')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'p-sales',
      projectId: 'p-sales',
      projectName: 'Sales Project',
      items: [
        { id: 'item-1', name: '工作台', quantity: 1, status: 'InStock' },
        { id: 'item-2', name: '烟罩', quantity: 2, status: 'Waiting' }
      ]
    })
    .expect(200);

  assert.equal(pool.resources.get('production').get('p-sales').items.length, 2);
  assert.equal(
    pool.resources.get('production').get('p-sales').items[0].status,
    'InStock'
  );

  await request(app)
    .put('/production/p-sales')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'p-sales',
      projectId: 'p-hidden',
      projectName: 'Hidden',
      items: []
    })
    .expect(403);

  assert.equal(
    pool.resources.get('production').get('p-sales').projectId,
    'p-sales'
  );

  await request(app)
    .post('/production')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'p-hidden',
      projectId: 'p-hidden',
      projectName: 'Hidden',
      manager: 'sales-manager',
      items: []
    })
    .expect(403);

  assert.equal(pool.resources.get('production').has('p-hidden'), false);
});

test('update rejects retargeting a hidden record into a visible project', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);

  await request(app)
    .put('/payments/pay-hidden')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'pay-hidden',
      projectId: 'p-1',
      projectName: 'Project',
      managerName: 'alice'
    })
    .expect(403);

  assert.equal(pool.resources.get('payments').get('pay-hidden').projectId, 'p-hidden');
});

test('media archives require a valid project, phase, date, type and protected upload URL', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);
  const baseRecord = {
    id: 'media-1',
    title: '安装现场',
    category: 'Media',
    projectId: 'p-1',
    projectName: 'Forged project name',
    fileType: 'JPG',
    size: '1.0 MB',
    uploadDate: '2026-07-26T04:00:00.000Z',
    uploader: 'forged-user',
    url: '/api/uploads/12345678-1234-4123-8123-123456789abc.jpg',
    mediaPhase: '进场施工',
    capturedAt: '2026-07-26',
    mediaType: 'image',
    description: '灶台定位完成',
    mediaAlbumId: 'album-1',
    mediaAlbumTitle: '设备定位现场',
    workflowNodeId: 'node-1',
    workflowNodeTitle: 'Forged node title'
  };

  const response = await request(app)
    .post('/archives')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send(baseRecord)
    .expect(201);

  assert.equal(response.body.projectName, 'Project');
  assert.equal(response.body.uploader, 'alice');
  assert.equal(response.body.uploaderId, 'u-2');
  assert.equal(response.body.workflowNodeTitle, '设备定位');
  assert.equal(pool.resources.get('archives').get('media-1').uploader, 'alice');
  assert.equal(pool.resources.get('archives').get('media-1').uploaderId, 'u-2');

  for (const [suffix, patch] of [
    ['project', { projectId: 'missing' }],
    ['phase', { mediaPhase: '未知阶段' }],
    ['date', { capturedAt: '2026-02-30' }],
    ['type', { mediaType: 'audio' }],
    ['url', { url: 'https://evil.example/media.jpg' }],
    ['extension', { fileType: 'MP4' }],
    ['url-extension', {
      url: '/api/uploads/12345678-1234-4123-8123-123456789abc.png'
    }],
    ['folder-id', { mediaAlbumId: '../unsafe' }],
    ['folder-title', { mediaAlbumTitle: '' }],
    ['node', { workflowNodeId: 'missing-node' }]
  ]) {
    await request(app)
      .post('/archives')
      .set('Cookie', cookie)
      .set('Origin', 'https://erp.example.test')
      .send({ ...baseRecord, ...patch, id: `invalid-${suffix}` })
      .expect(400);
  }

  await request(app)
    .post('/archives')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      ...baseRecord,
      id: 'media-2',
      title: '设备定位第二张',
      url: '/api/uploads/22345678-1234-4123-8123-123456789abc.jpg'
    })
    .expect(201);

  await request(app)
    .post('/archives')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      ...baseRecord,
      id: 'folder-mismatch',
      title: '同文件夹第二张',
      mediaAlbumTitle: '伪造的另一个文件夹名称',
      url: '/api/uploads/22345678-1234-4123-8123-123456789abc.jpg'
    })
    .expect(400);
});

test('only the archive uploader or default administrator can rename a stored file', async () => {
  const { app, pool } = await createResourceTestApp();
  const original = {
    id: 'archive-rename',
    title: '原文件名',
    category: 'Invoice',
    projectId: 'p-sales',
    projectName: 'Sales Project',
    fileType: 'PDF',
    size: '12 KB',
    uploadDate: '2026-08-11T00:00:00.000Z',
    uploader: 'alice',
    url: '/api/uploads/1769674116177-400514667.pdf',
    createdAt: '2026-08-11T00:00:00.000Z'
  };
  pool.resources.set('archives', new Map([[original.id, original]]));

  const uploaderCookie = await login(app);
  const uploaderRename = await request(app)
    .patch('/archives/archive-rename/name')
    .set('Cookie', uploaderCookie)
    .set('Origin', 'https://erp.example.test')
    .send({ title: '  海牛厨房设备发票  ', url: '/api/uploads/forged.pdf' })
    .expect(200);
  assert.equal(uploaderRename.body.title, '海牛厨房设备发票');
  assert.equal(uploaderRename.body.url, original.url);
  assert.equal(uploaderRename.body.fileType, 'PDF');
  assert.equal(uploaderRename.body.uploaderId, 'u-2');

  const managerCookie = await loginSalesManager(app);
  await request(app)
    .patch('/archives/archive-rename/name')
    .set('Cookie', managerCookie)
    .set('Origin', 'https://erp.example.test')
    .send({ title: '无权修改' })
    .expect(403);

  const ordinaryAdmin = {
    id: 'u-ordinary-admin',
    nickname: 'ordinary-admin',
    password: await hashPassword('ordinary-admin-password'),
    department: '总经办',
    role: 'Admin',
    permission: 'ReadWrite',
    isDefaultAdmin: false,
    avatar: ''
  };
  pool.users.set(ordinaryAdmin.id, ordinaryAdmin);
  const ordinaryAdminLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'ordinary-admin', password: 'ordinary-admin-password' })
    .expect(200);
  const ordinaryAdminCookie = ordinaryAdminLogin.headers['set-cookie'][0].split(';')[0];
  await request(app)
    .patch('/archives/archive-rename/name')
    .set('Cookie', ordinaryAdminCookie)
    .set('Origin', 'https://erp.example.test')
    .send({ title: '普通管理员无权修改' })
    .expect(403);

  await request(app)
    .put('/archives/archive-rename')
    .set('Cookie', managerCookie)
    .set('Origin', 'https://erp.example.test')
    .send({ ...pool.resources.get('archives').get(original.id), title: '通用接口旁路' })
    .expect(403);

  const currentRecord = pool.resources.get('archives').get(original.id);
  await request(app)
    .put('/archives/archive-rename')
    .set('Cookie', uploaderCookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      ...currentRecord,
      url: '/api/uploads/1769674116177-400514667.xlsx',
      fileType: 'XLSX'
    })
    .expect(400);
  assert.equal(pool.resources.get('archives').get(original.id).url, original.url);
  assert.equal(pool.resources.get('archives').get(original.id).fileType, 'PDF');

  for (const title of ['', '   ', '错误/名称', '错误.', 'a'.repeat(201)]) {
    await request(app)
      .patch('/archives/archive-rename/name')
      .set('Cookie', uploaderCookie)
      .set('Origin', 'https://erp.example.test')
      .send({ title })
      .expect(400);
  }

  const adminCookie = await loginAdmin(app);
  const adminRename = await request(app)
    .patch('/archives/archive-rename/name')
    .set('Cookie', adminCookie)
    .set('Origin', 'https://erp.example.test')
    .send({ title: '超级管理员修订名称' })
    .expect(200);
  assert.equal(adminRename.body.title, '超级管理员修订名称');
  assert.equal(pool.resources.get('archives').get(original.id).url, original.url);
});

test('media archive updates preserve uploader and reject invalid metadata', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);
  pool.resources.set('archives', new Map([[
    'media-existing',
    {
      id: 'media-existing',
      title: '调试记录',
      category: 'Media',
      projectId: 'p-1',
      projectName: 'Project',
      fileType: 'MP4',
      size: '8.0 MB',
      uploadDate: '2026-07-26T04:00:00.000Z',
      uploader: 'alice',
      url: '/api/uploads/12345678-1234-4123-8123-123456789abc.mp4',
      mediaPhase: '安装调试',
      capturedAt: '2026-07-25',
      mediaType: 'video',
      description: '',
      mediaAlbumId: 'album-existing',
      mediaAlbumTitle: '调试记录',
      workflowNodeId: undefined
    }
  ]]));

  const existing = pool.resources.get('archives').get('media-existing');
  const updated = await request(app)
    .put('/archives/media-existing')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({ ...existing, uploader: 'forged-user', title: '设备联调' })
    .expect(200);

  assert.equal(updated.body.uploader, 'alice');
  assert.equal(updated.body.title, '设备联调');

  await request(app)
    .put('/archives/media-existing')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({ ...existing, capturedAt: 'not-a-date' })
    .expect(400);
});

test('media archives can be validated and saved in one batch request', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);
  const baseRecord = {
    title: '安装现场',
    category: 'Media',
    projectId: 'p-1',
    projectName: 'Forged project name',
    fileType: 'JPG',
    size: '1.0 MB',
    uploadDate: '2026-07-26T04:00:00.000Z',
    uploader: 'forged-user',
    mediaPhase: '进场施工',
    capturedAt: '2026-07-26',
    mediaType: 'image',
    description: '设备定位完成',
    mediaAlbumId: 'album-batch',
    mediaAlbumTitle: '设备定位现场',
    workflowNodeId: 'node-1'
  };

  const response = await request(app)
    .post('/archives/batch')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send([
      {
        ...baseRecord,
        id: 'media-batch-1',
        url: '/api/uploads/12345678-1234-4123-8123-123456789abc.jpg'
      },
      {
        ...baseRecord,
        id: 'media-batch-2',
        title: '安装现场第二张',
        url: '/api/uploads/22345678-1234-4123-8123-123456789abc.jpg'
      }
    ])
    .expect(201);

  assert.equal(response.body.length, 2);
  assert.equal(response.body.every(record => record.uploader === 'alice'), true);
  assert.equal(pool.resources.get('archives').size, 2);
});

test('an invalid archive prevents the entire batch from being saved', async () => {
  const { app, pool } = await createResourceTestApp();
  const cookie = await login(app);

  await request(app)
    .post('/archives/batch')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send([
      {
        id: 'valid-looking',
        title: '安装现场',
        category: 'Media',
        projectId: 'p-1',
        fileType: 'JPG',
        size: '1.0 MB',
        uploadDate: '2026-07-26T04:00:00.000Z',
        url: '/api/uploads/12345678-1234-4123-8123-123456789abc.jpg',
        mediaPhase: '进场施工',
        capturedAt: '2026-07-26',
        mediaType: 'image',
        mediaAlbumId: 'album-batch',
        mediaAlbumTitle: '设备定位现场'
      },
      {
        id: 'invalid',
        category: 'Media',
        projectId: 'missing'
      }
    ])
    .expect(400);

  assert.equal(pool.resources.get('archives')?.size || 0, 0);
});

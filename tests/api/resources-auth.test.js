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

  assert.equal(response.body.length, 2);
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
  assert.equal(response.body.workflowNodeTitle, '设备定位');
  assert.equal(pool.resources.get('archives').get('media-1').uploader, 'alice');

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

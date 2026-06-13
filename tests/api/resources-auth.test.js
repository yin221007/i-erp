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
      avatar: '',
      preferences: {
        sound: true,
        webhooks: { pushPlusToken: 'private-token' }
      }
    }
  ];
  const pool = new FakeResourcePool(users, {
    projects: [{ id: 'p-1', name: 'Project' }],
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

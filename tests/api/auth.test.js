import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { hashPassword } from '../../server/auth/passwords.js';

class FakeAuthPool {
  constructor(users) {
    this.users = new Map(users.map(user => [user.id, structuredClone(user)]));
    this.sessions = new Map();
    this.heartbeatUpdates = 0;
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM users') && normalized.includes('JSON_EXTRACT')) {
      const nickname = parameters[0];
      const user = [...this.users.values()].find(
        item => item.nickname.toLowerCase() === nickname
      );
      return [user ? [{
        id: user.id,
        json_data: JSON.stringify(user)
      }] : [], []];
    }

    if (normalized.startsWith('INSERT INTO auth_sessions')) {
      const [
        id,
        tokenHash,
        userId,
        userAgent,
        ipAddress,
        createdAt,
        lastSeenAt,
        expiresAt,
        absoluteExpiresAt
      ] = parameters;
      this.sessions.set(id, {
        id,
        tokenHash,
        userId,
        userAgent,
        ipAddress,
        createdAt,
        lastSeenAt,
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
          item.revokedAt === null &&
          item.expiresAt > now &&
          item.absoluteExpiresAt > now
      );
      if (!session) return [[], []];
      const user = this.users.get(session.userId);
      return [[{
        session_id: session.id,
        expires_at: session.expiresAt,
        absolute_expires_at: session.absoluteExpiresAt,
        json_data: JSON.stringify(user)
      }], []];
    }

    if (normalized.startsWith('UPDATE auth_sessions SET last_seen_at')) {
      const [lastSeenAt, expiresAt, id] = parameters;
      const session = this.sessions.get(id);
      session.lastSeenAt = lastSeenAt;
      session.expiresAt = expiresAt;
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('UPDATE auth_sessions SET revoked_at')) {
      const [revokedAt, tokenHash] = parameters;
      const session = [...this.sessions.values()].find(
        item => item.tokenHash === tokenHash
      );
      if (session) session.revokedAt = revokedAt;
      return [{ affectedRows: session ? 1 : 0 }, []];
    }

    if (normalized.startsWith('UPDATE users SET json_data = JSON_SET')) {
      const [lastActive, userId] = parameters;
      if (!this.users.has(userId)) return [{ affectedRows: 0 }, []];
      this.users.set(userId, {
        ...this.users.get(userId),
        lastActive
      });
      this.heartbeatUpdates += 1;
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('UPDATE users SET json_data')) {
      const [jsonData, userId] = parameters;
      if (!this.users.has(userId)) return [{ affectedRows: 0 }, []];
      this.users.set(userId, JSON.parse(jsonData));
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Unexpected SQL in fake auth pool: ${normalized}`);
  }
}

const config = {
  trustProxy: 1,
  publicOrigins: ['https://erp.example.test']
};

async function createAuthTestApp() {
  const [adminPassword, memberPassword] = await Promise.all([
    hashPassword('password'),
    hashPassword('member-password')
  ]);
  const pool = new FakeAuthPool([
    {
      id: 'u-1',
      nickname: 'admin',
      password: adminPassword,
      department: '总经办',
      role: 'Admin',
      isDefaultAdmin: true,
      avatar: ''
    },
    {
      id: 'u-2',
      nickname: 'member',
      password: memberPassword,
      department: '工程部',
      role: 'User',
      isDefaultAdmin: false,
      avatar: '',
      preferences: {
        enableBrowser: true,
        webhooks: {
          pushPlusToken: 'existing-secret'
        }
      }
    }
  ]);
  return { app: createApp({ pool, config }), pool };
}

function sessionCookie(response) {
  return response.headers['set-cookie'][0].split(';')[0];
}

test('login issues a secure HttpOnly cookie and returns a safe user', async () => {
  const { app } = await createAuthTestApp();
  const response = await request(app)
    .post('/auth/login')
    .send({ username: 'admin', password: 'password' })
    .expect(200);

  assert.match(
    response.headers['set-cookie'][0],
    /^ierp_session=.*HttpOnly.*Secure.*SameSite=Lax/
  );
  assert.equal(response.body.user.nickname, 'admin');
  assert.equal('password' in response.body.user, false);
});

test('forged x-user-id does not authenticate a request', async () => {
  const { app } = await createAuthTestApp();

  await request(app)
    .get('/auth/me')
    .set('x-user-id', 'u-1')
    .expect(401);
});

test('multiple device sessions remain independent when one logs out', async () => {
  const { app } = await createAuthTestApp();
  const firstLogin = await request(app)
    .post('/auth/login')
    .set('user-agent', 'device-one')
    .send({ username: 'admin', password: 'password' })
    .expect(200);
  const secondLogin = await request(app)
    .post('/auth/login')
    .set('user-agent', 'device-two')
    .send({ username: 'admin', password: 'password' })
    .expect(200);
  const firstCookie = sessionCookie(firstLogin);
  const secondCookie = sessionCookie(secondLogin);

  assert.notEqual(firstCookie, secondCookie);

  await request(app)
    .post('/auth/logout')
    .set('Cookie', firstCookie)
    .set('Origin', 'https://erp.example.test')
    .expect(204);

  await request(app).get('/auth/me').set('Cookie', firstCookie).expect(401);
  await request(app).get('/auth/me').set('Cookie', secondCookie).expect(200);
});

test('login failures are rate limited by username and client address', async () => {
  const { app } = await createAuthTestApp();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401);
  }

  await request(app)
    .post('/auth/login')
    .send({ username: 'admin', password: 'wrong' })
    .expect(429);
});

test('a user can update only their own profile preferences and read state', async () => {
  const { app, pool } = await createAuthTestApp();
  const login = await request(app)
    .post('/auth/login')
    .send({ username: 'member', password: 'member-password' })
    .expect(200);
  const cookie = sessionCookie(login);

  assert.equal(
    login.body.user.preferences.webhooks.pushPlusToken,
    'existing-secret'
  );

  const response = await request(app)
    .patch('/auth/me')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'u-1',
      role: 'Admin',
      isDefaultAdmin: true,
      password: 'replacement',
      preferences: {
        enableBrowser: false,
        webhooks: {
          pushPlusToken: 'updated-secret'
        }
      },
      lastReadMap: {
        general: '2026-06-13T12:00:00.000Z'
      }
    })
    .expect(200);

  assert.equal(response.body.user.id, 'u-2');
  assert.equal(response.body.user.role, 'User');
  assert.equal(response.body.user.preferences.enableBrowser, false);
  assert.equal(
    response.body.user.preferences.webhooks.pushPlusToken,
    'updated-secret'
  );
  assert.equal(
    response.body.user.lastReadMap.general,
    '2026-06-13T12:00:00.000Z'
  );

  const stored = pool.users.get('u-2');
  assert.equal(stored.role, 'User');
  assert.equal(stored.isDefaultAdmin, false);
  assert.notEqual(stored.password, 'replacement');
  assert.equal(stored.preferences.webhooks.pushPlusToken, 'updated-secret');
});

test('a normal user heartbeat updates only their own last-active timestamp', async () => {
  const { app, pool } = await createAuthTestApp();
  const login = await request(app)
    .post('/auth/login')
    .send({ username: 'member', password: 'member-password' })
    .expect(200);
  const cookie = sessionCookie(login);

  const response = await request(app)
    .post('/auth/heartbeat')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .expect(200);

  assert.equal(response.body.user.id, 'u-2');
  assert.equal(Number.isNaN(Date.parse(response.body.user.lastActive)), false);
  assert.equal(pool.users.get('u-2').lastActive, response.body.user.lastActive);
  assert.equal(pool.users.get('u-1').lastActive, undefined);
  assert.equal(pool.heartbeatUpdates, 1);
});

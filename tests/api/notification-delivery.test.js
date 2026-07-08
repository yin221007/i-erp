import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { hashPassword } from '../../server/auth/passwords.js';

class NotificationApiPool {
  constructor(users, channels) {
    this.users = new Map(users.map(user => [user.id, user]));
    this.channels = new Map(channels.map(channel => [channel.id, channel]));
    this.messages = new Map();
    this.sessions = new Map();
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM users') && normalized.includes('JSON_EXTRACT')) {
      const user = [...this.users.values()].find(
        item => item.nickname.toLowerCase() === parameters[0]
      );
      return [user ? [{
        id: user.id,
        json_data: JSON.stringify(user)
      }] : [], []];
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
      const session = [...this.sessions.values()].find(item =>
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
    if (normalized.startsWith('REPLACE INTO `messages`')) {
      const [id, jsonData] = parameters;
      this.messages.set(id, JSON.parse(jsonData));
      return [{ affectedRows: 1 }, []];
    }
    if (normalized === 'SELECT json_data FROM users') {
      return [[...this.users.values()].map(user => ({
        json_data: JSON.stringify(user)
      })), []];
    }
    if (normalized === 'SELECT json_data FROM channels WHERE id = ? LIMIT 1') {
      const channel = this.channels.get(parameters[0]);
      return [channel ? [{
        json_data: JSON.stringify(channel)
      }] : [], []];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

test('saving a chat message delivers configured recipient notifications', async () => {
  const deliveries = [];
  const senderPassword = await hashPassword('sender-password');
  const pool = new NotificationApiPool([
    {
      id: 'sender',
      nickname: 'sender',
      password: senderPassword,
      department: '工程部',
      role: 'User',
      permission: 'ReadWrite',
      avatar: ''
    },
    {
      id: 'recipient',
      nickname: 'recipient',
      department: '项目部',
      role: 'User',
      permission: 'ReadWrite',
      avatar: '',
      preferences: {
        types: { chat: true, approval: true },
        webhooks: { pushPlusToken: 'recipient-token' }
      }
    }
  ], [{
    id: 'general',
    name: '全员群',
    type: 'General'
  }]);
  const app = createApp({
    pool,
    config: {
      trustProxy: 1,
      publicOrigins: ['https://erp.example.test']
    },
    pushService: {
      async sendConfigured(config, message) {
        deliveries.push({ config, message });
      },
      async sendTest() {}
    }
  });
  const login = await request(app)
    .post('/auth/login')
    .send({ username: 'sender', password: 'sender-password' })
    .expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];

  await request(app)
    .post('/messages')
    .set('Cookie', cookie)
    .set('Origin', 'https://erp.example.test')
    .send({
      id: 'message-1',
      channelId: 'general',
      userId: 'impersonated-user',
      userName: '伪造姓名',
      content: '请确认审批资料',
      timestamp: new Date().toISOString()
    })
    .expect(201);

  assert.equal(pool.messages.get('message-1').content, '请确认审批资料');
  assert.equal(pool.messages.get('message-1').userId, 'sender');
  assert.equal(pool.messages.get('message-1').userName, 'sender');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].config.pushPlusToken, 'recipient-token');
  assert.match(deliveries[0].message.content, /请确认审批资料/);
  assert.doesNotMatch(deliveries[0].message.content, /伪造姓名/);
});

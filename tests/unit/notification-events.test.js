import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationDispatcher } from '../../server/services/notification-events.js';

class NotificationPool {
  constructor({ users, channels = [] }) {
    this.users = users;
    this.channels = channels;
  }

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT json_data FROM users') {
      return [this.users.map(user => ({
        json_data: JSON.stringify(user)
      })), []];
    }
    if (normalized === 'SELECT json_data FROM channels WHERE id = ? LIMIT 1') {
      const channel = this.channels.find(item => item.id === parameters[0]);
      return [channel ? [{ json_data: JSON.stringify(channel) }] : [], []];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function user(id, overrides = {}) {
  return {
    id,
    nickname: id,
    preferences: {
      types: {
        chat: true,
        approval: true
      },
      webhooks: {
        pushPlusToken: `token-${id}`
      }
    },
    ...overrides
  };
}

function createHarness(options) {
  const deliveries = [];
  const errors = [];
  const pushService = {
    async sendConfigured(config, message) {
      deliveries.push({ config, message });
      if (options.failDelivery) throw new Error('provider unavailable');
    }
  };
  const dispatch = createNotificationDispatcher({
    pool: new NotificationPool(options),
    pushService,
    logger: {
      error(...args) {
        errors.push(args);
      }
    }
  });
  return { dispatch, deliveries, errors };
}

test('general chat notifies subscribed configured users except the sender', async () => {
  const { dispatch, deliveries } = createHarness({
    users: [
      user('sender'),
      user('recipient'),
      user('muted', {
        preferences: {
          types: { chat: false, approval: true },
          webhooks: { pushPlusToken: 'token-muted' }
        }
      }),
      user('unconfigured', {
        preferences: {
          types: { chat: true, approval: true }
        }
      })
    ],
    channels: [{ id: 'general', name: '全员群', type: 'General' }]
  });

  await dispatch('messages', {
    id: 'm-1',
    channelId: 'general',
    userId: 'sender',
    userName: '张三',
    content: '请检查现场进度'
  }, 'create', {
    actor: { id: 'sender', nickname: '张三' }
  });

  assert.deepEqual(
    deliveries.map(item => item.config.pushPlusToken),
    ['token-recipient']
  );
  assert.match(deliveries[0].message.title, /全员群/);
  assert.match(deliveries[0].message.content, /请检查现场进度/);
});

test('group chat notifies only channel participants', async () => {
  const { dispatch, deliveries } = createHarness({
    users: [user('sender'), user('member'), user('outsider')],
    channels: [{
      id: 'group-1',
      name: '项目群',
      type: 'Group',
      participants: ['sender', 'member']
    }]
  });

  await dispatch('messages', {
    id: 'm-2',
    channelId: 'group-1',
    userId: 'sender',
    userName: '张三',
    content: '材料已到场'
  }, 'create', {
    actor: { id: 'sender', nickname: '张三' }
  });

  assert.deepEqual(
    deliveries.map(item => item.config.pushPlusToken),
    ['token-member']
  );
});

test('new channel announcements use chat subscriptions and channel membership', async () => {
  const { dispatch, deliveries } = createHarness({
    users: [user('publisher'), user('member'), user('outsider')],
    channels: [{
      id: 'group-1',
      name: '项目群',
      type: 'Group',
      participants: ['publisher', 'member']
    }]
  });

  await dispatch('announcements', {
    id: 'announcement-1',
    channelId: 'group-1',
    creatorId: 'publisher',
    creatorName: '项目经理',
    content: '明早九点现场碰头'
  }, 'create', {
    actor: { id: 'publisher', nickname: '项目经理' }
  });

  assert.deepEqual(
    deliveries.map(item => item.config.pushPlusToken),
    ['token-member']
  );
  assert.match(deliveries[0].message.title, /公告/);
  assert.match(deliveries[0].message.content, /明早九点现场碰头/);
});

test('sequential approval notifies only the current approver', async () => {
  const { dispatch, deliveries } = createHarness({
    users: [user('applicant'), user('first'), user('second')]
  });

  await dispatch('approvals', {
    id: 'approval-1',
    title: '设备采购申请',
    applicantId: 'applicant',
    applicantName: '申请人',
    status: 'Pending',
    strategy: 'SEQUENTIAL',
    approverIds: ['first', 'second'],
    versions: [{ outcomes: [] }]
  }, 'create', {
    actor: { id: 'applicant', nickname: '申请人' },
    previousRecord: null
  });

  assert.deepEqual(
    deliveries.map(item => item.config.pushPlusToken),
    ['token-first']
  );
  assert.match(deliveries[0].message.title, /待审批/);
});

test('approval progress notifies the next approver and final result notifies applicant', async () => {
  const harness = createHarness({
    users: [user('applicant'), user('first'), user('second')]
  });
  const base = {
    id: 'approval-1',
    title: '设备采购申请',
    applicantId: 'applicant',
    applicantName: '申请人',
    status: 'Pending',
    strategy: 'SEQUENTIAL',
    approverIds: ['first', 'second']
  };

  await harness.dispatch('approvals', {
    ...base,
    versions: [{
      outcomes: [{
        approverId: 'first',
        approverName: 'first',
        status: 'Approved'
      }]
    }]
  }, 'update', {
    actor: { id: 'first', nickname: 'first' },
    previousRecord: {
      ...base,
      versions: [{ outcomes: [] }]
    }
  });

  await harness.dispatch('approvals', {
    ...base,
    status: 'Approved',
    versions: [{
      outcomes: [
        { approverId: 'first', status: 'Approved' },
        { approverId: 'second', status: 'Approved' }
      ]
    }]
  }, 'update', {
    actor: { id: 'second', nickname: 'second' },
    previousRecord: {
      ...base,
      versions: [{
        outcomes: [{ approverId: 'first', status: 'Approved' }]
      }]
    }
  });

  assert.deepEqual(
    harness.deliveries.map(item => item.config.pushPlusToken),
    ['token-second', 'token-applicant']
  );
  assert.match(harness.deliveries[1].message.title, /已通过/);
});

test('push delivery failures are logged without rejecting the saved event', async () => {
  const { dispatch, errors } = createHarness({
    users: [user('sender'), user('recipient')],
    channels: [{ id: 'general', name: '全员群', type: 'General' }],
    failDelivery: true
  });

  await assert.doesNotReject(dispatch('messages', {
    id: 'm-3',
    channelId: 'general',
    userId: 'sender',
    userName: '张三',
    content: '通知测试'
  }, 'create', {
    actor: { id: 'sender', nickname: '张三' }
  }));
  assert.equal(errors.length, 1);
});

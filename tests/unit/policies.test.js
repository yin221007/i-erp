import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResourcePolicy,
  canWriteResource,
  filterReadableRecords,
  sanitizeResourceRecord
} from '../../server/policies.js';

const normalUser = { id: 'u-2', role: 'User', isDefaultAdmin: false };
const administrator = { id: 'u-1', role: 'Admin', isDefaultAdmin: true };

test('unknown resources have no policy', () => {
  assert.equal(getResourcePolicy('projects'), 'authenticated');
  assert.equal(getResourcePolicy('projects; DROP TABLE users'), null);
});

test('administrative resources reject normal-user writes', () => {
  assert.equal(canWriteResource('users', normalUser, { id: 'u-3' }), false);
  assert.equal(canWriteResource('settings', normalUser, {}), false);
  assert.equal(canWriteResource('users', administrator, { id: 'u-3' }), true);
});

test('owner resources only expose the authenticated user records', () => {
  const records = [
    { id: 'a-1', userId: 'u-2', content: 'mine' },
    { id: 'a-2', userId: 'u-3', content: 'other' }
  ];

  assert.deepEqual(filterReadableRecords('ai_messages', normalUser, records), [
    records[0]
  ]);
});

test('user resources never expose password or private credentials', () => {
  const safe = sanitizeResourceRecord('users', {
    id: 'u-2',
    nickname: 'Alice',
    password: 'secret',
    authCode: 'mail-secret',
    preferences: {
      sound: true,
      webhooks: { pushPlusToken: 'push-secret' }
    }
  });

  assert.equal('password' in safe, false);
  assert.equal('authCode' in safe, false);
  assert.equal('webhooks' in safe.preferences, false);
});

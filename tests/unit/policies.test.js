import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResourcePolicy,
  canUpdateResource,
  canWriteResource,
  filterReadableRecords,
  sanitizeResourceRecord
} from '../../server/policies.js';

const normalUser = {
  id: 'u-2',
  role: 'User',
  isDefaultAdmin: false,
  nickname: 'Alice',
  department: '销售部',
  permission: 'ReadWrite'
};
const administrator = { id: 'u-1', role: 'Admin', isDefaultAdmin: true };

test('unknown resources have no policy', () => {
  assert.equal(getResourcePolicy('projects'), 'scoped');
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


test('project resources are scoped by ownership, department management, and executive visibility', () => {
  const records = [
    { id: 'p-1', manager: 'Alice', name: 'mine' },
    { id: 'p-2', manager: 'Bob', name: 'department' },
    { id: 'p-3', manager: 'Eve', name: 'hidden' }
  ];
  const context = {
    users: [
      { nickname: 'Alice', department: '销售部' },
      { nickname: 'Bob', department: '销售部' },
      { nickname: 'Eve', department: '工程部' }
    ]
  };

  assert.deepEqual(filterReadableRecords('projects', normalUser, records, context), [
    records[0]
  ]);
  assert.deepEqual(
    filterReadableRecords('projects', { ...normalUser, role: 'DeptManager' }, records, context),
    [records[0], records[1]]
  );
  assert.deepEqual(
    filterReadableRecords('projects', { ...normalUser, department: '总经办' }, records, context),
    records
  );
});

test('project-linked money and production writes require the proper department and visible project', () => {
  const context = {
    projects: [{ id: 'p-1', manager: 'Alice' }],
    users: [{ nickname: 'Alice', department: '销售部' }]
  };

  assert.equal(canWriteResource('payments', normalUser, { projectId: 'p-1' }, context), true);
  assert.equal(canWriteResource('production', normalUser, { projectId: 'p-1' }, context), false);
  assert.equal(
    canWriteResource(
      'production',
      { ...normalUser, department: '工程部' },
      { projectId: 'p-1' },
      context
    ),
    true
  );
  assert.equal(canWriteResource('payments', normalUser, { projectId: 'p-hidden' }, context), false);
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


test('missing or read-only permissions cannot write scoped resources', () => {
  const context = {
    projects: [{ id: 'p-1', manager: 'Alice' }],
    users: [{ nickname: 'Alice', department: '销售部' }]
  };

  assert.equal(
    canWriteResource('payments', { ...normalUser, permission: undefined }, { projectId: 'p-1' }, context),
    false
  );
  assert.equal(
    canWriteResource('payments', { ...normalUser, permission: 'Read' }, { projectId: 'p-1' }, context),
    false
  );
});


test('client, equipment, and docs records are scoped by creator and department manager', () => {
  const records = [
    { id: 'r-1', creatorId: 'u-2', title: 'mine' },
    { id: 'r-2', creatorId: 'u-4', title: 'department' },
    { id: 'r-3', creatorId: 'u-9', title: 'hidden' }
  ];
  const context = {
    users: [
      { id: 'u-2', nickname: 'Alice', department: '销售部' },
      { id: 'u-4', nickname: 'Colleague', department: '销售部' },
      { id: 'u-9', nickname: 'Other', department: '工程部' }
    ]
  };

  assert.deepEqual(filterReadableRecords('clients', normalUser, records, context), records);
  assert.deepEqual(
    filterReadableRecords('clients', { ...normalUser, department: '售后部' }, records, context),
    [records[0]]
  );
  assert.deepEqual(
    filterReadableRecords('equipment', { ...normalUser, role: 'DeptManager' }, records, context),
    [records[0], records[1]]
  );
  assert.deepEqual(
    filterReadableRecords('docs', { ...normalUser, department: '总经办' }, records, context),
    records
  );
  assert.equal(canWriteResource('clients', normalUser, records[0], context), true);
  assert.equal(canWriteResource('clients', normalUser, records[1], context), true);
  assert.equal(canWriteResource('clients', { ...normalUser, department: '售后部' }, records[1], context), false);
  assert.equal(canWriteResource('clients', { ...normalUser, permission: 'Read' }, records[0], context), false);
  assert.equal(canWriteResource('docs', { ...normalUser, permission: 'Read' }, records[0], context), false);
});

test('approval updates allow only valid applicant edits or current approver outcomes', () => {
  const previous = {
    id: 'ap-1',
    title: '采购审批',
    type: 'Procurement',
    applicantId: 'u-2',
    applicantName: 'Alice',
    department: '销售部',
    strategy: 'SEQUENTIAL',
    approverIds: ['u-3'],
    approverNamesDisplay: 'Bob',
    status: 'Pending',
    currentContent: '采购内容',
    currentAttachments: [],
    versions: [{ version: 1, content: '采购内容', attachments: [], submittedAt: '2026-01-01T00:00:00.000Z', outcomes: [] }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const applicantTamper = {
    ...previous,
    status: 'Approved',
    updatedAt: '2026-01-01T01:00:00.000Z'
  };
  const approver = {
    id: 'u-3',
    role: 'User',
    isDefaultAdmin: false,
    nickname: 'Bob',
    department: '工程部',
    permission: 'ReadWrite'
  };
  const approved = {
    ...previous,
    status: 'Approved',
    updatedAt: '2026-01-01T01:00:00.000Z',
    versions: [{
      ...previous.versions[0],
      outcomes: [{
        status: 'Approved',
        approverId: 'u-3',
        approverName: 'Bob',
        comment: '同意',
        date: '2026-01-01T01:00:00.000Z'
      }]
    }]
  };
  const tamperedContent = {
    ...approved,
    currentContent: '审批时偷偷改内容'
  };
  const returnedPrevious = {
    ...previous,
    status: 'Returned',
    relatedId: 'project-1',
    relatedType: 'projects'
  };
  const applicantRetargetDelete = {
    ...returnedPrevious,
    status: 'Pending',
    relatedId: 'project-2',
    versions: [{ version: 2, content: '重新提交', attachments: [], submittedAt: '2026-01-01T02:00:00.000Z', outcomes: [] }, ...returnedPrevious.versions]
  };
  const applicantRename = {
    ...returnedPrevious,
    status: 'Pending',
    applicantName: 'Mallory',
    versions: [{ version: 2, content: '重新提交', attachments: [], submittedAt: '2026-01-01T02:00:00.000Z', outcomes: [] }, ...returnedPrevious.versions]
  };

  assert.equal(canUpdateResource('approvals', normalUser, applicantTamper, previous), false);
  assert.equal(canUpdateResource('approvals', normalUser, applicantRetargetDelete, returnedPrevious), false);
  assert.equal(canUpdateResource('approvals', normalUser, applicantRename, returnedPrevious), false);
  assert.equal(canUpdateResource('approvals', approver, approved, previous), true);
  assert.equal(canUpdateResource('approvals', approver, tamperedContent, previous), false);
});

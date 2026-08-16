import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPollPlan,
  GLOBAL_POLL_INTERVAL_MILLISECONDS,
  POLL_TICK_MILLISECONDS,
  STANDARD_POLL_INTERVAL_MILLISECONDS
} from '../../lib/polling.js';

test('standard views poll only their page resources every fifteen seconds', () => {
  const initial = getPollPlan({
    activeView: 'projects',
    now: STANDARD_POLL_INTERVAL_MILLISECONDS,
    lastViewPollAt: 0,
    lastGlobalPollAt: STANDARD_POLL_INTERVAL_MILLISECONDS
  });
  assert.deepEqual(initial.resources, ['projects', 'archives']);

  const early = getPollPlan({
    activeView: 'projects',
    now: STANDARD_POLL_INTERVAL_MILLISECONDS + POLL_TICK_MILLISECONDS,
    lastViewPollAt: initial.nextViewPollAt,
    lastGlobalPollAt: initial.nextGlobalPollAt
  });
  assert.deepEqual(early.resources, []);
});

test('chat keeps five-second message refresh without polling unrelated modules', () => {
  const plan = getPollPlan({
    activeView: 'chat',
    now: POLL_TICK_MILLISECONDS,
    lastViewPollAt: 0,
    lastGlobalPollAt: POLL_TICK_MILLISECONDS
  });

  assert.deepEqual(plan.resources, [
    'messages',
    'channels',
    'announcements',
    'users',
    'projects'
  ]);
  assert.equal(plan.resources.includes('archives'), false);
  assert.equal(plan.resources.includes('payments'), false);
});

test('global identity and announcements refresh once per minute with deduplication', () => {
  const plan = getPollPlan({
    activeView: 'approvals',
    now: GLOBAL_POLL_INTERVAL_MILLISECONDS,
    lastViewPollAt:
      GLOBAL_POLL_INTERVAL_MILLISECONDS - STANDARD_POLL_INTERVAL_MILLISECONDS,
    lastGlobalPollAt: 0
  });

  assert.deepEqual(plan.resources, ['approvals', 'users', 'announcements']);
});

test('settings are refreshed only while their modal is open', () => {
  const closed = getPollPlan({
    activeView: 'home',
    now: STANDARD_POLL_INTERVAL_MILLISECONDS,
    lastGlobalPollAt: STANDARD_POLL_INTERVAL_MILLISECONDS
  });
  const open = getPollPlan({
    activeView: 'home',
    isSettingsOpen: true,
    now: STANDARD_POLL_INTERVAL_MILLISECONDS,
    lastGlobalPollAt: STANDARD_POLL_INTERVAL_MILLISECONDS
  });

  assert.equal(closed.resources.includes('settings'), false);
  assert.equal(open.resources.includes('settings'), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFailureLimiter } from '../../server/services/failure-limiter.js';

test('failure limiter blocks after the configured number of failures', () => {
  const limiter = createFailureLimiter({
    maximumFailures: 2,
    windowMilliseconds: 1_000
  });

  limiter.recordFailure('a', 0);
  assert.equal(limiter.isBlocked('a', 0), false);
  limiter.recordFailure('a', 0);
  assert.equal(limiter.isBlocked('a', 0), true);
  assert.equal(limiter.isBlocked('a', 1_001), false);
});

test('failure limiter remains bounded under many unique keys', () => {
  const limiter = createFailureLimiter({
    maximumEntries: 3,
    windowMilliseconds: 60_000
  });

  for (const key of ['a', 'b', 'c', 'd', 'e']) {
    limiter.recordFailure(key, 0);
  }

  assert.equal(limiter.entryCount(), 3);
  assert.equal(limiter.isBlocked('a', 0), false);
});

test('failure limiter removes expired entries before evicting active ones', () => {
  const limiter = createFailureLimiter({
    maximumEntries: 2,
    windowMilliseconds: 100
  });

  limiter.recordFailure('expired', 0);
  limiter.recordFailure('active', 150);
  limiter.recordFailure('new', 150);

  assert.equal(limiter.entryCount(), 2);
  assert.equal(limiter.isBlocked('active', 150), false);
});

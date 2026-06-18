export function createFailureLimiter({
  maximumFailures = 5,
  windowMilliseconds = 15 * 60 * 1000,
  maximumEntries = 10_000
} = {}) {
  if (
    !Number.isSafeInteger(maximumFailures) ||
    maximumFailures < 1 ||
    !Number.isSafeInteger(windowMilliseconds) ||
    windowMilliseconds < 1 ||
    !Number.isSafeInteger(maximumEntries) ||
    maximumEntries < 1
  ) {
    throw new Error('Failure limiter options must be positive integers');
  }

  const attempts = new Map();

  function pruneExpired(now) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
  }

  function makeRoom(now) {
    if (attempts.size < maximumEntries) return;
    pruneExpired(now);
    while (attempts.size >= maximumEntries) {
      attempts.delete(attempts.keys().next().value);
    }
  }

  function entryFor(key, now) {
    const current = attempts.get(key);
    if (current?.resetAt > now) return current;
    if (current) attempts.delete(key);
    makeRoom(now);
    const fresh = { failures: 0, resetAt: now + windowMilliseconds };
    attempts.set(key, fresh);
    return fresh;
  }

  return {
    isBlocked(key, now = Date.now()) {
      return entryFor(key, now).failures >= maximumFailures;
    },
    recordFailure(key, now = Date.now()) {
      entryFor(key, now).failures += 1;
    },
    clear(key) {
      attempts.delete(key);
    },
    entryCount() {
      return attempts.size;
    }
  };
}

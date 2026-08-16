import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server source has no fallback database password', async () => {
  const source = await readFile(new URL('../../server.js', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /password:\s*process\.env\.DB_PASSWORD\s*\|\|/,
    'DB_PASSWORD must be required configuration, never a source fallback'
  );
});

test('server does not keep abandoned requests open for an hour', async () => {
  const source = await readFile(
    new URL('../../server/index.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /server\.timeout = 180_000/);
  assert.doesNotMatch(source, /server\.timeout = 3_600_000/);
});

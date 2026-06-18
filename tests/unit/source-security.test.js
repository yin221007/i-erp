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

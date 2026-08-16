import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('business data and local handoff files are excluded from Git and Docker build contexts', async () => {
  const [gitignore, dockerignore] = await Promise.all([
    readFile(new URL('../../.gitignore', import.meta.url), 'utf8'),
    readFile(new URL('../../.dockerignore', import.meta.url), 'utf8')
  ]);

  for (const source of [gitignore, dockerignore]) {
    assert.match(source, /(^|\n)db\.json(\n|$)/);
    assert.match(source, /(^|\n)HANDOFF\.md(\n|$)/);
    assert.match(source, /(^|\n)\.env(\n|$)/);
  }
});

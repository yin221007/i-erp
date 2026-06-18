import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

test('the production entrypoint delegates to the modular server', async () => {
  const entry = await readFile(new URL('server.js', root), 'utf8');

  assert.equal(entry.trim(), "import './server/index.js';");
});

test('startup prepares tables and migrations before listening', async () => {
  const source = await readFile(new URL('server/index.js', root), 'utf8');
  const prepare = source.indexOf('await ensureResourceTables(pool)');
  const migrate = source.indexOf('await runMigrations(pool)');
  const create = source.indexOf('const app = createApp');
  const listen = source.indexOf('.listen(');

  assert.ok(prepare >= 0);
  assert.ok(migrate > prepare);
  assert.ok(create > migrate);
  assert.ok(listen > create);
  assert.doesNotMatch(source, /DEFAULT_ADMIN|password:\s*['"]password['"]/);
});

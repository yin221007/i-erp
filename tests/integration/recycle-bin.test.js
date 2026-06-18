import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveToRecycleBin,
  restoreRecycleItem,
  permanentlyDeleteRecycleItem
} from '../../server/services/recycle-bin.js';

class FakeRecyclePool {
  constructor() {
    this.tables = new Map([
      ['projects', new Map()],
      ['recycle_bin', new Map()]
    ]);
    this.snapshot = null;
    this.failRecycleInsert = false;
  }

  async getConnection() {
    return this;
  }

  async beginTransaction() {
    this.snapshot = structuredClone(this.tables);
  }

  async commit() {
    this.snapshot = null;
  }

  async rollback() {
    this.tables = this.snapshot;
    this.snapshot = null;
  }

  release() {}

  async query(sql, parameters = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const selectJson = normalized.match(
      /^SELECT json_data FROM `?([a-z_]+)`? WHERE id = \? FOR UPDATE$/
    );
    if (selectJson) {
      const record = this.tables.get(selectJson[1])?.get(parameters[0]);
      return [record ? [{ json_data: JSON.stringify(record) }] : [], []];
    }

    const selectId = normalized.match(
      /^SELECT id FROM `([a-z_]+)` WHERE id = \? FOR UPDATE$/
    );
    if (selectId) {
      const exists = this.tables.get(selectId[1])?.has(parameters[0]);
      return [exists ? [{ id: parameters[0] }] : [], []];
    }

    if (normalized.startsWith('INSERT INTO recycle_bin')) {
      if (this.failRecycleInsert) throw new Error('simulated insert failure');
      const [id, json] = parameters;
      this.tables.get('recycle_bin').set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    const insertRecord = normalized.match(
      /^INSERT INTO `([a-z_]+)` \(id, json_data\) VALUES \(\?, \?\)$/
    );
    if (insertRecord) {
      const [id, json] = parameters;
      this.tables.get(insertRecord[1]).set(id, JSON.parse(json));
      return [{ affectedRows: 1 }, []];
    }

    const deleteRecord = normalized.match(
      /^DELETE FROM `?([a-z_]+)`? WHERE id = \?$/
    );
    if (deleteRecord) {
      const deleted = this.tables.get(deleteRecord[1]).delete(parameters[0]);
      return [{ affectedRows: deleted ? 1 : 0 }, []];
    }

    throw new Error(`Unexpected SQL in fake recycle pool: ${normalized}`);
  }
}

const user = { id: 'u-1', nickname: 'admin' };

test('delete creates one recycle item and removes the live record atomically', async () => {
  const pool = new FakeRecyclePool();
  pool.tables.get('projects').set('p-1', { id: 'p-1', name: 'Project One' });

  const result = await moveToRecycleBin(pool, {
    resource: 'projects',
    id: 'p-1',
    user
  });

  assert.equal(pool.tables.get('projects').has('p-1'), false);
  assert.equal(pool.tables.get('recycle_bin').size, 1);
  assert.equal(result.originalId, 'p-1');
});

test('failed recycle insert leaves the live record intact', async () => {
  const pool = new FakeRecyclePool();
  pool.tables.get('projects').set('p-1', { id: 'p-1', name: 'Project One' });
  pool.failRecycleInsert = true;

  await assert.rejects(
    () => moveToRecycleBin(pool, {
      resource: 'projects',
      id: 'p-1',
      user
    }),
    /simulated insert failure/
  );

  assert.equal(pool.tables.get('projects').has('p-1'), true);
  assert.equal(pool.tables.get('recycle_bin').size, 0);
});

test('restore recreates the live record and removes the recycle item', async () => {
  const pool = new FakeRecyclePool();
  pool.tables.get('recycle_bin').set('r-1', {
    id: 'r-1',
    originalId: 'p-1',
    resourceType: 'projects',
    data: { id: 'p-1', name: 'Project One' }
  });

  await restoreRecycleItem(pool, 'r-1');

  assert.deepEqual(pool.tables.get('projects').get('p-1'), {
    id: 'p-1',
    name: 'Project One'
  });
  assert.equal(pool.tables.get('recycle_bin').has('r-1'), false);
});

test('restore conflict does not overwrite live data or remove recycle item', async () => {
  const pool = new FakeRecyclePool();
  pool.tables.get('projects').set('p-1', { id: 'p-1', name: 'Current' });
  pool.tables.get('recycle_bin').set('r-1', {
    id: 'r-1',
    originalId: 'p-1',
    resourceType: 'projects',
    data: { id: 'p-1', name: 'Old' }
  });

  await assert.rejects(() => restoreRecycleItem(pool, 'r-1'), error => {
    assert.equal(error.statusCode, 409);
    return true;
  });

  assert.equal(pool.tables.get('projects').get('p-1').name, 'Current');
  assert.equal(pool.tables.get('recycle_bin').has('r-1'), true);
});

test('permanent delete removes only the recycle item', async () => {
  const pool = new FakeRecyclePool();
  pool.tables.get('recycle_bin').set('r-1', {
    id: 'r-1',
    originalId: 'p-1',
    resourceType: 'projects',
    data: { id: 'p-1' }
  });

  await permanentlyDeleteRecycleItem(pool, 'r-1');

  assert.equal(pool.tables.get('recycle_bin').size, 0);
  assert.equal(pool.tables.get('projects').size, 0);
});

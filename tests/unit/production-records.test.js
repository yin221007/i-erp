import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductionRecord } from '../../lib/production-records.js';

test('legacy production record receives projectId as its stable id', () => {
  assert.deepEqual(
    normalizeProductionRecord({
      projectId: 'project-7',
      projectName: 'Project Seven',
      projectCode: 'P-7',
      items: []
    }),
    {
      id: 'project-7',
      projectId: 'project-7',
      projectName: 'Project Seven',
      projectCode: 'P-7',
      items: []
    }
  );
});

test('existing stable production id is preserved', () => {
  assert.equal(
    normalizeProductionRecord({
      id: 'production-9',
      projectId: 'project-9',
      items: []
    }).id,
    'production-9'
  );
});

test('production record without any stable identifier is rejected', () => {
  assert.throws(
    () => normalizeProductionRecord({ items: [] }),
    /stable id/i
  );
});

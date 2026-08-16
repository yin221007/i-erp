import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendProductionUnitsInSourceOrder,
  getProductionWriteRequest,
  normalizeProductionRecord,
  sortProductionUnitsBySourceOrder
} from '../../lib/production-records.js';

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

test('existing project production is updated instead of posted as a duplicate', () => {
  const nextRecord = {
    id: 'project-7',
    projectId: 'project-7',
    projectName: 'Project Seven',
    projectCode: 'P-7',
    items: []
  };

  assert.deepEqual(
    getProductionWriteRequest([
      { ...nextRecord, id: 'legacy-production-id' }
    ], nextRecord),
    { method: 'PUT', id: 'project-7' }
  );
});

test('new project production uses create request', () => {
  const nextRecord = {
    id: 'project-8',
    projectId: 'project-8',
    projectName: 'Project Eight',
    projectCode: 'P-8',
    items: []
  };

  assert.deepEqual(
    getProductionWriteRequest([], nextRecord),
    { method: 'POST', id: undefined }
  );
});

test('production units retain spreadsheet row order instead of sorting by serial number', () => {
  const items = [
    { id: '1', serialNumber: 'Aa10', sourceOrder: 0, name: '第一项' },
    { id: '2', serialNumber: 'Aa2', sourceOrder: 1, name: '第二项' },
    { id: '3', serialNumber: 'Ab1', sourceOrder: 2, name: '第三项' }
  ];

  assert.deepEqual(
    sortProductionUnitsBySourceOrder(items).map(item => item.id),
    ['1', '2', '3']
  );
});

test('legacy units keep their stored array order and newly imported units append after them', () => {
  const result = appendProductionUnitsInSourceOrder(
    [
      { id: 'legacy-b', name: '旧二', model: 'B' },
      { id: 'legacy-a', name: '旧一', model: 'A' }
    ],
    [
      { id: 'new-1', name: '新一', model: '1000*700*800' },
      { id: 'new-2', name: '新二', model: '1200*700*800', actualProductionSpec: '' }
    ]
  );

  assert.deepEqual(
    result.map(item => ({
      id: item.id,
      sourceOrder: item.sourceOrder,
      actualProductionSpec: item.actualProductionSpec
    })),
    [
      { id: 'legacy-b', sourceOrder: 0, actualProductionSpec: undefined },
      { id: 'legacy-a', sourceOrder: 1, actualProductionSpec: undefined },
      { id: 'new-1', sourceOrder: 2, actualProductionSpec: '1000*700*800' },
      { id: 'new-2', sourceOrder: 3, actualProductionSpec: '' }
    ]
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInvoiceArchives,
  resolvePaymentProject
} from '../../lib/payment-archives.js';

const oldTenthSchoolProject = {
  id: 'vtfty0s4g',
  name: '扬州市老十中',
  clientName: '扬州华泰路桥集团'
};

const oldTenthSchoolPayment = {
  id: 'wyaifff5h',
  projectId: '',
  projectName: '扬州老十中厨房'
};

test('legacy payment name resolves to the unique project alias', () => {
  assert.equal(
    resolvePaymentProject(oldTenthSchoolPayment, [oldTenthSchoolProject])?.id,
    oldTenthSchoolProject.id
  );
});

test('ambiguous aliases do not resolve to an arbitrary project', () => {
  const projects = [
    oldTenthSchoolProject,
    { ...oldTenthSchoolProject, id: 'duplicate-project' }
  ];

  assert.equal(resolvePaymentProject(oldTenthSchoolPayment, projects), undefined);
});

test('invoice archives match through the resolved stable project id', () => {
  const archives = [
    {
      id: 'older-invoice',
      projectId: oldTenthSchoolProject.id,
      projectName: oldTenthSchoolProject.name,
      category: 'Invoice',
      title: '24',
      fileType: 'PDF',
      uploadDate: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'newer-invoice',
      projectId: oldTenthSchoolProject.id,
      projectName: oldTenthSchoolProject.name,
      category: 'Invoice',
      title: '26',
      fileType: 'PDF',
      uploadDate: '2026-02-01T00:00:00.000Z'
    },
    {
      id: 'drawing',
      projectId: oldTenthSchoolProject.id,
      projectName: oldTenthSchoolProject.name,
      category: 'Drawing',
      title: '老十中餐厅设备布置图',
      fileType: 'DWG',
      uploadDate: '2026-03-01T00:00:00.000Z'
    }
  ];

  assert.deepEqual(
    getInvoiceArchives(oldTenthSchoolPayment, [oldTenthSchoolProject], archives)
      .map(archive => archive.id),
    ['newer-invoice', 'older-invoice']
  );
});

test('a stable project id never accepts another project invoice by client-name fallback', () => {
  const projects = [
    oldTenthSchoolProject,
    {
      id: 'other-project',
      name: '扬州华泰办公楼厨房设备',
      clientName: oldTenthSchoolProject.clientName
    }
  ];
  const payment = {
    ...oldTenthSchoolPayment,
    projectId: oldTenthSchoolProject.id
  };
  const archives = [{
    id: 'wrong-project-invoice',
    projectId: 'other-project',
    projectName: oldTenthSchoolProject.clientName,
    category: 'Invoice',
    title: '办公楼项目发票',
    fileType: 'PDF',
    uploadDate: '2026-02-01T00:00:00.000Z'
  }];

  assert.deepEqual(getInvoiceArchives(payment, projects, archives), []);
});

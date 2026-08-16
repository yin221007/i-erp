import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as ts from 'typescript';

const sourceUrl = new URL('../../lib/project-status.ts', import.meta.url);

const loadProjectStatusModule = async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
};

const createProject = ({
  contractStatus = 'COMPLETED',
  sizingStatus = 'COMPLETED',
  signOffStatus = 'PENDING',
  costStatus = 'PENDING',
  paymentStatus = 'COMPLETED',
  status = 'Active'
} = {}) => ({
  id: 'south-university-training',
  name: '南大实训项目',
  status,
  nodes: [
    {
      id: 'contract',
      title: '招标投标签订合同',
      phase: '前期对接 & 设计',
      description: '完成合同签订',
      status: contractStatus
    },
    {
      id: 'sizing',
      title: '完工尺寸复核待定下单',
      phase: '进场施工',
      description: '复核尺寸',
      status: sizingStatus
    },
    {
      id: 'sign-off',
      title: '设备签收验收',
      phase: '验收交付',
      description: '正式签署竣工验收单',
      status: signOffStatus
    },
    {
      id: 'cost-accounting',
      title: '核算成本支出',
      phase: '结算收尾',
      description: '完成施工队劳务费用清算',
      status: costStatus
    },
    {
      id: 'payment',
      title: '开票申请支付',
      phase: '结算收尾',
      description: '提交财务开票申请',
      status: paymentStatus
    }
  ]
});

test('a project stays active until cost accounting is completed', async () => {
  const { getProjectBusinessStatus } = await loadProjectStatusModule();
  const project = createProject();

  assert.equal(getProjectBusinessStatus(project), 'Active');
});

test('completed raw status does not override an unfinished cost accounting node', async () => {
  const { getProjectBusinessStatus } = await loadProjectStatusModule();
  const project = createProject({ status: 'Completed' });

  assert.equal(getProjectBusinessStatus(project), 'Active');
});

test('completing cost accounting marks the project completed', async () => {
  const { getProjectBusinessStatus } = await loadProjectStatusModule();
  const project = createProject({ costStatus: 'COMPLETED' });

  assert.equal(getProjectBusinessStatus(project), 'Completed');
});

test('an uncompleted contract keeps the project pending', async () => {
  const { getProjectBusinessStatus } = await loadProjectStatusModule();
  const project = createProject({
    contractStatus: 'PENDING',
    sizingStatus: 'PENDING',
    paymentStatus: 'PENDING'
  });

  assert.equal(getProjectBusinessStatus(project), 'Pending');
});

test('legacy projects without a cost accounting node retain their stored completed status', async () => {
  const { getProjectBusinessStatus } = await loadProjectStatusModule();
  const project = createProject({ status: 'Completed' });
  project.nodes = project.nodes.filter(node => node.id !== 'cost-accounting');

  assert.equal(getProjectBusinessStatus(project), 'Completed');
});

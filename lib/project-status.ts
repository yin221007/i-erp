import type { Project, WorkflowNode } from '../types';

const CONTRACT_NODE_KEYWORDS = ['合同', '招标投标'];
const COST_ACCOUNTING_NODE_TITLE = '核算成本支出';

export type ProjectBusinessStatus = 'Pending' | 'Active' | 'Completed';

export const getWorkflowNodeByKeywords = (project: Project, keywords: string[]): WorkflowNode | null => {
  const nodes = project.nodes || [];
  return nodes.find(node => {
    const haystack = `${node.title} ${node.phase} ${node.description || ''}`;
    return keywords.some(keyword => haystack.includes(keyword));
  }) || null;
};

export const getContractNode = (project: Project) => getWorkflowNodeByKeywords(project, CONTRACT_NODE_KEYWORDS);

export const getCostAccountingNode = (project: Project) => (
  (project.nodes || []).find(node => node.title.trim().includes(COST_ACCOUNTING_NODE_TITLE)) || null
);

export const isCostAccountingDone = (project: Project) => (
  getCostAccountingNode(project)?.status === 'COMPLETED'
);

export const isProjectDelivered = (project: Project) => {
  const costAccountingNode = getCostAccountingNode(project);
  if (costAccountingNode) return isCostAccountingDone(project);
  return project.status === 'Completed';
};

export const isProjectContractStarted = (project: Project) => {
  const node = getContractNode(project);
  if (!node) return project.status !== 'Pending';
  return node.status === 'COMPLETED';
};

export const getProjectBusinessStatus = (project: Project): ProjectBusinessStatus => {
  if (isProjectDelivered(project)) return 'Completed';
  if (!isProjectContractStarted(project)) return 'Pending';
  return 'Active';
};

export const getProjectBusinessStatusLabel = (status: ProjectBusinessStatus) => {
  if (status === 'Completed') return '已竣工';
  if (status === 'Pending') return '待启动';
  return '在建';
};

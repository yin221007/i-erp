import { Project, TaskStatus, WorkflowNode } from '../types';

const CONTRACT_NODE_KEYWORDS = ['合同', '招标投标'];
const COMPLETION_NODE_KEYWORDS = ['竣工', '验收', '完工', '签收'];
const PAYMENT_APPLICATION_NODE_KEYWORDS = ['开票申请支付'];

export type ProjectBusinessStatus = 'Pending' | 'Active' | 'Completed';

export const getWorkflowNodeByKeywords = (project: Project, keywords: string[]): WorkflowNode | null => {
  const nodes = project.nodes || [];
  return nodes.find(node => {
    const haystack = `${node.title} ${node.phase} ${node.description || ''}`;
    return keywords.some(keyword => haystack.includes(keyword));
  }) || null;
};

export const getContractNode = (project: Project) => getWorkflowNodeByKeywords(project, CONTRACT_NODE_KEYWORDS);
export const getCompletionNode = (project: Project) => getWorkflowNodeByKeywords(project, COMPLETION_NODE_KEYWORDS);
export const getPaymentApplicationNode = (project: Project) => getWorkflowNodeByKeywords(project, PAYMENT_APPLICATION_NODE_KEYWORDS);

export const isCompletionNodeDone = (project: Project) => getCompletionNode(project)?.status === TaskStatus.COMPLETED;

export const isPaymentApplicationStarted = (project: Project) => {
  const node = getPaymentApplicationNode(project);
  return node?.status === TaskStatus.IN_PROGRESS || node?.status === TaskStatus.COMPLETED;
};

export const isProjectDelivered = (project: Project) => (
  project.status === 'Completed' ||
  isCompletionNodeDone(project) ||
  isPaymentApplicationStarted(project)
);

export const isProjectContractStarted = (project: Project) => {
  const node = getContractNode(project);
  if (!node) return project.status !== 'Pending';
  return node.status === TaskStatus.COMPLETED;
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

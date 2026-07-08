import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Factory,
  FileText,
  MessageSquare,
  RadioTower,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
  Zap
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Approval,
  ArchiveItem,
  ChatAnnouncement,
  ChatChannel,
  ChatMessage,
  PaymentRecord,
  Project,
  ProjectProduction,
  ScheduleItem,
  TaskStatus,
  User,
  WorkLogEntry
} from '../types';
import {
  getCompletionNode,
  getProjectBusinessStatus,
  isCompletionNodeDone,
  isProjectContractStarted,
  isProjectDelivered
} from '../lib/project-status';

interface HomeDashboardProps {
  projects: Project[];
  schedule: ScheduleItem[];
  paymentRecords: PaymentRecord[];
  productionData: ProjectProduction[];
  approvals: Approval[];
  archives: ArchiveItem[];
  workLogs: WorkLogEntry[];
  messages: ChatMessage[];
  channels: ChatChannel[];
  announcements: ChatAnnouncement[];
  currentUser: User;
  users: User[];
  chatUnreadCount: number;
  pendingApprovalCount: number;
  onNavigate: (view: string, context?: NavigationContext) => void;
  restoreDrilldown?: DrilldownState | null;
  onRestoreDrilldownConsumed?: () => void;
}

type RiskLevel = 'critical' | 'warning' | 'info';

interface NavigationContext {
  projectId?: string;
  productionProjectId?: string;
  paymentId?: string;
  paymentProjectId?: string;
  returnToHomeDrilldown?: DrilldownState;
}

interface RiskItem {
  id: string;
  title: string;
  detail: string;
  level: RiskLevel;
  targetView: string;
  targetContext?: NavigationContext;
  tag: string;
  due?: string;
}

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  targetView: string;
  targetContext?: NavigationContext;
  type: string;
}

interface DrilldownEntry {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  amount?: string;
  badge?: string;
  level?: RiskLevel;
  targetView: string;
  targetContext?: NavigationContext;
  dismissible?: boolean;
}

interface DrilldownState {
  title: string;
  subtitle: string;
  entries: DrilldownEntry[];
  emptyText: string;
}

const CHART_COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#34d399', '#f59e0b', '#fb7185'];
const MONEY_DEPARTMENTS = ['财务部', '总经办'];
const EXEC_DEPARTMENTS = ['财务部', '总经办'];
const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const daysBetween = (from: Date, to: Date) => {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((to.getTime() - from.getTime()) / dayMs);
};

const paymentDueStatusRank = (status: string) => {
  if (status === '已逾期') return 0;
  if (status === '临期') return 1;
  if (status === '计划中') return 2;
  return 3;
};

const formatCurrency = (amount: number) => {
  if (!Number.isFinite(amount)) return '¥0';
  if (Math.abs(amount) >= 100000000) return `¥${(amount / 100000000).toFixed(1)}亿`;
  if (Math.abs(amount) >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const receivableAmount = (payment: PaymentRecord) => {
  if ((payment.auditedAmount || 0) > 0) return payment.auditedAmount || 0;
  return (payment.contractAmount || 0) + (payment.variationAmount || 0);
};

const remainingAmount = (payment: PaymentRecord) => Math.max(receivableAmount(payment) - (payment.receivedAmount || 0), 0);

const getProjectContractDue = (project: Project) => {
  const date = parseDate(project.deadline);
  if (!date) return null;
  return {
    date,
    label: project.deadline,
    completionNode: getCompletionNode(project)
  };
};

const getRiskChart = (risks: RiskItem[]) => [
  { name: '工程', value: risks.filter(risk => ['工程超期', '临近验收', '低进度'].includes(risk.tag)).length },
  { name: '回款', value: risks.filter(risk => ['回款逾期', '回款临期'].includes(risk.tag)).length },
  { name: '生产', value: risks.filter(risk => ['生产缺失', '生产风险'].includes(risk.tag)).length },
  { name: '审批', value: risks.filter(risk => risk.tag === '审批超时').length },
  { name: '阻塞', value: risks.filter(risk => risk.tag === '节点阻塞').length }
].filter(item => item.value > 0);

const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const buildPaymentMonths = (count: number) => {
  const now = new Date();
  return [
    { key: 'overdue', label: '逾期' },
    ...Array.from({ length: count }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() + idx, 1);
      return {
        key: getMonthKey(date),
        label: `${date.getMonth() + 1}月`
      };
    })
  ];
};

const getApprovalUpdatedAt = (approval: Approval) => approval.updatedAt || approval.createdAt;

const getVisibleChannels = (
  channels: ChatChannel[],
  currentUser: User,
  visibleProjectIds: Set<string>,
  isGlobalUser: boolean
) => {
  if (isGlobalUser) return channels;
  return channels.filter(channel => {
    if (channel.type === 'General') return true;
    if (channel.participants?.includes(currentUser.id)) return true;
    if (channel.projectId && visibleProjectIds.has(channel.projectId)) return true;
    return false;
  });
};

const getVisibleData = (props: HomeDashboardProps) => {
  const { currentUser, users, projects, schedule, paymentRecords, productionData, approvals, archives, workLogs, channels, messages, announcements } = props;
  const isAdmin = currentUser.isDefaultAdmin || currentUser.role === 'Admin';
  const isExecutive = EXEC_DEPARTMENTS.includes(currentUser.department);
  const isDepartmentManager = currentUser.role === 'DeptManager';
  const isGlobalUser = isAdmin || isExecutive;
  const departmentNicknames = new Set(
    users.filter(user => user.department === currentUser.department).map(user => user.nickname)
  );
  departmentNicknames.add(currentUser.nickname);

  const visibleProjects = isGlobalUser
    ? projects
    : projects.filter(project => {
        if (project.manager === currentUser.nickname) return true;
        return isDepartmentManager && departmentNicknames.has(project.manager);
      });

  const visibleProjectIds = new Set(visibleProjects.map(project => project.id));
  const visibleProjectNames = new Set(visibleProjects.map(project => project.name));
  const canViewAllMoney = isAdmin || MONEY_DEPARTMENTS.includes(currentUser.department);
  const canViewOwnProjectMoney = visibleProjects.some(project => project.manager === currentUser.nickname) || isDepartmentManager;
  const canViewMoney = canViewAllMoney || canViewOwnProjectMoney;

  const visiblePayments = canViewAllMoney
    ? paymentRecords
    : paymentRecords.filter(payment => {
        if (payment.projectId && visibleProjectIds.has(payment.projectId)) return true;
        return visibleProjectNames.has(payment.projectName) || payment.managerName === currentUser.nickname;
      });

  const visibleProduction = isGlobalUser
    ? productionData
    : productionData.filter(item => visibleProjectIds.has(item.projectId));

  const visibleSchedule = isGlobalUser
    ? schedule
    : schedule.filter(item => {
        if (item.assignee === currentUser.nickname) return true;
        if (item.userId === currentUser.id) return true;
        return Boolean(item.projectId && visibleProjectIds.has(item.projectId));
      });

  const visibleApprovals = isGlobalUser
    ? approvals
    : approvals.filter(approval => {
        if (approval.applicantId === currentUser.id) return true;
        if (approval.approverIds.includes(currentUser.id)) return true;
        if (approval.versions?.some(version => version.outcomes.some(outcome => outcome.approverId === currentUser.id))) return true;
        return false;
      });

  const visibleArchives = isGlobalUser
    ? archives
    : archives.filter(archive => {
        if (archive.uploader === currentUser.nickname) return true;
        return Boolean(archive.projectId && visibleProjectIds.has(archive.projectId));
      });

  const visibleWorkLogs = isGlobalUser
    ? workLogs
    : workLogs.filter(log => {
        if (log.userId === currentUser.id || log.userName === currentUser.nickname) return true;
        return isDepartmentManager && departmentNicknames.has(log.userName);
      });

  const visibleChannels = getVisibleChannels(channels, currentUser, visibleProjectIds, isGlobalUser);
  const visibleChannelIds = new Set(visibleChannels.map(channel => channel.id));
  const visibleMessages = isGlobalUser
    ? messages
    : messages.filter(message => visibleChannelIds.has(message.channelId) || message.userId === currentUser.id);
  const visibleAnnouncements = isGlobalUser
    ? announcements
    : announcements.filter(announcement => !announcement.channelId || visibleChannelIds.has(announcement.channelId));

  return {
    isAdmin,
    isGlobalUser,
    canViewMoney,
    visibleProjects,
    visibleProjectIds,
    visiblePayments,
    visibleProduction,
    visibleSchedule,
    visibleApprovals,
    visibleArchives,
    visibleWorkLogs,
    visibleMessages,
    visibleAnnouncements
  };
};

const buildPendingApprovalCount = (approvals: Approval[], currentUser: User) => approvals.filter(approval => {
  if (approval.status !== 'Pending' || approval.applicantId === currentUser.id) return false;
  const outcomes = approval.versions?.[0]?.outcomes || [];
  const signedIds = outcomes.map(outcome => outcome.approverId);
  return approval.approverIds.includes(currentUser.id) && !signedIds.includes(currentUser.id);
}).length;

const buildDashboardModel = (props: HomeDashboardProps) => {
  const visible = getVisibleData(props);
  const today = startOfToday();
  const todayKey = today.toISOString().split('T')[0];
  const {
    canViewMoney,
    visibleProjects,
    visiblePayments,
    visibleProduction,
    visibleSchedule,
    visibleApprovals,
    visibleArchives,
    visibleWorkLogs,
    visibleMessages,
    visibleAnnouncements
  } = visible;

  const activeProjects = visibleProjects.filter(project => getProjectBusinessStatus(project) === 'Active');
  const pendingProjects = visibleProjects.filter(project => getProjectBusinessStatus(project) === 'Pending');
  const completedProjects = visibleProjects.filter(project => getProjectBusinessStatus(project) === 'Completed');
  const averageProgress = visibleProjects.length
    ? visibleProjects.reduce((sum, project) => sum + (project.progress || 0), 0) / visibleProjects.length
    : 0;

  const projectStatusChart = [
    { name: '在建', value: activeProjects.length },
    { name: '待启动', value: pendingProjects.length },
    { name: '已竣工', value: completedProjects.length }
  ].filter(item => item.value > 0);

  const productionItems = visibleProduction.flatMap(record => record.items.map(item => ({
    ...item,
    projectId: record.projectId,
    projectName: record.projectName
  })));
  const productionWaiting = productionItems.filter(item => item.status === 'Waiting').reduce((sum, item) => sum + (item.quantity || 0), 0);
  const productionInStock = productionItems.filter(item => item.status === 'InStock').reduce((sum, item) => sum + (item.quantity || 0), 0);
  const productionShipped = productionItems.filter(item => item.status === 'Shipped').reduce((sum, item) => sum + (item.quantity || 0), 0);
  const productionTotal = productionWaiting + productionInStock + productionShipped;
  const productionProjectSummaries = visibleProduction.map(record => {
    const waiting = record.items.filter(item => item.status === 'Waiting').reduce((sum, item) => sum + (item.quantity || 0), 0);
    const inStock = record.items.filter(item => item.status === 'InStock').reduce((sum, item) => sum + (item.quantity || 0), 0);
    const shipped = record.items.filter(item => item.status === 'Shipped').reduce((sum, item) => sum + (item.quantity || 0), 0);
    const total = waiting + inStock + shipped;
    return {
      projectId: record.projectId,
      projectName: record.projectName,
      waiting,
      inStock,
      shipped,
      total,
      completionRate: total > 0 ? (shipped / total) * 100 : 0
    };
  }).filter(item => item.total > 0);
  const productionWaitingProjects = productionProjectSummaries.filter(item => item.waiting > 0);
  const productionInStockProjects = productionProjectSummaries.filter(item => item.waiting === 0 && item.inStock > 0);
  const productionShippedProjects = productionProjectSummaries.filter(item => item.waiting === 0 && item.inStock === 0 && item.shipped > 0);
  const productionChart = [
    { name: '待生产', value: productionWaitingProjects.length },
    { name: '已入库', value: productionInStockProjects.length },
    { name: '已发货', value: productionShippedProjects.length }
  ].filter(item => item.value > 0);

  const receivableTotal = visiblePayments.reduce((sum, payment) => sum + receivableAmount(payment), 0);
  const receivedTotal = visiblePayments.reduce((sum, payment) => sum + (payment.receivedAmount || 0), 0);
  const remainingTotal = visiblePayments.reduce((sum, payment) => sum + remainingAmount(payment), 0);
  const invoicedUnpaid = visiblePayments.reduce((sum, payment) => sum + Math.max((payment.invoicedAmount || 0) - (payment.receivedAmount || 0), 0), 0);
  const paymentRate = receivableTotal > 0 ? (receivedTotal / receivableTotal) * 100 : 0;
  const paymentComposition = canViewMoney
    ? [
        { name: '已回款', value: receivedTotal },
        { name: '未回款', value: remainingTotal },
        { name: '开票未回款', value: invoicedUnpaid }
      ].filter(item => item.value > 0)
    : [];

  const paymentDueItems = visiblePayments
    .map(payment => {
      const dueDate = parseDate(payment.finalPaymentDueDate);
      const remaining = remainingAmount(payment);
      const receivable = receivableAmount(payment);
      const diff = dueDate ? daysBetween(today, dueDate) : null;
      return {
        payment,
        dueDate,
        dueKey: dueDate ? getMonthKey(dueDate) : 'unknown',
        receivable,
        received: payment.receivedAmount || 0,
        remaining,
        diff,
        status: diff === null ? '未设置到期日' : diff < 0 ? '已逾期' : diff <= 15 ? '临期' : '计划中'
      };
    })
    .filter(item => item.remaining > 0)
    .sort((a, b) => {
      const rankDiff = paymentDueStatusRank(a.status) - paymentDueStatusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.dueDate?.getTime() || Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate?.getTime() || Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return b.remaining - a.remaining;
    });

  const paymentMonths = buildPaymentMonths(6);
  const paymentTrend = paymentMonths.map(month => {
    const items = paymentDueItems.filter(item => {
      if (!item.dueDate) return false;
      if (month.key === 'overdue') return item.dueDate < today;
      return item.dueKey === month.key;
    });
    return {
      month: month.label,
      monthKey: month.key,
      dueAmount: items.reduce((sum, item) => sum + item.remaining, 0),
      itemCount: items.length,
      items
    };
  });

  const todaySchedule = visibleSchedule.filter(item => item.date === todayKey && !item.isCompleted);
  const upcomingSchedule = visibleSchedule.filter(item => {
    const date = parseDate(item.date);
    if (!date || item.isCompleted) return false;
    const diff = daysBetween(today, date);
    return diff >= 0 && diff <= 7;
  });
  const pendingApprovalsForUser = buildPendingApprovalCount(props.approvals, props.currentUser);
  const pendingApprovalItems = props.approvals.filter(approval => {
    if (approval.status !== 'Pending' || approval.applicantId === props.currentUser.id) return false;
    const outcomes = approval.versions?.[0]?.outcomes || [];
    const signedIds = outcomes.map(outcome => outcome.approverId);
    return approval.approverIds.includes(props.currentUser.id) && !signedIds.includes(props.currentUser.id);
  });

  const risks: RiskItem[] = [];

  visibleProjects.forEach(project => {
    const contractDue = getProjectContractDue(project);
    const completionNodeDone = isCompletionNodeDone(project);
    const delivered = isProjectDelivered(project);
    const contractStarted = isProjectContractStarted(project);
    if (contractDue && contractStarted && !completionNodeDone && !delivered) {
      const diff = daysBetween(today, contractDue.date);
      const nodeLabel = contractDue.completionNode?.title || '竣工/验收节点';
      if (diff < 0) {
        risks.push({
          id: `project-overdue-${project.id}`,
          title: project.name,
          detail: `合同约定时间已超 ${Math.abs(diff)} 天，${nodeLabel}未完成，当前进度 ${project.progress || 0}%`,
          level: 'critical',
          targetView: 'projects',
          targetContext: { projectId: project.id },
          tag: '工程超期',
          due: contractDue.label
        });
      } else if (diff <= 7) {
        risks.push({
          id: `project-due-${project.id}`,
          title: project.name,
          detail: `${diff === 0 ? '今天' : `${diff} 天后`}到合同约定时间，${nodeLabel}未完成`,
          level: 'warning',
          targetView: 'projects',
          targetContext: { projectId: project.id },
          tag: '临近验收',
          due: contractDue.label
        });
      }
    }

    const start = parseDate(project.startDate);
    if (start && getProjectBusinessStatus(project) === 'Active' && !delivered) {
      const runningDays = daysBetween(start, today);
      if (runningDays > 30 && (project.progress || 0) < 30) {
        risks.push({
          id: `project-low-progress-${project.id}`,
          title: project.name,
          detail: `已启动 ${runningDays} 天，进度低于 30%`,
          level: 'warning',
          targetView: 'projects',
          targetContext: { projectId: project.id },
          tag: '低进度',
          due: project.deadline
        });
      }
    }

    project.nodes?.forEach(node => {
      if (node.status === TaskStatus.BLOCKED) {
        risks.push({
          id: `node-blocked-${project.id}-${node.id}`,
          title: project.name,
          detail: `${node.title} 已阻塞`,
          level: 'critical',
          targetView: 'projects',
          targetContext: { projectId: project.id },
          tag: '节点阻塞',
          due: node.deadline
        });
      }
    });
  });

  visiblePayments.forEach(payment => {
    const dueDate = parseDate(payment.finalPaymentDueDate);
    const remaining = remainingAmount(payment);
    if (!dueDate || remaining <= 0) return;
    const diff = daysBetween(today, dueDate);
    if (diff < 0) {
      risks.push({
        id: `payment-overdue-${payment.id}`,
        title: payment.projectName,
        detail: canViewMoney ? `尾款逾期 ${Math.abs(diff)} 天，未回款 ${formatCurrency(remaining)}` : `尾款逾期 ${Math.abs(diff)} 天`,
        level: 'critical',
        targetView: 'payments',
        targetContext: { paymentId: payment.id, projectId: payment.projectId },
        tag: '回款逾期',
        due: payment.finalPaymentDueDate
      });
    } else if (diff <= 15) {
      risks.push({
        id: `payment-due-${payment.id}`,
        title: payment.projectName,
        detail: canViewMoney ? `${diff} 天内到期，未回款 ${formatCurrency(remaining)}` : `${diff} 天内到期，存在未回款风险`,
        level: 'warning',
        targetView: 'payments',
        targetContext: { paymentId: payment.id, projectId: payment.projectId },
        tag: '回款临期',
        due: payment.finalPaymentDueDate
      });
    }
  });

  visibleProjects.forEach(project => {
    const contractDue = getProjectContractDue(project);
    if (!contractDue || !isProjectContractStarted(project) || isProjectDelivered(project)) return;
    const diff = daysBetween(today, contractDue.date);
    if (diff < 0 || diff > 15) return;
    const production = visibleProduction.find(record => record.projectId === project.id);
    const nodeLabel = contractDue.completionNode?.title || '竣工/验收节点';
    if (!production || production.items.length === 0) {
      risks.push({
        id: `production-missing-${project.id}`,
        title: project.name,
        detail: `临近合同约定时间，${nodeLabel}未完成且没有生产记录`,
        level: 'warning',
        targetView: 'production',
        targetContext: { productionProjectId: project.id },
        tag: '生产缺失',
        due: contractDue.label
      });
      return;
    }
    const waitingCount = production.items.filter(item => item.status === 'Waiting').reduce((sum, item) => sum + (item.quantity || 0), 0);
    if (waitingCount > 0) {
      risks.push({
        id: `production-risk-${project.id}`,
        title: project.name,
        detail: `临近合同约定时间，仍有 ${waitingCount} 件待生产`,
        level: 'warning',
        targetView: 'production',
        targetContext: { productionProjectId: project.id },
        tag: '生产风险',
        due: contractDue.label
      });
    }
  });

  visibleApprovals.forEach(approval => {
    if (approval.status !== 'Pending') return;
    const updatedAt = parseDate(getApprovalUpdatedAt(approval));
    if (!updatedAt) return;
    const pendingDays = daysBetween(updatedAt, new Date());
    if (pendingDays > 3) {
      risks.push({
        id: `approval-timeout-${approval.id}`,
        title: approval.title,
        detail: `审批已停留 ${pendingDays} 天`,
        level: 'warning',
        targetView: 'approvals',
        tag: '审批超时',
        due: getApprovalUpdatedAt(approval)
      });
    }
  });

  const riskChart = getRiskChart(risks);

  const recentActivities: ActivityItem[] = [
    ...visibleProjects.map(project => ({
      id: `project-${project.id}`,
      title: project.name,
      detail: `${project.manager || '未指定'} 负责，进度 ${project.progress || 0}%`,
      time: project.createdAt || project.startDate || '',
      targetView: 'projects',
      targetContext: { projectId: project.id },
      type: '新增工程'
    })),
    ...visibleArchives.map(archive => ({
      id: `archive-${archive.id}`,
      title: archive.title,
      detail: `${archive.projectName} · ${archive.uploader}`,
      time: archive.createdAt || archive.uploadDate || '',
      targetView: 'archives',
      targetContext: { projectId: archive.projectId },
      type: '档案上传'
    })),
    ...visibleApprovals.map(approval => ({
      id: `approval-${approval.id}`,
      title: approval.title,
      detail: `${approval.applicantName} · ${approval.status}`,
      time: getApprovalUpdatedAt(approval),
      targetView: 'approvals',
      type: '审批更新'
    })),
    ...visiblePayments.map(payment => ({
      id: `payment-${payment.id}`,
      title: payment.projectName,
      detail: canViewMoney ? `已回款 ${formatCurrency(payment.receivedAmount || 0)}` : '回款状态有更新',
      time: payment.createdAt || payment.finalPaymentDueDate || '',
      targetView: 'payments',
      targetContext: { paymentId: payment.id, projectId: payment.projectId },
      type: '回款更新'
    })),
    ...visibleWorkLogs.map(log => ({
      id: `worklog-${log.id}`,
      title: log.userName,
      detail: log.content,
      time: log.createdAt || log.date || '',
      targetView: 'worklogs',
      type: '工作日志'
    })),
    ...visibleAnnouncements.map(announcement => ({
      id: `announcement-${announcement.id}`,
      title: announcement.isPinned ? '置顶公告' : '团队公告',
      detail: announcement.content,
      time: announcement.createdAt || '',
      targetView: 'chat',
      type: '公告'
    }))
  ]
    .filter(activity => Boolean(activity.time))
    .sort((a, b) => (parseDate(b.time)?.getTime() || 0) - (parseDate(a.time)?.getTime() || 0))
    .slice(0, 10);

  const activityTrend = Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - idx));
    const key = day.toISOString().split('T')[0];
    const label = `${day.getMonth() + 1}/${day.getDate()}`;
    const count = [
      ...visibleProjects.map(project => project.createdAt || project.startDate),
      ...visibleArchives.map(archive => archive.createdAt || archive.uploadDate),
      ...visibleApprovals.map(getApprovalUpdatedAt),
      ...visibleWorkLogs.map(log => log.createdAt || log.date),
      ...visibleMessages.map(message => message.timestamp)
    ].filter(value => value?.startsWith(key)).length;
    return { day: label, value: count };
  });

  return {
    ...visible,
    todaySchedule,
    upcomingSchedule,
    pendingApprovalsForUser,
    pendingApprovalItems,
    activeProjects,
    pendingProjects,
    completedProjects,
    averageProgress,
    projectStatusChart,
    productionWaiting,
    productionInStock,
    productionShipped,
    productionTotal,
    productionItems,
    productionChart,
    productionProjectSummaries,
    productionWaitingProjects,
    productionInStockProjects,
    productionShippedProjects,
    productionCompletionRate: productionProjectSummaries.length > 0 ? productionProjectSummaries.reduce((sum, item) => sum + item.completionRate, 0) / productionProjectSummaries.length : 0,
    receivableTotal,
    receivedTotal,
    remainingTotal,
    invoicedUnpaid,
    paymentRate,
    paymentComposition,
    paymentDueItems,
    paymentTrend,
    risks: risks.sort((a, b) => {
      const levelOrder: Record<RiskLevel, number> = { critical: 0, warning: 1, info: 2 };
      return levelOrder[a.level] - levelOrder[b.level];
    }),
    riskChart,
    recentActivities,
    activityTrend,
    topTodoCount: todaySchedule.length + pendingApprovalsForUser + props.chatUnreadCount
  };
};

const MetricCard: React.FC<{
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';
  onClick?: () => void;
}> = ({ title, value, subtitle, icon, tone, onClick }) => {
  const toneMap = {
    cyan: 'from-cyan-50 to-sky-50 text-cyan-700 border-cyan-200 dark:from-cyan-400/25 dark:to-sky-500/5 dark:text-cyan-200 dark:border-cyan-300/20',
    violet: 'from-violet-50 to-indigo-50 text-violet-700 border-violet-200 dark:from-violet-400/25 dark:to-indigo-500/5 dark:text-violet-200 dark:border-violet-300/20',
    emerald: 'from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200 dark:from-emerald-400/25 dark:to-teal-500/5 dark:text-emerald-200 dark:border-emerald-300/20',
    amber: 'from-amber-50 to-orange-50 text-amber-700 border-amber-200 dark:from-amber-400/25 dark:to-orange-500/5 dark:text-amber-200 dark:border-amber-300/20',
    rose: 'from-rose-50 to-red-50 text-rose-700 border-rose-200 dark:from-rose-400/25 dark:to-red-500/5 dark:text-rose-200 dark:border-rose-300/20'
  };
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-2xl border bg-gradient-to-br ${toneMap[tone]} bg-white p-4 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] dark:bg-slate-950/65 dark:hover:border-white/25 dark:hover:bg-slate-900/85`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-inner dark:border-white/10 dark:bg-white/10 dark:text-white">
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-slate-700 dark:text-white/30 dark:group-hover:text-white" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-white/45">{title}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-white/45">{subtitle}</p>
    </button>
  );
};

const Panel: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70 ${className}`}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-200">{icon}</div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
    {children}
  </section>
);

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-black text-slate-400 dark:border-white/10 dark:bg-slate-950/25 dark:text-slate-500">
    {label}
  </div>
);

const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const map = {
    critical: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-300/20',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-300/20',
    info: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-300/20'
  };
  const label = {
    critical: '高',
    warning: '中',
    info: '低'
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${map[level]}`}>{label[level]}</span>;
};

const DetailDrawer: React.FC<{
  state: DrilldownState | null;
  onClose: () => void;
  onNavigate: (view: string, context?: NavigationContext) => void;
  onDismissRisk: (id: string) => void;
}> = ({ state, onClose, onNavigate, onDismissRisk }) => {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-3 backdrop-blur-sm dark:bg-slate-950/70 md:items-center md:p-8">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200 dark:border-cyan-300/20 dark:bg-slate-950 dark:text-white dark:shadow-cyan-950/40 dark:ring-white/10">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.06]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-700 dark:text-cyan-200">明细下钻</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{state.title}</h3>
            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">{state.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-5">
          {state.entries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm font-black text-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-500">{state.emptyText}</div>
          ) : (
            <div className="space-y-3">
              {state.entries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => { onNavigate(entry.targetView, { ...entry.targetContext, ...(entry.targetView === 'projects' ? { returnToHomeDrilldown: state } : {}) }); onClose(); }}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/[0.05] dark:shadow-none dark:hover:border-cyan-300/30 dark:hover:bg-cyan-300/10"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {entry.level && <RiskBadge level={entry.level} />}
                        {entry.badge && <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:bg-white/10 dark:text-cyan-100">{entry.badge}</span>}
                        {entry.meta && <span className="text-[10px] font-black text-slate-500">{entry.meta}</span>}
                      </div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">{entry.title}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-600 dark:text-slate-400">{entry.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {entry.amount && <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">{entry.amount}</span>}
                      {entry.dismissible && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); onDismissRisk(entry.id); }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              onDismissRisk(entry.id);
                            }
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none dark:hover:border-rose-300/30 dark:hover:bg-rose-300/10 dark:hover:text-rose-100"
                        >
                          不再提醒
                        </span>
                      )}
                      <ArrowRight className="h-4 w-4 text-slate-400 dark:text-white/30" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const HomeDashboard: React.FC<HomeDashboardProps> = props => {
  const model = useMemo(() => buildDashboardModel(props), [props]);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const riskStorageKey = `ierp_home_hidden_risks_${props.currentUser.id}`;
  const [hiddenRiskIds, setHiddenRiskIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(riskStorageKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      setHiddenRiskIds(new Set(JSON.parse(localStorage.getItem(riskStorageKey) || '[]')));
    } catch {
      setHiddenRiskIds(new Set());
    }
  }, [riskStorageKey]);
  useEffect(() => {
    if (!props.restoreDrilldown) return;
    setDrilldown(props.restoreDrilldown);
    props.onRestoreDrilldownConsumed?.();
  }, [props.restoreDrilldown, props.onRestoreDrilldownConsumed]);

  const visibleRisks = useMemo(() => model.risks.filter(risk => !hiddenRiskIds.has(risk.id)), [model.risks, hiddenRiskIds]);
  const visibleRiskChart = useMemo(() => getRiskChart(visibleRisks), [visibleRisks]);
  const dismissRisk = (id: string) => {
    setHiddenRiskIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(riskStorageKey, JSON.stringify(Array.from(next)));
      return next;
    });
    setDrilldown(current => current ? { ...current, entries: current.entries.filter(entry => entry.id !== id) } : current);
  };
  const restoreHiddenRisks = () => {
    localStorage.removeItem(riskStorageKey);
    setHiddenRiskIds(new Set());
  };
  const paymentRiskCount = visibleRisks.filter(risk => risk.tag.includes('回款')).length;
  const moneyLabel = model.canViewMoney ? formatCurrency(model.remainingTotal) : `${paymentRiskCount} 项`;
  const moneySubtitle = model.canViewMoney
    ? `回款率 ${formatPercent(model.paymentRate)} · 开票未回 ${formatCurrency(model.invoicedUnpaid)}`
    : '按权限隐藏金额，仅显示风险数量';

  const showDetails = (state: DrilldownState) => setDrilldown(state);
  const projectEntries = (items: Project[]): DrilldownEntry[] => items.map(project => {
    const completionNode = getCompletionNode(project);
    return {
      id: project.id,
      title: project.name,
      detail: `${project.clientName} · ${project.manager || '未指定负责人'} · 当前进度 ${project.progress || 0}%`,
      meta: `合同 ${project.deadline || '未设置'} · ${completionNode ? `${completionNode.title}${completionNode.status === TaskStatus.COMPLETED ? '已完成' : '未完成'}` : '未设置竣工/验收节点'}`,
      badge: getProjectBusinessStatus(project) === 'Active' ? '在建' : getProjectBusinessStatus(project) === 'Pending' ? '待启动' : '已竣工',
      targetView: 'projects',
      targetContext: { projectId: project.id }
    };
  });
  const riskEntries = (items: RiskItem[]): DrilldownEntry[] => items.map(risk => ({
    id: risk.id,
    title: risk.title,
    detail: risk.detail,
    meta: risk.due ? `日期 ${risk.due}` : undefined,
    badge: risk.tag,
    level: risk.level,
    targetView: risk.targetView,
    targetContext: risk.targetContext,
    dismissible: true
  }));
  const paymentEntries = (items: typeof model.paymentDueItems): DrilldownEntry[] => items.map(item => ({
    id: item.payment.id,
    title: item.payment.projectName,
    detail: model.canViewMoney
      ? `应收 ${formatCurrency(item.receivable)}，已回 ${formatCurrency(item.received)}，未回 ${formatCurrency(item.remaining)}`
      : `存在未回款风险，金额按当前账号权限隐藏`,
    meta: `尾款到期 ${item.payment.finalPaymentDueDate || '未设置'}`,
    badge: item.status,
    amount: model.canViewMoney ? formatCurrency(item.remaining) : undefined,
    level: item.status === '已逾期' ? 'critical' : item.status === '临期' ? 'warning' : 'info',
    targetView: 'payments',
    targetContext: { paymentId: item.payment.id, projectId: item.payment.projectId }
  }));
  const productionEntries = (status: 'Waiting' | 'InStock' | 'Shipped'): DrilldownEntry[] => {
    const list = status === 'Waiting'
      ? model.productionWaitingProjects
      : status === 'InStock'
        ? model.productionInStockProjects
        : model.productionShippedProjects;
    return list.map(item => ({
      id: item.projectId,
      title: item.projectName,
      detail: `待生产 ${item.waiting} · 已入库 ${item.inStock} · 已发货 ${item.shipped}`,
      meta: `设备合计 ${item.total} · 完成率 ${formatPercent(item.completionRate)}`,
      badge: status === 'Waiting' ? '有待生产' : status === 'InStock' ? '已入库未发完' : '已发货',
      targetView: 'production',
      targetContext: { productionProjectId: item.projectId }
    }));
  };
  const todoEntries = (): DrilldownEntry[] => [
    ...model.todaySchedule.map(item => ({
      id: `schedule-${item.id}`,
      title: item.title,
      detail: `${item.time} · ${item.type}`,
      meta: item.date,
      badge: '今日日程',
      targetView: 'schedule'
    })),
    ...model.pendingApprovalItems.map(approval => ({
      id: `approval-${approval.id}`,
      title: approval.title,
      detail: `${approval.applicantName} 发起 · ${approval.approverNamesDisplay}`,
      meta: getApprovalUpdatedAt(approval),
      badge: '待我审批',
      targetView: 'approvals'
    })),
    ...(props.chatUnreadCount > 0 ? [{
      id: 'chat-unread',
      title: '未读消息',
      detail: `当前有 ${props.chatUnreadCount} 条未读聊天消息`,
      badge: '团队沟通',
      targetView: 'chat'
    }] : [])
  ];

  const openPaymentMonth = (month: string) => {
    const item = model.paymentTrend.find(entry => entry.month === month);
    if (!item) return;
    showDetails({
      title: `${month}应回款明细`,
      subtitle: model.canViewMoney ? `本月应回 ${formatCurrency(item.dueAmount)}，共 ${item.itemCount} 个项目` : `本月有 ${item.itemCount} 个回款风险项目`,
      entries: paymentEntries(item.items),
      emptyText: '该月份没有需要回款的项目'
    });
  };

  return (
    <div className="min-h-full rounded-[1.5rem] bg-slate-50 text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-white dark:ring-white/10">
      <div className="relative overflow-hidden rounded-[1.5rem]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(226,232,240,0.88))] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,1))]" />
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        <div className="relative p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100">
                <RadioTower className="h-3.5 w-3.5" />
                首页总览
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl dark:text-white">
                {model.isGlobalUser ? '经营首页' : '我的首页'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-5 text-slate-600 dark:text-slate-400">
                当前看板按账号权限展示。视图：
                <span className="text-cyan-700 dark:text-cyan-200">{model.isGlobalUser ? '全局可见数据' : '个人/部门可见数据'}</span>
                ，金额：
                <span className="text-cyan-700 dark:text-cyan-200">{model.canViewMoney ? '可见' : '隐藏'}</span>。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-inner dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <span>{props.currentUser.nickname}</span>
                <span className="text-slate-400 dark:text-slate-500">/</span>
                <span>{props.currentUser.department}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="在建工程"
              value={`${model.activeProjects.length}`}
              subtitle={`待启动 ${model.pendingProjects.length} · 已竣工 ${model.completedProjects.length}`}
              icon={<Briefcase className="h-5 w-5" />}
              tone="cyan"
              onClick={() => showDetails({ title: '在建工程明细', subtitle: '当前账号可见范围内的在建工程', entries: projectEntries(model.activeProjects), emptyText: '当前没有在建工程' })}
            />
            <MetricCard
              title="今日待办"
              value={`${model.topTodoCount}`}
              subtitle={`今日日程 ${model.todaySchedule.length} · 待我审批 ${model.pendingApprovalsForUser}`}
              icon={<CalendarDays className="h-5 w-5" />}
              tone="violet"
              onClick={() => showDetails({ title: '今日待办明细', subtitle: '今日日程、待我审批和未读消息', entries: todoEntries(), emptyText: '今天没有待办事项' })}
            />
            <MetricCard
              title="风险预警"
              value={`${visibleRisks.length}`}
              subtitle={`高风险 ${visibleRisks.filter(risk => risk.level === 'critical').length} · 需跟进 ${visibleRisks.filter(risk => risk.level === 'warning').length}`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={visibleRisks.some(risk => risk.level === 'critical') ? 'rose' : 'amber'}
              onClick={() => showDetails({ title: '风险预警明细', subtitle: '所有风险数字的来源项目和原因，可对单条风险选择不再提醒', entries: riskEntries(visibleRisks), emptyText: '当前没有风险预警' })}
            />
            <MetricCard
              title={model.canViewMoney ? '未回款金额' : '回款风险'}
              value={moneyLabel}
              subtitle={moneySubtitle}
              icon={<Wallet className="h-5 w-5" />}
              tone="emerald"
              onClick={() => showDetails({ title: model.canViewMoney ? '未回款明细' : '回款风险明细', subtitle: model.canViewMoney ? '按尾款到期日汇总的未回款项目' : '当前账号可见的回款风险项目，金额已隐藏', entries: paymentEntries(model.paymentDueItems), emptyText: '当前没有未回款项目' })}
            />
          </div>

          {hiddenRiskIds.size > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
              <span>已隐藏 {hiddenRiskIds.size} 条首页风险提醒</span>
              <button onClick={restoreHiddenRisks} className="rounded-full border border-cyan-200 px-3 py-1 text-cyan-700 transition hover:bg-cyan-50 dark:border-white/10 dark:text-cyan-100 dark:hover:bg-cyan-300/10">恢复全部</button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Panel title="工程概览" subtitle={`平均进度 ${formatPercent(model.averageProgress)}，按可见工程统计`} icon={<Activity className="h-5 w-5" />} className="xl:col-span-4">
              {model.projectStatusChart.length ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={model.projectStatusChart} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={5} onClick={(entry: any) => { const list = entry?.name === '在建' ? model.activeProjects : entry?.name === '待启动' ? model.pendingProjects : model.completedProjects; showDetails({ title: `${entry?.name || '工程'}明细`, subtitle: '点击明细可进入工程项目模块', entries: projectEntries(list), emptyText: '暂无工程' }); }}>
                        {model.projectStatusChart.map((_, index) => (
                          <Cell key={`project-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value} 个项目`} contentStyle={{ background: '#020617', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart label="暂无工程数据" />}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ['在建', model.activeProjects.length, 'text-cyan-200'],
                  ['待启动', model.pendingProjects.length, 'text-violet-200'],
                  ['已竣工', model.completedProjects.length, 'text-emerald-200']
                ].map(([label, value, cls]) => (
                  <button key={label} onClick={() => { const list = label === '在建' ? model.activeProjects : label === '待启动' ? model.pendingProjects : model.completedProjects; showDetails({ title: `${label}工程明细`, subtitle: '当前账号可见范围内的数据', entries: projectEntries(list), emptyText: `暂无${label}工程` }); }} className="rounded-xl bg-slate-50 p-2 text-center transition hover:bg-cyan-50 dark:bg-slate-950/40 dark:hover:bg-cyan-300/10">
                    <p className={`text-xl font-black ${cls}`}>{value}</p>
                    <p className="mt-1 text-[10px] font-black text-slate-500">{label}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title={model.canViewMoney ? '应回款计划' : '回款风险计划'} subtitle={model.canViewMoney ? '逾期及未来 6 个月应回款金额，点击月份看项目' : '逾期及未来 6 个月风险项目数，点击月份看项目'} icon={<CreditCard className="h-5 w-5" />} className="xl:col-span-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={model.paymentTrend} onClick={(event: any) => event?.activeLabel && openPaymentMonth(event.activeLabel)}>
                    <defs>
                      <linearGradient id="paymentGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="month" stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis allowDecimals={model.canViewMoney} stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} tickFormatter={value => model.canViewMoney ? `${Math.round(Number(value) / 10000)}万` : String(value)} />
                    <Tooltip formatter={(value: number) => model.canViewMoney ? formatCurrency(value) : `${value} 项`} labelFormatter={(label) => `${label} 应回款`} contentStyle={{ background: '#020617', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', color: '#fff' }} />
                    <Area type="monotone" dataKey={model.canViewMoney ? 'dueAmount' : 'itemCount'} name={model.canViewMoney ? '应回款' : '风险项目'} stroke="#22d3ee" strokeWidth={3} fill="url(#paymentGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="生产状态" subtitle={`项目平均完成率 ${formatPercent(model.productionCompletionRate)}，按工程项目汇总`} icon={<Factory className="h-5 w-5" />} className="xl:col-span-4">
              {model.productionChart.length ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={model.productionChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={4} onClick={(entry: any) => { const status = entry?.name === '待生产' ? 'Waiting' : entry?.name === '已入库' ? 'InStock' : 'Shipped'; showDetails({ title: `${entry?.name || '生产'}明细`, subtitle: '按设备数量状态下钻', entries: productionEntries(status), emptyText: '暂无生产明细' }); }}>
                        {model.productionChart.map((_, index) => (
                          <Cell key={`production-${index}`} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#020617', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart label="暂无生产数据" />}
              <div className="mt-3 space-y-2">
                {[
                  ['待生产', model.productionWaitingProjects.length, 'bg-amber-300'],
                  ['已入库', model.productionInStockProjects.length, 'bg-sky-300'],
                  ['已发货', model.productionShippedProjects.length, 'bg-emerald-300']
                ].map(([label, value, cls]) => (
                  <button key={label} onClick={() => { const status = label === '待生产' ? 'Waiting' : label === '已入库' ? 'InStock' : 'Shipped'; showDetails({ title: `${label}生产明细`, subtitle: '按设备数量状态下钻', entries: productionEntries(status), emptyText: `暂无${label}记录` }); }} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-black transition hover:bg-cyan-50 dark:bg-slate-950/35 dark:hover:bg-cyan-300/10">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><span className={`h-2.5 w-2.5 rounded-full ${cls}`} />{label}</span>
                    <span className="text-slate-950 dark:text-white">{value}</span>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Panel title="风险分布" subtitle="按工程、回款、生产、审批和阻塞分类" icon={<Zap className="h-5 w-5" />} className="xl:col-span-4">
              {visibleRiskChart.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visibleRiskChart} onClick={(event: any) => { const name = event?.activeLabel; if (!name) return; const map: Record<string, string[]> = { 工程: ['工程超期', '临近验收', '低进度'], 回款: ['回款逾期', '回款临期'], 生产: ['生产缺失', '生产风险'], 审批: ['审批超时'], 阻塞: ['节点阻塞'] }; const tags = map[name] || []; const items = visibleRisks.filter(risk => tags.includes(risk.tag)); showDetails({ title: `${name}风险明细`, subtitle: '点击明细可进入对应模块处理，可对单条风险选择不再提醒', entries: riskEntries(items), emptyText: `暂无${name}风险` }); }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                      <Tooltip contentStyle={{ background: '#020617', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', color: '#fff' }} />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                        {visibleRiskChart.map((_, index) => (
                          <Cell key={`risk-${index}`} fill={CHART_COLORS[(index + 1) % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart label="当前没有风险预警" />}
            </Panel>

            <Panel title="未来 7 天待办" subtitle="日程、审批和消息统一放在待办区" icon={<Clock className="h-5 w-5" />} className="xl:col-span-4">
              <div className="space-y-3">
                {model.upcomingSchedule.slice(0, 6).map(item => (
                  <button key={item.id} onClick={() => props.onNavigate('schedule')} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-950/35 dark:hover:border-cyan-300/30 dark:hover:bg-cyan-300/10">
                    <div className="flex items-center justify-between gap-3">
                      <p className="line-clamp-1 text-sm font-black text-slate-950 dark:text-white">{item.title}</p>
                      <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-200">{item.date}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-500">{item.time} · {item.type}</p>
                  </button>
                ))}
                {model.upcomingSchedule.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs font-black text-slate-400 dark:border-white/10 dark:bg-slate-950/25 dark:text-slate-500">未来 7 天暂无待办</div>
                )}
                {(model.pendingApprovalsForUser > 0 || props.chatUnreadCount > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => props.onNavigate('approvals')} className="rounded-2xl bg-violet-50 p-4 text-left text-xs font-black text-violet-700 dark:bg-violet-300/10 dark:text-violet-100">
                      待我审批 <span className="block pt-2 text-2xl text-slate-950 dark:text-white">{model.pendingApprovalsForUser}</span>
                    </button>
                    <button onClick={() => props.onNavigate('chat')} className="rounded-2xl bg-cyan-50 p-4 text-left text-xs font-black text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-100">
                      未读消息 <span className="block pt-2 text-2xl text-slate-950 dark:text-white">{props.chatUnreadCount}</span>
                    </button>
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="近 7 天动态" subtitle="工程、档案、审批、日志和消息活跃度" icon={<TrendingUp className="h-5 w-5" />} className="xl:col-span-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.activityTrend}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis dataKey="day" stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip contentStyle={{ background: '#020617', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', color: '#fff' }} />
                    <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={3} dot={{ r: 4, fill: '#a78bfa' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="风险预警列表" subtitle="优先展示高风险，点击跳到对应模块" icon={<AlertTriangle className="h-5 w-5" />}>
              <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                {visibleRisks.slice(0, 10).map(risk => (
                  <button key={risk.id} onClick={() => props.onNavigate(risk.targetView, risk.targetContext)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-rose-300 hover:bg-rose-50 dark:border-white/10 dark:bg-slate-950/35 dark:hover:border-rose-300/30 dark:hover:bg-rose-300/10">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <RiskBadge level={risk.level} />
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-black text-slate-300">{risk.tag}</span>
                        </div>
                        <p className="text-sm font-black text-slate-950 dark:text-white">{risk.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">{risk.detail}</p>
                      </div>
                      <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => { event.stopPropagation(); dismissRisk(risk.id); }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              dismissRisk(risk.id);
                            }
                          }}
                          className="mt-1 shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-300/30 dark:hover:bg-rose-300/10 dark:hover:text-rose-100"
                        >
                          不再提醒
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 dark:text-white/25" />
                    </div>
                  </button>
                ))}
                {visibleRisks.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-white/10 dark:bg-slate-950/25">
                    <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-300" />
                    <p className="text-sm font-black text-slate-300">当前可见范围内没有风险预警</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="最近动态" subtitle="只展示当前账号有权限看到的动态" icon={<Bell className="h-5 w-5" />}>
              <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                {model.recentActivities.map(activity => (
                  <button key={activity.id} onClick={() => props.onNavigate(activity.targetView, activity.targetContext)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-950/35 dark:hover:border-cyan-300/30 dark:hover:bg-cyan-300/10">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-cyan-50 p-2 text-cyan-700 dark:bg-white/10 dark:text-cyan-200">
                        {activity.type.includes('档案') ? <FileText className="h-4 w-4" /> : activity.type.includes('公告') ? <MessageSquare className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-black text-slate-950 dark:text-white">{activity.title}</p>
                          <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-black text-slate-400">{activity.type}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-400">{activity.detail}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {model.recentActivities.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-white/10 dark:bg-slate-950/25 text-sm font-black text-slate-500">暂无最近动态</div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <DetailDrawer
        state={drilldown}
        onClose={() => setDrilldown(null)}
        onNavigate={props.onNavigate}
        onDismissRisk={dismissRisk}
      />
    </div>
  );
};

export default HomeDashboard;

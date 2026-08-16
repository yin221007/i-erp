import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PORT = 3000;
const HOST = '127.0.0.1';

const previewUser = {
  id: 'preview-admin',
  nickname: '预览管理员',
  department: '总经办',
  role: 'Admin',
  permission: 'ReadWrite',
  isDefaultAdmin: true,
  avatar: '',
  preferences: {
    enableBrowser: true,
    sound: false,
    themeColor: 'blue',
    fontSize: 'medium',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
    numberFormat: {
      decimalPlaces: 2,
      useThousandsSeparator: true,
      currencySymbol: '¥'
    },
    weatherLocation: { mode: 'manual', city: '上海' },
    types: { chat: true, approval: true, task: true, system: true }
  }
};

const phases = [
  '前期对接 & 设计',
  '生产准备',
  '进场施工',
  '安装调试',
  '验收交付',
  '结算收尾'
];

const nodes = phases.flatMap((phase, phaseIndex) => [
  {
    id: `node-${phaseIndex + 1}-1`,
    title: [
      '现场测量与点位复核',
      '设备排产确认',
      '烟罩与风管安装',
      '设备通电联调',
      '竣工验收记录',
      '结算资料归集'
    ][phaseIndex],
    description: '预览环境任务节点',
    phase,
    status: phaseIndex < 2 ? 'COMPLETED' : phaseIndex === 2 ? 'IN_PROGRESS' : 'PENDING',
    attachments: [],
    memos: [],
    isKeyNode: true,
    assignee: '预览管理员'
  }
]);

const previewProject = {
  id: 'preview-project',
  name: '全过程影像功能预览工程',
  code: 'PREVIEW-001',
  clientName: '预览客户',
  manager: '预览管理员',
  startDate: '2026-06-01',
  deadline: '2026-09-30',
  status: 'Active',
  progress: 42,
  nodes,
  keyRisks: '本环境仅用于界面预览，不连接生产数据。',
  currentPhaseDeadline: '2026-08-15',
  createdAt: '2026-06-01T00:00:00.000Z'
};

const previewInvoiceAttachments = [
  {
    id: 'invoice-legacy-node-only',
    name: '历史节点发票.png',
    url: '/api/preview-media/invoice-legacy-node-only-2563eb.png',
    uploadDate: '2026-07-24T08:30:00.000Z',
    type: 'image/png',
    size: '1.2 MB',
    category: 'Invoice'
  },
  {
    id: 'invoice-formal-1',
    name: '设备采购发票一.png',
    url: '/api/preview-media/invoice-formal-1-0f766e.png',
    uploadDate: '2026-07-25T08:30:00.000Z',
    type: 'image/png',
    size: '1.4 MB',
    category: 'Invoice'
  },
  {
    id: 'invoice-formal-2',
    name: '设备采购发票二.png',
    url: '/api/preview-media/invoice-formal-2-7c3aed.png',
    uploadDate: '2026-07-26T08:30:00.000Z',
    type: 'image/png',
    size: '1.6 MB',
    category: 'Invoice'
  }
];
previewProject.nodes.at(-1).attachments = previewInvoiceAttachments;

const createMedia = ({
  id,
  title,
  albumId,
  albumTitle,
  phase,
  date,
  nodeId,
  nodeTitle,
  mediaType = 'image',
  color = '2563eb'
}) => ({
  id,
  title,
  category: 'Media',
  projectId: previewProject.id,
  projectName: previewProject.name,
  fileType: mediaType === 'video' ? 'MP4' : 'PNG',
  size: mediaType === 'video' ? '18.4 MB' : '2.8 MB',
  uploadDate: `${date}T08:30:00.000Z`,
  uploader: '预览管理员',
  url: mediaType === 'video'
    ? '/api/preview-media/sample.mp4'
    : `/api/preview-media/${id}-${color}.png`,
  createdAt: `${date}T08:30:00.000Z`,
  mediaPhase: phase,
  capturedAt: date,
  mediaType,
  description: `${albumTitle}的现场记录，供界面和交互验收使用。`,
  mediaAlbumId: albumId,
  mediaAlbumTitle: albumTitle,
  workflowNodeId: nodeId,
  workflowNodeTitle: nodeTitle
});

const archives = [
  createMedia({
    id: 'photo-install-1',
    title: '烟罩吊装定位',
    albumId: 'album-install',
    albumTitle: '烟罩与风管安装现场',
    phase: '进场施工',
    date: '2026-07-26',
    nodeId: 'node-3-1',
    nodeTitle: '烟罩与风管安装',
    color: '0f766e'
  }),
  createMedia({
    id: 'photo-install-2',
    title: '风管接口复核',
    albumId: 'album-install',
    albumTitle: '烟罩与风管安装现场',
    phase: '进场施工',
    date: '2026-07-26',
    nodeId: 'node-3-1',
    nodeTitle: '烟罩与风管安装',
    color: '0369a1'
  }),
  createMedia({
    id: 'video-install-1',
    title: '安装过程巡检视频',
    albumId: 'album-install',
    albumTitle: '烟罩与风管安装现场',
    phase: '进场施工',
    date: '2026-07-26',
    nodeId: 'node-3-1',
    nodeTitle: '烟罩与风管安装',
    mediaType: 'video'
  }),
  createMedia({
    id: 'photo-production-1',
    title: '设备出厂检查',
    albumId: 'album-production',
    albumTitle: '设备生产与出厂记录',
    phase: '生产准备',
    date: '2026-07-18',
    nodeId: 'node-2-1',
    nodeTitle: '设备排产确认',
    color: '7c3aed'
  }),
  createMedia({
    id: 'photo-design-1',
    title: '水电点位复核',
    albumId: 'album-design',
    albumTitle: '首次现场测量',
    phase: '前期对接 & 设计',
    date: '2026-06-12',
    nodeId: 'node-1-1',
    nodeTitle: '现场测量与点位复核',
    color: 'b45309'
  }),
  ...previewInvoiceAttachments.slice(1).map(attachment => ({
    id: attachment.id,
    title: attachment.name.replace(/\.[^.]+$/, ''),
    category: 'Invoice',
    projectId: previewProject.id,
    projectName: previewProject.name,
    fileType: 'PNG',
    size: attachment.size,
    uploadDate: attachment.uploadDate,
    uploader: previewUser.nickname,
    url: attachment.url,
    createdAt: attachment.uploadDate
  })),
  {
    id: 'mobile-pdf-preview',
    title: '手机 PDF 预览验证',
    category: 'SignOff',
    projectId: previewProject.id,
    projectName: previewProject.name,
    fileType: 'PDF',
    size: '3.3 MB',
    uploadDate: '2026-08-11T10:00:00.000Z',
    uploader: previewUser.nickname,
    url: '/api/preview-media/mobile-preview.pdf',
    createdAt: '2026-08-11T10:00:00.000Z'
  }
];

const resources = {
  projects: [previewProject],
  users: [previewUser],
  archives,
  settings: [{
    id: 'global_config',
    appName: 'i ERP 1.12.2 预览',
    logoUrl: '',
    logoWidth: 120,
    poweredByText: 'Local Preview'
  }],
  clients: [],
  equipment: [],
  schedule: [],
  docs: [],
  production: [],
  payments: [{
    id: 'preview-payment',
    projectId: previewProject.id,
    projectName: previewProject.name,
    managerName: previewUser.nickname,
    clientContactName: '预览客户',
    contractAmount: 100000,
    variationAmount: 0,
    submissionAmount: 100000,
    auditedAmount: 100000,
    paymentTerms: '预览环境发票关联回归',
    receivedAmount: 50000,
    finalPaymentDueDate: '2026-09-30',
    invoicedAmount: 100000,
    warrantyPeriod: '2年',
    creatorId: previewUser.id,
    createdAt: '2026-07-26T08:30:00.000Z'
  }],
  approvals: [],
  worklogs: [],
  messages: [],
  channels: [],
  announcements: [],
  ai_messages: [],
  recycle_bin: []
};

const escapeXml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/health/live', (_req, res) => res.json({ status: 'ok', preview: true }));
app.get('/health/ready', (_req, res) => res.json({ status: 'ready', preview: true }));
app.get('/auth/me', (_req, res) => res.json({ user: previewUser }));
app.post('/auth/heartbeat', (_req, res) => res.json({ success: true }));
app.post('/auth/logout', (_req, res) => res.json({ success: true }));
app.get('/branding/logo', (_req, res) => res.status(404).json({ error: 'Logo not configured' }));
app.get('/upload/config', (_req, res) => res.json({
  maxFileSize: 100 * 1024 * 1024,
  videoChunkSize: 4 * 1024 * 1024,
  uploadConcurrency: 2,
  mediaExtensions: {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    video: ['mp4', 'mov', 'webm']
  }
}));
app.get('/ai/settings', (_req, res) => res.json({
  providers: {
    deepseek: { configured: false, baseUrl: '', model: '' },
    minimax: { configured: false, baseUrl: '', model: '' }
  }
}));

app.get('/preview-media/sample.mp4', (_req, res) => {
  res.status(204).type('video/mp4').end();
});

app.get('/preview-media/mobile-preview.pdf', (_req, res) => {
  const previewPdfPath = process.env.PREVIEW_PDF_PATH;
  if (!previewPdfPath || !existsSync(previewPdfPath)) {
    return res.status(404).json({ error: 'Set PREVIEW_PDF_PATH to a local PDF file' });
  }
  res.set('Content-Disposition', 'inline; filename="mobile-preview.pdf"');
  return res.sendFile(path.resolve(previewPdfPath));
});

app.get('/preview-media/:name.png', (req, res) => {
  const color = /^[a-z0-9-]+-([0-9a-f]{6})$/i.exec(req.params.name)?.[1] || '2563eb';
  const label = escapeXml(req.params.name.split('-').slice(0, -1).join(' '));
  res.type('image/svg+xml').send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#${color}"/>
          <stop offset="1" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <path d="M0 650 L260 420 L430 560 L700 260 L1200 710 L1200 900 L0 900 Z" fill="#fff" opacity=".14"/>
      <circle cx="920" cy="210" r="90" fill="#fff" opacity=".16"/>
      <text x="70" y="760" fill="#fff" font-size="46" font-family="sans-serif" font-weight="700">${label}</text>
      <text x="70" y="820" fill="#cbd5e1" font-size="26" font-family="sans-serif">i ERP 1.12.2 · 本地预览素材</text>
    </svg>
  `);
});

app.get('/:resource', (req, res) => {
  const records = resources[req.params.resource];
  if (!records) return res.status(404).json({ error: 'Resource not found' });
  return res.json(records);
});

app.post('/archives/batch', (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Archive batch must be an array' });
  }
  archives.push(...structuredClone(req.body));
  return res.status(201).json(req.body);
});

app.post('/:resource', (req, res) => {
  const records = resources[req.params.resource];
  if (!records) return res.status(404).json({ error: 'Resource not found' });
  records.push(structuredClone(req.body));
  return res.status(201).json(req.body);
});

app.put('/:resource/:id', (req, res) => {
  const records = resources[req.params.resource];
  if (!records) return res.status(404).json({ error: 'Resource not found' });
  const index = records.findIndex(item => item.id === req.params.id);
  if (index >= 0) records[index] = structuredClone(req.body);
  return res.json(req.body);
});

app.delete('/:resource/:id', (req, res) => {
  const records = resources[req.params.resource];
  if (!records) return res.status(404).json({ error: 'Resource not found' });
  const index = records.findIndex(item => item.id === req.params.id);
  if (index >= 0) records.splice(index, 1);
  return res.json({ success: true });
});

app.listen(PORT, HOST, () => {
  console.log(`i ERP preview fixture listening on http://${HOST}:${PORT}`);
});

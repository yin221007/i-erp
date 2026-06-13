
import React, { useState, useMemo, useRef } from 'react';
import { Approval, ApprovalStatus, ApprovalType, User, Attachment, ApprovalStrategy, ApprovalOutcome, ApprovalTemplate } from '../types';
import { Plus, Search, FileText, CheckCircle2, XCircle, RotateCcw, Upload, Paperclip, History, Trash2, Send, ChevronRight, Users, UserCheck, FastForward, ListChecks, BellRing, BookOpen, Layers, Zap, MoreHorizontal, Copy } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { API_URL, apiFetch } from '../lib/api';

// 预设审批模版
const PRESET_TEMPLATES: ApprovalTemplate[] = [
  { id: 't-1', name: '设备采购紧急申请', type: 'Procurement', defaultTitle: '关于 XXX 项目的设备加急采购申请', defaultContent: '因工程节点要求，现申请加急采购以下厨房设备：\n1. \n2. ', defaultStrategy: 'SEQUENTIAL' },
  { id: 't-2', name: '工程现场变更确认', type: 'Engineering', defaultTitle: 'XXX 项目现场施工方案变更申请', defaultContent: '经现场勘查，原水电定位与精装面层冲突，现申请变更如下方案：', defaultStrategy: 'OR_SIGN' },
  { id: 't-3', name: '业务费用报销单', type: 'Expense', defaultTitle: 'XXX 部门业务差旅/公关费用报销', defaultContent: '事由：\n金额：\n附件包含原始发票扫描件。', defaultStrategy: 'JOINT' }
];

interface ApprovalManagerProps {
  approvals: Approval[];
  users: User[];
  currentUser: User;
  onAddApproval: (approval: Approval) => void;
  onUpdateApproval: (approval: Approval) => void;
  onDeleteApproval: (id: string) => void;
}

const ApprovalManager: React.FC<ApprovalManagerProps> = ({ approvals, users, currentUser, onAddApproval, onUpdateApproval, onDeleteApproval }) => {
  // Tabs: My Request, Pending, Processed, Drafts, All
  const [activeTab, setActiveTab] = useState<'my_requests' | 'pending_approval' | 'processed' | 'drafts' | 'all'>('my_requests');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApproval, setEditingApproval] = useState<Approval | null>(null);
  const [viewMode, setViewMode] = useState<'create' | 'edit' | 'view' | 'audit'>('view');
  
  const isAdmin = currentUser.role === 'Admin' || currentUser.isDefaultAdmin;
  const isSuperAdmin = currentUser.isDefaultAdmin;
  
  // 核心：基于权限过滤基础数据源
  const visibleApprovals = useMemo(() => {
    // 管理员及超级管理员见全员
    if (isAdmin) return approvals;
    // 其他账号只可看见自己账号下的申请记录（作为发起人、审批人或已处理人）
    return approvals.filter(a => 
      a.applicantId === currentUser.id || 
      a.approverIds.includes(currentUser.id) ||
      a.versions?.some(v => v.outcomes.some(o => o.approverId === currentUser.id))
    );
  }, [approvals, currentUser.id, isAdmin]);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<ApprovalType>('Procurement');
  const [formContent, setFormContent] = useState('');
  const [formStrategy, setFormStrategy] = useState<ApprovalStrategy>('SEQUENTIAL');
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [auditComment, setAuditComment] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStatusBadge = (status: ApprovalStatus) => {
    switch (status) {
      case 'Draft': return 'bg-slate-100 text-slate-500 border-slate-200';
      case 'Pending': return 'bg-primary-50 text-primary-600 border-primary-200 dark:bg-primary-900/30';
      case 'Approved': return 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30';
      case 'Rejected': return 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30';
      case 'Returned': return 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  const getStrategyInfo = (strategy: ApprovalStrategy) => {
      switch(strategy) {
          case 'SEQUENTIAL': return { label: '顺序', icon: <ChevronRight className="w-3 h-3" /> };
          case 'PARALLEL': return { label: '并行', icon: <Users className="w-3 h-3" /> };
          case 'JOINT': return { label: '会签', icon: <ListChecks className="w-3 h-3" /> };
          case 'OR_SIGN': return { label: '或签', icon: <FastForward className="w-3 h-3" /> };
      }
  };

  // 内部过滤逻辑：基于可见范围 visibleApprovals 进一步分栏
  const myRequests = useMemo(() => visibleApprovals.filter(a => a.applicantId === currentUser.id && a.status !== 'Draft'), [visibleApprovals, currentUser.id]);
  const drafts = useMemo(() => visibleApprovals.filter(a => a.applicantId === currentUser.id && a.status === 'Draft'), [visibleApprovals, currentUser.id]);
  const processed = useMemo(() => visibleApprovals.filter(a => a.versions?.some(v => v.outcomes.some(o => o.approverId === currentUser.id))), [visibleApprovals, currentUser.id]);
  const pending = useMemo(() => 
    visibleApprovals.filter(a => {
      if (a.status !== 'Pending') return false;
      const outcomes = a.versions?.[0]?.outcomes || [];
      const signedIds = outcomes.map(o => o.approverId);
      // 检查是否轮到当前用户审批
      if (a.strategy === 'SEQUENTIAL') {
          const nextIdx = a.approverIds.findIndex(id => !signedIds.includes(id));
          return a.approverIds[nextIdx] === currentUser.id;
      }
      return a.approverIds.includes(currentUser.id) && !signedIds.includes(currentUser.id);
    })
  , [visibleApprovals, currentUser.id]);

  const displayedList = useMemo(() => {
    let list: Approval[] = [];
    if (activeTab === 'my_requests') list = myRequests;
    else if (activeTab === 'pending_approval') list = pending;
    else if (activeTab === 'processed') list = processed;
    else if (activeTab === 'drafts') list = drafts;
    else if (activeTab === 'all') list = visibleApprovals.filter(a => a.status !== 'Draft');
    return list.filter(a => a.title.includes(searchTerm) || a.applicantName.includes(searchTerm)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [activeTab, myRequests, pending, processed, drafts, visibleApprovals, searchTerm]);

  // Actions
  const handleOpenCreate = () => {
    setEditingApproval(null); setFormTitle(''); setFormType('Procurement'); setFormContent(''); setFormStrategy('SEQUENTIAL'); setSelectedApproverIds([]); setFormAttachments([]); setViewMode('create'); setIsModalOpen(true);
  };

  const applyTemplate = (t: ApprovalTemplate) => {
    setFormTitle(t.defaultTitle); setFormType(t.type); setFormContent(t.defaultContent); setFormStrategy(t.defaultStrategy);
  };

  const handleOpenView = (app: Approval) => {
    setEditingApproval(app); setFormTitle(app.title); setFormType(app.type); setFormContent(app.currentContent); setFormStrategy(app.strategy); setSelectedApproverIds(app.approverIds); setFormAttachments(app.currentAttachments || []);
    if (app.status === 'Draft' || app.status === 'Returned') setViewMode('edit');
    else if (pending.some(p => p.id === app.id)) setViewMode('audit');
    else setViewMode('view');
    setAuditComment(''); setIsModalOpen(true);
  };

  const handleSave = (asDraft: boolean) => {
    if (!formTitle || selectedApproverIds.length === 0) return alert("标题及审批人必填");
    const now = new Date().toISOString();
    const data: Partial<Approval> = { title: formTitle, type: formType, currentContent: formContent, currentAttachments: formAttachments, strategy: formStrategy, approverIds: selectedApproverIds, approverNamesDisplay: users.filter(u => selectedApproverIds.includes(u.id)).map(u=>u.nickname).join(', '), status: asDraft ? 'Draft' : 'Pending', updatedAt: now };
    if (editingApproval) onUpdateApproval({ ...editingApproval, ...data } as Approval);
    else onAddApproval({ ...data, id: Math.random().toString(36).substr(2, 9), applicantId: currentUser.id, applicantName: currentUser.nickname, department: currentUser.department, versions: [{ version: 1, content: formContent, attachments: formAttachments, submittedAt: now, outcomes: [] }], createdAt: now } as Approval);
    setIsModalOpen(false);
  };

  const handleAuditAction = (status: 'Approved' | 'Rejected' | 'Returned') => {
    if (!editingApproval) return;
    if (!auditComment && status !== 'Approved') return alert("请填写签署意见");
    const now = new Date().toISOString();
    const outcome: ApprovalOutcome = { status, approverId: currentUser.id, approverName: currentUser.nickname, comment: auditComment || '同意', date: now };
    const updatedVer = [...(editingApproval.versions || [])];
    if (updatedVer.length === 0) updatedVer.push({ version: 1, content: editingApproval.currentContent, attachments: editingApproval.currentAttachments, submittedAt: editingApproval.createdAt, outcomes: [] });
    updatedVer[0].outcomes = [...updatedVer[0].outcomes, outcome];
    
    let nextStatus: ApprovalStatus = 'Pending';
    if (status === 'Rejected') nextStatus = 'Rejected';
    else if (status === 'Returned') nextStatus = 'Returned';
    else {
        const approvedCount = updatedVer[0].outcomes.filter(o => o.status === 'Approved').length;
        if (editingApproval.strategy === 'OR_SIGN') nextStatus = 'Approved';
        else nextStatus = approvedCount === editingApproval.approverIds.length ? 'Approved' : 'Pending';
    }
    onUpdateApproval({ ...editingApproval, status: nextStatus, updatedAt: now, versions: updatedVer });
    setIsModalOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setIsUploading(true);
      try {
          const fd = new FormData(); fd.append('file', e.target.files[0]);
          const res = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: fd });
          const file = await res.json();
          setFormAttachments(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: e.target.files![0].name, url: file.url, uploadDate: new Date().toISOString(), type: 'FILE', size: 'N/A' }]);
      } finally { setIsUploading(false); }
    }
  };

  const handleRemoveApproval = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("确定要删除这条申请记录吗？删除后将无法恢复。")) {
      onDeleteApproval(id);
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-primary-600 rounded-2xl shadow-xl shadow-primary-500/20"><UserCheck className="w-8 h-8 text-white" /></div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">业务审批中心</h2>
              <div className="flex items-center gap-2 mt-1 text-slate-400 text-sm font-medium">高效流转工程管理环节</div>
           </div>
        </div>
        <button onClick={handleOpenCreate} className="bg-primary-600 text-white px-6 py-3 rounded-2xl hover:bg-primary-700 flex items-center gap-2 shadow-xl shadow-primary-500/30 active:scale-95 font-black uppercase text-xs tracking-widest"><Plus className="w-4 h-4" /> 发起新申请</button>
      </div>

      {/* Tabs Layout */}
      <div className="bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded-2xl flex items-center gap-1 self-start shadow-inner overflow-x-auto no-scrollbar transition-all">
          {[
              { id: 'my_requests', label: '我发起的', count: myRequests.length },
              { id: 'pending_approval', label: '待我审核', count: pending.length, pulse: pending.length > 0 },
              { id: 'processed', label: '我处理的', count: processed.length },
              { id: 'drafts', label: '草稿箱', count: drafts.length },
              { id: 'all', label: '全部记录', count: visibleApprovals.filter(a => a.status !== 'Draft').length, hide: !isAdmin }
          ].filter(t => !t.hide).map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                  {tab.label}
                  {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? 'bg-primary-100 text-primary-600' : 'bg-slate-200 text-slate-400'} ${tab.pulse ? 'animate-bounce' : ''}`}>{tab.count}</span>}
              </button>
          ))}
      </div>

      {/* Table Content */}
      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col transition-all">
          <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <div className="col-span-2 pl-4">当前状态</div>
              <div className="col-span-5">事项摘要 / 类型</div>
              <div className="col-span-2">发起人 / 部门</div>
              <div className="col-span-2 text-right">更新时间</div>
              <div className="col-span-1 text-center">操作</div>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700 overflow-y-auto flex-1 custom-scrollbar">
              {displayedList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 py-20"><BookOpen className="w-16 h-16 mb-4" /><p className="font-black">暂无匹配申请项</p></div>
              ) : (
                  displayedList.map(app => (
                    <div key={app.id} onClick={() => handleOpenView(app)} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 items-center hover:bg-primary-50/40 dark:hover:bg-primary-900/10 cursor-pointer transition-all border-l-4 border-transparent hover:border-primary-600 group">
                        <div className="col-span-3 md:col-span-2"><span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border tracking-tighter ${getStatusBadge(app.status)}`}>{app.status === 'Pending' ? '审核中' : app.status === 'Approved' ? '已核准' : app.status === 'Rejected' ? '已驳回' : app.status === 'Draft' ? '未提交' : '补充中'}</span></div>
                        <div className="col-span-9 md:col-span-5">
                            <h4 className="text-sm font-black text-slate-800 dark:text-white truncate group-hover:text-primary-600 transition-colors">{app.title}</h4>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{app.type === 'Procurement' ? '采购' : app.type === 'Engineering' ? '工程' : '业务'}</p>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                            <p className="text-xs font-black text-slate-700 dark:text-slate-300">{app.applicantName}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold">{app.department}</p>
                        </div>
                        <div className="col-span-6 md:col-span-2 text-right"><span className="text-[10px] font-mono text-slate-400">{formatBeijingTime(app.updatedAt)}</span></div>
                        <div className="col-span-12 md:col-span-1 flex justify-end md:justify-center">
                            {(isSuperAdmin || (app.status === 'Draft' && app.applicantId === currentUser.id)) ? (
                                <button 
                                  onClick={(e) => handleRemoveApproval(e, app.id)}
                                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all active:scale-90"
                                  title="删除此项记录"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            ) : (
                                <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-primary-400 transition-all" />
                            )}
                        </div>
                    </div>
                  ))
              )}
          </div>
      </div>

      {/* Main Form/Detail Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 transition-all">
             <div className="bg-white dark:bg-slate-800 w-full max-w-5xl rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-white/20 custom-scrollbar flex flex-col lg:flex-row gap-10">
                {/* Left: Form */}
                <div className="flex-1 space-y-8 min-w-0">
                    <div className="flex justify-between items-center border-b dark:border-slate-700 pb-6">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">{viewMode === 'create' ? '新建业务申请' : '审批单详情'}</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><XCircle className="w-7 h-7" /></button>
                    </div>

                    {viewMode === 'create' && (
                        <div className="bg-primary-50/50 dark:bg-primary-900/10 p-5 rounded-2xl border-2 border-primary-100 dark:border-primary-800 animate-in slide-in-from-top-4">
                            <label className="block text-[10px] font-black text-primary-600 uppercase tracking-widest mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> 快速应用申请模版</label>
                            <div className="flex flex-wrap gap-2">
                                {PRESET_TEMPLATES.map(t => (
                                    <button key={t.id} onClick={() => applyTemplate(t)} className="px-4 py-2 bg-white dark:bg-slate-800 border border-primary-200 dark:border-primary-700 rounded-xl text-[10px] font-black text-primary-700 dark:text-primary-300 hover:bg-primary-600 hover:text-white transition-all shadow-sm active:scale-95 flex items-center gap-1.5"><Copy className="w-3 h-3" />{t.name}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">申请类别</label><select disabled={viewMode === 'view' || viewMode === 'audit'} className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 bg-slate-50 dark:bg-slate-900 font-black text-sm outline-none focus:border-primary-500 transition-all" value={formType} onChange={e => setFormType(e.target.value as any)}><option value="Procurement">设备采购</option><option value="Expense">费用报销</option><option value="Leave">人事请假</option><option value="Engineering">工程现场变更</option><option value="Other">其他通用申请</option></select></div>
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">审批策略</label><select disabled={viewMode === 'view' || viewMode === 'audit'} className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 bg-slate-50 dark:bg-slate-900 font-black text-sm outline-none focus:border-primary-500 transition-all" value={formStrategy} onChange={e => setFormStrategy(e.target.value as any)}><option value="SEQUENTIAL">顺序审批 (层级递进)</option><option value="PARALLEL">并行审批 (全员独立)</option><option value="JOINT">会签审批 (全员同意)</option><option value="OR_SIGN">或签审批 (任一同意)</option></select></div>
                    </div>
                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">事项简述 *</label><input disabled={viewMode === 'view' || viewMode === 'audit'} className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 bg-slate-50 dark:bg-slate-900 font-black text-sm outline-none focus:border-primary-500 transition-all shadow-inner" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="简单概括业务核心意向" /></div>
                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">详情正文</label><textarea disabled={viewMode === 'view' || viewMode === 'audit'} className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-6 h-40 bg-slate-50 dark:bg-slate-900 font-medium text-sm outline-none focus:border-primary-500 transition-all shadow-inner resize-none leading-relaxed" value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="详细说明申请缘由、预算或现场情况描述" /></div>
                    
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">证明材料 / 扫描件</label>
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-6 border border-slate-100 dark:border-slate-700 shadow-inner">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {formAttachments.map(att => (<div key={att.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 shadow-sm group"><div className="flex items-center gap-3 overflow-hidden"><Paperclip className="w-4 h-4 text-primary-500" /><span className="text-xs font-bold truncate">{att.name}</span></div><button onClick={() => setFormAttachments(p => p.filter(x => x.id !== att.id))} className="text-red-400 hover:text-red-600 transition-opacity"><XCircle className="w-4 h-4" /></button></div>))}
                                {(viewMode === 'create' || viewMode === 'edit') && (<button onClick={() => fileInputRef.current?.click()} className="py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:border-primary-500 hover:text-primary-600 transition-all group">{isUploading ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 transition-transform group-hover:scale-110" />}<span className="text-[10px] font-black uppercase">上传附件</span></button>)}
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Workflow Status & Approvers */}
                <div className="w-full lg:w-96 space-y-8 transition-all">
                    <div className="bg-primary-50/80 dark:bg-primary-950/40 rounded-[2.5rem] p-8 border-2 border-primary-100 dark:border-primary-800 shadow-sm relative overflow-hidden transition-all">
                        <h4 className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2"><Layers className="w-4 h-4" /> 审批链路成员</h4>
                        <div className="space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 transition-all">
                            {viewMode === 'create' || viewMode === 'edit' ? (
                                users.filter(u => u.id !== currentUser.id).map(u => (
                                    <label key={u.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-transparent hover:border-primary-500 transition-all cursor-pointer shadow-sm active:scale-95 group">
                                        <input type="checkbox" checked={selectedApproverIds.includes(u.id)} onChange={e => e.target.checked ? setSelectedApproverIds([...selectedApproverIds, u.id]) : setSelectedApproverIds(selectedApproverIds.filter(id => id !== u.id))} className="w-5 h-5 rounded-lg text-primary-600 focus:ring-primary-500 border-slate-300 transition-all" />
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden"><img src={u.avatar} className="w-full h-full object-cover" /></div>
                                            <div className="min-w-0"><p className="text-sm font-black text-slate-800 dark:text-white truncate">{u.nickname}</p><p className="text-[9px] text-slate-400 font-bold uppercase truncate">{u.department}</p></div>
                                        </div>
                                    </label>
                                ))
                            ) : (
                                editingApproval?.approverIds.map((id, idx) => {
                                    const u = users.find(user => user.id === id);
                                    const outcome = editingApproval.versions?.[0]?.outcomes.find(o => o.approverId === id);
                                    return (
                                        <div key={id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${outcome ? (outcome.status === 'Approved' ? 'bg-emerald-50 border-emerald-500/20' : 'bg-red-50 border-red-500/20') : 'bg-white/80 dark:bg-slate-800 border-primary-100 dark:border-primary-800 shadow-sm'}`}>
                                            <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center font-black text-xs text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-700 shrink-0">{idx + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-slate-800 dark:text-white truncate">{u?.nickname || '未知人员'}</p>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{u?.department}</p>
                                            </div>
                                            {outcome && (
                                                <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase text-white shadow-lg ${outcome.status === 'Approved' ? 'bg-emerald-600' : 'bg-red-600'}`}>{outcome.status === 'Approved' ? '核准' : '驳回'}</div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {editingApproval?.status === 'Pending' && (
                            <div className="mt-8 pt-6 border-t border-primary-200 dark:border-primary-800 flex items-center gap-3">
                                <div className="p-2 bg-primary-600 rounded-lg text-white shadow-lg"><Zap className="w-4 h-4" /></div>
                                <div className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest leading-relaxed">
                                    流程决策方式: {getStrategyInfo(editingApproval.strategy).label}审批
                                </div>
                            </div>
                        )}
                    </div>

                    {viewMode === 'audit' && (
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-8 rounded-[2.5rem] border-2 border-emerald-100 dark:border-emerald-800 shadow-xl animate-in slide-in-from-bottom-6 duration-500">
                            <h4 className="text-sm font-black text-emerald-800 dark:text-emerald-300 mb-4 uppercase tracking-widest flex items-center gap-2">签署审批意见 <MoreHorizontal className="w-4 h-4" /></h4>
                            <textarea className="w-full border-2 border-emerald-100 dark:border-emerald-800 rounded-2xl p-4 h-32 mb-6 outline-none focus:border-emerald-500 bg-white dark:bg-slate-900 text-sm font-medium transition-all" placeholder="输入决策理由及补充说明..." value={auditComment} onChange={e => setAuditComment(e.target.value)} />
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => handleAuditAction('Approved')} className="bg-emerald-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-emerald-700 active:scale-95 transition-all text-xs uppercase tracking-widest">签署核准</button>
                                <button onClick={() => handleAuditAction('Rejected')} className="bg-red-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-red-700 active:scale-95 transition-all text-xs uppercase tracking-widest">签署驳回</button>
                                <button onClick={() => handleAuditAction('Returned')} className="col-span-2 border-2 border-orange-200 text-orange-600 py-4 rounded-xl font-black hover:bg-orange-50 active:scale-95 transition-all text-xs uppercase tracking-widest">退回补充资料</button>
                            </div>
                        </div>
                    )}

                    {editingApproval && editingApproval.versions?.[0]?.outcomes.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History className="w-4 h-4" /> 审批意见追踪</h4>
                            <div className="space-y-3">
                                {editingApproval.versions[0].outcomes.map((o, i) => (
                                    <div key={i} className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                        <div className="flex justify-between items-center mb-2"><span className="text-xs font-black text-slate-800 dark:text-slate-100">{o.approverName}</span><span className="text-[9px] font-mono text-slate-400">{formatBeijingTime(o.date)}</span></div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 italic font-medium leading-relaxed">"{o.comment}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="fixed lg:absolute bottom-6 left-6 right-6 lg:left-10 lg:right-10 flex flex-col md:flex-row justify-end gap-4 border-t-2 border-slate-50 dark:border-slate-700 pt-6 bg-white dark:bg-slate-800 lg:bg-transparent">
                    {(viewMode === 'create' || viewMode === 'edit') && (
                        <>
                            <button onClick={() => handleSave(true)} className="px-8 py-4 text-primary-600 font-black uppercase tracking-widest text-[10px] hover:bg-primary-50 rounded-xl transition-all">暂存至草稿箱</button>
                            <button onClick={() => handleSave(false)} className="px-14 py-4 bg-primary-600 text-white rounded-2xl shadow-2xl shadow-primary-500/30 font-black active:scale-95 uppercase tracking-widest text-[10px] flex items-center gap-3 hover:bg-primary-700"><Send className="w-5 h-5" /> 立即提交并推送</button>
                        </>
                    )}
                    {viewMode === 'view' && (
                        <button onClick={() => setIsModalOpen(false)} className="px-12 py-4 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">关闭预览</button>
                    )}
                </div>
             </div>
          </div>
      )}
    </div>
  );
};

export default ApprovalManager;

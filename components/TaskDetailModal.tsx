import React, { useState, useRef, useEffect } from 'react';
import { WorkflowNode, TaskStatus, Attachment, Memo, ArchiveItem, ArchiveCategory, User } from '../types';
import { X, Upload, File as FileIcon, Send, Trash2, CheckCircle, Clock, AlertTriangle, FolderInput, Edit2, Save, Loader2, User as UserIcon, Calendar, CheckCircle2, History, FileText, RefreshCw } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { API_URL, apiFetch } from '../lib/api';

interface TaskDetailModalProps {
  node: WorkflowNode;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedNode: WorkflowNode) => void;
  onAddArchive: (archive: ArchiveItem) => void;
  onDeleteArchive: (archiveId: string) => void; 
  projectName: string;
  projectId: string; 
  currentUser: User;
  users?: User[]; 
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ node, isOpen, onClose, onUpdate, onAddArchive, onDeleteArchive, projectName, projectId, currentUser, users = [] }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'memos'>('details');
  const [newMemo, setNewMemo] = useState('');
  const [uploadCategory, setUploadCategory] = useState<ArchiveCategory>('Drawing');
  
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescText, setEditDescText] = useState(node.description || '');

  const [isEditingAssign, setIsEditingAssign] = useState(false);
  const [assignee, setAssignee] = useState(node.assignee || '');
  const [deadline, setDeadline] = useState(node.deadline || '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setEditDescText(node.description || '');
      setAssignee(node.assignee || '');
      setDeadline(node.deadline || '');
  }, [node]);

  if (!isOpen) return null;

  // 严格同步工程档案(EngineeringArchives)的分类及顺序，确保全系统分类模板一致
  const categories: { id: ArchiveCategory; label: string }[] = [
    { id: 'Drawing', label: '设计图纸' },
    { id: 'Contract', label: '合同文书' },
    { id: 'List', label: '设备清单' },
    { id: 'ContactForm', label: '联系单/变更' },
    { id: 'Inspection', label: '报验资料' },
    { id: 'Acceptance', label: '验收证明' },
    { id: 'SignOff', label: '设备签收' },
    { id: 'Settlement', label: '内部结算' },
    { id: 'AuditMaterial', label: '审计资料' }, 
    { id: 'Audit', label: '审定证明' },
    { id: 'Invoice', label: '财务发票' },
    { id: 'WinningNotice', label: '中标通知书' },
    { id: 'Training', label: '培训记录' },
    { id: 'Other', label: '其他附件' },
  ];

  const handleStatusChange = (status: TaskStatus) => { 
      if (isUploading) return;
      onUpdate({ ...node, status }); 
  };
  
  const handleSaveDescription = () => { 
      onUpdate({ ...node, description: editDescText }); 
      setIsEditingDesc(false); 
  };

  const handleSaveAssignment = () => {
      onUpdate({ ...node, assignee: assignee, deadline: deadline });
      setIsEditingAssign(false);
  };

  const handleAddMemo = () => {
    if (!newMemo.trim()) return;
    const memo: Memo = { id: Math.random().toString(36).substr(2, 9), content: newMemo, createdAt: new Date().toISOString(), author: currentUser.nickname };
    onUpdate({ ...node, memos: [memo, ...node.memos] });
    setNewMemo('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadingCount(prev => prev + 1);

      try {
          const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() || 'FILE' : 'FILE';
          const sizeInKB = (file.size / 1024).toFixed(1);
          const sizeStr = Number(sizeInKB) > 1024 ? `${(Number(sizeInKB) / 1024).toFixed(1)} MB` : `${sizeInKB} KB`;

          const formData = new FormData();
          formData.append('file', file);

          const uploadRes = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
          if (!uploadRes.ok) throw new Error('Upload failed');
          const fileData = await uploadRes.json();
          const fileUrl = fileData.url;

          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            url: fileUrl,
            uploadDate: new Date().toISOString(),
            type: file.type || 'application/octet-stream',
            size: sizeStr,
            category: uploadCategory
          };
          
          // 更新节点附件（用于局部显示）
          onUpdate({ ...node, attachments: [...node.attachments, newAttachment] });

          // 同步至全局档案库（核心同步点，确保数据共享）
          const newArchive: ArchiveItem = {
              id: newAttachment.id, 
              title: file.name.split('.')[0], 
              category: uploadCategory,
              projectName: projectName,
              projectId: projectId,
              fileType: extension as any,
              size: sizeStr,
              uploadDate: new Date().toISOString(),
              uploader: currentUser.nickname,
              url: fileUrl
          };
          onAddArchive(newArchive);

      } catch (error) {
          alert("文件上传失败，请重试");
      } finally {
          setUploadingCount(prev => Math.max(0, prev - 1));
          if (e.target) e.target.value = '';
      }
    }
  };

  const handleDeleteFile = (fileId: string) => {
      if (isUploading) return;
      if (window.confirm("确定要删除此附件吗？档案库中也将同步移除。")) {
        // 调用全局删除逻辑，App.tsx 中的 handleDeleteArchive 会处理项目节点的同步更新
        onDeleteArchive(fileId); 
      }
  };

  const assignedUser = users?.find(u => u.nickname === node.assignee);

  const tabs = [
    { id: 'details', label: '任务执行', icon: CheckCircle2, count: undefined },
    { id: 'files', label: '过程附件', icon: FolderInput, count: node.attachments.length },
    { id: 'memos', label: '流转日志', icon: History, count: node.memos.length }
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 md:p-6 transition-all duration-500">
      <div className="bg-white dark:bg-slate-800 w-full max-w-5xl h-[95vh] md:h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 transition-all border border-slate-100 dark:border-slate-700 relative">
        
        {/* Header */}
        <div className="px-6 py-5 md:px-8 md:py-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/80 backdrop-blur-sm transition-all shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black text-white bg-primary-600 px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-sm">{node.phase}</span>
                {node.isKeyNode && <span className="text-[10px] font-black text-white bg-red-600 px-2.5 py-0.5 rounded-full uppercase tracking-widest animate-pulse shadow-sm">关键节点</span>}
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white truncate tracking-tight leading-tight">{node.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex-shrink-0 ml-4 shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 group">
            <X className="w-6 h-6 text-slate-400 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row transition-all relative">
           
           {/* Sidebar */}
           <div className="w-full md:w-56 bg-slate-900 text-white flex md:flex-col shrink-0 transition-all p-2 md:p-4 space-x-1 md:space-x-0 md:space-y-1.5 shadow-2xl relative z-20 overflow-x-auto no-scrollbar border-b border-white/5 md:border-b-0">
               {tabs.map((tab) => (
                   <button 
                       key={tab.id}
                       onClick={() => setActiveTab(tab.id as any)} 
                       className={`flex-1 md:w-full flex items-center justify-center md:justify-between p-2.5 md:p-3.5 text-center md:text-left rounded-xl transition-all group relative ${activeTab === tab.id ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                   >
                       <div className="flex items-center gap-3 relative z-10">
                           <tab.icon className={`w-4.5 h-4.5 transition-transform group-hover:scale-110 ${activeTab === tab.id ? 'text-white' : 'text-slate-500'}`} />
                           <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">{tab.label}</span>
                       </div>
                       {tab.count !== undefined && (
                           <span className={`hidden md:inline text-[9px] font-black px-2 py-0.5 rounded-md relative z-10 transition-colors ${activeTab === tab.id ? 'bg-white text-primary-600' : 'bg-slate-800 text-slate-500'}`}>
                               {tab.count}
                           </span>
                       )}
                   </button>
               ))}
           </div>

           {/* Content Area */}
           <div className="flex-1 overflow-y-auto p-5 md:p-8 bg-slate-50 dark:bg-slate-900 transition-all custom-scrollbar relative">
               
               {activeTab === 'details' && (
                   <div className="space-y-6 animate-in fade-in transition-all">
                       
                       {/* 负责人 & 时限卡片 */}
                       <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 transition-all">
                           <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4">
                               <h3 className="text-xs font-black text-slate-900 dark:text-slate-200 flex items-center gap-3 uppercase tracking-widest">
                                   <div className="p-1.5 bg-primary-600 rounded-lg"><UserIcon className="w-4 h-4 text-white" /></div> 负责人 & 执行时限
                               </h3>
                               {!isEditingAssign && (
                                   <button onClick={() => setIsEditingAssign(true)} className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-primary-600 transition-all uppercase tracking-widest active:scale-95">修改指派</button>
                               )}
                           </div>
                           
                           {isEditingAssign ? (
                               <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 bg-slate-50 dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">执行人指派</label>
                                            <select 
                                                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 dark:text-white font-bold transition-all outline-none focus:border-primary-500"
                                                value={assignee}
                                                onChange={e => setAssignee(e.target.value)}
                                            >
                                                <option value="">-- 未指派 --</option>
                                                {users?.map(u => (
                                                    <option key={u.id} value={u.nickname}>{u.nickname} ({u.department})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 pl-1">截止日期</label>
                                            <input 
                                                type="date"
                                                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 dark:text-white font-bold transition-all outline-none focus:border-primary-500"
                                                value={deadline}
                                                onChange={e => setDeadline(e.target.value)}
                                            />
                                        </div>
                                   </div>
                                   <div className="flex justify-end gap-3 pt-2">
                                       <button onClick={() => setIsEditingAssign(false)} className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">取消</button>
                                       <button onClick={handleSaveAssignment} className="px-6 py-2 bg-primary-600 text-white rounded-lg shadow-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">确定同步</button>
                                   </div>
                               </div>
                           ) : (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 transition-all">
                                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all ${assignedUser ? 'bg-primary-600 border-white shadow-md' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 border-white'}`}>
                                           {assignedUser ? <img src={assignedUser.avatar} className="w-full h-full rounded-lg object-cover" alt="avatar"/> : <UserIcon className="w-5 h-5"/>}
                                       </div>
                                       <div className="min-w-0">
                                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">负责人</p>
                                           <p className="text-base font-black text-slate-800 dark:text-white truncate">{node.assignee || '暂未派单'}</p>
                                       </div>
                                   </div>
                                   <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 transition-all">
                                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all ${node.deadline && new Date(node.deadline) < new Date() && node.status !== TaskStatus.COMPLETED ? 'bg-red-600 border-white shadow-md' : 'bg-orange-50 border-white shadow-md'}`}>
                                           <Calendar className={`w-6 h-6 ${node.deadline && new Date(node.deadline) < new Date() && node.status !== TaskStatus.COMPLETED ? 'text-white' : 'text-orange-500'}`} />
                                       </div>
                                       <div className="min-w-0">
                                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">要求截止</p>
                                           <p className="text-base font-black text-slate-800 dark:text-white truncate font-mono">{node.deadline || '未设时限'}</p>
                                       </div>
                                   </div>
                               </div>
                           )}
                       </div>

                       {/* 作业指南卡片 */}
                       <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 transition-all">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                               工程作业标准指南 (SOP)
                               {!isEditingDesc && (
                                   <button onClick={() => { setIsEditingDesc(true); setEditDescText(node.description || ''); }} className="text-primary-600 hover:text-primary-700 flex items-center gap-2 font-bold transition-all bg-primary-50 dark:bg-primary-900/40 px-3 py-1 rounded-lg border border-primary-100 dark:border-primary-800 text-[10px]"><Edit2 className="w-3 h-3" /> 编辑规范</button>
                               )}
                           </label>
                           {isEditingDesc ? (
                               <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                   <textarea className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-xl p-5 h-40 text-sm focus:border-primary-500 outline-none transition-all font-medium shadow-inner leading-relaxed" value={editDescText} onChange={e => setEditDescText(e.target.value)} placeholder="请输入该节点的详细施工/设计标准要求..." />
                                   <div className="flex justify-end gap-3">
                                       <button onClick={() => setIsEditingDesc(false)} className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">取消</button>
                                       <button onClick={handleSaveDescription} className="px-6 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 font-black transition-all active:scale-95 shadow-md text-[10px] uppercase tracking-widest"><Save className="w-3.5 h-3.5" /> 保存规范</button>
                                   </div>
                               </div>
                           ) : (
                               <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-slate-700 dark:text-slate-300 text-sm leading-relaxed border border-white dark:border-slate-700 min-h-[5rem] transition-all font-medium shadow-inner relative overflow-hidden">
                                   <div className="relative z-10">{node.description || "暂无作业指南。请点击右上角完善施工工艺要求。"}</div>
                                   <FileText className="absolute bottom-[-5px] right-[-5px] w-16 h-16 opacity-5 text-slate-400 rotate-12" />
                               </div>
                           )}
                       </div>
                       
                       {/* 状态设置卡片 */}
                       <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 transition-all">
                           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center">更新当前执行状态</label>
                           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                               {[
                                   { id: TaskStatus.PENDING, label: '待处理', icon: Clock, color: 'bg-slate-100 text-slate-500 border-slate-200', active: 'bg-slate-600 text-white border-slate-600' },
                                   { id: TaskStatus.IN_PROGRESS, label: '执行中', icon: RefreshCw, color: 'bg-blue-50 text-blue-500 border-blue-100', active: 'bg-primary-600 text-white border-primary-600' },
                                   { id: TaskStatus.COMPLETED, label: '已完结', icon: CheckCircle, color: 'bg-emerald-50 text-emerald-700 border-emerald-100', active: 'bg-emerald-600 text-white border-emerald-600' },
                                   { id: TaskStatus.BLOCKED, label: '存在风险', icon: AlertTriangle, color: 'bg-red-50 text-red-500 border-red-100', active: 'bg-red-600 text-white border-red-600' }
                               ].map((s) => (
                                   <button 
                                       key={s.id} 
                                       disabled={isUploading} 
                                       onClick={() => handleStatusChange(s.id)} 
                                       className={`flex items-center gap-3 p-4 rounded-xl border transition-all active:scale-95 group relative ${node.status === s.id ? `${s.active} shadow-lg ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ring-slate-100 dark:ring-slate-700` : `${s.color} hover:bg-white hover:shadow-md dark:bg-slate-900/50`}`}
                                   >
                                       <s.icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${node.status === s.id ? 'animate-pulse' : ''}`} />
                                       <span className="text-[11px] font-black uppercase tracking-widest">{s.label}</span>
                                   </button>
                               ))}
                           </div>
                       </div>
                   </div>
               )}

               {activeTab === 'files' && (
                   <div className="space-y-6 animate-in fade-in transition-all">
                       <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-6 bg-white dark:bg-slate-800 shadow-sm transition-all">
                           <label className="block text-xs font-black text-slate-800 dark:text-white mb-5 flex items-center gap-3 uppercase tracking-widest">
                               <FolderInput className="w-5 h-5 text-primary-600" /> 同步过程资料
                           </label>
                           
                           {/* 优化后的分类选择区域：确保水平滚动显示，增加底部间距以防遮挡，增加右侧 pr-24 确保末尾项完整显示 */}
                           <div className="mb-6 overflow-x-auto pb-4 custom-scrollbar">
                               <div className="flex gap-2 pr-24 flex-nowrap">
                                   {categories.map(cat => (
                                       <button 
                                           key={cat.id} 
                                           onClick={() => setUploadCategory(cat.id)} 
                                           className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all whitespace-nowrap active:scale-95 flex-shrink-0 ${uploadCategory === cat.id ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-primary-500 hover:text-primary-600'}`}
                                       >
                                           {cat.label}
                                       </button>
                                   ))}
                               </div>
                           </div>

                           <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50/20 dark:hover:bg-primary-900/10 transition-all group bg-slate-50 dark:bg-slate-950/50 ${isUploading ? 'opacity-70 pointer-events-none' : 'shadow-inner'}`}>
                               {isUploading ? <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-3" /> : <Upload className="w-10 h-10 text-slate-300 group-hover:text-primary-500 mb-3 transition-all" />}
                               <p className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest text-center">{isUploading ? '正在上传...' : `点此存档至【${categories.find(c => c.id === uploadCategory)?.label}】`}</p>
                               <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                           </div>
                       </div>
                       
                       <div className="space-y-3 pb-6">
                           <div className="flex items-center justify-between px-2 mb-4">
                               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">已同步附件清单</h4>
                               <span className="text-[9px] font-black px-2 py-0.5 bg-slate-900 text-white rounded-md">{node.attachments.length} 项</span>
                           </div>
                           {node.attachments.map((file) => (
                               <div key={file.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 group hover:shadow-md transition-all shadow-sm">
                                   <div className="flex items-center gap-4 overflow-hidden">
                                       <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700 transition-all group-hover:scale-110 shadow-sm flex-shrink-0"><FileIcon className="w-5 h-5 text-primary-600" /></div>
                                       <div className="min-w-0">
                                           <p className="text-sm font-black text-slate-800 dark:text-white truncate transition-colors group-hover:text-primary-600 leading-tight mb-1">{file.name}</p>
                                           <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-tighter">
                                              <span className="text-primary-600 bg-primary-50 dark:bg-primary-900/40 px-1.5 py-0.5 rounded border border-primary-100 dark:border-primary-800">{categories.find(c => c.id === file.category)?.label || '附件'}</span>
                                              <span className="text-slate-400">{file.size}</span>
                                           </div>
                                       </div>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <a href={file.url} download className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all active:scale-95">下载</a>
                                      <button onClick={() => handleDeleteFile(file.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 className="w-4.5 h-4.5" /></button>
                                   </div>
                               </div>
                           ))}
                           {node.attachments.length === 0 && (
                               <div className="text-center py-16 text-slate-300 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                   <p className="font-bold text-[10px] uppercase tracking-widest opacity-40">暂无工程过程文件</p>
                               </div>
                           )}
                       </div>
                   </div>
               )}

               {activeTab === 'memos' && (
                   <div className="flex flex-col h-full animate-in fade-in transition-all">
                       <div className="flex-1 overflow-y-auto space-y-5 mb-5 custom-scrollbar bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-inner min-h-[250px]">
                           {node.memos.map((memo) => (
                               <div key={memo.id} className="flex gap-4 group transition-all">
                                   <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-black transition-all shadow-md">{memo.author[0]}</div>
                                   <div className="flex-1 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl rounded-tl-none border border-white dark:border-slate-700 transition-all shadow-sm group-hover:shadow-md relative">
                                       <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-medium">{memo.content}</p>
                                       <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/50 dark:border-slate-800 transition-all">
                                           <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{memo.author} · {formatBeijingTime(memo.createdAt).split(' ')[1]}</p>
                                           <History className="w-3 h-3 text-slate-300" />
                                       </div>
                                   </div>
                               </div>
                           ))}
                           {node.memos.length === 0 && (
                               <div className="text-center py-20 opacity-20 flex flex-col items-center">
                                   <History className="w-12 h-12 mb-4" />
                                   <p className="font-black text-[10px] uppercase tracking-widest italic">暂无现场反馈记录</p>
                               </div>
                           )}
                       </div>
                       <div className="relative mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 transition-all w-full pb-2">
                           <textarea 
                               value={newMemo} 
                               onChange={(e) => setNewMemo(e.target.value)} 
                               placeholder="录入结论、技术问题或反馈..." 
                               className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-5 py-4 pr-16 focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 resize-none text-sm dark:text-white transition-all font-medium shadow-sm" 
                               rows={2} 
                           />
                           <button 
                               onClick={handleAddMemo} 
                               disabled={!newMemo.trim()} 
                               className="absolute bottom-6 right-3 p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-30 shadow-lg transition-all active:scale-90"
                           >
                               <Send className="w-5 h-5" />
                           </button>
                       </div>
                   </div>
               )}
           </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-center items-center gap-6 shrink-0">
           <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 实时数据加密同步</span>
           <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-primary-500" /> 变更留痕存档</span>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;

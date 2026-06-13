
import React, { useState, useMemo, useRef } from 'react';
import { Project, User, Client, Approval } from '../types';
import { DEPARTMENTS } from '../constants';
import { Search, Plus, Calendar, Building2, User as UserIcon, ArrowLeft, ArrowRight, Upload, X, Trash2, Edit2, Download, Lock, Filter } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  users: User[];
  clients: Client[];
  onSelectProject: (project: Project) => void;
  onAddUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onAddProject: (project: Partial<Project>) => void;
  onUpdateProject?: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  currentUser: User;
  onAddApproval: (approval: Approval) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, 
  users, 
  clients, 
  onSelectProject, 
  onAddUser, 
  onDeleteUser, 
  onAddProject, 
  onUpdateProject, 
  onDeleteProject, 
  currentUser,
  onAddApproval
}) => {
  const isRegularUser = currentUser.role !== 'Admin';
  
  const [selectedManager, setSelectedManager] = useState<string | null>(isRegularUser ? currentUser.nickname : null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortType, setSortType] = useState<'date' | 'contract' | 'name'>('date');
  
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectFormData, setProjectFormData] = useState({
      name: '', manager: '', clientName: '', startDate: '', deadline: '', contractNo: '', internalContractNo: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCreateProjects = currentUser.isDefaultAdmin || currentUser.role === 'Admin' || currentUser.role === 'Manager' || ['总经办', '销售部', '工程部'].includes(currentUser.department);

  const managers = useMemo(() => {
    if (isRegularUser) return [];

    const stats: Record<string, { userId?: string; name: string, department?: string, avatar?: string, count: number, active: number, sumProgress: number, avgProgress: number, isGhost?: boolean, isDefaultAdmin?: boolean, isPublic?: boolean }> = {};
    
    projects.forEach(p => {
        if (!p.manager) return;
        if (!stats[p.manager]) {
            const user = users.find(u => u.nickname === p.manager);
            if (user) {
                stats[p.manager] = { userId: user.id, name: user.nickname, department: user.department, avatar: user.avatar, count: 0, active: 0, sumProgress: 0, avgProgress: 0, isDefaultAdmin: user.isDefaultAdmin };
            } else {
                stats[p.manager] = { name: p.manager, department: '未知/已离职', avatar: '', count: 0, active: 0, sumProgress: 0, avgProgress: 0, isGhost: true };
            }
        }
        const entry = stats[p.manager];
        entry.count += 1;
        if (p.status === 'Active') entry.active += 1;
        entry.sumProgress += p.progress;
    });

    users.forEach(u => {
        if (u.isDefaultAdmin) return; 
        const visibleDepts = ['销售部', '工程部', '设计部', '总经办']; 
        if (!visibleDepts.includes(u.department) && !stats[u.nickname]) return;

        if (!stats[u.nickname]) { 
            stats[u.nickname] = { 
                userId: u.id, 
                name: u.nickname, 
                department: u.department, 
                avatar: u.avatar, 
                count: 0, active: 0, sumProgress: 0, avgProgress: 0,
                isDefaultAdmin: u.isDefaultAdmin
            }; 
        }
    });

    Object.values(stats).forEach(entry => { 
        entry.avgProgress = entry.count > 0 ? Math.round(entry.sumProgress / entry.count) : 0; 
    });

    return Object.values(stats);
  }, [projects, users, isRegularUser]);

  const filteredManagers = managers.filter(m => 
      (m.name && m.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
      (m.department && m.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedProjects = useMemo(() => {
      const managerToFilter = selectedManager || (isRegularUser ? currentUser.nickname : null);
      if (!managerToFilter) return [];

      let list = projects
          .filter(p => p.manager === managerToFilter && (
              p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              p.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
              p.clientName.toLowerCase().includes(searchTerm.toLowerCase())
          ));
          
      return list.sort((a, b) => {
          if (sortType === 'date') {
              const valA = a.startDate ? new Date(a.startDate).getTime() : 0;
              const valB = b.startDate ? new Date(b.startDate).getTime() : 0;
              return valB - valA;
          } else if (sortType === 'contract') {
              return (a.code || '').localeCompare(b.code || '');
          } else if (sortType === 'name') {
              return (a.name || '').localeCompare(b.name || '', 'zh-CN');
          }
          return 0;
      });
  }, [projects, selectedManager, searchTerm, sortType, currentUser, isRegularUser]);

  const handleExportCSV = () => {
      const targetProjects = sortedProjects;
      if (targetProjects.length === 0) return alert("无可导出的项目");
      const headers = ['项目名称', '项目编号', '合同号', '客户名称', '负责人', '开始日期', '交付截止', '状态', '进度'];
      const rows = targetProjects.map(p => [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.code}"`,
          `"${p.contractNo || ''}"`,
          `"${p.clientName.replace(/"/g, '""')}"`,
          `"${p.manager}"`,
          p.startDate, p.deadline, p.status, `${p.progress}%`
      ].join(','));
      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `工程项目台账_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  const handleOpenProjectModal = (e: React.MouseEvent | null, project?: Project) => { 
      if (e) { e.preventDefault(); e.stopPropagation(); } 
      if (project) { 
          setEditingProject(project); 
          setProjectFormData({ 
              name: project.name, 
              manager: project.manager, 
              clientName: project.clientName, 
              startDate: project.startDate, 
              deadline: project.deadline, 
              contractNo: project.contractNo || '', 
              internalContractNo: project.internalContractNo || '' 
          }); 
      } else { 
          setEditingProject(null); 
          setProjectFormData({ 
              name: '', 
              manager: selectedManager || currentUser.nickname, 
              clientName: '', 
              startDate: '', 
              deadline: '', 
              contractNo: '', 
              internalContractNo: '' 
          }); 
      } 
      setIsProjectModalOpen(true); 
  };
  
  const handleSaveProject = () => { 
      if (!projectFormData.name || !projectFormData.clientName) return alert('信息不全'); 
      const payload: Partial<Project> = {
          ...projectFormData,
          status: projectFormData.startDate ? 'Active' : 'Pending',
          progress: editingProject ? editingProject.progress : 0
      };
      if (editingProject && onUpdateProject) { 
          onUpdateProject({ ...editingProject, ...payload }); 
      } else { 
          onAddProject(payload); 
      } 
      setIsProjectModalOpen(false); 
  };

  const handleRemoveProject = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      const isOwner = project.manager === currentUser.nickname;
      const isSuperAdmin = currentUser.isDefaultAdmin;
      const createdAt = new Date(project.createdAt || new Date().toISOString());
      const hoursDiff = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      if (isSuperAdmin || (isOwner && hoursDiff < 24)) {
          if (window.confirm(`警告：确定要永久删除项目 "${project.name}" 吗？此操作无法撤销。`)) {
              onDeleteProject(project.id);
          }
      } else {
          if (window.confirm(`该项目已超过 24 小时保护期。为了保障工程数据安全性，删除需要提交申请给超级管理员。是否发起删除申请？`)) {
              const superAdmin = users.find(u => u.isDefaultAdmin);
              const nowISO = new Date().toISOString();
              // Fix: Corrected Approval object structure to match interface definition
              onAddApproval({
                  id: Math.random().toString(36).substr(2, 9),
                  title: `[删除申请] 项目: ${project.name}`,
                  type: 'Deletion',
                  applicantId: currentUser.id,
                  applicantName: currentUser.nickname,
                  department: currentUser.department,
                  
                  strategy: 'OR_SIGN', 
                  approverIds: [superAdmin?.id || 'u-1'],
                  approverNamesDisplay: superAdmin?.nickname || '超级管理员',

                  status: 'Pending',
                  currentContent: `申请删除项目：${project.name} (Code: ${project.code})。`,
                  currentAttachments: [],
                  versions: [],
                  createdAt: nowISO,
                  updatedAt: nowISO,
                  relatedId: project.id,
                  relatedType: 'Project'
              } as Approval);
              alert("删除申请已提交。");
          }
      }
  };

  return (
    <div className="max-w-7xl mx-auto px-1 md:px-0 pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
          <div className="w-full md:w-auto">
              {selectedManager && !isRegularUser ? (
                  <>
                    <button onClick={() => { setSelectedManager(null); setSearchTerm(''); }} className="text-sm text-slate-500 hover:text-primary-600 flex items-center gap-1 mb-2 transition-colors font-bold">
                        <ArrowLeft className="w-4 h-4" /> 返回人员看板
                    </button>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white truncate">{selectedManager} 的项目清单</h2>
                  </>
              ) : (
                  <>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {isRegularUser ? '我的工程项目' : '全员项目概览'}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-xs md:text-sm">
                        {isRegularUser ? '查阅并跟进您负责的所有工程进度' : '厨房设备工程全生命周期管控系统'}
                    </p>
                  </>
              )}
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto no-scrollbar">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder={selectedManager || isRegularUser ? "搜索..." : "按负责人..."}
                    className="w-full pl-9 pr-3 py-2 md:py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                />
            </div>
            {(selectedManager || isRegularUser) && (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2 py-2 text-xs shadow-sm flex-shrink-0">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                        className="bg-transparent font-black text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-[10px] md:text-xs"
                        value={sortType}
                        onChange={(e) => setSortType(e.target.value as any)}
                    >
                        <option value="date">日期</option>
                        <option value="contract">编号</option>
                        <option value="name">名称</option>
                    </select>
                </div>
            )}
            <button onClick={handleExportCSV} className="p-2 md:p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all shadow-sm flex-shrink-0">
                <Download className="w-4 h-4" />
            </button>
            {canCreateProjects && (selectedManager || isRegularUser) && (
                <button onClick={(e) => handleOpenProjectModal(e)} className="bg-primary-600 text-white px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-primary-700 flex items-center gap-1.5 md:gap-2 shadow-lg shadow-primary-500/20 whitespace-nowrap font-black transition-all active:scale-95 flex-shrink-0">
                    <Plus className="w-4 h-4" /><span className="text-xs md:text-sm">新建</span>
                </button>
            )}
          </div>
        </div>

        {!selectedManager && !isRegularUser ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                {filteredManagers.map((manager) => (
                    <div 
                      key={manager.name} 
                      onClick={() => { setSelectedManager(manager.name); setSearchTerm(''); }} 
                      className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 md:p-4 hover:shadow-2xl hover:scale-[1.02] hover:border-primary-600 transition-all cursor-pointer flex flex-col items-center text-center relative overflow-hidden active:scale-[0.98] shadow-sm"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700 group-hover:bg-primary-500 transition-colors" />
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-2 md:mb-4 border-2 md:border-4 border-white dark:border-slate-600 shadow-md overflow-hidden">
                            {manager.avatar ? <img src={manager.avatar} className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />}
                        </div>
                        <h3 className="text-sm md:text-lg font-black text-slate-800 dark:text-white mb-0.5 truncate w-full">{manager.name}</h3>
                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-4 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 truncate max-w-full">
                          {manager.department || '未知部门'}
                        </p>
                        <div className="flex items-center justify-center gap-2 md:gap-4 w-full mb-3 md:mb-4 py-1.5 md:py-2 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl">
                            <div className="text-center">
                              <p className="text-sm md:text-lg font-black text-slate-700 dark:text-slate-200">{manager.count}</p>
                              <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest">总计</p>
                            </div>
                            <div className="w-px h-4 md:h-6 bg-slate-200 dark:border-slate-700"></div>
                            <div className="text-center">
                              <p className="text-sm md:text-lg font-black text-primary-600 dark:text-primary-400">{manager.active}</p>
                              <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest">在研</p>
                            </div>
                        </div>
                        <button className="w-full py-1.5 md:py-2 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[8px] md:text-[9px] uppercase tracking-widest group-hover:bg-primary-600 group-hover:text-white transition-all flex items-center justify-center gap-1.5">
                          查阅 <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {sortedProjects.map((project) => (
                    <div 
                      key={project.id} 
                      onClick={() => onSelectProject(project)} 
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 md:p-8 shadow-sm hover:shadow-2xl hover:scale-[1.02] hover:border-primary-600 transition-all cursor-pointer group relative active:scale-[0.98]"
                    >
                        <div className="flex justify-between items-start mb-4 md:mb-6">
                            <span className="text-[9px] md:text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl">{project.code}</span>
                            <span className={`text-[9px] md:text-[10px] font-black px-2 py-1 md:px-3 md:py-1.5 rounded-full uppercase tracking-widest ${project.status === 'Active' ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30'}`}>{project.status === 'Active' ? '进行中' : '已完工'}</span>
                        </div>
                        <h3 className="text-base md:text-xl font-black text-slate-800 dark:text-white mb-2 md:mb-3 truncate group-hover:text-primary-600 transition-colors">{project.name}</h3>
                        <div className="space-y-2 md:space-y-3 mb-6 md:mb-8 text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                            <div className="flex items-center"><Building2 className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 text-slate-400" /><span className="truncate">{project.clientName}</span></div>
                            <div className="flex items-center"><Calendar className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 text-slate-400" />交付: {project.deadline || '未定'}</div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 md:h-2.5 mb-4 md:mb-5 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-primary-600 transition-all duration-1000 ease-out" style={{ width: `${project.progress}%` }}></div></div>
                        <div className="flex justify-between items-center text-[10px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.1em] md:tracking-[0.2em]"><span>进度: {project.progress}%</span><span className="text-primary-600 flex items-center gap-1.5">立即进入 <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" /></span></div>
                        
                        {(currentUser.isDefaultAdmin || project.manager === currentUser.nickname) && (
                            <div className="absolute top-4 right-4 md:top-6 md:right-6 flex gap-1.5 md:gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={(e) => handleOpenProjectModal(e, project)} className="p-1.5 md:p-2 bg-white dark:bg-slate-700 rounded-lg md:rounded-xl shadow-xl text-primary-600 hover:bg-primary-50"><Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                                <button onClick={(e) => handleRemoveProject(e, project)} className="p-1.5 md:p-2 bg-white dark:bg-slate-700 rounded-lg md:rounded-xl shadow-xl text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                            </div>
                        )}
                    </div>
                ))}
                {sortedProjects.length === 0 && (
                    <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center">
                        <Building2 className="w-16 h-16 mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest">未检索到工程项目</p>
                    </div>
                )}
            </div>
        )}

        {isProjectModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 md:p-4">
                <div className="bg-white dark:bg-slate-800 w-full max-xl rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl animate-in zoom-in-95 max-h-[95vh] overflow-y-auto border border-white/20 transition-all custom-scrollbar">
                    <div className="flex justify-between items-center mb-6 md:mb-8 border-b dark:border-slate-700 pb-4 md:pb-6"><h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white">{editingProject ? '修改项目台账' : '开设新工程项目'}</h3><button onClick={() => setIsProjectModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 md:w-7 md:h-7 text-slate-500" /></button></div>
                    <div className="space-y-4 md:space-y-6">
                        <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">工程项目名称 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner text-sm md:text-base" value={projectFormData.name} onChange={e => setProjectFormData({...projectFormData, name: e.target.value})} placeholder="例如：某某万象城厨房工程" /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">内部管控编号</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono shadow-inner text-sm md:text-base" value={projectFormData.internalContractNo} onChange={e => setProjectFormData({...projectFormData, internalContractNo: e.target.value})} placeholder="IN-2025-XXXX" /></div>
                            <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">甲方合同编号</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono shadow-inner text-sm md:text-base" value={projectFormData.contractNo} onChange={e => setProjectFormData({...projectFormData, contractNo: e.target.value})} placeholder="CT-2025-XXXX" /></div>
                        </div>
                        <div>
                            <label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">建设单位全称 *</label>
                            <input 
                                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner text-sm md:text-base"
                                value={projectFormData.clientName}
                                onChange={e => setProjectFormData({...projectFormData, clientName: e.target.value})}
                                list="clients-list"
                                placeholder="输入并检索单位库"
                            />
                            <datalist id="clients-list">{clients.map(c => <option key={c.id} value={c.companyName} />)}</datalist>
                        </div>
                        <div className="grid grid-cols-2 gap-4 md:gap-6">
                            <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">计划开工日期</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner text-xs md:text-sm" value={projectFormData.startDate} onChange={e => setProjectFormData({...projectFormData, startDate: e.target.value})} /></div>
                            <div><label className="block text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5">承诺交付日期</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 md:p-4 rounded-xl md:rounded-2xl outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner text-xs md:text-sm" value={projectFormData.deadline} onChange={e => setProjectFormData({...projectFormData, deadline: e.target.value})} /></div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 md:gap-5 mt-8 md:mt-12 pt-4 md:pt-6 border-t dark:border-slate-700 transition-all">
                        <button onClick={() => setIsProjectModalOpen(false)} className="px-5 md:px-8 py-3 text-slate-500 font-black uppercase tracking-widest text-[10px] md:text-xs">放弃</button>
                        <button onClick={handleSaveProject} className="px-8 md:px-12 py-3 bg-primary-600 text-white rounded-xl md:rounded-2xl shadow-2xl shadow-primary-500/30 font-black active:scale-95 uppercase tracking-widest text-[10px] md:text-xs">同步台账</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default ProjectList;

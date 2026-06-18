
import React, { useState, useMemo } from 'react';
import ProjectSummary from './ProjectSummary';
import TaskDetailModal from './TaskDetailModal';
import { WorkflowNode, TaskStatus, Project, ArchiveItem, User, Approval } from '../types';
import { INITIAL_WORKFLOW } from '../constants';
import { Check, ChevronRight, AlertCircle, FileText, Calendar, ArrowLeft, RefreshCw, User as UserIcon, Filter, Search, ArrowRight, Layers, CheckCircle2, Circle } from 'lucide-react';

interface ProjectWorkflowProps {
  project: Project;
  nodes: WorkflowNode[];
  onUpdateNode: (updatedNode: WorkflowNode) => void;
  onUpdateProject?: (project: Project) => void;
  onBack: () => void;
  onAddArchive: (archive: ArchiveItem) => void;
  onDeleteArchive: (id: string) => void;
  archives?: ArchiveItem[];
  currentUser: User;
  users?: User[]; 
}

const ProjectWorkflow: React.FC<ProjectWorkflowProps> = ({ project, nodes, onUpdateNode, onUpdateProject, onBack, onAddArchive, onDeleteArchive, archives, currentUser, users = [] }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<'All' | 'Key' | 'Pending' | 'Mine'>('All');
  const [taskSearch, setTaskSearch] = useState('');

  const selectedNode = useMemo(() => 
    (nodes || []).find(n => n.id === selectedNodeId) || null
  , [nodes, selectedNodeId]);

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      const matchSearch = n.title.toLowerCase().includes(taskSearch.toLowerCase());
      if (!matchSearch) return false;

      if (taskFilter === 'Key') return n.isKeyNode;
      if (taskFilter === 'Pending') return n.status !== TaskStatus.COMPLETED;
      if (taskFilter === 'Mine') return n.assignee === currentUser.nickname;
      return true;
    });
  }, [nodes, taskFilter, taskSearch, currentUser.nickname]);

  const phaseNames = ['前期对接 & 设计', '生产准备', '进场施工', '安装调试', '验收交付', '结算收尾'];

  const phases = useMemo<Record<string, WorkflowNode[]>>(() => {
    const groups: Record<string, WorkflowNode[]> = {};
    if (!filteredNodes || filteredNodes.length === 0) return groups;
    
    phaseNames.forEach(p => groups[p] = []);

    filteredNodes.forEach(node => {
      const phaseName = (node.phase || '其它节点').trim();
      if (!groups[phaseName]) groups[phaseName] = [];
      groups[phaseName].push(node);
    });
    
    if (taskFilter !== 'All' || taskSearch) {
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) delete groups[key];
        });
    }

    return groups;
  }, [filteredNodes, taskFilter, taskSearch]);

  const getStatusBorderClass = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED: return 'border-l-emerald-500';
      case TaskStatus.IN_PROGRESS: return 'border-l-primary-500';
      case TaskStatus.BLOCKED: return 'border-l-red-500'; 
      default: return 'border-l-slate-400';
    }
  };

  const getStatusDotClass = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED: return 'bg-emerald-500';
      case TaskStatus.IN_PROGRESS: return 'bg-primary-500';
      case TaskStatus.BLOCKED: return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  const handleInitializeWorkflow = () => {
      if (onUpdateProject) {
          if (window.confirm("确定要为该工程同步厨房设备工程标准的 23 个核心关键任务节点吗？")) {
              const standardNodes: WorkflowNode[] = JSON.parse(JSON.stringify(INITIAL_WORKFLOW)).map((n: WorkflowNode) => ({
                  ...n,
                  createdAt: new Date().toISOString()
              }));
              const completedCount = standardNodes.filter(n => n.status === TaskStatus.COMPLETED).length;
              const newProgress = Math.round((completedCount / standardNodes.length) * 100);
              onUpdateProject({ ...project, nodes: standardNodes, progress: newProgress });
          }
      }
  };

  const getNodeAssigneeAvatar = (nickname: string) => {
      const u = users?.find(u => u.nickname === nickname);
      return u?.avatar;
  };

  return (
    <div className="max-w-7xl mx-auto px-1 md:px-0 pb-16 transition-all">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
        <div className="w-full">
          <button onClick={onBack} className="mb-3 flex items-center text-xs md:text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 transition-all font-black group">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> 返回项目台账
          </button>
          <div className="flex items-center space-x-2 text-[10px] md:text-sm text-slate-500 mb-1 md:mb-2 font-bold">
            <span className="uppercase tracking-widest">ORDER</span>
            <ChevronRight className="w-3 h-3" />
            <span className="bg-slate-800 text-white dark:bg-slate-700 px-2 py-0.5 rounded text-[9px] md:text-[11px] font-mono shadow-sm">{project.code}</span>
          </div>
          <h2 className="text-xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight truncate">{project.name}</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64 md:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="检索任务节点..." 
                    className="w-full pl-11 pr-4 py-2.5 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-sm"
                    value={taskSearch}
                    onChange={e => setTaskSearch(e.target.value)}
                />
            </div>
            <div className="flex w-full sm:w-auto bg-slate-200 dark:bg-slate-900 p-1 rounded-xl md:rounded-2xl border border-slate-300 dark:border-slate-700 shadow-inner overflow-hidden">
                {[
                    { id: 'All', label: '全部' },
                    { id: 'Key', label: '核心' },
                    { id: 'Mine', label: '我的' },
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setTaskFilter(tab.id as any)}
                        className={`flex-1 sm:flex-none px-4 md:px-6 py-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all ${taskFilter === tab.id ? 'bg-primary-600 text-white shadow-xl scale-105' : 'text-slate-600 dark:text-slate-400 hover:text-primary-600'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <ProjectSummary project={project} nodes={nodes || []} archives={archives} onUpdateProject={onUpdateProject} />

      {/* Engineering Lifecycle Roadmap - Compact Version */}
      {nodes && nodes.length > 0 && (
          <div className="bg-white dark:bg-slate-800 p-3 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 dark:border-slate-700 shadow-sm mb-6 md:mb-8 transition-all">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-1 bg-primary-600 rounded-lg shadow-md shadow-primary-500/20 flex-shrink-0">
                    <Layers className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">工程全周期执行路线图</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 relative">
                  <div className="hidden md:block absolute top-[16px] left-10 right-10 h-0.5 bg-slate-100 dark:bg-slate-700 z-0"></div>
                  
                  {phaseNames.map((p, idx) => {
                      const phaseNodes = nodes.filter(n => n.phase === p);
                      const isCompleted = phaseNodes.length > 0 && phaseNodes.every(n => n.status === TaskStatus.COMPLETED);
                      const isStarted = phaseNodes.some(n => n.status !== TaskStatus.PENDING);
                      const isCurrent = isStarted && !isCompleted;

                      return (
                          <div key={p} className={`flex md:flex-col items-center gap-2 md:gap-0 text-left md:text-center relative z-10 p-1.5 rounded-lg transition-all ${isCurrent ? 'bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800' : ''}`}>
                              <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl flex-shrink-0 flex items-center justify-center border-2 md:border-[3px] transition-all duration-500 ${
                                  isCompleted ? 'bg-emerald-500 border-white dark:border-slate-800 text-white shadow-md shadow-emerald-500/20' :
                                  isCurrent ? 'bg-primary-600 border-white dark:border-slate-800 text-white shadow-md shadow-primary-500/20 scale-105' :
                                  'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-300'
                              }`}>
                                  {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <span className="font-black text-[9px] md:text-xs">{idx + 1}</span>}
                              </div>
                              <div className="min-w-0">
                                <p className={`md:mt-1.5 text-[6px] md:text-[8.5px] font-black uppercase tracking-tighter max-w-full md:max-w-[75px] leading-tight ${isCurrent ? 'text-primary-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {p}
                                </p>
                                {isCurrent && (
                                    <div className="mt-1 flex gap-0.5 justify-center">
                                        <span className="w-0.5 h-0.5 md:w-1 md:h-1 bg-primary-600 rounded-full animate-bounce"></span>
                                        <span className="w-0.5 h-0.5 md:w-1 md:h-1 bg-primary-600 rounded-full animate-bounce [animation-delay:200ms]"></span>
                                        <span className="w-0.5 h-0.5 md:w-1 md:h-1 bg-primary-600 rounded-full animate-bounce [animation-delay:400ms]"></span>
                                    </div>
                                )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      <div className="space-y-10 md:space-y-16 mt-6 md:mt-10 relative px-1 md:px-2">
        {(!nodes || nodes.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-16 md:py-24 bg-white dark:bg-slate-900 rounded-2xl border-4 border-dashed border-slate-200 dark:border-slate-800 shadow-inner p-6 text-center">
                <div className="p-5 md:p-6 bg-slate-100 dark:bg-slate-800 rounded-full mb-5 md:mb-6 shadow-sm">
                    <AlertCircle className="w-10 h-10 md:w-14 md:h-14 text-slate-300 opacity-50" />
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-black text-lg md:text-xl">该工程尚未激活任务流</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-1.5 mb-6 md:mb-8 font-medium">请点击下方按钮，一键同步行业标准 23 个关键执行节点</p>
                {onUpdateProject && (
                    <button onClick={handleInitializeWorkflow} className="bg-primary-600 text-white px-6 md:px-10 py-3 md:py-4 rounded-xl md:rounded-2xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-500/40 flex items-center gap-2 md:gap-3 font-black active:scale-95 text-sm md:text-base">
                        <RefreshCw className="w-4 h-4 md:w-5 md:h-5" /> 激活 23 个核心任务
                    </button>
                )}
            </div>
        ) : (
            (Object.entries(phases) as [string, WorkflowNode[]][]).map(([phaseName, phaseNodes], index) => (
            <div key={phaseName} className="relative animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: `${index * 120}ms` }}>
                {index !== Object.keys(phases).length - 1 && (
                    <div className="hidden md:block absolute left-8 top-12 bottom-[-4rem] w-1 bg-slate-200 dark:bg-slate-700/50 z-0 rounded-full opacity-50" />
                )}
                
                <div className="flex flex-col md:flex-row items-start mb-4 md:mb-8 relative z-10 gap-3 md:gap-0">
                    <div className="flex-shrink-0 w-10 h-10 md:w-16 md:h-16 bg-slate-900 dark:bg-primary-600 rounded-xl md:rounded-[1.2rem] border-2 md:border-4 border-white dark:border-slate-800 shadow-xl flex items-center justify-center text-base md:text-xl font-black text-white md:mr-8 transition-all hover:scale-110">
                        {index + 1}
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6 bg-white dark:bg-slate-800 p-3.5 md:p-5 rounded-xl md:rounded-[1.5rem] shadow-md border border-slate-100 dark:border-slate-700 transition-all group">
                            <div className="flex items-center gap-3 md:gap-4">
                                <h3 className="text-base md:text-2xl font-black text-slate-800 dark:text-white tracking-tight group-hover:text-primary-600 transition-colors">{phaseName}</h3>
                                <div className="h-5 md:h-6 w-0.5 bg-primary-600 rounded-full opacity-30"></div>
                                <span className="text-[8px] md:text-[10px] font-black text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full border border-primary-100 dark:border-primary-800 uppercase">
                                    {phaseNodes.length}节点
                                </span>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[7px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">阶段进度</span>
                                <div className="flex-1 md:w-48 h-2 md:h-2.5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-white dark:border-slate-700 shadow-inner">
                                    <div 
                                        className="h-full bg-primary-600 shadow-sm transition-all duration-1000 rounded-full" 
                                        style={{ width: `${Math.round((phaseNodes.filter(n => n.status === TaskStatus.COMPLETED).length / phaseNodes.length) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                            {phaseNodes.map((node) => (
                                <div 
                                    key={node.id} 
                                    onClick={() => setSelectedNodeId(node.id)} 
                                    className={`group relative p-4 md:p-5 rounded-xl md:rounded-[1.2rem] border shadow-sm hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300 cursor-pointer bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 ${getStatusBorderClass(node.status)} border-l-[6px] md:border-l-[8px] active:scale-[0.99] overflow-hidden hover:bg-primary-50/50 dark:hover:bg-primary-900/10 hover:border-primary-300`}
                                >
                                    <div className="flex justify-between items-start mb-3 md:mb-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-2 h-2 rounded-full ${getStatusDotClass(node.status)} shadow-sm group-hover:scale-110 transition-transform`} />
                                            <span className="text-[7px] md:text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                                                {node.status === TaskStatus.PENDING ? '待办' : node.status === TaskStatus.IN_PROGRESS ? '进行中' : node.status === TaskStatus.COMPLETED ? '完结' : '受阻'}
                                            </span>
                                        </div>
                                        {node.attachments.length > 0 && (
                                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all group-hover:bg-primary-600 group-hover:text-white group-hover:border-primary-600">
                                                <FileText className="w-3 h-3" />
                                                <span className="text-[8px] font-black">{node.attachments.length}</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h4 className="font-black text-slate-800 dark:text-white text-sm md:text-base mb-2 md:mb-3 leading-[1.3] group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors line-clamp-2 min-h-[2rem] md:min-h-[2.4rem]">{node.title}</h4>
                                    
                                    {node.isKeyNode && (
                                        <div className="absolute top-4 right-4 md:top-5 md:right-5 flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping opacity-75" />
                                            <span className="text-[7px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100 uppercase shadow-sm">核心管控</span>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-700/50 pt-3 md:pt-4 mt-3 md:mt-4 transition-all group-hover:border-primary-100">
                                        <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                                            {node.assignee ? (
                                                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-1.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm transition-all group-hover:bg-white dark:group-hover:bg-slate-800">
                                                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-md bg-primary-100 dark:bg-primary-900 overflow-hidden border border-white dark:border-slate-700 flex-shrink-0">
                                                        {getNodeAssigneeAvatar(node.assignee) ? <img src={getNodeAssigneeAvatar(node.assignee)} className="w-full h-full object-cover" /> : <UserIcon className="w-2.5 h-2.5 m-0.5 text-primary-500" />}
                                                    </div>
                                                    <span className="text-[8px] md:text-[10px] font-black text-slate-800 dark:text-slate-200 truncate max-w-[50px] md:max-w-[70px]">{node.assignee}</span>
                                                </div>
                                            ) : <span className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest italic pl-1">未指派</span>}
                                            
                                            {node.deadline && (
                                                <div className={`flex items-center gap-1 text-[7px] md:text-[9px] font-black px-1.5 py-1 rounded-lg border transition-all flex-shrink-0 ${new Date(node.deadline) < new Date() && node.status !== TaskStatus.COMPLETED ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 shadow-sm'}`}>
                                                    <Calendar className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                                    <span>{node.deadline.slice(5)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[7px] md:text-[9px] font-black text-primary-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transform translate-x-1 group-hover:translate-x-0 transition-all flex items-center gap-0.5 flex-shrink-0">
                                          详情 <ArrowRight className="w-2.5 h-2.5" />
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            ))
        )}
      </div>

      {selectedNode && (
        <TaskDetailModal 
          node={selectedNode} 
          isOpen={!!selectedNode} 
          onClose={() => setSelectedNodeId(null)}
          onUpdate={onUpdateNode}
          onAddArchive={onAddArchive}
          onDeleteArchive={onDeleteArchive}
          projectName={project.name}
          projectId={project.id}
          currentUser={currentUser}
          users={users} 
        />
      )}
    </div>
  );
};

export default ProjectWorkflow;

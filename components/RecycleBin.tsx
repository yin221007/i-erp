
import React, { useState, useMemo } from 'react';
import { RecycleBinItem, User } from '../types';
import { Trash2, RotateCcw, Search, Filter, AlertTriangle, Database, Calendar, User as UserIcon, XCircle, Info } from 'lucide-react';
import { formatBeijingTime } from '../constants';

interface RecycleBinProps {
  items: RecycleBinItem[];
  currentUser: User;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onEmpty: () => void;
}

const RecycleBin: React.FC<RecycleBinProps> = ({ items, currentUser, onRestore, onPermanentDelete, onEmpty }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  
  const isSuperAdmin = currentUser.isDefaultAdmin;

  const filteredItems = useMemo(() => {
    return items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             item.deletedBy.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'All' || item.resourceType === typeFilter;
        return matchesSearch && matchesType;
    }).sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }, [items, searchTerm, typeFilter]);

  const getResourceTypeLabel = (type: string) => {
    switch (type) {
        case 'projects': return '工程项目';
        case 'clients': return '客户资料';
        case 'equipment': return '设备参数';
        case 'docs': return '知识中心';
        case 'archives': return '工程档案';
        case 'worklogs': return '工作记录';
        case 'payments': return '回款台账';
        case 'approvals': return '审批记录';
        case 'schedule': return '日程提醒';
        case 'production': return '生产进度';
        case 'users': return '用户账户';
        default: return type;
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col transition-all px-1 md:px-0">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
           <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-800 rounded-2xl shadow-xl">
                <Trash2 className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">系统回收站</h2>
           </div>
           <p className="text-slate-500 dark:text-slate-400 font-bold ml-12 mt-1 text-sm md:text-base">数据在回收站中将保留 30 天，逾期将永久自动删除。</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="搜索条目或操作人..." 
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-xs shadow-sm">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select 
                    className="bg-transparent font-black text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                >
                    <option value="All">全部类型</option>
                    <option value="projects">工程项目</option>
                    <option value="clients">客户资料</option>
                    <option value="equipment">设备参数</option>
                    <option value="archives">工程档案</option>
                    <option value="payments">回款台账</option>
                    <option value="worklogs">工作记录</option>
                    <option value="docs">知识中心</option>
                    <option value="users">用户账户</option>
                </select>
            </div>

            {isSuperAdmin && (
                <button 
                    onClick={onEmpty}
                    disabled={items.length === 0}
                    className="bg-red-500 text-white px-5 py-2.5 rounded-xl hover:bg-red-600 flex items-center gap-2 shadow-lg shadow-red-500/20 font-black transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                    <XCircle className="w-4 h-4" />
                    <span>清空回收站</span>
                </button>
            )}
        </div>
      </div>

      <div className="bg-orange-50 dark:bg-orange-950/20 border-2 border-orange-100 dark:border-orange-900/50 p-6 rounded-[2rem] flex items-start gap-4 mb-8 transition-all">
          <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0 mt-1" />
          <div>
              <h4 className="text-sm font-black text-orange-800 dark:text-orange-200 uppercase tracking-widest">安全与清理声明</h4>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium leading-relaxed">
                  1. 为了防止误操作，删除的数据将在此暂存。恢复数据将还原其完整状态。<br />
                  2. <b>30 天自动清理规则：</b> 任何入库超过 30 天的项目将被数据库彻底粉碎。<br />
                  3. 彻底删除或清空回收站权限仅授予<b>系统核心超级管理员</b>。
              </p>
          </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex-1 transition-all">
          <div className="hidden md:grid grid-cols-12 gap-4 p-6 border-b border-slate-50 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              <div className="col-span-4 pl-4">条目名称 / 原始类型</div>
              <div className="col-span-2">原操作人</div>
              <div className="col-span-3">删除时间</div>
              <div className="col-span-3 text-center">快捷管理</div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700 overflow-y-auto max-h-[calc(100vh-420px)] custom-scrollbar">
              {filteredItems.length === 0 ? (
                  <div className="p-32 text-center text-slate-300">
                      <Database className="w-16 h-16 mx-auto mb-6 opacity-10" />
                      <p className="font-black text-sm uppercase tracking-widest">回收站没有任何内容</p>
                  </div>
              ) : (
                  filteredItems.map(item => (
                      <div key={item.id} className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all group">
                          <div className="col-span-12 md:col-span-4 flex items-center gap-4 pl-2">
                              <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                                  <Info className="w-5 h-5 text-slate-400" />
                              </div>
                              <div className="min-w-0">
                                  <h4 className="text-sm font-black text-slate-800 dark:text-white truncate group-hover:text-primary-600 transition-colors">{item.name}</h4>
                                  <span className="inline-block text-[9px] font-black text-primary-600 bg-primary-50 dark:bg-primary-900/40 px-2 py-0.5 rounded-full mt-1 uppercase tracking-tighter">
                                      {getResourceTypeLabel(item.resourceType)}
                                  </span>
                              </div>
                          </div>
                          <div className="hidden md:flex col-span-2 items-center gap-2">
                              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{item.deletedBy}</span>
                          </div>
                          <div className="hidden md:flex col-span-3 items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{formatBeijingTime(item.deletedAt)}</span>
                          </div>
                          <div className="col-span-12 md:col-span-3 flex items-center justify-end md:justify-center gap-3">
                              <button 
                                onClick={() => onRestore(item.id)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-900 rounded-xl hover:bg-primary-600 hover:text-white transition-all shadow-sm text-[10px] font-black uppercase tracking-widest active:scale-90"
                              >
                                  <RotateCcw className="w-4 h-4" /> 恢复数据
                              </button>
                              {isSuperAdmin && (
                                  <button 
                                    onClick={() => onPermanentDelete(item.id)}
                                    className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all active:scale-90"
                                    title="永久粉碎"
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              )}
                          </div>
                      </div>
                  )
              ))}
          </div>
      </div>
    </div>
  );
};

export default RecycleBin;

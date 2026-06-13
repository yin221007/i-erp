
import React, { useState, useMemo, useRef } from 'react';
import { WorkLogEntry, User, AttendanceStatus } from '../types';
import { Plus, Calendar, Download, Edit2, Trash2, Clock, Briefcase, X, Save, ChevronLeft, ChevronRight, Upload, Lock, MoreHorizontal } from 'lucide-react';
import { getBeijingDateString } from '../constants';

interface WorkLogManagerProps {
  logs: WorkLogEntry[];
  users: User[];
  currentUser: User;
  onAddLog: (log: WorkLogEntry) => void;
  onUpdateLog: (log: WorkLogEntry) => void;
  onDeleteLog: (id: string) => void;
}

const WorkLogManager: React.FC<WorkLogManagerProps> = ({ logs, users, currentUser, onAddLog, onUpdateLog, onDeleteLog }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const isRegularUser = currentUser.role !== 'Admin';
  
  const [selectedUserId, setSelectedUserId] = useState<string>(
      isRegularUser ? currentUser.id : 'all'
  );
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<WorkLogEntry | null>(null);
  
  const [logDate, setLogDate] = useState(getBeijingDateString());
  const [logContent, setLogContent] = useState('');
  const [logDuration, setLogDuration] = useState(8);
  const [logStatus, setLogStatus] = useState<AttendanceStatus>('Present');

  const isAdminOrSuper = currentUser.role === 'Admin' || currentUser.isDefaultAdmin;

  const availableUsers = useMemo(() => {
      if (currentUser.isDefaultAdmin) return users;
      if (currentUser.role === 'Admin') return users; 
      return [currentUser];
  }, [users, currentUser]);

  const filteredLogs = useMemo(() => {
    const targetMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

    return logs.filter(log => {
      if (!log.date || !log.date.startsWith(targetMonthStr)) return false;

      if (isRegularUser) return log.userId === currentUser.id;

      if (selectedUserId !== 'all' && log.userId !== selectedUserId) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs, currentMonth, selectedUserId, currentUser, isRegularUser]);

  const stats = useMemo(() => {
    let totalHours = 0;
    let attendanceDays = 0;
    filteredLogs.forEach(log => {
      totalHours += log.duration || 0;
      if (['Present', 'BusinessTrip', 'Remote', 'Outsourced'].includes(log.status)) {
         attendanceDays++; 
      }
    });
    return { totalHours, attendanceDays };
  }, [filteredLogs]);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleOpenAdd = () => {
    setEditingLog(null);
    setLogDate(getBeijingDateString());
    setLogContent('');
    setLogDuration(8);
    setLogStatus('Present');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (log: WorkLogEntry) => {
    const canEdit = currentUser.isDefaultAdmin || log.userId === currentUser.id;
    if (!canEdit) return alert("为了数据真实性，您无权修改他人的工时记录。");
    
    setEditingLog(log);
    setLogDate(log.date);
    setLogContent(log.content);
    setLogDuration(log.duration);
    setLogStatus(log.status);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!logContent) {
      alert("请填写具体工作内容");
      return;
    }

    if (editingLog) {
      onUpdateLog({
        ...editingLog,
        date: logDate,
        content: logContent,
        duration: Number(logDuration),
        status: logStatus
      });
    } else {
      const newLog: WorkLogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUser.id,
        userName: currentUser.nickname,
        date: logDate,
        content: logContent,
        duration: Number(logDuration),
        status: logStatus,
        createdAt: new Date().toISOString()
      };
      onAddLog(newLog);
    }
    setIsModalOpen(false);
  };

  const handleRemove = (log: WorkLogEntry) => {
      onDeleteLog(log.id);
  };

  const handleDownload = () => {
    const headers = ['日期', '姓名', '状态', '时长(小时)', '工作内容'];
    const rows = filteredLogs.map(log => [
      log.date,
      log.userName,
      log.status,
      log.duration,
      `"${log.content.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `工作记录_${currentMonth.getFullYear()}-${currentMonth.getMonth()+1}.csv`;
    link.click();
  };

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
        case 'Present': return '正常出勤';
        case 'BusinessTrip': return '出差外勤';
        case 'Remote': return '远程办公';
        case 'Leave': return '请假';
        case 'Sick': return '病假';
        case 'Vacation': return '年假调休';
        case 'Outsourced': return '驻场委外';
        case 'PublicHoliday': return '节假日';
        default: return status;
    }
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
        case 'Present': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'BusinessTrip': return 'bg-primary-50 text-primary-700 border-primary-100';
        case 'Leave': case 'Sick': case 'Vacation': return 'bg-red-50 text-red-700 border-red-100';
        case 'Remote': return 'bg-cyan-50 text-cyan-700 border-cyan-100';
        default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col px-1 md:px-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-6">
        <div>
           <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">工时管理中心</h2>
           <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm md:text-base font-medium">{isRegularUser ? '记录并查看我的每日工时产出' : '查阅全员工程投入产出明细'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 shadow-sm flex-1 md:flex-none justify-between">
                <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <span className="mx-2 font-black text-slate-700 dark:text-slate-200 text-xs md:text-sm whitespace-nowrap">
                    {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                </span>
                <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {isAdminOrSuper && (
                <select 
                    className="border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 bg-white dark:bg-slate-800 text-[11px] font-black outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 dark:text-white transition-all shadow-sm flex-1 md:flex-none"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                >
                    <option value="all">全员记录</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.nickname}</option>)}
                </select>
            )}

            <button onClick={handleDownload} className="p-2.5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-all shadow-sm" title="导出台账">
                <Download className="w-5 h-5" />
            </button>

            <button onClick={handleOpenAdd} className="bg-primary-600 text-white px-5 py-2.5 rounded-xl hover:bg-primary-700 flex items-center gap-2 shadow-xl shadow-primary-500/20 font-black transition-all active:scale-95 uppercase tracking-widest text-[11px] flex-1 md:flex-none justify-center">
                <Plus className="w-4 h-4" /> <span>填报</span>
            </button>
        </div>
      </div>

      {/* 统计卡片：手机端 2+1 布局 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8 transition-all">
          <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3 md:gap-5 transition-all">
             <div className="p-2.5 md:p-4 bg-primary-50 dark:bg-primary-900/30 rounded-xl md:rounded-2xl text-primary-600 dark:text-primary-400 flex-shrink-0"><Clock className="w-5 h-5 md:w-7 md:h-7" /></div>
             <div className="min-w-0">
                 <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">周期累计总工时</p>
                 <p className="text-xl md:text-3xl font-black text-slate-800 dark:text-white truncate">{stats.totalHours} <span className="text-[10px] md:text-sm font-medium text-slate-400">h</span></p>
             </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3 md:gap-5 transition-all">
             <div className="p-2.5 md:p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl md:rounded-2xl text-emerald-600 dark:text-emerald-400 flex-shrink-0"><Briefcase className="w-5 h-5 md:w-7 md:h-7" /></div>
             <div className="min-w-0">
                 <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">有效出勤天数</p>
                 <p className="text-xl md:text-3xl font-black text-slate-800 dark:text-white truncate">{stats.attendanceDays} <span className="text-[10px] md:text-sm font-medium text-slate-400">天</span></p>
             </div>
          </div>
          <div className="col-span-2 md:col-span-1 bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3 md:gap-5 transition-all">
             <div className="p-2.5 md:p-4 bg-purple-50 dark:bg-primary-900/30 rounded-xl md:rounded-2xl text-purple-600 dark:text-purple-400 flex-shrink-0"><Calendar className="w-5 h-5 md:w-7 md:h-7" /></div>
             <div className="min-w-0">
                 <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">当前统计月份</p>
                 <p className="text-xl md:text-3xl font-black text-slate-800 dark:text-white truncate">{currentMonth.getMonth() + 1} <span className="text-[10px] md:text-sm font-medium text-slate-400">月份</span></p>
             </div>
          </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col transition-all">
         {/* 桌面端表头 */}
         <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
             <div className="col-span-2 pl-4">填报日期</div>
             <div className="col-span-2">职员姓名</div>
             <div className="col-span-2 text-center">当前状态</div>
             <div className="col-span-1 text-center">时长</div>
             <div className="col-span-4">工作内容摘要</div>
             <div className="col-span-1 text-center">快捷管理</div>
         </div>

         <div className="divide-y divide-slate-50 dark:divide-slate-700 overflow-y-auto flex-1 custom-scrollbar">
             {filteredLogs.length === 0 ? (
                 <div className="p-20 md:p-32 text-center text-slate-300">
                    <Calendar className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 opacity-5" />
                    <p className="font-black text-sm md:text-lg uppercase tracking-widest">暂无记录</p>
                 </div>
             ) : (
                 filteredLogs.map(log => {
                     const isOwner = currentUser.isDefaultAdmin || log.userId === currentUser.id;
                     return (
                        <div key={log.id} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/20 transition-all group">
                            {/* 桌面布局 */}
                            <div className="hidden md:grid grid-cols-12 gap-4 p-5 items-center text-sm">
                                <div className="col-span-2 font-mono font-bold text-slate-500 dark:text-slate-400 pl-4">{log.date}</div>
                                <div className="col-span-2 font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[11px] font-black text-primary-600 dark:text-primary-300 border-2 border-white dark:border-slate-600 shadow-sm group-hover:scale-110 transition-transform">
                                        {log.userName[0]}
                                    </div>
                                    {log.userName}
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${getStatusColor(log.status)}`}>
                                        {getStatusLabel(log.status)}
                                    </span>
                                </div>
                                <div className="col-span-1 text-center font-mono font-black text-slate-700 dark:text-slate-300">{log.duration}h</div>
                                <div className="col-span-4 text-slate-600 dark:text-slate-400 font-medium truncate px-2" title={log.content}>{log.content}</div>
                                <div className="col-span-1 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    {isOwner && (
                                        <>
                                            <button onClick={() => handleOpenEdit(log)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm"><Edit2 className="w-4 h-4" /></button>
                                            <button onClick={() => handleRemove(log)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* 手机卡片布局 */}
                            <div className="md:hidden p-4 flex flex-col gap-3 relative overflow-hidden">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xs font-black text-primary-600 border border-white dark:border-slate-700">
                                            {log.userName[0]}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-100">{log.userName}</span>
                                            <span className="text-[10px] font-mono text-slate-400 font-bold">{log.date}</span>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter border ${getStatusColor(log.status)}`}>
                                        {getStatusLabel(log.status)}
                                    </span>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed italic line-clamp-3">"{log.content}"</p>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <div className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400">
                                        <Clock className="w-3 h-3" />
                                        <span className="text-xs font-black font-mono">{log.duration}小时</span>
                                    </div>
                                    {isOwner && (
                                        <div className="flex gap-1.5">
                                            <button onClick={() => handleOpenEdit(log)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-lg active:bg-primary-600 active:text-white transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => handleRemove(log)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-lg active:bg-red-600 active:text-white transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                     );
                 })
             )}
         </div>
      </div>

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 transition-all">
              <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 transition-all border border-slate-200 dark:border-slate-700 overflow-y-auto max-h-[90vh] custom-scrollbar">
                  <div className="flex justify-between items-center mb-8 border-b dark:border-slate-700 pb-4">
                      <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white transition-colors">{editingLog ? '编辑记录' : '填报工时'}</h3>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"><X className="w-6 h-6 text-slate-500" /></button>
                  </div>

                  <div className="space-y-5 transition-all">
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">工作日期 *</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={logDate} onChange={e => setLogDate(e.target.value)} /></div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">投入工时 (h) *</label><input type="number" step="0.5" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={logDuration} onChange={e => setLogDuration(parseFloat(e.target.value))} /></div>
                          <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">当日状态</label>
                              <select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={logStatus} onChange={e => setLogStatus(e.target.value as AttendanceStatus)}>
                                  <option value="Present">正常出勤</option>
                                  <option value="BusinessTrip">出差外勤</option>
                                  <option value="Remote">远程办公</option>
                                  <option value="Leave">请假</option>
                                  <option value="Sick">病假</option>
                                  <option value="Vacation">年假/调休</option>
                                  <option value="Outsourced">驻场/委外</option>
                                  <option value="PublicHoliday">法定节假日</option>
                              </select>
                          </div>
                      </div>
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">工作内容摘要 *</label><textarea className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 h-32 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium shadow-inner resize-none text-sm" placeholder="请简述今日完成的主要工作任务..." value={logContent} onChange={e => setLogContent(e.target.value)} /></div>
                  </div>

                  <div className="flex justify-end gap-3 mt-10 pt-6 border-t dark:border-slate-700 transition-all">
                      <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-400 font-black uppercase tracking-widest text-[10px] transition-colors hover:text-slate-600">取消</button>
                      <button onClick={handleSave} className="px-10 py-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 flex items-center gap-2 font-black transition-all active:scale-95 uppercase tracking-widest text-[10px]"><Save className="w-4 h-4" /> 确认保存</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default WorkLogManager;

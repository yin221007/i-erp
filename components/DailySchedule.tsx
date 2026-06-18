
import React, { useState, useMemo } from 'react';
import { ScheduleItem, Project, User as UserType } from '../types';
import { Calendar as CalendarIcon, CheckCircle2, Clock, MapPin, Plus, ChevronLeft, ChevronRight, User, ArrowRight, Trash2, X, Save, ArrowLeft, AlertTriangle } from 'lucide-react';
import { getBeijingDateString } from '../constants';
// @ts-ignore
import { Solar } from 'lunar-javascript';

interface DailyScheduleProps {
  schedule: ScheduleItem[];
  projects: Project[];
  users: UserType[];
  onCompleteItem: (id: string) => void; 
  onDeleteItem: (id: string) => void;
  onAddItem: (item: ScheduleItem) => void;
  currentUser: UserType;
  onDeleteUser: (userId: string) => void;
}

const DailySchedule: React.FC<DailyScheduleProps> = ({ schedule, projects, users, onCompleteItem, onDeleteItem, onAddItem, currentUser, onDeleteUser }) => {
  const isRegularUser = currentUser.role !== 'Admin';
  
  const [selectedManager, setSelectedManager] = useState<string | null>(isRegularUser ? currentUser.nickname : null);
  
  const parseDateString = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0); 
  };

  const [selectedDate, setSelectedDate] = useState(parseDateString(getBeijingDateString()));
  const [currentMonth, setCurrentMonth] = useState(parseDateString(getBeijingDateString()));
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemData, setNewItemData] = useState({
      title: '',
      date: getBeijingDateString(), 
      time: '09:00',
      type: 'Other' as ScheduleItem['type'],
      projectId: ''
  });

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const getCalendarInfo = (date: Date) => {
      const m = date.getMonth() + 1;
      const d = date.getDate();

      // 1. 公历固定节日标注 (红色)
      if (m === 1 && d === 1) return { text: '元旦', type: 'festival' };
      if (m === 2 && d === 14) return { text: '情人节', type: 'festival' };
      if (m === 3 && d === 8) return { text: '妇女节', type: 'festival' };
      if (m === 5 && d === 1) return { text: '劳动节', type: 'festival' };
      if (m === 6 && d === 1) return { text: '儿童节', type: 'festival' };
      if (m === 10 && d === 1) return { text: '国庆节', type: 'festival' };
      if (m === 12 && d === 24) return { text: '平安夜', type: 'festival' };
      if (m === 12 && d === 25) return { text: '圣诞节', type: 'festival' };

      try {
          if (!Solar) return { text: '', type: '' }; 
          const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
          const lunar = solar.getLunar();
          
          // 2. 农历节日 (红色)
          const festivals = lunar.getFestivals();
          if (festivals && festivals.length > 0) return { text: festivals[0], type: 'festival' };
          
          // 3. 二十四节气 (蓝色或普通)
          const jieQi = lunar.getJieQi();
          if (jieQi) return { text: jieQi, type: 'term' };
          
          // 4. 普通农历日期
          const day = lunar.getDayInChinese();
          if (day === '初一') return { text: `${lunar.getMonthInChinese()}月`, type: 'month' };
          return { text: day, type: 'day' };
      } catch (e) { return { text: '', type: '' }; }
  };

  const managerStats = useMemo(() => {
    if (isRegularUser) return [];
    const stats: Record<string, { total: number, pending: number, name: string, avatar?: string, userId?: string, isDefaultAdmin?: boolean }> = {};
    users.forEach(u => {
        stats[u.nickname] = { total: 0, pending: 0, name: u.nickname, avatar: u.avatar, userId: u.id, isDefaultAdmin: u.isDefaultAdmin };
    });
    schedule.forEach(item => {
      let managerName = item.assignee || (item.projectId ? projects.find(p => p.id === item.projectId)?.manager : '');
      if (managerName && stats[managerName]) {
        stats[managerName].total += 1;
        if (!item.isCompleted) stats[managerName].pending += 1;
      }
    });
    return Object.values(stats);
  }, [schedule, projects, users, isRegularUser]);

  const filteredSchedule = useMemo(() => {
    const managerToFilter = selectedManager || (isRegularUser ? currentUser.nickname : null);
    if (!managerToFilter) return [];
    return schedule.filter(item => {
      if (item.assignee === managerToFilter) return true;
      if (item.projectId) {
          const proj = projects.find(p => p.id === item.projectId);
          return proj && proj.manager === managerToFilter;
      }
      return false; 
    }).sort((a, b) => a.time.localeCompare(b.time));
  }, [schedule, projects, selectedManager, currentUser, isRegularUser]);

  const availableProjects = useMemo(() => {
      const managerToFilter = selectedManager || (isRegularUser ? currentUser.nickname : null);
      if (!managerToFilter) return [];
      return projects.filter(p => p.manager === managerToFilter);
  }, [projects, selectedManager, isRegularUser, currentUser]);

  const handleSaveItem = () => {
    if (!newItemData.title) return alert("请输入事项内容");
    const newItem: ScheduleItem = {
        id: Math.random().toString(36).substr(2, 9),
        title: newItemData.title,
        date: newItemData.date,
        time: newItemData.time,
        type: newItemData.type,
        projectId: newItemData.projectId || undefined,
        assignee: !newItemData.projectId ? (selectedManager || currentUser.nickname) : undefined,
        isCompleted: false
    };
    onAddItem(newItem);
    setIsAddModalOpen(false);
  };

  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; 
    const days: Date[] = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) days.push(new Date(year, month - 1, prevMonthLastDay - i));
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    while(days.length < 42) days.push(new Date(year, month + 1, days.length - (firstDayOfWeek + daysInMonth) + 1));
    return days;
  }, [currentMonth]);

  const weekDaysHeader = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const isBeijingToday = (d: Date) => { const [by, bm, bd] = getBeijingDateString().split('-').map(Number); return d.getFullYear() === by && (d.getMonth() + 1) === bm && d.getDate() === bd; };
  const getHeaderDate = () => { const y = selectedDate.getFullYear(), m = String(selectedDate.getMonth() + 1).padStart(2, '0'), d = String(selectedDate.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; };

  if (!selectedManager && !isRegularUser) {
    return (
       <div className="max-w-7xl mx-auto transition-all">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div><h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors tracking-tight">日程全局看板</h2><p className="text-slate-500 dark:text-slate-400 mt-1 font-bold text-base transition-colors">请选择特定负责人查阅其工作排期</p></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 transition-all">
           {managerStats.map((stat) => (
              <div key={stat.name} onClick={() => setSelectedManager(stat.name)} className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-xl hover:border-primary-500/50 transition-all cursor-pointer flex flex-col items-center text-center relative overflow-hidden active:scale-[0.98] shadow-sm">
                 <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700 group-hover:bg-primary-500 transition-colors" />
                 <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4 border-4 border-white dark:border-slate-600 shadow-md overflow-hidden">
                    {stat.avatar ? <img src={stat.avatar} alt={stat.name} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-primary-500" />}
                 </div>
                 <h3 className="text-lg font-black text-slate-800 dark:text-white mb-0.5 transition-colors">{stat.name}</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">{stat.isDefaultAdmin ? '超级管理员' : '项目负责人'}</p>
                 <div className="flex items-center justify-center gap-4 w-full mb-4 py-2 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl">
                    <div className="text-center"><p className="text-lg font-black text-slate-700 dark:text-slate-200 transition-colors">{stat.total}</p><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">总计划</p></div>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 transition-colors"></div>
                    <div className="text-center"><p className="text-lg font-black text-primary-600 dark:text-primary-400 transition-colors">{stat.pending}</p><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">待完结</p></div>
                 </div>
                 <button className="w-full py-2 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[9px] uppercase tracking-widest group-hover:bg-primary-600 group-hover:text-white transition-all flex items-center justify-center gap-2 group-hover:shadow-lg shadow-primary-500/20">
                    查看具体日程 <ArrowRight className="w-3.5 h-3.5" />
                 </button>
              </div>
           ))}
        </div>
       </div>
    );
  }

  const selectedDateInfo = getCalendarInfo(selectedDate);
  const formattedSelectedFullDate = `${selectedDate.getFullYear()}年${String(selectedDate.getMonth() + 1).padStart(2, '0')}月${String(selectedDate.getDate()).padStart(2, '0')}日`;

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col transition-all">
      <div className="flex items-center justify-between mb-8 transition-all">
        <div>
           {!isRegularUser && <button onClick={() => setSelectedManager(null)} className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-primary-600 flex items-center gap-2 mb-3 transition-all"><ArrowLeft className="w-5 h-5" /> 返回人员汇总</button>}
           <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3 transition-colors">{selectedManager} <span className="text-slate-300 font-bold opacity-40">/</span> 日程提醒</h2>
        </div>
        <button onClick={() => { const y = selectedDate.getFullYear(), m = String(selectedDate.getMonth() + 1).padStart(2, '0'), d = String(selectedDate.getDate()).padStart(2, '0'); setNewItemData({ title: '', date: `${y}-${m}-${d}`, time: '09:00', type: 'Other', projectId: '' }); setIsAddModalOpen(true); }} className="bg-primary-600 text-white px-8 py-4 rounded-2xl hover:bg-primary-700 flex items-center gap-3 text-sm font-black shadow-2xl shadow-primary-500/30 transition-all active:scale-95 uppercase tracking-widest"><Plus className="w-6 h-6" /> 录入新事项</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 transition-all flex-1">
          <div className="lg:col-span-2 bg-slate-100 dark:bg-slate-900 p-8 md:p-10 rounded-[2.5rem] shadow-inner flex flex-col transition-all border-2 border-white dark:border-slate-800">
            <div className="flex justify-between items-center mb-8 transition-all px-4">
                <div className="flex items-center gap-4">
                    <div className="bg-primary-600 p-2 rounded-xl shadow-lg"><CalendarIcon className="w-6 h-6 text-white" /></div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter transition-colors">{currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月</h3>
                </div>
                <div className="flex space-x-2 transition-all">
                    <button onClick={handlePrevMonth} className="p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 transition-all shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={() => { const now = parseDateString(getBeijingDateString()); setCurrentMonth(now); setSelectedDate(now); }} className="px-6 py-3 bg-white dark:bg-slate-800 text-xs font-black uppercase tracking-widest hover:text-primary-600 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 transition-all shadow-sm">今天</button>
                    <button onClick={handleNextMonth} className="p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 transition-all shadow-sm"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-4 text-center transition-all px-2">
                {weekDaysHeader.map((day, i) => (<div key={i} className={`text-[10px] font-black uppercase py-2 tracking-[0.2em] ${i >= 5 ? 'text-red-500' : 'text-slate-400'}`}>{day}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-4 flex-1 auto-rows-fr transition-all px-2 pb-2">
                {calendarGrid.map((day, idx) => {
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                    const isToday = isBeijingToday(day);
                    const isSelected = day.toDateString() === selectedDate.toDateString();
                    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                    const dayEvents = filteredSchedule.filter(item => item.date === dayStr && !item.isCompleted);
                    const calInfo = getCalendarInfo(day);
                    
                    let cardBgClass = 'bg-white dark:bg-slate-800';
                    let textClass = 'text-slate-900 dark:text-white';
                    
                    if (isCurrentMonth && dayEvents.length > 0) {
                        const hasDeadline = dayEvents.some(e => e.type === 'Deadline');
                        cardBgClass = hasDeadline ? 'bg-red-500' : 'bg-primary-600';
                        textClass = 'text-white';
                    }
                    
                    const isSpecialFestival = calInfo.type === 'festival';

                    return (
                        <div 
                            key={idx} 
                            onClick={() => { setSelectedDate(day); if (!isCurrentMonth) setCurrentMonth(day); }} 
                            className={`relative flex flex-col items-center justify-center p-4 rounded-2xl cursor-pointer transition-all min-h-[90px] border-2 shadow-md hover:translate-y-[-2px]
                                ${!isCurrentMonth ? 'opacity-20 bg-transparent shadow-none border-transparent pointer-events-none' : `${cardBgClass} ${isSelected ? 'border-primary-500 ring-2 ring-primary-500/20 z-10' : 'border-transparent'}`}
                            `}
                        >
                            <span className={`text-xl font-black transition-colors ${isSpecialFestival && isCurrentMonth && dayEvents.length === 0 ? 'text-red-500' : textClass}`}>
                                {day.getDate()}
                            </span>
                            <span className={`text-[9px] truncate max-w-full transition-colors mt-0.5 font-bold ${isSpecialFestival && isCurrentMonth && dayEvents.length === 0 ? 'text-red-500' : (textClass === 'text-white' ? 'opacity-80' : 'text-slate-400')}`}>
                                {calInfo.text}
                            </span>
                        </div>
                    );
                })}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xl overflow-hidden flex flex-col transition-all">
            <div className="p-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 transition-all">
                <span className="block text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">{formattedSelectedFullDate}</span>
                <span className="text-xl font-black text-slate-800 dark:text-white">待办提醒</span>
            </div>
            <div className="p-6 overflow-y-auto flex-1 transition-all custom-scrollbar bg-slate-50/50 dark:bg-slate-900/30">
            {filteredSchedule.filter(item => item.date === getHeaderDate()).length > 0 ? (
                filteredSchedule.filter(item => item.date === getHeaderDate()).map((item) => (
                <div key={item.id} className={`flex items-center p-5 rounded-xl mb-4 border-2 transition-all group ${item.isCompleted ? 'opacity-40 grayscale' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg hover:border-primary-500'}`}>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${item.type === 'Deadline' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.type === 'Deadline' ? '紧急' : '计划'}</span>
                            <h4 className={`font-black text-base truncate ${item.isCompleted ? 'line-through' : 'text-slate-800 dark:text-white'}`}>{item.title}</h4>
                        </div>
                        <div className="flex items-center text-[10px] font-black text-slate-400 space-x-5 uppercase tracking-widest"><span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {item.time}</span></div>
                    </div>
                    {!item.isCompleted && (
                        <button onClick={() => onCompleteItem(item.id)} className="p-3 bg-white dark:bg-slate-700 border-2 border-slate-100 dark:border-slate-600 text-slate-300 hover:text-emerald-500 rounded-2xl transition-all shadow-md active:scale-90"><CheckCircle2 className="w-6 h-6" /></button>
                    )}
                </div>
            ))) : (<div className="flex flex-col items-center justify-center py-32 text-slate-300 transition-all"><CalendarIcon className="w-20 h-20 mb-6 opacity-10" /><p className="font-black text-sm uppercase tracking-widest">今日暂无日程</p></div>)}
            </div>
          </div>
      </div>

      {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 transition-all">
              <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-10 border-b dark:border-slate-700 pb-8 transition-all"><h3 className="text-2xl font-black text-slate-800 dark:text-white">录入日程提醒</h3><button onClick={() => setIsAddModalOpen(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-7 h-7 text-slate-500" /></button></div>
                  <div className="space-y-8 transition-all">
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">提醒内容 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={newItemData.title} onChange={e => setNewItemData({...newItemData, title: e.target.value})} /></div>
                      <div className="grid grid-cols-2 gap-6">
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">日期</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={newItemData.date} onChange={e => setNewItemData({...newItemData, date: e.target.value})} /></div>
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">时刻</label><input type="time" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={newItemData.time} onChange={e => setNewItemData({...newItemData, time: e.target.value})} /></div>
                      </div>
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">事项属性</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={newItemData.type} onChange={e => setNewItemData({...newItemData, type: e.target.value as any})}><option value="Other">普通提醒</option><option value="Meeting">重要会议</option><option value="SiteVisit">工地外勤</option><option value="Deadline">截止日期</option></select></div>
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">关联工程项目 (可选)</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={newItemData.projectId} onChange={e => setNewItemData({...newItemData, projectId: e.target.value})}><option value="">不关联项目</option>{availableProjects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
                  </div>
                  <div className="flex justify-end gap-5 mt-12 pt-8 border-t dark:border-slate-700 transition-all">
                      <button onClick={() => setIsAddModalOpen(false)} className="px-10 py-4 text-slate-500 font-black uppercase tracking-widest text-xs">取消</button>
                      <button onClick={handleSaveItem} className="px-14 py-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 font-black active:scale-95 uppercase tracking-widest text-xs">同步至工作台</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DailySchedule;

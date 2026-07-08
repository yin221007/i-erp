
import React from 'react';
import { Briefcase, Users, Database, Settings, LogOut, X, CalendarDays, BookOpen, LayoutGrid, LayoutDashboard, FolderArchive, Factory, ShieldCheck, CreditCard, ClipboardCheck, ClipboardList, MessageSquare, SlidersHorizontal, Mail, Sparkles, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { User, AppSettings } from '../types';
import { RESTRICTED_MODULES, ALLOWED_DEPARTMENTS_FOR_CORE } from '../constants';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentUser: User;
  settings?: AppSettings;
  onOpenSettings?: () => void;
  onOpenUserPrefs?: () => void;
  onLogout?: () => void;
  chatUnreadCount?: number;
  hasNewAnnouncements?: boolean;
  pendingApprovalCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onNavigate,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  currentUser,
  settings,
  onOpenSettings,
  onOpenUserPrefs,
  onLogout,
  chatUnreadCount = 0,
  hasNewAnnouncements = false,
  pendingApprovalCount = 0
}) => {
  const allNavItems = [
    { id: 'home', label: '首页总览', icon: <LayoutDashboard className="w-5 h-5" />, group: 'core' },
    { id: 'projects', label: '工程项目', icon: <Briefcase className="w-5 h-5" />, group: 'core' },
    { id: 'clients', label: '客户管理', icon: <Users className="w-5 h-5" />, group: 'core' },
    { id: 'production', label: '生产进度', icon: <Factory className="w-5 h-5" />, group: 'core' },
    { id: 'approvals', label: '审批流程', icon: <ClipboardCheck className="w-5 h-5" />, group: 'core' },
    { id: 'payments', label: '工程回款', icon: <CreditCard className="w-5 h-5" />, group: 'core' },
    { id: 'schedule', label: '日程提醒', icon: <CalendarDays className="w-5 h-5" />, group: 'core' },
    { id: 'worklogs', label: '工作记录', icon: <ClipboardList className="w-5 h-5" />, group: 'core' },
    { id: 'email', label: '电子邮箱', icon: <Mail className="w-5 h-5" />, group: 'core' },
    { id: 'chat', label: '团队沟通', icon: <MessageSquare className="w-5 h-5" />, group: 'core' },
    { id: 'archives', label: '工程档案', icon: <FolderArchive className="w-5 h-5" />, group: 'data' },
    { id: 'equipment', label: '设备参数', icon: <Database className="w-5 h-5" />, group: 'data' },
    { id: 'docs', label: '知识中心', icon: <BookOpen className="w-5 h-5" />, group: 'data' },
    { id: 'ai_center', label: 'AI 中心', icon: <Sparkles className="w-5 h-5" />, group: 'data' },
    { id: 'recycle_bin', label: '回收站', icon: <Trash2 className="w-5 h-5" />, group: 'data' },
  ];

  const isItemVisible = (itemId: string) => {
    if (itemId === 'recycle_bin') return currentUser.role === 'Admin' || currentUser.isDefaultAdmin;
    if (itemId === 'email') return true;
    if (!RESTRICTED_MODULES.includes(itemId)) return true;

    // 如果是内置超级管理员，可见所有
    if (currentUser.isDefaultAdmin) return true;

    // 如果是管理员，可见受限模块
    if (currentUser.role === 'Admin') return true;

    // 部门级限制
    return ALLOWED_DEPARTMENTS_FOR_CORE.includes(currentUser.department);
  };

  const coreItems = allNavItems.filter(item => item.group === 'core' && isItemVisible(item.id));
  const dataItems = allNavItems.filter(item => item.group === 'data' && isItemVisible(item.id));

  // 严格隔离：用户管理仅对内置超级管理员可见
  const adminItems = currentUser.isDefaultAdmin
    ? [{ id: 'users', label: '用户管理', icon: <ShieldCheck className="w-5 h-5" /> }]
    : [];

  return (
    <>
      {/* Background Overlay - Mobile */}
      <div
        className={`fixed inset-0 bg-slate-950/60 z-30 md:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`
        fixed md:static inset-y-0 left-0 z-40
        flex flex-col w-64 ${isCollapsed ? 'md:w-20' : 'md:w-64'} bg-gradient-to-b from-white via-sky-50 to-emerald-50 text-slate-700 h-full md:h-auto shadow-[8px_0_30px_rgba(15,23,42,0.08)]
        transition-all duration-300 ease-in-out border-r border-slate-200/80 md:border-r
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
        top-0 md:top-16
        dark:from-slate-800 dark:via-slate-900 dark:to-teal-950 dark:text-slate-200 dark:border-slate-800
      `}>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex absolute -right-3 top-7 z-50 h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-lg transition hover:bg-primary-600 hover:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            title={isCollapsed ? '展开导航栏' : '隐藏导航栏'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}

        <div className={`${isCollapsed ? 'md:p-3' : 'md:p-6'} p-4 flex-1 overflow-y-auto`}>
          {/* Header Mobile Only */}
          <div className="flex justify-between items-center mb-6 md:hidden">
             <div className="flex items-center space-x-2">
                <div className="bg-primary-600 p-1.5 rounded-lg"><LayoutGrid className="w-4 h-4 text-white" /></div>
                <span className="font-bold text-slate-900 dark:text-white tracking-tight">{settings?.appName || 'i ERP'}</span>
             </div>
             <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 bg-white/70 dark:text-slate-400 dark:hover:text-white dark:bg-slate-800/60 rounded-full">
               <X className="w-5 h-5" />
             </button>
          </div>

          <div className="mb-6">
            <div className={`hidden md:flex items-center ${isCollapsed ? 'justify-center px-0' : 'space-x-3 px-4'} text-slate-900 dark:text-white mb-6`}>
               {settings?.logoUrl ? (
                 <img src={settings.logoUrl} alt="Logo" style={{ width: `${settings.logoWidth}px` }} className="object-contain max-h-12"/>
               ) : (
                 <div className="bg-primary-600 p-1.5 rounded-lg"><LayoutGrid className="w-5 h-5 text-white" /></div>
               )}
               <span className={`font-bold text-lg tracking-tight ${isCollapsed ? 'md:hidden' : ''}`}>{settings?.appName || 'i ERP'}</span>
            </div>

            <p className={`text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 px-4 ${isCollapsed ? 'md:hidden' : ''}`}>核心业务</p>
            <nav className="space-y-0.5">
              {coreItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); if(window.innerWidth < 768 && onClose) onClose(); }}
                  className={`w-full flex items-center justify-between px-4 py-3 md:py-2.5 ${isCollapsed ? 'md:justify-center md:px-3' : ''} rounded-xl transition-all duration-300 transform hover:translate-x-1 active:scale-95 ${
                    activeView === item.id ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/25 ring-1 ring-primary-300/60' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {item.icon}
                    <span className={`font-medium text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                      {item.id === 'chat' && (chatUnreadCount > 0 || hasNewAnnouncements) && (
                        <div className="flex items-center gap-1.5">
                           {hasNewAnnouncements && (
                              <div className="flex items-center gap-1">
                                 <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                 </span>
                                 <span className={`text-[8px] font-black text-orange-400 uppercase tracking-tighter hidden sm:inline ${isCollapsed ? 'md:hidden' : ''}`}>新公告</span>
                              </div>
                           )}
                           {chatUnreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm border border-white/20">
                              {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                            </span>
                           )}
                        </div>
                      )}

                      {/* 审批流程待办气泡 */}
                      {item.id === 'approvals' && pendingApprovalCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm border border-white/20 animate-pulse">
                          {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
                        </span>
                      )}
                  </div>
                </button>
              ))}
            </nav>

            <p className={`text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 mt-6 px-4 ${isCollapsed ? 'md:hidden' : ''}`}>数据管理</p>
            <nav className="space-y-0.5">
               {dataItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); if(window.innerWidth < 768 && onClose) onClose(); }}
                  className={`w-full flex items-center space-x-4 px-4 py-3 md:py-2.5 ${isCollapsed ? 'md:justify-center md:space-x-0 md:px-3' : ''} rounded-xl transition-all duration-300 transform hover:translate-x-1 active:scale-95 ${
                    activeView === item.id ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/25 ring-1 ring-primary-300/60' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className={`font-medium text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                </button>
              ))}
            </nav>

            {adminItems.length > 0 && (
              <>
                <p className={`text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 mt-6 px-4 ${isCollapsed ? 'md:hidden' : ''}`}>系统管理</p>
                <nav className="space-y-0.5">
                   {adminItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); if(window.innerWidth < 768 && onClose) onClose(); }}
                      className={`w-full flex items-center space-x-4 px-4 py-3 md:py-2.5 ${isCollapsed ? 'md:justify-center md:space-x-0 md:px-3' : ''} rounded-xl transition-all duration-300 transform hover:translate-x-1 active:scale-95 ${
                        activeView === item.id ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/25 ring-1 ring-primary-300/60' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className={`font-medium text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </>
            )}
          </div>
        </div>

        <div className={`${isCollapsed ? 'md:px-3' : ''} p-4 border-t border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70 space-y-1 pb-8 md:pb-4`}>
          {currentUser.isDefaultAdmin && (
             <button onClick={onOpenSettings} className={`w-full flex items-center space-x-4 px-4 py-3 md:py-2 ${isCollapsed ? 'md:justify-center md:space-x-0 md:px-3' : ''} rounded-xl hover:bg-white hover:text-slate-950 hover:shadow-sm dark:hover:bg-white/10 dark:hover:text-white transition-all duration-300 transform hover:translate-x-1 active:scale-95 text-slate-500 dark:text-slate-400 text-sm`}>
               <Settings className="w-4 h-4" /><span className={`font-medium ${isCollapsed ? 'md:hidden' : ''}`}>系统设置</span>
             </button>
          )}
          <button onClick={onOpenUserPrefs} className={`w-full flex items-center space-x-4 px-4 py-3 md:py-2 ${isCollapsed ? 'md:justify-center md:space-x-0 md:px-3' : ''} rounded-xl hover:bg-white hover:text-slate-950 hover:shadow-sm dark:hover:bg-white/10 dark:hover:text-white transition-all duration-300 transform hover:translate-x-1 active:scale-95 text-slate-500 dark:text-slate-400 text-sm`}>
             <SlidersHorizontal className="w-4 h-4" /><span className={`font-medium ${isCollapsed ? 'md:hidden' : ''}`}>偏好设置</span>
          </button>
          <button onClick={() => { if (onClose) onClose(); if (onLogout) onLogout(); }} className={`w-full flex items-center space-x-4 px-4 py-3 md:py-2 ${isCollapsed ? 'md:justify-center md:space-x-0 md:px-3' : ''} rounded-xl hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all duration-300 transform hover:translate-x-1 active:scale-95 text-slate-500 dark:text-slate-400 text-sm`}>
            <LogOut className="w-4 h-4" /><span className={`font-medium ${isCollapsed ? 'md:hidden' : ''}`}>退出登录</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

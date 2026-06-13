
import React, { useState } from 'react';
import { Notification, User } from '../types';
import { CheckCircle, AlertCircle, Info, Check, BellOff, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { formatBeijingTime } from '../constants';

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onMarkAllRead, onDelete, currentUser, isOpen, onClose }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
  };

  return (
    <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40" onClick={handleBackdropClick} />
        
        <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 flex flex-col animate-in slide-in-from-top-2 max-h-[80vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
            <h3 className="font-bold text-slate-800">消息中心</h3>
            <button 
            onClick={onMarkAllRead}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
            <Check className="w-3 h-3" /> 全部已读
            </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
            {notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center">
                <BellOff className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">暂无消息记录</p>
            </div>
            ) : (
            notifications.map((notif) => (
                <div 
                key={notif.id} 
                className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex flex-col gap-2 ${!notif.read ? 'bg-blue-50/40' : ''}`}
                >
                    <div 
                        className="flex items-start gap-3 cursor-pointer"
                        onClick={() => toggleExpand(notif.id)}
                    >
                        <div className="mt-0.5 flex-shrink-0">
                            {notif.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                            {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                            {notif.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <p className={`text-sm ${!notif.read ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                                    {notif.message}
                                </p>
                                {!notif.read && <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1.5 ml-2" />}
                            </div>
                            <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                                {formatBeijingTime(notif.timestamp, {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}
                                {notif.details && (
                                    <span className="text-blue-400 hover:text-blue-600 flex items-center gap-0.5">
                                        详情 {expandedId === notif.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Detailed View */}
                    {expandedId === notif.id && notif.details && (
                        <div className="ml-7 mt-1 text-xs text-slate-600 bg-slate-100 p-2 rounded animate-in slide-in-from-top-1">
                            <p className="whitespace-pre-wrap">{notif.details}</p>
                            {currentUser.role === 'Admin' && (
                                <div className="flex justify-end mt-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
                                        className="text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" /> 删除通知
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))
            )}
        </div>
        
        <div className="p-2 border-t border-slate-100 text-center bg-slate-50 rounded-b-xl">
            <span className="text-xs text-slate-400">仅保留最近 100 条记录</span>
        </div>
        </div>
    </>
  );
};

export default NotificationCenter;
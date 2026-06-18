
import React from 'react';
import { Notification } from '../types';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notifications, onDismiss }) => {
  // Only show notifications marked as visible (for toast popups)
  const visibleNotifications = notifications.filter(n => n.isVisible);

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            pointer-events-auto min-w-[300px] max-w-sm w-full bg-white rounded-lg shadow-lg border border-slate-100 
            p-4 flex items-start gap-3 animate-in slide-in-from-right-full duration-300
          `}
        >
          <div className="flex-shrink-0 mt-0.5">
            {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            {notification.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
          </div>
          
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-medium text-slate-800">{notification.message}</p>
          </div>

          <button 
            onClick={() => onDismiss(notification.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationToast;

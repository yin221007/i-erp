import { 
  INITIAL_PROJECTS, 
  INITIAL_CLIENTS, 
  INITIAL_EQUIPMENT, 
  INITIAL_DOCS, 
  INITIAL_SCHEDULE,
  INITIAL_ARCHIVES,
  INITIAL_PRODUCTION,
  INITIAL_USERS,
  INITIAL_SETTINGS,
  INITIAL_USER_PREFS, 
  INITIAL_PAYMENTS, 
  INITIAL_MESSAGES,
  INITIAL_CHANNELS,
  INITIAL_WORKFLOW,
  RESTRICTED_MODULES,
  ALLOWED_DEPARTMENTS_FOR_CORE
} from './constants';
import { 
  Project, Client, Equipment, Contact, ArchiveItem, ProjectProduction, User, 
  WorkflowNode, AppSettings, DocItem, Notification as AppNotification, 
  NotificationType, ScheduleItem, PaymentRecord, Approval, WorkLogEntry, 
  ChatMessage, ChatChannel, TaskStatus, NotificationCategory, UserPreferences, ChatAnnouncement, RecycleBinItem 
} from './types';
import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef
} from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NotificationToast from './components/NotificationToast';
import Login from './components/Login';
import { normalizeProductionRecord } from './lib/production-records.js';
import {
  API_URL,
  apiFetch,
  apiJson,
  setUnauthorizedHandler
} from './lib/api';

const ProjectList = lazy(() => import('./components/ProjectList'));
const ProjectWorkflow = lazy(() => import('./components/ProjectWorkflow'));
const ClientManager = lazy(() => import('./components/ClientManager'));
const EquipmentLibrary = lazy(() => import('./components/EquipmentLibrary'));
const DailySchedule = lazy(() => import('./components/DailySchedule'));
const Documentation = lazy(() => import('./components/Documentation'));
const EngineeringArchives = lazy(
  () => import('./components/EngineeringArchives')
);
const ProductionProgress = lazy(
  () => import('./components/ProductionProgress')
);
const UserManager = lazy(() => import('./components/UserManager'));
const SystemSettings = lazy(() => import('./components/SystemSettings'));
const PaymentDashboard = lazy(() => import('./components/PaymentDashboard'));
const ApprovalManager = lazy(() => import('./components/ApprovalManager'));
const WorkLogManager = lazy(() => import('./components/WorkLogManager'));
const TeamChat = lazy(() => import('./components/TeamChat'));
const EmailClient = lazy(() => import('./components/EmailClient'));
const UserPreferencesModal = lazy(
  () => import('./components/UserPreferencesModal')
);
const AICenter = lazy(() => import('./components/AICenter'));
const RecycleBin = lazy(() => import('./components/RecycleBin'));
const HomeDashboard = lazy(() => import('./components/HomeDashboard'));

type NavigationContext = {
  projectId?: string;
  productionProjectId?: string;
  paymentId?: string;
  paymentProjectId?: string;
  returnToHomeDrilldown?: {
    title: string;
    subtitle: string;
    entries: any[];
    emptyText: string;
  };
};

function App() {
  // ==================================================================================
  // 1. UI STATE MANAGEMENT
  // ==================================================================================
  const [activeView, setActiveView] = useState<string>('home');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('ierp_sidebar_collapsed') === '1');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [targetProductionProjectId, setTargetProductionProjectId] = useState<string | null>(null);
  const [targetPaymentFocus, setTargetPaymentFocus] = useState<{ paymentId?: string; projectId?: string } | null>(null);
  const [homeReturnDrilldown, setHomeReturnDrilldown] = useState<NavigationContext['returnToHomeDrilldown'] | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false); 
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline' | 'connecting'>('connecting');
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      return (localStorage.getItem('ierp_theme') as 'light' | 'dark') || 'light';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isUserPrefsOpen, setIsUserPrefsOpen] = useState<boolean>(false); 

  // ==================================================================================
  // 2. DATA STATE MANAGEMENT
  // ==================================================================================
  const [users, setUsers] = useState<User[]>(() => {
      const saved = localStorage.getItem('ierp_users');
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      return INITIAL_USERS;
  });
  const [projects, setProjects] = useState<Project[]>(() => {
      const saved = localStorage.getItem('ierp_projects');
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      return INITIAL_PROJECTS;
  });
  
  const [clients, setClients] = useState<Client[]>(() => {
      const saved = localStorage.getItem('ierp_clients');
      return saved ? JSON.parse(saved) : [];
  });
  const [equipment, setEquipment] = useState<Equipment[]>(() => {
      const saved = localStorage.getItem('ierp_equipment');
      return saved ? JSON.parse(saved) : [];
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [productionData, setProductionData] = useState<ProjectProduction[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLogEntry[]>([]);
  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>([]);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [announcements, setAnnouncements] = useState<ChatAnnouncement[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>(''); 
  const [chatLastReadMap, setChatLastReadMap] = useState<Record<string, string>>({});

  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [sessionAnnouncementsRead, setSessionAnnouncementsRead] = useState<boolean>(false);

  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
      const saved = localStorage.getItem('ierp_settings');
      if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
      }
      return INITIAL_SETTINGS;
  });
  const displayLogoUrl = useMemo(
    () => appSettings.logoUrl?.startsWith('/api/uploads/')
      ? `${API_URL}/branding/logo`
      : appSettings.logoUrl,
    [appSettings.logoUrl]
  );
  const displaySettings = useMemo(
    () => ({ ...appSettings, logoUrl: displayLogoUrl }),
    [appSettings, displayLogoUrl]
  );

  const [userPrefs, setUserPrefs] = useState<UserPreferences>(INITIAL_USER_PREFS);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const lastNotificationRef = useRef<{ id: string, time: number }>({ id: '', time: 0 });
  const lastNotifiedMessageIdRef = useRef<string>('');

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);
  
  const stateRef = useRef({ currentUser, activeView, activeChannelId });
  useEffect(() => {
    stateRef.current = { currentUser, activeView, activeChannelId };
  }, [currentUser, activeView, activeChannelId]);

  // ==================================================================================
  // 3. EFFECTS & INITIALIZATION
  // ==================================================================================

  useEffect(() => {
      localStorage.setItem('ierp_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('ierp_theme', theme);
  }, [theme]);

  useEffect(() => {
      document.body.setAttribute('data-theme', userPrefs.themeColor || 'blue');
      
      let baseSize = '16px';
      switch (userPrefs.fontSize) {
          case 'small': baseSize = '14px'; break;
          case 'medium': baseSize = '16px'; break;
          case 'large': baseSize = '18px'; break;
          case 'xlarge': baseSize = '20px'; break;
          default: baseSize = '16px';
      }
      document.documentElement.style.fontSize = baseSize;
  }, [userPrefs.themeColor, userPrefs.fontSize]);

  useEffect(() => {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
          link.href = displayLogoUrl || '/icon.png';
      } else {
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.href = displayLogoUrl || '/icon.png';
          document.head.appendChild(newLink);
      }
  }, [displayLogoUrl, appSettings.appName]);

  useEffect(() => {
      if (!isAuthenticated || connectionStatus !== 'connected') return;
      const interval = setInterval(() => {
          pollUpdates();
      }, 5000); 
      return () => clearInterval(interval);
  }, [isAuthenticated, connectionStatus]);

  useEffect(() => {
    const clearSession = () => {
      setIsAuthenticated(false);
      setCurrentUser(INITIAL_USERS[0]);
      setConnectionStatus('offline');
    };
    setUnauthorizedHandler(clearSession);

    const restoreSession = async () => {
      try {
        const { user } = await apiJson<{ user: User }>(`${API_URL}/auth/me`);
        setCurrentUser(user);
        setIsAuthenticated(true);
        if (user.preferences) {
          setUserPrefs({
            ...INITIAL_USER_PREFS,
            ...user.preferences
          });
        } else {
          const cachedPreferences = localStorage.getItem(`ierp_prefs_${user.id}`);
          if (!cachedPreferences) {
            await fetchData(user.id);
            return;
          }
          try {
            setUserPrefs({
              ...INITIAL_USER_PREFS,
              ...JSON.parse(cachedPreferences)
            });
          } catch {
            setUserPrefs(INITIAL_USER_PREFS);
          }
        }
        await fetchData(user.id);
      } catch {
        clearSession();
        setIsLoaded(true);
      }
    };
    restoreSession();
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
      if (isAuthenticated && activeView === 'chat' && announcements.length > 0) {
          setSessionAnnouncementsRead(true);
      }
  }, [activeView, announcements.length, isAuthenticated]);

  useEffect(() => {
      const approvedDeletionRequests = approvals.filter(a => a.type === 'Deletion' && a.status === 'Approved' && a.relatedId);
      approvedDeletionRequests.forEach(async (req) => {
          try {
              if (req.relatedType === 'Project') {
                  setProjects(prev => prev.filter(p => p.id !== req.relatedId));
                  await syncToBackend('projects', 'DELETE', {}, req.relatedId);
              } else if (req.relatedType === 'Archive') {
                  // 这里复用核心同步删除逻辑
                  handleDeleteArchive(req.relatedId!);
              } else if (req.relatedType === 'Client') {
                  setClients(prev => prev.filter(c => c.id !== req.relatedId));
                  await syncToBackend('clients', 'DELETE', {}, req.relatedId);
              } else if (req.relatedType === 'Equipment') {
                  setEquipment(prev => prev.filter(e => e.id !== req.relatedId));
                  await syncToBackend('equipment', 'DELETE', {}, req.relatedId);
              } else if (req.relatedType === 'Payment') {
                  setPaymentRecords(prev => prev.filter(p => p.id !== req.relatedId));
                  await syncToBackend('payments', 'DELETE', {}, req.relatedId);
              } else if (req.relatedType === 'WorkLog') {
                  setWorkLogs(prev => prev.filter(l => l.id !== req.relatedId));
                  await syncToBackend('worklogs', 'DELETE', {}, req.relatedId);
              } else if (req.relatedType === 'Doc') {
                  setDocs(prev => prev.filter(d => d.id !== req.relatedId));
                  await syncToBackend('docs', 'DELETE', {}, req.relatedId);
              }
              onDeleteApproval(req.id);
              notify(`批准删除成功：${req.title}`, 'success');
              fetchData();
          } catch (e) {
              console.error("Auto delete error", e);
          }
      });
  }, [approvals]);

  // ==================================================================================
  // 4. HELPER FUNCTIONS
  // ==================================================================================

  const loadLocal = <T,>(key: string, initial: T): T => {
    const saved = localStorage.getItem(`ierp_${key}`);
    if (saved) {
        try { return JSON.parse(saved); } catch(e) { console.error("LS Parse Error", e); }
    }
    return initial;
  };

  const saveToLocal = (key: string, data: any) => {
    try {
        localStorage.setItem(`ierp_${key}`, JSON.stringify(data));
    } catch (e) {
        console.warn(`LocalStorage write failed for ${key}`);
    }
  };

  const safeJson = async (response: Response) => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      try {
          return JSON.parse(text);
      } catch (e) {
          return [];
      }
  };

  const sendBrowserNotification = (title: string, body: string, category: NotificationCategory) => {
      const prefs = userPrefs; 
      if (!prefs.enableBrowser) return;
      const typeKey = category.toLowerCase() as keyof typeof prefs.types;
      if (!prefs.types[typeKey]) return;
      
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const notifId = `${title}-${body}`;
      const now = Date.now();
      if (lastNotificationRef.current.id === notifId && (now - lastNotificationRef.current.time) < 3000) return; 
      lastNotificationRef.current = { id: notifId, time: now };

      try { 
          const notification = new Notification(title, { 
              body, 
              icon: displayLogoUrl || '/icon.png',
              tag: category,
              requireInteraction: false
          });
          notification.onclick = function(event) {
              event.preventDefault();
              window.focus();
              notification.close();
          };
      } catch (e) { 
          console.error("Notification error", e);
      }
  };

  const notify = (message: string, type: NotificationType = 'success', details?: string, category: NotificationCategory = 'System', relatedId?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    
    if (category === 'Chat' || category === 'Approval' || category === 'Task') {
        sendBrowserNotification(type === 'error' ? '系统提醒' : 'i ERP 消息', message, category);
    }

    const newNotification: AppNotification = { 
        id, message, details, type, category, timestamp: new Date().toISOString(), read: false, isVisible: true, relatedId 
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 100));
    setTimeout(() => { setNotifications(prev => prev.map(n => n.id === id ? { ...n, isVisible: false } : n)); }, 3000);
  };

  const dismissToast = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, isVisible: false } : n));
  const markAllNotificationsAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const handleDeleteNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  const syncToBackend = async (resource: string, method: string, data: any, id?: string) => {
      try {
          const url = id ? `${API_URL}/${resource}/${id}` : `${API_URL}/${resource}`;
          const res = await apiFetch(url, {
              method,
              ...(method === 'DELETE' && Object.keys(data || {}).length === 0
                ? {}
                : { json: data })
          });
          if (!res.ok) {
              if (res.status === 403) {
                  const errData = await res.json().catch(() => ({}));
                  notify(errData.error || '操作被拒绝：您没有权限修改此数据。', 'error', undefined, 'System');
                  throw new Error('Forbidden');
              }
              const errText = await res.text();
              throw new Error(`Failed to sync ${resource}: ${res.status} - ${errText}`);
          }
          return res;
      } catch (error) {
          console.error(`[Sync Engine] Fatal for ${resource}:`, error);
          throw error;
      }
  };

  const rollbackAfterSyncFailure = (message = '同步失败，已恢复服务器最新数据') => {
      notify(message, 'error', undefined, 'System');
      fetchData();
  };

  const syncToBackendOrRollback = async (resource: string, method: string, data: any, id?: string, failureMessage?: string) => {
      try {
          await syncToBackend(resource, method, data, id);
          return true;
      } catch {
          rollbackAfterSyncFailure(failureMessage);
          return false;
      }
  };

  const handleProtectedDelete = async (item: any, resourceType: string, itemName: string, deleteCallback: (id: string) => void) => {
      const isOwner = item.creatorId === currentUser.id || item.userId === currentUser.id || item.manager === currentUser.nickname || item.managerName === currentUser.nickname || item.uploader === currentUser.nickname;
      const isSuperAdmin = currentUser.isDefaultAdmin;
      
      const createdAt = new Date(item.createdAt || item.uploadDate || new Date().toISOString());
      const now = new Date();
      const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      if (isSuperAdmin || (isOwner && hoursDiff < 24)) {
          if (window.confirm(`确定要删除 ${itemName} 吗？数据将被移动至回收站，30天后自动清除。`)) {
              deleteCallback(item.id);
          }
      } else {
          if (window.confirm(`该数据已超过 24 小时保护期。为了保障工程数据安全性，删除该项需要向超级管理员提出申请。是否立即发起删除申请？`)) {
              const superAdmin = users.find(u => u.isDefaultAdmin);
              const nowISO = new Date().toISOString();
              const newApproval: Approval = {
                  id: Math.random().toString(36).substr(2, 9),
                  title: `[删除申请] ${itemName}`,
                  type: 'Deletion',
                  applicantId: currentUser.id,
                  applicantName: currentUser.nickname,
                  department: currentUser.department,
                  
                  strategy: 'OR_SIGN', 
                  approverIds: [superAdmin?.id || 'u-1'],
                  approverNamesDisplay: superAdmin?.nickname || '超级管理员',

                  status: 'Pending',
                  currentContent: `申请删除类型为 ${resourceType} 的项目：${itemName} (ID: ${item.id})。申请人：${currentUser.nickname}。`,
                  currentAttachments: [],
                  versions: [],
                  createdAt: nowISO,
                  updatedAt: nowISO,
                  relatedId: item.id,
                  relatedType: resourceType
              };
              handleAddApproval(newApproval);
              notify('删除申请已提交', 'info', '申请已发送至超级管理员，获批后系统将自动执行删除。', 'Approval');
          }
      }
  };

  // ==================================================================================
  // 5. DATA FETCHING & POLLING
  // ==================================================================================

  const fetchData = async (authenticatedUserId = currentUser.id) => {
    setConnectionStatus('connecting');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); 

        const responses = await Promise.allSettled([
            apiFetch(`${API_URL}/projects`, { signal: controller.signal }),
            apiFetch(`${API_URL}/clients`, { signal: controller.signal }),
            apiFetch(`${API_URL}/equipment`, { signal: controller.signal }),
            apiFetch(`${API_URL}/schedule`, { signal: controller.signal }),
            apiFetch(`${API_URL}/docs`, { signal: controller.signal }),
            apiFetch(`${API_URL}/archives`, { signal: controller.signal }),
            apiFetch(`${API_URL}/production`, { signal: controller.signal }),
            apiFetch(`${API_URL}/users`, { signal: controller.signal }),
            apiFetch(`${API_URL}/settings`, { signal: controller.signal }),
            apiFetch(`${API_URL}/payments`, { signal: controller.signal }),
            apiFetch(`${API_URL}/approvals`, { signal: controller.signal }),
            apiFetch(`${API_URL}/worklogs`, { signal: controller.signal }),
            apiFetch(`${API_URL}/messages`, { signal: controller.signal }),
            apiFetch(`${API_URL}/channels`, { signal: controller.signal }),
            apiFetch(`${API_URL}/announcements`, { signal: controller.signal }),
            apiFetch(`${API_URL}/ai_messages`, { signal: controller.signal }),
            apiFetch(`${API_URL}/recycle_bin`, { signal: controller.signal })
        ]);
        clearTimeout(timeoutId);

        const getJson = async (res: PromiseSettledResult<Response>) => {
            if (res.status === 'fulfilled' && res.value.ok) return await safeJson(res.value);
            return null;
        };

        const loadedProjects = await getJson(responses[0]);
        if (Array.isArray(loadedProjects)) {
            const processedProjects = loadedProjects.map((p: Project) => {
                if (!p.nodes || p.nodes.length === 0) {
                    return { ...p, nodes: JSON.parse(JSON.stringify(INITIAL_WORKFLOW)) };
                }
                return p;
            });
            setProjects(processedProjects); 
            saveToLocal('projects', processedProjects);
        }
        
        let loadedUsers = await getJson(responses[7]);
        if (Array.isArray(loadedUsers) && loadedUsers.length > 0) {
            setUsers(loadedUsers);
            saveToLocal('users', loadedUsers);
            const self = loadedUsers.find((user: User) =>
              user.id === authenticatedUserId
            );
            if (self) {
                setCurrentUser(self);
                if (self.lastReadMap) setChatLastReadMap(self.lastReadMap);
                if (self.preferences) {
                    setUserPrefs({
                      ...INITIAL_USER_PREFS,
                      ...self.preferences
                    });
                    localStorage.setItem(
                      `ierp_prefs_${self.id}`,
                      JSON.stringify(self.preferences)
                    );
                }
            }
        }
        
        const loadedClients = await getJson(responses[1]);
        if (loadedClients) { setClients(loadedClients); saveToLocal('clients', loadedClients); }

        const loadedEquipment = await getJson(responses[2]);
        if (loadedEquipment) { setEquipment(loadedEquipment); saveToLocal('equipment', loadedEquipment); }

        const loadedSchedule = await getJson(responses[3]);
        if (loadedSchedule) setSchedule(loadedSchedule);

        const loadedDocs = await getJson(responses[4]);
        if (loadedDocs) setDocs(loadedDocs);

        const loadedArchives = await getJson(responses[5]);
        if (loadedArchives) setArchives(loadedArchives);

        const loadedProduction = await getJson(responses[6]);
        if (Array.isArray(loadedProduction)) {
            setProductionData(loadedProduction.map(normalizeProductionRecord));
        }
        
        const settingsData = await getJson(responses[8]);
        if (Array.isArray(settingsData) && settingsData.length > 0) {
            const globalSettings = settingsData.find((s: AppSettings) => s.id === 'global_config') || settingsData[0];
            setAppSettings({ ...globalSettings, id: 'global_config' }); 
            saveToLocal('settings', globalSettings);
        }

        const loadedPayments = await getJson(responses[9]);
        if (loadedPayments) setPaymentRecords(loadedPayments);

        const loadedApprovals = await getJson(responses[10]);
        if (loadedApprovals) setApprovals(loadedApprovals);

        const loadedWorkLogs = await getJson(responses[11]);
        if (loadedWorkLogs) setWorkLogs(loadedWorkLogs);
        
        const loadedMessages = await getJson(responses[12]);
        if (loadedMessages) setMessages(loadedMessages);

        const loadedChannels = await getJson(responses[13]);
        if (loadedChannels) setChannels(loadedChannels);

        const loadedAnnouncements = await getJson(responses[14]);
        if (loadedAnnouncements) setAnnouncements(loadedAnnouncements);

        const loadedAiMessages = await getJson(responses[15]);
        if (Array.isArray(loadedAiMessages)) setAiMessages(loadedAiMessages);

        const loadedRecycleBin = await getJson(responses[16]);
        if (Array.isArray(loadedRecycleBin)) setRecycleBin(loadedRecycleBin);

        setConnectionStatus('connected');
    } catch (error) {
        console.warn("Backend poll skipped, using cache.");
        setConnectionStatus('offline');
    } finally {
        setIsLoaded(true);
    }
  };

  const lastHeartbeatRef = useRef<number>(0);

  const pollUpdates = async () => {
      const { currentUser: currentU } = stateRef.current;
      if (connectionStatus !== 'connected' || !isAuthenticated) return;
      
      try {
          const now = Date.now();
          if (now - lastHeartbeatRef.current > 45000) {
              lastHeartbeatRef.current = now;
              apiFetch(`${API_URL}/auth/heartbeat`, {
                  method: 'POST'
              }).catch(() => {
                  console.debug('Heartbeat sync skipped');
              });
          }

          const usersRes = await apiFetch(`${API_URL}/users`);
          if (usersRes.ok) {
              let serverUsers = await safeJson(usersRes);
              if (Array.isArray(serverUsers) && serverUsers.length > 0) {
                  setUsers(serverUsers);
                  saveToLocal('users', serverUsers);
                  const self = serverUsers.find((u: User) => u.id === currentU.id);
                  if (self && JSON.stringify(self) !== JSON.stringify(currentU)) {
                      setCurrentUser(self);
                  }
              }
          }

          const msgRes = await apiFetch(`${API_URL}/messages`);
          if (msgRes.ok) {
              const serverMessages = await safeJson(msgRes);
              if (Array.isArray(serverMessages)) setMessages(serverMessages);
          }
          
          const [channelRes, annRes, workLogRes, paymentRes, approvalRes, projRes, aiRes, recycleRes] = await Promise.all([
              apiFetch(`${API_URL}/channels`),
              apiFetch(`${API_URL}/announcements`),
              apiFetch(`${API_URL}/worklogs`),
              apiFetch(`${API_URL}/payments`),
              apiFetch(`${API_URL}/approvals`),
              apiFetch(`${API_URL}/projects`),
              apiFetch(`${API_URL}/ai_messages`),
              apiFetch(`${API_URL}/recycle_bin`)
          ]);

          if (channelRes.ok) {
              const data = await safeJson(channelRes);
              if (Array.isArray(data)) setChannels(data);
          }
          if (annRes.ok) {
              const data = await safeJson(annRes);
              if (Array.isArray(data)) setAnnouncements(data);
          }
          if (workLogRes.ok) {
              const data = await safeJson(workLogRes);
              if (Array.isArray(data)) setWorkLogs(data);
          }
          if (paymentRes.ok) {
              const data = await safeJson(paymentRes);
              if (Array.isArray(data)) setPaymentRecords(data);
          }
          if (approvalRes.ok) {
              const data = await safeJson(approvalRes);
              if (Array.isArray(data)) setApprovals(data);
          }
          if (projRes.ok) {
              const data = await safeJson(projRes);
              if (Array.isArray(data)) setProjects(data);
          }
          if (aiRes.ok) {
              const data = await safeJson(aiRes);
              if (Array.isArray(data)) setAiMessages(data);
          }
          if (recycleRes.ok) {
              const data = await safeJson(recycleRes);
              if (Array.isArray(data)) setRecycleBin(data);
          }
      } catch (e) { }
  };

  // ==================================================================================
  // 6. EVENT HANDLERS
  // ==================================================================================

  const handleUpdateProject = async (updatedProject: Project) => {
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      if (selectedProject?.id === updatedProject.id) setSelectedProject(updatedProject);
      try { 
          await syncToBackend('projects', 'PUT', updatedProject, updatedProject.id); 
          notify('项目更新成功', 'success'); 
      } catch (e) { rollbackAfterSyncFailure('项目更新失败，已恢复服务器最新数据'); }
  };
  
  const handleAddProject = async (projectPart: Partial<Project>) => {
      const generatedCode = projectPart.internalContractNo || `PJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`;
      const newProject = { 
          id: Math.random().toString(36).substr(2, 9), 
          name: projectPart.name!, 
          code: generatedCode,
          contractNo: projectPart.contractNo,
          internalContractNo: projectPart.internalContractNo,
          clientName: projectPart.clientName!, 
          manager: projectPart.manager!, 
          startDate: projectPart.startDate!, 
          deadline: projectPart.deadline!, 
          status: 'Pending', 
          progress: 0, 
          nodes: JSON.parse(JSON.stringify(INITIAL_WORKFLOW)),
          createdAt: new Date().toISOString(),
          ...projectPart 
      } as Project;
      setProjects(prev => [...prev, newProject]);
      try { 
          await syncToBackend('projects', 'POST', newProject); 
          notify('项目创建成功', 'success'); 
      } catch (e) { rollbackAfterSyncFailure('创建失败，已恢复服务器最新数据'); }
  };

  const handleDeleteProject = async (projectId: string) => {
      const proj = projects.find(p => p.id === projectId);
      if (!proj) return;
      handleProtectedDelete(proj, 'projects', proj.name, async (id) => {
          setProjects(prev => prev.filter(p => p.id !== id));
          try { 
              await syncToBackend('projects', 'DELETE', {}, id);
              notify('项目已移至回收站', 'info'); 
              fetchData();
          } catch (e) { rollbackAfterSyncFailure('项目删除失败，已恢复服务器最新数据'); }
      });
  };

  const handleUpdateWorkflowNode = (updatedNode: WorkflowNode) => {
      if(!selectedProject) return;
      const newNodes = selectedProject.nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
      const completedCount = newNodes.filter(n => n.status === 'COMPLETED').length;
      const totalCount = newNodes.length;
      const newProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      handleUpdateProject({ ...selectedProject, nodes: newNodes, progress: newProgress });
  };

  const handleAddUser = async (user: User) => {
      setUsers(prev => [...prev, user]);
      try { 
          await syncToBackend('users', 'POST', user); 
          notify('用户创建成功', 'success'); 
      } catch (e) { rollbackAfterSyncFailure('创建失败，已恢复服务器最新数据'); }
  };

  const handleUpdateUser = async (user: User) => {
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
      if (currentUser.id === user.id) setCurrentUser(user);
      try { 
          await syncToBackend('users', 'PUT', user, user.id); 
          notify('用户资料已更新', 'success'); 
      } catch (e) { rollbackAfterSyncFailure('用户资料更新失败，已恢复服务器最新数据'); }
  };

  const handleDeleteUser = async (userId: string) => {
      if (currentUser.id === userId) return alert("不能注销当前账户");
      try { 
          await syncToBackend('users', 'DELETE', {}, userId); 
          setUsers(prev => prev.filter(u => u.id !== userId));
          notify('用户已注销', 'success'); 
          fetchData(); 
      } catch (e) { rollbackAfterSyncFailure('注销失败，已恢复服务器最新数据'); }
  };

  const handleAddClient = (client: Client) => {
      setClients(p => [...p, client]);
      void syncToBackendOrRollback('clients', 'POST', client, undefined, '客户创建失败，已恢复服务器最新数据');
  };
  
  const handleUpdateClient = (client: Client) => {
      setClients(p => p.map(c => c.id === client.id ? client : c));
      void syncToBackendOrRollback('clients', 'PUT', client, client.id, '客户更新失败，已恢复服务器最新数据');
  };
  
  const handleDeleteClient = (id: string) => {
      const client = clients.find(c => c.id === id);
      if (!client) return;
      handleProtectedDelete(client, 'clients', client.companyName, (id) => {
          setClients(p => p.filter(c => c.id !== id));
          void syncToBackendOrRollback('clients', 'DELETE', {}, id, '客户删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleAddContact = (clientId: string, contact: Contact) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      handleUpdateClient({ ...client, contacts: [...client.contacts, contact] });
  };

  const handleAddEquipment = (eq: Equipment) => {
      const newEq = { ...eq, createdAt: new Date().toISOString() };
      setEquipment(p => [...p, newEq]);
      void syncToBackendOrRollback('equipment', 'POST', newEq, undefined, '设备创建失败，已恢复服务器最新数据');
  };

  const handleUpdateEquipment = (eq: Equipment) => {
      setEquipment(p => p.map(e => e.id === eq.id ? eq : e));
      void syncToBackendOrRollback('equipment', 'PUT', eq, eq.id, '设备更新失败，已恢复服务器最新数据');
  };

  const handleDeleteEquipment = (id: string) => {
      const eq = equipment.find(e => e.id === id);
      if (!eq) return;
      handleProtectedDelete(eq, 'equipment', eq.name, (id) => {
          setEquipment(p => p.filter(e => e.id !== id));
          void syncToBackendOrRollback('equipment', 'DELETE', {}, id, '设备删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleAddArchive = (archive: ArchiveItem) => {
      const newArc = { ...archive, createdAt: new Date().toISOString() };
      setArchives(p => [...p, newArc]);
      void syncToBackendOrRollback('archives', 'POST', newArc, undefined, '档案创建失败，已恢复服务器最新数据');
  };

  const handleUpdateArchive = (updatedArchive: ArchiveItem) => {
      setArchives(prev => prev.map(a => a.id === updatedArchive.id ? updatedArchive : a));
      void syncToBackendOrRollback('archives', 'PUT', updatedArchive, updatedArchive.id, '档案更新失败，已恢复服务器最新数据');
  };

  const handleDeleteArchive = (id: string) => {
      const arc = archives.find(a => a.id === id);
      if (!arc) return;
      handleProtectedDelete(arc, 'archives', arc.title, async (id) => {
          // 核心同步逻辑：1. 从全局档案列表中删除
          setArchives(p => p.filter(a => a.id !== id));
          
          // 2. 深度同步：遍历所有项目，从每一个任务节点的附件中移除该文件的引用
          setProjects(prevProjects => {
              const updatedProjects = prevProjects.map(project => {
                  let hasChanges = false;
                  const updatedNodes = project.nodes.map(node => {
                      const filteredAttachments = node.attachments.filter(att => att.id !== id);
                      if (filteredAttachments.length !== node.attachments.length) {
                          hasChanges = true;
                          return { ...node, attachments: filteredAttachments };
                      }
                      return node;
                  });
                  
                  if (hasChanges) {
                      // 如果项目发生了变化，异步推送到后端
                      const updatedProject = { ...project, nodes: updatedNodes };
                      void syncToBackendOrRollback('projects', 'PUT', updatedProject, updatedProject.id, '项目附件同步失败，已恢复服务器最新数据');
                      return updatedProject;
                  }
                  return project;
              });
              return updatedProjects;
          });

          // 3. 同步至后端档案库
          try {
              await syncToBackend('archives', 'DELETE', {}, id);
              notify('档案已移至回收站', 'info'); 
              fetchData();
          } catch (e) { rollbackAfterSyncFailure('档案删除失败，已恢复服务器最新数据'); }
      });
  };

  const handleAddDoc = (doc: DocItem) => {
      const newDoc = { ...doc, createdAt: new Date().toISOString() };
      setDocs(p => [...p, newDoc]);
      void syncToBackendOrRollback('docs', 'POST', newDoc, undefined, '文档创建失败，已恢复服务器最新数据');
  };

  const handleUpdateDoc = (doc: DocItem) => {
      setDocs(p => p.map(d => d.id === doc.id ? doc : d));
      void syncToBackendOrRollback('docs', 'PUT', doc, doc.id, '文档更新失败，已恢复服务器最新数据');
  };

  const handleDeleteDoc = (id: string) => {
      const doc = docs.find(d => d.id === id);
      if (!doc) return;
      handleProtectedDelete(doc, 'docs', doc.title, (id) => {
          setDocs(p => p.filter(d => d.id !== id));
          void syncToBackendOrRollback('docs', 'DELETE', {}, id, '文档删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleAddScheduleItem = (item: ScheduleItem) => {
      const newItem = { ...item, createdAt: new Date().toISOString(), userId: currentUser.id };
      setSchedule(p => [...p, newItem]);
      void syncToBackendOrRollback('schedule', 'POST', newItem, undefined, '日程创建失败，已恢复服务器最新数据');
  };

  const handleCompleteScheduleItem = (id: string) => {
      const item = schedule.find(s => s.id === id);
      if (!item) return;
      const updated = { ...item, isCompleted: true };
      setSchedule(p => p.map(s => s.id === id ? updated : s));
      void syncToBackendOrRollback('schedule', 'PUT', updated, id, '日程更新失败，已恢复服务器最新数据');
  };

  const handleDeleteScheduleItem = (id: string) => {
      const item = schedule.find(s => s.id === id);
      if (!item) return;
      handleProtectedDelete(item, 'schedule', item.title, (id) => {
          setSchedule(p => p.filter(s => s.id !== id));
          void syncToBackendOrRollback('schedule', 'DELETE', {}, id, '日程删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleUpdateProduction = (projProd: ProjectProduction) => {
      const normalized = normalizeProductionRecord(projProd);
      setProductionData(prev => {
          const exists = prev.find(i => i.id === normalized.id);
          if (exists) return prev.map(i => i.id === normalized.id ? normalized : i);
          return [...prev, normalized];
      });
      void syncToBackendOrRollback('production', 'POST', normalized, undefined, '生产数据同步失败，已恢复服务器最新数据');
  };

  const handleDeleteProduction = (projectId: string) => {
      const prod = productionData.find(p => p.projectId === projectId);
      if (!prod) return;
      handleProtectedDelete(prod, 'production', prod.projectName, (id) => {
          setProductionData(prev => prev.filter(p => p.id !== id));
          void syncToBackendOrRollback('production', 'DELETE', {}, id, '生产数据删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleAddApproval = (approval: Approval) => {
      setApprovals(p => [...p, approval]);
      void syncToBackendOrRollback('approvals', 'POST', approval, undefined, '审批创建失败，已恢复服务器最新数据');
  };

  const handleUpdateApproval = (approval: Approval) => {
      setApprovals(p => p.map(a => a.id === approval.id ? approval : a));
      void syncToBackendOrRollback('approvals', 'PUT', approval, approval.id, '审批更新失败，已恢复服务器最新数据');
  };

  const onDeleteApproval = (id: string) => {
      setApprovals(p => p.filter(a => a.id !== id));
      void syncToBackendOrRollback('approvals', 'DELETE', {}, id, '审批删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
  };

  const handleAddPayment = (payment: PaymentRecord) => {
      const newPay = { ...payment, createdAt: new Date().toISOString(), creatorId: currentUser.id };
      setPaymentRecords(p => [...p, newPay]);
      void syncToBackendOrRollback('payments', 'POST', newPay, undefined, '回款记录创建失败，已恢复服务器最新数据');
  };

  const handleUpdatePayment = (payment: PaymentRecord) => {
      setPaymentRecords(p => p.map(pr => pr.id === payment.id ? payment : pr));
      void syncToBackendOrRollback('payments', 'PUT', payment, payment.id, '回款记录更新失败，已恢复服务器最新数据');
  };

  const handleDeletePayment = (id: string) => {
      const pay = paymentRecords.find(p => p.id === id);
      if (!pay) return;
      handleProtectedDelete(pay, 'payments', pay.projectName, (id) => {
          setPaymentRecords(p => p.filter(pr => pr.id !== id));
          void syncToBackendOrRollback('payments', 'DELETE', {}, id, '回款记录删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleAddWorkLog = (log: WorkLogEntry) => {
      setWorkLogs(p => [...p, log]);
      void syncToBackendOrRollback('worklogs', 'POST', log, undefined, '工作记录创建失败，已恢复服务器最新数据');
  };

  const handleUpdateWorkLog = (log: WorkLogEntry) => {
      setWorkLogs(p => p.map(l => l.id === log.id ? log : l));
      void syncToBackendOrRollback('worklogs', 'PUT', log, log.id, '工作记录更新失败，已恢复服务器最新数据');
  };

  const handleDeleteWorkLog = (id: string) => {
      const log = workLogs.find(l => l.id === id);
      if (!log) return;
      handleProtectedDelete(log, 'worklogs', `${log.userName} ${log.date} 工时`, (id) => {
          setWorkLogs(p => p.filter(l => l.id !== id));
          void syncToBackendOrRollback('worklogs', 'DELETE', {}, id, '工作记录删除失败，已恢复服务器最新数据').then((ok) => { if (ok) fetchData(); });
      });
  };

  const handleSendMessage = (msg: ChatMessage) => {
      setMessages(p => [...p, msg]);
      void syncToBackendOrRollback('messages', 'POST', msg, undefined, '消息发送失败，已恢复服务器最新数据');
  };

  const handleDeleteMessage = (id: string) => {
      setMessages(p => p.filter(m => m.id !== id));
      void syncToBackendOrRollback('messages', 'DELETE', {}, id, '消息删除失败，已恢复服务器最新数据');
  };

  const handleAddChannel = (ch: ChatChannel) => {
      setChannels(p => [...p, ch]);
      void syncToBackendOrRollback('channels', 'POST', ch, undefined, '频道创建失败，已恢复服务器最新数据');
  };

  const handleUpdateChannel = (ch: ChatChannel) => {
      setChannels(p => p.map(c => c.id === ch.id ? ch : c));
      void syncToBackendOrRollback('channels', 'PUT', ch, ch.id, '频道更新失败，已恢复服务器最新数据');
  };

  const handleDeleteChannel = (id: string) => {
      setChannels(p => p.filter(c => c.id !== id));
      void syncToBackendOrRollback('channels', 'DELETE', {}, id, '频道删除失败，已恢复服务器最新数据');
  };

  const handleAddAnnouncement = (ann: ChatAnnouncement) => {
      setAnnouncements(p => [...p, ann]);
      void syncToBackendOrRollback('announcements', 'POST', ann, undefined, '公告发布失败，已恢复服务器最新数据');
      setSessionAnnouncementsRead(false);
  };

  const handleUpdateAnnouncement = (ann: ChatAnnouncement) => {
      setAnnouncements(p => p.map(a => a.id === ann.id ? ann : a));
      void syncToBackendOrRollback('announcements', 'PUT', ann, ann.id, '公告更新失败，已恢复服务器最新数据');
  };

  const handleDeleteAnnouncement = (id: string) => {
      setAnnouncements(p => p.filter(a => a.id !== id));
      void syncToBackendOrRollback('announcements', 'DELETE', {}, id, '公告删除失败，已恢复服务器最新数据');
  };

  const handleRestoreRecycleItem = async (id: string) => {
      try {
          await apiFetch(`${API_URL}/recycle_bin/restore/${id}`, {
              method: 'POST'
          });
          notify('数据已成功恢复', 'success');
          fetchData();
      } catch (e) { notify('恢复失败', 'error'); }
  };

  const handlePermanentDeleteRecycleItem = async (id: string) => {
      try {
          await apiFetch(`${API_URL}/recycle_bin/${id}`, {
              method: 'DELETE'
          });
          notify('数据已永久删除', 'info');
          fetchData();
      } catch (e) { notify('删除失败', 'error'); }
  };

  const handleEmptyRecycleBin = async () => {
      if (!window.confirm("确定要彻底清空回收站吗？")) return;
      try {
          await apiFetch(`${API_URL}/recycle_bin/empty/all`, {
              method: 'DELETE'
          });
          notify('回收站已清空', 'success');
          fetchData();
      } catch (e) { notify('清空失败', 'error'); }
  };

  const handleSendAiMessage = (msg: any) => {
      const msgWithUser = { ...msg, userId: currentUser.id };
      setAiMessages(prev => [...prev, msgWithUser]);
      void syncToBackendOrRollback('ai_messages', 'POST', msgWithUser, undefined, 'AI 会话保存失败，已恢复服务器最新数据');
  };

  const handleDeleteAiMessage = (id: string) => {
      setAiMessages(prev => prev.filter(m => m.id !== id));
      void syncToBackendOrRollback('ai_messages', 'DELETE', {}, id, 'AI 会话删除失败，已恢复服务器最新数据');
  };

  const handleClearAiHistory = async () => {
      const myMsgs = aiMessages.filter(m => m.userId === currentUser.id);
      for (const msg of myMsgs) {
          await syncToBackend('ai_messages', 'DELETE', {}, msg.id);
      }
      setAiMessages(prev => prev.filter(m => m.userId !== currentUser.id));
  };

  const handleMarkChatRead = useCallback((channelId: string) => {
      const now = new Date().toISOString();
      setChatLastReadMap(prev => {
          const updated = { ...prev, [channelId]: now };
          setCurrentUser(curr => ({ ...curr, lastReadMap: updated }));
          apiJson(`${API_URL}/auth/me`, {
              method: 'PATCH',
              json: { lastReadMap: updated }
          }).catch(() => notify('聊天已读状态同步失败', 'error'));
          return updated;
      });
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    try {
        await syncToBackend('settings', 'PUT', newSettings, 'global_config');
        notify('系统设置已同步', 'success');
    } catch (e) { rollbackAfterSyncFailure('设置同步失败，已恢复服务器最新数据'); }
  };

  const handleSaveUserPrefs = async (newPrefs: UserPreferences) => {
      setUserPrefs(newPrefs);
      const updatedUser = { ...currentUser, preferences: newPrefs };
      setCurrentUser(updatedUser);
      try {
          await apiJson(`${API_URL}/auth/me`, {
              method: 'PATCH',
              json: { preferences: newPrefs }
          });
          localStorage.setItem(
            `ierp_prefs_${currentUser.id}`,
            JSON.stringify(newPrefs)
          );
          notify('偏好设置已同步', 'success');
      } catch (e) { rollbackAfterSyncFailure('偏好设置同步失败，已恢复服务器最新数据'); }
  };

  const handleLogout = async () => {
    try {
      await apiFetch(`${API_URL}/auth/logout`, { method: 'POST' });
    } catch {}
    setIsAuthenticated(false);
    setCurrentUser(INITIAL_USERS[0]);
    setConnectionStatus('offline');
    notify('已退出', 'info');
  };

  const handleNavigate = (view: string, context: NavigationContext = {}) => {
    if (view === 'projects') {
      setSelectedProject(context.projectId ? projects.find(project => project.id === context.projectId) || null : null);
      setHomeReturnDrilldown(context.returnToHomeDrilldown || null);
    } else if (view === 'home') {
      setSelectedProject(null);
    }

    const productionTarget = context.productionProjectId || context.projectId || null;
    const paymentProjectId = context.paymentProjectId || context.projectId;
    const paymentTarget = context.paymentId || paymentProjectId ? { paymentId: context.paymentId, projectId: paymentProjectId } : null;
    setTargetProductionProjectId(view === 'production' ? productionTarget : null);
    setTargetPaymentFocus(view === 'payments' ? paymentTarget : null);
    setActiveView(view);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const chatUnreadCount = useMemo(() => {
      if (!isAuthenticated) return 0;
      let count = 0;
      channels.forEach(c => {
          if (c.id === activeChannelId) return;
          const lastRead = chatLastReadMap[c.id] || '1970-01-01';
          count += messages.filter(m => m.channelId === c.id && m.timestamp > lastRead).length;
      });
      return count;
  }, [messages, channels, chatLastReadMap, activeChannelId, isAuthenticated]);

  const pendingApprovalCount = useMemo(() => {
    if (!isAuthenticated) return 0;
    return approvals.filter(a => {
        if (a.status !== 'Pending' || a.applicantId === currentUser.id) return false;
        const outcomes = a.versions?.[0]?.outcomes || [];
        const signedIds = outcomes.map(o => o.approverId);
        return a.approverIds.includes(currentUser.id) && !signedIds.includes(currentUser.id);
    }).length;
  }, [approvals, currentUser.id, isAuthenticated]);

  if (!isLoaded) {
      return (
          <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100">
              <div className="text-sm font-black text-slate-400">正在验证会话...</div>
          </div>
      );
  }

  if (!isAuthenticated) {
      return (
          <Login 
              onLogin={(u) => { 
                  setCurrentUser(u); 
                  setIsAuthenticated(true); 
                  setConnectionStatus('connecting');
                  fetchData(u.id);
              }} 
              appName={appSettings?.appName} 
              logoUrl={displayLogoUrl}
          />
      );
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-200 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors fixed inset-0">
      <NotificationToast notifications={notifications} onDismiss={dismissToast} />
      <Sidebar 
          activeView={activeView} 
          onNavigate={handleNavigate} 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
          currentUser={currentUser} 
          settings={displaySettings}
          onOpenSettings={() => setIsSettingsOpen(true)} 
          onOpenUserPrefs={() => setIsUserPrefsOpen(true)} 
          onLogout={handleLogout} 
          chatUnreadCount={chatUnreadCount} 
          pendingApprovalCount={pendingApprovalCount}
      />
      <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden">
        <Header 
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)} 
            currentUser={currentUser} 
            allUsers={users} 
            onSwitchUser={() => {}} 
            settings={displaySettings}
            notifications={notifications} 
            onMarkAllRead={markAllNotificationsAsRead} 
            onDeleteNotification={handleDeleteNotification} 
            onLogout={handleLogout} 
            connectionStatus={connectionStatus} 
            theme={theme} 
            toggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')} 
            onOpenUserPrefs={() => setIsUserPrefsOpen(true)} 
            userPrefs={userPrefs} 
        />
        <main className={`flex-1 overflow-y-auto ${activeView === 'chat' ? 'p-0' : 'p-4 md:p-8'}`}>
          <Suspense fallback={<div className="p-8 text-sm font-black text-slate-400">正在加载模块...</div>}>
            {activeView === 'home' && (
              <HomeDashboard
                projects={projects}
                schedule={schedule}
                paymentRecords={paymentRecords}
                productionData={productionData}
                approvals={approvals}
                archives={archives}
                workLogs={workLogs}
                messages={messages}
                channels={channels}
                announcements={announcements}
                currentUser={currentUser}
                users={users}
                chatUnreadCount={chatUnreadCount}
                pendingApprovalCount={pendingApprovalCount}
                onNavigate={handleNavigate}
                restoreDrilldown={homeReturnDrilldown}
                onRestoreDrilldownConsumed={() => setHomeReturnDrilldown(null)}
              />
            )}
            {activeView === 'projects' && (selectedProject ? 
                <ProjectWorkflow project={selectedProject} nodes={selectedProject.nodes} onUpdateNode={handleUpdateWorkflowNode} onUpdateProject={handleUpdateProject} onBack={() => { if (homeReturnDrilldown) { setSelectedProject(null); setActiveView('home'); } else { setSelectedProject(null); } }} backLabel={homeReturnDrilldown ? '返回首页明细' : '返回项目台账'} onAddArchive={handleAddArchive} onDeleteArchive={handleDeleteArchive} archives={archives.filter(a => a.projectId === selectedProject.id)} currentUser={currentUser} users={users}/> :
                <ProjectList projects={projects} users={users} clients={clients} onSelectProject={setSelectedProject} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onAddProject={handleAddProject} onUpdateProject={handleUpdateProject} onDeleteProject={handleDeleteProject} currentUser={currentUser} onAddApproval={handleAddApproval}/>
            )}
            {activeView === 'production' && <ProductionProgress projects={projects} productionData={productionData} onUpdateProject={handleUpdateProduction} onDeleteProjectProduction={handleDeleteProduction} currentUser={currentUser} initialProjectId={targetProductionProjectId} />}
            {activeView === 'approvals' && <ApprovalManager approvals={approvals} users={users} currentUser={currentUser} onAddApproval={handleAddApproval} onUpdateApproval={handleUpdateApproval} onDeleteApproval={onDeleteApproval} />}
            {activeView === 'payments' && <PaymentDashboard payments={paymentRecords} projects={projects} users={users} clients={clients} archives={archives} onAddPayment={handleAddPayment} onUpdatePayment={handleUpdatePayment} onDeletePayment={handleDeletePayment} currentUser={currentUser} focusTarget={targetPaymentFocus} />}
            {activeView === 'schedule' && <DailySchedule schedule={schedule} projects={projects} users={users} onCompleteItem={handleCompleteScheduleItem} onDeleteItem={handleDeleteScheduleItem} onAddItem={handleAddScheduleItem} currentUser={currentUser} onDeleteUser={handleDeleteUser}/>}
            {/* Fix: Changed handleUpdateLog to handleUpdateWorkLog to match defined function name */}
            {activeView === 'worklogs' && <WorkLogManager logs={workLogs} users={users} currentUser={currentUser} onAddLog={handleAddWorkLog} onUpdateLog={handleUpdateWorkLog} onDeleteLog={handleDeleteWorkLog} />}
            {activeView === 'chat' && <TeamChat currentUser={currentUser} messages={messages} channels={channels} projects={projects} users={users} onSendMessage={handleSendMessage} onDeleteMessage={handleDeleteMessage} onAddChannel={handleAddChannel} onUpdateChannel={handleUpdateChannel} lastReadMap={chatLastReadMap} onMarkRead={handleMarkChatRead} onDeleteChannel={handleDeleteChannel} activeChannelId={activeChannelId} onChannelSelect={setActiveChannelId} announcements={announcements} onAddAnnouncement={handleAddAnnouncement} onUpdateAnnouncement={handleUpdateAnnouncement} onDeleteAnnouncement={handleDeleteAnnouncement}/>}
            {activeView === 'email' && <EmailClient currentUser={currentUser} />}
            {activeView === 'archives' && <EngineeringArchives archives={archives} projects={projects} onAddArchive={handleAddArchive} onDeleteArchive={handleDeleteArchive} onUpdateArchive={handleUpdateArchive} currentUser={currentUser} />}
            {activeView === 'clients' && <ClientManager clients={clients} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onAddContact={handleAddContact} onDeleteClient={handleDeleteClient} currentUser={currentUser} />}
            {activeView === 'equipment' && <EquipmentLibrary equipmentList={equipment} onAddEquipment={handleAddEquipment} onUpdateEquipment={handleUpdateEquipment} onDeleteEquipment={handleDeleteEquipment} currentUser={currentUser} />}
            {activeView === 'docs' && <Documentation docs={docs} onAddDoc={handleAddDoc} onUpdateDoc={handleUpdateDoc} onDeleteDoc={handleDeleteDoc} currentUser={currentUser} />}
            {activeView === 'ai_center' && <AICenter currentUser={currentUser} messages={aiMessages.filter(m => m.userId === currentUser.id)} onSendMessage={handleSendAiMessage} onDeleteMessage={handleDeleteAiMessage} onClearHistory={handleClearAiHistory} />}
            {activeView === 'users' && <UserManager users={users} currentUser={currentUser} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />}
            {activeView === 'recycle_bin' && <RecycleBin items={recycleBin} currentUser={currentUser} onRestore={handleRestoreRecycleItem} onPermanentDelete={handlePermanentDeleteRecycleItem} onEmpty={handleEmptyRecycleBin} />}
          </Suspense>
        </main>
      </div>
      <Suspense fallback={null}>
        <SystemSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={appSettings} onSave={handleSaveSettings} />
        <UserPreferencesModal isOpen={isUserPrefsOpen} onClose={() => setIsUserPrefsOpen(false)} preferences={userPrefs} onSave={handleSaveUserPrefs} theme={theme} onThemeChange={setTheme} />
      </Suspense>
    </div>
  );
}

export default App;

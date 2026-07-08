
import React, { useState, useEffect, useRef } from 'react';
import { UserPreferences, ThemeColor, NotificationWebhooks } from '../types';
import { X, Bell, Save, Volume2, Palette, Clock, MapPin, Settings, CheckCircle2, Globe, MessageSquare, ClipboardList, Calendar, BellRing, ChevronDown, ShieldCheck, Send, MessageCircle, RotateCcw, Activity, Sun, Moon, Users } from 'lucide-react';
import { CHINA_CITIES_DATA } from '../constants';
import { API_URL, apiFetch } from '../lib/api';

interface UserPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

const UserPreferencesModal: React.FC<UserPreferencesModalProps> = ({ isOpen, onClose, preferences, onSave, theme, onThemeChange }) => {
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>(theme);
  const initialThemeRef = useRef<'light' | 'dark'>(theme);
  const savedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'push' | 'integration' | 'format' | 'theme' | 'weather'>('push');
  const [isTesting, setIsTesting] = useState<string | null>(null);

  // 城市选择状态
  const [selectedProvince, setSelectedProvince] = useState('');

  useEffect(() => {
      if (isOpen) {
          savedRef.current = false;
          initialThemeRef.current = theme;
          setLocalPrefs(preferences);
          setLocalTheme(theme);
          // 初始化已选省份
          if (preferences.weatherLocation.city) {
              for (const [prov, cities] of Object.entries(CHINA_CITIES_DATA)) {
                  if (cities.some(c => c.name === preferences.weatherLocation.city)) {
                      setSelectedProvince(prov);
                      break;
                  }
              }
          }
      }
  }, [isOpen, preferences, theme]);

  useEffect(() => {
      if (!isOpen) return;
      document.body.setAttribute('data-theme', localPrefs.themeColor || 'blue');
      const baseSizeMap = { small: '14px', medium: '16px', large: '18px', xlarge: '20px' } as const;
      document.documentElement.style.fontSize = baseSizeMap[localPrefs.fontSize] || '16px';
  }, [isOpen, localPrefs.themeColor, localPrefs.fontSize]);

  useEffect(() => {
      if (isOpen) onThemeChange(localTheme);
  }, [isOpen, localTheme, onThemeChange]);

  if (!isOpen) return null;

  const restorePreview = () => {
    document.body.setAttribute('data-theme', preferences.themeColor || 'blue');
    const baseSizeMap = { small: '14px', medium: '16px', large: '18px', xlarge: '20px' } as const;
    document.documentElement.style.fontSize = baseSizeMap[preferences.fontSize] || '16px';
    onThemeChange(initialThemeRef.current);
  };

  const handleCancel = () => {
    if (!savedRef.current) restorePreview();
    onClose();
  };

  const handleSave = () => {
    savedRef.current = true;
    onSave(localPrefs);
    onClose();
  };

  const handleTestPush = async (type: 'PushPlus' | 'WeCom' | 'DingTalk') => {
      const config = localPrefs.webhooks || {};
      if (type === 'PushPlus' && !config.pushPlusToken) return alert('请先输入 Token');
      if (type === 'WeCom' && !config.wecomWebhook) return alert('请先输入 Webhook URL');
      if (type === 'DingTalk' && !config.dingtalkWebhook) return alert('请先输入 Webhook URL');

      setIsTesting(type);
      try {
          const res = await apiFetch(`${API_URL}/push/test`, {
              method: 'POST',
              json: { type, config }
          });
          if (res.ok) {
              alert(`${type} 测试消息已发出，请在相应客户端检查。`);
          } else {
              const err = await res.json();
              alert(`发送失败：${err.error}`);
          }
      } catch (e) {
          alert('后端测试接口未响应');
      } finally {
          setIsTesting(null);
      }
  };

  const updateWebhooks = (key: keyof NotificationWebhooks, value: string) => {
      setLocalPrefs(prev => ({
          ...prev,
          webhooks: {
              ...(prev.webhooks || {}),
              [key]: value
          }
      }));
  };

  const updateNotificationType = (key: keyof typeof localPrefs.types, value: boolean) => {
      setLocalPrefs(prev => ({
          ...prev,
          types: {
              ...prev.types,
              [key]: value
          }
      }));
  };

  const themes: { id: ThemeColor; color: string; label: string }[] = [
      { id: 'blue', color: '#3b82f6', label: '经典蓝' },
      { id: 'emerald', color: '#10b981', label: '翡翠绿' },
      { id: 'violet', color: '#8b5cf6', label: '紫罗兰' },
      { id: 'amber', color: '#f59e0b', label: '琥珀金' },
      { id: 'rose', color: '#f43f5e', label: '玫瑰红' },
      { id: 'cyan', color: '#06b6d4', label: '天际青' },
  ];

  const handleCitySelect = (cityName: string, lat: number, lon: number) => {
      setLocalPrefs(prev => ({
          ...prev,
          weatherLocation: {
              mode: 'manual',
              city: cityName,
              latitude: lat,
              longitude: lon
          }
      }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm transition-all p-4 md:p-6 overflow-hidden">
      <div className="bg-white dark:bg-slate-800 w-full max-w-xl rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[95vh] transition-all relative border border-white/20">

        {/* Header Section */}
        <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
              <Settings className="w-6 h-6 text-primary-600" />
            </div>
            <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">账户偏好设置</h3>
          </div>
          <button onClick={handleCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 shrink-0 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 5-Tab Navigation System */}
        <div className="flex space-x-1 mb-8 bg-slate-100/60 dark:bg-slate-900/50 p-1 rounded-[1.5rem] shrink-0 shadow-inner overflow-x-auto no-scrollbar">
            {[
                { id: 'push', label: '通知', icon: Bell },
                { id: 'integration', label: '推送集成', icon: Globe },
                { id: 'format', label: '语言格式', icon: Clock },
                { id: 'theme', label: '外观主题', icon: Palette },
                { id: 'weather', label: '气象定位', icon: MapPin },
            ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 min-w-[70px] flex flex-col items-center gap-1.5 py-4 px-2 rounded-[1.2rem] transition-all group ${
                    activeTab === tab.id
                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-xl transform scale-105 border border-slate-100 dark:border-slate-600'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <tab.icon className={`w-4.5 h-4.5 transition-transform group-hover:scale-110 ${activeTab === tab.id ? 'text-primary-500' : 'text-slate-400'}`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`}>{tab.label}</span>
                </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
            <div className="space-y-10 pb-10">

                {/* 1. 通知页签 */}
                {activeTab === 'push' && (
                    <div className="space-y-8 animate-in fade-in transition-all">
                        <div className="bg-slate-50/80 dark:bg-slate-900/40 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm transition-all space-y-8">

                            {/* 桌面实时推送设置 */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <span className="text-base font-black text-slate-800 dark:text-slate-100">桌面实时推送</span>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">浏览器最小化时发送关键工程预警</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer" checked={localPrefs.enableBrowser} onChange={e => setLocalPrefs(p => ({...p, enableBrowser: e.target.checked}))} />
                                  <div className="w-14 h-8 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary-500 transition-all shadow-inner"></div>
                                </label>
                            </div>

                            <div className="h-px bg-slate-200/50 dark:bg-slate-800 w-full"></div>

                            {/* 交互提示音效设置 */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                                    <Volume2 className="w-4 h-4 text-slate-400" />
                                  </div>
                                  <span className="text-base font-black text-slate-800 dark:text-slate-100">交互提示音效</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer" checked={localPrefs.sound} onChange={e => setLocalPrefs(p => ({...p, sound: e.target.checked}))} />
                                  <div className="w-14 h-8 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary-500 transition-all shadow-inner"></div>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">通知订阅类型</h4>

                            <div className="space-y-3">
                                {[
                                    { key: 'chat', label: '团队即时通讯 (含群组置顶公告)', icon: MessageSquare },
                                    { key: 'approval', label: '业务审批动态 (含未读待批复申请)', icon: ClipboardList },
                                    { key: 'task', label: '工程任务节点交付预警', icon: Calendar },
                                    { key: 'system', label: '系统状态与紧急维护通报', icon: BellRing },
                                ].map(item => (
                                    <div key={item.key} className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm active:scale-[0.99] group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center transition-all group-hover:bg-white dark:group-hover:bg-slate-700">
                                                <item.icon className="w-5 h-5 text-slate-400" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={localPrefs.types[item.key as keyof typeof localPrefs.types]}
                                            onChange={e => updateNotificationType(item.key as any, e.target.checked)}
                                            className="w-6 h-6 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500 transition-all cursor-pointer shadow-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. 推送集成页签 - 增加测试按钮 */}
                {activeTab === 'integration' && (
                    <div className="space-y-6 animate-in slide-in-from-right-2">
                        <div className="bg-primary-50 dark:bg-primary-900/20 p-5 rounded-2xl border border-primary-100 dark:border-primary-800 flex gap-4 mb-2 shadow-sm">
                            <ShieldCheck className="w-6 h-6 text-primary-600 flex-shrink-0" />
                            <p className="text-[10px] font-bold text-primary-700 dark:text-primary-300 leading-relaxed uppercase tracking-tight">
                                请绑定您的个人推送通道。当有需要您处理的审批流转到您的节点时，系统将通过这些通道向您发送即时提醒。
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                { title: '个人必达', desc: '审批、聊天点名、个人待办用 PushPlus，最适合一对一提醒。', icon: MessageCircle, tone: 'text-primary-600 bg-primary-50 border-primary-100' },
                                { title: '团队同步', desc: '项目群、部门公告建议用企业微信群机器人，方便多人同时看见。', icon: Users, tone: 'text-blue-600 bg-blue-50 border-blue-100' },
                                { title: '备用通道', desc: '钉钉适合外部协作或备用告警，建议只接系统级通知。', icon: ShieldCheck, tone: 'text-cyan-600 bg-cyan-50 border-cyan-100' }
                            ].map(item => (
                                <div key={item.title} className={`p-4 rounded-2xl border ${item.tone} dark:bg-slate-900/40 dark:border-slate-700`}>
                                    <item.icon className="w-5 h-5 mb-3" />
                                    <p className="text-xs font-black text-slate-800 dark:text-white">{item.title}</p>
                                    <p className="mt-2 text-[10px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-6">
                            {/* PushPlus */}
                            <div className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-8 space-y-6 shadow-sm">
                                <div className="flex items-center justify-between border-b dark:border-slate-800 pb-4">
                                    <div className="flex items-center gap-3">
                                        <MessageCircle className="w-6 h-6 text-primary-500" />
                                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">PUSHPLUS 通道</h4>
                                    </div>
                                    <button
                                        onClick={() => handleTestPush('PushPlus')}
                                        disabled={isTesting !== null}
                                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-primary-600 flex items-center gap-1.5 active:scale-95 transition-all"
                                    >
                                        {isTesting === 'PushPlus' ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                                        测试连接
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest ml-1">个人专用推送 TOKEN</label>
                                    <input
                                        className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-5 py-4 outline-none focus:border-primary-500 font-mono text-xs dark:text-white shadow-inner transition-all"
                                        type="password"
                                        value={localPrefs.webhooks?.pushPlusToken || ''}
                                        onChange={e => updateWebhooks('pushPlusToken', e.target.value)}
                                        placeholder="在此粘贴您的 pushplus token..."
                                    />
                                </div>
                            </div>

                            {/* 企业微信 */}
                            <div className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-8 space-y-6 shadow-sm">
                                <div className="flex items-center justify-between border-b dark:border-slate-800 pb-4">
                                    <div className="flex items-center gap-3">
                                        <Send className="w-6 h-6 text-blue-500" />
                                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">企业微信群机器人</h4>
                                    </div>
                                    <button
                                        onClick={() => handleTestPush('WeCom')}
                                        disabled={isTesting !== null}
                                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-blue-600 flex items-center gap-1.5 active:scale-95 transition-all"
                                    >
                                        {isTesting === 'WeCom' ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                                        测试连接
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest ml-1">WEBHOOK URL</label>
                                    <input
                                        className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-5 py-4 outline-none focus:border-blue-500 font-mono text-xs dark:text-white shadow-inner transition-all"
                                        value={localPrefs.webhooks?.wecomWebhook || ''}
                                        onChange={e => updateWebhooks('wecomWebhook', e.target.value)}
                                        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                                    />
                                </div>
                            </div>

                            {/* 钉钉 */}
                            <div className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-8 space-y-6 shadow-sm">
                                <div className="flex items-center justify-between border-b dark:border-slate-800 pb-4">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="w-6 h-6 text-cyan-500" />
                                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">钉钉自定义机器人</h4>
                                    </div>
                                    <button
                                        onClick={() => handleTestPush('DingTalk')}
                                        disabled={isTesting !== null}
                                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-cyan-600 flex items-center gap-1.5 active:scale-95 transition-all"
                                    >
                                        {isTesting === 'DingTalk' ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                                        测试连接
                                    </button>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest ml-1">WEBHOOK URL (含 TOKEN)</label>
                                        <input
                                            className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-5 py-4 outline-none focus:border-cyan-500 font-mono text-xs dark:text-white shadow-inner transition-all"
                                            value={localPrefs.webhooks?.dingtalkWebhook || ''}
                                            onChange={e => updateWebhooks('dingtalkWebhook', e.target.value)}
                                            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest ml-1">安全密钥 (SECRET)</label>
                                        <input
                                            className="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-5 py-4 outline-none focus:border-cyan-500 font-mono text-xs dark:text-white shadow-inner transition-all"
                                            type="password"
                                            value={localPrefs.webhooks?.dingtalkSecret || ''}
                                            onChange={e => updateWebhooks('dingtalkSecret', e.target.value)}
                                            placeholder="SEC..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. 语言格式页签 */}
                {activeTab === 'format' && (
                    <div className="space-y-10 animate-in slide-in-from-right-2 duration-500">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">日期显示标准</label>
                            <div className="relative group">
                                <select
                                    className="w-full appearance-none border-2 border-slate-100 dark:border-slate-700 rounded-[1.5rem] px-6 py-5 bg-white dark:bg-slate-900 text-lg font-black text-slate-800 dark:text-white outline-none focus:border-primary-500 shadow-sm transition-all"
                                    value={localPrefs.dateFormat}
                                    onChange={e => setLocalPrefs({...localPrefs, dateFormat: e.target.value as any})}
                                >
                                    <option value="YYYY-MM-DD">2023-12-31 (标准模式)</option>
                                    <option value="DD/MM/YYYY">31/12/2023 (国际模式)</option>
                                    <option value="MM/DD/YYYY">12/31/2023 (欧美模式)</option>
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <ChevronDown className="w-6 h-6" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">财务币种与数据格式</label>
                            <div className="grid grid-cols-3 gap-4">
                                {['¥', '$', '€'].map(symbol => (
                                    <button
                                        key={symbol}
                                        onClick={() => setLocalPrefs({
                                            ...localPrefs,
                                            numberFormat: { ...localPrefs.numberFormat, currencySymbol: symbol as any }
                                        })}
                                        className={`py-8 rounded-[1.5rem] text-4xl font-black transition-all border-2 shadow-sm ${
                                            localPrefs.numberFormat.currencySymbol === symbol
                                            ? 'bg-primary-50/40 border-primary-500 text-primary-600 dark:bg-primary-900/20 shadow-lg'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 text-slate-200 dark:text-slate-700 hover:border-slate-200'
                                        }`}
                                    >
                                        {symbol}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center justify-between p-6 bg-slate-50/50 dark:bg-slate-900/30 rounded-[1.5rem] border-2 border-slate-50 dark:border-slate-800 transition-all">
                                <span className="text-base font-black text-slate-700 dark:text-slate-200">开启千分位分隔符 <span className="text-slate-400 font-bold opacity-60 ml-2">(1,000.00)</span></span>
                                <input
                                    type="checkbox"
                                    checked={localPrefs.numberFormat.useThousandsSeparator}
                                    onChange={e => setLocalPrefs({
                                        ...localPrefs,
                                        numberFormat: { ...localPrefs.numberFormat, useThousandsSeparator: e.target.checked }
                                    })}
                                    className="w-7 h-7 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500 transition-all cursor-pointer shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. 外观主题页签 */}
                {activeTab === 'theme' && (
                    <div className="space-y-8 animate-in fade-in transition-all">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-5 tracking-[0.3em] ml-1">亮暗模式</label>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: 'light' as const, label: '浅色模式', desc: '白天办公更清晰', icon: Sun },
                                    { id: 'dark' as const, label: '深色模式', desc: '夜间查看更柔和', icon: Moon }
                                ].map(option => (
                                    <button
                                        key={option.id}
                                        onClick={() => setLocalTheme(option.id)}
                                        className={`p-5 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                                            localTheme === option.id
                                            ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-primary-200'
                                        }`}
                                    >
                                        <option.icon className="w-6 h-6 mb-4" />
                                        <p className="text-sm font-black">{option.label}</p>
                                        <p className="mt-1 text-[10px] font-bold opacity-60">{option.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-5 tracking-[0.3em] ml-1">品牌配色选择</label>
                            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                                {themes.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setLocalPrefs(p => ({...p, themeColor: t.id}))}
                                        className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center transition-all hover:scale-110 active:scale-95 ${
                                            localPrefs.themeColor === t.id
                                            ? 'ring-4 ring-offset-4 ring-slate-100 dark:ring-offset-slate-800 scale-105 shadow-2xl border-4 border-white'
                                            : 'opacity-60 grayscale-[0.5] hover:grayscale-0 hover:opacity-100'
                                        }`}
                                        style={{ backgroundColor: t.color }}
                                    >
                                        {localPrefs.themeColor === t.id && <CheckCircle2 className="w-8 h-8 text-white drop-shadow-lg" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-5 tracking-[0.3em] ml-1">界面字体比例</label>
                            <div className="grid grid-cols-4 gap-4">
                                {['small', 'medium', 'large', 'xlarge'].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => setLocalPrefs(p => ({...p, fontSize: size as any}))}
                                        className={`py-6 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-sm ${
                                            localPrefs.fontSize === size
                                            ? 'bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 text-slate-300'
                                        }`}
                                    >
                                        <span className="font-black text-xl">A</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest">{size}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. 定位天气页签 */}
                {activeTab === 'weather' && (
                    <div className="space-y-8 animate-in fade-in transition-all pb-10">
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 tracking-[0.3em] ml-1">气象定位与展示策略</label>
                        <div className="flex gap-2 bg-slate-100/60 dark:bg-slate-950 p-1.5 rounded-[1.5rem] mb-6 shadow-inner">
                            <button
                                onClick={() => setLocalPrefs(p => ({...p, weatherLocation: { mode: 'auto' }}))}
                                className={`flex-1 py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${localPrefs.weatherLocation.mode === 'auto' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-xl' : 'text-slate-400'}`}
                            >
                                智能识别
                            </button>
                            <button
                                onClick={() => setLocalPrefs(p => ({...p, weatherLocation: { ...p.weatherLocation, mode: 'manual' }}))}
                                className={`flex-1 py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${localPrefs.weatherLocation.mode === 'manual' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-xl' : 'text-slate-400'}`}
                            >
                                手动指派
                            </button>
                        </div>
                        {localPrefs.weatherLocation.mode === 'manual' ? (
                            <div className="space-y-6 animate-in slide-in-from-bottom-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">选择省份/直辖市</label>
                                        <select
                                            className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-900 dark:text-white font-black text-sm outline-none focus:border-primary-500 shadow-sm"
                                            value={selectedProvince}
                                            onChange={e => setSelectedProvince(e.target.value)}
                                        >
                                            <option value="">-- 请选取 --</option>
                                            {Object.keys(CHINA_CITIES_DATA).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">选择地级市</label>
                                        <select
                                            className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-900 dark:text-white font-black text-sm outline-none focus:border-primary-500 shadow-sm disabled:opacity-30 transition-opacity"
                                            disabled={!selectedProvince}
                                            value={localPrefs.weatherLocation.city || ''}
                                            onChange={e => {
                                                const city = CHINA_CITIES_DATA[selectedProvince].find(c => c.name === e.target.value);
                                                if (city) handleCitySelect(city.name, city.lat, city.lon);
                                            }}
                                        >
                                            <option value="">-- 请选取 --</option>
                                            {selectedProvince && CHINA_CITIES_DATA[selectedProvince].map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center shadow-inner group">
                                    {localPrefs.weatherLocation.city ? (
                                        <div className="animate-in fade-in duration-500">
                                            <MapPin className="w-12 h-12 text-primary-500 mb-3 group-hover:scale-110 transition-transform" />
                                            <p className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">定位已锁定: {localPrefs.weatherLocation.city}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic opacity-50 px-10 leading-relaxed">请从上方列表指定您的常驻办公城市。</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-50 dark:bg-slate-900/30 p-12 rounded-[3rem] border-2 border-slate-100 dark:border-slate-700 flex flex-col items-center gap-6 shadow-inner text-center animate-in zoom-in-95">
                                <Globe className="w-16 h-16 text-primary-500 relative z-10 animate-spin-slow" />
                                <h4 className="font-black text-slate-800 dark:text-white text-lg uppercase tracking-tight">Geo-IP 智能定位模式</h4>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-5 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={handleCancel} className="px-8 py-3 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] hover:text-slate-600 dark:hover:text-slate-300 transition-colors">取消</button>
          <button onClick={handleSave} className="px-10 py-4 bg-primary-600 text-white rounded-[1.5rem] hover:bg-primary-700 shadow-xl shadow-primary-500/25 font-black transition-all active:scale-95 flex items-center gap-3 uppercase tracking-widest text-xs border border-white/10 group">
            <Save className="w-5 h-5 group-hover:rotate-12 transition-transform" /> 同步个人配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserPreferencesModal;

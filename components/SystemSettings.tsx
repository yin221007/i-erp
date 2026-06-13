
import React, { useEffect, useState, useRef } from 'react';
import { AppSettings } from '../types';
import { X, Save, Image as ImageIcon, Sparkles, Database, ShieldCheck, Link as LinkIcon, KeyRound, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { API_URL, apiFetch, apiJson } from '../lib/api';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

type AiSettingsStatus = {
  configured: boolean;
  maskedKey: string;
  source: 'database' | 'environment' | 'none';
};

const SystemSettings: React.FC<SystemSettingsProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isUploading, setIsUploading] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'visual' | 'data' | 'ai'>('visual');
  const [aiStatus, setAiStatus] = useState<AiSettingsStatus>({
    configured: false,
    maskedKey: '',
    source: 'none'
  });
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLocalSettings(settings);
    setDeepSeekApiKey('');
    setAiFeedback('');
    setAiStatus({
      configured: false,
      maskedKey: '',
      source: 'none'
    });
    setIsLoadingAi(true);
    apiJson<AiSettingsStatus>(`${API_URL}/ai/settings`)
      .then(status => {
        if (active) setAiStatus(status);
      })
      .catch(() => {
        if (active) setAiFeedback('无法读取 DeepSeek 配置，请检查服务器连接。');
      })
      .finally(() => {
        if (active) setIsLoadingAi(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();
        setLocalSettings(prev => ({ ...prev, logoUrl: fileData.url }));
      } catch (error) {
        alert("图片上传失败");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSaveSettings = () => {
    onSave(localSettings);
    onClose();
  };

  const handleSaveAiKey = async () => {
    const apiKey = deepSeekApiKey.trim();
    if (!apiKey) return;
    setIsSavingAi(true);
    setAiFeedback('');
    try {
      const status = await apiJson<AiSettingsStatus>(
        `${API_URL}/ai/settings`,
        {
          method: 'PUT',
          json: { apiKey }
        }
      );
      setAiStatus(status);
      setDeepSeekApiKey('');
      setAiFeedback('DeepSeek API 密钥已加密保存并立即生效。');
    } catch {
      setAiFeedback('保存失败，请确认密钥格式和服务器状态。');
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleClearAiKey = async () => {
    if (!window.confirm('确定清除服务器中保存的 DeepSeek API 密钥吗？')) {
      return;
    }
    setIsSavingAi(true);
    setAiFeedback('');
    try {
      const response = await apiFetch(`${API_URL}/ai/settings`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Delete failed');
      const status = await apiJson<AiSettingsStatus>(
        `${API_URL}/ai/settings`
      );
      setAiStatus(status);
      setDeepSeekApiKey('');
      setAiFeedback(
        status.source === 'environment'
          ? '数据库密钥已清除，当前继续使用服务器环境变量中的密钥。'
          : 'DeepSeek API 密钥已清除。'
      );
    } catch {
      setAiFeedback('清除失败，请检查服务器连接。');
    } finally {
      setIsSavingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh] overflow-hidden transition-all">
        <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-700 pb-5 shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl"><Sparkles className="w-6 h-6 text-primary-600" /></div>
             <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">ERP 全局控制中心</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        <div className="flex gap-2 mb-6 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-2xl shrink-0 overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveSettingsTab('visual')} className={`flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSettingsTab === 'visual' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-sm' : 'text-slate-400'}`}>品牌视觉与域名</button>
            <button onClick={() => setActiveSettingsTab('data')} className={`flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSettingsTab === 'data' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-sm' : 'text-slate-400'}`}>数据维护</button>
            <button onClick={() => setActiveSettingsTab('ai')} className={`flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSettingsTab === 'ai' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-sm' : 'text-slate-400'}`}>AI 配置</button>
        </div>

        <div className="overflow-y-auto flex-1 pr-2 space-y-10 custom-scrollbar min-h-0">
          {activeSettingsTab === 'visual' && (
            <section className="animate-in fade-in slide-in-from-left-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest pl-1">系统主标题</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-2xl px-5 py-3 outline-none focus:border-primary-500 transition-all font-black shadow-inner" value={localSettings.appName} onChange={(e) => setLocalSettings(prev => ({ ...prev, appName: e.target.value }))} /></div>
                    <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest pl-1">版权声明文字</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-2xl px-5 py-3 outline-none focus:border-primary-500 transition-all font-black shadow-inner" value={localSettings.poweredByText || ''} onChange={(e) => setLocalSettings(prev => ({ ...prev, poweredByText: e.target.value }))} /></div>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest pl-1">ERP 部署域名 (用于消息外链)</label>
                    <div className="relative">
                        <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-2xl pl-12 pr-5 py-3 outline-none focus:border-primary-500 font-bold shadow-inner" placeholder="https://erp.yourcompany.com" value={localSettings.erpBaseUrl || ''} onChange={(e) => setLocalSettings(prev => ({ ...prev, erpBaseUrl: e.target.value }))} />
                    </div>
                </div>

                <div className="pt-4">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest pl-1">企业品牌标识 (Logo)</label>
                    <div className="flex flex-col md:flex-row items-center gap-10 bg-slate-50 dark:bg-slate-900/30 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-inner">
                    <div onClick={() => !isUploading && fileInputRef.current?.click()} className="w-32 h-32 bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-[2.5rem] flex items-center justify-center cursor-pointer hover:border-primary-50 group overflow-hidden shadow-md">
                        {isUploading ? (<div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>) : localSettings.logoUrl ? (<img src={localSettings.logoUrl} className="w-full h-full object-contain p-4 transition-transform group-hover:scale-110" />) : (<div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-primary-500"><ImageIcon className="w-10 h-10" /><span className="text-[10px] font-black uppercase">上传图标</span></div>)}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">图标呈现宽度</label>
                        <div className="flex items-center gap-6"><input type="range" min="20" max="120" value={localSettings.logoWidth} onChange={(e) => setLocalSettings(prev => ({ ...prev, logoWidth: Number(e.target.value) }))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600" /><span className="text-sm font-mono font-black text-primary-600 w-16 text-right px-3 py-1 bg-primary-50 rounded-lg">{localSettings.logoWidth}px</span></div>
                    </div>
                    </div>
                </div>
            </section>
          )}

          {activeSettingsTab === 'data' && (
            <section className="animate-in fade-in slide-in-from-bottom-2 pb-6 space-y-8">
                <div className="bg-orange-50 dark:bg-orange-950/20 p-8 rounded-[2rem] border-2 border-orange-100 dark:border-orange-900/50">
                    <div className="flex items-start gap-5 mb-8">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-orange-200"><Database className="w-6 h-6 text-orange-600" /></div>
                        <div><h5 className="font-black text-slate-800 dark:text-white uppercase tracking-widest">系统容灾中心</h5><p className="text-xs text-orange-600 mt-1 font-medium leading-relaxed">服务器执行自动备份、校验与隔离恢复演练，浏览器覆盖恢复已停用。</p></div>
                    </div>
                    <div className="rounded-3xl border-2 border-emerald-100 bg-white p-6 dark:border-emerald-900/50 dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <ShieldCheck className="h-9 w-9 text-emerald-500" />
                            <div>
                                <p className="text-sm font-black text-slate-700 dark:text-slate-100">自动备份策略已由服务器管理</p>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">每日备份保留 7 份，升级快照保留 3 份，总空间上限 500 GB。恢复仅在维护窗口按校验流程执行。</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
          )}

          {activeSettingsTab === 'ai' && (
            <section className="animate-in fade-in slide-in-from-bottom-2 pb-6 space-y-6">
              <div className="rounded-[2rem] border-2 border-primary-100 bg-primary-50/70 p-6 dark:border-primary-900/60 dark:bg-primary-950/20">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-primary-100 bg-white p-3 shadow-sm dark:border-primary-800 dark:bg-slate-900">
                    <KeyRound className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5 className="font-black tracking-widest text-slate-800 dark:text-white">DeepSeek 官方 API</h5>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                      全系统统一使用此密钥。密钥仅由管理员设置，在服务器加密保存，页面不会再次显示完整内容。
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border-2 border-slate-100 bg-white p-6 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">当前状态</p>
                    <div className="mt-2 flex items-center gap-2">
                      {isLoadingAi ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                      ) : aiStatus.configured ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <KeyRound className="h-5 w-5 text-orange-500" />
                      )}
                      <span className={`text-sm font-black ${aiStatus.configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {isLoadingAi
                          ? '正在读取'
                          : aiStatus.configured
                            ? aiStatus.source === 'environment'
                              ? '已由环境变量配置'
                              : '已配置'
                            : '未配置'}
                      </span>
                    </div>
                  </div>
                  {aiStatus.maskedKey && (
                    <div className="rounded-xl bg-slate-100 px-4 py-2 font-mono text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {aiStatus.maskedKey}
                    </div>
                  )}
                </div>

                <label className="mb-2 block pl-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {aiStatus.configured ? '输入新密钥以替换' : 'DeepSeek API 密钥'}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={deepSeekApiKey}
                  onChange={event => setDeepSeekApiKey(event.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-2xl border-2 border-slate-100 bg-white px-5 py-3 font-mono font-bold text-slate-900 outline-none shadow-inner transition-all focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  输入框留空不会覆盖现有密钥，保存后立即用于新的 AI 请求。
                </p>

                {aiFeedback && (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {aiFeedback}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {aiStatus.source === 'database' && (
                    <button
                      type="button"
                      onClick={handleClearAiKey}
                      disabled={isSavingAi}
                      className="flex items-center justify-center gap-2 rounded-2xl border-2 border-red-100 px-5 py-3 text-xs font-black text-red-600 transition-all hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                      清除服务器密钥
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAiKey}
                    disabled={isSavingAi || !deepSeekApiKey.trim()}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-7 py-3 text-xs font-black text-white shadow-xl shadow-primary-500/20 transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    保存并立即生效
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="px-8 py-3 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-colors">{activeSettingsTab === 'ai' ? '关闭' : '取消'}</button>
          {activeSettingsTab !== 'ai' && (
            <button onClick={handleSaveSettings} className="px-12 py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-2xl text-xs font-black shadow-2xl shadow-primary-500/30 flex items-center gap-3 transition-all active:scale-95 uppercase tracking-widest"><Save className="w-5 h-5" /> 应用全局修改</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;


import React, { useState, useRef } from 'react';
import { AppSettings } from '../types';
import { X, Save, Image as ImageIcon, Sparkles, Database, ShieldCheck, Link as LinkIcon } from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const SystemSettings: React.FC<SystemSettingsProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isUploading, setIsUploading] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'visual' | 'data'>('visual');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="px-8 py-3 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-colors">取消</button>
          <button onClick={handleSaveSettings} className="px-12 py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-2xl text-xs font-black shadow-2xl shadow-primary-500/30 flex items-center gap-3 transition-all active:scale-95 uppercase tracking-widest"><Save className="w-5 h-5" /> 应用全局修改</button>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;

import React, { useState, useEffect, useRef } from 'react';
import { ProjectProduction, ProductionUnit, ProductionStatus, User, Project } from '../types';
import { Search, ArrowLeft, Plus, Edit2, X, Save, Trash2, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { getBeijingDateString } from '../constants';

interface ProductionProgressProps {
  projects: Project[];
  productionData: ProjectProduction[];
  onUpdateProject: (project: ProjectProduction) => void;
  onDeleteProjectProduction?: (projectId: string) => void; 
  currentUser: User;
}

const ProductionProgress: React.FC<ProductionProgressProps> = ({ projects, productionData, onUpdateProject, onDeleteProjectProduction, currentUser }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductionUnit | null>(null);
  const [formData, setFormData] = useState({ name: '', model: '', quantity: '', notes: '', batchDate: getBeijingDateString(), status: 'Waiting' as ProductionStatus });

  const activeProject = projects.find(p => p.id === selectedProjectId);
  const activeProductionData = productionData.find(p => p.projectId === selectedProjectId) || { id: activeProject?.id || '', projectId: activeProject?.id || '', projectName: activeProject?.name || '', projectCode: activeProject?.code || '', items: [] };

  const handleColumnExport = (status: ProductionStatus) => {
      const items = activeProductionData.items.filter(i => i.status === status);
      if (items.length === 0) return alert("该栏目暂无数据");
      const headers = ['设备名称', '型号', '数量', '状态', '备注', '日期'];
      const rows = items.map(item => [`"${item.name}"`, `"${item.model}"`, item.quantity, status, `"${item.notes || ''}"`, item.batchDate || ''].join(','));
      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n'); 
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${activeProject?.name || '生产清单'}_${status}.csv`;
      link.click();
  };

  const handleColumnImport = (e: React.ChangeEvent<HTMLInputElement>, status: ProductionStatus) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          try {
              const lines = text.split(/\r\n|\n/);
              const newItems: ProductionUnit[] = [];
              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                  if (parts.length >= 3) {
                      const name = parts[0].replace(/^"|"$/g, '').trim();
                      const qty = parseFloat(parts[2].replace(/,/g, ''));
                      if (name && !isNaN(qty)) {
                          newItems.push({ id: Math.random().toString(36).substr(2, 9), name, model: parts[1]?.replace(/^"|"$/g, '').trim() || '', quantity: qty, status: status, notes: parts[4]?.replace(/^"|"$/g, '') || '', batchDate: parts[5]?.trim() || getBeijingDateString() });
                      }
                  }
              }
              if (newItems.length > 0) {
                  onUpdateProject({ ...activeProductionData, items: [...activeProductionData.items, ...newItems] });
                  alert(`导入完成：${newItems.length} 条记录`);
              }
          } catch (err) { alert("导入解析失败"); }
          e.target.value = '';
      };
      reader.readAsText(file);
  };

  const openAddModal = (status: ProductionStatus) => { setEditingItem(null); setFormData({ name: '', model: '', quantity: '', notes: '', batchDate: getBeijingDateString(), status }); setIsModalOpen(true); };
  const handleSave = () => { if (!selectedProjectId || !formData.name) return; const qty = parseFloat(formData.quantity); if (isNaN(qty)) return; const newItems = editingItem ? activeProductionData.items.map(i => i.id === editingItem.id ? { ...i, ...formData, quantity: qty } : i) : [...activeProductionData.items, { id: Math.random().toString(36).substr(2, 9), ...formData, quantity: qty }]; onUpdateProject({ ...activeProductionData, items: newItems }); setIsModalOpen(false); };

  if (!selectedProjectId) {
      return (
          <div className="max-w-7xl mx-auto transition-all">
              <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                  <h2 className="text-3xl font-black text-slate-800 dark:text-white transition-colors">生产进度管理</h2>
                  <div className="relative w-full md:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                      <input className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold" placeholder="搜索项目名称..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all">{projects.filter(p => p.name.includes(searchTerm)).map(p => (<div key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:translate-y-[-4px] hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 cursor-pointer transition-all group active:scale-[0.98]"><h3 className="font-black text-slate-800 dark:text-white mb-2 text-lg group-hover:text-primary-600 transition-colors truncate">{p.name}</h3><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{p.clientName}</p></div>))}</div>
          </div>
      );
  }

  return (
      <div className="max-w-7xl mx-auto h-full flex flex-col transition-all">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 transition-all">
              <button onClick={() => setSelectedProjectId(null)} className="flex items-center gap-1.5 text-slate-600 hover:text-primary-600 transition-all font-black uppercase text-xs tracking-widest"><ArrowLeft className="w-4 h-4"/> 返回工程列表</button>
              <h2 className="font-black text-2xl text-slate-800 dark:text-white truncate max-w-xl transition-colors">{activeProject?.name}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-0 transition-all">
              {['Waiting', 'InStock', 'Shipped'].map(status => (
                  <div key={status} className="bg-slate-300/50 dark:bg-slate-900/50 rounded-xl border border-slate-300 dark:border-slate-700 flex flex-col h-full overflow-hidden transition-all shadow-inner">
                      <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 transition-colors">
                          <span className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 transition-colors">{status === 'Waiting' ? '🛒 待下生产单' : status === 'InStock' ? '📦 已批量入库' : '🚚 已发往工地'}</span>
                          <div className="flex gap-1.5">
                              <button onClick={() => openAddModal(status as ProductionStatus)} className="p-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/40 rounded-lg text-primary-600 dark:text-primary-400 transition-all" title="新增"><Plus className="w-4 h-4 font-bold"/></button>
                              <label className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 cursor-pointer transition-all" title="从 CSV 导入"><Upload className="w-4 h-4"/><input type="file" className="hidden" accept=".csv" onChange={(e) => handleColumnImport(e, status as ProductionStatus)} /></label>
                              <button onClick={() => handleColumnExport(status as ProductionStatus)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-all" title="导出 CSV"><Download className="w-4 h-4"/></button>
                          </div>
                      </div>
                      <div className="p-4 space-y-4 overflow-y-auto flex-1 transition-all custom-scrollbar">
                          {activeProductionData.items.filter(i => i.status === status).length === 0 ? (
                              <div className="py-20 text-center opacity-20 flex flex-col items-center">
                                  <FileSpreadsheet className="w-12 h-12 mb-2" />
                                  <p className="text-[10px] font-black uppercase tracking-widest">栏目为空</p>
                              </div>
                          ) : (
                              activeProductionData.items.filter(i => i.status === status).map(item => (
                                <div key={item.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 transition-all hover:shadow-xl hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 group">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-black text-slate-800 dark:text-white text-sm transition-colors">{item.name}</span>
                                        <span className="text-primary-600 dark:text-primary-400 font-black text-xs transition-colors">x {item.quantity}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase font-mono transition-colors">{item.model || 'N/A'}</p>
                                    {item.notes && <p className="mt-3 text-[10px] font-medium text-slate-500 dark:text-slate-400 italic bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-800">{item.notes}</p>}
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.batchDate}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEditingItem(item); setFormData({ name: item.name, model: item.model, quantity: item.quantity.toString(), notes: item.notes || '', batchDate: item.batchDate || getBeijingDateString(), status: item.status }); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-primary-600 transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
                                            <button onClick={(e) => { e.stopPropagation(); if(window.confirm('确定移除此项吗？')) onUpdateProject({...activeProductionData, items: activeProductionData.items.filter(i => i.id !== item.id)}); }} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                                        </div>
                                    </div>
                                </div>
                              ))
                          )}
                      </div>
                  </div>
              ))}
          </div>
          {isModalOpen && (
              <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 transition-all">
                      <div className="flex justify-between items-center mb-8 border-b dark:border-slate-700 pb-4 transition-all">
                          <h3 className="text-xl font-black text-slate-800 dark:text-white transition-colors">{editingItem ? '修改设备详情' : '新增生产任务'}</h3>
                          <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                      </div>
                      <div className="space-y-5 transition-all">
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">设备名称 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" placeholder="输入名称" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} /></div>
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">型号参数</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" placeholder="输入型号" value={formData.model} onChange={e=>setFormData({...formData, model: e.target.value})} /></div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">需求数量 *</label><input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} /></div>
                              <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">当前状态</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value as any})}><option value="Waiting">待生产</option><option value="InStock">已入库</option><option value="Shipped">已发货</option></select></div>
                          </div>
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">生产日期 / 批次</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.batchDate} onChange={e=>setFormData({...formData, batchDate: e.target.value})} /></div>
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">备注说明</label><textarea className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 h-24 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner resize-none" placeholder="特殊要求或生产进度简注..." value={formData.notes} onChange={e=>setFormData({...formData, notes: e.target.value})} /></div>
                      </div>
                      <div className="flex justify-end gap-3 mt-10 pt-6 border-t dark:border-slate-700 transition-all">
                          <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-500 font-black uppercase tracking-widest transition-colors">取消</button>
                          <button onClick={handleSave} className="px-10 py-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 font-black active:scale-95 uppercase tracking-widest">保存记录</button>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );
};

export default ProductionProgress;

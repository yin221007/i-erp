import React, { useState, useMemo, useRef } from 'react';
import { Equipment, User } from '../types';
import { Plus, Search, Zap, Ruler, Settings, Tag, Trash2, Image as ImageIcon, Upload, X, Edit2, Eye, Download, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';
import { fetchAiModels, streamAiChat } from '../lib/ai-client';

interface EquipmentLibraryProps {
  equipmentList: Equipment[];
  onAddEquipment: (eq: Equipment) => void;
  onUpdateEquipment: (eq: Equipment) => void;
  onDeleteEquipment: (id: string) => void;
  currentUser: User;
}


type EquipmentDraft = Omit<Equipment, 'id'>;

const cleanCell = (value?: string) => String(value || '').replace(/^"|"$/g, '').trim();
const splitSmartLine = (line: string) => line.includes(',')
  ? line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cleanCell)
  : line.split(/\t|\s{2,}|[，；;]/).map(cleanCell).filter(Boolean);

const inferCategory = (text: string) => {
  if (/灶|炉|蒸|煮|汤|炒|烤|热/i.test(text)) return '热厨设备';
  if (/冷|冰|冻|保鲜|雪柜/i.test(text)) return '制冷设备';
  if (/洗|消毒|洁碟|洗碗/i.test(text)) return '洗涤消毒';
  if (/烟|排风|风机|净化/i.test(text)) return '排烟系统';
  if (/台|架|柜|星盆|水池|不锈钢/i.test(text)) return '不锈钢制品';
  if (/机|切|搅|绞|压面|和面/i.test(text)) return '食品机械';
  return '其他';
};

const parseEquipmentText = (text: string): EquipmentDraft[] => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstCells = splitSmartLine(lines[0]).map(cell => cell.toLowerCase());
  const hasHeader = firstCells.some(cell => /设备|名称|型号|品牌|分类|尺寸|功率|电压|燃气|备注|name|model/.test(cell));
  const header = hasHeader ? firstCells : [];
  const rows = hasHeader ? lines.slice(1) : lines;
  const indexOf = (patterns: RegExp[]) => header.findIndex(cell => patterns.some(pattern => pattern.test(cell)));
  const indexes = {
    name: indexOf([/设备/, /名称/, /name/]),
    model: indexOf([/型号/, /规格/, /model/]),
    brand: indexOf([/品牌/, /brand/]),
    category: indexOf([/分类/, /类别/, /category/]),
    dimensions: indexOf([/尺寸/, /规格尺寸/, /dimension/]),
    power: indexOf([/功率/, /电压/, /power/]),
    waterGas: indexOf([/给排水/, /燃气/, /接驳/, /water/, /gas/]),
    description: indexOf([/备注/, /说明/, /描述/, /note/, /description/])
  };
  const pick = (cells: string[], key: keyof typeof indexes, fallbackIndex: number) => cleanCell(cells[indexes[key] >= 0 ? indexes[key] : fallbackIndex]);

  return rows.map(line => {
    const cells = splitSmartLine(line);
    const raw = cells.join(' ');
    const dimensions = pick(cells, 'dimensions', 4) || (raw.match(/\d{3,5}\s*[xX*×]\s*\d{2,5}(?:\s*[xX*×]\s*\d{2,5})?/)?.[0] || '');
    const powerSpecs = pick(cells, 'power', 5) || (raw.match(/(?:220|380)\s*V[^，,;；\s]*|\d+(?:\.\d+)?\s*(?:kw|kW|KW)/)?.[0] || '');
    const waterGasSpecs = pick(cells, 'waterGas', 6) || (raw.match(/(?:DN\s*\d+|给水[^，,;；]*|排水[^，,;；]*|燃气[^，,;；]*)/i)?.[0] || '');
    const name = pick(cells, 'name', 0);
    const model = pick(cells, 'model', 1) || dimensions || '待补型号';
    if (!name || name.length < 2) return null;
    return {
      name,
      model,
      brand: pick(cells, 'brand', 2) || '待补品牌',
      category: pick(cells, 'category', 3) || inferCategory(raw),
      dimensions,
      powerSpecs,
      waterGasSpecs,
      description: pick(cells, 'description', 7) || raw
    };
  }).filter(Boolean) as EquipmentDraft[];
};

const EquipmentLibrary: React.FC<EquipmentLibraryProps> = ({ equipmentList, onAddEquipment, onUpdateEquipment, onDeleteEquipment, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<Equipment | null>(null);
  const [showAiImportModal, setShowAiImportModal] = useState(false);
  const [aiImportText, setAiImportText] = useState('');
  const [aiImportPreview, setAiImportPreview] = useState<EquipmentDraft[]>([]);
  const [isAiOrganizing, setIsAiOrganizing] = useState(false);
  const [aiImportFeedback, setAiImportFeedback] = useState('');
  
  // FIX: Counter for uploads
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;

  // New Equipment Form State
  const [newEq, setNewEq] = useState<Partial<Equipment>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const aiImportInputRef = useRef<HTMLInputElement>(null);

  const filteredEquipment = equipmentList.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by Category
  const groupedEquipment = useMemo(() => {
    const groups: Record<string, Equipment[]> = {};
    filteredEquipment.forEach(item => {
      const cat = item.category || '未分类';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredEquipment]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingCount(prev => prev + 1);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await apiFetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();
        
        setNewEq(prev => ({ ...prev, imageUrl: fileData.url }));
      } catch (error) {
        console.error("Upload error", error);
        alert("图片上传失败，请重试");
      } finally {
        setUploadingCount(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleOpenAdd = () => {
      setEditingId(null);
      setNewEq({});
      setShowAddModal(true);
  };

  const handleEdit = (e: React.MouseEvent, item: Equipment) => {
      e.preventDefault();
      e.stopPropagation();
      setEditingId(item.id);
      setNewEq({...item});
      setShowAddModal(true);
  };

  const handleSave = () => {
     if (!newEq.name || !newEq.model) {
         alert("请填写名称和型号");
         return;
     }
     
     const equipment: Equipment = {
         id: editingId || Math.random().toString(36).substr(2, 9),
         name: newEq.name!,
         model: newEq.model!,
         brand: newEq.brand || 'Unknown',
         category: newEq.category || 'Other',
         dimensions: newEq.dimensions || '',
         powerSpecs: newEq.powerSpecs || '',
         waterGasSpecs: newEq.waterGasSpecs || '',
         description: newEq.description || '',
         imageUrl: newEq.imageUrl
     };

     if (editingId) {
         onUpdateEquipment(equipment);
     } else {
         onAddEquipment(equipment);
     }
     setShowAddModal(false);
     setNewEq({});
     setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentUser.role !== 'Admin') return;

      if (window.confirm(`确定要删除设备 "${name}" 吗？`)) {
          onDeleteEquipment(id);
      }
  };

  // --- IMPORT/EXPORT LOGIC ---
  const handleExportCSV = () => {
      if (equipmentList.length === 0) return alert("无可导出的设备数据");
      const headers = ['设备名称', '型号', '品牌', '分类', '外形尺寸', '电功率/电压', '给排水/燃气', '备注描述'];
      const rows = equipmentList.map(e => [
          `"${e.name.replace(/"/g, '""')}"`,
          `"${e.model.replace(/"/g, '""')}"`,
          `"${e.brand || ''}"`,
          `"${e.category || ''}"`,
          `"${e.dimensions || ''}"`,
          `"${e.powerSpecs || ''}"`,
          `"${e.waterGasSpecs || ''}"`,
          `"${(e.description || '').replace(/"/g, '""')}"`
      ].join(','));

      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `设备参数库_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  const updateAiImportText = (text: string) => {
      setAiImportText(text);
      setAiImportPreview(parseEquipmentText(text));
      setAiImportFeedback('已用本地规则生成预览，可点击 AI 重新整理提高准确度。');
  };

  const handleAiImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => updateAiImportText(String(evt.target?.result || ''));
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleConfirmAiImport = () => {
      if (aiImportPreview.length === 0) return alert('没有识别到可导入的设备，请粘贴清单或上传文本/CSV。');
      aiImportPreview.forEach(item => onAddEquipment({ ...item, id: Math.random().toString(36).slice(2, 11) }));
      alert(`已整理并导入 ${aiImportPreview.length} 条设备参数。`);
      setShowAiImportModal(false);
      setAiImportText('');
      setAiImportPreview([]);
      setAiImportFeedback('');
  };

  const handleAiOrganize = async () => {
      const text = aiImportText.trim();
      if (!text) return alert('请先粘贴清单或上传文件。');
      setIsAiOrganizing(true);
      setAiImportFeedback('正在调用系统 AI 模型整理设备参数...');
      try {
          const models = await fetchAiModels(API_URL);
          const model = models[0];
          if (!model) throw new Error('未启用 AI 模型');
          let output = '';
          await streamAiChat(
            API_URL,
            {
              modelId: model.id,
              reasoning: false,
              messages: [{
                role: 'user',
                content: `你是厨房工程设备参数录入助手。请把下面的设备清单或笔记整理成严格 JSON 数组，不要输出解释。数组每项字段固定为 name, model, brand, category, dimensions, powerSpecs, waterGasSpecs, description。缺失字段用空字符串；category 从 热厨设备、制冷设备、洗涤消毒、排烟系统、不锈钢制品、食品机械、其他 中选择。\n\n原始内容：\n${text}`
              }]
            },
            token => { output += token; }
          );
          const jsonText = output.match(/\[[\s\S]*\]/)?.[0] || '';
          const parsed = JSON.parse(jsonText);
          if (!Array.isArray(parsed)) throw new Error('AI 返回格式不是数组');
          const normalized = parsed.map(item => ({
            name: cleanCell(item.name),
            model: cleanCell(item.model) || '待补型号',
            brand: cleanCell(item.brand) || '待补品牌',
            category: cleanCell(item.category) || inferCategory(JSON.stringify(item)),
            dimensions: cleanCell(item.dimensions),
            powerSpecs: cleanCell(item.powerSpecs),
            waterGasSpecs: cleanCell(item.waterGasSpecs),
            description: cleanCell(item.description)
          })).filter(item => item.name) as EquipmentDraft[];
          if (normalized.length === 0) throw new Error('AI 未识别到有效设备');
          setAiImportPreview(normalized);
          setAiImportFeedback(`AI 已整理 ${normalized.length} 条设备，请核对后导入。`);
      } catch (error) {
          console.warn('AI equipment organize fallback', error);
          const fallback = parseEquipmentText(text);
          setAiImportPreview(fallback);
          setAiImportFeedback(`AI 整理暂不可用，已使用本地规则识别 ${fallback.length} 条。`);
      } finally {
          setIsAiOrganizing(false);
      }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          try {
              const lines = text.split(/\r\n|\n/);
              let importedCount = 0;
              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                  if (parts.length >= 2) {
                      const name = parts[0].replace(/^"|"$/g, '').trim();
                      const model = parts[1]?.replace(/^"|"$/g, '').trim();
                      if (name && model) {
                          onAddEquipment({
                              id: Math.random().toString(36).substr(2, 9),
                              name, model,
                              brand: parts[2]?.replace(/^"|"$/g, '').trim() || '',
                              category: parts[3]?.replace(/^"|"$/g, '').trim() || '其他',
                              dimensions: parts[4]?.replace(/^"|"$/g, '').trim() || '',
                              powerSpecs: parts[5]?.replace(/^"|"$/g, '').trim() || '',
                              waterGasSpecs: parts[6]?.replace(/^"|"$/g, '').trim() || '',
                              description: parts[7]?.replace(/^"|"$/g, '').trim() || ''
                          });
                          importedCount++;
                      }
                  }
              }
              alert(`成功导入 ${importedCount} 条设备参数记录。`);
          } catch (err) { alert("导入失败，请检查 CSV 格式。"); }
          if (e.target) e.target.value = '';
      };
      reader.readAsText(file);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
           <h2 className="text-3xl font-bold text-slate-900 dark:text-white">设备参数</h2>
           <p className="text-slate-500 dark:text-slate-400 mt-1">存档标准设备参数、尺寸及接驳要求</p>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="搜索设备型号、名称..." 
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={handleExportCSV} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="导出设备清单">
              <Download className="w-4 h-4" />
          </button>
          {(currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite') && (
              <>
                <button onClick={() => setShowAiImportModal(true)} className="px-3 py-2.5 bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-300 flex items-center gap-2 text-xs font-black" title="上传清单或笔记，自动整理设备参数">
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden lg:inline">AI整理</span>
                </button>
                <button onClick={() => importInputRef.current?.click()} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400" title="批量导入设备">
                    <Upload className="w-4 h-4" />
                </button>
                <input type="file" ref={importInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
              </>
          )}
          <button 
            onClick={handleOpenAdd}
            className="bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>录入设备</span>
          </button>
        </div>
      </div>

      <div className="space-y-10">
          {Object.entries(groupedEquipment).map(([category, items]: [string, Equipment[]]) => (
            <div key={category}>
                <div className="flex items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-l-4 border-primary-600 pl-3">
                        {category}
                    </h3>
                    <span className="ml-3 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                        {items.length}
                    </span>
                    <div className="h-px bg-slate-100 dark:bg-slate-800 flex-1 ml-4"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                    {items.map(item => (
                        <div 
                            key={item.id} 
                            onClick={() => setPreviewItem(item)}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-2xl hover:scale-[1.02] hover:border-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-all duration-300 overflow-hidden flex flex-col h-full group relative cursor-pointer active:scale-[0.98]"
                        >
                            <div className="h-48 bg-slate-100 dark:bg-slate-900 flex items-center justify-center relative overflow-hidden border-b border-slate-100 dark:border-slate-700 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-2" />
                                ) : (
                                    <Settings className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                                )}
                                
                                <div className="absolute top-3 right-3 flex gap-2">
                                    <span className="px-2 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur text-xs font-bold text-slate-700 dark:text-slate-300 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                                        {item.brand}
                                    </span>
                                </div>

                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 pointer-events-none">
                                    <div className="px-4 py-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full shadow-sm text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                        <Eye className="w-4 h-4" /> 点击查看详情
                                    </div>
                                </div>

                                {(currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite') && (
                                    <div className="absolute top-3 left-3 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            type="button"
                                            onClick={(e) => handleEdit(e, item)}
                                            className="p-2 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-full shadow-sm border border-slate-100 dark:border-slate-600 transition-all"
                                            title="编辑参数"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        {currentUser.role === 'Admin' && (
                                            <button 
                                                type="button"
                                                onClick={(e) => handleDelete(e, item.id, item.name)}
                                                className="p-2 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full shadow-sm border border-slate-100 dark:border-slate-600 transition-all"
                                                title="删除设备"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="p-5 flex-1 flex flex-col">
                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{item.name}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{item.model}</p>
                                </div>
                                
                                <div className="space-y-2 mb-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg text-sm border border-slate-100 dark:border-slate-700 shadow-inner">
                                    <div className="flex items-center text-slate-600 dark:text-slate-400">
                                        <Ruler className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                        <span className="truncate" title={item.dimensions}>{item.dimensions || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center text-slate-600 dark:text-slate-400">
                                        <Zap className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                        <span className="truncate" title={item.powerSpecs}>{item.powerSpecs || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-700">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.description}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          ))}
          
          {Object.keys(groupedEquipment).length === 0 && (
               <div className="text-center py-12 text-slate-400 dark:text-slate-600">
                   <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
                   <p>未找到相关设备</p>
               </div>
          )}
      </div>


      {showAiImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-5xl rounded-[2rem] shadow-2xl max-h-[92vh] overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-500/20"><Sparkles className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">AI 整理设备参数</h3>
                  <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">粘贴清单、报价备注或上传 CSV/TXT，可调用系统 AI 模型整理字段；模型不可用时自动使用本地规则兜底。</p>
                </div>
              </div>
              <button onClick={() => setShowAiImportModal(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-y-auto">
              <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">原始清单 / 笔记</label>
                  <div className="flex items-center gap-2">
                    <button onClick={handleAiOrganize} disabled={isAiOrganizing || !aiImportText.trim()} className="px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-black hover:bg-primary-700 disabled:opacity-40 flex items-center gap-2"><Sparkles className="w-4 h-4" />{isAiOrganizing ? '整理中' : 'AI整理'}</button>
                    <input ref={aiImportInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleAiImportFile} />
                    <button onClick={() => aiImportInputRef.current?.click()} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 hover:border-primary-500 flex items-center gap-2"><FileText className="w-4 h-4" />上传文件</button>
                  </div>
                </div>
                <textarea
                  value={aiImportText}
                  onChange={event => updateAiImportText(event.target.value)}
                  className="w-full h-[28rem] rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm font-medium leading-6 text-slate-800 dark:text-slate-100 outline-none focus:border-primary-500"
                  placeholder={'示例：\n双头大锅灶, SDGT-1200, 海牛, 热厨设备, 1200x800x800, 380V/24kW, DN25给水/DN40排水, 食堂热厨区\n四门高身雪柜 1220x760x1950 220V/0.6kW 制冷设备'}
                />
              </div>
              <div className="p-6 bg-slate-50/70 dark:bg-slate-900/30">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">整理预览</p>
                  <span className="rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-black text-primary-600 border border-slate-100 dark:border-slate-700">{aiImportPreview.length} 条</span>
                </div>
                {aiImportFeedback && <p className="mb-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-300">{aiImportFeedback}</p>}
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar">
                  {aiImportPreview.length === 0 ? (
                    <div className="h-80 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-300">
                      <Sparkles className="w-12 h-12 mb-3 opacity-40" />
                      <p className="text-sm font-black">等待清单内容</p>
                      <p className="mt-1 text-xs font-bold">支持 CSV、制表符、普通文字笔记</p>
                    </div>
                  ) : aiImportPreview.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="font-black text-slate-900 dark:text-white truncate">{item.name}</p><p className="mt-1 text-xs font-mono text-slate-400 truncate">{item.model}</p></div>
                        <span className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-[10px] font-black text-primary-600 dark:text-primary-300">{item.category}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        <span>尺寸: {item.dimensions || '-'}</span><span>功率: {item.powerSpecs || '-'}</span><span className="col-span-2">接驳: {item.waterGasSpecs || '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-800">
              <button onClick={() => setShowAiImportModal(false)} className="px-5 py-3 rounded-xl text-slate-500 font-black hover:bg-slate-100 dark:hover:bg-slate-700">取消</button>
              <button onClick={handleConfirmAiImport} className="px-6 py-3 rounded-xl bg-primary-600 text-white font-black hover:bg-primary-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />确认导入</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Equipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
           <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">{editingId ? '编辑设备参数' : '录入新设备参数'}</h3>
                  <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500">
                      <X className="w-5 h-5 text-slate-500" />
                  </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-1 md:col-span-2 mb-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">设备照片</label>
                      <div 
                          onClick={() => !isUploading && fileInputRef.current?.click()}
                          className="w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group relative overflow-hidden bg-slate-50 dark:bg-slate-900"
                      >
                          {isUploading ? (
                              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                          ) : newEq.imageUrl ? (
                              <>
                                <img src={newEq.imageUrl} alt="Preview" className="w-full h-full object-contain p-2" />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-white font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> 更换图片</p>
                                </div>
                              </>
                          ) : (
                              <div className="flex flex-col items-center text-slate-400 group-hover:text-primary-500">
                                  <ImageIcon className="w-10 h-10 mb-2" />
                                  <p className="text-sm">点击上传设备照片</p>
                                  <p className="text-xs mt-1 opacity-70">支持 JPG, PNG (Max 1GB)</p>
                              </div>
                          )}
                          <input 
                              type="file" 
                              ref={fileInputRef} 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleFileChange} 
                          />
                      </div>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">设备名称 *</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        value={newEq.name || ''}
                        onChange={e => setNewEq({...newEq, name: e.target.value})}
                        placeholder="例如: 双头大锅灶"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">型号 *</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        value={newEq.model || ''}
                        onChange={e => setNewEq({...newEq, model: e.target.value})}
                        placeholder="厂牌型号"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">品牌</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        value={newEq.brand || ''}
                        onChange={e => setNewEq({...newEq, brand: e.target.value})}
                        placeholder="设备品牌"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">分类</label>
                      <select 
                         className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                         value={newEq.category || ''}
                         onChange={e => setNewEq({...newEq, category: e.target.value})}
                      >
                          <option value="">选择分类...</option>
                          <option value="热厨设备">热厨设备</option>
                          <option value="制冷设备">制冷设备</option>
                          <option value="洗涤消毒">洗涤消毒</option>
                          <option value="排烟系统">排烟系统</option>
                          <option value="不锈钢制品">不锈钢制品</option>
                          <option value="食品机械">食品机械</option>
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">外形尺寸 (mm)</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例如: 1200x800x800"
                        value={newEq.dimensions || ''}
                        onChange={e => setNewEq({...newEq, dimensions: e.target.value})}
                      />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">电功率/电压</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例如: 380V/15kW"
                        value={newEq.powerSpecs || ''}
                        onChange={e => setNewEq({...newEq, powerSpecs: e.target.value})}
                      />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">给排水/燃气要求</label>
                      <input 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例如: DN25 进水, DN40 排水"
                        value={newEq.waterGasSpecs || ''}
                        onChange={e => setNewEq({...newEq, waterGasSpecs: e.target.value})}
                      />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">备注描述</label>
                      <textarea 
                        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                        rows={3}
                        value={newEq.description || ''}
                        onChange={e => setNewEq({...newEq, description: e.target.value})}
                        placeholder="其他详细说明..."
                      />
                  </div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => setShowAddModal(false)} className="px-6 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                  <button onClick={handleSave} className="px-8 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg font-bold shadow-lg shadow-primary-500/20 transition-all active:scale-95">保存归档</button>
              </div>
           </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
           <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col md:flex-row max-h-[90vh]">
              <div className="md:w-1/2 bg-slate-100 dark:bg-slate-900 p-8 flex items-center justify-center relative border-r border-slate-200 dark:border-slate-700">
                  {previewItem.imageUrl ? (
                     <img src={previewItem.imageUrl} alt={previewItem.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                     <Settings className="w-32 h-32 text-slate-300 dark:text-slate-700" />
                  )}
                  <div className="absolute top-4 left-4 px-3 py-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-full text-xs font-bold text-slate-600 dark:text-slate-400 shadow-sm border border-slate-200 dark:border-slate-700">
                     {previewItem.category}
                  </div>
              </div>
              <div className="md:w-1/2 flex flex-col bg-white dark:bg-slate-800">
                  <div className="p-6 flex-1 overflow-y-auto">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                             <h2 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{previewItem.name}</h2>
                             <div className="flex items-center gap-2 mt-2">
                                <span className="text-sm font-mono bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{previewItem.model}</span>
                                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{previewItem.brand}</span>
                             </div>
                          </div>
                          <button onClick={() => setPreviewItem(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                             <X className="w-6 h-6 text-slate-400" />
                          </button>
                      </div>

                      <div className="space-y-6">
                          <div>
                             <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Ruler className="w-4 h-4" /> 规格参数
                             </h4>
                             <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3 text-sm border border-slate-100 dark:border-slate-700 shadow-inner">
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                                   <span className="text-slate-500">外形尺寸</span>
                                   <span className="font-medium text-slate-800 dark:text-slate-200">{previewItem.dimensions || '未标注'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                                   <span className="text-slate-500">电功率</span>
                                   <span className="font-medium text-slate-800 dark:text-slate-200">{previewItem.powerSpecs || '未标注'}</span>
                                </div>
                                <div className="flex justify-between">
                                   <span className="text-slate-500">接驳要求</span>
                                   <span className="font-medium text-slate-800 dark:text-slate-200 text-right max-w-[200px]">{previewItem.waterGasSpecs || '无特殊要求'}</span>
                                </div>
                             </div>
                          </div>

                          {previewItem.description && (
                             <div>
                                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                   <Tag className="w-4 h-4" /> 详细描述
                                </h4>
                                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700 shadow-inner">
                                    {previewItem.description}
                                </p>
                             </div>
                          )}
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
                      {(currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite') && (
                          <button 
                             onClick={(e) => {
                                 setPreviewItem(null);
                                 handleEdit(e, previewItem);
                             }}
                             className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-bold shadow-sm transition-all"
                          >
                             <Edit2 className="w-4 h-4" /> 编辑参数
                          </button>
                      )}
                      <button 
                        onClick={() => setPreviewItem(null)}
                        className="px-6 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition-colors"
                      >
                        关闭
                      </button>
                  </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentLibrary;

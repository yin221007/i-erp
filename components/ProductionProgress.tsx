import React, { useState, useRef, useEffect } from 'react';
import { ProjectProduction, ProductionUnit, ProductionStatus, User, Project } from '../types';
import { Search, ArrowLeft, Plus, Edit2, X, Save, Trash2, Download, Upload, FileSpreadsheet, CheckCircle2, PackageCheck, Truck, ClipboardList } from 'lucide-react';
import { getBeijingDateString } from '../constants';

interface ProductionProgressProps {
  projects: Project[];
  productionData: ProjectProduction[];
  onUpdateProject: (project: ProjectProduction) => void;
  onDeleteProjectProduction?: (projectId: string) => void;
  currentUser: User;
  initialProjectId?: string | null;
}

type ProductionSummary = {
  project: Project;
  record: ProjectProduction;
  waiting: number;
  inStock: number;
  shipped: number;
  total: number;
  completionRate: number;
};

const statusMeta: Record<ProductionStatus, { label: string; short: string; icon: React.ReactNode; tone: string }> = {
  Waiting: { label: '待生产', short: '待生产', icon: <ClipboardList className="w-4 h-4" />, tone: 'amber' },
  InStock: { label: '已生产 / 已入库', short: '已入库', icon: <PackageCheck className="w-4 h-4" />, tone: 'sky' },
  Shipped: { label: '已发货', short: '已发货', icon: <Truck className="w-4 h-4" />, tone: 'emerald' }
};

const createEmptyRecord = (project?: Project): ProjectProduction => ({
  id: project?.id || '',
  projectId: project?.id || '',
  projectName: project?.name || '',
  projectCode: project?.code || '',
  items: []
});

const sumByStatus = (items: ProductionUnit[], status: ProductionStatus) =>
  items.filter(item => item.status === status).reduce((sum, item) => sum + (item.quantity || 0), 0);

const getSerialSortValue = (value?: string) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};

const sortProductionUnits = (items: ProductionUnit[]) => [...items].sort((a, b) => {
  const serialDiff = getSerialSortValue(a.serialNumber) - getSerialSortValue(b.serialNumber);
  if (serialDiff !== 0) return serialDiff;
  return (a.serialNumber || a.name).localeCompare(b.serialNumber || b.name, 'zh-CN', { numeric: true });
});

const parseCsvLine = (line: string) => line.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(part => part.replace(/^\"|\"$/g, '').trim());

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

const resolveProductionStatus = (rawValue: string, defaultStatus: ProductionStatus): ProductionStatus => {
  const value = rawValue.trim();
  if (value.includes('发') || value === 'Shipped') return 'Shipped';
  if (value.includes('入') || value.includes('生产') || value === 'InStock') return 'InStock';
  return defaultStatus;
};

const rowsToProductionUnits = (rows: string[][], defaultStatus: ProductionStatus): ProductionUnit[] => {
  const cleanedRows = rows
    .map(row => row.map(cell => String(cell || '').trim()))
    .filter(row => row.some(Boolean));
  if (cleanedRows.length === 0) return [];

  const nameHeaders = ['设备名称', '名称', 'name', '品名', '产品名称', '货物名称', '材料名称', '设备/材料名称'].map(normalizeHeader);
  const modelHeaders = ['型号', '规格', '型号/规格', '规格型号', '生产规格', '尺寸规格', '规格尺寸', '外形尺寸', '长宽高', '规格/尺寸', 'model', 'spec', '参数'].map(normalizeHeader);
  const dimensionHeaders = ['尺寸', '尺寸(mm)', '长', '宽', '高', '长度', '宽度', '高度', '深度', '直径', '口径'].map(normalizeHeader);
  const quantityHeaders = ['数量', 'quantity', 'qty', '件数', '台数', '工程量'].map(normalizeHeader);
  const statusHeaders = ['状态', 'status', '生产状态'].map(normalizeHeader);
  const notesHeaders = ['备注', 'notes', '说明', '技术要求'].map(normalizeHeader);
  const dateHeaders = ['日期', '批次', 'date', 'batchdate'].map(normalizeHeader);
  const serialHeaders = ['序号', '编号', 'no', '序列'].map(normalizeHeader);
  const invalidNames = ['序号', '编号', '名称', '设备名称', '品名', '产品名称', '货物名称', '材料名称', '合计', '小计', '总计', '备注'].map(normalizeHeader);

  const isNumericCell = (value: string) => /^\d+(?:\.\d+)?$/.test(value.replace(/,/g, '').trim());
  const isSerialOnlyCell = (value: string) => /^\d+$/.test(value.trim());
  const isLikelyHeaderRow = (row: string[]) => {
    const normalized = row.map(normalizeHeader);
    const hasName = normalized.some(value => nameHeaders.includes(value));
    const hasQuantity = normalized.some(value => quantityHeaders.includes(value));
    const hasModel = normalized.some(value => modelHeaders.includes(value));
    const hasDimension = normalized.some(value => dimensionHeaders.includes(value));
    const hasSerial = normalized.some(value => serialHeaders.includes(value));
    return hasName && (hasQuantity || hasModel || hasDimension || hasSerial);
  };

  const headerIndex = cleanedRows.findIndex((row, index) => index < 12 && isLikelyHeaderRow(row));
  const hasHeader = headerIndex >= 0;
  const header = hasHeader ? cleanedRows[headerIndex].map(normalizeHeader) : [];
  const dataRows = hasHeader ? cleanedRows.slice(headerIndex + 1) : cleanedRows;
  const findHeader = (names: string[], fallback: number) => {
    const index = header.findIndex(value => names.includes(value));
    return index >= 0 ? index : fallback;
  };
  const findHeaders = (names: string[]) => header
    .map((value, index) => names.includes(value) ? index : -1)
    .filter(index => index >= 0);

  const noHeaderFirstDataRow = dataRows.find(row => row.some(Boolean)) || [];
  const hasLeadingSerialWithoutHeader = !hasHeader && isSerialOnlyCell(noHeaderFirstDataRow[0] || '') && Boolean(noHeaderFirstDataRow[1]) && !isNumericCell(noHeaderFirstDataRow[1]);
  const serialIndex = hasHeader ? findHeader(serialHeaders, -1) : hasLeadingSerialWithoutHeader ? 0 : -1;
  const nameIndex = findHeader(nameHeaders, hasLeadingSerialWithoutHeader ? 1 : 0);
  const modelIndex = hasHeader ? findHeader(modelHeaders, -1) : findHeader(modelHeaders, hasLeadingSerialWithoutHeader ? 2 : 1);
  const quantityIndex = hasHeader ? findHeader(quantityHeaders, -1) : findHeader(quantityHeaders, hasLeadingSerialWithoutHeader ? 3 : 2);
  const statusIndex = hasHeader ? findHeader(statusHeaders, -1) : findHeader(statusHeaders, hasLeadingSerialWithoutHeader ? 4 : 3);
  const notesIndex = hasHeader ? findHeader(notesHeaders, -1) : findHeader(notesHeaders, hasLeadingSerialWithoutHeader ? 5 : 4);
  const dateIndex = hasHeader ? findHeader(dateHeaders, -1) : findHeader(dateHeaders, hasLeadingSerialWithoutHeader ? 6 : 5);
  const dimensionIndices = hasHeader
    ? findHeaders(dimensionHeaders).filter(index => index !== nameIndex && index !== modelIndex && index !== quantityIndex)
    : [];
  const rawHeaderRow = hasHeader ? cleanedRows[headerIndex] : [];

  const resolveModel = (row: string[]) => {
    const model = modelIndex >= 0 ? row[modelIndex] || '' : '';
    if (model) return model;
    const dimensions = dimensionIndices
      .map(index => {
        const value = row[index] || '';
        if (!value) return '';
        const label = rawHeaderRow[index] || '';
        return label ? `${label}${value}` : value;
      })
      .filter(Boolean);
    return dimensions.join(' × ');
  };

  const resolveQuantity = (row: string[]) => {
    const preferred = row[quantityIndex] || '';
    if (isNumericCell(preferred)) return Number(preferred.replace(/,/g, ''));
    if (hasHeader) return 1;
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (index === nameIndex || index === modelIndex) continue;
      if (hasLeadingSerialWithoutHeader && index === 0) continue;
      const value = row[index] || '';
      if (isNumericCell(value)) return Number(value.replace(/,/g, ''));
    }
    return 1;
  };

  return dataRows.map(row => {
    const nonEmptyCells = row.filter(Boolean);
    if (nonEmptyCells.length === 0) return null;
    if (!hasHeader && nonEmptyCells.length === 1 && /项目|工程|清单|表$/.test(nonEmptyCells[0])) return null;

    const name = row[nameIndex] || '';
    const normalizedName = normalizeHeader(name);
    if (!name || invalidNames.includes(normalizedName) || isSerialOnlyCell(name)) return null;

    const serialNumber = serialIndex >= 0 ? (row[serialIndex] || '').trim() : '';
    const model = resolveModel(row);
    const quantity = resolveQuantity(row);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    return {
      id: Math.random().toString(36).slice(2, 11),
      serialNumber,
      name,
      model,
      quantity,
      status: resolveProductionStatus(row[statusIndex] || '', defaultStatus),
      notes: row[notesIndex] || '',
      batchDate: row[dateIndex] || getBeijingDateString()
    };
  }).filter(Boolean) as ProductionUnit[];
};

const parseProductionCsv = (text: string, defaultStatus: ProductionStatus): ProductionUnit[] => {
  const rows = text.split(/\r\n|\n/).map(line => line.trim()).filter(Boolean).map(parseCsvLine);
  return rowsToProductionUnits(rows, defaultStatus);
};

const inflateZipData = async (data: Uint8Array, method: number) => {
  if (method === 0) return data;
  if (method !== 8) throw new Error('Excel 文件压缩格式暂不支持，请另存为 .xlsx 后重试');
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
  if (!DecompressionStreamCtor) throw new Error('当前浏览器不支持直接解析 Excel，请另存为 CSV 后导入');
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readXlsxZipEntries = async (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};

  for (let offset = 0; offset < view.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.slice(dataStart, dataStart + compressedSize);
    const inflated = await inflateZipData(raw, method);
    if (name.endsWith('.xml')) entries[name] = decoder.decode(inflated);
    offset += 45 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const getNodeText = (node: Element, tagName: string) => Array.from(node.getElementsByTagName(tagName)).map(item => item.textContent || '').join('');

const columnIndexFromRef = (ref: string) => {
  const letters = (ref.match(/[A-Z]+/) || [''])[0];
  return letters.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
};

const parseProductionXlsx = async (buffer: ArrayBuffer, defaultStatus: ProductionStatus): Promise<ProductionUnit[]> => {
  const entries = await readXlsxZipEntries(buffer);
  const parser = new DOMParser();
  const sharedXml = entries['xl/sharedStrings.xml'];
  const sharedStrings = sharedXml
    ? Array.from(parser.parseFromString(sharedXml, 'application/xml').getElementsByTagName('si')).map(si => getNodeText(si, 't'))
    : [];
  const sheetName = Object.keys(entries).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetName) throw new Error('Excel 文件中没有找到工作表');

  const sheet = parser.parseFromString(entries[sheetName], 'application/xml');
  const rows = Array.from(sheet.getElementsByTagName('row')).map(row => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach(cell => {
      const ref = cell.getAttribute('r') || '';
      const index = Math.max(columnIndexFromRef(ref), values.length);
      const type = cell.getAttribute('t');
      const raw = getNodeText(cell, 'v') || getNodeText(cell, 't');
      values[index] = type === 's' ? sharedStrings[Number(raw)] || '' : raw;
    });
    return values;
  });
  return rowsToProductionUnits(rows, defaultStatus);
};

const ProductionProgress: React.FC<ProductionProgressProps> = ({ projects, productionData, onUpdateProject, onDeleteProjectProduction, initialProjectId }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductionUnit | null>(null);
  const [formData, setFormData] = useState({ serialNumber: '', name: '', model: '', quantity: '', notes: '', batchDate: getBeijingDateString(), status: 'Waiting' as ProductionStatus });
  const [importPreview, setImportPreview] = useState<{ fileName: string; items: ProductionUnit[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProjectId && projects.some(project => project.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId, projects]);

  const activeProject = projects.find(p => p.id === selectedProjectId);
  const activeProductionData = productionData.find(p => p.projectId === selectedProjectId) || createEmptyRecord(activeProject);

  const summaries: ProductionSummary[] = projects.map(project => {
    const record = productionData.find(item => item.projectId === project.id) || createEmptyRecord(project);
    const waiting = sumByStatus(record.items, 'Waiting');
    const inStock = sumByStatus(record.items, 'InStock');
    const shipped = sumByStatus(record.items, 'Shipped');
    const total = waiting + inStock + shipped;
    return { project, record, waiting, inStock, shipped, total, completionRate: total > 0 ? Math.round((shipped / total) * 100) : 0 };
  });

  const filteredSummaries = summaries.filter(item =>
    item.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.project.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.project.manager.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateItems = (items: ProductionUnit[]) => {
    if (!activeProject) return;
    onUpdateProject({ ...activeProductionData, ...createEmptyRecord(activeProject), id: activeProductionData.id || activeProject.id, items });
  };

  const handleColumnExport = (status?: ProductionStatus) => {
    const items = status ? activeProductionData.items.filter(i => i.status === status) : activeProductionData.items;
    if (items.length === 0) return alert('暂无可导出的生产数据');
    const sortedItems = sortProductionUnits(items);
    const headers = ['编号', '设备名称', '型号/规格', '数量', '状态', '备注', '日期'];
    const rows = sortedItems.map(item => [`"${item.serialNumber || ''}"`, `"${item.name}"`, `"${item.model || ''}"`, item.quantity, statusMeta[item.status].short, `"${item.notes || ''}"`, item.batchDate || ''].join(','));
    const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeProject?.name || '生产清单'}_${status ? statusMeta[status].short : '全部'}.csv`;
    link.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>, defaultStatus: ProductionStatus = 'Waiting') => {
    const file = event.target.files?.[0];
    if (!file || !activeProject) return;
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
      alert('暂不支持旧版 .xls 二进制格式，请在 Excel 中另存为 .xlsx 或 CSV 后导入');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const newItems = fileName.endsWith('.xlsx')
          ? await parseProductionXlsx(evt.target?.result as ArrayBuffer, defaultStatus)
          : parseProductionCsv(String(evt.target?.result || ''), defaultStatus);
        if (newItems.length === 0) {
          alert('没有识别到有效设备行，请确认表格列为：设备名称、型号/规格、数量、状态、备注、日期');
        } else {
          setImportPreview({ fileName: file.name, items: newItems });
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : '导入失败，请检查表格格式');
      } finally {
        event.target.value = '';
      }
    };
    if (fileName.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const confirmImportPreview = () => {
    if (!importPreview) return;
    updateItems([...activeProductionData.items, ...importPreview.items]);
    alert(`已导入 ${importPreview.items.length} 条生产记录`);
    setImportPreview(null);
  };

  const openAddModal = (status: ProductionStatus) => {
    setEditingItem(null);
    setFormData({ serialNumber: '', name: '', model: '', quantity: '', notes: '', batchDate: getBeijingDateString(), status });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!selectedProjectId || !formData.name) return;
    const quantity = Number(formData.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return alert('请输入有效数量');
    const nextItem: ProductionUnit = {
      id: editingItem?.id || Math.random().toString(36).slice(2, 11),
      serialNumber: formData.serialNumber.trim(),
      name: formData.name,
      model: formData.model,
      quantity,
      notes: formData.notes,
      batchDate: formData.batchDate,
      status: formData.status
    };
    const items = editingItem
      ? activeProductionData.items.map(item => item.id === editingItem.id ? nextItem : item)
      : [...activeProductionData.items, nextItem];
    updateItems(items);
    setIsModalOpen(false);
  };

  const updateItemStatus = (id: string, status: ProductionStatus) => {
    updateItems(activeProductionData.items.map(item => item.id === id ? { ...item, status, batchDate: item.batchDate || getBeijingDateString() } : item));
  };

  const markAll = (status: ProductionStatus) => {
    if (activeProductionData.items.length === 0) return;
    if (!window.confirm(`确定将当前工程所有设备标注为「${statusMeta[status].short}」吗？`)) return;
    updateItems(activeProductionData.items.map(item => ({ ...item, status, batchDate: item.batchDate || getBeijingDateString() })));
  };

  if (!selectedProjectId) {
    const totalProjects = summaries.filter(item => item.total > 0).length;
    const totalUnits = summaries.reduce((sum, item) => sum + item.total, 0);
    const shippedUnits = summaries.reduce((sum, item) => sum + item.shipped, 0);
    return (
      <div className="max-w-7xl mx-auto transition-all pb-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">生产进度管理</h2>
            <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">按工程项目汇总生产清单，进入项目后可导入表格、批量标注和维护设备明细。</p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full lg:w-auto">
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-3"><p className="text-xl font-black text-slate-900 dark:text-white">{totalProjects}</p><p className="text-[10px] font-black text-slate-400">有生产数据工程</p></div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-3"><p className="text-xl font-black text-slate-900 dark:text-white">{totalUnits}</p><p className="text-[10px] font-black text-slate-400">设备总数</p></div>
            <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-3"><p className="text-xl font-black text-emerald-600">{totalUnits ? Math.round((shippedUnits / totalUnits) * 100) : 0}%</p><p className="text-[10px] font-black text-slate-400">发货完成率</p></div>
          </div>
        </div>
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold" placeholder="搜索工程、客户、负责人..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSummaries.map(item => (
            <button key={item.project.id} onClick={() => setSelectedProjectId(item.project.id)} className="text-left bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-primary-500 hover:-translate-y-0.5 transition-all group">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-black text-slate-900 dark:text-white group-hover:text-primary-600 truncate">{item.project.name}</h3><p className="mt-1 text-xs font-bold text-slate-400 truncate">{item.project.clientName} · {item.project.manager}</p></div>
                <div className="shrink-0 text-right">
                  <span className="block rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-[10px] font-black text-slate-500">{item.total} 件</span>
                  <span className="mt-2 block text-lg font-black text-emerald-600 dark:text-emerald-300">{item.completionRate}%</span>
                  <span className="block text-[9px] font-black text-slate-400">已发货</span>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-black text-slate-400"><span>发货进度</span><span>{item.shipped}/{item.total || 0}</span></div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.completionRate}%` }} /></div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-3"><p className="font-black text-amber-700 dark:text-amber-300">{item.waiting}</p><p className="text-[9px] font-black text-slate-400">待生产</p></div>
                <div className="rounded-2xl bg-sky-50 dark:bg-sky-900/20 p-3"><p className="font-black text-sky-700 dark:text-sky-300">{item.inStock}</p><p className="text-[9px] font-black text-slate-400">已入库</p></div>
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3"><p className="font-black text-emerald-700 dark:text-emerald-300">{item.shipped}</p><p className="text-[9px] font-black text-slate-400">已发货</p></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col transition-all pb-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <button onClick={() => setSelectedProjectId(null)} className="flex items-center gap-1.5 text-slate-600 hover:text-primary-600 transition-all font-black text-xs tracking-widest mb-3"><ArrowLeft className="w-4 h-4" /> 返回工程生产汇总</button>
          <h2 className="font-black text-2xl text-slate-900 dark:text-white truncate max-w-3xl">{activeProject?.name}</h2>
          <p className="text-xs font-bold text-slate-400 mt-1">{activeProject?.clientName} · {activeProject?.manager}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={e => handleImport(e, 'Waiting')} />
          <button onClick={() => importInputRef.current?.click()} className="px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 hover:border-primary-500 flex items-center gap-2"><Upload className="w-4 h-4" /> 导入表格</button>
          <button onClick={() => handleColumnExport()} className="px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 hover:border-primary-500 flex items-center gap-2"><Download className="w-4 h-4" /> 导出全部</button>
          <button onClick={() => markAll('Waiting')} className="px-4 py-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 text-xs font-black">全部待生产</button>
          <button onClick={() => markAll('InStock')} className="px-4 py-3 rounded-2xl bg-sky-50 text-sky-700 border border-sky-100 text-xs font-black">全部已生产/入库</button>
          <button onClick={() => markAll('Shipped')} className="px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">全部已发货</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 min-h-[34rem]">
        {(['Waiting', 'InStock', 'Shipped'] as ProductionStatus[]).map(status => {
          const items = sortProductionUnits(activeProductionData.items.filter(i => i.status === status));
          return (
            <section key={status} className="bg-slate-100/80 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden shadow-inner">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800">
                <span className="font-black text-xs text-slate-700 dark:text-slate-200 flex items-center gap-2">{statusMeta[status].icon}{statusMeta[status].label}<b className="text-slate-400">{items.reduce((sum, item) => sum + item.quantity, 0)}</b></span>
                <div className="flex gap-1.5"><button onClick={() => openAddModal(status)} className="p-2 hover:bg-primary-50 dark:hover:bg-primary-900/40 rounded-xl text-primary-600"><Plus className="w-4 h-4" /></button><button onClick={() => handleColumnExport(status)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-400"><Download className="w-4 h-4" /></button></div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                {items.length === 0 ? <div className="py-20 text-center text-slate-300"><FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-40" /><p className="text-xs font-black">暂无记录</p></div> : items.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 transition-all hover:border-primary-500 group">
                    <div className="flex justify-between gap-3"><div className="min-w-0"><div className="mb-1 flex items-center gap-2">{item.serialNumber && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-900 dark:text-slate-300">编号 {item.serialNumber}</span>}<p className="truncate text-sm font-black text-slate-900 dark:text-white">{item.name}</p></div><p className="text-[10px] font-bold text-slate-400 truncate">{item.model || '未填写规格'}</p></div><span className="text-primary-600 dark:text-primary-400 font-black text-xs">x {item.quantity}</span></div>
                    {item.notes && <p className="mt-3 text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-700">{item.notes}</p>}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap justify-between gap-2">
                      <span className="text-[9px] font-black text-slate-400">{item.batchDate || '-'}</span>
                      <div className="flex gap-1">
                        {(['Waiting', 'InStock', 'Shipped'] as ProductionStatus[]).map(nextStatus => <button key={nextStatus} onClick={() => updateItemStatus(item.id, nextStatus)} className={`px-2 py-1 rounded-lg text-[9px] font-black border ${item.status === nextStatus ? 'bg-primary-600 text-white border-primary-600' : 'text-slate-400 border-slate-200 dark:border-slate-700 hover:text-primary-600'}`}>{statusMeta[nextStatus].short}</button>)}
                        <button onClick={() => { setEditingItem(item); setFormData({ serialNumber: item.serialNumber || '', name: item.name, model: item.model, quantity: item.quantity.toString(), notes: item.notes || '', batchDate: item.batchDate || getBeijingDateString(), status: item.status }); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-primary-600"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (window.confirm('确定移除此项吗？')) updateItems(activeProductionData.items.filter(i => i.id !== item.id)); }} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-slate-700">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">导入前确认</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{importPreview.fileName} · 已识别 {importPreview.items.length} 条，请核对编号、名称、规格尺寸、数量和状态后再写入。</p>
              </div>
              <button onClick={() => setImportPreview(null)} className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-5 custom-scrollbar">
              <div className="grid grid-cols-12 gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-[10px] font-black text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <span className="col-span-2">编号</span><span className="col-span-3">名称</span><span className="col-span-3">规格尺寸</span><span className="col-span-2">数量</span><span className="col-span-2">状态</span>
              </div>
              <div className="mt-3 space-y-2">
                {sortProductionUnits(importPreview.items).map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <span className="col-span-2 truncate text-slate-500">{item.serialNumber || '-'}</span>
                    <span className="col-span-3 truncate font-black text-slate-900 dark:text-white">{item.name}</span>
                    <span className="col-span-3 truncate">{item.model || '未识别规格'}</span>
                    <span className="col-span-2">{item.quantity}</span>
                    <span className="col-span-2">{statusMeta[item.status].short}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button onClick={() => setImportPreview(null)} className="px-6 py-3 text-xs font-black text-slate-500">取消导入</button>
              <button onClick={confirmImportPreview} className="rounded-2xl bg-primary-600 px-8 py-3 text-xs font-black text-white shadow-xl shadow-primary-500/20 hover:bg-primary-700">确认写入</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4"><h3 className="text-xl font-black text-slate-900 dark:text-white">{editingItem ? '修改生产设备' : '新增生产设备'}</h3><button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><X className="w-5 h-5 text-slate-500" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-[10px] font-black text-slate-400 mb-1">编号 / 序号</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
              <div><label className="block text-[10px] font-black text-slate-400 mb-1">设备名称 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div><label className="block text-[10px] font-black text-slate-400 mb-1">生产规格 / 型号</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-black text-slate-400 mb-1">数量 *</label><input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} /></div><div><label className="block text-[10px] font-black text-slate-400 mb-1">状态</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as ProductionStatus })}><option value="Waiting">待生产</option><option value="InStock">已生产/入库</option><option value="Shipped">已发货</option></select></div></div>
              <div><label className="block text-[10px] font-black text-slate-400 mb-1">日期 / 批次</label><input type="date" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black" value={formData.batchDate} onChange={e => setFormData({ ...formData, batchDate: e.target.value })} /></div>
              <div><label className="block text-[10px] font-black text-slate-400 mb-1">备注</label><textarea className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 h-24 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black resize-none" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-8 pt-5 border-t dark:border-slate-700"><button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-500 font-black">取消</button><button onClick={handleSave} className="px-8 py-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 font-black flex items-center gap-2"><Save className="w-4 h-4" />保存</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionProgress;

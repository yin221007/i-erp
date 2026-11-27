import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Edit2, Plus, Search, Upload } from 'lucide-react';
import type { ProductionItemDetails, ProductionSourceTable, ProductionStatus, ProductionUnit, Project, ProjectProduction, User } from '../types';
import { getBeijingDateString } from '../constants';
import { appendProductionUnitsInSourceOrder, changeProductionShipment, isProductionShipmentDate, sortProductionUnitsBySourceOrder } from '../lib/production-records.js';
import { prepareProductionTable, readProductionTables } from '../lib/production-table-import.js';
import { exportProductionWorkbook, legacyProductionTable, productionActionHeaders, productionSourcingLabels, productionStatusLabels } from '../lib/production-sheet-export';
import ProductionImportDialog from './ProductionImportDialog';
import ProductionSheet from './ProductionSheet';

interface ProductionProgressProps {
  projects: Project[];
  productionData: ProjectProduction[];
  onUpdateProject: (project: ProjectProduction) => Promise<boolean>;
  onDeleteProjectProduction?: (projectId: string) => void;
  currentUser: User;
  initialProjectId?: string | null;
}

const emptyRecord = (project?: Project): ProjectProduction => ({
  id: project?.id || '',
  projectId: project?.id || '',
  projectName: project?.name || '',
  projectCode: project?.code || '',
  items: []
});

const sumByStatus = (items: ProductionUnit[], status: ProductionStatus) =>
  items.filter(item => item.status === status).reduce((sum, item) => sum + (item.quantity || 0), 0);

const cellClass = 'border border-slate-200 px-3 py-2 text-sm dark:border-slate-700';
const controlClass = 'min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 disabled:opacity-60';
const buttonClass = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 disabled:opacity-50';
const primaryClass = 'rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const blankItem = () => ({
  name: '', model: '', serialNumber: '', actualProductionSpec: '',
  quantity: '1', batchDate: getBeijingDateString()
});

type Editor = { kind: 'note'; item: ProductionUnit; value: string; actualSpec: string } |
  { kind: 'shipment'; ids: string[]; shipped: boolean; date: string } |
  { kind: 'device'; item?: ProductionUnit; values: ReturnType<typeof blankItem> };

export default function ProductionProgress({ projects, productionData, onUpdateProject, currentUser, initialProjectId }: ProductionProgressProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [preview, setPreview] = useState<ProductionSourceTable[] | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [feedback, setFeedback] = useState('');
  const savingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProjectId && projects.some(project => project.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId, projects]);

  useEffect(() => {
    setSelectedIds(new Set());
    setActiveTableId(null);
    setEditor(null);
    setPreview(null);
    setFeedback('');
  }, [selectedProjectId]);

  const project = projects.find(item => item.id === selectedProjectId);
  const record = productionData.find(item => item.projectId === selectedProjectId) || emptyRecord(project);
  const canEdit = Boolean(project && (
    currentUser.isDefaultAdmin === true || currentUser.role === 'Admin' ||
    (currentUser.permission === 'ReadWrite' &&
      (project.manager === currentUser.nickname || ['总经办', '工程部', '生产部'].includes(currentUser.department)))
  ));
  const items = useMemo(() => new Map(record.items.map(item => [item.id, item])), [record.items]);
  const tables = useMemo(() => {
    const sourceTables = record.sourceTables || [];
    const linked = new Set(sourceTables.flatMap(table => table.rows.flatMap(row => row.itemId ? [row.itemId] : [])));
    const legacy = sortProductionUnitsBySourceOrder(record.items.filter(item => !linked.has(item.id)));
    return [...(legacy.length ? [legacyProductionTable(legacy)] : []), ...sourceTables];
  }, [record]);
  const activeTable = tables.find(table => table.id === activeTableId) ?? tables[0];
  const visibleItemIds = activeTable?.rows.flatMap(row => row.itemId && items.has(row.itemId) ? [row.itemId] : []) || [];

  const summaries = projects.map(projectItem => {
    const list = productionData.find(item => item.projectId === projectItem.id)?.items || [];
    const waiting = sumByStatus(list, 'Waiting');
    const inStock = sumByStatus(list, 'InStock');
    const shipped = sumByStatus(list, 'Shipped');
    const total = waiting + inStock + shipped;
    return { project: projectItem, waiting, inStock, shipped, total, completionRate: total ? Math.round(shipped / total * 100) : 0 };
  });
  const search = searchTerm.toLowerCase();
  const filteredSummaries = summaries.filter(({ project: item }) =>
    [item.name, item.clientName, item.manager].some(value => value.toLowerCase().includes(search))
  );

  const save = async (next: ProjectProduction, message = '已保存') => {
    if (!project || !canEdit || savingRef.current) return false;
    // 生产接口接收整份工程记录，限制请求体并避免本页面同时写入两个版本。
    if (new Blob([JSON.stringify(next)]).size > 2 * 1024 * 1024) {
      setFeedback('此工程的清单超过现有服务器的保存上限。已保留预览，请减少本次导入的内容。');
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setFeedback('');
    try {
      const saved = await onUpdateProject(next);
      setFeedback(saved ? message : '保存失败，请重试。');
      return saved;
    } catch {
      setFeedback('保存失败，请重试。');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !canEdit) return;
    setLoadingFile(true);
    setFeedback('');
    try {
      setPreview(await readProductionTables(file));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '无法读取此表格。');
    } finally {
      setLoadingFile(false);
    }
  };

  const confirmImport = async (drafts: ReturnType<typeof prepareProductionTable>[]) => {
    const sourceTables = record.sourceTables || [];
    const pending = drafts.filter(draft => !sourceTables.some(table => table.id === draft.table.id));
    if (pending.length === 0) {
      setPreview(null);
      setFeedback('此批表格已导入。');
      return true;
    }
    const duplicates = pending.some(({ table }) => sourceTables.some(previous =>
      previous.title === table.title && previous.fileName === table.fileName &&
      JSON.stringify(previous.rows.map(row => row.cells)) === JSON.stringify(table.rows.map(row => row.cells))
    ));
    if (duplicates && !window.confirm('此工程已有内容相同的表格，确定再导入一份吗？')) return false;
    const newItems = pending.flatMap(draft => draft.items);
    const saved = await save({
      ...record,
      sourceTables: [...sourceTables, ...pending.map(draft => draft.table)],
      items: appendProductionUnitsInSourceOrder(record.items, newItems)
    }, '已导入 ' + newItems.length + ' 条设备。');
    if (saved) {
      setPreview(null);
      setSelectedIds(new Set());
      setActiveTableId(pending.find(draft => draft.items.length)?.table.id || pending[0].table.id);
    }
    return saved;
  };

  const updateDetails = (id: string, change: ProductionItemDetails) => {
    void save({
      ...record,
      itemDetails: { ...record.itemDetails, [id]: { ...record.itemDetails?.[id], ...change } }
    });
  };

  const toggleSelection = (id: string) => setSelectedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const openShipment = (ids: string[]) => {
    setFeedback('');
    const item = ids.length === 1 ? items.get(ids[0]) : undefined;
    const date = item && record.itemDetails?.[item.id]?.shipmentDate;
    setEditor({
      kind: 'shipment', ids, shipped: item ? item.status === 'Shipped' : true,
      date: isProductionShipmentDate(date) ? date : getBeijingDateString()
    });
  };

  const saveEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    let next: ProjectProduction;
    if (editor.kind === 'note') {
      next = { ...record, items: record.items.map(item => item.id === editor.item.id
        ? { ...item, notes: editor.value, actualProductionSpec: editor.actualSpec } : item) };
    } else if (editor.kind === 'shipment') {
      if (editor.shipped && !isProductionShipmentDate(editor.date)) return;
      next = editor.ids.reduce((current, id) => changeProductionShipment(current, id, editor.shipped, editor.date), record);
    } else {
      const { values, item } = editor;
      const quantity = Number(values.quantity);
      if (!values.name.trim() || !Number.isFinite(quantity) || quantity <= 0) return;
      const updated = {
        status: 'Waiting' as const, ...item, ...values, name: values.name.trim(), quantity,
        id: item?.id || (crypto.randomUUID?.() ?? 'device-' + Date.now() + '-' + Math.random().toString(36).slice(2))
      };
      next = {
        ...record,
        items: item ? record.items.map(entry => entry.id === item.id ? updated : entry)
          : appendProductionUnitsInSourceOrder(record.items, [updated])
      };
    }
    if (await save(next)) {
      if (editor.kind === 'device' && !editor.item) setActiveTableId('legacy');
      setEditor(null);
    }
  };

  const deleteSelection = async () => {
    if (!selectedIds.size || !window.confirm('确定删除选中的 ' + selectedIds.size + ' 条生产设备记录吗？')) return;
    const nextDetails = { ...record.itemDetails };
    for (const id of selectedIds) delete nextDetails[id];
    if (await save({ ...record, itemDetails: nextDetails, items: record.items.filter(item => !selectedIds.has(item.id)) }, '已删除选中设备。')) {
      setSelectedIds(new Set());
    }
  };

  const markProduction = async (status: 'Waiting' | 'InStock') => {
    const nextDetails = { ...record.itemDetails };
    const nextItems = record.items.map(item => {
      if (!selectedIds.has(item.id)) return item;
      if (item.status === 'Shipped') {
        // 生产或入库标记可以调整，已发货设备的发货日期和状态继续有效。
        nextDetails[item.id] = { ...nextDetails[item.id], statusBeforeShipment: status };
        return item;
      }
      return { ...item, status };
    });
    await save({ ...record, items: nextItems, itemDetails: nextDetails });
  };

  const renderActions = (item: ProductionUnit) => {
    const details = record.itemDetails?.[item.id];
    const shipped = item.status === 'Shipped';
    const shipment = shipped ? '已发货 · ' + (details?.shipmentDate || '日期未登记') : '未发货';
    return (
      <>
        <td className={cellClass + ' min-w-48 border-l-2 border-l-emerald-400'}>
          <div className="flex items-start gap-2">
            {canEdit && <input type="checkbox" className="mt-2" aria-label={'选择 ' + item.name} checked={selectedIds.has(item.id)}
              onChange={() => toggleSelection(item.id)} />}
            {canEdit ? <button type="button" disabled={saving} className="min-h-8 flex-1 whitespace-pre-wrap break-words text-left text-emerald-800 dark:text-emerald-300"
              onClick={() => {
                setFeedback('');
                setEditor({ kind: 'note', item, value: item.notes || '', actualSpec: item.actualProductionSpec ?? item.model ?? '' });
              }}>{item.notes || '填写备注'}</button>
              : <span className="whitespace-pre-wrap break-words">{item.notes || '—'}</span>}
            {canEdit && activeTable.id === 'legacy' && (
              <button type="button" disabled={saving} className="rounded p-1 text-slate-600 dark:text-slate-300" aria-label={'修改设备 ' + item.name}
                onClick={() => setEditor({ kind: 'device', item, values: {
                  name: item.name, serialNumber: item.serialNumber || '', model: item.model || '',
                  actualProductionSpec: item.actualProductionSpec ?? item.model ?? '',
                  quantity: String(item.quantity), batchDate: item.batchDate || ''
                } })}><Edit2 size={15} /></button>
            )}
          </div>
        </td>
        <td className={cellClass + ' min-w-28'}>
          {canEdit ? <select className={controlClass} aria-label={item.name + '设备来源'} value={details?.sourcing || ''} disabled={saving}
            onChange={event => {
              const value = event.target.value as ProductionItemDetails['sourcing'] | '';
              updateDetails(item.id, { sourcing: value || undefined });
            }}>
            <option value="">待确认</option>
            <option value="InHouse">自产</option>
            <option value="Outsourced">外协采购</option>
          </select> : (details?.sourcing ? productionSourcingLabels[details.sourcing] : '待确认')}
        </td>
        <td className={cellClass + ' min-w-32'}>
          {canEdit ? <label className="flex min-h-9 items-center gap-2 whitespace-nowrap">
            <input type="checkbox" aria-label={item.name + '需外协安装'} checked={Boolean(details?.outsourcedInstallation)} disabled={saving}
              onChange={event => updateDetails(item.id, { outsourcedInstallation: event.target.checked })} /> 需外协安装
          </label> : (details?.outsourcedInstallation ? '需要' : '—')}
        </td>
        <td className={cellClass + ' min-w-44'}>
          {canEdit ? <button type="button" className={controlClass + (shipped ? ' text-emerald-800 dark:text-emerald-300' : '')}
            aria-label={item.name + '发货状态 · ' + shipment} disabled={saving}
            onClick={() => openShipment([item.id])}>{shipment}</button> : shipment}
        </td>
      </>
    );
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
    <div className="mx-auto max-w-[100rem] space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button type="button" disabled={saving || loadingFile} className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
            onClick={() => setSelectedProjectId(null)}><ArrowLeft size={16} />返回工程生产汇总</button>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{project?.name}</h2>
          <p className="text-sm text-slate-500">{project?.clientName} · {project?.manager}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? <>
            <input ref={fileInput} type="file" className="hidden" accept=".xlsx,.xls,.docx,.csv,.txt" onChange={importFile} />
            <button type="button" className={primaryClass + ' inline-flex min-h-10 items-center gap-2'} disabled={saving || loadingFile}
              onClick={() => fileInput.current?.click()}><Upload size={16} />{loadingFile ? '正在识别…' : '导入 Excel / Word'}</button>
            <button type="button" className={buttonClass} disabled={saving}
              onClick={() => setEditor({ kind: 'device', values: blankItem() })}><Plus size={16} />新增设备</button>
          </> : <span className="px-2 py-2 text-sm text-slate-500">仅查看</span>}
          <button type="button" className={buttonClass} disabled={!tables.length || saving} onClick={() =>
            void exportProductionWorkbook(record, tables).catch(() => setFeedback('导出失败，请重试。'))
          }><Download size={16} />导出清单</button>
        </div>
      </div>
      <p role="status" className={feedback ? 'rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-800' : 'sr-only'}>{feedback}</p>
      {tables.length > 1 && (
        <nav aria-label="生产清单表格" className="flex flex-wrap gap-2">
          {tables.map(table => <button type="button" key={table.id} disabled={saving} aria-pressed={activeTable.id === table.id}
            className={buttonClass + (activeTable.id === table.id ? ' ring-2 ring-emerald-500' : '')}
            title={table.fileName} onClick={() => { setActiveTableId(table.id); setSelectedIds(new Set()); }}>{table.title}</button>)}
        </nav>
      )}
      {activeTable ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-slate-600 dark:text-slate-300">
              {activeTable.fileName ? activeTable.fileName + ' · ' : ''}{visibleItemIds.length} 条设备
            </span>
            {canEdit && visibleItemIds.length > 0 && <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visibleItemIds.every(id => selectedIds.has(id))}
                onChange={event => setSelectedIds(new Set(event.target.checked ? visibleItemIds : []))} /> 全选此表
            </label>}
            {canEdit && selectedIds.size > 0 && (
              <>
                <button type="button" className={buttonClass} disabled={saving} onClick={() => openShipment([...selectedIds])}>批量标注发货</button>
                <button type="button" className={buttonClass} disabled={saving} onClick={() => void markProduction('Waiting')}>标记待生产</button>
                <button type="button" className={buttonClass} disabled={saving} onClick={() => void markProduction('InStock')}>标记已入库</button>
                <button type="button" className={buttonClass + ' text-red-700 dark:text-red-300'} disabled={saving}
                  onClick={() => void deleteSelection()}>删除选中（{selectedIds.size}）</button>
              </>
            )}
          </div>
          <ProductionSheet table={activeTable} items={items} actionHeaders={productionActionHeaders} renderActions={renderActions} />
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          {canEdit ? '暂无设备。导入 Excel 或 Word 表格，也可以手动新增。' : '暂无设备。'}
        </div>
      )}
      {preview && <ProductionImportDialog tables={preview} saving={saving} feedback={feedback} onClose={() => setPreview(null)} onSave={confirmImport} />}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={saveEditor} role="dialog" aria-modal="true"
            aria-label={editor.kind === 'note' ? '生产备注' : editor.kind === 'shipment' ? '发货状态' : '设备信息'}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
            {editor.kind === 'note' ? <>
              <h3 className="text-lg font-bold">{editor.item.name} · 生产备注</h3>
              <textarea autoFocus aria-label="生产备注" className={controlClass + ' min-h-28 w-full'} value={editor.value}
                onChange={event => setEditor({ ...editor, value: event.target.value })} />
              <label className="block text-sm">实际生产规格
                <input className={controlClass + ' mt-1 block w-full'} value={editor.actualSpec}
                  onChange={event => setEditor({ ...editor, actualSpec: event.target.value })} />
              </label>
            </> : editor.kind === 'shipment' ? <>
              <h3 className="text-lg font-bold">发货状态 · {editor.ids.length > 1 ? editor.ids.length + ' 条设备' : items.get(editor.ids[0])?.name}</h3>
              <label className="block text-sm">发货状态 <select autoFocus className={controlClass} value={editor.shipped ? 'yes' : 'no'}
                onChange={event => setEditor({ ...editor, shipped: event.target.value === 'yes' })}>
                <option value="no">未发货</option>
                <option value="yes">已发货</option>
              </select></label>
              {editor.shipped && (
                <label className="block text-sm">发货日期 <input required className={controlClass} type="date" value={editor.date}
                  onChange={event => setEditor({ ...editor, date: event.target.value })} /></label>
              )}
            </> : <>
              <h3 className="text-lg font-bold">{editor.item ? '修改设备' : '新增设备'}</h3>
              {([
                ['serialNumber', '编号', 'text'], ['name', '设备名称', 'text'], ['model', '清单规格 / 型号', 'text'],
                ['actualProductionSpec', '实际生产规格', 'text'], ['quantity', '数量', 'number'], ['batchDate', '批次日期', 'date']
              ] as const).map(([field, label, type]) => (
                <label key={field} className="block text-sm">{label}
                  <input className={controlClass + ' mt-1 block w-full'} value={editor.values[field]} type={type}
                    required={field === 'name' || field === 'quantity'} step={field === 'quantity' ? 'any' : undefined}
                    onChange={event => setEditor({ ...editor, values: { ...editor.values, [field]: event.target.value } })} />
                </label>
              ))}
            </>}
            {feedback && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{feedback}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass} disabled={saving} onClick={() => setEditor(null)}>取消</button>
              <button type="submit" className={primaryClass} disabled={saving}>{saving ? '正在保存…' : '保存'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

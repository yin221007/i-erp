import React, { useMemo, useState } from 'react';
import type { ProductionSourceTable, ProductionUnit } from '../types';
import { detectProductionHeaders, prepareProductionTable } from '../lib/production-table-import.js';
import ProductionSheet from './ProductionSheet';

type Draft = ReturnType<typeof prepareProductionTable>;
type Options = NonNullable<Parameters<typeof prepareProductionTable>[1]>;

export default function ProductionImportDialog({ tables, saving, feedback, onClose, onSave }: {
  tables: ProductionSourceTable[];
  saving: boolean;
  feedback: string;
  onClose: () => void;
  onSave: (drafts: Draft[]) => Promise<boolean>;
}) {
  const [options, setOptions] = useState<Record<string, Options>>({});
  const [index, setIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selected, setSelected] = useState(() => new Set(tables.map(table => table.id)));
  const drafts = useMemo(() => tables.map(table => prepareProductionTable(table, options[table.id])), [tables, options]);
  const current = drafts[index];
  const table = tables[index];
  const chosenDrafts = drafts.filter(draft => selected.has(draft.table.id));
  const total = chosenDrafts.reduce((sum, draft) => sum + draft.items.length, 0);
  const detectedHeader = detectProductionHeaders(table)[0];
  const chosenHeaderRow = options[table.id]?.headerIndex ?? detectedHeader?.index ?? 0;
  const chosenNameColumn = options[table.id]?.nameColumn ?? detectedHeader?.nameColumn ?? 0;
  const itemMap = new Map(current.items.map(item => [item.id, item]));
  const updateOptions = (update: Options) => setOptions(previous => ({
    ...previous,
    [table.id]: { ...previous[table.id], ...update }
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-8">
      <section role="dialog" aria-modal="true" aria-label="导入前确认"
        className="flex max-h-[90dvh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold">导入前确认</h3>
          <p className="mt-1 break-all text-sm text-slate-500">{table.fileName} · 已识别 {total} 条设备</p>
        </div>
        <div className="space-y-3 overflow-auto p-4">
          {tables.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {tables.map((entry, tableIndex) => (
                <button key={entry.id} type="button" aria-pressed={index === tableIndex} onClick={() => setIndex(tableIndex)}
                  className={'rounded-lg border px-3 py-2 text-sm ' + (index === tableIndex ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'border-slate-300 dark:border-slate-700')}>
                  {entry.title} · {drafts[tableIndex].items.length} 条
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(table.id)} disabled={saving} onChange={event => {
                const checked = event.target.checked;
                setSelected(previous => {
                  const next = new Set(previous);
                  if (checked) next.add(table.id);
                  else next.delete(table.id);
                  return next;
                });
              }} /> 导入此表
            </label>
            <button type="button" className="text-emerald-700 underline dark:text-emerald-300"
              onClick={() => setShowOptions(visible => !visible)} aria-expanded={showOptions}>调整识别</button>
          </div>
          {!current.items.length && <p className="text-sm text-amber-700 dark:text-amber-300">这一表没有识别到设备。可以选择表头和设备名称列，或直接勾选设备行。</p>}
          {showOptions && (
            <div className="flex flex-wrap gap-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <label>表头行 <select className="max-w-56 rounded border bg-white p-1 dark:bg-slate-900" value={chosenHeaderRow}
                onChange={event => updateOptions({ headerIndex: Number(event.target.value), nameColumn: chosenNameColumn })}>
                {table.rows.map((row, rowIndex) => <option key={rowIndex} value={rowIndex}>第 {rowIndex + 1} 行 {row.cells.find(cell => cell.text.trim())?.text.slice(0, 28)}</option>)}
              </select></label>
              <label>设备名称列 <select className="max-w-56 rounded border bg-white p-1 dark:bg-slate-900" value={chosenNameColumn}
                onChange={event => updateOptions({ headerIndex: chosenHeaderRow, nameColumn: Number(event.target.value) })}>
                {Array.from({ length: table.columnCount }, (_, column) => (
                  <option key={column} value={column}>第 {column + 1} 列 {table.rows[chosenHeaderRow]?.cells.find(cell => cell.column === column)?.text.slice(0, 20)}</option>
                ))}
              </select></label>
            </div>
          )}
          <ProductionSheet table={current.table} items={itemMap} actionHeaders={['设备明细', '实际生产规格']}
            renderActions={() => null} renderPreviewRow={(rowIndex, item?: ProductionUnit) => (
              <>
                <td className="min-w-28 border border-slate-200 border-l-2 border-l-emerald-400 px-3 py-2 dark:border-slate-700">
                  {table.rows[rowIndex].cells.some(cell => cell.text.trim()) && (
                    <label className="flex items-center gap-2 whitespace-nowrap text-xs">
                      <input type="checkbox" checked={Boolean(item)} disabled={saving} onChange={event =>
                        updateOptions({ include: { ...options[table.id]?.include, [rowIndex]: event.target.checked } })
                      } /> 设备行
                    </label>
                  )}
                </td>
                <td className="min-w-40 border border-slate-200 px-3 py-2 dark:border-slate-700">
                  {item && <input aria-label={item.name + '实际生产规格'} disabled={saving}
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600"
                    value={item.actualProductionSpec ?? item.model ?? ''}
                    onChange={event => updateOptions({
                      actualSpecs: { ...options[table.id]?.actualSpecs, [rowIndex]: event.target.value }
                    })} />}
                </td>
              </>
            )} />
        </div>
        {feedback && <p className="px-5 py-2 text-sm" role="status">{feedback}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">取消</button>
          <button type="button" disabled={saving || !total} onClick={() => void onSave(chosenDrafts)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? '正在保存…' : '导入清单'}
          </button>
        </div>
      </section>
    </div>
  );
}

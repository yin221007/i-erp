import React from 'react';
import type { ProductionSourceTable, ProductionUnit } from '../types';

type Props = {
  table: ProductionSourceTable;
  items: ReadonlyMap<string, ProductionUnit>;
  actionHeaders: readonly string[];
  renderActions: (item: ProductionUnit) => React.ReactNode;
  renderPreviewRow?: (rowIndex: number, item?: ProductionUnit) => React.ReactNode;
};

const cellClass = 'border border-slate-200 px-3 py-2.5 align-top dark:border-slate-700';

export default function ProductionSheet({ table, items, actionHeaders, renderActions, renderPreviewRow }: Props) {
  const occupiedUntil: number[] = [];
  const hasHeaderRow = table.rows.some(row => row.header);
  const renderActionHeaders = () => actionHeaders.map((label, index) => (
    <th key={label} className={cellClass + ' whitespace-nowrap bg-emerald-50 text-left font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' + (index === 0 ? ' border-l-2 border-l-emerald-400' : '')}>{label}</th>
  ));
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" role="region" aria-label={table.title} tabIndex={0}>
      <table className="w-full border-collapse text-sm text-slate-800 dark:text-slate-100">
        <tbody>
          {!hasHeaderRow && (
            <tr>
              <td colSpan={table.columnCount} className={cellClass} />
              {renderActionHeaders()}
            </tr>
          )}
          {table.rows.map((row, index) => {
            const item = row.itemId ? items.get(row.itemId) : undefined;
            const originalCells: React.ReactNode[] = [];
            const addEmptyCells = (start: number, end: number) => {
              for (let column = start; column < end; column += 1) {
                if ((occupiedUntil[column] ?? 0) <= index) {
                  originalCells.push(<td key={column} className={cellClass} />);
                }
              }
            };
            let column = 0;
            for (const cell of row.cells) {
              addEmptyCells(column, cell.column);
              const span = cell.colSpan || 1;
              column = cell.column + span;
              for (let covered = cell.column; covered < column; covered += 1) {
                occupiedUntil[covered] = index + (cell.rowSpan || 1);
              }
              const Tag = row.header ? 'th' : 'td';
              originalCells.push(
                <Tag key={cell.column} colSpan={cell.colSpan} rowSpan={cell.rowSpan}
                  className={cellClass + ' whitespace-pre-wrap text-left [overflow-wrap:anywhere]' +
                    (row.header ? ' bg-slate-100 font-semibold dark:bg-slate-800' : '') +
                    (cell.text.length > 24 ? ' min-w-36 max-w-96' : cell.text ? ' min-w-16' : '')}>
                  {cell.text}
                </Tag>
              );
            }
            addEmptyCells(column, table.columnCount);
            return (
              <tr key={index}>
                {originalCells}
                {row.header ? renderActionHeaders() :
                  renderPreviewRow ? renderPreviewRow(index, item) :
                  item ? renderActions(item) :
                  <td colSpan={actionHeaders.length} className={cellClass + ' border-l-2 border-l-emerald-400 bg-slate-50 dark:bg-slate-900'} />}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

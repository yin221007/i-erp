import type { ProductionSourceTable, ProjectProduction, ProductionUnit } from '../types';

export const productionActionHeaders = ['生产备注', '设备来源', '外协安装', '发货状态'] as const;
export const productionSourcingLabels = { InHouse: '自产', Outsourced: '外协采购' } as const;
export const productionStatusLabels = { Waiting: '待生产', InStock: '已生产 / 已入库', Shipped: '已发货' } as const;

export function legacyProductionTable(items: ProductionUnit[]): ProductionSourceTable {
  const headers = ['编号', '设备名称', '清单规格 / 型号', '实际生产规格', '数量', '生产进度', '批次日期'];
  const cells = (values: string[]) => values.map((text, column) => ({ text, column }));
  return {
    id: 'legacy',
    title: '既有设备',
    fileName: '',
    columnCount: headers.length,
    rows: [
      { header: true, cells: cells(headers) },
      ...items.map(item => ({
        itemId: item.id,
        cells: cells([
          item.serialNumber || '', item.name, item.model || '',
          item.actualProductionSpec ?? item.model ?? '', String(item.quantity),
          productionStatusLabels[item.status], item.batchDate || ''
        ])
      }))
    ]
  };
}

export async function exportProductionWorkbook(record: ProjectProduction, tables: ProductionSourceTable[]) {
  const { utils, writeFileXLSX } = await import('xlsx');
  const workbook = utils.book_new();
  const items = new Map(record.items.map(item => [item.id, item]));
  for (const table of tables) {
    const needsHeader = !table.rows.some(row => row.header);
    const offset = needsHeader ? 1 : 0;
    const rows = table.rows.map(row => {
      const values = Array<string>(table.columnCount).fill('');
      for (const cell of row.cells) values[cell.column] = cell.text;
      if (row.header) return [...values, ...productionActionHeaders];
      const item = row.itemId && items.get(row.itemId);
      if (!item) return values;
      const details = record.itemDetails?.[item.id];
      return [
        ...values,
        item.notes || '',
        details?.sourcing ? productionSourcingLabels[details.sourcing] : '待确认',
        details?.outsourcedInstallation ? '需外协安装' : '',
        item.status === 'Shipped' ? ['已发货', details?.shipmentDate].filter(Boolean).join(' · ') : '未发货'
      ];
    });
    if (needsHeader) rows.unshift([...Array<string>(table.columnCount).fill(''), ...productionActionHeaders]);
    const sheet = utils.aoa_to_sheet(rows);
    sheet['!merges'] = table.rows.flatMap((row, index) => row.cells.flatMap(cell => {
      if ((cell.colSpan || 1) < 2 && (cell.rowSpan || 1) < 2) return [];
      const startRow = index + offset;
      return [{
        s: { r: startRow, c: cell.column },
        e: { r: startRow + (cell.rowSpan || 1) - 1, c: cell.column + (cell.colSpan || 1) - 1 }
      }];
    }));
    const title = table.title.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 27) || '清单';
    utils.book_append_sheet(workbook, sheet, title, true);
  }
  writeFileXLSX(workbook, record.projectName + '_生产清单.xlsx');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { read, utils, write } from 'xlsx';
import { prepareProductionTable, readProductionTables, spreadsheetTable } from '../../lib/production-table-import.js';
import { changeProductionShipment } from '../../lib/production-records.js';

const values = [
  ['项目设备供货清单'],
  ['房间', '编号', '品名', '品牌', '型号', '技术参数', '数量', '备注'],
  ['热加工区'],
  ['主厨房', 7, '蒸饭柜', '品牌甲', 'ZX-24', '380 V\n24 kW', 2, '核对门宽'],
  ['', '003', '工作台', '品牌乙', '', '304 不锈钢', 1, '待确认'],
  ['合计', '', '', '', '', '', 3]
];

function createWorkbook(bookType) {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet(values);
  sheet.B4.z = '000';
  sheet['!merges'] = ['A1:H1', 'A3:H3', 'A4:A5'].map(utils.decode_range);
  utils.book_append_sheet(book, sheet, '供货清单');
  utils.book_append_sheet(book, utils.aoa_to_sheet([['附件说明']]), '备注页');
  return write(book, { type: 'buffer', bookType });
}

for (const type of ['xlsx', 'xls']) {
  test('读取 ' + type + ' 原表结构、文本和工作表顺序', async () => {
    const file = new File([createWorkbook(type)], '设备.' + type);
    const tables = await readProductionTables(file);
    assert.deepEqual(tables.map(table => table.title), ['供货清单', '备注页']);
    const [source] = tables;
    const { table, items } = prepareProductionTable(source);
    assert.deepEqual(table.rows.map(row => row.cells), source.rows.map(row => row.cells));
    assert.equal(table.rows[0].cells[0].colSpan, 8);
    assert.equal(table.rows[2].cells[0].text, '热加工区');
    assert.equal(table.rows[3].cells[0].rowSpan, 2);
    assert.equal(table.rows[3].cells[5].text, '380 V\n24 kW');
    assert.deepEqual(items.map(item => item.serialNumber), ['007', '003']);
    assert.deepEqual(items.map(item => item.name), ['蒸饭柜', '工作台']);
    assert.equal(table.rows[3].itemId, items[0].id);
    assert.equal(table.rows[4].itemId, items[1].id);
    assert.equal(table.rows[5].itemId, undefined);
    assert.equal(items[0].notes, '');
  });
}

test('预览能纠正识别和修改实际规格，保留原表单元格', () => {
  const workbook = read(createWorkbook('xlsx'));
  const source = { ...spreadsheetTable(workbook.Sheets.供货清单, '供货清单', utils), id: 'test' };
  const result = prepareProductionTable(source, {
    include: { 3: false }, actualSpecs: { 4: '1000×600×800' }
  });
  assert.equal(result.table.rows[3].itemId, undefined);
  assert.equal(result.table.rows[3].cells[2].text, '蒸饭柜');
  assert.equal(result.items[0].actualProductionSpec, '1000×600×800');
});

test('发货、补录日期以及取消发货保留已有生产状态和附加字段', () => {
  const record = {
    items: [{ id: '1', name: '工作台', status: 'InStock', batchDate: '2026-10-01' }],
    itemDetails: { '1': { sourcing: 'Outsourced', outsourcedInstallation: true } }
  };
  const first = changeProductionShipment(record, '1', true, '2026-11-06');
  assert.equal(first.items[0].status, 'Shipped');
  assert.equal(first.itemDetails['1'].shipmentDate, '2026-11-06');
  assert.equal(first.items[0].batchDate, '2026-10-01');
  assert.equal(record.items[0].status, 'InStock');
  const corrected = changeProductionShipment(first, '1', true, '2026-11-07');
  assert.equal(corrected.itemDetails['1'].shipmentDate, '2026-11-07');
  const reverted = changeProductionShipment(corrected, '1', false);
  assert.deepEqual(reverted, record);
  assert.throws(() => changeProductionShipment(record, '1', true, '2026-02-30'), /有效的发货日期/);
});

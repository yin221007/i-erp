import { getProductionNameColumn, rowsToProductionUnits } from './production-import.js';

const maxRows = 4000;
const maxColumns = 150;
const maxCells = 60000;

function checkDimensions(rows, columns) {
  if (rows > maxRows || columns > maxColumns || rows * columns > maxCells) {
    throw new Error('表格范围过大，请将清单分成较小的工作表后重试。');
  }
}

export function spreadsheetTable(sheet, title, utils) {
  if (!sheet['!ref']) return null;
  const range = utils.decode_range(sheet['!ref']);
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  checkDimensions(rowCount, columnCount);

  const covered = new Set();
  const merges = new Map();
  const key = (row, column) => row * columnCount + column;
  for (const { s, e } of sheet['!merges'] || []) {
    if (s.r < range.s.r || s.c < range.s.c || e.r > range.e.r || e.c > range.e.c) {
      throw new Error('表格的合并单元格范围无效。');
    }
    const rowSpan = e.r - s.r + 1;
    const colSpan = e.c - s.c + 1;
    merges.set(key(s.r - range.s.r, s.c - range.s.c), { rowSpan, colSpan });
    for (let row = s.r; row <= e.r; row += 1) {
      for (let column = s.c; column <= e.c; column += 1) {
        if (row !== s.r || column !== s.c) covered.add(key(row - range.s.r, column - range.s.c));
      }
    }
  }

  const rows = Array.from({ length: rowCount }, (_, row) => {
    const cells = [];
    for (let column = 0; column < columnCount; column += 1) {
      const coordinate = key(row, column);
      if (covered.has(coordinate)) continue;
      const address = utils.encode_cell({ r: range.s.r + row, c: range.s.c + column });
      const cell = sheet[address];
      cells.push({ column, text: cell?.w ?? String(cell?.v ?? (cell?.f ? '=' + cell.f : '')), ...merges.get(coordinate) });
    }
    return { cells };
  });
  return { title, columnCount, rows };
}

const children = (node, name) => Array.from(node?.children || []).filter(child =>
  child.localName === name && child.namespaceURI === node.namespaceURI
);
const first = (node, name) => children(node, name)[0];
const attribute = (node, name) => node?.getAttributeNS(node.namespaceURI, name);

function wordCellText(cell) {
  // 以段落和软换行为单位保留原文字，格式化文本在界面上作为纯文本显示。
  const paragraphs = Array.from(cell.getElementsByTagNameNS(cell.namespaceURI, 'p'));
  return paragraphs.map(paragraph => {
    const parts = [];
    const walk = node => {
      if (node.namespaceURI === cell.namespaceURI) {
        if (node.localName === 't') { parts.push(node.textContent || ''); return; }
        if (node.localName === 'tab') { parts.push('\t'); return; }
        if (node.localName === 'br' || node.localName === 'cr') { parts.push('\n'); return; }
        if (node.localName === 'p' && node !== paragraph) return;
      }
      Array.from(node.children).forEach(walk);
    };
    walk(paragraph);
    return parts.join('');
  }).join('\n');
}

function wordTable(node, title) {
  const tableRows = children(node, 'tr');
  // Word 可将行放在内容控件中。
  const rowsInOrder = Array.from(node.children).flatMap(child =>
    child.localName === 'sdt' ? children(first(child, 'sdtContent'), 'tr') :
      tableRows.includes(child) ? [child] : []
  );
  let columnCount = children(first(node, 'tblGrid'), 'gridCol').length;
  let verticalMerges = new Map();
  const rows = rowsInOrder.map(row => {
    let column = Number(attribute(first(first(row, 'trPr'), 'gridBefore'), 'val')) || 0;
    if (!Number.isSafeInteger(column) || column < 0 || column > maxColumns) {
      throw new Error('Word 表格包含无效的起始列。');
    }
    const cells = Array.from({ length: column }, (_, index) => ({ column: index, text: '' }));
    const nextMerges = new Map();
    for (const cell of children(row, 'tc')) {
      const props = first(cell, 'tcPr');
      const colSpan = Number(attribute(first(props, 'gridSpan'), 'val')) || 1;
      const merge = first(props, 'vMerge');
      const anchor = verticalMerges.get(column);
      if (!Number.isSafeInteger(colSpan) || colSpan < 1 || column + colSpan > maxColumns) {
        throw new Error('Word 表格包含无效的列范围。');
      }
      if (merge && attribute(merge, 'val') !== 'restart' && anchor?.colSpan === colSpan) {
        anchor.rowSpan += 1;
        nextMerges.set(column, anchor);
      } else {
        const sourceCell = { column, text: wordCellText(cell), colSpan, rowSpan: 1 };
        cells.push(sourceCell);
        if (merge) nextMerges.set(column, sourceCell);
      }
      column += colSpan;
    }
    columnCount = Math.max(columnCount, column);
    verticalMerges = nextMerges;
    return { cells, ...(first(first(row, 'trPr'), 'tblHeader') ? { header: true } : {}) };
  });
  checkDimensions(rows.length, columnCount);
  return { title, columnCount, rows };
}

export function parseWordTables(xml, parser = new DOMParser()) {
  const document = parser.parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (root?.localName !== 'document' || document.getElementsByTagName('parsererror').length) {
    throw new Error('Word 文件的表格内容无法读取。');
  }
  return Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'tbl'))
    .filter(table => {
      for (let parent = table.parentElement; parent; parent = parent.parentElement) {
        if (parent.namespaceURI === root.namespaceURI && parent.localName === 'tbl') return false;
      }
      return true;
    })
    .map((table, index) => wordTable(table, '表格 ' + (index + 1)))
    .filter(table => table.rows.length && table.columnCount);
}

export async function readProductionTables(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('单个导入文件需小于 10 MB。');
  const buffer = await file.arrayBuffer();
  let tables;
  if (/\.docx$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const part = zip.file('word/document.xml');
    if (!part) throw new Error('没有找到 Word 正文表格。');
    tables = parseWordTables(await part.async('string'));
  } else if (/\.(xlsx|xls|csv|txt)$/i.test(file.name)) {
    const { read, utils } = await import('xlsx');
    const workbook = read(buffer, { type: 'array', raw: true, cellHTML: false });
    tables = workbook.SheetNames.map(title => spreadsheetTable(workbook.Sheets[title], title, utils)).filter(Boolean);
  } else {
    throw new Error('请选择 Excel、Word 表格或 CSV 文件。旧版 Word 请另存为 .docx。');
  }
  if (!tables.length) throw new Error('文件中没有可导入的表格。');
  return tables.map(table => ({
    ...table,
    id: globalThis.crypto?.randomUUID?.() || 'table-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    fileName: file.name
  }));
}

function tableTextRows(table) {
  return table.rows.map(row => {
    const columns = Array(table.columnCount).fill('');
    for (const cell of row.cells) columns[cell.column] = cell.text;
    return columns;
  });
}

export function detectProductionHeaders(table) {
  return tableTextRows(table)
    .map((columns, index) => ({ index, nameColumn: getProductionNameColumn(columns) }))
    .filter(header => header.nameColumn >= 0);
}

const isSummary = text => /^(?:合计|总计|小计|汇总|备注)(?:[：:\s（(]|$)/u.test(text.trim());

export function prepareProductionTable(table, { headerIndex, nameColumn, include = {}, actualSpecs = {} } = {}) {
  const textRows = tableTextRows(table);
  const headers = detectProductionHeaders(table);
  const chosen = headerIndex === undefined ? headers[0] : { index: headerIndex, nameColumn };
  const recognizedHeaders = chosen
    ? new Map([[chosen.index, chosen.nameColumn], ...headers.filter(header => header.index > chosen.index)
        .map(header => [header.index, header.nameColumn])])
    : new Map();
  let currentHeader = chosen?.index ?? 0;
  let currentNameColumn = chosen?.nameColumn ?? 0;
  const mergedColumns = new Map();
  const items = [];

  const rows = table.rows.map((row, index) => {
    for (const [column, merge] of mergedColumns) {
      if (merge.end <= index) mergedColumns.delete(column);
    }
    if (recognizedHeaders.has(index)) {
      currentHeader = index;
      currentNameColumn = recognizedHeaders.get(index);
      mergedColumns.clear();
      return { ...row, header: true };
    }
    for (const cell of row.cells) {
      if ((cell.rowSpan || 1) > 1) mergedColumns.set(cell.column, { end: index + cell.rowSpan, text: cell.text });
    }
    const values = textRows[index];
    const text = values[currentNameColumn]?.trim();
    const nonEmptyCells = row.cells.filter(cell => cell.text.trim());
    const firstValue = nonEmptyCells[0]?.text || '';
    const group = nonEmptyCells.length === 1 && (nonEmptyCells[0].colSpan || 1) > 1;
    const device = Boolean(chosen && index > currentHeader && text && !group && !isSummary(firstValue));
    if (!(include[index] ?? device)) return row;
    const name = text || firstValue.trim();
    if (!name) return row;

    // 旧页面仍从 items 读取设备。原表只增加行关联，原始单元格始终留在表格中。
    const headerRow = chosen ? [...textRows[currentHeader]] : Array(table.columnCount).fill('');
    headerRow[currentNameColumn] = '设备名称';
    const itemValues = [...values];
    itemValues[currentNameColumn] = name;
    for (const [column, merge] of mergedColumns) {
      if (!itemValues[column]) itemValues[column] = merge.text;
    }
    const [parsed] = rowsToProductionUnits([headerRow, itemValues], 'Waiting', { statusFromNotes: false });
    const id = table.id + ':' + index;
    const item = {
      ...parsed,
      id,
      name,
      sourceOrder: index,
      model: parsed?.model || '',
      quantity: parsed?.quantity || 1,
      status: parsed?.status || 'Waiting',
      notes: ''
    };
    if (Object.hasOwn(actualSpecs, index)) item.actualProductionSpec = actualSpecs[index];
    items.push(item);
    return { ...row, itemId: id };
  });
  return { table: { ...table, rows }, items };
}

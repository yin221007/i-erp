const normalizeHeader = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '');

const normalizeCell = value => String(value ?? '').trim();

const exactHeaders = values => values.map(normalizeHeader);

const NAME_HEADERS = exactHeaders([
  '设备名称',
  '名称',
  'name',
  '品名',
  '产品名称',
  '货物名称',
  '材料名称',
  '设备/材料名称'
]);
const MODEL_HEADERS = exactHeaders([
  '型号',
  '规格',
  '型号/规格',
  '清单规格/型号',
  '规格型号',
  '生产规格',
  '尺寸规格',
  '规格尺寸',
  '外形尺寸',
  '长宽高',
  '规格/尺寸',
  'model',
  'spec',
  '参数'
]);
const ACTUAL_SPEC_HEADERS = exactHeaders([
  '实际生产规格',
  '实际规格',
  '制作规格',
  '下单规格',
  'actualspec',
  'actualproductionspec'
]);
const DIMENSION_HEADERS = exactHeaders([
  '尺寸',
  '尺寸(mm)',
  '尺寸（mm）',
  '长',
  '宽',
  '高',
  '长度',
  '宽度',
  '高度',
  '深度',
  '直径',
  '口径'
]);
const QUANTITY_HEADERS = exactHeaders(['数量', 'quantity', 'qty', '件数', '台数', '工程量']);
const STATUS_HEADERS = exactHeaders(['状态', 'status', '生产状态']);
const NOTES_HEADERS = exactHeaders(['备注', 'notes', '说明', '技术要求']);
const DATE_HEADERS = exactHeaders(['日期', '批次', 'date', 'batchdate']);
const SERIAL_HEADERS = exactHeaders(['序号', '编号', 'no', '序列']);
const INVALID_NAMES = exactHeaders([
  '序号',
  '编号',
  '名称',
  '设备名称',
  '品名',
  '产品名称',
  '货物名称',
  '材料名称',
  '合计',
  '小计',
  '总计',
  '备注'
]);

const isDimensionHeader = value => {
  const normalized = normalizeHeader(value);
  return DIMENSION_HEADERS.includes(normalized) ||
    /^(?:规格)?尺寸(?:\\|\/|-)?(?:\(.*\)|（.*）)?$/.test(normalized) ||
    /^尺寸.*(?:mm|毫米)/.test(normalized);
};

const getBeijingDateString = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const createImportId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `production-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * 按清单状态文字归一化。明确的发货状态优先，其次为入库/已生产，
 * “待定”及未识别备注均保留为默认状态，避免把“待发”等文字误判为已发货。
 */
export function resolveProductionStatus(rawValue, defaultStatus = 'Waiting') {
  const value = normalizeCell(rawValue);
  if (!value) return defaultStatus;
  if (value === 'Shipped' || /已发货|已发/.test(value)) return 'Shipped';
  if (value === 'InStock' || /已入库|已生产/.test(value)) return 'InStock';
  if (value === 'Waiting' || /待定|待生产/.test(value)) return 'Waiting';
  return defaultStatus;
}

/**
 * 将 CSV/Excel 二维行转换成系统生产记录。
 * 支持标题行在前 12 行内、合并分区标题、规格尺寸别名和备注状态映射。
 */
export function rowsToProductionUnits(rows, defaultStatus = 'Waiting', options = {}) {
  const cleanedRows = rows
    .map(row => row.map(normalizeCell))
    .filter(row => row.some(Boolean));
  if (cleanedRows.length === 0) return [];

  const isNumericCell = value => /^\d+(?:\.\d+)?$/.test(value.replace(/,/g, '').trim());
  const isSerialOnlyCell = value => /^\d+$/.test(value.trim());
  const isLikelyHeaderRow = row => {
    const normalized = row.map(normalizeHeader);
    const hasName = normalized.some(value => NAME_HEADERS.includes(value));
    const hasQuantity = normalized.some(value => QUANTITY_HEADERS.includes(value));
    const hasModel = normalized.some(value => MODEL_HEADERS.includes(value));
    const hasDimension = row.some(isDimensionHeader);
    const hasSerial = normalized.some(value => SERIAL_HEADERS.includes(value));
    return hasName && (hasQuantity || hasModel || hasDimension || hasSerial);
  };

  const headerIndex = cleanedRows.findIndex((row, index) => index < 12 && isLikelyHeaderRow(row));
  const hasHeader = headerIndex >= 0;
  const rawHeaderRow = hasHeader ? cleanedRows[headerIndex] : [];
  const header = rawHeaderRow.map(normalizeHeader);
  const dataRows = hasHeader ? cleanedRows.slice(headerIndex + 1) : cleanedRows;
  const findHeader = (names, fallback) => {
    const index = header.findIndex(value => names.includes(value));
    return index >= 0 ? index : fallback;
  };

  const noHeaderFirstDataRow = dataRows.find(row => row.some(Boolean)) || [];
  const hasLeadingSerialWithoutHeader =
    !hasHeader &&
    isSerialOnlyCell(noHeaderFirstDataRow[0] || '') &&
    Boolean(noHeaderFirstDataRow[1]) &&
    !isNumericCell(noHeaderFirstDataRow[1]);
  const serialIndex = hasHeader ? findHeader(SERIAL_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 0 : -1;
  const nameIndex = findHeader(NAME_HEADERS, hasLeadingSerialWithoutHeader ? 1 : 0);
  const modelIndex = hasHeader ? findHeader(MODEL_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 2 : 1;
  const actualSpecIndex = hasHeader ? findHeader(ACTUAL_SPEC_HEADERS, -1) : -1;
  const quantityIndex = hasHeader ? findHeader(QUANTITY_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 3 : 2;
  const statusIndex = hasHeader ? findHeader(STATUS_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 4 : 3;
  const notesIndex = hasHeader ? findHeader(NOTES_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 5 : 4;
  const dateIndex = hasHeader ? findHeader(DATE_HEADERS, -1) : hasLeadingSerialWithoutHeader ? 6 : 5;
  const dimensionIndices = hasHeader
    ? rawHeaderRow
      .map((value, index) => isDimensionHeader(value) ? index : -1)
      .filter(index =>
        index >= 0 &&
        index !== nameIndex &&
        index !== modelIndex &&
        index !== actualSpecIndex &&
        index !== quantityIndex
      )
    : [];

  const resolveModel = row => {
    const explicitModel = modelIndex >= 0 ? row[modelIndex] || '' : '';
    if (explicitModel) return explicitModel;
    const dimensions = dimensionIndices
      .map(index => {
        const value = row[index] || '';
        if (!value) return '';
        if (dimensionIndices.length === 1) return value;
        const label = rawHeaderRow[index] || '';
        return label ? `${label}${value}` : value;
      })
      .filter(Boolean);
    return dimensions.join(' × ');
  };

  const resolveQuantity = row => {
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

  const fallbackDate = options.defaultDate || getBeijingDateString();
  return dataRows.map((row, sourceOrder) => {
    const nonEmptyCells = row.filter(Boolean);
    if (nonEmptyCells.length === 0) return null;
    if (!hasHeader && nonEmptyCells.length === 1 && /项目|工程|清单|表$/.test(nonEmptyCells[0])) return null;

    const name = row[nameIndex] || '';
    const normalizedName = normalizeHeader(name);
    if (!name || INVALID_NAMES.includes(normalizedName) || isSerialOnlyCell(name)) return null;

    const serialNumber = serialIndex >= 0 ? (row[serialIndex] || '').trim() : '';
    const quantity = resolveQuantity(row);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    const notes = notesIndex >= 0 ? row[notesIndex] || '' : '';
    const rawStatus = statusIndex >= 0 && row[statusIndex]
      ? row[statusIndex]
      : notes;
    const model = resolveModel(row);
    const actualProductionSpec =
      actualSpecIndex >= 0 && row[actualSpecIndex]
        ? row[actualSpecIndex]
        : model;
    return {
      id: createImportId(),
      serialNumber,
      sourceOrder,
      name,
      model,
      actualProductionSpec,
      quantity,
      status: resolveProductionStatus(rawStatus, defaultStatus),
      notes,
      batchDate: dateIndex >= 0 && row[dateIndex] ? row[dateIndex] : fallbackDate
    };
  }).filter(Boolean);
}

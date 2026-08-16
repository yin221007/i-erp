export function normalizeProductionRecord(record) {
  const stableId = record?.id || record?.projectId;
  if (typeof stableId !== 'string' || !stableId.trim()) {
    throw new Error('Production record requires a stable id');
  }

  return {
    ...record,
    id: stableId
  };
}

export function getProductionWriteRequest(existingRecords, nextRecord) {
  const existing = existingRecords.some(record =>
    record?.id === nextRecord.id ||
    (
      typeof record?.projectId === 'string' &&
      record.projectId === nextRecord.projectId
    )
  );

  return existing
    ? { method: 'PUT', id: nextRecord.id }
    : { method: 'POST', id: undefined };
}

const isValidSourceOrder = value =>
  Number.isSafeInteger(value) && value >= 0;

export function sortProductionUnitsBySourceOrder(items) {
  return items
    .map((item, index) => ({
      item,
      index,
      order: isValidSourceOrder(item?.sourceOrder) ? item.sourceOrder : index
    }))
    .sort((left, right) =>
      left.order - right.order ||
      left.index - right.index
    )
    .map(entry => entry.item);
}

export function appendProductionUnitsInSourceOrder(existingItems, newItems) {
  const normalizedExisting = existingItems.map((item, index) => ({
    ...item,
    sourceOrder: isValidSourceOrder(item?.sourceOrder)
      ? item.sourceOrder
      : index
  }));
  const nextSourceOrder = normalizedExisting.reduce(
    (maximum, item) => Math.max(maximum, item.sourceOrder),
    -1
  ) + 1;

  return [
    ...normalizedExisting,
    ...newItems.map((item, index) => ({
      ...item,
      sourceOrder: nextSourceOrder + index,
      actualProductionSpec:
        typeof item.actualProductionSpec === 'string'
          ? item.actualProductionSpec
          : item.model || ''
    }))
  ];
}

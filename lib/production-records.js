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

import type { ProjectProduction } from '../types';

export function normalizeProductionRecord(
  record: Omit<ProjectProduction, 'id'> & { id?: string }
): ProjectProduction;

export function getProductionWriteRequest(
  existingRecords: ProjectProduction[],
  nextRecord: ProjectProduction
): { method: 'POST' | 'PUT'; id?: string };

export function sortProductionUnitsBySourceOrder(
  items: ProjectProduction['items']
): ProjectProduction['items'];

export function appendProductionUnitsInSourceOrder(
  existingItems: ProjectProduction['items'],
  newItems: ProjectProduction['items']
): ProjectProduction['items'];

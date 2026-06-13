import type { ProjectProduction } from '../types';

export function normalizeProductionRecord(
  record: Omit<ProjectProduction, 'id'> & { id?: string }
): ProjectProduction;

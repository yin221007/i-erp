import type { ProductionStatus, ProductionUnit } from '../types';

export function getProductionNameColumn(row: unknown[]): number;

export function resolveProductionStatus(
  rawValue: string,
  defaultStatus?: ProductionStatus
): ProductionStatus;

export function rowsToProductionUnits(
  rows: unknown[][],
  defaultStatus?: ProductionStatus,
  options?: { defaultDate?: string; statusFromNotes?: boolean }
): ProductionUnit[];

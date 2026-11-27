import type { ProductionSourceTable, ProductionUnit } from '../types';

export function readProductionTables(file: File): Promise<ProductionSourceTable[]>;

export function detectProductionHeaders(table: ProductionSourceTable): {
  index: number;
  nameColumn: number;
}[];

export function prepareProductionTable(
  table: ProductionSourceTable,
  options?: {
    headerIndex?: number;
    nameColumn?: number;
    include?: Record<number, boolean>;
    actualSpecs?: Record<number, string>;
  }
): { table: ProductionSourceTable; items: ProductionUnit[] };

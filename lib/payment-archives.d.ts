import type { ArchiveItem, PaymentRecord, Project } from '../types';

export function normalizeProjectText(value?: string): string;
export function resolvePaymentProject(
  payment: PaymentRecord,
  projects: Project[]
): Project | undefined;
export function isInvoiceArchive(archive: ArchiveItem): boolean;
export function getInvoiceArchives(
  payment: PaymentRecord,
  projects: Project[],
  archives: ArchiveItem[]
): ArchiveItem[];

import type { ArchiveItem, ProjectMediaPhase, ProjectMediaType } from '../types';

export interface ProjectMediaAlbum {
  id: string;
  title: string;
  capturedAt: string;
  phase?: ProjectMediaPhase;
  workflowNodeId?: string;
  workflowNodeTitle?: string;
  items: ArchiveItem[];
}

export function getFileExtension(fileName: string): string;
export function getProjectMediaType(fileName: string): ProjectMediaType | null;
export function formatProjectMediaSize(bytes: number): string;
export function getProjectMediaThumbnailUrl(url?: string, width?: number): string;
export function projectMediaTitle(fileName: string): string;
export function sortProjectMedia(items: ArchiveItem[]): ArchiveItem[];
export function groupProjectMediaAlbums(items: ArchiveItem[]): ProjectMediaAlbum[];

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm']);
const THUMBNAIL_WIDTHS = new Set([320, 640, 960]);
const PROTECTED_UPLOAD_PATTERN = /^\/api\/uploads\/[^/?#]+$/;

export function getFileExtension(fileName) {
  const normalized = String(fileName || '').trim();
  const separatorIndex = normalized.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) return '';
  return normalized.slice(separatorIndex + 1).toLowerCase();
}

export function getProjectMediaType(fileName) {
  const extension = getFileExtension(fileName);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

export function formatProjectMediaSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function projectMediaTitle(fileName) {
  const value = String(fileName || '').trim();
  const extension = getFileExtension(value);
  return extension ? value.slice(0, -(extension.length + 1)) : value;
}

export function getProjectMediaThumbnailUrl(url, width = 640) {
  const normalizedUrl = String(url || '').trim();
  if (
    !PROTECTED_UPLOAD_PATTERN.test(normalizedUrl) ||
    !THUMBNAIL_WIDTHS.has(width)
  ) {
    return normalizedUrl;
  }
  return `${normalizedUrl}/thumbnail?width=${width}`;
}

export function sortProjectMedia(items) {
  return [...items].sort((left, right) => {
    const capturedComparison = String(right.capturedAt || '').localeCompare(
      String(left.capturedAt || '')
    );
    if (capturedComparison !== 0) return capturedComparison;
    return String(right.uploadDate || '').localeCompare(String(left.uploadDate || ''));
  });
}

export function groupProjectMediaAlbums(items) {
  const groups = new Map();
  for (const item of sortProjectMedia(items)) {
    const albumId = item.mediaAlbumId || `single-${item.id}`;
    const existing = groups.get(albumId);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(albumId, {
      id: albumId,
      title: item.mediaAlbumTitle || item.title,
      capturedAt: item.capturedAt || String(item.uploadDate || '').slice(0, 10),
      phase: item.mediaPhase,
      workflowNodeId: item.workflowNodeId,
      workflowNodeTitle: item.workflowNodeTitle,
      items: [item]
    });
  }
  return [...groups.values()];
}

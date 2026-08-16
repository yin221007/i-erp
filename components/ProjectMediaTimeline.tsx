import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FolderOpen,
  Images,
  Loader2,
  Play,
  Search,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import {
  ArchiveItem,
  Project,
  PROJECT_MEDIA_PHASES,
  ProjectMediaPhase,
  ProjectMediaType,
  User
} from '../types';
import { API_URL, apiFetch, apiUpload } from '../lib/api';
import {
  formatProjectMediaSize,
  getFileExtension,
  getProjectMediaThumbnailUrl,
  getProjectMediaType,
  groupProjectMediaAlbums,
  projectMediaTitle,
  sortProjectMedia
} from '../lib/project-media.js';

interface ProjectMediaTimelineProps {
  project: Project;
  archives: ArchiveItem[];
  currentUser: User;
  onAddArchive: (archive: ArchiveItem) => boolean | Promise<boolean>;
  onAddArchives?: (archives: ArchiveItem[]) => boolean | Promise<boolean>;
  onDeleteArchive: (id: string) => void;
}

type MediaFilter = 'all' | ProjectMediaType;
type UploadFileState = {
  file: File;
  key: string;
  resumeUploadId?: string;
};

type FileUploadProgress = {
  percent: number;
  speedBytesPerSecond: number;
  remainingSeconds: number | null;
  status: 'waiting' | 'optimizing' | 'uploading' | 'saving' | 'completed' | 'failed';
  uploadedBytes: number;
  totalBytes: number;
  optimizedSize?: number;
  error?: string;
};

type MediaAlbum = {
  id: string;
  title: string;
  capturedAt: string;
  phase?: ProjectMediaPhase;
  workflowNodeId?: string;
  workflowNodeTitle?: string;
  items: ArchiveItem[];
};

const MAX_BATCH_FILES = 30;
const MEDIA_RENDER_BATCH_SIZE = 24;
const UPLOAD_CONCURRENCY = 2;
const DEFAULT_VIDEO_CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 3;

const localToday = () => {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
};

const createRecordId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getDownloadUrl = (url?: string) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}download=1` : '#';

const fallbackToOriginalImage = (
  event: React.SyntheticEvent<HTMLImageElement>,
  originalUrl?: string
) => {
  const image = event.currentTarget;
  if (!originalUrl || image.dataset.originalFallback === 'true') return;
  image.dataset.originalFallback = 'true';
  image.src = originalUrl;
};

const formatUploadSpeed = (bytesPerSecond: number) => (
  bytesPerSecond > 0 ? `${formatProjectMediaSize(bytesPerSecond)}/秒` : '计算中'
);

const formatRemainingTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return '计算中';
  if (seconds < 60) return `约 ${Math.max(1, Math.ceil(seconds))} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
};

const wait = (milliseconds: number) => new Promise(resolve => {
  window.setTimeout(resolve, milliseconds);
});

const optimizeImage = async (file: File) => {
  const extension = getFileExtension(file.name).toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const mimeType = extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, mimeType, mimeType === 'image/png' ? undefined : 0.85);
    });
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, {
      type: mimeType,
      lastModified: file.lastModified
    });
  } catch {
    return file;
  }
};

const phaseShortNames: Record<ProjectMediaPhase, string> = {
  '前期对接 & 设计': '前期设计',
  '生产准备': '生产准备',
  '进场施工': '进场施工',
  '安装调试': '安装调试',
  '验收交付': '验收交付',
  '结算收尾': '结算收尾'
};

const defaultAlbumTitle = (
  capturedAt: string,
  phase: ProjectMediaPhase,
  workflowNodeTitle = ''
) => `${capturedAt} · ${workflowNodeTitle || `${phaseShortNames[phase]}综合记录`}`;

const ProjectMediaTimeline: React.FC<ProjectMediaTimelineProps> = ({
  project,
  archives,
  currentUser,
  onAddArchive,
  onAddArchives,
  onDeleteArchive
}) => {
  const [activePhase, setActivePhase] = useState<'All' | ProjectMediaPhase>('All');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [visibleMediaCount, setVisibleMediaCount] = useState(MEDIA_RENDER_BATCH_SIZE);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFileState[]>([]);
  const [uploadPhase, setUploadPhase] = useState<ProjectMediaPhase>(PROJECT_MEDIA_PHASES[0]);
  const [capturedAt, setCapturedAt] = useState(localToday);
  const [uploadNodeId, setUploadNodeId] = useState('');
  const [uploadAlbumId, setUploadAlbumId] = useState(createRecordId);
  const [existingAlbumId, setExistingAlbumId] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [fileProgress, setFileProgress] = useState<Record<string, FileUploadProgress>>({});
  const [optimizePhotos, setOptimizePhotos] = useState(true);
  const [formError, setFormError] = useState('');
  const [maxFileSize, setMaxFileSize] = useState<number | null>(null);
  const [videoChunkSize, setVideoChunkSize] = useState(DEFAULT_VIDEO_CHUNK_SIZE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canWrite = currentUser.role === 'Admin' ||
    currentUser.isDefaultAdmin === true ||
    currentUser.permission === 'ReadWrite';

  useEffect(() => {
    let active = true;
    void apiFetch(`${API_URL}/upload/config`)
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (active && Number.isFinite(data?.maxFileSize)) {
          setMaxFileSize(Number(data.maxFileSize));
        }
        if (active && Number.isFinite(data?.videoChunkSize)) {
          setVideoChunkSize(Number(data.videoChunkSize));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const mediaArchives = useMemo(
    () => archives.filter(item => item.category === 'Media'),
    [archives]
  );

  const availableNodes = useMemo(
    () => (project.nodes || []).filter(node => node.phase === uploadPhase),
    [project.nodes, uploadPhase]
  );

  const filteredMedia = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('zh-CN');
    return sortProjectMedia(mediaArchives.filter(item => {
      if (activePhase !== 'All' && item.mediaPhase !== activePhase) return false;
      if (mediaFilter !== 'all' && item.mediaType !== mediaFilter) return false;
      if (!query) return true;
      return `${item.title} ${item.mediaAlbumTitle || ''} ${item.workflowNodeTitle || ''} ${item.description || ''} ${item.uploader}`
        .toLocaleLowerCase('zh-CN')
        .includes(query);
    }));
  }, [activePhase, mediaArchives, mediaFilter, searchTerm]);

  const filteredAlbums = useMemo(
    () => groupProjectMediaAlbums(filteredMedia) as MediaAlbum[],
    [filteredMedia]
  );
  const allAlbums = useMemo(
    () => groupProjectMediaAlbums(mediaArchives) as MediaAlbum[],
    [mediaArchives]
  );
  const matchingExistingAlbums = useMemo(
    () => allAlbums.filter(album =>
      album.phase === uploadPhase &&
      album.capturedAt === capturedAt
    ),
    [allAlbums, capturedAt, uploadPhase]
  );
  const activeAlbum = allAlbums.find(album => album.id === activeAlbumId) || null;
  const suggestedAlbumTitle = defaultAlbumTitle(
    capturedAt,
    uploadPhase,
    availableNodes.find(node => node.id === uploadNodeId)?.title
  );

  const visibleAlbums = useMemo(
    () => filteredAlbums.slice(0, visibleMediaCount),
    [filteredAlbums, visibleMediaCount]
  );
  const albumCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const album of filteredAlbums) {
      counts.set(album.capturedAt, (counts.get(album.capturedAt) || 0) + 1);
    }
    return counts;
  }, [filteredAlbums]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, MediaAlbum[]>();
    for (const album of visibleAlbums) {
      groups.set(album.capturedAt, [...(groups.get(album.capturedAt) || []), album]);
    }
    return [...groups.entries()];
  }, [visibleAlbums]);
  const visibleActiveAlbumItems = activeAlbum?.items.slice(0, visibleMediaCount) || [];
  const hasMoreMedia = activeAlbum
    ? activeAlbum.items.length > visibleMediaCount
    : filteredAlbums.length > visibleMediaCount;

  const previewItems = activeAlbum?.items || filteredMedia;
  const previewIndex = previewItems.findIndex(item => item.id === previewId);
  const previewItem = previewIndex >= 0 ? previewItems[previewIndex] : null;

  useEffect(() => {
    if (!previewItem) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewId(null);
      if (event.key === 'ArrowLeft' && previewIndex > 0) {
        setPreviewId(previewItems[previewIndex - 1].id);
      }
      if (event.key === 'ArrowRight' && previewIndex < previewItems.length - 1) {
        setPreviewId(previewItems[previewIndex + 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, previewItem, previewItems]);

  const phaseCounts = useMemo(() => {
    const counts = new Map<ProjectMediaPhase, number>();
    PROJECT_MEDIA_PHASES.forEach(phase => counts.set(phase, 0));
    mediaArchives.forEach(item => {
      if (item.mediaPhase && counts.has(item.mediaPhase)) {
        counts.set(item.mediaPhase, (counts.get(item.mediaPhase) || 0) + 1);
      }
    });
    return counts;
  }, [mediaArchives]);

  const resetUploadForm = () => {
    setUploadFiles([]);
    setUploadPhase(PROJECT_MEDIA_PHASES[0]);
    const today = localToday();
    setCapturedAt(today);
    setUploadNodeId('');
    setUploadAlbumId(createRecordId());
    setExistingAlbumId('');
    setAlbumTitle('');
    setDescription('');
    setUploadProgress('');
    setFileProgress({});
    setOptimizePhotos(true);
    setFormError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUpload = () => {
    resetUploadForm();
    setIsUploadOpen(true);
  };

  const cleanupChunkUpload = async (uploadId?: string) => {
    if (!uploadId) return;
    await apiFetch(`${API_URL}/upload/chunks/${uploadId}`, {
      method: 'DELETE'
    }).catch(() => undefined);
  };

  const discardUploadFiles = (items: UploadFileState[]) => {
    void Promise.all(items.map(item => cleanupChunkUpload(item.resumeUploadId)));
  };

  const closeUpload = () => {
    if (isUploading) return;
    discardUploadFiles(uploadFiles);
    setIsUploadOpen(false);
    resetUploadForm();
  };

  const handleSelectedFiles = (files: FileList | null) => {
    if (!files) return;
    discardUploadFiles(uploadFiles);
    const selected = Array.from(files).slice(0, MAX_BATCH_FILES);
    const rejected: string[] = [];
    const nextFiles: UploadFileState[] = [];
    const seen = new Set<string>();

    for (const file of selected) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      const mediaType = getProjectMediaType(file.name);
      if (!mediaType) {
        rejected.push(`${file.name}（不支持的格式）`);
        continue;
      }
      if (maxFileSize !== null && file.size > maxFileSize) {
        rejected.push(`${file.name}（超过 ${formatProjectMediaSize(maxFileSize)}）`);
        continue;
      }
      if (!seen.has(key)) {
        seen.add(key);
        nextFiles.push({ file, key });
      }
    }

    setUploadFiles(nextFiles);
    setFileProgress(Object.fromEntries(nextFiles.map(item => [
      item.key,
      {
        percent: 0,
        speedBytesPerSecond: 0,
        remainingSeconds: null,
        status: 'waiting',
        uploadedBytes: 0,
        totalBytes: item.file.size
      }
    ])));
    setFormError(
      rejected.length > 0
        ? `以下文件未加入：${rejected.slice(0, 3).join('、')}${rejected.length > 3 ? '等' : ''}`
        : ''
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cleanupUpload = async (filename?: string, cleanupToken?: string) => {
    if (!filename || !cleanupToken) return;
    await apiFetch(`${API_URL}/uploads/${filename}`, {
      method: 'DELETE',
      headers: { 'X-Upload-Cleanup-Token': cleanupToken }
    }).catch(() => undefined);
  };

  const updateFileProgress = (
    key: string,
    update: Partial<FileUploadProgress>
  ) => {
    setFileProgress(previous => ({
      ...previous,
      [key]: {
        ...(previous[key] || {
          percent: 0,
          speedBytesPerSecond: 0,
          remainingSeconds: null,
          status: 'waiting',
          uploadedBytes: 0,
          totalBytes: 0
        }),
        ...update
      }
    }));
  };

  const createProgressReporter = (item: UploadFileState, totalBytes: number) => {
    let startedAt = performance.now();
    let speedBaselineBytes = 0;
    let maximumUploaded = 0;
    return (uploadedBytes: number, resetSpeedBaseline = false) => {
      maximumUploaded = Math.max(maximumUploaded, uploadedBytes);
      if (resetSpeedBaseline) {
        speedBaselineBytes = maximumUploaded;
        startedAt = performance.now();
      }
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.25);
      const speedBytesPerSecond = Math.max(0, maximumUploaded - speedBaselineBytes) /
        elapsedSeconds;
      const remainingBytes = Math.max(0, totalBytes - maximumUploaded);
      updateFileProgress(item.key, {
        status: 'uploading',
        percent: totalBytes > 0
          ? Math.min(100, Math.round((maximumUploaded / totalBytes) * 100))
          : 0,
        speedBytesPerSecond,
        remainingSeconds: speedBytesPerSecond > 0
          ? remainingBytes / speedBytesPerSecond
          : null,
        uploadedBytes: maximumUploaded,
        totalBytes
      });
    };
  };

  const uploadPhoto = async (
    item: UploadFileState,
    file: File,
    reportProgress: (uploadedBytes: number, resetSpeedBaseline?: boolean) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiUpload(`${API_URL}/upload`, {
      body: formData,
      onProgress: loaded => reportProgress(loaded)
    });
    if (!response.ok) {
      throw new Error(
        response.status === 413
          ? '文件超过服务器上传上限'
          : response.data?.error || '文件上传失败'
      );
    }
    reportProgress(file.size);
    return response.data;
  };

  const uploadVideo = async (
    item: UploadFileState,
    file: File,
    reportProgress: (uploadedBytes: number, resetSpeedBaseline?: boolean) => void
  ) => {
    const extension = getFileExtension(file.name).toLowerCase();
    const mimeType = file.type || ({
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm'
    } as Record<string, string>)[extension];
    const initResponse = await apiFetch(`${API_URL}/upload/chunks/init`, {
      method: 'POST',
      json: {
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        ...(item.resumeUploadId ? { uploadId: item.resumeUploadId } : {})
      }
    });
    const initData = await initResponse.json().catch(() => ({}));
    if (!initResponse.ok) {
      throw new Error(initData?.error || '无法创建视频上传任务');
    }

    item.resumeUploadId = initData.uploadId;
    setUploadFiles(previous => previous.map(candidate =>
      candidate.key === item.key
        ? { ...candidate, resumeUploadId: initData.uploadId }
        : candidate
    ));
    if (initData.completedUpload?.url) {
      reportProgress(file.size);
      return initData.completedUpload;
    }

    const chunkSize = Number(initData.chunkSize) || videoChunkSize;
    const chunkCount = Number(initData.chunkCount);
    const uploadedChunks = new Set<number>(
      Array.isArray(initData.uploadedChunks) ? initData.uploadedChunks : []
    );
    let completedBytes = 0;
    for (const index of uploadedChunks) {
      completedBytes += Math.min(chunkSize, file.size - index * chunkSize);
    }
    reportProgress(completedBytes, true);

    for (let index = 0; index < chunkCount; index += 1) {
      if (uploadedChunks.has(index)) continue;
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunk = file.slice(start, end);
      let uploadedInChunk = 0;
      let lastError = '分片上传失败';

      for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt += 1) {
        const response = await apiUpload(
          `${API_URL}/upload/chunks/${initData.uploadId}/${index}`,
          {
            method: 'PUT',
            body: chunk,
            headers: { 'Content-Type': 'application/octet-stream' },
            onProgress: loaded => {
              uploadedInChunk = Math.max(uploadedInChunk, loaded);
              reportProgress(completedBytes + uploadedInChunk);
            }
          }
        ).catch(error => ({
          ok: false,
          status: 0,
          data: { error: error instanceof Error ? error.message : '网络连接中断' }
        }));
        if (response.ok) {
          completedBytes += chunk.size;
          reportProgress(completedBytes);
          lastError = '';
          break;
        }
        lastError = response.data?.error || `分片上传失败（${response.status}）`;
        if (attempt < MAX_CHUNK_ATTEMPTS) {
          await wait(500 * 2 ** (attempt - 1));
        }
      }
      if (lastError) throw new Error(lastError);
    }

    const completeResponse = await apiFetch(
      `${API_URL}/upload/chunks/${initData.uploadId}/complete`,
      { method: 'POST', json: {} }
    );
    const completeData = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) {
      throw new Error(completeData?.error || '视频合并失败');
    }
    reportProgress(file.size);
    return completeData;
  };

  const uploadOneFile = async (item: UploadFileState) => {
    const mediaType = getProjectMediaType(item.file.name);
    if (!mediaType) throw new Error('不支持的文件格式');
    if (maxFileSize !== null && item.file.size > maxFileSize) {
      throw new Error(`超过 ${formatProjectMediaSize(maxFileSize)} 上传上限`);
    }

    let uploadFile = item.file;
    if (mediaType === 'image' && optimizePhotos) {
      updateFileProgress(item.key, { status: 'optimizing' });
      uploadFile = await optimizeImage(item.file);
      updateFileProgress(item.key, {
        optimizedSize: uploadFile.size,
        totalBytes: uploadFile.size
      });
    }
    const reportProgress = createProgressReporter(item, uploadFile.size);
    const uploadData = mediaType === 'video'
      ? await uploadVideo(item, uploadFile, reportProgress)
      : await uploadPhoto(item, uploadFile, reportProgress);

    const now = new Date().toISOString();
    const archive: ArchiveItem = {
      id: createRecordId(),
      title: projectMediaTitle(item.file.name),
      category: 'Media',
      projectName: project.name,
      projectId: project.id,
      fileType: getFileExtension(uploadFile.name).toUpperCase(),
      size: formatProjectMediaSize(uploadFile.size),
      uploadDate: now,
      uploader: currentUser.nickname,
      url: uploadData.url,
      createdAt: now,
      mediaPhase: uploadPhase,
      capturedAt,
      mediaType,
      description: description.trim(),
      mediaAlbumId: uploadAlbumId,
      mediaAlbumTitle: albumTitle.trim(),
      ...(uploadNodeId ? {
        workflowNodeId: uploadNodeId,
        workflowNodeTitle: availableNodes.find(node => node.id === uploadNodeId)?.title
      } : {})
    };
    updateFileProgress(item.key, {
      status: 'saving',
      percent: 100,
      uploadedBytes: uploadFile.size,
      remainingSeconds: 0
    });
    return { archive, uploadData };
  };

  const handleUpload = async () => {
    if (!capturedAt || !albumTitle.trim() || uploadFiles.length === 0) {
      setFormError('请选择工程阶段、拍摄日期，填写文件夹名称并选择至少一个照片或视频文件。');
      return;
    }

    setIsUploading(true);
    setFormError('');
    setUploadProgress(`最多 ${UPLOAD_CONCURRENCY} 个文件并发上传`);
    const failed = new Map<string, UploadFileState>();
    const errors: string[] = [];
    const uploaded: Array<{
      item: UploadFileState;
      archive: ArchiveItem;
      uploadData: { filename?: string; cleanupToken?: string };
    }> = [];
    let savedCount = 0;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < uploadFiles.length) {
        const item = uploadFiles[nextIndex];
        nextIndex += 1;
        try {
          const result = await uploadOneFile(item);
          uploaded.push({ item, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : '上传失败';
          failed.set(item.key, item);
          errors.push(`${item.file.name}：${message}`);
          updateFileProgress(item.key, { status: 'failed', error: message });
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, uploadFiles.length) },
        () => worker()
      )
    );

    if (uploaded.length > 0) {
      setUploadProgress(`正在批量保存 ${uploaded.length} 条影像档案记录`);
      const archivesToSave = uploaded.map(result => result.archive);
      const saved = onAddArchives
        ? await onAddArchives(archivesToSave)
        : (await Promise.all(archivesToSave.map(onAddArchive))).every(Boolean);
      if (!saved) {
        await Promise.all(uploaded.map(result =>
          cleanupUpload(result.uploadData.filename, result.uploadData.cleanupToken)
        ));
        for (const result of uploaded) {
          failed.set(result.item.key, result.item);
          updateFileProgress(result.item.key, {
            status: 'failed',
            error: '影像档案批量保存失败'
          });
        }
        errors.push('影像档案批量保存失败，已清理本批上传文件');
      } else {
        savedCount = uploaded.length;
        for (const result of uploaded) {
          updateFileProgress(result.item.key, { status: 'completed' });
        }
      }
    }

    setIsUploading(false);
    setUploadProgress('');
    if (failed.size === 0) {
      setIsUploadOpen(false);
      resetUploadForm();
      return;
    }

    const failedFiles = uploadFiles.filter(item => failed.has(item.key));
    setUploadFiles(failedFiles);
    setFormError(
      `${savedCount > 0 ? `已保存 ${savedCount} 个，` : ''}失败 ${failedFiles.length} 个：` +
      `${errors.slice(0, 2).join('；')}${errors.length > 2 ? '；其余请重试' : ''}`
    );
  };

  const movePreview = (direction: -1 | 1) => {
    const nextIndex = previewIndex + direction;
    if (nextIndex >= 0 && nextIndex < previewItems.length) {
      setPreviewId(previewItems[nextIndex].id);
    }
  };

  const renderMediaCard = (item: ArchiveItem) => (
    <article
      key={item.id}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
    >
      <button
        type="button"
        onClick={() => setPreviewId(item.id)}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-900 text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-primary-500"
        aria-label={`预览 ${item.title}`}
      >
        {item.mediaType === 'video' ? (
          <>
            <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-950 to-black text-slate-500">
              <Video className="h-14 w-14" />
            </span>
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-slate-950/65 text-white shadow-xl backdrop-blur-sm">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </span>
          </>
        ) : (
          <img
            src={getProjectMediaThumbnailUrl(item.url, 640)}
            alt={item.title}
            loading="lazy"
            decoding="async"
            onError={event => fallbackToOriginalImage(event, item.url)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-slate-950/70 px-2 py-1 text-[9px] font-black text-white backdrop-blur-sm">
          {item.mediaType === 'video' ? '视频' : '照片'}
        </span>
      </button>
      <div className="p-3">
        <h5 className="truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</h5>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">
          {item.description || '未填写现场说明'}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
          <span className="truncate text-[9px] font-black text-slate-400">
            {item.uploader} · {item.size}
          </span>
          <div className="flex items-center gap-1">
            <a
              href={getDownloadUrl(item.url)}
              download
              onClick={event => event.stopPropagation()}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-primary-900/30"
              aria-label={`下载 ${item.title}`}
            >
              <Download className="h-4 w-4" />
            </a>
            {(currentUser.role === 'Admin' || item.uploader === currentUser.nickname) && (
              <button
                type="button"
                onClick={() => onDeleteArchive(item.id)}
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 dark:hover:bg-red-950/30"
                aria-label={`删除 ${item.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );

  return (
    <section aria-label="工程全过程影像" className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="flex flex-col gap-5 border-b border-white/10 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary-300">
              <Images className="h-4 w-4" />
              六阶段影像胶片
            </div>
            <h3 className="text-xl font-black md:text-2xl">全过程照片与视频</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              按拍摄日期倒序留存，当前共 {mediaArchives.length} 条记录
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={openUpload}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary-950/40 transition hover:bg-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-400/30 active:scale-[0.98]"
            >
              <Camera className="h-5 w-5" />
              上传现场影像
            </button>
          )}
        </div>

        <div className="overflow-x-auto px-3 py-4 md:px-5">
          <div className="flex min-w-max items-stretch gap-2">
            <button
              type="button"
              onClick={() => {
                setActivePhase('All');
                setActiveAlbumId(null);
                setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
              }}
              className={`min-w-24 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-primary-400/30 ${
                activePhase === 'All'
                  ? 'border-primary-400 bg-primary-600 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <span className="block text-[9px] font-black uppercase tracking-widest opacity-70">总览</span>
              <span className="mt-1 block text-sm font-black">全部阶段</span>
              <span className="mt-2 block text-[10px] font-bold opacity-70">{mediaArchives.length} 条</span>
            </button>
            {PROJECT_MEDIA_PHASES.map((phase, index) => (
              <button
                key={phase}
                type="button"
                onClick={() => {
                  setActivePhase(phase);
                  setActiveAlbumId(null);
                  setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
                }}
                className={`group min-w-32 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-primary-400/30 ${
                  activePhase === phase
                    ? 'border-primary-400 bg-primary-600 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-black tracking-widest opacity-70">
                    0{index + 1}
                  </span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-black">
                    {phaseCounts.get(phase) || 0}
                  </span>
                </span>
                <span className="mt-2 block text-sm font-black">{phaseShortNames[phase]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => {
              setSearchTerm(event.target.value);
              setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
            }}
            placeholder="搜索标题、说明或上传人"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
          {([
            ['all', '全部', Images],
            ['image', '照片', FileImage],
            ['video', '视频', Video]
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMediaFilter(id);
                setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
              }}
              className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                mediaFilter === id
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeAlbum ? (
        <section aria-labelledby="active-media-album-title" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveAlbumId(null);
                  setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:text-slate-300"
                aria-label="返回影像文件夹列表"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary-600">
                  <FolderOpen className="h-3.5 w-3.5" />
                  影像文件夹
                </div>
                <h4 id="active-media-album-title" className="truncate text-lg font-black text-slate-900 dark:text-white">
                  {activeAlbum.title}
                </h4>
                <p className="mt-1 truncate text-[11px] font-bold text-slate-500">
                  {activeAlbum.phase || '未分阶段'} · {activeAlbum.capturedAt}
                  {activeAlbum.workflowNodeTitle ? ` · ${activeAlbum.workflowNodeTitle}` : ' · 阶段综合记录'}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-500 dark:bg-slate-900">
              {activeAlbum.items.length} 个文件
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {visibleActiveAlbumItems.map(renderMediaCard)}
          </div>
        </section>
      ) : dateGroups.length > 0 ? (
        <div className="space-y-8">
          {dateGroups.map(([date, albums]) => (
            <section key={date} aria-labelledby={`media-date-${date}`}>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-primary-600">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h4 id={`media-date-${date}`} className="text-sm font-black text-slate-900 dark:text-white">
                    {date}
                  </h4>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    当日 {albumCountsByDate.get(date) || albums.length} 个影像文件夹
                  </p>
                </div>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {albums.map(album => {
                  const cover = album.items.find(item => item.mediaType === 'image') || album.items[0];
                  const photoCount = album.items.filter(item => item.mediaType === 'image').length;
                  const videoCount = album.items.length - photoCount;
                  return (
                    <button
                      key={album.id}
                      type="button"
                      onClick={() => {
                        setActiveAlbumId(album.id);
                        setVisibleMediaCount(MEDIA_RENDER_BATCH_SIZE);
                      }}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800"
                      aria-label={`打开影像文件夹 ${album.title}`}
                    >
                      <span className="relative block aspect-[4/3] overflow-hidden bg-slate-900">
                        {cover?.mediaType === 'video' ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-950 to-black text-slate-500">
                            <Video className="h-14 w-14" />
                          </span>
                        ) : (
                          <img
                            src={getProjectMediaThumbnailUrl(cover?.url, 640)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={event => fallbackToOriginalImage(event, cover?.url)}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        )}
                        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/90 to-transparent" />
                        <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[9px] font-black text-white backdrop-blur-sm">
                          <FolderOpen className="h-3.5 w-3.5" />
                          {album.items.length} 个文件
                        </span>
                        <span className="absolute right-2 top-2 rounded-lg bg-primary-600 px-2 py-1 text-[9px] font-black text-white shadow">
                          {album.phase ? phaseShortNames[album.phase] : '未分阶段'}
                        </span>
                      </span>
                      <span className="block p-3">
                        <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{album.title}</span>
                        <span className="mt-1 block truncate text-[10px] font-bold text-slate-500">
                          {album.workflowNodeTitle || '阶段综合记录'}
                        </span>
                        <span className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-[9px] font-black text-slate-400 dark:border-slate-700">
                          <span>{photoCount} 张照片</span>
                          <span>{videoCount} 个视频</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-900">
            <Camera className="h-8 w-8" />
          </div>
          <h4 className="text-lg font-black text-slate-900 dark:text-white">
            {mediaArchives.length === 0 ? '还没有工程影像' : '没有符合条件的影像'}
          </h4>
          <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
            {mediaArchives.length === 0
              ? '上传第一批现场照片或视频，并选择工程阶段和拍摄日期。'
              : '请调整阶段、类型或搜索条件后再查看。'}
          </p>
          {canWrite && mediaArchives.length === 0 && (
            <button
              type="button"
              onClick={openUpload}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20"
            >
              <Upload className="h-4 w-4" />
              上传第一批影像
            </button>
          )}
        </div>
      )}

      {hasMoreMedia && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleMediaCount(count => count + MEDIA_RENDER_BATCH_SIZE)}
            className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-6 text-sm font-black text-slate-600 transition hover:border-primary-300 hover:text-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            再加载 {Math.min(
              MEDIA_RENDER_BATCH_SIZE,
              (activeAlbum?.items.length || filteredAlbums.length) - visibleMediaCount
            )} 项
          </button>
        </div>
      )}

      {isUploadOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-media-upload-title"
            className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-5 dark:border-slate-700 md:px-7">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-600">工程已锁定</p>
                <h3 id="project-media-upload-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                  上传全过程影像
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">{project.name}</p>
              </div>
              <button
                type="button"
                onClick={closeUpload}
                disabled={isUploading}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-white"
                aria-label="关闭上传窗口"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 md:px-7">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                    工程阶段 <span className="text-red-500">*</span>
                  </span>
                  <select
                    value={uploadPhase}
                    onChange={event => {
                      const phase = event.target.value as ProjectMediaPhase;
                      setUploadPhase(phase);
                      setUploadNodeId('');
                      setExistingAlbumId('');
                      setUploadAlbumId(createRecordId());
                      setAlbumTitle('');
                    }}
                    disabled={isUploading}
                    className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {PROJECT_MEDIA_PHASES.map((phase, index) => (
                      <option key={phase} value={phase}>{index + 1}. {phase}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                    拍摄日期 <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="date"
                    value={capturedAt}
                    onChange={event => {
                      const date = event.target.value;
                      setCapturedAt(date);
                      setExistingAlbumId('');
                      setUploadAlbumId(createRecordId());
                      setAlbumTitle('');
                    }}
                    disabled={isUploading}
                    className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                  保存到影像文件夹
                </span>
                <select
                  value={existingAlbumId}
                  onChange={event => {
                    const selectedId = event.target.value;
                    setExistingAlbumId(selectedId);
                    if (!selectedId) {
                      setUploadAlbumId(createRecordId());
                      setAlbumTitle('');
                      return;
                    }
                    const selectedAlbum = matchingExistingAlbums.find(album => album.id === selectedId);
                    if (!selectedAlbum) return;
                    setUploadAlbumId(selectedAlbum.id);
                    setUploadNodeId(selectedAlbum.workflowNodeId || '');
                    setAlbumTitle(selectedAlbum.title);
                  }}
                  disabled={isUploading}
                  className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">新建影像文件夹（自定义命名）</option>
                  {matchingExistingAlbums.map(album => (
                    <option key={album.id} value={album.id}>
                      追加到：{album.title}（现有 {album.items.length} 项）
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] font-bold text-slate-400">
                  新建时请在下方自定义名称；这里只显示当前阶段、当前拍摄日期下已有的文件夹
                </span>
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                    关联任务节点
                  </span>
                  <select
                    value={uploadNodeId}
                    onChange={event => {
                      const nodeId = event.target.value;
                      setUploadNodeId(nodeId);
                    }}
                    disabled={isUploading || Boolean(existingAlbumId)}
                    className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">阶段综合记录（不关联节点）</option>
                    {availableNodes.map(node => (
                      <option key={node.id} value={node.id}>{node.title}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                    自定义文件夹名称 <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="text"
                    value={albumTitle}
                    onChange={event => {
                      setAlbumTitle(event.target.value);
                    }}
                    maxLength={200}
                    disabled={isUploading || Boolean(existingAlbumId)}
                    placeholder={`建议：${suggestedAlbumTitle}`}
                    className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">本批记录说明</span>
                <textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  maxLength={2000}
                  disabled={isUploading}
                  rows={3}
                  placeholder="例如：烟罩安装完成，风管接口等待复核"
                  className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3 dark:border-primary-900 dark:bg-primary-950/20">
                <input
                  type="checkbox"
                  checked={optimizePhotos}
                  onChange={event => setOptimizePhotos(event.target.checked)}
                  disabled={isUploading}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
                />
                <span>
                  <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
                    优化照片（推荐）
                  </span>
                  <span className="mt-1 block text-[10px] font-bold leading-4 text-slate-500 dark:text-slate-400">
                    长边压缩至最多 2560px，JPG/WEBP 质量约 85%；取消勾选可上传原图，GIF 保持原文件。
                  </span>
                </span>
              </label>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex min-h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 text-center transition hover:border-primary-400 hover:bg-primary-50/50 focus:outline-none focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-primary-500 dark:hover:bg-primary-950/20"
                >
                  <Upload className="h-8 w-8 text-primary-600" />
                  <span className="mt-3 text-sm font-black text-slate-800 dark:text-white">选择照片或视频</span>
                  <span className="mt-1 text-[11px] font-bold text-slate-500">
                    JPG、PNG、GIF、WEBP、MP4、MOV、WEBM；最多 {MAX_BATCH_FILES} 个
                  </span>
                  <span className="mt-1 text-[10px] font-bold text-slate-400">
                    {maxFileSize !== null
                      ? `单文件不超过 ${formatProjectMediaSize(maxFileSize)}`
                      : '单文件大小以服务器限制为准'}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={event => handleSelectedFiles(event.target.files)}
                />
              </div>

              {uploadFiles.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                      已选择 {uploadFiles.length} 个文件
                    </span>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => {
                          discardUploadFiles(uploadFiles);
                          setUploadFiles([]);
                          setFileProgress({});
                        }}
                        className="text-[10px] font-black text-slate-400 hover:text-red-600"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {uploadFiles.map(item => {
                      const progress = fileProgress[item.key];
                      return (
                        <div key={item.key} className="rounded-lg bg-white px-3 py-2 text-xs dark:bg-slate-800">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-bold text-slate-700 dark:text-slate-200">{item.file.name}</span>
                            <span className="shrink-0 font-black text-slate-400">
                              {progress?.optimizedSize && progress.optimizedSize < item.file.size
                                ? `${formatProjectMediaSize(item.file.size)} → ${formatProjectMediaSize(progress.optimizedSize)}`
                                : formatProjectMediaSize(item.file.size)}
                            </span>
                          </div>
                          {progress && progress.status !== 'waiting' && (
                            <div className="mt-2">
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                <div
                                  className={`h-full rounded-full transition-[width] ${
                                    progress.status === 'failed'
                                      ? 'bg-red-500'
                                      : progress.status === 'completed'
                                        ? 'bg-emerald-500'
                                        : 'bg-primary-500'
                                  }`}
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[9px] font-black">
                                <span className={
                                  progress.status === 'failed'
                                    ? 'text-red-600 dark:text-red-300'
                                    : 'text-primary-600 dark:text-primary-300'
                                }>
                                  {progress.status === 'optimizing'
                                    ? '正在优化照片'
                                    : progress.status === 'saving'
                                      ? '上传完成，等待保存档案'
                                      : progress.status === 'completed'
                                        ? '已完成'
                                        : progress.status === 'failed'
                                          ? progress.error || '上传失败'
                                          : `${progress.percent}%`}
                                </span>
                                {progress.status === 'uploading' && (
                                  <span className="text-slate-400">
                                    {formatUploadSpeed(progress.speedBytesPerSecond)} · 剩余 {formatRemainingTime(progress.remainingSeconds)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {formError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {uploadProgress && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-2.5 text-xs font-black text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="truncate">{uploadProgress}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900 md:px-7">
              <button
                type="button"
                onClick={closeUpload}
                disabled={isUploading}
                className="min-h-10 rounded-xl px-5 text-sm font-black text-slate-500 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-40 dark:hover:bg-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading || uploadFiles.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary-600 px-6 text-sm font-black text-white transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? '正在保存' : `保存 ${uploadFiles.length || ''} 个影像`}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/95 p-2 backdrop-blur-md md:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${previewItem.title} 影像预览`}
            className="relative flex h-full max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl md:rounded-3xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white md:px-6">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black md:text-lg">{previewItem.title}</h3>
                <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
                  {previewItem.mediaPhase} · {previewItem.capturedAt} · {previewItem.uploader}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getDownloadUrl(previewItem.url)}
                  download
                  className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  aria-label="下载当前影像"
                >
                  <Download className="h-5 w-5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewId(null)}
                  className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  aria-label="关闭预览"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
              {previewItem.mediaType === 'video' ? (
                <video
                  key={previewItem.id}
                  src={previewItem.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-full max-w-full"
                >
                  当前浏览器无法播放该视频，请下载后查看。
                </video>
              ) : (
                <img
                  src={previewItem.url}
                  alt={previewItem.title}
                  decoding="async"
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {previewIndex > 0 && (
                <button
                  type="button"
                  onClick={() => movePreview(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 p-3 text-white backdrop-blur-sm transition hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 md:left-5"
                  aria-label="查看上一项"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {previewIndex < previewItems.length - 1 && (
                <button
                  type="button"
                  onClick={() => movePreview(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 p-3 text-white backdrop-blur-sm transition hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 md:right-5"
                  aria-label="查看下一项"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>

            {previewItem.description && (
              <div className="border-t border-white/10 px-4 py-3 text-xs font-medium leading-5 text-slate-300 md:px-6">
                {previewItem.description}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ProjectMediaTimeline;

import React, { useState, useRef, useMemo } from 'react';
import { ArchiveItem, ArchiveCategory, Project, User } from '../types';
import { Search, FileText, FileCode, FileSpreadsheet, FileImage, FileVideo, Paperclip, FolderOpen, Eye, Download, X, Upload, Save, File as FileIcon, Trash2, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, ArrowLeft, Pencil } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { API_URL, apiFetch } from '../lib/api';

const PdfPreview = React.lazy(() => import('./PdfPreview'));

interface EngineeringArchivesProps {
  archives: ArchiveItem[];
  projects: Project[];
  onAddArchive: (archive: ArchiveItem) => boolean | Promise<boolean>;
  onDeleteArchive: (id: string) => void;
  onRenameArchive: (id: string, title: string) => Promise<ArchiveItem | null>;
  currentUser: User;
}

type SortField = 'none' | 'project' | 'category' | 'date';
type SortDirection = 'asc' | 'desc';

const getDownloadUrl = (url?: string, archiveId?: string) => {
  if (!url) return '#';
  const separator = url.includes('?') ? '&' : '?';
  const archiveParameter = archiveId
    ? `&archiveId=${encodeURIComponent(archiveId)}`
    : '';
  return `${url}${separator}download=1${archiveParameter}`;
};

const getArchiveExtension = (item: ArchiveItem) =>
  item.fileType ? `.${item.fileType.toLowerCase()}` : '';

const getArchiveBaseTitle = (item: ArchiveItem) => {
  const extension = getArchiveExtension(item);
  if (extension && item.title.toLowerCase().endsWith(extension)) {
    return item.title.slice(0, -extension.length);
  }
  return item.title;
};

const escapeCsvCell = (value: unknown) => {
  const text = String(value ?? '');
  const formulaSafeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${formulaSafeText.replace(/"/g, '""')}"`;
};

const EngineeringArchives: React.FC<EngineeringArchivesProps> = ({ archives, projects, onAddArchive, onDeleteArchive, onRenameArchive, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<ArchiveCategory | 'All'>('All');
  const [activeProjectId, setActiveProjectId] = useState<string>('All');
  const [previewItem, setPreviewItem] = useState<ArchiveItem | null>(null);
  const [renameItem, setRenameItem] = useState<ArchiveItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadData, setUploadData] = useState<{
      title: string;
      category: ArchiveCategory;
      projectId: string;
      file: File | null;
  }>({
      title: '',
      category: 'Drawing',
      projectId: '',
      file: null
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const regularArchives = useMemo(
    () => archives.filter(item => item.category !== 'Media'),
    [archives]
  );

  // 全过程照片与视频只在工程详情的专用影像时间线中展示。
  const categories: { id: ArchiveCategory | 'All'; label: string }[] = [
    { id: 'All', label: '全部工程资料' },
    { id: 'Drawing', label: '设计图纸' },
    { id: 'Contract', label: '合同文书' },
    { id: 'List', label: '设备清单' },
    { id: 'ContactForm', label: '联系单/变更' },
    { id: 'Inspection', label: '报验资料' },
    { id: 'Acceptance', label: '验收证明' },
    { id: 'SignOff', label: '设备签收' },
    { id: 'Settlement', label: '内部结算' },
    { id: 'AuditMaterial', label: '审计资料' },
    { id: 'Audit', label: '审定证明' },
    { id: 'Invoice', label: '财务发票' },
    { id: 'WinningNotice', label: '中标通知书' },
    { id: 'Training', label: '培训记录' },
    { id: 'Other', label: '其他附件' },
  ];

  const getCategoryLabel = (cat: ArchiveCategory) => categories.find(c => c.id === cat)?.label || cat;

  const filteredArchives = useMemo(() => {
    return regularArchives.filter(item =>
      (activeCategory === 'All' || item.category === activeCategory) &&
      (activeProjectId === 'All' || item.projectId === activeProjectId || item.projectName === activeProjectId || item.projectName === projects.find(project => project.id === activeProjectId)?.name) &&
      (item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (item.mediaAlbumTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
       (item.workflowNodeTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [regularArchives, activeCategory, activeProjectId, projects, searchTerm]);

  const sortedArchives = useMemo(() => {
    if (sortField === 'none') return filteredArchives;
    return [...filteredArchives].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'project': comparison = a.projectName.localeCompare(b.projectName, 'zh-CN'); break;
        case 'category': comparison = getCategoryLabel(a.category).localeCompare(getCategoryLabel(b.category), 'zh-CN'); break;
        case 'date': comparison = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime(); break;
        default: return 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredArchives, sortField, sortDirection]);

  const archiveProjectGroups = useMemo(() => {
    const baseArchives = regularArchives.filter(item =>
      (activeCategory === 'All' || item.category === activeCategory) &&
      (item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (item.mediaAlbumTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
       (item.workflowNodeTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const groups = new Map<string, { id: string; name: string; count: number; latest: string; categories: Set<ArchiveCategory> }>();
    baseArchives.forEach(item => {
      const projectId = item.projectId || projects.find(project => project.name === item.projectName)?.id || item.projectName;
      const current = groups.get(projectId) || { id: projectId, name: item.projectName || '未关联项目', count: 0, latest: item.uploadDate, categories: new Set<ArchiveCategory>() };
      current.count += 1;
      current.latest = new Date(item.uploadDate).getTime() > new Date(current.latest).getTime() ? item.uploadDate : current.latest;
      current.categories.add(item.category);
      groups.set(projectId, current);
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [regularArchives, activeCategory, projects, searchTerm]);

  const selectedProjectLabel = activeProjectId === 'All' ? '' : projects.find(project => project.id === activeProjectId)?.name || activeProjectId;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection(field === 'date' ? 'desc' : 'asc'); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-20 ml-1.5" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1.5 text-primary-600" /> : <ArrowDown className="w-3 h-3 ml-1.5 text-primary-600" />;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'PDF': return <FileText className="w-5 h-5 text-red-500" />;
      case 'XLSX': return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
      case 'DWG': return <FileCode className="w-5 h-5 text-primary-600" />;
      case 'JPG': case 'JPEG': case 'PNG': case 'GIF': case 'WEBP': return <FileImage className="w-5 h-5 text-purple-500" />;
      case 'MP4': case 'MOV': case 'WEBM': return <FileVideo className="w-5 h-5 text-cyan-600" />;
      default: return <Paperclip className="w-5 h-5 text-slate-400" />;
    }
  };

  const getCategoryBadgeStyle = (cat: ArchiveCategory) => {
    switch (cat) {
      case 'Drawing': return 'bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-800';
      case 'Contract': return 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30';
      case 'Invoice': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'SignOff': return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30';
      case 'AuditMaterial': return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30';
      default: return 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  const handleUploadSave = async () => {
      if (!uploadData.title || !uploadData.projectId || !uploadData.file) return alert("请填写完整归档信息");
      setIsUploading(true);
      let uploadedFile: { filename: string; cleanupToken: string } | null = null;
      try {
        const ext = uploadData.file.name.split('.').pop()?.toUpperCase() || 'FILE';
        const sizeStr = (uploadData.file.size / 1024).toFixed(1) + ' KB';
        const project = projects.find(p => p.id === uploadData.projectId);
        const formData = new FormData(); formData.append('file', uploadData.file);
        const uploadRes = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();
        uploadedFile = {
          filename: fileData.filename,
          cleanupToken: fileData.cleanupToken
        };
        const newArchive: ArchiveItem = { 
            id: Math.random().toString(36).substr(2, 9), 
            title: uploadData.title, 
            category: uploadData.category, 
            projectName: project?.name || 'Unknown', 
            projectId: project?.id, 
            fileType: ext as any, 
            size: sizeStr, 
            uploadDate: new Date().toISOString(), 
            uploader: currentUser.nickname, 
            url: fileData.url,
            createdAt: new Date().toISOString()
        };
        const saved = await onAddArchive(newArchive);
        if (!saved) throw new Error('Archive metadata save failed');
        setIsUploadModalOpen(false);
        setUploadData({ title: '', category: 'Drawing', projectId: '', file: null });
      } catch (error) {
        if (uploadedFile?.filename && uploadedFile.cleanupToken) {
          await apiFetch(`${API_URL}/uploads/${uploadedFile.filename}`, {
            method: 'DELETE',
            headers: { 'X-Upload-Cleanup-Token': uploadedFile.cleanupToken }
          }).catch(() => undefined);
        }
        alert("服务器同步异常，档案未保存");
      } finally { setIsUploading(false); }
  };

  const openRenameModal = (item: ArchiveItem) => {
      setRenameItem(item);
      setRenameTitle(getArchiveBaseTitle(item));
      setRenameError('');
  };

  const closeRenameModal = () => {
      if (isRenaming) return;
      setRenameItem(null);
      setRenameTitle('');
      setRenameError('');
  };

  const handleRenameSave = async () => {
      if (!renameItem || isRenaming) return;
      const title = renameTitle.trim();
      if (!title) {
        setRenameError('请输入文件名称');
        return;
      }
      if (title.length > 200) {
        setRenameError('文件名称不能超过 200 个字符');
        return;
      }
      if (/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(title) || /[. ]$/.test(title)) {
        setRenameError('文件名称包含无效字符，且不能以点或空格结尾');
        return;
      }
      setIsRenaming(true);
      setRenameError('');
      const saved = await onRenameArchive(renameItem.id, title);
      setIsRenaming(false);
      if (!saved) {
        setRenameError('修改失败，请检查权限或稍后重试');
        return;
      }
      if (previewItem?.id === saved.id) setPreviewItem(saved);
      setRenameItem(null);
      setRenameTitle('');
  };

  const handleExportCSV = () => {
      if (regularArchives.length === 0) return alert("无可导出的记录");
      const headers = ['名称', '关联项目', '资料分类', '格式', '容量', '归档人', '日期'];
      const rows = regularArchives.map(archive => [
        archive.title,
        archive.projectName,
        getCategoryLabel(archive.category),
        archive.fileType,
        archive.size,
        archive.uploader,
        archive.uploadDate.split('T')[0]
      ].map(escapeCsvCell).join(','));
      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `工程档案总台账_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  return (
    <div className="max-w-7xl mx-auto transition-all">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
           <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors tracking-tight">工程档案检索</h2>
           <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium transition-colors">全生命周期过程文件云端存储与多维检索库</p>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="快速搜索文件名、项目名称..." 
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <select
                value={activeProjectId}
                onChange={(e) => setActiveProjectId(e.target.value)}
                className="w-full md:w-64 px-4 py-2.5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-black text-xs"
                title="按工程项目快速筛选"
            >
                <option value="All">全部工程项目</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button onClick={handleExportCSV} className="p-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-400 transition-all shadow-sm active:scale-95" title="导出台账数据">
                <Download className="w-5 h-5" />
            </button>
            <button onClick={() => setIsUploadModalOpen(true)} className="bg-primary-600 text-white px-6 py-2.5 rounded-2xl hover:bg-primary-700 flex items-center gap-2 shadow-xl shadow-primary-500/20 whitespace-nowrap font-black transition-all active:scale-95 border-2 border-primary-500 hover:border-white/20">
                <Upload className="w-5 h-5" />
                <span>立即归档</span>
            </button>
        </div>
      </div>

      <div className="bg-slate-100/80 dark:bg-slate-900/50 p-4 rounded-[2.5rem] shadow-inner mb-10 transition-all border-2 border-white/50 dark:border-slate-800">
        <div className="flex items-center space-x-3 overflow-x-auto py-4 -mt-4 custom-scrollbar">
          {categories.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => setActiveCategory(cat.id)} 
              className={`
                px-7 py-3.5 text-[11px] font-black uppercase tracking-widest rounded-[1.5rem] border-2 transition-all flex-shrink-0 active:scale-95 relative group
                ${activeCategory === cat.id 
                  ? 'bg-primary-600 text-white border-primary-600 shadow-2xl shadow-primary-500/40 -translate-y-1.5' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent shadow-sm hover:shadow-lg hover:border-primary-200 hover:text-primary-600 dark:hover:bg-slate-700 hover:-translate-y-1'
                }
              `}
            >
              {cat.label}
              {activeCategory === cat.id && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-lg animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
        {activeProjectId === 'All' ? (
          <div className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">按工程项目归档</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">先选择工程，再查看该工程下的合同、图纸、发票、验收等资料。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-900">{archiveProjectGroups.length} 个工程</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {archiveProjectGroups.map(group => (
                <button key={group.id} onClick={() => setActiveProjectId(group.id)} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-600">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-3 inline-flex rounded-2xl bg-white p-3 text-primary-600 shadow-sm dark:bg-slate-800"><FolderOpen className="h-5 w-5" /></div>
                      <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{group.name}</h4>
                      <p className="mt-2 text-xs font-bold text-slate-500">{group.count} 份资料 · {group.categories.size} 类 · 最近 {group.latest.split('T')[0]}</p>
                    </div>
                    <ArrowUp className="h-4 w-4 rotate-45 text-slate-300" />
                  </div>
                </button>
              ))}
            </div>
            {archiveProjectGroups.length === 0 && <div className="p-24 text-center text-slate-300 transition-all"><FolderOpen className="w-20 h-20 mx-auto mb-5 opacity-20" /><p className="font-black text-sm tracking-widest">未检索到匹配的工程档案</p></div>}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
              <div>
                <button onClick={() => setActiveProjectId('All')} className="mb-2 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-primary-600"><ArrowLeft className="h-4 w-4" /> 返回项目文件夹</button>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{selectedProjectLabel}</h3>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500 shadow-sm dark:bg-slate-800">{sortedArchives.length} 份资料</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-4 p-6 border-b border-slate-50 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-all">
                <div className="col-span-5 pl-4">文件主档名称</div>
                <div className="col-span-3 cursor-pointer hover:text-primary-600 flex items-center transition-colors" onClick={() => handleSort('project')}>关联业务项目 {renderSortIcon('project')}</div>
                <div className="col-span-2 cursor-pointer hover:text-primary-600 flex items-center transition-colors" onClick={() => handleSort('category')}>资料类别 {renderSortIcon('category')}</div>
                <div className="col-span-2 text-center">快捷管理</div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700 transition-all">
                {sortedArchives.map(item => (
                    <div key={item.id} className="flex flex-col md:grid md:grid-cols-12 gap-4 p-6 items-center hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all group">
                        <div className="col-span-12 md:col-span-5 flex items-center gap-4 w-full pl-2">
                            <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-2xl border border-slate-100 dark:border-slate-600 shadow-sm transition-transform group-hover:scale-110">{getFileIcon(item.fileType)}</div>
                            <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-black text-slate-800 dark:text-white truncate group-hover:text-primary-600 transition-colors">
                                  {item.title}
                                </h4>
                                <p className="md:hidden text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter truncate">{item.projectName}</p>
                            </div>
                        </div>
                        <div className="hidden md:block col-span-3 text-xs font-bold text-slate-500 dark:text-slate-400 truncate px-2 transition-colors">{item.projectName}</div>
                        <div className="col-span-12 md:col-span-2 flex items-center px-2">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border transition-all ${getCategoryBadgeStyle(item.category)}`}>{getCategoryLabel(item.category)}</span>
                        </div>
                        <div className="col-span-12 md:col-span-2 flex items-center justify-end md:justify-center gap-2 w-full transition-all">
                            <button onClick={() => setPreviewItem(item)} className="p-2 text-slate-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all active:scale-90"><Eye className="w-5 h-5" /></button>
                            <a href={getDownloadUrl(item.url, item.id)} download className="p-2 text-slate-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all active:scale-90" title="下载文件"><Download className="w-5 h-5" /></a>
                            {(currentUser.isDefaultAdmin === true || item.uploader === currentUser.nickname) && <button onClick={(event) => { event.stopPropagation(); openRenameModal(item); }} className="p-2 text-slate-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all active:scale-90" title="修改文件名称" aria-label={`修改 ${item.title} 的文件名称`}><Pencil className="w-5 h-5" /></button>}
                            {(currentUser.role === 'Admin' || item.uploader === currentUser.nickname) && <button onClick={(e) => { e.stopPropagation(); onDeleteArchive(item.id); }} className="p-2 text-slate-100 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"><Trash2 className="w-5 h-5" /></button>}
                        </div>
                    </div>
                ))}
            </div>
            {sortedArchives.length === 0 && <div className="p-40 text-center text-slate-200 transition-all"><FolderOpen className="w-24 h-24 mx-auto mb-6 opacity-5" /><p className="font-black text-lg uppercase tracking-widest">该工程暂无匹配资料</p></div>}
          </>
        )}
      </div>

      {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 transition-all">
              <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 transition-all">
                  <div className="flex justify-between items-center mb-10 border-b dark:border-slate-700 pb-6 transition-all"><h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 transition-colors"><Upload className="w-6 h-6 text-primary-600" /> 归档新资料</h3><button onClick={() => setIsUploadModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-7 h-7 text-slate-50" /></button></div>
                  <div className="space-y-6">
                      <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-[2rem] p-10 flex flex-col items-center justify-center cursor-pointer hover:border-primary-50/50 dark:hover:bg-primary-900/20 transition-all group bg-slate-50 dark:bg-slate-900/50 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                          {uploadData.file ? (<div className="flex items-center gap-3 text-primary-600 font-black animate-in fade-in transition-all"><FileIcon className="w-10 h-10" /><span className="truncate max-w-[200px] text-sm">{uploadData.file.name}</span></div>) : (<><Upload className="w-12 h-12 text-slate-300 group-hover:text-primary-50 transition-transform group-hover:scale-110" /><p className="text-xs font-black text-slate-400 mt-4 uppercase tracking-[0.2em]">点击上传文件</p></>)}
                          <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) setUploadData(prev=>({...prev, file:f, title:prev.title||f.name.split('.')[0]})); }} />
                      </div>
                      <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">文件档案名称 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3.5 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.title} onChange={e => setUploadData({...uploadData, title: e.target.value})} placeholder="输入存档正式显示名称" /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">资料类别</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3.5 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.category} onChange={e => setUploadData({...uploadData, category: e.target.value as any})}>{categories.filter(c => c.id !== 'All' && c.id !== 'Media').map(c => (<option key={c.id} value={c.id}>{c.label}</option>))}</select></div>
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">关联业务工程</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3.5 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.projectId} onChange={e => setUploadData({...uploadData, projectId: e.target.value})}><option value="">选择项目...</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
                      </div>
                  </div>
                  <div className="flex justify-end gap-4 mt-12 pt-6 border-t dark:border-slate-700 transition-all">
                      <button onClick={() => setIsUploadModalOpen(false)} className="px-8 py-3 text-slate-400 font-black uppercase tracking-widest transition-colors" disabled={isUploading}>取消</button>
                      <button onClick={handleUploadSave} disabled={isUploading} className="px-12 py-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 transition-all font-black active:scale-95 uppercase tracking-widest">{isUploading ? '正在极速同步' : '确认归档'}</button>
                  </div>
              </div>
          </div>
      )}

      {renameItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 transition-all">
              <div className="w-full max-w-md rounded-[2.5rem] bg-white p-9 shadow-2xl animate-in zoom-in-95 dark:bg-slate-800">
                  <div className="mb-8 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-slate-700">
                      <div>
                          <h3 className="text-xl font-black text-slate-900 dark:text-white">修改文件名称</h3>
                          <p className="mt-1 text-xs font-bold text-slate-400">仅修改主体名，扩展名保持不变</p>
                      </div>
                      <button onClick={closeRenameModal} disabled={isRenaming} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="关闭文件重命名窗口"><X className="h-6 w-6" /></button>
                  </div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">文件名称</label>
                  <div className="flex overflow-hidden rounded-2xl border-2 border-slate-100 bg-white shadow-inner focus-within:border-primary-500 dark:border-slate-700 dark:bg-slate-900">
                      <input autoFocus maxLength={200} value={renameTitle} onChange={event => { setRenameTitle(event.target.value); setRenameError(''); }} onKeyDown={event => { if (event.key === 'Enter') void handleRenameSave(); }} disabled={isRenaming} className="min-w-0 flex-1 bg-transparent px-5 py-3.5 font-black text-slate-900 outline-none dark:text-white" placeholder="输入新的文件主体名称" />
                      <span className="flex items-center border-l border-slate-100 bg-slate-50 px-4 text-sm font-black text-slate-500 dark:border-slate-700 dark:bg-slate-800">{getArchiveExtension(renameItem) || '原格式'}</span>
                  </div>
                  {renameError && <p className="mt-3 text-xs font-bold text-red-500" role="alert">{renameError}</p>}
                  <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-700">
                      <button onClick={closeRenameModal} disabled={isRenaming} className="px-6 py-3 text-sm font-black text-slate-400">取消</button>
                      <button onClick={() => void handleRenameSave()} disabled={isRenaming} className="rounded-2xl bg-primary-600 px-8 py-3 text-sm font-black text-white shadow-xl shadow-primary-500/20 transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">{isRenaming ? '正在保存' : '保存名称'}</button>
                  </div>
              </div>
          </div>
      )}

      {previewItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-2 transition-all sm:p-4">
              <div className="bg-white dark:bg-slate-800 w-full max-w-6xl h-[92vh] rounded-[2rem] sm:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 transition-all">
                  <div className="px-4 py-3 sm:px-8 sm:py-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center gap-3 bg-slate-50 dark:bg-slate-800 transition-colors">
                      <div className="flex min-w-0 items-center gap-3 sm:gap-5 transition-all"><div className="hidden p-3 bg-white dark:bg-slate-700 rounded-2xl border-2 border-slate-100 dark:border-slate-600 shadow-sm transition-all sm:block">{getFileIcon(previewItem.fileType)}</div><h3 className="min-w-0 truncate text-base font-black text-slate-800 transition-colors dark:text-white sm:text-xl">{previewItem.title}</h3></div>
                      <div className="flex items-center gap-4 transition-all">
                          <a href={getDownloadUrl(previewItem.url, previewItem.id)} download className="flex items-center gap-2 rounded-2xl bg-primary-600 p-3 text-sm font-black text-white shadow-2xl shadow-primary-500/20 transition-all hover:bg-primary-700 sm:px-6"><Download className="h-5 w-5" /><span className="hidden sm:inline">立即下载</span></a>
                          <button onClick={() => setPreviewItem(null)} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 sm:p-3" aria-label="关闭档案预览"><X className="h-6 w-6 sm:h-7 sm:w-7" /></button>
                      </div>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-2 transition-all dark:bg-slate-900 sm:p-8">
                      {previewItem.url ? (
                          previewItem.fileType === 'PDF' ? (<React.Suspense fallback={<div className="text-sm font-black text-slate-500">正在启动 PDF 查看器…</div>}><PdfPreview src={previewItem.url} title={previewItem.title} /></React.Suspense>) :
                          ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(previewItem.fileType) ? (<img src={previewItem.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-3xl animate-in fade-in transition-all" />) :
                          ['MP4', 'MOV', 'WEBM'].includes(previewItem.fileType) ? (<video src={previewItem.url} controls playsInline preload="metadata" className="max-w-full max-h-full rounded-3xl bg-black shadow-2xl">当前浏览器无法播放该视频，请下载后查看。</video>) :
                          (<div className="text-center p-20 transition-all"><div className="bg-white dark:bg-slate-800 w-40 h-40 rounded-[3rem] shadow-2xl flex items-center justify-center mx-auto mb-8 transition-all transform rotate-3"><Paperclip className="w-16 h-16 text-slate-200" /></div><p className="text-slate-800 dark:text-white font-black text-2xl transition-colors uppercase tracking-widest">格式暂不支持在线预览</p><p className="text-slate-400 mt-4 font-bold text-sm">请点击右上方按钮下载后在本地查看</p></div>)
                      ) : (<div className="text-center p-20 transition-all"><AlertCircle className="w-20 h-20 mx-auto text-slate-200 dark:text-slate-700 mb-6 transition-colors" /><p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.4em]">当前档案预览失效</p></div>)}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default EngineeringArchives;

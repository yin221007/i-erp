
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DocItem, User } from '../types';
import { Search, FileText, Download, Eye, BookOpen, Plus, X, Upload, Save, File as FileIcon, Trash2, AlertCircle, Filter, Edit3, Globe, Layers, CheckCircle2, Link as LinkIcon, FileCode } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { API_URL, apiFetch } from '../lib/api';

interface DocumentationProps {
  docs: DocItem[];
  onAddDoc: (doc: DocItem) => void;
  onUpdateDoc?: (doc: DocItem) => void;
  onDeleteDoc: (docId: string) => void;
  currentUser: User;
}

const Documentation: React.FC<DocumentationProps> = ({ docs, onAddDoc, onUpdateDoc, onDeleteDoc, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false); 
  
  // 在线 Wiki 编辑状态
  const [isEditingWiki, setIsEditingWiki] = useState(false);
  const [wikiContent, setWikiContent] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');

  const [uploadData, setUploadData] = useState<{
      title: string;
      category: DocItem['category'];
      file: File | null;
      type: 'FILE' | 'WIKI' | 'URL';
      externalUrl: string;
  }>({
      title: '',
      category: 'Standard',
      file: null,
      type: 'FILE',
      externalUrl: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (isUploadModalOpen && activeCategory !== 'All') {
          setUploadData(prev => ({ ...prev, category: activeCategory as DocItem['category'] }));
      }
  }, [isUploadModalOpen, activeCategory]);

  const categories = [
      { id: 'All', label: '全部文档' },
      { id: 'Standard', label: '技术标准' },
      { id: 'Regulation', label: '法律法规' },
      { id: 'Manual', label: '操作手册' },
      { id: 'Template', label: '表格模板' },
      { id: 'Experience', label: '经验总结' }
  ];

  const getCategoryLabel = (cat: string) => {
      return categories.find(c => c.id === cat)?.label || cat;
  };

  const filteredDocs = useMemo(() => {
      return docs.filter(doc => 
        (activeCategory === 'All' || doc.category === activeCategory) &&
        doc.title.toLowerCase().includes(searchTerm.toLowerCase())
      ).sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [docs, activeCategory, searchTerm]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setUploadData(prev => ({ ...prev, file: file, title: prev.title || file.name.split('.')[0] }));
      }
  };

  const handleUploadSave = async () => {
      if (uploadData.type === 'FILE') {
        if (!uploadData.title || !uploadData.file) return alert("请填写完整信息并选择文件");
        setIsUploading(true);
        try {
          const extension = uploadData.file.name.split('.').pop()?.toUpperCase() || 'FILE';
          const sizeInKB = (uploadData.file.size / 1024).toFixed(1);
          const sizeStr = Number(sizeInKB) > 1024 ? `${(Number(sizeInKB) / 1024).toFixed(1)} MB` : `${sizeInKB} KB`;
          
          const formData = new FormData();
          formData.append('file', uploadData.file);
          
          const uploadRes = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
          if (!uploadRes.ok) throw new Error('Upload failed');
          const fileData = await uploadRes.json();
          
          const newDoc: DocItem = { 
            id: Math.random().toString(36).substr(2, 9), 
            title: uploadData.title, 
            category: uploadData.category, 
            fileType: extension, 
            size: sizeStr, 
            updatedAt: new Date().toISOString(), 
            url: fileData.url 
          };
          
          onAddDoc(newDoc);
          setIsUploadModalOpen(false);
          setUploadData({ title: '', category: 'Standard', file: null, type: 'FILE', externalUrl: '' });
        } catch (error) { 
          alert("同步至服务器失败，请重试"); 
        } finally { 
          setIsUploading(false); 
        }
      } else if (uploadData.type === 'WIKI') {
        if (!uploadData.title) return alert("请填写 Wiki 标题");
        const newDoc: DocItem = { 
            id: Math.random().toString(36).substr(2, 9), 
            title: uploadData.title, 
            category: uploadData.category, 
            fileType: 'WIKI', 
            size: '0 KB', 
            updatedAt: new Date().toISOString(),
            content: '# ' + uploadData.title + '\n在此开始编写内容...'
        };
        onAddDoc(newDoc);
        setIsUploadModalOpen(false);
        setUploadData({ title: '', category: 'Standard', file: null, type: 'FILE', externalUrl: '' });
      } else if (uploadData.type === 'URL') {
          if (!uploadData.title || !uploadData.externalUrl) return alert("请填写完整标题和外部链接地址");
          const newDoc: DocItem = {
              id: Math.random().toString(36).substr(2, 9),
              title: uploadData.title,
              category: uploadData.category,
              fileType: 'LINK',
              size: '-',
              updatedAt: new Date().toISOString(),
              url: uploadData.externalUrl
          };
          onAddDoc(newDoc);
          setIsUploadModalOpen(false);
          setUploadData({ title: '', category: 'Standard', file: null, type: 'FILE', externalUrl: '' });
      }
  };

  const handleWikiSave = () => {
      if (!previewDoc || !onUpdateDoc) return;
      const updated: DocItem = {
          ...previewDoc,
          title: wikiTitle,
          content: wikiContent,
          updatedAt: new Date().toISOString(),
          size: `${(new Blob([wikiContent]).size / 1024).toFixed(1)} KB`
      };
      onUpdateDoc(updated);
      setPreviewDoc(updated);
      setIsEditingWiki(false);
  };

  const handleDelete = (e: React.MouseEvent, docId: string, title: string) => {
      e.preventDefault(); e.stopPropagation();
      if (currentUser.role !== 'Admin') return;
      if (window.confirm(`确定要删除知识项 "${title}" 吗？该操作不可撤销。`)) onDeleteDoc(docId);
  };

  const handleExportCSV = () => {
      if (docs.length === 0) return alert("无可导出的知识项");
      const headers = ['标题', '分类', '文件类型', '容量', '更新日期'];
      const rows = docs.map(d => [
          `"${d.title.replace(/"/g, '""')}"`,
          `"${getCategoryLabel(d.category)}"`,
          `"${d.fileType}"`,
          `"${d.size}"`,
          `"${formatBeijingTime(d.updatedAt).split(' ')[0]}"`
      ].join(','));

      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `知识中心_数据清单_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  const getFileIcon = (type: string) => {
    const t = type.toUpperCase();
    if (t === 'WIKI') return <Edit3 className="w-6 h-6 text-orange-500" />;
    if (t === 'LINK') return <Globe className="w-6 h-6 text-blue-500" />;
    if (t === 'HTML') return <FileCode className="w-6 h-6 text-emerald-500" />;
    if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(t)) return <FileText className="w-6 h-6 text-purple-500" />;
    if (t === 'PDF') return <FileText className="w-6 h-6 text-red-500" />;
    if (['XLS', 'XLSX', 'CSV'].includes(t)) return <FileText className="w-6 h-6 text-emerald-600" />;
    if (['DOC', 'DOCX'].includes(t)) return <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />;
    return <FileText className="w-6 h-6 text-slate-500" />;
  };

  const getCategoryColor = (cat: string) => {
      switch(cat) {
          case 'Standard': return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300';
          case 'Regulation': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
          case 'Manual': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
          case 'Template': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
          case 'Experience': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
          default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
      }
  };

  return (
    <div className="max-w-7xl mx-auto transition-all">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
           <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white transition-colors tracking-tight">知识中心看板</h2>
           <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm md:text-base font-medium transition-colors">支持本地 HTML 网页存档、Wiki 协作及工程标准检索</p>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                type="text" 
                placeholder="检索标准、Wiki或网页内容..." 
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-sm shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleExportCSV} className="p-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl hover:bg-primary-50 hover:border-primary-500 text-slate-500 dark:text-slate-400 transition-all shadow-sm" title="导出清单">
                <Download className="w-5 h-5" />
            </button>
            {(currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite') && (
                <>
                    <button 
                        onClick={() => { setUploadData({...uploadData, type: 'URL'}); setIsUploadModalOpen(true); }}
                        className="bg-white dark:bg-slate-800 text-blue-600 border-2 border-blue-100 dark:border-blue-900/50 px-6 py-2.5 rounded-2xl hover:bg-blue-50 transition-all font-black flex items-center gap-2 active:scale-95 shadow-sm"
                        title="通过网址导入外部参考"
                    >
                        <LinkIcon className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs uppercase tracking-widest">导入URL</span>
                    </button>
                    <button 
                        onClick={() => { setUploadData({...uploadData, type: 'WIKI'}); setIsUploadModalOpen(true); }}
                        className="bg-white dark:bg-slate-800 text-orange-600 border-2 border-orange-100 dark:border-orange-900/50 px-6 py-2.5 rounded-2xl hover:bg-orange-50 transition-all font-black flex items-center gap-2 active:scale-95 shadow-sm"
                    >
                        <Edit3 className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs uppercase tracking-widest">新建Wiki</span>
                    </button>
                    <button 
                        onClick={() => { setUploadData({...uploadData, type: 'FILE'}); setIsUploadModalOpen(true); }}
                        className="bg-primary-600 text-white px-6 py-2.5 rounded-2xl hover:bg-primary-700 flex items-center gap-2 shadow-xl shadow-primary-500/20 whitespace-nowrap font-black transition-all active:scale-95 border-2 border-primary-500 hover:border-white/20"
                    >
                        <Upload className="w-4 h-4" />
                        <span className="text-xs uppercase tracking-widest">归档本地文件</span>
                    </button>
                </>
            )}
        </div>
      </div>

      {/* 分类过滤器 - 带视觉修正 */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto py-4 -mt-4 no-scrollbar transition-all">
         {categories.map(cat => (
           <button
             key={cat.id}
             onClick={() => setActiveCategory(cat.id)}
             className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all transform active:scale-95 border-2 shadow-sm ${
               activeCategory === cat.id 
               ? 'bg-primary-600 text-white border-primary-600 shadow-2xl shadow-primary-500/30 translate-y-[-4px]' 
               : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:bg-primary-100 dark:hover:bg-primary-800 hover:border-primary-500 hover:text-primary-700 dark:hover:text-primary-100 hover:shadow-lg'
             }`}
           >
             {cat.label}
           </button>
         ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
        <div className="hidden md:grid grid-cols-12 gap-4 p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-colors">
            <div className="col-span-6 pl-4">知识项名称 / 类型标识</div>
            <div className="col-span-2">所属分类</div>
            <div className="col-span-2 text-right">占用容量</div>
            <div className="col-span-2 text-center">快捷操作</div>
        </div>
        
        <div className="divide-y divide-slate-100 dark:divide-slate-700 transition-all p-2 space-y-1">
            {filteredDocs.map(doc => (
                <div key={doc.id} className="flex flex-col md:grid md:grid-cols-12 gap-4 p-5 items-center hover:bg-primary-50 dark:hover:bg-primary-900/40 border-2 border-transparent hover:border-primary-500 hover:shadow-xl rounded-[2rem] transition-all group active:scale-[0.99] cursor-pointer" onClick={() => { setPreviewDoc(doc); if(doc.fileType === 'WIKI') { setWikiContent(doc.content || ''); setWikiTitle(doc.title); setIsEditingWiki(false); } }}>
                    <div className="col-span-12 md:col-span-6 flex items-center gap-5 w-full">
                        <div className="p-4 rounded-2xl border-2 border-slate-50 dark:border-slate-600 bg-white dark:bg-slate-700 flex-shrink-0 shadow-sm transition-all group-hover:scale-110 group-hover:shadow-md group-hover:border-primary-100">
                            {getFileIcon(doc.fileType)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-base font-black text-slate-800 dark:text-white group-hover:text-primary-600 transition-colors truncate">{doc.title}</h4>
                            <div className="flex items-center gap-3 mt-2 text-[10px] font-black text-slate-400 dark:text-slate-500 transition-colors">
                                <span className={`px-2 py-0.5 rounded-full uppercase tracking-tighter ${getCategoryColor(doc.category)} group-hover:shadow-sm shadow-inner`}>{getCategoryLabel(doc.category)}</span>
                                <span className="opacity-30">|</span>
                                <span className="uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                    {doc.fileType === 'WIKI' ? '在线 Wiki 协作' : 
                                     doc.fileType === 'LINK' ? '外部 Web 链接' :
                                     doc.fileType === 'HTML' ? '本地 HTML 归档' :
                                     `${doc.fileType} 标准文档`}
                                </span>
                                <span className="md:hidden">· {doc.size}</span>
                            </div>
                        </div>
                    </div>
                    <div className="hidden md:block md:col-span-2"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter transition-all ${getCategoryColor(doc.category)}`}>{getCategoryLabel(doc.category)}</span></div>
                    <div className="hidden md:block md:col-span-2 text-right text-xs font-mono font-bold text-slate-600 dark:text-slate-400 transition-colors">{doc.size}</div>
                    <div className="col-span-12 md:col-span-2 flex items-center justify-end md:justify-center gap-3 w-full border-t md:border-t-0 border-slate-100 dark:border-slate-700 pt-4 md:pt-0 transition-colors" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setPreviewDoc(doc); if(doc.fileType === 'WIKI') { setWikiContent(doc.content || ''); setWikiTitle(doc.title); setIsEditingWiki(false); } }} className="p-2.5 hover:bg-white dark:hover:bg-slate-600 rounded-xl text-slate-400 hover:text-primary-600 transition-all shadow-sm active:scale-90" title="查阅内容"><Eye className="w-5 h-5" /></button>
                        {doc.fileType !== 'WIKI' && doc.fileType !== 'LINK' && (
                            <a href={doc.url || '#'} download={doc.title} target="_blank" rel="noreferrer" onClick={(e) => !doc.url && e.preventDefault()} className={`p-2.5 rounded-xl transition-all shadow-sm ${doc.url ? 'hover:bg-white dark:hover:bg-slate-600 text-primary-600 dark:text-primary-400' : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'}`} title={doc.url ? "立即下载存档" : "文件失效"}><Download className="w-5 h-5" /></a>
                        )}
                        {doc.fileType === 'LINK' && (
                            <a href={doc.url} target="_blank" rel="noreferrer" className="p-2.5 hover:bg-white dark:hover:bg-slate-600 rounded-xl text-blue-500 transition-all shadow-sm active:scale-90" title="在外部浏览器打开"><Globe className="w-5 h-5" /></a>
                        )}
                        {currentUser.role === 'Admin' && (<button onClick={(e) => handleDelete(e, doc.id, doc.title)} className="p-2.5 hover:bg-white dark:hover:bg-slate-600 rounded-xl text-slate-200 hover:text-red-500 transition-all shadow-sm active:scale-90" title="删除知识项"><Trash2 className="w-5 h-5" /></button>)}
                    </div>
                </div>
            ))}
        </div>

        {filteredDocs.length === 0 && (
            <div className="p-32 text-center text-slate-300 flex flex-col items-center transition-all animate-in fade-in duration-500">
                <BookOpen className="w-20 h-20 mb-6 opacity-5" />
                <p className="font-black text-lg uppercase tracking-widest">知识中心库空空如也</p>
                <p className="text-sm font-bold mt-2 opacity-50">请尝试切换分类或通过上方按钮归档第一份资料</p>
            </div>
        )}
      </div>

      {/* 上传归档模态框 */}
      {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 transition-all">
              <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 transition-all border border-white/20">
                  <div className="flex justify-between items-center mb-8 border-b dark:border-slate-700 pb-6 transition-all">
                      <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 transition-colors">
                          {uploadData.type === 'WIKI' ? <Edit3 className="w-6 h-6 text-orange-600" /> : 
                           uploadData.type === 'URL' ? <LinkIcon className="w-6 h-6 text-blue-600" /> : 
                           <Upload className="w-6 h-6 text-primary-600" />} 
                          {uploadData.type === 'WIKI' ? '创建 Wiki 在线文档' : 
                           uploadData.type === 'URL' ? '导入 Web 参考链接' : 
                           '归档本地标准/网页'}
                      </h3>
                      <button onClick={() => setIsUploadModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"><X className="w-6 h-6 text-slate-500" /></button>
                  </div>
                  
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl mb-8 overflow-x-auto no-scrollbar shadow-inner">
                      <button onClick={() => setUploadData({...uploadData, type: 'FILE'})} className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${uploadData.type === 'FILE' ? 'bg-white dark:bg-slate-800 text-primary-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>本地网页/文档</button>
                      <button onClick={() => setUploadData({...uploadData, type: 'WIKI'})} className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${uploadData.type === 'WIKI' ? 'bg-white dark:bg-slate-800 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Wiki 协作</button>
                      <button onClick={() => setUploadData({...uploadData, type: 'URL'})} className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${uploadData.type === 'URL' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>外部网页导入</button>
                  </div>

                  <div className="space-y-6 transition-all">
                      {uploadData.type === 'FILE' ? (
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 transition-colors">选取物理文件 (支持 HTML/PDF/DOCX 等)</label>
                            <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-4 border-dashed border-slate-100 dark:border-slate-700 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group bg-slate-50 dark:bg-slate-900/50 ${isUploading ? 'opacity-50 pointer-events-none shadow-inner' : 'shadow-md'}`}>
                                {uploadData.file ? (<div className="flex flex-col items-center gap-3 text-primary-600 dark:text-primary-400 animate-in fade-in transition-all"><FileIcon className="w-12 h-12 mb-2" /><span className="font-black text-sm text-center break-all px-4">{uploadData.file.name}</span><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{(uploadData.file.size / 1024).toFixed(1)} KB 就绪</span></div>) : (<div className="flex flex-col items-center text-slate-400 dark:text-slate-500 group-hover:text-primary-500 transition-colors"><Upload className="w-12 h-12 mb-4 transition-transform group-hover:scale-110" /><p className="text-xs font-black uppercase tracking-widest">点击选取或将文件拖入此区域</p></div>)}
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                            </div>
                        </div>
                      ) : uploadData.type === 'WIKI' ? (
                        <div className="p-10 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border-2 border-orange-100 dark:border-orange-900/50 text-center flex flex-col items-center shadow-inner">
                            <Edit3 className="w-12 h-12 text-orange-500 mb-4 animate-bounce" />
                            <p className="text-sm font-black text-orange-800 dark:text-orange-200 mb-2 uppercase tracking-widest">激活 Wiki 实时在线协作模式</p>
                            <p className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase tracking-widest opacity-70">创建后可在查阅界面直接增删改正文内容</p>
                        </div>
                      ) : (
                        <div className="space-y-4 animate-in slide-in-from-top-2">
                            <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">外部网页 URL 地址 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.externalUrl} onChange={e => setUploadData({...uploadData, externalUrl: e.target.value})} placeholder="https://example.com/standard" /></div>
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800 text-[10px] font-bold text-blue-600 dark:text-blue-300 leading-relaxed italic shadow-sm">提示：导入的网页链接将通过内嵌容器进行无缝查阅，部分设置了安全策略（CSP）的网站可能无法直接内嵌。</div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 transition-colors">归档展示标题 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.title} onChange={e => setUploadData({...uploadData, title: e.target.value})} placeholder="输入存档正式显示名称" /></div>
                          <div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 transition-colors">知识分类归属</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={uploadData.category} onChange={e => setUploadData({...uploadData, category: e.target.value as DocItem['category']})}>{categories.filter(c => c.id !== 'All').map(c => (<option key={c.id} value={c.id}>{c.label}</option>))}</select></div>
                      </div>
                  </div>
                  <div className="flex justify-end gap-5 mt-12 pt-8 border-t dark:border-slate-700 transition-all">
                      <button onClick={() => setIsUploadModalOpen(false)} className="px-10 py-4 text-slate-400 font-black uppercase tracking-widest text-xs transition-colors hover:text-slate-600" disabled={isUploading}>取消操作</button>
                      <button onClick={handleUploadSave} disabled={isUploading} className={`px-14 py-4 rounded-2xl shadow-2xl transition-all font-black active:scale-95 uppercase tracking-widest text-xs flex items-center gap-3 border-2 border-transparent hover:border-white/20 ${uploadData.type === 'WIKI' ? 'bg-orange-600 text-white shadow-orange-500/30 hover:bg-orange-700' : uploadData.type === 'URL' ? 'bg-blue-600 text-white shadow-blue-500/30 hover:bg-blue-700' : 'bg-primary-600 text-white shadow-primary-500/30 hover:bg-primary-700'}`}>{isUploading ? '正在极速同步...' : (uploadData.type === 'WIKI' ? '立即激活Wiki' : uploadData.type === 'URL' ? '导入网页链接' : '执行本地归档')}</button>
                  </div>
              </div>
          </div>
      )}

      {/* 增强型预览模态框 - 支持内嵌 HTML/URL */}
      {previewDoc && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 md:p-6 transition-all">
              <div className="bg-white dark:bg-slate-800 w-full max-w-6xl h-[94vh] md:h-[92vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 transition-all border-4 border-white dark:border-slate-700">
                  <div className="px-10 py-8 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 transition-colors shrink-0">
                      <div className="flex items-center gap-6 min-w-0 transition-all">
                          <div className={`p-4 bg-white dark:bg-slate-700 rounded-3xl border-2 border-slate-100 dark:border-slate-600 shadow-sm transition-all ${previewDoc.fileType === 'WIKI' ? 'border-orange-200 dark:border-orange-900 shadow-orange-500/10' : (previewDoc.fileType === 'LINK' || previewDoc.fileType === 'HTML') ? 'border-emerald-200 dark:border-emerald-900 shadow-emerald-500/10' : ''}`}>
                              {getFileIcon(previewDoc.fileType)}
                          </div>
                          <div className="min-w-0">
                             {isEditingWiki ? (
                                 <input className="font-black text-slate-800 dark:text-white bg-white dark:bg-slate-900 border-b-4 border-primary-500 outline-none px-3 py-2 text-2xl w-full rounded-t-xl" value={wikiTitle} onChange={e => setWikiTitle(e.target.value)} />
                             ) : (
                                 <h3 className="font-black text-slate-800 dark:text-white truncate text-2xl md:text-3xl tracking-tight transition-colors">{previewDoc.title}</h3>
                             )}
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-3">
                                <span className={`px-2.5 py-1 rounded-full shadow-inner ${getCategoryColor(previewDoc.category)}`}>{getCategoryLabel(previewDoc.category)}</span>
                                <span className="opacity-30">/</span>
                                <span className="text-emerald-600 dark:text-emerald-400">{previewDoc.fileType === 'HTML' ? '本地网页容器' : previewDoc.fileType === 'WIKI' ? 'WIKI 在线文档' : '标准档案'}</span>
                                <span className="opacity-30">/</span>
                                <span>归档于 {formatBeijingTime(previewDoc.updatedAt)}</span>
                             </p>
                          </div>
                      </div>
                      <div className="flex items-center gap-5 flex-shrink-0 transition-all">
                          {previewDoc.fileType === 'WIKI' ? (
                              isEditingWiki ? (
                                  <>
                                    <button onClick={() => setIsEditingWiki(false)} className="px-8 py-4 text-xs rounded-2xl font-black text-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest">放弃修改</button>
                                    <button onClick={handleWikiSave} className="px-10 py-4 bg-primary-600 text-white text-xs rounded-2xl font-black shadow-2xl shadow-primary-500/30 flex items-center gap-2 hover:bg-primary-700 active:scale-95 transition-all uppercase tracking-widest"><Save className="w-5 h-5" /> 立即同步保存</button>
                                  </>
                              ) : (
                                  (currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite') && (
                                    <button onClick={() => setIsEditingWiki(true)} className="px-10 py-4 bg-orange-600 text-white text-xs rounded-2xl font-black shadow-2xl shadow-orange-500/30 flex items-center gap-2 hover:bg-orange-700 active:scale-95 transition-all uppercase tracking-widest border-2 border-white/20"><Edit3 className="w-5 h-5" /> 进入编辑模式</button>
                                  )
                              )
                          ) : previewDoc.fileType === 'LINK' ? (
                              <a href={previewDoc.url} target="_blank" rel="noreferrer" className="px-10 py-4 bg-blue-600 text-white text-xs rounded-2xl font-black shadow-2xl shadow-blue-500/30 flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all uppercase tracking-widest border-2 border-white/20"><Globe className="w-5 h-5" /> 浏览器外部查阅</a>
                          ) : (
                              <a href={previewDoc.url || '#'} download={previewDoc.title} target="_blank" rel="noreferrer" onClick={(e) => !previewDoc.url && e.preventDefault()} className={`px-10 py-4 text-xs rounded-2xl font-black flex items-center gap-2 transition-all uppercase tracking-widest border-2 border-transparent ${previewDoc.url ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-2xl shadow-primary-500/20 hover:border-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}><Download className="w-5 h-5" /> 下载离线存档</a>
                          )}
                          <button onClick={() => { setPreviewDoc(null); setIsEditingWiki(false); }} className="p-4 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-all hover:rotate-90"><X className="w-8 h-8" /></button>
                      </div>
                  </div>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-hidden flex flex-col transition-all relative">
                      {previewDoc.fileType === 'WIKI' ? (
                          isEditingWiki ? (
                              <div className="flex-1 flex flex-col p-10 bg-white dark:bg-slate-950 transition-all">
                                  <div className="mb-6 flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b pb-4 dark:border-slate-800">
                                      <Globe className="w-4 h-4 text-primary-500" /> 企业 Wiki 极速编辑增强模式 (Markdown)
                                  </div>
                                  <textarea 
                                    className="flex-1 w-full bg-slate-50 dark:bg-slate-900/30 rounded-[2rem] p-10 outline-none font-mono text-lg dark:text-slate-200 leading-loose custom-scrollbar shadow-inner border border-slate-100 dark:border-slate-800" 
                                    value={wikiContent} 
                                    onChange={e => setWikiContent(e.target.value)} 
                                    placeholder="在此输入您的知识库正文，支持纯文本分段及标准 Markdown 描述..."
                                  />
                              </div>
                          ) : (
                              <div className="flex-1 p-10 md:p-24 bg-white dark:bg-slate-950 transition-all overflow-y-auto custom-scrollbar">
                                  <div className="max-w-4xl mx-auto">
                                      <div className="prose prose-xl dark:prose-invert max-w-none">
                                          {wikiContent ? (
                                              <div className="whitespace-pre-wrap font-medium leading-[2.2] text-slate-700 dark:text-slate-200 transition-colors text-xl">
                                                  {wikiContent}
                                              </div>
                                          ) : (
                                              <div className="text-center py-48 opacity-10 flex flex-col items-center">
                                                  <Layers className="w-24 h-24 mb-8" />
                                                  <p className="font-black uppercase tracking-[0.5em] text-2xl">当前 WIKI 页面尚无正文</p>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          )
                      ) : (previewDoc.fileType === 'LINK' || previewDoc.fileType === 'HTML') ? (
                           <div className="flex-1 bg-white flex flex-col transition-all overflow-hidden relative">
                              {/* 核心改动：内嵌网页预览容器 */}
                              <iframe 
                                src={previewDoc.url} 
                                className="w-full h-full border-none shadow-2xl bg-white" 
                                title="iERP Web Content Preview Container" 
                              />
                              <div className="absolute top-4 right-10 pointer-events-none opacity-20 hidden md:block">
                                 <p className="text-[40px] font-black text-slate-900 uppercase tracking-[0.5em] select-none">CONTENT VIEW</p>
                              </div>
                           </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-10">
                            {previewDoc.url ? (
                                previewDoc.fileType === 'PDF' ? (<iframe src={previewDoc.url} className="w-full h-full rounded-[2.5rem] bg-white shadow-2xl transition-all border-none" title="Standard Document Preview" />) : 
                                ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(previewDoc.fileType) ? (<div className="relative group max-w-full max-h-full"><img src={previewDoc.url} alt="Knowledge Asset Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-[2.5rem] animate-in fade-in zoom-in-95 duration-500" /></div>) : 
                                (<div className="text-center p-24 animate-in slide-in-from-bottom-10 transition-all"><div className="bg-white dark:bg-slate-800 w-48 h-48 rounded-[3.5rem] shadow-2xl flex items-center justify-center mx-auto mb-10 transition-all transform rotate-6 border-4 border-slate-100 dark:border-slate-700 group-hover:rotate-0">{getFileIcon(previewDoc.fileType)}</div><p className="text-slate-800 dark:text-white font-black text-3xl transition-colors uppercase tracking-[0.1em]">预览引擎不支持此格式</p><p className="text-slate-400 mt-5 font-bold text-lg">请点击右上方按钮下载该归档至本地终端查阅</p></div>)
                            ) : (<div className="text-center p-24 transition-all opacity-20"><AlertCircle className="w-24 h-24 mx-auto text-slate-400 mb-8 transition-colors" /><p className="text-slate-500 font-black uppercase tracking-[0.5em] text-2xl">知识资产链接暂时失效</p></div>)}
                        </div>
                      )}
                  </div>
                  {/* 页脚安全提示 */}
                  <div className="shrink-0 p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-center items-center gap-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] transition-all">
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 企业私有加密存储</span>
                      <span className="opacity-20 text-slate-300">|</span>
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-orange-500" /> 支持网页 HTML 归档</span>
                      <span className="opacity-20 text-slate-300">|</span>
                      <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-primary-500" /> 全内网离线就绪</span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Documentation;

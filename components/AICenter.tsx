
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Send, Trash2, BrainCircuit, Bot, User as UserIcon, Loader2, X, Download, Image as ImageIcon, History, ChevronLeft, ChevronRight, Layers, Terminal, Menu, Paperclip, FileText, FileSpreadsheet, FileDown } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { User, Attachment, AIModel } from '../types';
import { fetchAiModels, streamAiChat } from '../lib/ai-client';
import { API_URL, apiFetch } from '../lib/api';

interface AICenterProps {
  currentUser: User;
  messages: AIMessage[];
  onSendMessage: (msg: AIMessage) => void;
  onDeleteMessage: (id: string) => void;
  onClearHistory: () => void;
}

interface AIMessage {
  id: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model: string;
  type?: 'text' | 'image' | 'multimodal';
  attachments?: Attachment[];
}

const WAIT_MESSAGES = [
    "正在深度研判工程文件数据...",
    "正在为您检索最新的行业规范...",
    "马上就好，正在组织专业的回复建议...",
    "思考中... 正在为您计算系统平衡参数..."
];

const AICenter: React.FC<AICenterProps> = ({ currentUser, messages, onSendMessage, onDeleteMessage, onClearHistory }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [streamingMessage, setStreamingMessage] = useState<AIMessage | null>(null);
  const [waitMsgIdx, setWaitMsgIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  
  // 附件管理状态
  const [currentAttachments, setCurrentAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedModel = models.find(model => model.id === selectedModelId);

  // 对话列表保持时间正序（旧到新）
  const displayMessages = useMemo(() => {
    return [...messages, ...(streamingMessage ? [streamingMessage] : [])]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, streamingMessage]);

  const historyGroups = useMemo(() => {
    const groups: Record<string, AIMessage[]> = {};
    messages.filter(m => m.role === 'user').forEach(m => {
      const date = formatBeijingTime(m.timestamp).split(' ')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(m);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, isLoading]);

  useEffect(() => {
    let cancelled = false;
    fetchAiModels(API_URL)
      .then((data: AIModel[]) => {
        if (cancelled || !Array.isArray(data)) return;
        setModels(data);
        setSelectedModelId(current =>
          data.some(model => model.id === current)
            ? current
            : data[0]?.id || ''
        );
      })
      .catch(error => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
      let interval: any;
      if (isLoading) {
          interval = setInterval(() => {
              setWaitMsgIdx(prev => (prev + 1) % WAIT_MESSAGES.length);
          }, 3000);
      } else {
          setWaitMsgIdx(0);
      }
      return () => clearInterval(interval);
  }, [isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMessage = (id: string) => {
    const element = document.getElementById(`msg-${id}`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-4', 'ring-primary-500/20', 'bg-primary-50/10');
        setTimeout(() => element.classList.remove('ring-4', 'ring-primary-500/20', 'bg-primary-50/10'), 3000);
        if (window.innerWidth <= 768) setSidebarOpen(false);
    }
  };

  const clearHistory = () => {
    if (window.confirm("确定要清空您与 AI 的所有对话记录吗？该操作不可恢复。")) {
      onClearHistory();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();

        newAttachments.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: fileData.url,
          uploadDate: new Date().toISOString(),
          type: file.type || 'application/octet-stream',
          size: (file.size / 1024).toFixed(1) + ' KB'
        });
      } catch (error) {
        console.error("文件处理失败", error);
        alert(`${file.name} 处理失败`);
      }
    }

    setCurrentAttachments(prev => [...prev, ...newAttachments]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setCurrentAttachments(prev => prev.filter(a => a.id !== id));
  };

  const sendMessage = async () => {
    if (
      (!input.trim() && currentAttachments.length === 0) ||
      isLoading ||
      isUploading ||
      !selectedModel
    ) return;

    const attachedToMessage = [...currentAttachments];
    const currentInput = input.trim() || '请根据上传文件引用提供分析建议。';
    
    const userMsg: AIMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: currentInput,
      timestamp: new Date().toISOString(),
      model: selectedModel.displayName,
      attachments: attachedToMessage
    };

    onSendMessage(userMsg);
    setInput('');
    setCurrentAttachments([]);
    setIsLoading(true);
    const assistantMsg: AIMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: new Date().toISOString(),
      model: selectedModel.displayName
    };
    setStreamingMessage(assistantMsg);

    try {
      const conversation = [...messages, userMsg]
        .filter(message => message.type !== 'image')
        .slice(-20)
        .map(message => ({
          role: message.role,
          content: message.content
        }));
      let content = '';
      await streamAiChat(
        API_URL,
        {
          modelId: selectedModel.id,
          messages: conversation,
          attachments: attachedToMessage.map(({ name, url, type }) => ({
            name,
            url,
            type
          })),
          reasoning: selectedModel.reasoning
        },
        token => {
          content += token;
          setStreamingMessage({ ...assistantMsg, content });
        }
      );
      const completedMessage = {
        ...assistantMsg,
        content: content || '模型未返回有效回复，请重试。'
      };
      setStreamingMessage(null);
      onSendMessage(completedMessage);
    } catch (error: any) {
      console.error(error);
      setStreamingMessage(null);
      const errorMsg: AIMessage = {
        id: Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: `⚠️ 对接异常：${error.message}`,
        timestamp: new Date().toISOString(),
        model: 'API 状态'
      };
      onSendMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadMessage = (content: string, model: string, type: 'text' | 'image' = 'text') => {
    if (type === 'image') {
        const link = document.createElement("a");
        link.href = content;
        link.download = `AI_Generated_Design_${new Date().getTime()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        const element = document.createElement("a");
        const file = new Blob([content], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = `AI_Response_${model}_${new Date().getTime()}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
  };

  const getFileIcon = (mimeType: string) => {
      if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-purple-500" />;
      if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
      if (mimeType.includes('excel') || mimeType.includes('sheet')) return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
      return <Paperclip className="w-5 h-5 text-slate-500" />;
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-100px)] flex bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all relative">
      
      {sidebarOpen && window.innerWidth <= 768 && (
        <div className="fixed inset-0 bg-black/50 z-[45] backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - History */}
      <div className={`
        ${sidebarOpen ? 'w-64 md:w-60 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'} 
        bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col shrink-0 overflow-hidden 
        absolute md:static inset-y-0 left-0 z-50 md:z-auto
      `}>
        <div className="p-5 border-b dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-slate-900/50">
            <h3 className="font-black text-slate-500 dark:text-slate-400 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                <History className="w-3.5 h-3.5 text-primary-500" /> 
                历史对话
            </h3>
            <div className="flex items-center gap-1">
                <button onClick={clearHistory} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg" title="清除历史"><Trash2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-300 hover:text-primary-600 transition-colors rounded-lg md:hidden"><X className="w-4 h-4" /></button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar">
            {historyGroups.length === 0 ? (
                <div className="text-center py-20 opacity-10">
                    <Bot className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-[8px] font-black uppercase tracking-widest">暂无记录</p>
                </div>
            ) : (
                historyGroups.map(([date, msgs]) => (
                    <div key={date}>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{date}</p>
                        <div className="space-y-1">
                            {msgs.map(m => (
                                <button 
                                    key={m.id}
                                    onClick={() => scrollToMessage(m.id)}
                                    className="w-full text-left p-2.5 rounded-xl hover:bg-white dark:hover:bg-slate-800 group transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 active:scale-95"
                                >
                                    <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate mb-1 group-hover:text-primary-600 transition-colors">
                                        {m.attachments && m.attachments.length > 0 && <Paperclip className="w-2.5 h-2.5 inline mr-1 opacity-50" />}
                                        {m.content || "查看附件分析"}
                                    </p>
                                    <div className="flex justify-between items-center opacity-40">
                                        <span className="text-[7px] font-black uppercase tracking-tighter">{m.model}</span>
                                        <ChevronRight className="w-2.5 h-2.5" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 h-full">
        {/* Header - Provider Switcher */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-400 hover:text-primary-600 transition-all flex-shrink-0">
                    {sidebarOpen ? <ChevronLeft className="hidden md:block w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    {sidebarOpen && <X className="md:hidden w-5 h-5" />}
                </button>
                <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                    <div className="p-1.5 md:p-2 bg-primary-600 rounded-lg md:rounded-xl shadow-lg shadow-primary-500/20 flex-shrink-0">
                        <BrainCircuit className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xs md:text-sm font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase truncate">智脑工程中心</h2>
                        <p className="hidden sm:block text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-none">AI Intelligence Hub</p>
                    </div>
                </div>
            </div>

            <select
                value={selectedModelId}
                onChange={event => setSelectedModelId(event.target.value)}
                disabled={models.length === 0 || isLoading}
                className="max-w-[180px] md:max-w-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-[9px] md:text-xs font-black text-slate-700 dark:text-slate-200 outline-none focus:border-primary-500 disabled:opacity-50"
            >
                {models.length === 0 && <option value="">暂无可用模型</option>}
                {models.map(model => (
                    <option key={model.id} value={model.id}>
                        {model.displayName}
                    </option>
                ))}
            </select>
        </div>

        {/* Message Container */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar transition-all bg-slate-50/20 dark:bg-slate-900/50">
            <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
                {displayMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 animate-in fade-in zoom-in-95 duration-700 px-4">
                    <div className="w-16 h-16 bg-primary-600 rounded-3xl shadow-xl shadow-primary-500/20 flex items-center justify-center mb-6 transform rotate-3">
                        <Sparkles className="w-8 h-8 text-white animate-pulse" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">欢迎来到智脑中心，{currentUser.nickname}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium max-w-xs leading-relaxed mb-8">
                        统一使用系统托管的 DeepSeek 官方 API。模型列表由管理员配置，新模型发布后无需重建前端。
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                        {[
                        "分析该厨房工程图纸的排烟点位",
                        "核对目前商用炉灶最新的能效等级国标",
                        "识别并提取上传 PDF 合同中的关键条款",
                        "生成一张 300 人的学校食堂渲染效果图"
                        ].map((q, i) => (
                        <button key={i} onClick={() => { setInput(q); }} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-left text-[10px] font-black text-slate-500 dark:text-slate-300 hover:border-primary-500 hover:shadow-lg transition-all active:scale-95">
                            <div className="flex items-center gap-2"><Terminal className="w-3 h-3 text-primary-500" />{q}</div>
                        </button>
                        ))}
                    </div>
                </div>
                )}

                {displayMessages.map((msg) => (
                <div key={msg.id} id={`msg-${msg.id}`} className={`flex gap-3 md:gap-4 animate-in slide-in-from-bottom-2 duration-500 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex-shrink-0 relative group/avatar transition-all duration-500 ${msg.role === 'user' ? 'w-8 h-8 md:w-9 md:h-9' : 'w-9 h-9 md:w-10 md:h-10'}`}>
                        {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-xl bg-slate-800 border-2 border-slate-700 shadow-slate-900/20 shadow-lg flex items-center justify-center">
                                <UserIcon className="w-4 h-4 text-white" />
                            </div>
                        ) : (
                            <div className="w-full h-full rounded-2xl flex items-center justify-center relative overflow-hidden shadow-[0_0_20px_rgba(37,99,235,0.3)] border-2 border-white/20 transition-transform hover:scale-110">
                                <div className="absolute inset-0 bg-gradient-to-tr from-primary-600 via-purple-500 to-emerald-500 animate-led-flow opacity-90" />
                                <div className="absolute inset-0.5 bg-slate-900/40 backdrop-blur-sm rounded-[calc(1rem-2px)]" />
                                <div className="relative z-10">
                                    <BrainCircuit className="w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 shadow-[0_0_10px_rgba(16,185,129,1)] z-20 animate-pulse"></div>
                            </div>
                        )}
                    </div>

                    <div className={`flex flex-col max-w-[88%] md:max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1.5 px-1 group">
                            <span className={`text-[8px] font-black uppercase tracking-widest ${msg.role === 'user' ? 'text-slate-400' : 'text-primary-600'}`}>{msg.role === 'user' ? currentUser.nickname : msg.model}</span>
                            <span className="text-[7px] font-bold text-slate-300 uppercase">{formatBeijingTime(msg.timestamp).split(' ')[1]}</span>
                            <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-all ml-2">
                                {msg.role === 'assistant' && msg.type !== 'image' && (
                                    <button onClick={() => downloadMessage(msg.content, msg.model)} className="p-1 text-slate-400 hover:text-primary-600 transition-colors" title="保存文案为TXT">
                                        <FileDown className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => { if(window.confirm('确定要移除此条记录吗？')) onDeleteMessage(msg.id); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>

                        {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {msg.attachments.map(att => (
                                    <div key={att.id} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2 max-w-[200px] shadow-sm">
                                        <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg">{getFileIcon(att.type)}</div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black text-slate-800 dark:text-slate-200 truncate leading-tight">{att.name}</p>
                                            <p className="text-[8px] text-slate-400 uppercase font-bold">{att.size}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className={`px-4 py-2.5 md:py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-all font-medium border-2 ${
                            msg.role === 'user' 
                            ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none' 
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-100 dark:border-slate-700 rounded-tl-none prose prose-slate dark:prose-invert max-w-none'
                        }`}>
                            {msg.type === 'image' ? (
                                <div className="space-y-3">
                                    <img src={msg.content} alt="AI Generated" className="rounded-xl w-full h-auto shadow-lg border border-slate-100 dark:border-slate-700 cursor-zoom-in" onClick={() => window.open(msg.content)} />
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => downloadMessage(msg.content, msg.model, 'image')} 
                                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary-600 text-white rounded-lg font-black uppercase text-[9px] tracking-widest transition-all hover:bg-primary-700 shadow-md border border-white/10 active:scale-95"
                                        >
                                            <Download className="w-3 h-3" /> <span>下载本地存档</span>
                                        </button>
                                        <button onClick={() => setInput(`基于上图进一步优化：${input}`)} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-[8px] font-black uppercase text-slate-500 hover:bg-white dark:hover:bg-slate-600 transition-all border border-slate-200 dark:border-slate-600"><Layers className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            ) : (
                                <div className="whitespace-pre-wrap text-sm md:text-base">{msg.content}</div>
                            )}
                        </div>
                    </div>
                </div>
                ))}

                {isLoading && (
                <div className="flex gap-3 animate-pulse">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-slate-200 via-slate-100 to-slate-200 animate-led-flow opacity-50" />
                        <Bot className="w-5 h-5 text-slate-300 relative z-10" />
                    </div>
                    <div className="flex flex-col space-y-2 flex-1 max-w-[360px]">
                        <div className="h-2 w-20 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
                        <div className="p-4 rounded-2xl rounded-tl-none bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-2">
                            <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full"></div>
                            <div className="h-2 w-[80%] bg-slate-50 dark:bg-slate-900 rounded-full"></div>
                        </div>
                    </div>
                </div>
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>

        {/* Input Area */}
        <div className="px-4 py-4 md:px-5 md:py-5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 relative">
            <div className="max-w-4xl mx-auto relative">
            {isLoading && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-primary-600 text-white px-4 py-1.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-xl animate-in slide-in-from-bottom-1 border border-white/10 z-10 whitespace-nowrap">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> {WAIT_MESSAGES[waitMsgIdx]}
                </div>
            )}

            {currentAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2.5 mb-3 animate-in slide-in-from-bottom-2 duration-300">
                    {currentAttachments.map(att => (
                        <div key={att.id} className="relative group/att">
                            <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 shadow-sm group-hover/att:border-primary-500 transition-all pr-8">
                                <div className="p-2 bg-white dark:bg-slate-950 rounded-lg shadow-inner">{getFileIcon(att.type)}</div>
                                <div className="min-w-0 max-w-[120px]">
                                    <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                                    <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">{att.size}</p>
                                </div>
                            </div>
                            <button onClick={() => removeAttachment(att.id)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-0.5 rounded-full shadow-lg opacity-0 group-hover/att:opacity-100 transition-opacity">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-950 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-800 focus-within:border-primary-500/30 focus-within:bg-white dark:focus-within:bg-slate-900 shadow-lg transition-all p-1.5 flex items-end gap-2 group">
                <div className="flex flex-col gap-1">
                    <button 
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                        disabled={isUploading}
                        className={`p-2.5 md:p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:border-primary-500 transition-all ${isUploading ? 'opacity-30' : 'active:scale-95'}`}
                        title="上传工程附件 (图片/PDF/文档)"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-primary-500 animate-spin" /> : <Paperclip className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                </div>
                
                <textarea 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) { e.preventDefault(); sendMessage(); } }}
                    className="flex-1 bg-transparent border-none focus:ring-0 px-1 md:px-2 py-2.5 md:py-3 min-h-[40px] max-h-32 resize-none text-sm font-bold dark:text-white placeholder:text-slate-400 custom-scrollbar"
                    placeholder={`发送消息或上传文件，通过 ${selectedModel?.displayName || 'DeepSeek'} 进行分析...`}
                    rows={1}
                />
                <button 
                    onClick={sendMessage}
                    disabled={(!input.trim() && currentAttachments.length === 0) || isLoading || isUploading}
                    className="p-3 md:p-3.5 text-white rounded-xl shadow-md transition-all active:scale-90 disabled:opacity-20 flex-shrink-0 bg-primary-600 hover:bg-primary-700"
                >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                </button>
            </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AICenter;

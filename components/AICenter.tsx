
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles, Send, Trash2, Cpu, BrainCircuit, Globe, Bot, User as UserIcon, Loader2, AlertCircle, X, Settings2, ShieldCheck, Zap, Download, Image as ImageIcon, History, ChevronLeft, ChevronRight, ExternalLink, ZapOff, Layers, Terminal, Search, ArrowRight, Menu, Key, Paperclip, FileText, FileSpreadsheet, Eye, ToggleLeft, FileDown } from 'lucide-react';
import { formatBeijingTime } from '../constants';
import { User, Attachment } from '../types';

const API_URL = (window as any)._env_?.API_URL || '/api';

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
  const [provider, setProvider] = useState<'gemini' | 'siliconflow' | 'nano-banana'>('gemini');
  const [waitMsgIdx, setWaitMsgIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  
  // 附件管理状态
  const [currentAttachments, setCurrentAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 外部提供商密钥状态 (SiliconFlow)
  const [keys, setKeys] = useState({
    siliconflow: localStorage.getItem('ierp_ai_key_sf') || ''
  });
  
  const [showKeyModal, setShowKeyModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 对话列表保持时间正序（旧到新）
  const displayMessages = useMemo(() => {
    return [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages]);

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
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
        const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();
        const base64 = await fileToBase64(file);

        newAttachments.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: fileData.url,
          uploadDate: new Date().toISOString(),
          type: file.type || 'application/octet-stream',
          size: (file.size / 1024).toFixed(1) + ' KB',
          base64Data: base64
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

  const handleGeminiCall = async (prompt: string, attached: Attachment[]) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = [{ text: prompt }];
    
    attached.forEach(att => {
        if (att.base64Data) {
            parts.push({
                inlineData: {
                    data: att.base64Data,
                    mimeType: att.type
                }
            });
        }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        systemInstruction: "你是一个资深的厨房设备工程专家。请结合用户上传的图片、PDF或文档进行深度分析。如果是图纸，请识别设备布局；如果是合同或清单，请核对规格。语气应专业且精准。",
        temperature: 0.7,
      }
    });
    return { text: response.text || "模型未返回有效回复，请重试。", type: 'multimodal' as const };
  };

  const handleSiliconFlowCall = async (prompt: string, attached: Attachment[]) => {
    if (!keys.siliconflow) {
      setShowKeyModal(true);
      throw new Error("请先在配置中填入 SiliconFlow 密钥。");
    }

    let enhancedPrompt = prompt;
    if (attached.length > 0) {
        enhancedPrompt += "\n\n[参考文件信息]:";
        attached.forEach(att => {
            enhancedPrompt += `\n文件名: ${att.name}, 类型: ${att.type}`;
        });
        enhancedPrompt += "\n注：当前模型仅支持文本分析，请优先基于文件名和上下文提供建议。";
    }

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.siliconflow}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-V3", 
          messages: [
              { role: "system", content: "你是一个资深的厨房设备工程专家助理，精通中国国家标准规范和现场施工工艺细节。" },
              { role: "user", content: enhancedPrompt }
          ],
          stream: false
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`SiliconFlow 异常: ${errData.message || response.status}`);
    }
    const data = await response.json();
    return { text: data.choices[0].message.content, type: 'text' as const };
  };

  const handleNanoBananaCall = async (prompt: string) => {
    if (!(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview', 
        contents: { parts: [{ text: `厨房设备工程工业渲染图, 真实感不锈钢材质, 工业设计, 4K精度, 电影级光效: ${prompt}` }] },
        config: {
            imageConfig: {
                aspectRatio: "1:1",
                imageSize: "1K"
            }
        }
    });

    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return { text: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, type: 'image' as const };
            }
        }
    }
    
    throw new Error("图像生成引擎未返回数据，请检查配额或提示词。");
  };

  const sendMessage = async () => {
    if ((!input.trim() && currentAttachments.length === 0) || isLoading || isUploading) return;

    const currentProvider = provider;
    const attachedToMessage = [...currentAttachments];
    
    const userMsg: AIMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      model: currentProvider === 'gemini' ? 'Gemini 3 Pro' : currentProvider === 'siliconflow' ? 'DeepSeek V3' : 'Nano Banana Pro',
      attachments: attachedToMessage
    };

    onSendMessage(userMsg);
    const currentInput = input;
    setInput('');
    setCurrentAttachments([]);
    setIsLoading(true);

    try {
      let aiResult;
      if (currentProvider === 'gemini') {
        aiResult = await handleGeminiCall(currentInput || "请分析上传的文件内容。", attachedToMessage);
      } else if (currentProvider === 'siliconflow') {
        aiResult = await handleSiliconFlowCall(currentInput, attachedToMessage);
      } else {
        aiResult = await handleNanoBananaCall(currentInput);
      }

      const assistantMsg: AIMessage = {
        id: Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: aiResult.text,
        type: aiResult.type,
        timestamp: new Date().toISOString(),
        model: assistantMsgModel(currentProvider)
      };

      onSendMessage(assistantMsg);
    } catch (error: any) {
      console.error(error);
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

  const assistantMsgModel = (provider: string) => {
      if (provider === 'gemini') return 'Gemini 3 Pro (Vision)';
      if (provider === 'siliconflow') return 'DeepSeek V3';
      return 'Nano Banana Pro';
  };

  const saveKeys = () => {
    localStorage.setItem('ierp_ai_key_sf', keys.siliconflow);
    setShowKeyModal(false);
  };

  const handleSelectGoogleKey = async () => {
    await (window as any).aistudio.openSelectKey();
    alert("Google API 密钥接口已唤起，请在系统弹窗中完成选择。");
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

            <div className="flex items-center gap-1.5 md:gap-2">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 md:p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden max-w-[150px] sm:max-w-none">
                    <button 
                        onClick={() => setProvider('gemini')}
                        className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[7px] md:text-[9px] font-black uppercase transition-all flex items-center gap-1 ${provider === 'gemini' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Globe className="w-2.5 h-2.5 md:w-3 md:h-3" /> <span className="hidden xs:inline">Gemini 3</span>
                    </button>
                    <button 
                        onClick={() => setProvider('siliconflow')}
                        className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[7px] md:text-[9px] font-black uppercase transition-all flex items-center gap-1 ${provider === 'siliconflow' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Zap className="w-2.5 h-2.5 md:w-3 md:h-3" /> <span className="hidden xs:inline">DeepSeek</span>
                    </button>
                    <button 
                        onClick={() => setProvider('nano-banana')}
                        className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[7px] md:text-[9px] font-black uppercase transition-all flex items-center gap-1 ${provider === 'nano-banana' ? 'bg-white dark:bg-slate-700 text-orange-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <ImageIcon className="w-2.5 h-2.5 md:w-3 md:h-3" /> <span className="hidden xs:inline">Banana</span>
                    </button>
                </div>
                <button onClick={() => setShowKeyModal(true)} className="p-2 text-slate-400 hover:text-primary-600 transition-all" title="接口配置"><Settings2 className="w-4 h-4 md:w-5 md:h-5" /></button>
            </div>
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
                        请上传工程图纸、合同 PDF 或现场照片。Gemini 支持视觉识别，DeepSeek 精通国标规范。
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

            <div className={`bg-slate-50 dark:bg-slate-950 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-800 focus-within:border-primary-500/30 focus-within:bg-white dark:focus-within:bg-slate-900 shadow-lg transition-all p-1.5 flex items-end gap-2 group ${provider === 'nano-banana' ? 'border-orange-500/30' : ''}`}>
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
                    placeholder={provider === 'nano-banana' ? "描述您想要生成的 3D 工程图..." : `发送消息或上传文件，通过 ${provider === 'gemini' ? 'Gemini 3 Pro' : 'DeepSeek V3'} 进行分析...`}
                    rows={1}
                />
                <button 
                    onClick={sendMessage}
                    disabled={(!input.trim() && currentAttachments.length === 0) || isLoading || isUploading}
                    className={`p-3 md:p-3.5 text-white rounded-xl shadow-md transition-all active:scale-90 disabled:opacity-20 flex-shrink-0 ${provider === 'nano-banana' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-primary-600 hover:bg-primary-700'}`}
                >
                    {provider === 'nano-banana' ? <Sparkles className="w-4 h-4 md:w-5 md:h-5" /> : <Send className="w-4 h-4 md:w-5 md:h-5" />}
                </button>
            </div>
            </div>
        </div>

        {/* --- 独立接口配置面板 --- */}
        {showKeyModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] md:rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <div className="flex justify-between items-center mb-6 md:mb-8 border-b dark:border-slate-700 pb-4 md:pb-6">
                    <div className="flex items-center gap-3">
                        <Key className="w-5 h-5 md:w-6 md:h-6 text-primary-600" />
                        <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">智脑独立接口配置</h3>
                    </div>
                    <button onClick={() => setShowKeyModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all text-slate-400"><X className="w-6 h-6" /></button>
                </div>
                
                <div className="space-y-8">
                    {/* 1. Gemini 通用接口 (文本/视觉) */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <Globe className="w-3 h-3"/> Gemini 3 Pro 核心通道
                        </label>
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-inner">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">系统环境托管保护</span>
                            </div>
                            <button 
                                onClick={handleSelectGoogleKey}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-[10px] font-black text-blue-600 hover:bg-blue-50 transition-all shadow-sm active:scale-95"
                            >
                                选择/切换 API 密钥
                            </button>
                        </div>
                        <p className="text-[8px] text-slate-400 font-bold leading-relaxed px-1">
                            用于工程文档深度研判与 PDF 视觉解析。密钥遵循 Google 安全协议。
                        </p>
                    </div>

                    {/* 2. Nano Banana 图像接口 */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <ImageIcon className="w-3 h-3"/> Nano Banana 图像生成通道
                        </label>
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-inner">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-orange-500" />
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">独立付费 API 授权</span>
                            </div>
                            <button 
                                onClick={handleSelectGoogleKey}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-[10px] font-black text-orange-600 hover:bg-orange-50 transition-all shadow-sm active:scale-95"
                            >
                                选择/切换 API 密钥
                            </button>
                        </div>
                        <p className="text-[8px] text-slate-400 font-bold leading-relaxed px-1">
                            用于 3D 渲染图预览与工业设计参考。建议选择具有较高配额的工程项目 Key。
                        </p>
                    </div>

                    {/* 3. SiliconFlow (第三方接口) */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-primary-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                            <Zap className="w-3 h-3"/> SiliconFlow (DeepSeek V3)
                        </label>
                        <div className="relative">
                            <input 
                                type="password" 
                                className="w-full border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 bg-slate-50 dark:bg-slate-950 font-mono outline-none focus:border-primary-600 shadow-inner dark:text-white transition-all text-xs" 
                                value={keys.siliconflow} 
                                onChange={e => setKeys({...keys, siliconflow: e.target.value})} 
                                placeholder="sk-..." 
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <Key className="w-4 h-4 text-slate-300" />
                            </div>
                        </div>
                        <p className="text-[8px] text-slate-400 font-bold leading-relaxed px-1">
                            本地加密存储。用于国标规范快速检索与施工方案合规性文本核查。
                        </p>
                    </div>
                </div>

                <div className="mt-10 flex justify-end gap-3 border-t dark:border-slate-700 pt-6">
                    <button onClick={() => setShowKeyModal(false)} className="px-6 py-2.5 text-slate-400 font-black uppercase tracking-widest text-[9px] transition-colors">取消</button>
                    <button onClick={saveKeys} className="px-10 py-3 bg-primary-600 text-white rounded-2xl font-black shadow-lg shadow-primary-500/20 active:scale-95 uppercase tracking-widest text-[9px] border border-white/10 hover:bg-primary-700 transition-all">同步配置</button>
                </div>
            </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AICenter;

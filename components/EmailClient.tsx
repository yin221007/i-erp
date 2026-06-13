
import React, { useState, useEffect, useRef } from 'react';
import { Mail, Send, RefreshCw, Settings, PenSquare, X, Save, Eye, Paperclip, ChevronLeft, ChevronRight, Inbox, Check, Download, FileText, FileSpreadsheet, ArrowRight, ShieldAlert, Globe, AlertCircle, Loader2, HelpCircle } from 'lucide-react';
import { User, EmailConfig, EmailMessage } from '../types';
import { formatBeijingTime } from '../constants';

const API_URL = (window as any)._env_?.API_URL || '/api';

interface EmailClientProps {
  currentUser: User;
}

const EmailClient: React.FC<EmailClientProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'compose' | 'settings'>('inbox');
  const [config, setConfig] = useState<EmailConfig | null>(null);
  
  const [messages, setMessages] = useState<EmailMessage[]>([]);

  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 物理锁：防止组件并发导致 IMAP 握手冲突
  const isFetchingRef = useRef(false);

  // 邮箱配置表单状态
  const [settingForm, setSettingForm] = useState<EmailConfig>({
      id: currentUser.id,
      email: '',
      authCode: '',
      smtpHost: 'smtp.qq.com',
      smtpPort: 465,
      imapHost: 'imap.qq.com',
      imapPort: 993,
  });

  // 撰写邮件状态
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  // 加载配置
  useEffect(() => {
      fetchConfig();
  }, [currentUser]);

  const fetchConfig = async () => {
      try {
          const res = await fetch(`${API_URL}/email_configs`, {
              headers: { 'x-user-id': currentUser.id }
          });
          if (res.ok) {
              const data = await res.json();
              const myConfig = data.find((c: EmailConfig) => c.id === currentUser.id);
              if (myConfig) {
                  setConfig(myConfig);
                  setSettingForm(myConfig);
                  // 只要配置存在且当前列表为空，就强制触发一次同步
                  if (messages.length === 0) {
                      fetchMessages(myConfig);
                  }
              } else {
                  setConfig(null); 
                  setActiveTab('settings');
              }
          }
      } catch (error) {
          console.error("加载邮箱配置失败", error);
      }
  };

  const fetchMessages = async (configOverride?: EmailConfig) => {
      const currentConfig = configOverride || config;
      if (!currentConfig) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      setIsLoading(true);
      setErrorMessage(null);
      
      try {
          // 增加前端超时控制，防止 IMAP 握手挂死
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

          const res = await fetch(`${API_URL}/email/fetch`, {
              headers: { 'x-user-id': currentUser.id },
              signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                  setMessages(data);
              } else {
                  setErrorMessage("服务器返回数据格式异常");
              }
          } else {
              const err = await res.json().catch(() => ({ error: '未知协议错误' }));
              setErrorMessage(err.error || `连接失败 (${res.status})：请核对授权码及 IMAP 服务是否开启。`);
          }
      } catch (error: any) {
          if (error.name === 'AbortError') {
              setErrorMessage("同步超时：您的邮件较多或网络连接不稳定，请重试。");
          } else {
              setErrorMessage("同步异常：后端服务无响应，请检查 Docker backend 运行状态。");
          }
          console.error("邮件抓取错误", error);
      } finally {
          setIsLoading(false);
          isFetchingRef.current = false;
      }
  };

  const handleSaveSettings = async () => {
      if (!settingForm.email || !settingForm.authCode) {
          alert("请填写完整的邮箱账号和 16 位授权码");
          return;
      }

      const method = config ? 'PUT' : 'POST';
      const url = config ? `${API_URL}/email_configs/${currentUser.id}` : `${API_URL}/email_configs`;

      try {
          const res = await fetch(url, {
              method,
              headers: { 
                  'Content-Type': 'application/json',
                  'x-user-id': currentUser.id 
              },
              body: JSON.stringify(settingForm)
          });

          if (res.ok) {
              setConfig(settingForm);
              alert("邮箱参数同步成功，正在尝试建立 IMAP 连接...");
              setActiveTab('inbox');
              fetchMessages(settingForm);
          } else {
              const err = await res.json().catch(() => ({}));
              alert("保存失败：" + (err.error || "协议配置被服务器拒绝"));
          }
      } catch (error) {
          console.error("保存配置错误", error);
          alert("保存出错，请检查后端 API 服务状态");
      }
  };

  const handleSendEmail = async () => {
      if (!composeTo || !composeSubject || !composeBody) {
          alert("请完善收件人、主题及正文内容");
          return;
      }
      setIsSending(true);
      try {
          const res = await fetch(`${API_URL}/email/send`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': currentUser.id
              },
              body: JSON.stringify({
                  to: composeTo,
                  subject: composeSubject,
                  text: composeBody
              })
          });
          if (res.ok) {
              alert("业务函件已成功发出");
              setComposeTo('');
              setComposeSubject('');
              setComposeBody('');
              setActiveTab('inbox');
          } else {
              const err = await res.json();
              alert("发送失败：" + (err.error || "SMTP 认证未通过"));
          }
      } catch (error) {
          console.error("发送错误", error);
          alert("连接超时，请核对您的网络环境");
      } finally {
          setIsSending(false);
      }
  };

  const handleDownloadAttachment = async (att: any) => {
      if (!selectedMessage) return;
      try {
          const res = await fetch(
              `${API_URL}/email/messages/${encodeURIComponent(selectedMessage.id)}/attachments/${encodeURIComponent(att.part)}`
          );
          if (!res.ok) throw new Error('Attachment download failed');
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = att.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
      } catch (e) {
          alert("附件解码异常，可能文件已损坏");
      }
  };

  const getAttachmentIcon = (filename: string) => {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-500" />;
      if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
      return <Paperclip className="w-4 h-4 text-primary-500" />;
  };

  const handleMessageSelect = async (msg: EmailMessage) => {
      setSelectedMessage(msg);
      setIsLoadingMessage(true);
      setErrorMessage(null);
      try {
          const res = await fetch(
              `${API_URL}/email/messages/${encodeURIComponent(msg.id)}`
          );
          if (!res.ok) {
              const error = await res.json().catch(() => ({}));
              throw new Error(error.error || '邮件正文读取失败');
          }
          setSelectedMessage(await res.json());
      } catch (error: any) {
          setErrorMessage(error.message || '邮件正文读取失败');
      } finally {
          setIsLoadingMessage(false);
      }
  };

  const handleBackToInbox = () => {
    setSelectedMessage(null);
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border border-slate-300 dark:border-slate-700 overflow-hidden transition-all relative">
      {/* 顶部工具栏 */}
      <div className="p-4 md:p-6 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-slate-200/50 dark:bg-slate-900 transition-all shrink-0">
          <div className="flex items-center gap-3 md:gap-5 min-w-0">
              <div className="p-2 md:p-2.5 bg-primary-600 rounded-xl md:rounded-2xl shadow-lg shadow-primary-500/20 flex-shrink-0">
                <Mail className="w-5 h-5 md:w-7 md:h-7 text-white" /> 
              </div>
              <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white tracking-tight truncate">业务通讯中心</h2>
                {config && (
                  <span className="hidden sm:inline-block text-[10px] font-black text-slate-500 bg-white/60 dark:bg-slate-800 px-3 py-1 rounded-full border-2 border-slate-100 dark:border-slate-700 transition-all uppercase tracking-widest mt-1">
                      {config.email}
                  </span>
                )}
              </div>
          </div>
          <div className="flex gap-1.5 md:gap-2 shrink-0">
              <button 
                  onClick={() => {
                      if (!config) { alert("请先完成账户配置"); setActiveTab('settings'); return; }
                      setActiveTab('compose');
                  }}
                  className={`p-2.5 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border-2 ${activeTab === 'compose' ? 'bg-primary-600 text-white border-primary-600 shadow-xl' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-700 hover:border-primary-500'}`}
              >
                  <PenSquare className="w-4 h-4" /> <span className="hidden xs:inline">撰写</span>
              </button>
              <button 
                  onClick={() => fetchMessages()}
                  disabled={isLoading || !config}
                  className="p-2.5 md:px-4 md:py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl md:rounded-2xl text-slate-700 dark:text-slate-200 hover:border-primary-500 transition-all shadow-sm active:rotate-180 disabled:opacity-50"
              >
                  <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${isLoading ? 'animate-spin text-primary-600' : ''}`} />
              </button>
              <button 
                  onClick={() => setActiveTab('settings')}
                  className={`p-2.5 md:p-3 rounded-xl md:rounded-2xl transition-all shadow-sm border-2 ${activeTab === 'settings' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-50'}`}
              >
                  <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          {activeTab === 'inbox' && (
              !config ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-8 p-10 bg-slate-200/50 dark:bg-slate-900 transition-all">
                      <div className="bg-white dark:bg-slate-800 p-8 md:p-12 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl animate-in zoom-in-90 duration-500">
                          <Mail className="w-16 h-16 md:w-24 md:h-24 text-primary-500 opacity-20" />
                      </div>
                      <div className="text-center max-w-sm md:max-w-md px-4">
                          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mb-4">尚未绑定业务邮箱</h3>
                          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
                              请绑定您的 IMAP/SMTP 账户以实现在 ERP 内部协同处理工程合同、变更函件及图纸。
                          </p>
                      </div>
                      <button 
                          onClick={() => setActiveTab('settings')}
                          className="px-8 py-3.5 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 flex items-center gap-3 font-black transition-all active:scale-95 uppercase tracking-widest text-[11px]"
                      >
                          前往配置参数 <ArrowRight className="w-4 h-4" />
                      </button>
                  </div>
              ) : (
                  <div className="flex h-full transition-all relative">
                      {/* 邮件列表 */}
                      <div className={`
                        ${selectedMessage ? 'hidden md:block md:w-1/3 lg:w-1/4' : 'w-full'} 
                        border-r border-slate-300 dark:border-slate-700 overflow-y-auto bg-slate-200 dark:bg-slate-850 custom-scrollbar transition-all
                      `}>
                          {errorMessage && (
                              <div className="p-4 md:p-6 bg-red-50 dark:bg-red-900/20 m-4 rounded-2xl border border-red-100 dark:border-red-800/50 animate-in slide-in-from-top-2">
                                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-black text-xs mb-2">
                                      <AlertCircle className="w-4 h-4" /> 通步异常告警
                                  </div>
                                  <p className="text-[10px] text-red-500 dark:text-red-300 leading-relaxed font-bold">{errorMessage}</p>
                                  <button onClick={() => fetchMessages()} className="mt-4 text-[9px] font-black uppercase text-red-600 hover:underline flex items-center gap-1.5"><RefreshCw className="w-3 h-3"/> 重试连接</button>
                              </div>
                          )}
                          {messages.length === 0 && !errorMessage && !isLoading && (
                              <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-20 py-20">
                                  <Inbox className="w-16 h-16 md:w-20 md:h-20 mb-6" />
                                  <p className="font-black uppercase tracking-widest text-[10px]">收件箱暂无邮件</p>
                              </div>
                          )}
                          {isLoading && messages.length === 0 && (
                              <div className="flex flex-col items-center justify-center h-full text-primary-500 py-20">
                                  <Loader2 className="w-12 h-12 mb-6 animate-spin" />
                                  <p className="font-black uppercase tracking-widest text-[10px] animate-pulse">正在握手并抓取云端数据...</p>
                              </div>
                          )}
                          <div className="divide-y divide-slate-300/50 dark:divide-slate-700">
                              {messages.map(msg => (
                                  <div 
                                      key={msg.id}
                                      onClick={() => handleMessageSelect(msg)}
                                      className={`p-4 md:p-6 cursor-pointer hover:bg-white/80 dark:hover:bg-slate-700/50 transition-all border-l-8 ${selectedMessage?.id === msg.id ? 'border-primary-600 bg-white shadow-xl relative z-10' : 'border-transparent'}`}
                                  >
                                      <div className="flex justify-between items-center mb-2">
                                          <span className={`text-[9px] md:text-[10px] font-black truncate pr-2 uppercase tracking-tighter ${!msg.seen ? 'text-primary-600' : 'text-slate-500'}`}>{msg.from}</span>
                                          <span className="text-[8px] md:text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">{formatBeijingTime(msg.date).split(' ')[0]}</span>
                                      </div>
                                      <div className="flex items-center gap-2 mb-2 min-w-0">
                                          {msg.attachments && msg.attachments.length > 0 && <Paperclip className="w-3 h-3 text-primary-500 flex-shrink-0" />}
                                          <h4 className={`text-xs md:text-sm truncate min-w-0 ${!msg.seen ? 'font-black text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 font-bold'}`}>{msg.subject || '(无主题业务邮件)'}</h4>
                                      </div>
                                      <p className="text-[10px] md:text-[11px] text-slate-400 truncate opacity-80">{msg.text?.substring(0, 80).replace(/\n/g, ' ')}...</p>
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* 邮件正文详情 */}
                      <div className={`
                        ${selectedMessage ? 'w-full md:w-2/3 lg:w-3/4 flex flex-col' : 'hidden md:flex md:w-2/3 lg:w-3/4 items-center justify-center bg-slate-200 dark:bg-slate-950'} 
                        h-full overflow-hidden transition-all bg-white dark:bg-slate-900 z-30 absolute md:static inset-0
                      `}>
                          {selectedMessage ? (
                              <>
                                  <div className="p-4 md:p-10 border-b border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 shadow-lg z-20">
                                      <button onClick={handleBackToInbox} className="md:hidden mb-4 flex items-center gap-2 text-primary-600 font-black text-sm active:scale-95 transition-all"><ChevronLeft className="w-5 h-5" /> 返回列表</button>
                                      <h2 className="text-lg md:text-3xl font-black text-slate-900 dark:text-white mb-4 md:mb-8 leading-tight">{selectedMessage.subject}</h2>
                                      <div className="flex flex-col sm:flex-row md:items-center justify-between gap-4 bg-slate-100 dark:bg-slate-900/50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-200 dark:border-slate-700 transition-all">
                                          <div className="flex gap-3 md:gap-5 items-center min-w-0">
                                              <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-primary-600 text-white flex items-center justify-center font-black text-lg md:text-2xl shadow-xl">
                                                  {selectedMessage.from ? selectedMessage.from[0].toUpperCase() : '?'}
                                              </div>
                                              <div className="min-w-0">
                                                  <p className="font-black text-slate-800 dark:text-slate-100 text-xs md:text-base truncate">{selectedMessage.from}</p>
                                                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 mt-0.5 uppercase tracking-widest">同步于 {formatBeijingTime(selectedMessage.date)}</p>
                                              </div>
                                          </div>
                                          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                                              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border-2 border-primary-100 dark:border-primary-800 shadow-sm w-fit self-start sm:self-auto">
                                                  <Paperclip className="w-3.5 h-3.5 text-primary-600" />
                                                  <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest">{selectedMessage.attachments.length} 个附件就绪</span>
                                              </div>
                                          )}
                                      </div>
                                      
                                      {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                                          <div className="mt-4 md:mt-8 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 overflow-x-auto no-scrollbar pb-1">
                                              {selectedMessage.attachments.map((att, i) => (
                                                  <button 
                                                      key={i}
                                                      onClick={() => handleDownloadAttachment(att)}
                                                      className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl text-[10px] font-black text-slate-700 dark:text-slate-200 border-2 border-slate-100 dark:border-slate-600 hover:border-primary-500 whitespace-nowrap group"
                                                  >
                                                      {getAttachmentIcon(att.filename)}
                                                      <span className="truncate max-w-[120px] md:max-w-[200px]">{att.filename}</span>
                                                      <Download className="w-3.5 h-3.5 opacity-20 group-hover:opacity-100" />
                                                  </button>
                                              ))}
                                          </div>
                                      )}
                                  </div>

                                  <div className="flex-1 overflow-y-auto p-4 md:p-12 bg-slate-200 dark:bg-slate-950 custom-scrollbar">
                                      {isLoadingMessage ? (
                                          <div className="bg-white dark:bg-slate-800 p-14 rounded-[3rem] shadow-2xl min-h-full flex items-center justify-center">
                                              <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                                          </div>
                                      ) : selectedMessage.html ? (
                                          <div 
                                              className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-800 p-6 md:p-14 rounded-2xl md:rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-700 min-h-full transition-all"
                                              dangerouslySetInnerHTML={{ __html: selectedMessage.html }}
                                          />
                                      ) : (
                                          <div className="bg-white dark:bg-slate-800 p-6 md:p-14 rounded-2xl md:rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-700 min-h-full">
                                              <pre className="whitespace-pre-wrap font-sans text-xs md:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">{selectedMessage.text || ''}</pre>
                                          </div>
                                      )}
                                  </div>
                              </>
                          ) : (
                              <div className="text-center opacity-20 flex flex-col items-center animate-in fade-in p-10">
                                  <Mail className="w-24 h-24 md:w-32 md:h-32 mb-8" />
                                  <p className="font-black text-slate-500 uppercase tracking-widest text-xs md:text-sm">选择左侧列表邮件以进入查阅模式</p>
                              </div>
                          )}
                      </div>
                  </div>
              )
          )}

          {activeTab === 'compose' && (
              <div className="max-w-4xl mx-auto p-3 md:p-12 h-full flex flex-col bg-slate-200 dark:bg-slate-900 transition-all">
                  <div className="bg-white dark:bg-slate-800 rounded-3xl md:rounded-[3rem] border border-slate-300 dark:border-slate-700 shadow-2xl flex-1 flex flex-col overflow-hidden animate-in zoom-in-95">
                      <div className="p-4 md:p-8 border-b border-slate-100 dark:border-slate-700 space-y-4 md:space-y-6 bg-slate-50 dark:bg-slate-900/50">
                          <div className="flex items-center gap-3">
                              <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 md:w-20">收件人</span>
                              <input 
                                  className="flex-1 text-xs md:text-sm py-2 bg-transparent outline-none text-slate-900 dark:text-white font-black border-b border-slate-200 dark:border-slate-700 focus:border-primary-500 transition-all"
                                  placeholder="业务方邮件地址..."
                                  value={composeTo}
                                  onChange={e => setComposeTo(e.target.value)}
                              />
                          </div>
                          <div className="flex items-center gap-3">
                              <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 md:w-20">主 题</span>
                              <input 
                                  className="flex-1 text-sm md:text-xl font-black py-1.5 bg-transparent outline-none text-slate-900 dark:text-white focus:border-b focus:border-primary-500 transition-all"
                                  placeholder="业务函件正式名称..."
                                  value={composeSubject}
                                  onChange={e => setComposeSubject(e.target.value)}
                              />
                          </div>
                      </div>
                      <textarea 
                          className="flex-1 p-5 md:p-12 resize-none outline-none text-slate-800 dark:text-slate-100 bg-transparent text-sm md:text-base leading-relaxed custom-scrollbar font-medium"
                          placeholder="请在此输入您的业务邮件内容..."
                          value={composeBody}
                          onChange={e => setComposeBody(e.target.value)}
                      />
                      <div className="p-4 md:p-8 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 md:gap-6 transition-all shrink-0">
                          <button onClick={() => setActiveTab('inbox')} className="px-6 py-2.5 md:px-8 md:py-3 text-slate-500 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 rounded-xl transition-all">返回收件箱</button>
                          <button 
                              onClick={handleSendEmail} 
                              disabled={isSending}
                              className="px-8 py-2.5 md:px-12 md:py-3 bg-primary-600 text-white rounded-xl md:rounded-2xl font-black shadow-xl flex items-center gap-2 transition-all hover:bg-primary-700 disabled:opacity-50 uppercase tracking-widest text-[10px]"
                          >
                              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> 发送函件</>}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'settings' && (
              <div className="h-full overflow-y-auto p-4 md:p-12 pb-32 bg-slate-200 dark:bg-slate-900 transition-all">
                  <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 rounded-3xl md:rounded-[3rem] border border-slate-300 dark:border-slate-700 shadow-2xl p-6 md:p-16 animate-in slide-in-from-top-4">
                      <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12">
                          <div className="p-3 md:p-4 bg-primary-600 text-white rounded-2xl md:rounded-3xl shadow-xl transition-all flex-shrink-0"><Settings className="w-6 h-6 md:w-10 md:h-10" /></div>
                          <div>
                              <h3 className="text-xl md:text-3xl font-black text-slate-800 dark:text-white">QQ 业务邮箱协议配置</h3>
                              <p className="text-[8px] md:text-[10px] text-slate-400 font-black mt-1 uppercase tracking-widest">支持个人 QQ/企业 QQ/腾讯企业邮</p>
                          </div>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-800 mb-10 flex gap-4 animate-in fade-in duration-700">
                          <HelpCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
                              <p className="font-black mb-1">关键提示：</p>
                              QQ 邮箱处于安全考虑，必须使用 <span className="underline font-black">16 位授权码</span> 代替账号登录密码。
                              <a href="https://service.mail.qq.com/cgi-bin/help?subtype=1&&id=28&&no=1001256" target="_blank" rel="noreferrer" className="ml-2 text-primary-600 font-black hover:underline">如何获取授权码？</a>
                          </div>
                      </div>
                      
                      <div className="space-y-8 md:space-y-10">
                          <div className="grid grid-cols-1 gap-6">
                              <div>
                                  <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1.5 tracking-widest pl-1">邮箱账户</label>
                                  <input 
                                      className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-xl md:rounded-2xl px-5 py-3 md:py-4 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-black outline-none focus:border-primary-600 focus:bg-white transition-all shadow-inner text-xs md:text-sm"
                                      placeholder="例如：yourname@qq.com"
                                      value={settingForm.email}
                                      onChange={e => setSettingForm({...settingForm, email: e.target.value})}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[9px] md:text-[10px] font-black text-slate-500 uppercase mb-1.5 tracking-widest flex justify-between items-center pl-1">
                                      <span>16 位登录授权码 (非密码)</span>
                                  </label>
                                  <input 
                                      type="password"
                                      className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-xl md:rounded-2xl px-5 py-3 md:py-4 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-black outline-none focus:border-primary-600 focus:bg-white transition-all shadow-inner text-xs md:text-sm"
                                      placeholder="在此粘贴生成的授权码 (中间无空格)"
                                      value={settingForm.authCode}
                                      onChange={e => setSettingForm({...settingForm, authCode: e.target.value.replace(/\s+/g, '')})}
                                  />
                              </div>
                          </div>

                          <div className="p-5 md:p-8 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl md:rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700">
                                <div className="flex items-center justify-between mb-6 md:mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center flex-shrink-0"><Globe className="w-4 h-4 text-primary-500" /></div>
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">收信 (IMAP) 服务</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setSettingForm({...settingForm, imapHost: 'imap.qq.com', imapPort: 993})} className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-[8px] font-black text-slate-400 hover:text-primary-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">个人 QQ 预设</button>
                                        <button onClick={() => setSettingForm({...settingForm, imapHost: 'hwimap.exmail.qq.com', imapPort: 993})} className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-[8px] font-black text-slate-400 hover:text-primary-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">企业邮预设</button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="md:col-span-2">
                                        <label className="block text-[8px] md:text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">服务器主机</label>
                                        <input className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs md:text-sm font-black bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-primary-500 shadow-sm" value={settingForm.imapHost} onChange={e => setSettingForm({...settingForm, imapHost: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] md:text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">SSL 端口</label>
                                        <input type="number" className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs md:text-sm font-mono font-black bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-primary-500 shadow-sm" value={settingForm.imapPort} onChange={e => setSettingForm({...settingForm, imapPort: Number(e.target.value)})} />
                                    </div>
                                </div>
                          </div>

                          <div className="p-5 md:p-8 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl md:rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700">
                                <div className="flex items-center justify-between mb-6 md:mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center flex-shrink-0"><Send className="w-4 h-4 text-emerald-500" /></div>
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">发信 (SMTP) 服务</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setSettingForm({...settingForm, smtpHost: 'smtp.qq.com', smtpPort: 465})} className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-[8px] font-black text-slate-400 hover:text-emerald-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">个人 QQ 预设</button>
                                        <button onClick={() => setSettingForm({...settingForm, smtpHost: 'hwsmtp.exmail.qq.com', smtpPort: 465})} className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-[8px] font-black text-slate-400 hover:text-emerald-600 transition-colors border border-slate-100 dark:border-slate-600 shadow-sm">企业邮预设</button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="md:col-span-2">
                                        <label className="block text-[8px] md:text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">服务器主机</label>
                                        <input className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs md:text-sm font-black bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-primary-500 shadow-sm" value={settingForm.smtpHost} onChange={e => setSettingForm({...settingForm, smtpHost: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] md:text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">SSL 端口</label>
                                        <input type="number" className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs md:text-sm font-mono font-black bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-primary-500 shadow-sm" value={settingForm.smtpPort} onChange={e => setSettingForm({...settingForm, smtpPort: Number(e.target.value)})} />
                                    </div>
                                </div>
                          </div>
                      </div>

                      <div className="mt-12 md:mt-16 flex flex-col sm:flex-row justify-end gap-4 border-t-2 border-slate-50 dark:border-slate-700 pt-8 md:pt-10 transition-all">
                          <button onClick={() => setActiveTab('inbox')} className="order-2 sm:order-1 px-8 py-3 text-slate-500 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 rounded-xl transition-all">取消修改</button>
                          <button 
                              onClick={handleSaveSettings}
                              className="order-1 sm:order-2 bg-primary-600 text-white px-10 py-3 rounded-xl md:rounded-2xl font-black shadow-2xl shadow-primary-500/30 hover:bg-primary-700 active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
                          >
                              <Save className="w-4 h-4" /> 确认保存并建立同步
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default EmailClient;

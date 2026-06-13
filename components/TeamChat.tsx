
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChatMessage, ChatChannel, User, Project, Attachment, MessageType, ChatAnnouncement } from '../types';
import { Send, Hash, Users, MessageSquare, Plus, Search, Paperclip, X, Image as ImageIcon, FileText, Lock, Settings, User as UserIcon, Trash2, Download, ChevronLeft, Smile, FileDown, Pin, Megaphone, MoreVertical, ShieldCheck, Check, ChevronDown } from 'lucide-react';
import { formatBeijingTime, MAX_FILE_SIZE } from '../constants';

const API_URL = (window as any)._env_?.API_URL || '/api';

// Common Emojis List
const EMOJIS = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '🙃', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '温暖', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👍', '👎', '👏', '🤝', '👌', '✌️', '👊', '✊', '👋', '💪', '🙏', '💍', '💄', '💋', '💎', '❤️', '💔', '⭐', '💥', '🔥', '💧', '💤', '🎶', '☀️', '🌙', '🌈', '🌏', '📱', '💻', '📷', '📹', '📺', '📻', '📢', '🔔', '🔓', '🔒', '🔑', '🔨', '🔧', '⚙️', '🛒', '🎁', '🎈', '🎉', '🎊', '📅', '📋', '📌', '📎', '📊', '📈', '📉', '✉️', '📦', '📧', '📥', '📤'];

interface TeamChatProps {
  currentUser: User;
  messages: ChatMessage[];
  channels: ChatChannel[];
  projects: Project[];
  users: User[];
  onSendMessage: (msg: ChatMessage) => void;
  onDeleteMessage: (id: string) => void;
  onAddChannel: (channel: ChatChannel) => void;
  onUpdateChannel?: (channel: ChatChannel) => void; 
  onDeleteChannel?: (channelId: string) => void;
  onExportData?: () => void;
  lastReadMap: Record<string, string>;
  onMarkRead: (channelId: string) => void;
  activeChannelId: string;
  onChannelSelect: (channelId: string) => void;
  
  // Announcements
  announcements: ChatAnnouncement[];
  onAddAnnouncement: (ann: ChatAnnouncement) => void;
  onUpdateAnnouncement: (ann: ChatAnnouncement) => void;
  onDeleteAnnouncement: (id: string) => void;
}

const TeamChat: React.FC<TeamChatProps> = ({ 
  currentUser, 
  messages, 
  channels, 
  projects, 
  users, 
  onSendMessage,
  onDeleteMessage,
  onAddChannel,
  onUpdateChannel,
  onDeleteChannel,
  onExportData,
  lastReadMap,
  onMarkRead,
  activeChannelId,
  onChannelSelect,
  announcements,
  onAddAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Mobile View State: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Modals
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [showAnnounceList, setShowAnnounceList] = useState(false);
  
  // Forms
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  
  const [announceContent, setAnnounceContent] = useState('');
  const [announcePinned, setAnnouncePinned] = useState(false);
  const [editingAnnounce, setEditingAnnounce] = useState<ChatAnnouncement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true); 

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Derived Data
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const isAdmin = currentUser.role === 'Admin';
  
  const isChannelCreator = activeChannel?.creatorId === currentUser.id;
  const isChannelAdmin = isChannelCreator || activeChannel?.admins?.includes(currentUser.id) || isAdmin;

  // 在线状态判定核心函数：如果最后活跃时间在 60 秒内，视为在线
  const checkIsOnline = (userId: string) => {
      const u = users.find(user => user.id === userId);
      if (!u || !u.lastActive) return false;
      const lastActiveDate = new Date(u.lastActive);
      const now = new Date();
      return (now.getTime() - lastActiveDate.getTime()) < 60000;
  };

  const accessibleChannels = useMemo(() => {
    return channels.filter(c => {
        if (c.type === 'General') return true;
        if (c.type === 'Project' && isAdmin) return true; 
        return c.participants?.includes(currentUser.id);
    });
  }, [channels, currentUser, isAdmin]);

  useEffect(() => {
      if (activeChannelId) {
          setMobileView('chat');
      } else {
          setMobileView('list');
      }
  }, [activeChannelId]);

  useEffect(() => {
      if (!activeChannelId) return;
      onMarkRead(activeChannelId);
  }, [activeChannelId, messages.length]); 

  const getUnreadCount = (channelId: string) => {
      if (channelId === activeChannelId) return 0;
      const lastRead = lastReadMap[channelId] || '1970-01-01';
      return messages.filter((m: ChatMessage) => m.channelId === channelId && m.timestamp > lastRead).length;
  };

  const filteredChannels = useMemo(() => {
      const term = searchTerm.toLowerCase();
      if (!term) return accessibleChannels;
      return accessibleChannels.filter((c: ChatChannel) => {
          if (c.name.toLowerCase().includes(term)) return true;
          if (c.type === 'Private') {
              const otherId = c.participants?.find((id: string) => id !== currentUser.id);
              const otherUser = users.find((u: User) => u.id === otherId);
              if (otherUser && otherUser.nickname.toLowerCase().includes(term)) return true;
          }
          return false;
      });
  }, [accessibleChannels, searchTerm, users, currentUser]);

  const channelAnnouncements = useMemo(() => {
      if (!activeChannelId) return [];
      return announcements.filter((a: ChatAnnouncement) => a.channelId === activeChannelId).sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [announcements, activeChannelId]);

  // 获取当前频道的置顶公告（如果有多个，取最新的一条）
  const pinnedAnnouncement = useMemo(() => {
      return channelAnnouncements.find(a => a.isPinned) || null;
  }, [channelAnnouncements]);

  const generalChannels = filteredChannels.filter(c => c.type === 'General');
  const projectChannels = filteredChannels.filter(c => c.type === 'Project');
  const groupChannels = filteredChannels.filter(c => c.type === 'Group');
  const privateChannels = filteredChannels.filter(c => c.type === 'Private');

  const getChannelDisplayName = (channel: ChatChannel) => {
      if (channel.type === 'Private') {
          const otherUserId = channel.participants?.find(id => id !== currentUser.id);
          const otherUser = users.find(u => u.id === otherUserId);
          return otherUser ? otherUser.nickname : '未知用户';
      }
      return channel.name;
  };

  const getChannelAvatar = (channel: ChatChannel) => {
      if (channel.type === 'Private') {
          const otherUserId = channel.participants?.find(id => id !== currentUser.id);
          const otherUser = users.find(u => u.id === otherUserId);
          return otherUser?.avatar;
      }
      return undefined;
  };

  /**
   * 获取私聊频道的对方用户ID
   * 修复类型推断：通过显式返回类型并使用 ?? 运算符，确保不返回 null
   */
  const getChannelOtherUserId = (channel?: ChatChannel): string | undefined => {
      if (channel?.type === 'Private') {
          const found = channel.participants?.find((id: string) => id !== currentUser.id);
          return found ?? undefined;
      }
      return undefined;
  };

  const channelMessages = useMemo(() => {
      return messages
        .filter(m => m.channelId === activeChannelId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, activeChannelId]);

  const scrollToBottom = (force = false) => {
      if (force || isNearBottomRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: force ? 'auto' : 'smooth' });
      }
  };

  const handleScroll = () => {
      if (messagesContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
          isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
      }
  };

  useEffect(() => {
      scrollToBottom(true);
  }, [activeChannelId]);

  useEffect(() => {
      const lastMsg = channelMessages[channelMessages.length - 1];
      if (lastMsg && lastMsg.userId === currentUser.id) {
          scrollToBottom(true);
      } else {
          scrollToBottom();
      }
  }, [channelMessages.length, currentUser.id]);

  const handleChannelSelect = (channelId: string) => {
      onChannelSelect(channelId);
      setMobileView('chat'); 
      setSearchTerm(''); 
  };

  const handleBackToList = () => {
      onChannelSelect(''); 
      setMobileView('list');
  };

  const handleAddEmoji = (emoji: string) => {
      setNewMessage(prev => prev + emoji);
      setShowEmojiPicker(false);
  };

  const handleSendMessage = () => {
      if ((!newMessage.trim() && attachments.length === 0) || isUploading) return;

      const msgType: MessageType = attachments.length > 0 ? 'file' : 'text';

      const msg: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          channelId: activeChannelId,
          userId: currentUser.id,
          userName: currentUser.nickname,
          userAvatar: currentUser.avatar,
          content: newMessage,
          type: msgType,
          timestamp: new Date().toISOString(),
          attachments: [...attachments],
      };

      setNewMessage('');
      setAttachments([]);
      setShowEmojiPicker(false);
      setTimeout(() => onSendMessage(msg), 0);
  };

  const uploadFile = async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
          alert(`文件过大 (超过 ${(MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(1)}GB)，请使用其他方式传输。`);
          return;
      }
      setUploadingCount(prev => prev + 1);
      try {
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
          if (!uploadRes.ok) throw new Error('Upload failed');
          const fileData = await uploadRes.json();
          
          const newAtt: Attachment = {
              id: Math.random().toString(36).substr(2, 9),
              name: file.name,
              url: fileData.url,
              uploadDate: new Date().toISOString(),
              type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
              size: (file.size / 1024).toFixed(1) + ' KB'
          };
          setAttachments(prev => [...prev, newAtt]);
      } catch (error) {
          alert("文件上传失败");
      } finally {
          setUploadingCount(prev => Math.max(0, prev - 1));
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
      if(e.target) e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
          const items = e.clipboardData.items;
          for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                  const file = items[i].getAsFile();
                  if (file) {
                      uploadFile(file);
                      e.preventDefault();
                  }
              }
          }
      }
  };

  const handleDeleteMsg = (id: string) => {
      if (window.confirm("确定要删除这条消息吗？")) {
          onDeleteMessage(id);
      }
  };

  const handleDownload = (url: string, filename: string) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleCreateGroup = () => {
      if (!newGroupName) return alert("请输入群组名称");
      if (selectedMembers.length === 0) return alert("请至少选择一个成员");

      const newChannel: ChatChannel = {
          id: `grp-${Date.now()}`,
          name: newGroupName,
          type: 'Group',
          participants: [...selectedMembers, currentUser.id],
          creatorId: currentUser.id,
          createdAt: new Date().toISOString()
      };

      onAddChannel(newChannel);
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
      onChannelSelect(newChannel.id);
      setMobileView('chat');
  };

  const handleStartPrivateChat = (targetUserId: string) => {
      const existing = channels.find((c: ChatChannel) => 
          c.type === 'Private' && 
          c.participants?.includes(currentUser.id) && 
          c.participants?.includes(targetUserId)
      );

      if (existing) {
          onChannelSelect(existing.id);
      } else {
          const targetUser = users.find((u: User) => u.id === targetUserId);
          const newChannel: ChatChannel = {
              id: `dm-${Date.now()}`,
              name: `${currentUser.nickname}, ${targetUser?.nickname}`, 
              type: 'Private',
              participants: [currentUser.id, targetUserId],
              createdAt: new Date().toISOString()
          };
          onAddChannel(newChannel);
          onChannelSelect(newChannel.id);
      }
      setMobileView('chat');
  };

  const handleUpdateMembers = () => {
      if (!activeChannel || !onUpdateChannel) return;
      const finalMembers = [...new Set([...selectedMembers, currentUser.id])];
      
      onUpdateChannel({
          ...activeChannel,
          participants: finalMembers,
          admins: selectedAdmins
      });
      setShowManageMembers(false);
  };

  const openManageMembers = () => {
      if (!activeChannel?.participants) return;
      setSelectedMembers(activeChannel.participants.filter(id => id !== currentUser.id));
      setSelectedAdmins(activeChannel.admins || []);
      setShowManageMembers(true);
  };

  const handleSaveAnnouncement = () => {
      if (!announceContent) return alert("内容不能为空");
      
      if (editingAnnounce) {
          onUpdateAnnouncement({
              ...editingAnnounce,
              content: announceContent,
              isPinned: announcePinned
          });
      } else {
          onAddAnnouncement({
              id: Math.random().toString(36).substr(2, 9),
              channelId: activeChannelId,
              content: announceContent,
              isPinned: announcePinned,
              creatorId: currentUser.id,
              creatorName: currentUser.nickname,
              createdAt: new Date().toISOString()
          });
      }
      setShowAnnounceModal(false);
      setAnnounceContent('');
      setAnnouncePinned(false);
      setEditingAnnounce(null);
  };

  const formatTime = (iso: string) => {
      return formatBeijingTime(iso, { hour: '2-digit', minute: '2-digit' }).split(' ')[1] || '';
  };

  // 在线状态小圆点组件
  const StatusDot = ({ userId }: { userId?: string }) => {
      if (!userId) return null;
      const online = checkIsOnline(userId);
      return (
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 transition-all ${online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
      );
  };

  const renderChannelButton = (c: ChatChannel, icon: React.ReactNode) => {
      const unreadCount = getUnreadCount(c.id);
      const isPrivate = c.type === 'Private';
      const otherUserId = getChannelOtherUserId(c);
      
      const canDelete = onDeleteChannel && (
          isPrivate || 
          (c.type === 'Group' && (isAdmin || c.creatorId === currentUser.id))
      );
      
      return (
        <div key={c.id} className="flex items-center group relative mb-1">
            <button 
                onClick={() => handleChannelSelect(c.id)} 
                className={`flex-1 flex items-center justify-between px-3 py-3 md:py-2 rounded-lg text-sm font-medium transition-colors ${activeChannelId === c.id ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-600 dark:text-primary-300 hover:bg-slate-300 dark:hover:bg-slate-800'}`}
            >
                <div className="flex items-center min-w-0">
                    <div className="relative">
                        {icon}
                        {isPrivate && <StatusDot userId={otherUserId} />}
                    </div>
                    <span className="truncate">{isPrivate ? getChannelDisplayName(c) : c.name}</span>
                </div>
                {unreadCount > 0 && (
                    <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full ml-2 shadow-sm border border-white dark:border-slate-900 animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>
            {canDelete && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteChannel && onDeleteChannel(c.id); }}
                    className="absolute right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title={isPrivate ? "删除会话" : "解散群组"}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
      );
  };

  const groupedMessages = useMemo(() => {
      const groups: { date: string; msgs: ChatMessage[] }[] = [];
      channelMessages.forEach(msg => {
          const date = formatBeijingTime(msg.timestamp, { year: 'numeric', month: 'long', day: 'numeric' }).split(' ')[0];
          const lastGroup = groups[groups.length - 1];
          if (lastGroup && lastGroup.date === date) {
              lastGroup.msgs.push(msg);
          } else {
              groups.push({ date, msgs: [msg] });
          }
      });
      return groups;
  }, [channelMessages]);

  return (
    <div className="flex h-full bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-300 dark:border-slate-700 overflow-hidden relative transition-all">
        {/* Left Sidebar / List View */}
        <div className={`
            w-full md:w-80 bg-slate-200 dark:bg-slate-850 border-r border-slate-300 dark:border-slate-700 flex-col flex-shrink-0 absolute md:static inset-0 z-20 transition-transform duration-300 ease-in-out md:flex
            ${mobileView === 'list' ? 'flex' : 'hidden'}
        `}>
            {/* List Header */}
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/50 backdrop-blur-sm">
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="搜索内容、频道..." 
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white shadow-inner"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    {isAdmin && (
                        <button 
                            onClick={() => { setNewGroupName(''); setSelectedMembers([]); setShowCreateGroup(true); }}
                            className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-primary-700 transition-all shadow-md active:scale-95"
                        >
                            <Plus className="w-3.5 h-3.5" /> 建立新群组
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-6 custom-scrollbar">
                {searchTerm && filteredChannels.length === 0 && <div className="text-center text-slate-500 text-xs mt-10 italic">未发现匹配项</div>}
                
                {generalChannels.length > 0 && (<div><h3 className="px-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-3">公共频道</h3>{generalChannels.map(c => renderChannelButton(c, <Hash className="w-4 h-4 mr-2 opacity-70 flex-shrink-0" />))}</div>)}
                {projectChannels.length > 0 && (<div><h3 className="px-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-3">项目协作</h3>{projectChannels.map(c => renderChannelButton(c, <Users className="w-4 h-4 mr-2 opacity-70 flex-shrink-0" />))}</div>)}
                {groupChannels.length > 0 && (<div><h3 className="px-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-3">部门/讨论组</h3>{groupChannels.map(c => renderChannelButton(c, <MessageSquare className="w-4 h-4 mr-2 opacity-70 flex-shrink-0" />))}</div>)}
                
                <div>
                    <h3 className="px-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-3">{searchTerm ? '结果: 私信' : '私密对话'}</h3>
                    {privateChannels.map(c => {
                        const avatar = getChannelAvatar(c);
                        return renderChannelButton(c, <div className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 mr-2 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-600 shadow-sm">{avatar ? <img src={avatar} className="w-full h-full object-cover"/> : <UserIcon className="w-4 h-4 m-1 text-slate-400" />}</div>);
                    })}
                    {!searchTerm && (
                        <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-700 px-3">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">快速发起聊天:</p>
                            <div className="space-y-1">
                                {users.filter(u => u.id !== currentUser.id).slice(0, 8).map(u => (
                                    <button key={u.id} onClick={() => handleStartPrivateChat(u.id)} className="flex items-center gap-2 w-full py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg px-2 transition-all font-bold group">
                                        <div className="relative w-5 h-5 rounded-md bg-white dark:bg-slate-700 overflow-hidden border border-slate-100 group-hover:border-primary-200 shadow-sm">
                                            <img src={u.avatar} className="w-full h-full object-cover"/>
                                            <StatusDot userId={u.id} />
                                        </div>
                                        {u.nickname}
                                        {checkIsOnline(u.id) && <span className="text-[8px] text-emerald-500 ml-auto font-black uppercase tracking-tighter">Online</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Chat Area */}
        <div className={`
            flex-1 flex-col min-w-0 bg-white dark:bg-slate-800 relative h-full md:flex transition-all
            ${mobileView === 'chat' ? 'flex fixed inset-0 z-30' : 'hidden'}
        `}>
            <div className="h-16 md:h-16 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between px-4 md:px-6 bg-white dark:bg-slate-800 shrink-0 shadow-sm z-40 relative">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                     <button 
                        onClick={handleBackToList}
                        className="md:hidden flex-shrink-0 w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-colors shadow-sm"
                     >
                        <ChevronLeft className="w-6 h-6" />
                     </button>
                     <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                         <div className="flex-shrink-0 p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">{activeChannel?.type === 'General' ? <Hash className="w-5 h-5 text-primary-500" /> : activeChannel?.type === 'Private' ? <Lock className="w-4 h-4 text-orange-500" /> : <Users className="w-5 h-5 text-emerald-500" />}</div>
                         <div className="flex flex-col min-w-0">
                            <h2 className="text-lg font-black text-slate-800 dark:text-white truncate transition-colors">{activeChannel ? getChannelDisplayName(activeChannel) : '选择一个频道开始沟通'}</h2>
                            {activeChannel?.type === 'Private' && (
                                <span className={`text-[9px] font-black uppercase tracking-widest ${checkIsOnline(getChannelOtherUserId(activeChannel) || '') ? 'text-emerald-500' : 'text-slate-400'}`}>
                                    {checkIsOnline(getChannelOtherUserId(activeChannel) || '') ? '当前在线' : '离线中'}
                                </span>
                            )}
                         </div>
                     </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    {activeChannelId && (activeChannel?.type !== 'Private') && (
                        <button 
                            onClick={() => setShowAnnounceList(true)}
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl relative transition-all"
                            title="公告栏"
                        >
                            <Megaphone className="w-5 h-5" />
                            {channelAnnouncements.length > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>}
                        </button>
                    )}

                    {activeChannel && (activeChannel.type === 'Project' || activeChannel.type === 'Group') && isChannelCreator && <button onClick={openManageMembers} className="p-2 text-slate-500 dark:text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"><Settings className="w-5 h-5" /></button>}
                    {activeChannel?.participants && (
                        <div className="hidden sm:flex text-[10px] font-black text-slate-500 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-600 items-center gap-1.5 transition-colors">
                            <UserIcon className="w-3 h-3" /> 
                            {activeChannel.participants.length} 人在线 
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5"></span>
                        </div>
                    )}
                </div>
            </div>

            {/* 置顶公告栏 (Pinned Announcement Bar) */}
            {activeChannelId && pinnedAnnouncement && (
                <div className="bg-orange-50 dark:bg-orange-950/30 border-b border-orange-100 dark:border-orange-900/50 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2 duration-500 z-30 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-1.5 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex-shrink-0">
                            <Pin className="w-3.5 h-3.5 text-orange-600 fill-current" />
                        </div>
                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setShowAnnounceList(true)}>
                            <p className="text-xs font-black text-orange-800 dark:text-orange-200 truncate leading-none mb-1">
                                置顶公告: <span className="font-medium text-orange-700 dark:text-orange-300 ml-1">{pinnedAnnouncement.content}</span>
                            </p>
                            <p className="text-[9px] font-bold text-orange-400 dark:text-orange-500 uppercase tracking-widest">
                                由 {pinnedAnnouncement.creatorName} 发布 · {formatBeijingTime(pinnedAnnouncement.createdAt).split(' ')[1]}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowAnnounceList(true)}
                        className="ml-4 p-2 text-orange-400 hover:text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded-lg transition-all"
                        title="查看公告列表"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div 
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-slate-200/50 dark:bg-slate-900/40 overscroll-none transition-all custom-scrollbar"
                ref={messagesContainerRef}
                onScroll={handleScroll}
            >
                {groupedMessages.map((group, idx) => (
                    <div key={idx} className="space-y-8">
                        <div className="flex items-center justify-center"><span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/80 dark:bg-slate-800/80 backdrop-blur px-4 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm">{group.date}</span></div>
                        {group.msgs.map(msg => {
                            const isMe = msg.userId === currentUser.id;
                            const hasImages = msg.attachments?.some((att: Attachment) => ['JPG','PNG','JPEG','GIF','WEBP'].includes(att.type));
                            const canDelete = isMe || isAdmin;

                            return (
                                <div key={msg.id} className={`flex gap-4 group ${isMe ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white dark:bg-slate-700 border-2 border-white dark:border-slate-600 shadow-md overflow-hidden transition-transform group-hover:scale-105"><img src={msg.userAvatar} alt={msg.userName} className="w-full h-full object-cover" /></div>
                                        <StatusDot userId={msg.userId} />
                                    </div>
                                    <div className={`flex flex-col max-w-[80%] md:max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-2.5 mb-1.5">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 transition-colors">{msg.userName}</span>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 transition-colors">{formatTime(msg.timestamp)}</span>
                                            {canDelete && (
                                                <button 
                                                    onClick={() => handleDeleteMsg(msg.id)} 
                                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        {msg.content && (<div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-md mb-2 transition-all ${isMe ? 'bg-primary-600 text-white rounded-tr-none shadow-primary-500/20' : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-tl-none'}`}><p className="whitespace-pre-wrap break-words font-medium">{msg.content}</p>{msg.relatedId && (<div className="mt-2 pt-2 border-t border-white/20 text-[10px] font-black uppercase tracking-widest opacity-70">REF: {msg.relatedId}</div>)}</div>)}
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="space-y-2.5 w-full">
                                                {hasImages && (<div className={`grid gap-2.5 ${msg.attachments.filter((a: Attachment) => ['JPG','PNG','JPEG','GIF','WEBP'].includes(a.type)).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{msg.attachments.filter((att: Attachment) => ['JPG','PNG','JPEG','GIF','WEBP'].includes(att.type)).map((att: Attachment) => (<div key={att.id} className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm" onClick={() => setPreviewImage(att.url)}><img src={att.url} alt={att.name} className="w-full h-auto max-h-80 object-contain transition-transform group-hover:scale-105" onLoad={() => scrollToBottom(false)}/></div>))}</div>)}
                                                {msg.attachments.filter((att: Attachment) => !['JPG','PNG','JPEG','GIF','WEBP'].includes(att.type)).map((att: Attachment) => (<div key={att.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 text-xs w-full transition-all hover:shadow-lg ${isMe ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-100 dark:border-primary-800 text-primary-900 dark:text-primary-200' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'} group/file`}><div className="flex items-center gap-3 overflow-hidden font-bold"><div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-inner transition-colors group-hover/file:bg-primary-50"><FileText className="w-5 h-5 flex-shrink-0 text-primary-500" /></div><span className="truncate">{att.name}</span></div><button onClick={() => handleDownload(att.url, att.name)} className="p-2 hover:bg-primary-100 dark:hover:bg-slate-600 rounded-lg transition-colors"><Download className="w-4 h-4" /></button></div>))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-300 dark:border-slate-700 relative transition-all">
                {showEmojiPicker && (<div className="absolute bottom-full left-4 mb-4 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-2xl rounded-[2rem] p-5 w-80 h-72 overflow-y-auto grid grid-cols-8 gap-1.5 z-50 animate-in slide-in-from-bottom-4">{EMOJIS.map(e => (<button key={e} onClick={() => handleAddEmoji(e)} className="text-2xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl p-2 flex items-center justify-center transition-all hover:scale-125">{e}</button>))}</div>)}
                {attachments.length > 0 && (<div className="flex flex-wrap gap-2.5 mb-4 animate-in slide-in-from-left-2">{attachments.map(att => (<div key={att.id} className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 border-primary-100 dark:border-primary-800 shadow-sm"><span className="truncate max-w-[180px]">{att.name}</span><button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="hover:text-red-500 p-1"><X className="w-3.5 h-3.5" /></button></div>))}</div>)}
                <div className="flex gap-3 items-end max-w-5xl mx-auto">
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-3 rounded-xl transition-all shadow-sm ${showEmojiPicker ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-primary-600 hover:bg-white border-2 border-transparent hover:border-primary-100'}`} title="表情"><Smile className="w-6 h-6 md:w-5 md:h-5" /></button>
                    <button onClick={() => imageInputRef.current?.click()} className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-primary-600 hover:bg-white border-2 border-transparent hover:border-primary-100 rounded-xl transition-all shadow-sm" disabled={isUploading} title="发送图片"><ImageIcon className="w-6 h-6 md:w-5 md:h-5" /></button>
                    <input type="file" id="imageInput" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="hidden sm:block p-3 bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-primary-600 hover:bg-white border-2 border-transparent hover:border-primary-100 rounded-xl transition-all shadow-sm" disabled={isUploading} title="发送文件"><Paperclip className="w-5 h-5" /></button>
                    <input type="file" id="fileInput" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    <div className="flex-1 bg-slate-100 dark:bg-slate-700/50 rounded-2xl border-2 border-slate-200 dark:border-slate-600 focus-within:border-primary-500 focus-within:bg-white dark:focus-within:bg-slate-700 transition-all shadow-inner overflow-hidden">
                        <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} onPaste={handlePaste} placeholder={isUploading ? "文件正在极速同步..." : "输入消息内容 (Shift+Enter换行)..."} className="w-full bg-transparent border-none focus:ring-0 p-4 max-h-40 min-h-[48px] resize-none text-base md:text-sm dark:text-white dark:placeholder-slate-500 placeholder:text-slate-400 font-medium" rows={1} />
                    </div>
                    <button onClick={handleSendMessage} disabled={(!newMessage.trim() && attachments.length === 0) || isUploading} className="p-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-xl shadow-primary-500/20 transition-all active:scale-90 hover:translate-y-[-2px]"><Send className="w-6 h-6 md:w-5 md:h-5" /></button>
                </div>
            </div>
        </div>

        {/* --- MODALS --- */}
        {(showCreateGroup || showManageMembers) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 transition-all">
                <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-10 border-b dark:border-slate-700 pb-6 transition-all"><h3 className="text-2xl font-black text-slate-800 dark:text-white">{showCreateGroup ? '创建新协作群组' : '群组成员管理'}</h3><button onClick={() => { setShowCreateGroup(false); setShowManageMembers(false); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button></div>
                    <div className="space-y-6">
                        {showCreateGroup && (<div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">群组显示名称 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black shadow-inner" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="例如: 工程二部技术讨论组" /></div>)}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                {showCreateGroup ? `选中成员数量 (${selectedMembers.length})` : '成员名单及权限控制'}
                            </label>
                            
                            {!showCreateGroup && (
                                <div className="text-[10px] font-black text-orange-600 bg-orange-50 dark:bg-orange-900/30 p-3 rounded-xl mb-4 border border-orange-100 dark:border-orange-800 transition-all flex items-center gap-2 uppercase tracking-tighter">
                                    <ShieldCheck className="w-4 h-4" /> 可指定最多 2 名副管理员
                                </div>
                            )}

                            <div className="h-72 overflow-y-auto border-2 border-slate-100 dark:border-slate-700 rounded-3xl divide-y divide-slate-100 dark:divide-slate-700 bg-slate-50/50 dark:bg-slate-900/50 transition-all custom-scrollbar">
                                {users.filter(u => u.id !== currentUser.id).map(user => {
                                    const isSelected = selectedMembers.includes(user.id);
                                    const isUserAdmin = selectedAdmins.includes(user.id);
                                    
                                    return (
                                        <div key={user.id} className={`flex items-center justify-between p-4 hover:bg-white dark:hover:bg-slate-800 transition-all group`}>
                                            <div 
                                                className="flex items-center gap-4 cursor-pointer flex-1"
                                                onClick={() => { if (isSelected) setSelectedMembers(prev => prev.filter(id => id !== user.id)); else setSelectedMembers(prev => [...prev, user.id]); }}
                                            >
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border-2 border-transparent group-hover:border-primary-200 overflow-hidden shadow-sm transition-all"><img src={user.avatar} className="w-full h-full object-cover"/></div>
                                                    <StatusDot userId={user.id} />
                                                </div>
                                                <div className="min-w-0 flex-1 transition-all">
                                                    <p className="text-sm font-black text-slate-800 dark:text-slate-200 truncate">{user.nickname}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.department}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!showCreateGroup && isSelected && (
                                                    <button 
                                                        onClick={() => {
                                                            if (isUserAdmin) setSelectedAdmins(prev => prev.filter(id => id !== user.id));
                                                            else { if (selectedAdmins.length >= 2) return alert("管理员数量已达上限"); setSelectedAdmins(prev => [...prev, user.id]); }
                                                        }}
                                                        className={`p-2 rounded-xl transition-all ${isUserAdmin ? 'text-orange-500 bg-orange-100 dark:bg-orange-900/40' : 'text-slate-200 hover:text-orange-400'}`}
                                                        title={isUserAdmin ? "撤销管理权限" : "设为管理员"}
                                                    >
                                                        <ShieldCheck className="w-5 h-5" />
                                                    </button>
                                                )}
                                                <div 
                                                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-primary-600 border-primary-600 shadow-md' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600'}`}
                                                    onClick={() => { if (isSelected) setSelectedMembers(prev => prev.filter(id => id !== user.id)); else setSelectedMembers(prev => [...prev, user.id]); }}
                                                >
                                                    {isSelected && <Check className="w-4 h-4 text-white font-black" />}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-12 pt-6 border-t dark:border-slate-700 transition-all">
                      <button onClick={() => { setShowCreateGroup(false); setShowManageMembers(false); }} className="px-8 py-3 text-slate-500 font-black uppercase tracking-widest text-xs transition-colors">取消</button>
                      <button onClick={showCreateGroup ? handleCreateGroup : handleUpdateMembers} className="px-10 py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-2xl text-xs font-black shadow-2xl shadow-primary-500/30 transition-all active:scale-95 uppercase tracking-widest">{showCreateGroup ? '立即创建群组' : '同步群组配置'}</button>
                    </div>
                </div>
            </div>
        )}

        {/* Announcements List Drawer */}
        {showAnnounceList && (
            <div className="fixed inset-0 z-50 flex justify-end">
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowAnnounceList(false)} />
                <div className="w-full max-sm bg-slate-200 dark:bg-slate-800 shadow-2xl h-full relative flex flex-col animate-in slide-in-from-right duration-500 transition-all border-l border-slate-300 dark:border-slate-700">
                    <div className="p-6 border-b border-slate-300 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 transition-all">
                        <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
                            <div className="p-2 bg-orange-100 rounded-xl transition-colors"><Megaphone className="w-6 h-6 text-orange-600" /></div>
                            频道重要公告
                        </h3>
                        <button onClick={() => setShowAnnounceList(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-200 dark:bg-slate-950/20 custom-scrollbar transition-all">
                        {channelAnnouncements.length === 0 ? (
                            <div className="text-center text-slate-400 py-20 animate-in fade-in transition-all">
                                <Megaphone className="w-16 h-16 mx-auto mb-6 opacity-5" />
                                <p className="font-black uppercase tracking-widest text-xs">当前无公告通知</p>
                            </div>
                        ) : (
                            channelAnnouncements.map((ann: ChatAnnouncement) => (
                                <div key={ann.id} className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 shadow-xl relative group transition-all transform hover:scale-[1.02]">
                                    {ann.isPinned && <Pin className="w-4 h-4 text-red-500 absolute top-4 right-4 fill-current transition-all" />}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg transition-all">
                                            {ann.creatorName[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-100 transition-colors">{ann.creatorName}</span>
                                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{formatBeijingTime(ann.createdAt)}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-medium transition-colors">
                                        {ann.content}
                                    </p>
                                    
                                    {isChannelAdmin && (
                                        <div className="mt-6 pt-4 border-t border-slate-50 dark:border-slate-700 flex justify-end gap-4 text-[10px] font-black uppercase tracking-widest">
                                            <button 
                                                onClick={() => { setEditingAnnounce(ann); setAnnounceContent(ann.content); setAnnouncePinned(ann.isPinned); setShowAnnounceModal(true); }} 
                                                className="text-primary-600 hover:underline transition-all"
                                            >
                                                编辑内容
                                            </button>
                                            <button 
                                                onClick={() => { if(window.confirm('确定删除此条频道公告吗?')) onDeleteAnnouncement(ann.id); }} 
                                                className="text-red-500 hover:underline transition-all"
                                            >
                                                移除公告
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {isChannelAdmin && (
                        <div className="p-6 border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all">
                            <button 
                                onClick={() => { setAnnounceContent(''); setAnnouncePinned(false); setEditingAnnounce(null); setShowAnnounceModal(true); }}
                                className="w-full bg-primary-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-primary-500/30 hover:bg-primary-700 flex items-center justify-center gap-3 transition-all active:scale-95 uppercase tracking-widest text-xs"
                            >
                                <Plus className="w-5 h-5" /> 发布新业务公告
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Modal: Announcement Form */}
        {showAnnounceModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 transition-all">
                <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 transition-all">
                    <div className="flex justify-between items-center mb-8 border-b dark:border-slate-700 pb-6 transition-all"><h3 className="text-2xl font-black text-slate-800 dark:text-white">{editingAnnounce ? '更新频道公告' : '发布新频道公告'}</h3><button onClick={() => setShowAnnounceModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button></div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 transition-colors">公告详细正文内容</label>
                            <textarea 
                                className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 h-48 resize-none outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium shadow-inner transition-all"
                                placeholder="输入您要向全群发布的重要业务通知..."
                                value={announceContent}
                                onChange={e => setAnnounceContent(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 transition-all">
                            <input type="checkbox" id="pinAnnounce" checked={announcePinned} onChange={e => setAnnouncePinned(e.target.checked)} className="w-5 h-5 text-primary-600 rounded-lg focus:ring-primary-500 border-slate-300 transition-all shadow-sm" />
                            <label htmlFor="pinAnnounce" className="text-sm text-slate-600 dark:text-slate-300 cursor-pointer font-black uppercase tracking-widest transition-colors">在此频道置顶此条公告</label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-12 pt-6 border-t dark:border-slate-700 transition-all">
                        <button onClick={() => setShowAnnounceModal(false)} className="px-8 py-3 text-slate-400 font-black uppercase tracking-widest text-xs transition-colors">放弃</button>
                        <button onClick={handleSaveAnnouncement} className="px-10 py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-2xl font-black shadow-2xl shadow-primary-500/30 transition-all active:scale-95 uppercase tracking-widest text-xs">{editingAnnounce ? '同步更新' : '立即发布公告'}</button>
                    </div>
                </div>
            </div>
        )}

        {previewImage && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-md" onClick={() => setPreviewImage(null)}>
               <button className="absolute top-8 right-8 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all transform hover:rotate-90"><X className="w-10 h-10" /></button>
               <img src={previewImage} className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl rounded-lg animate-in zoom-in-95 duration-500" onClick={(e) => e.stopPropagation()} />
            </div>
        )}
    </div>
  );
};

export default TeamChat;

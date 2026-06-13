import React, { useState, useRef } from 'react';
import { User, UserRole, UserPermission } from '../types';
import { Search, Plus, Edit2, Trash2, Save, X, Shield, User as UserIcon, Building2, Upload, Lock, Users } from 'lucide-react';
import { DEPARTMENTS } from '../constants';

const API_URL = (window as any)._env_?.API_URL || '/api';

interface UserManagerProps {
  users: User[];
  currentUser: User;
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

const UserManager: React.FC<UserManagerProps> = ({ users, currentUser, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    nickname: '',
    password: '',
    department: '销售部',
    role: 'User',
    permission: 'ReadWrite',
    avatar: ''
  });

  // 在线状态判定函数
  const checkIsOnline = (u: User) => {
    if (!u.lastActive) return false;
    const lastActiveDate = new Date(u.lastActive);
    const now = new Date();
    return (now.getTime() - lastActiveDate.getTime()) < 60000;
  };

  const filteredUsers = users.filter(u => 
    u.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adminCount = users.filter(u => u.role === 'Admin' && !u.isDefaultAdmin).length;

  const handleOpenAdd = () => {
    if (!currentUser.isDefaultAdmin) return alert("只有超级管理员拥有开设账户的权限。");
    setEditingUser(null);
    setFormData({
        nickname: '',
        password: '',
        department: '销售部',
        role: 'User',
        permission: 'ReadWrite',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    if (!currentUser.isDefaultAdmin) return alert("只有超级管理员可以编辑他人账户资料。");
    setEditingUser(user);
    setFormData({
        nickname: user.nickname,
        password: user.password,
        department: user.department,
        role: user.role,
        permission: user.permission || 'ReadWrite',
        avatar: user.avatar
    });
    setIsModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const data = new FormData();
        data.append('file', file);
        const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: data });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const fileData = await uploadRes.json();
        setFormData(prev => ({ ...prev, avatar: fileData.url }));
      } catch (error) {
        alert("头像上传失败");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSave = () => {
    if (!formData.nickname || !formData.password) {
        alert("请填写用户名和密码");
        return;
    }
    const existing = users.find(u => u.nickname === formData.nickname);
    if (existing && (!editingUser || existing.id !== editingUser.id)) {
        alert("该用户名已存在");
        return;
    }

    // 规则：系统管理员名额限制
    if (formData.role === 'Admin' && !editingUser?.isDefaultAdmin) {
        const otherAdmins = users.filter(u => u.role === 'Admin' && !u.isDefaultAdmin && u.id !== editingUser?.id);
        if (otherAdmins.length >= 8) {
            alert("名额限制：系统中最多只能设置 8 个普通管理员账户。");
            return;
        }
    }

    const userPayload: User = {
        id: editingUser ? editingUser.id : Math.random().toString(36).substr(2, 9),
        nickname: formData.nickname!,
        password: formData.password!,
        department: formData.department!,
        role: formData.role as UserRole,
        permission: formData.permission as UserPermission,
        avatar: formData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
        isDefaultAdmin: editingUser?.isDefaultAdmin,
        lastActive: editingUser?.lastActive
    };
    editingUser ? onUpdateUser(userPayload) : onAddUser(userPayload);
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
      const user = users.find(u => u.id === id);
      if (!currentUser.isDefaultAdmin) return alert("权限不足：仅超级管理员可注销用户账户。");
      if (id === currentUser.id) return alert("无法删除当前登录的超级管理员账户。");
      
      if (window.confirm(`超级管理员确认：您正在注销用户 "${user?.nickname}"。该操作将抹除此人的登录权限及所有私人数据索引，确定执行吗？`)) {
          onDeleteUser(id);
      }
  };

  return (
    <div className="max-w-7xl mx-auto transition-all">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
               <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors">用户权限管理</h2>
               <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium transition-colors">当前已占用普通管理员名额：<span className="text-primary-600 font-black">{adminCount} / 8</span></p>
            </div>
            <div className="flex items-center space-x-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="搜索用户姓名或部门..." 
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {currentUser.isDefaultAdmin && (
                    <button 
                        onClick={handleOpenAdd}
                        className="bg-primary-600 text-white px-6 py-2.5 rounded-2xl hover:bg-primary-700 flex items-center gap-2 shadow-xl shadow-primary-500/20 whitespace-nowrap font-black transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>开设新账户</span>
                    </button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all">
            {filteredUsers.map(user => {
                const online = checkIsOnline(user);
                return (
                    <div key={user.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-2xl hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-all group relative overflow-hidden active:scale-[0.98]">
                        <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg transition-colors ${
                            user.isDefaultAdmin ? 'bg-indigo-600' :
                            user.role === 'Admin' ? 'bg-purple-600' : 
                            user.role === 'DeptManager' ? 'bg-orange-500' :
                            user.role === 'Manager' ? 'bg-primary-600' : 'bg-slate-500'
                        }`}>
                            {user.isDefaultAdmin ? '超级管理员' : 
                             user.role === 'Admin' ? '系统管理员' : 
                             user.role === 'DeptManager' ? '部门经理' :
                             user.role === 'Manager' ? '项目经理' : '普通用户'}
                        </div>

                        <div className="flex items-center gap-5 mb-6 transition-all">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 border-2 border-white dark:border-slate-600 shadow-sm overflow-hidden flex-shrink-0 transition-transform group-hover:scale-105">
                                    <img src={user.avatar} alt={user.nickname} className="w-full h-full object-cover" />
                                </div>
                                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800 ${online ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-black text-slate-800 dark:text-white truncate transition-colors">
                                        {user.nickname}
                                    </h3>
                                    {user.isDefaultAdmin && <span title="系统核心内置账户" className="animate-pulse"><Lock className="w-3.5 h-3.5 text-primary-500" /></span>}
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 transition-colors">
                                    <Building2 className="w-3.5 h-3.5 opacity-50" /> {user.department}
                                </p>
                                <span className={`text-[8px] font-black uppercase tracking-tighter ${online ? 'text-emerald-500' : 'text-slate-400'}`}>
                                    {online ? 'Online Now' : 'Offline'}
                                </span>
                            </div>
                        </div>

                        <div className="border-t border-slate-50 dark:border-slate-700 pt-4 mt-2 transition-colors">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter mb-4 transition-colors">
                                <span className="text-slate-400">数据交互权限</span>
                                <span className="text-primary-600 dark:text-primary-400">
                                    {user.isDefaultAdmin ? '全局核心' : (user.role === 'Admin' ? '跨域查阅' : (user.role === 'DeptManager' ? '部门内审阅' : (user.permission === 'ReadWrite' ? '读写协同' : '只读查看')))}
                                </span>
                            </div>
                            
                            {currentUser.isDefaultAdmin && (
                                <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                                    <button onClick={() => handleOpenEdit(user)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm"><Edit2 className="w-4 h-4" /></button>
                                    {!user.isDefaultAdmin && (
                                        <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>

        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 transition-all">
                <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 transition-all">
                    <div className="flex justify-between items-center mb-8 border-b dark:border-slate-700 pb-4">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white transition-colors">{editingUser ? '编辑账户资料' : '开设新 ERP 账户'}</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"><X className="w-6 h-6 text-slate-500" /></button>
                    </div>

                    <div className="space-y-5 transition-all">
                        <div className="flex justify-center mb-4">
                            <div onClick={() => !isUploading && fileInputRef.current?.click()} className="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer hover:border-primary-500 group relative overflow-hidden transition-all shadow-inner">
                                {isUploading ? (<div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>) : formData.avatar ? (<><img src={formData.avatar} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Upload className="w-6 h-6 text-white" /></div></>) : (<Upload className="w-8 h-8 text-slate-300" />)}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        </div>

                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">登录用户名 *</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.nickname} onChange={e => setFormData({...formData, nickname: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">访问密码 *</label><input type="text" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">业务所属部门</label><select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}>{DEPARTMENTS.map(dept => (<option key={dept} value={dept}>{dept}</option>))}</select></div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 transition-colors">系统权限角色</label>
                            <select className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-3 outline-none focus:border-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black transition-all shadow-inner" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} disabled={editingUser?.isDefaultAdmin}>
                                <option value="User">普通职员 (仅见本人数据)</option>
                                <option value="Manager">项目经理 (仅见本人数据)</option>
                                <option value="DeptManager">部门经理 (见本部门全员/不可改)</option>
                                <option value="Admin">系统管理员 (见全系统全员/不可改)</option>
                            </select>
                        </div>

                        {formData.role !== 'Admin' && formData.role !== 'DeptManager' && !editingUser?.isDefaultAdmin && (
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 transition-colors">交互权限</label>
                                <div className="flex gap-6 mt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group"><input type="radio" checked={formData.permission === 'ReadWrite'} onChange={() => setFormData({...formData, permission: 'ReadWrite'})} className="w-5 h-5 text-primary-600"/><span className="text-sm font-black text-slate-600 dark:text-slate-300">读写协同</span></label>
                                    <label className="flex items-center gap-3 cursor-pointer group"><input type="radio" checked={formData.permission === 'Read'} onChange={() => setFormData({...formData, permission: 'Read'})} className="w-5 h-5 text-primary-600"/><span className="text-sm font-black text-slate-400 dark:text-slate-500">仅限只读</span></label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-4 mt-12 pt-6 border-t dark:border-slate-700 transition-all">
                        <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-400 font-black uppercase tracking-widest transition-colors">取消</button>
                        <button onClick={handleSave} className="px-12 py-3 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 shadow-2xl shadow-primary-500/30 flex items-center gap-2 font-black transition-all active:scale-95 uppercase tracking-widest"><Save className="w-5 h-5" /> 确认保存</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default UserManager;


import React, { useState } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Server } from 'lucide-react';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
  appName?: string;
  logoUrl?: string;
}

const Login: React.FC<LoginProps> = ({ users, onLogin, appName, logoUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
        setError('请输入用户名和密码');
        return;
    }
    
    const user = users.find(u => u.nickname.toLowerCase() === cleanUsername.toLowerCase());
    
    if (user && user.password === cleanPassword) {
      onLogin(user);
    } else {
      setError('用户名或密码错误');
    }
  };

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] bg-slate-100 flex items-center justify-center p-4 relative transition-colors">
      {/* Background Pattern - Fully Dynamic Theme Colors */}
      <div className="absolute inset-0 overflow-hidden z-0">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary-200 mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 rounded-full bg-primary-100 mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 rounded-full bg-primary-50 mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-4000"></div>
      </div>

      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden z-10 border border-white/20 backdrop-blur-sm transition-all transform hover:scale-[1.01]">
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden transition-colors">
           <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 z-0 transition-colors"></div>
           <div className="relative z-10 animate-in fade-in slide-in-from-top-4 duration-700">
               {logoUrl ? (
                   <img src={logoUrl} alt="Logo" className="h-16 mx-auto mb-4 object-contain" />
               ) : (
                   <div className="w-16 h-16 bg-primary-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl shadow-primary-900/50 transform">
                       <Lock className="w-8 h-8 text-white" />
                   </div>
               )}
               <h1 className="text-2xl font-black text-white tracking-tight">{appName || 'i ERP'}</h1>
               <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-widest opacity-80">企业级工程管理系统</p>
           </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white">
           {error && (
             <div className="bg-red-50 text-red-600 text-xs font-black p-4 rounded-2xl flex items-start gap-3 border border-red-100 animate-in slide-in-from-top-2">
               <span className="w-2 h-2 mt-1.5 bg-red-500 rounded-full flex-shrink-0 animate-pulse"></span>
               {error}
             </div>
           )}

           <div className="space-y-2">
             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">用户名</label>
             <div className="relative group">
               <input 
                 type="text"
                 className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-slate-800 placeholder:text-slate-300 text-base"
                 placeholder="请输入用户名"
                 value={username}
                 onChange={(e) => setUsername(e.target.value)}
               />
               <UserIcon className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary-600 transition-colors" />
             </div>
           </div>

           <div className="space-y-2">
             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">登录密码</label>
             <div className="relative group">
               <input 
                 type={showPassword ? "text" : "password"}
                 className="w-full pl-12 pr-14 py-3.5 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-slate-800 placeholder:text-slate-300 text-base"
                 placeholder="请输入密码"
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
               />
               <Lock className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary-600 transition-colors" />
               <button
                 type="button"
                 onClick={() => setShowPassword(!showPassword)}
                 className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-primary-600 focus:outline-none transition-colors p-1"
               >
                 {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
               </button>
             </div>
           </div>

           <button 
             type="submit"
             className="w-full bg-primary-600 text-white py-4 rounded-2xl font-black shadow-2xl shadow-primary-500/30 hover:bg-primary-700 hover:translate-y-[-2px] active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-2 group"
           >
             立即进入系统 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
           </button>
           
           <div className="text-center pt-6 border-t border-slate-50 transition-all">
             <p className="text-[10px] font-bold text-slate-300 flex flex-col gap-1 uppercase tracking-widest">
               <span>默认管理员: <span className="text-slate-600 font-mono">admin</span></span> 
               <span>初始密码: <span className="text-slate-600 font-mono">password</span></span>
             </p>
             <div className="mt-4 flex justify-center items-center gap-2 text-[10px] font-black text-primary-200 transition-colors uppercase tracking-[0.2em]">
                 <Server className="w-3.5 h-3.5" />
                 <span>Security verified</span>
             </div>
           </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

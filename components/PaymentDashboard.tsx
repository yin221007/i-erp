
import React, { useState, useMemo, useRef } from 'react';
import { PaymentRecord, Project, User, Client } from '../types';
import { Search, Plus, Edit2, Trash2, Save, X, Calculator, AlertTriangle, ShieldCheck, Download, Upload, JapaneseYen, Wallet, FileCheck } from 'lucide-react';

interface PaymentDashboardProps {
  payments: PaymentRecord[];
  projects: Project[];
  users: User[];
  clients: Client[];
  onAddPayment: (payment: PaymentRecord) => void;
  onUpdatePayment: (payment: PaymentRecord) => void;
  onDeletePayment: (id: string) => void;
  currentUser: User;
}

const PaymentDashboard: React.FC<PaymentDashboardProps> = ({ 
  payments, 
  projects, 
  users, 
  clients, 
  onAddPayment, 
  onUpdatePayment, 
  onDeletePayment, 
  currentUser 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PaymentRecord | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    projectId: '',
    projectName: '',
    managerName: '',
    clientContactName: '',
    contractAmount: '',
    variationAmount: '',
    submissionAmount: '',
    auditedAmount: '',
    paymentTerms: '',
    receivedAmount: '',
    finalPaymentDueDate: '',
    invoicedAmount: '',
    warrantyPeriod: ''
  });

  const visiblePayments = useMemo(() => {
      if (currentUser.role === 'Admin') return payments;
      return payments.filter(p => 
          p.managerName === currentUser.nickname || 
          p.creatorId === currentUser.id
      );
  }, [payments, currentUser]);

  const filteredPayments = visiblePayments.filter(p => 
    p.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.managerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canAdd = currentUser.role === 'Admin' || 
                 currentUser.permission === 'ReadWrite' || 
                 ['财务部', '工程部', '销售部', '总经办'].includes(currentUser.department);

  const canDelete = currentUser.role === 'Admin';

  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) return '¥0.00';
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
  };

  const calculateRemaining = (payment: PaymentRecord) => {
    const received = payment.receivedAmount || 0;
    if (payment.auditedAmount > 0) {
        return payment.auditedAmount - received;
    }
    const base = payment.contractAmount || 0;
    const variation = payment.variationAmount || 0;
    return (base + variation) - received;
  };

  const calculateProgress = (payment: PaymentRecord) => {
    const total = payment.auditedAmount > 0 ? payment.auditedAmount : (payment.contractAmount + payment.variationAmount);
    if (total <= 0) return 0;
    return Math.min(Math.round((payment.receivedAmount / total) * 100), 100);
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      projectId: '',
      projectName: '',
      managerName: '',
      clientContactName: '',
      contractAmount: '',
      variationAmount: '',
      submissionAmount: '',
      auditedAmount: '',
      paymentTerms: '',
      receivedAmount: '',
      finalPaymentDueDate: '',
      invoicedAmount: '',
      warrantyPeriod: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: PaymentRecord) => {
    setEditingItem(item);
    setFormData({
        projectId: item.projectId || '',
        projectName: item.projectName,
        managerName: item.managerName,
        clientContactName: item.clientContactName,
        contractAmount: item.contractAmount.toString(),
        variationAmount: item.variationAmount.toString(),
        submissionAmount: item.submissionAmount.toString(),
        auditedAmount: item.auditedAmount.toString(),
        paymentTerms: item.paymentTerms,
        receivedAmount: item.receivedAmount.toString(),
        finalPaymentDueDate: item.finalPaymentDueDate,
        invoicedAmount: item.invoicedAmount.toString(),
        warrantyPeriod: item.warrantyPeriod || ''
    });
    setIsModalOpen(true);
  };

  const handleProjectChange = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setFormData(prev => ({
        ...prev,
        projectId: project.id,
        projectName: project.name,
        managerName: project.manager,
      }));
    } else {
        setFormData(prev => ({...prev, projectId: ''}));
    }
  };

  const handleSave = () => {
    if (!formData.projectName) {
        alert("请输入或选择工程名称");
        return;
    }

    const record: PaymentRecord = {
        id: editingItem ? editingItem.id : Math.random().toString(36).substr(2, 9),
        projectId: formData.projectId,
        projectName: formData.projectName || '',
        managerName: formData.managerName || '',
        clientContactName: formData.clientContactName || '',
        contractAmount: parseFloat(formData.contractAmount) || 0,
        variationAmount: parseFloat(formData.variationAmount) || 0,
        submissionAmount: parseFloat(formData.submissionAmount) || 0,
        auditedAmount: parseFloat(formData.auditedAmount) || 0,
        paymentTerms: formData.paymentTerms || '',
        receivedAmount: parseFloat(formData.receivedAmount) || 0,
        finalPaymentDueDate: formData.finalPaymentDueDate || '',
        invoicedAmount: parseFloat(formData.invoicedAmount) || 0,
        warrantyPeriod: formData.warrantyPeriod || '',
        creatorId: editingItem ? editingItem.creatorId : currentUser.id,
        createdAt: editingItem ? editingItem.createdAt : new Date().toISOString()
    };

    if (editingItem) {
        onUpdatePayment(record);
    } else {
        onAddPayment(record);
    }
    setIsModalOpen(false);
  };

  const handleRemove = (item: PaymentRecord) => {
      onDeletePayment(item.id);
  };

  const handleDownload = () => {
    const headers = ['工程名称', '负责人', '客户对接', '合同价格', '增减项', '送审价', '审定价', '支付条款', '已回款', '剩余款', '开票额', '质保期', '尾款到期日'];
    const csvContent = [
      headers.join(','),
      ...filteredPayments.map(item => {
        const remaining = calculateRemaining(item);
        return [
          `"${item.projectName.replace(/"/g, '""')}"`,
          `"${item.managerName.replace(/"/g, '""')}"`,
          `"${item.clientContactName.replace(/"/g, '""')}"`,
          item.contractAmount || 0,
          item.variationAmount || 0,
          item.submissionAmount || 0,
          item.auditedAmount || 0,
          `"${item.paymentTerms.replace(/"/g, '""')}"`,
          item.receivedAmount || 0,
          remaining,
          item.invoicedAmount || 0,
          `"${item.warrantyPeriod || ''}"`,
          item.finalPaymentDueDate || ''
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `工程回款台账_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const normalizeDate = (rawDate: string) => {
      if (!rawDate) return '';
      const normalized = rawDate.replace(/[\/\.]/g, '-').trim();
      const parts = normalized.split('-');
      if (parts.length === 3) {
          if (parts[0].length === 4) {
              const m = parts[1].padStart(2, '0');
              const d = parts[2].padStart(2, '0');
              return `${parts[0]}-${m}-${d}`;
          }
          if (parts[2].length === 4) {
              const m = parts[1].padStart(2, '0');
              const d = parts[0].padStart(2, '0');
              return `${parts[2]}-${m}-${d}`;
          }
      }
      return ''; 
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          try {
              const lines = text.split(/\r\n|\n/);
              let successCount = 0;
              const parseMoney = (val: string) => {
                  if (!val) return 0;
                  const clean = val.replace(/["¥$￥,]/g, '').trim();
                  return parseFloat(clean) || 0;
              };
              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                  if (parts.length > 0 && parts[0]) {
                      const projectName = parts[0].replace(/^"|"$/g, '').trim();
                      if(!projectName) continue;
                      const managerName = parts[1]?.replace(/^"|"$/g, '').trim() || '';
                      const clientContactName = parts[2]?.replace(/^"|"$/g, '').trim() || '';
                      const contractAmount = parseMoney(parts[3]);
                      const variationAmount = parseMoney(parts[4]);
                      const submissionAmount = parseMoney(parts[5]);
                      const auditedAmount = parseMoney(parts[6]);
                      const paymentTerms = parts[7]?.replace(/^"|"$/g, '').trim() || '';
                      const receivedAmount = parseMoney(parts[8]);
                      const invoicedAmount = parseMoney(parts[10]);
                      const warrantyPeriod = parts[11]?.replace(/^"|"$/g, '').trim() || '';
                      const rawDueDate = parts[12]?.replace(/^"|"$/g, '').trim() || '';
                      const finalPaymentDueDate = normalizeDate(rawDueDate);
                      const existingProject = projects.find(p => p.name === projectName);
                      const record: PaymentRecord = { 
                          id: Math.random().toString(36).substr(2, 9), 
                          projectId: existingProject ? existingProject.id : '', 
                          projectName, managerName, clientContactName, 
                          contractAmount, variationAmount, submissionAmount, 
                          auditedAmount, paymentTerms, receivedAmount, 
                          invoicedAmount, warrantyPeriod, finalPaymentDueDate, 
                          creatorId: currentUser.id,
                          createdAt: new Date().toISOString()
                      };
                      onAddPayment(record);
                      successCount++;
                  }
              }
              alert(`导入完成：已同步 ${successCount} 条数据`);
          } catch (err) { alert("导入失败：请核对 CSV 文件格式"); }
          if(fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  const getAvailableContacts = () => {
     const selectedProj = projects.find(p => p.id === formData.projectId);
     if (selectedProj) {
         const client = clients.find(c => c.companyName === selectedProj.clientName);
         return client ? client.contacts : [];
     }
     return [];
  };

  return (
    <div className="max-w-[100rem] mx-auto transition-all pb-12">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-primary-600 rounded-2xl shadow-xl shadow-primary-500/20">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors tracking-tight">工程回款决策看板</h2>
           </div>
           <p className="text-slate-500 dark:text-slate-400 font-bold ml-12">集中化监控工程结算偏差、回款效率及财务风险预警</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
           <div className="relative flex-1 md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="搜索项目、经理、客户..." 
                  className="w-full pl-12 pr-4 py-3.5 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-black text-sm shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex gap-2">
                {canAdd && (
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white dark:bg-slate-800 text-slate-500 border-2 border-slate-100 dark:border-slate-700 p-3.5 rounded-2xl hover:bg-primary-50 hover:border-primary-500 transition-all shadow-sm active:scale-95"
                        title="批量导入"
                    >
                        <Upload className="w-5 h-5" />
                    </button>
                )}
                <button 
                    onClick={handleDownload}
                    className="bg-white dark:bg-slate-800 text-slate-500 border-2 border-slate-100 dark:border-slate-700 p-3.5 rounded-2xl hover:bg-primary-50 hover:border-primary-500 transition-all shadow-sm active:scale-95"
                    title="导出台账"
                >
                    <Download className="w-5 h-5" />
                </button>
                {canAdd && (
                    <button 
                        onClick={handleOpenAdd}
                        className="bg-primary-600 text-white px-8 py-3.5 rounded-2xl hover:bg-primary-700 flex items-center gap-2 shadow-2xl shadow-primary-500/30 whitespace-nowrap font-black transition-all active:scale-95 uppercase tracking-widest text-xs"
                    >
                        <Plus className="w-5 h-5" />
                        <span>录入新项</span>
                    </button>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
            </div>
        </div>
      </div>

      {/* 增强型统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10 transition-all">
          {[
              { label: '在研项目合同总值', value: filteredPayments.reduce((acc, curr) => acc + (curr.contractAmount || 0), 0), color: 'border-slate-600', hover: 'hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-700/70', icon: JapaneseYen, trend: '合同原价累计' },
              { label: '累计资金回笼总额', value: filteredPayments.reduce((acc, curr) => acc + (curr.receivedAmount || 0), 0), color: 'border-emerald-500', hover: 'hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/40', icon: Wallet, trend: '实到资金' },
              { label: '财务应收尾款总计', value: filteredPayments.reduce((acc, curr) => acc + calculateRemaining(curr), 0), color: 'border-orange-500', hover: 'hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-950/40', icon: AlertTriangle, trend: '风险敞口' },
              { label: '已开票业务总额', value: filteredPayments.reduce((acc, curr) => acc + (curr.invoicedAmount || 0), 0), color: 'border-primary-500', hover: 'hover:bg-primary-50 hover:border-primary-300 dark:hover:bg-primary-950/40', icon: FileCheck, trend: '票据关联额' }
          ].map((stat, i) => (
              <div key={i} className={`bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 border-l-[12px] ${stat.color} ${stat.hover} shadow-sm transition-all transform hover:scale-[1.03] hover:shadow-2xl group cursor-default relative overflow-hidden`}>
                  <div className="flex justify-between items-start mb-4">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] group-hover:text-primary-600 transition-colors">{stat.label}</p>
                    <stat.icon className="w-5 h-5 text-slate-300 group-hover:text-primary-400 transition-all" />
                  </div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white transition-colors tracking-tighter">
                      {formatCurrency(stat.value)}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                     <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-widest">{stat.trend}</span>
                  </div>
                  {/* 装饰性背景 */}
                  <Calculator className="absolute -bottom-6 -right-6 w-24 h-24 text-slate-50 opacity-[0.03] dark:opacity-[0.01] rotate-12 transition-all group-hover:scale-125" />
              </div>
          ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all relative">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1600px] text-sm text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest border-b-4 border-slate-200 dark:border-slate-700 transition-colors">
                  <tr>
                      <th className="px-8 py-6 w-[280px]">工程名称 / 标识</th>
                      <th className="px-6 py-6">进度</th>
                      <th className="px-6 py-6">负责人 / 甲方</th>
                      <th className="px-6 py-6 text-right">审定价</th>
                      <th className="px-6 py-6">条款内容</th>
                      <th className="px-6 py-6 text-right">已收</th>
                      <th className="px-6 py-6 text-right">应收余额</th>
                      <th className="px-6 py-6 text-right">开票</th>
                      <th className="px-6 py-6 text-center">质保</th>
                      <th className="px-6 py-6 text-center">尾款到期日</th>
                      {canAdd && <th className="px-8 py-6 text-center sticky right-0 bg-slate-100 dark:bg-slate-900 shadow-[-20px_0_30px_-10px_rgba(0,0,0,0.1)]">操作</th>}
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50 transition-all">
                  {filteredPayments.map((item) => {
                      const remaining = calculateRemaining(item);
                      const progress = calculateProgress(item);
                      const isOverdue = item.finalPaymentDueDate && new Date(item.finalPaymentDueDate) < new Date() && remaining > 0;
                      const isDueSoon = item.finalPaymentDueDate && new Date(item.finalPaymentDueDate) < new Date(new Date().getTime() + 15 * 86400000) && new Date(item.finalPaymentDueDate) >= new Date() && remaining > 0;
                      const canEditItem = currentUser.role === 'Admin' || item.managerName === currentUser.nickname || item.creatorId === currentUser.id;

                      return (
                        <tr key={item.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/30 group transition-all cursor-default border-l-4 border-transparent hover:border-primary-600">
                            <td className="px-8 py-6">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                       <span className="text-base font-black text-slate-900 dark:text-slate-100 truncate max-w-[200px] group-hover:text-primary-700 transition-colors">{item.projectName}</span>
                                       {item.projectId && <div title="已关联工程节点" className="p-1 bg-primary-100 dark:bg-primary-900/50 rounded-lg"><FileCheck className="w-3 h-3 text-primary-600" /></div>}
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ID: {item.id}</span>
                                </div>
                            </td>
                            
                            <td className="px-6 py-6">
                                <div className="w-24">
                                    <div className="flex justify-between items-end mb-1.5">
                                        <span className={`text-[10px] font-black ${progress === 100 ? 'text-emerald-600' : 'text-primary-600'}`}>{progress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                                        <div 
                                            className={`h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_8px_rgba(37,99,235,0.3)] ${progress === 100 ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-primary-600'}`} 
                                            style={{ width: `${progress}%` }} 
                                        />
                                    </div>
                                </div>
                            </td>

                            <td className="px-6 py-6">
                                <div className="flex flex-col">
                                    <span className="font-black text-slate-800 dark:text-slate-200 text-xs">{item.managerName}</span>
                                    <span className="text-[10px] text-slate-400 font-bold truncate max-w-[120px] mt-0.5">{item.clientContactName}</span>
                                </div>
                            </td>

                            <td className="px-6 py-6 text-right">
                                <div className="flex flex-col items-end">
                                    <span className="font-mono font-black text-slate-900 dark:text-white text-sm">{item.auditedAmount > 0 ? item.auditedAmount.toLocaleString() : (item.contractAmount + item.variationAmount).toLocaleString()}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{item.auditedAmount > 0 ? '审定决算价' : '暂定合同价'}</span>
                                </div>
                            </td>
                            
                            <td className="px-6 py-4 relative group/terms">
                                <div className="bg-slate-50 dark:bg-slate-700/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 truncate max-w-[120px] transition-all cursor-help hover:border-primary-400 group-hover:bg-white dark:group-hover:bg-slate-800">
                                    {item.paymentTerms || '未设定条款'}
                                </div>
                                {item.paymentTerms && (
                                    <div className="absolute left-1/2 bottom-full mb-3 -translate-x-1/2 w-80 p-6 bg-slate-900 dark:bg-slate-700 text-white rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.4)] opacity-0 invisible group-hover/terms:opacity-100 group-hover/terms:visible group-hover/terms:translate-y-[-12px] transition-all z-[60] pointer-events-none border border-white/10 backdrop-blur-xl">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-primary-600 rounded-xl"><Calculator className="w-4 h-4" /></div>
                                            <p className="font-black uppercase tracking-[0.2em] text-[10px] text-primary-400">详细支付及结算条款明细</p>
                                        </div>
                                        <div className="h-px bg-white/10 mb-4 w-full"></div>
                                        <p className="leading-relaxed font-bold text-sm text-slate-100 italic">
                                            "{item.paymentTerms}"
                                        </p>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[12px] border-transparent border-t-slate-900 dark:border-t-slate-700"></div>
                                    </div>
                                )}
                            </td>

                            <td className="px-6 py-6 text-right">
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm">{(item.receivedAmount || 0).toLocaleString()}</span>
                            </td>

                            <td className="px-6 py-6 text-right">
                                <div className="flex flex-col items-end">
                                    <span className={`font-mono font-black text-sm ${remaining > 0 ? 'text-orange-600' : 'text-slate-300 dark:text-slate-600'}`}>{remaining.toLocaleString()}</span>
                                    {remaining > 0 && <span className="text-[8px] font-black text-orange-400 uppercase animate-pulse">待追回</span>}
                                </div>
                            </td>

                            <td className="px-6 py-6 text-right">
                                <span className="font-mono text-primary-600 dark:text-primary-400 font-bold">{(item.invoicedAmount || 0).toLocaleString()}</span>
                            </td>

                            <td className="px-6 py-6 text-center">
                                {item.warrantyPeriod ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-purple-50 dark:bg-emerald-900/40 text-purple-700 dark:text-emerald-300 border border-purple-100 dark:border-emerald-800 shadow-sm">
                                        <ShieldCheck className="w-3 h-3 mr-1" /> {item.warrantyPeriod}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">未约定</span>
                                )}
                            </td>

                            <td className="px-6 py-6 text-center">
                                {item.finalPaymentDueDate ? (
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-black border-2 transition-all ${
                                        isOverdue ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/20' :
                                        isDueSoon ? 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse' :
                                        'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-600'
                                    }`}>
                                        {item.finalPaymentDueDate}
                                        {isOverdue && <AlertTriangle className="w-3 h-3" />}
                                    </div>
                                ) : <span className="text-slate-200 dark:text-slate-700">-</span>}
                            </td>

                            {canAdd && (
                                <td className="px-8 py-6 text-center sticky right-0 bg-white dark:bg-slate-800 group-hover:bg-primary-50 shadow-[-20px_0_30px_-10px_rgba(0,0,0,0.08)] transition-all">
                                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100">
                                        {canEditItem && (
                                            <button onClick={() => handleOpenEdit(item)} className="p-3 text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-md border border-slate-100 dark:border-slate-600 active:scale-90">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button onClick={() => handleRemove(item)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-md border border-slate-100 dark:border-slate-600 active:scale-90">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            )}
                        </tr>
                      );
                  })}
                  {filteredPayments.length === 0 && (
                      <tr>
                          <td colSpan={14} className="py-48 text-center text-slate-300 transition-all">
                              <Calculator className="w-24 h-24 mx-auto mb-6 opacity-5" />
                              <p className="font-black text-xl uppercase tracking-[0.4em]">暂无财务结算原始记录</p>
                              <p className="text-[10px] font-bold mt-2 opacity-40">请通过右上角录入功能建立第一笔回款档案</p>
                          </td>
                      </tr>
                  )}
              </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 transition-all">
            <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-[3rem] p-10 shadow-[0_40px_100px_-15px_rgba(0,0,0,0.3)] animate-in zoom-in-95 max-h-[95vh] overflow-y-auto border-4 border-white dark:border-slate-700 transition-all custom-scrollbar">
                <div className="flex justify-between items-center mb-10 border-b border-slate-100 dark:border-slate-700 pb-8 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary-600 rounded-2xl shadow-xl shadow-primary-500/20"><Calculator className="w-7 h-7 text-white" /></div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white transition-colors">{editingItem ? '更新结算档案' : '录入新工程结算凭证'}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Payment & Accounting Record</p>
                        </div>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-4 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all group active:scale-90">
                        <X className="w-8 h-8 text-slate-50 group-hover:rotate-90 transition-transform" />
                    </button>
                </div>

                <div className="space-y-10 transition-all">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-inner transition-all">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 pl-1">选择关联系统项目</label>
                                <select 
                                    className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm"
                                    value={formData.projectId}
                                    onChange={e => handleProjectChange(e.target.value)}
                                >
                                    <option value="">-- 手动录入模式 --</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 pl-1">工程项目全称 *</label>
                                <input 
                                    className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm"
                                    value={formData.projectName}
                                    onChange={e => setFormData({...formData, projectName: e.target.value})}
                                    placeholder="输入完整的工程项目名称"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 pl-1">工程责任经理</label>
                                <input 
                                    className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm"
                                    value={formData.managerName}
                                    onChange={e => setFormData({...formData, managerName: e.target.value})}
                                    list="managers-list"
                                    placeholder="输入或选择项目经理"
                                />
                                <datalist id="managers-list">{users.map(u => <option key={u.id} value={u.nickname} />)}</datalist>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 pl-1">甲方业务对接人</label>
                                <div className="flex gap-4">
                                    {formData.projectId && getAvailableContacts().length > 0 && (
                                        <select 
                                            className="w-1/3 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-4 outline-none text-[11px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm"
                                            onChange={e => setFormData({...formData, clientContactName: e.target.value})}
                                            value={getAvailableContacts().find(c => c.name === formData.clientContactName) ? formData.clientContactName : ''}
                                        >
                                            <option value="">快捷选择</option>
                                            {getAvailableContacts().map(c => (
                                                <option key={c.id} value={c.name}>{c.name} ({c.role})</option>
                                            ))}
                                        </select>
                                    )}
                                    <input 
                                        className="flex-1 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm"
                                        value={formData.clientContactName}
                                        onChange={e => setFormData({...formData, clientContactName: e.target.value})}
                                        placeholder="填写甲方联系人姓名"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 transition-all">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">合同启动原价 (¥)</label>
                            <input type="number" step="0.01" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 text-base font-mono font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-sm" value={formData.contractAmount} onChange={e => setFormData({...formData, contractAmount: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">增减项变更总额 (¥)</label>
                            <input type="number" step="0.01" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 text-base font-mono font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-sm" value={formData.variationAmount} onChange={e => setFormData({...formData, variationAmount: e.target.value})} placeholder="+ / -" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">竣工送审价总额 (¥)</label>
                            <input type="number" step="0.01" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 text-base font-mono font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-sm" value={formData.submissionAmount} onChange={e => setFormData({...formData, submissionAmount: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-primary-600 uppercase tracking-widest mb-2 pl-1">最终审计审定价 (¥)</label>
                            <input type="number" step="0.01" className="w-full border-4 border-primary-100 dark:border-primary-800 rounded-2xl px-5 py-4 outline-none focus:ring-8 focus:ring-primary-500/5 focus:border-primary-500 text-base font-mono font-black bg-primary-50/20 dark:bg-slate-950 text-primary-700 dark:text-primary-300 transition-all shadow-sm" value={formData.auditedAmount} onChange={e => setFormData({...formData, auditedAmount: e.target.value})} placeholder="留空则沿用合同总价" />
                        </div>
                    </div>

                    <div className="pt-10 border-t-2 border-slate-100 dark:border-slate-700 grid grid-cols-1 lg:grid-cols-4 gap-8 transition-all">
                        <div className="lg:col-span-4">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 pl-1">约定支付条款 (里程碑节点描述)</label>
                            <input className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-[1.5rem] px-6 py-5 outline-none focus:border-primary-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black transition-all shadow-sm" value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} placeholder="例如：预付30% (启动后10日) - 进场50% - 验收20%" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 pl-1">累计已回款额 (¥) *</label>
                            <input type="number" step="0.01" className="w-full border-2 border-emerald-100 dark:border-emerald-800 bg-emerald-50/40 dark:bg-slate-950 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-mono font-black text-emerald-700 dark:text-emerald-400 transition-all shadow-sm" value={formData.receivedAmount} onChange={e => setFormData({...formData, receivedAmount: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">累计开票总额 (¥)</label>
                            <input type="number" step="0.01" className="w-full border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 outline-none focus:border-primary-500 text-base font-mono font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-sm" value={formData.invoicedAmount} onChange={e => setFormData({...formData, invoicedAmount: e.target.value})} />
                        </div>
                        
                        <div>
                            <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest mb-2 pl-1">合同质保期限 (年)</label>
                            <select className="w-full border-2 border-purple-100 dark:border-purple-800 bg-purple-50/20 dark:bg-slate-950 rounded-2xl px-5 py-4 outline-none focus:border-purple-500 text-sm font-black text-purple-800 dark:text-purple-300 transition-all shadow-sm" value={formData.warrantyPeriod} onChange={e => setFormData({...formData, warrantyPeriod: e.target.value})}>
                                <option value="">未约定</option>
                                {[1, 2, 3, 5, 8, 10].map(year => (<option key={year} value={`${year}年`}>{year}年</option>))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2 pl-1">尾款清算截止预警</label>
                            <input type="date" className="w-full border-2 border-orange-100 dark:border-orange-800 bg-orange-50/20 dark:bg-slate-950 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 text-sm font-black text-orange-800 dark:text-orange-300 transition-all shadow-sm" value={formData.finalPaymentDueDate} onChange={e => setFormData({...formData, finalPaymentDueDate: e.target.value})} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-5 mt-16 border-t-2 border-slate-50 dark:border-slate-700 pt-10 transition-all">
                    <button onClick={() => setIsModalOpen(false)} className="px-10 py-4 text-slate-500 font-black uppercase tracking-widest text-xs transition-colors hover:text-slate-700">放弃录入</button>
                    <button onClick={handleSave} className="px-14 py-4 bg-primary-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-primary-500/40 flex items-center gap-3 transition-all active:scale-95 uppercase tracking-widest text-xs hover:bg-primary-700">
                        <Save className="w-5 h-5" /> 同步至回款台账
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default PaymentDashboard;

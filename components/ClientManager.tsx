
import React, { useState, useRef, useMemo } from 'react';
import { Client, Contact, User } from '../types';
import { Plus, Search, MapPin, Phone, Mail, User as UserIcon, Users, Building2, ChevronDown, ChevronUp, Trash2, Edit2, Save, X, Upload, Download, Map } from 'lucide-react';

// 简化的中国省市数据模型
const CHINA_REGION_DATA: Record<string, string[]> = {
    "北京市": ["北京市"],
    "上海市": ["上海市"],
    "天津市": ["天津市"],
    "重庆市": ["重庆市"],
    "广东省": ["广州市", "深圳市", "珠海市", "汕头市", "佛山市", "韶关市", "湛江市", "肇庆市", "江门市", "茂名市", "惠州市", "梅州市", "汕尾市", "河源市", "阳江市", "清远市", "东莞市", "中山市", "潮州市", "揭阳市", "云浮市"],
    "浙江省": ["杭州市", "宁波市", "温州市", "嘉兴市", "湖州市", "绍兴市", "金华市", "衢州市", "舟山市", "台州市", "丽水市"],
    "江苏省": ["南京市", "无锡市", "徐州市", "常州市", "苏州市", "南通市", "连云港市", "淮安市", "盐城市", "扬州市", "镇江市", "泰州市", "宿迁市"],
    "山东省": ["济南市", "青岛市", "淄博市", "枣庄市", "东营市", "烟台市", "潍坊市", "济宁市", "泰安市", "威海市", "日照市", "临沂市", "德州市", "聊城市", "滨州市", "菏泽市"],
    "福建省": ["福州市", "厦门市", "莆田市", "三明市", "泉州市", "漳州市", "南平市", "龙岩市", "宁德市"],
    "湖北省": ["武汉市", "黄石市", "十堰市", "宜昌市", "襄阳市", "鄂州市", "荆门市", "孝感市", "荆州市", "黄冈市", "咸宁市", "随州市", "恩施土家族苗族自治州"],
    "湖南省": ["长沙市", "株洲市", "湘潭市", "衡阳市", "邵阳市", "岳阳市", "常德市", "张家界市", "益阳市", "郴州市", "永州市", "怀化市", "娄底市", "湘西土家族苗族自治州"],
    "四川省": ["成都市", "自贡市", "攀枝花市", "泸州市", "德阳市", "绵阳市", "广元市", "遂宁市", "内江市", "乐山市", "南充市", "眉山市", "宜宾市", "广安市", "达州市", "雅安市", "巴中市", "资阳市", "阿坝藏族羌族自治州", "甘孜藏族自治州", "凉山彝族自治州"],
    "河北省": ["石家庄市", "唐山市", "秦皇岛市", "邯郸市", "邢台市", "保定市", "张家口市", "承德市", "沧州市", "廊坊市", "衡水市"],
    "河南省": ["郑州市", "开封市", "洛阳市", "平顶山市", "安阳市", "鹤壁市", "新乡市", "焦作市", "濮阳市", "许昌市", "漯河市", "三门峡市", "南阳市", "商丘市", "信阳市", "周口市", "驻马店市"],
    "辽宁省": ["沈阳市", "大连市", "鞍山市", "抚顺市", "本溪市", "丹东市", "锦州市", "营口市", "阜新市", "辽阳市", "盘锦市", "铁岭市", "朝阳市", "葫芦岛市"],
    "安徽省": ["合肥市", "芜湖市", "蚌埠市", "淮南市", "马鞍山市", "淮北市", "铜陵市", "安庆市", "黄山市", "滁州市", "阜阳市", "宿州市", "六安市", "亳州市", "池州市", "宣城市"],
    "陕西省": ["西安市", "铜川市", "保鸡市", "咸阳市", "渭南市", "延安市", "汉中市", "榆林市", "安康市", "商洛市"],
    "江西省": ["南昌市", "景德镇市", "萍乡市", "九江市", "新余市", "鹰潭市", "赣州市", "吉安市", "宜春市", "抚州市", "上饶市"],
    "广西壮族自治区": ["南宁市", "柳州市", "桂林市", "梧州市", "北海市", "防城港市", "钦州市", "贵港市", "玉林市", "百色市", "贺州市", "河池市", "来宾市", "崇左市"],
    "黑龙江省": ["哈尔滨市", "齐齐哈尔市", "鸡西市", "鹤岗市", "双鸭山市", "大庆市", "伊春市", "佳木斯市", "七台河市", "牡丹江市", "黑河市", "绥化市", "大兴安岭地区"],
    "吉林省": ["长春市", "吉林市", "四平市", "辽源市", "通化市", "白山市", "松原市", "白城市", "延边朝鲜族自治州"],
    "山西省": ["太原市", "大同市", "阳泉市", "长治市", "晋城市", "朔州市", "晋中市", "运城市", "忻州市", "临汾市", "吕梁市"],
    "内蒙古自治区": ["呼和浩特市", "包头市", "乌海市", "赤峰市", "通辽市", "鄂尔多斯市", "呼伦贝尔市", "巴彦淖尔市", "乌兰察布市", "兴安盟", "锡林郭勒盟", "阿拉善盟"],
    "贵州省": ["贵阳市", "六盘水市", "遵义市", "安顺市", "毕节市", "铜仁市", "黔西南布依族苗族自治州", "黔东南苗族侗族自治州", "黔南布依族苗族自治州"],
    "云南省": ["昆明市", "曲靖市", "玉溪市", "保山市", "昭通市", "丽江市", "普洱市", "临沧市", "楚雄彝族自治州", "红河哈尼族彝族自治州", "文山壮族苗族自治州", "西双版纳傣族自治州", "大理白族自治州", "德宏傣族景颇族自治州", "怒江傈僳族自治州", "迪庆藏族自治州"],
    "甘肃省": ["兰州市", "嘉峪关市", "金昌市", "白银市", "天水市", "武威市", "张掖市", "平凉市", "酒泉市", "庆阳市", "定西市", "陇南市", "临夏回族自治州", "甘南藏族自治州"],
    "海南省": ["海口市", "三亚市", "三沙市", "儋州市"],
    "宁夏回族自治区": ["银川市", "石嘴山市", "吴忠市", "固原市", "中卫市"],
    "青海省": ["西宁市", "海东市", "海北藏族自治州", "黄南藏族自治州", "海南藏族自治州", "果洛藏族自治州", "玉树藏族自治州", "海西蒙古族藏族自治州"],
    "新疆维吾尔自治区": ["乌鲁木齐市", "克拉玛依市", "吐鲁番市", "哈密市", "昌吉回族自治州", "博尔塔拉蒙古自治州", "巴音郭楞蒙古自治州", "阿克苏地区", "克孜勒苏柯尔克孜自治州", "喀什地区", "和田地区", "伊犁哈萨克自治州", "塔城地区", "阿勒泰地区"],
    "西藏自治区": ["拉萨市", "日喀则市", "昌都市", "林芝市", "山南市", "那曲市", "阿里地区"]
};

interface ClientManagerProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onUpdateClient?: (client: Client) => void;
  onAddContact: (clientId: string, contact: Contact) => void;
  onDeleteClient: (id: string) => void;
  currentUser: User;
}

const ClientManager: React.FC<ClientManagerProps> = ({ clients, onAddClient, onUpdateClient, onAddContact, onDeleteClient, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState<Client['type']>('Restaurant');

  // 地址级联选择状态
  const [addrProvince, setAddrProvince] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrDetail, setAddrDetail] = useState('');

  const [addingContactTo, setAddingContactTo] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  const canEdit = currentUser.role === 'Admin' || currentUser.permission === 'ReadWrite';
  const canDelete = currentUser.role === 'Admin';

  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.contacts.some(contact => contact.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportCSV = () => {
      const headers = ['单位名称', '地址', '类型', '联系人姓名', '职位', '电话', '邮箱'];
      const rows: string[] = [];
      clients.forEach(c => {
          if (c.contacts.length === 0) {
              rows.push([`"${c.companyName}"`, `"${c.address || ''}"`, c.type, '', '', '', ''].join(','));
          } else {
              c.contacts.forEach(cnt => {
                  rows.push([`"${c.companyName}"`, `"${c.address || ''}"`, c.type, `"${cnt.name}"`, `"${cnt.role || ''}"`, `"${cnt.phone || ''}"`, `"${cnt.email || ''}"`].join(','));
              });
          }
      });
      const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `客户通讯录_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          try {
              const lines = text.split(/\r\n|\n/);
              let importedCount = 0;
              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                  if (parts.length >= 1) {
                      const companyName = parts[0].replace(/^"|"$/g, '').trim();
                      if (!companyName) continue;
                      let client = clients.find(c => c.companyName === companyName);
                      if (!client) {
                          client = { id: Math.random().toString(36).substr(2, 9), companyName, address: parts[1]?.replace(/^"|"$/g, '') || '', type: (parts[2] as any) || 'Other', contacts: [], createdAt: new Date().toISOString() };
                          onAddClient(client);
                      }
                      const contactName = parts[3]?.replace(/^"|"$/g, '').trim();
                      if (contactName && !client.contacts.some(c => c.name === contactName)) {
                          onAddContact(client.id, { id: Math.random().toString(36).substr(2, 9), name: contactName, role: parts[4]?.replace(/^"|"$/g, '') || '', phone: parts[5]?.replace(/^"|"$/g, '') || '', email: parts[6]?.replace(/^"|"$/g, '') || '' });
                      }
                      importedCount++;
                  }
              }
              alert(`成功导入 ${importedCount} 条记录。`);
          } catch (err) { alert("导入失败"); }
          if (e.target) e.target.value = '';
      };
      reader.readAsText(file);
  };

  const handleAddClient = () => { 
    if (!newClientName) return alert("请输入单位名称"); 
    
    // 拼合完整地址
    const fullAddress = [addrProvince, addrCity, addrDistrict, addrDetail]
        .filter(part => !!part)
        .join(' ');

    onAddClient({ 
      id: Math.random().toString(36).substr(2, 9), 
      companyName: newClientName, 
      address: fullAddress, 
      type: newClientType, 
      contacts: [], 
      createdAt: new Date().toISOString() 
    }); 
    
    setShowAddModal(false); 
    setNewClientName(''); 
    setAddrProvince('');
    setAddrCity('');
    setAddrDistrict('');
    setAddrDetail('');
    setNewClientType('Restaurant');
  };

  const handleSaveContact = () => { 
    if (!addingContactTo || !newContactName) return; 
    onAddContact(addingContactTo, { id: Math.random().toString(36).substr(2, 9), name: newContactName, role: newContactRole, phone: newContactPhone, email: newContactEmail }); 
    setAddingContactTo(null); 
    setNewContactName(''); 
    setNewContactRole(''); 
    setNewContactPhone(''); 
    setNewContactEmail(''); 
  };

  const getClientTypeLabel = (type: Client['type']) => { 
    switch (type) { 
      case 'Hotel': return '酒店单位'; 
      case 'Restaurant': return '餐饮连锁'; 
      case 'Canteen': return '员工食堂'; 
      case 'Government': return '机关政企'; 
      case 'SchoolCanteen': return '学校食堂';
      case 'SOE': return '大型国企';
      case 'Private': return '民营企业';
      default: return '其他客户'; 
    } 
  };

  const getClientTypeStyle = (type: Client['type']) => {
    switch (type) {
      case 'Hotel': return 'bg-primary-50 text-primary-600 border-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-800';
      case 'Restaurant': return 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800';
      case 'Canteen': return 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800';
      case 'Government': return 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800';
      case 'SchoolCanteen': return 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800';
      case 'SOE': return 'bg-cyan-50 text-cyan-600 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800';
      case 'Private': return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';
      default: return 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div><h2 className="text-3xl font-bold text-slate-900 dark:text-white">客户管理</h2><p className="text-slate-500 dark:text-slate-400 mt-1">管理项目合作单位及通讯录</p></div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" /><input type="text" placeholder="搜索客户名称或联系人..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 outline-none transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <button onClick={handleExportCSV} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" title="导出 CSV"><Download className="w-4 h-4" /></button>
          {canEdit && (
            <>
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" title="导入 CSV"><Upload className="w-4 h-4" /></button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
            </>
          )}
          {canEdit && (
            <button onClick={() => setShowAddModal(true)} className="bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 flex items-center gap-2 shadow-sm whitespace-nowrap transition-all active:scale-95"><Plus className="w-4 h-4" /><span>新增单位</span></button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClients.map(client => (
            <div 
              key={client.id} 
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden group hover:shadow-2xl hover:scale-[1.02] hover:border-primary-600 hover:bg-primary-50/10 dark:hover:bg-primary-900/10 transition-all duration-300 relative active:scale-[0.98]"
            >
                {canDelete && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); if(window.confirm('确定删除该单位及其所有联系人吗？')) onDeleteClient(client.id); }}
                        className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded z-10 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                <div className="p-5 border-b dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30">
                    <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getClientTypeStyle(client.type)}`}>
                            {getClientTypeLabel(client.type)}
                        </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 pr-8 group-hover:text-primary-600 transition-colors">
                        <Building2 className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{client.companyName}</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 truncate">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {client.address || '暂无详细地址'}
                    </p>
                </div>
                <div className="p-4">
                    <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}>
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 group-hover:text-primary-600 transition-colors">
                            <Users className="w-4 h-4 text-slate-400" />
                            联系人信息 ({client.contacts.length})
                        </h4>
                        {expandedClient === client.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                    
                    {expandedClient === client.id ? (
                        <div className="space-y-3 mt-3 animate-in slide-in-from-top-2">
                            {client.contacts.length === 0 ? (
                                <p className="text-xs text-slate-400 italic text-center py-4">暂无联系人</p>
                            ) : (
                                client.contacts.map(contact => (
                                    <div key={contact.id} className="p-3 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700 text-xs shadow-sm hover:border-primary-600 transition-all hover:translate-x-1">
                                        <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                                            <span>{contact.name}</span>
                                            <span className="text-slate-400 font-normal">{contact.role}</span>
                                        </div>
                                        <div className="text-slate-500 dark:text-slate-400 flex items-center gap-4 mt-2">
                                            <span className="flex items-center gap-1 font-medium"><Phone className="w-3 h-3 text-primary-500" />{contact.phone}</span>
                                            {contact.email && <span className="flex items-center gap-1 font-medium"><Mail className="w-3 h-3 text-primary-500" />{contact.email}</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                            {canEdit && (
                                <button onClick={() => setAddingContactTo(client.id)} className="w-full py-2 text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-dashed border-primary-200 dark:border-primary-800 rounded-lg transition-all font-bold active:scale-95">
                                    + 添加新联系人
                                </button>
                            )}
                        </div>
                    ) : (
                        client.contacts.length > 0 && (
                            <div className="flex -space-x-2 mt-2">
                                {client.contacts.slice(0, 5).map((c, i) => (
                                    <div key={i} className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-primary-600 dark:text-primary-300 shadow-sm" title={c.name}>
                                        {c.name[0]}
                                    </div>
                                ))}
                                {client.contacts.length > 5 && (
                                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-50">+ {client.contacts.length - 5}</div>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">新增项目合作单位</h3>
                    <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">单位全称 *</label>
                        <input className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all" value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="例如：某某建设工程有限公司" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">单位类型</label>
                        <select 
                            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                            value={newClientType}
                            onChange={e => setNewClientType(e.target.value as any)}
                        >
                            <option value="Hotel">酒店单位</option>
                            <option value="Restaurant">餐饮连锁</option>
                            <option value="Canteen">员工食堂</option>
                            <option value="Government">机关政企</option>
                            <option value="SchoolCanteen">学校食堂</option>
                            <option value="SOE">大型国企</option>
                            <option value="Private">民营企业</option>
                            <option value="Other">其他类型</option>
                        </select>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 space-y-4">
                        <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                            <Map className="w-4 h-4 text-primary-500" />
                            办公/经营地址 (可选中国省市区)
                        </label>
                        
                        <div className="grid grid-cols-2 gap-3">
                            {/* 省份 */}
                            <select 
                                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                value={addrProvince}
                                onChange={e => { setAddrProvince(e.target.value); setAddrCity(''); setAddrDistrict(''); }}
                            >
                                <option value="">选择省份/直辖市</option>
                                {Object.keys(CHINA_REGION_DATA).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>

                            {/* 城市 */}
                            <select 
                                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all disabled:opacity-50"
                                value={addrCity}
                                disabled={!addrProvince}
                                onChange={e => setAddrCity(e.target.value)}
                            >
                                <option value="">选择城市</option>
                                {addrProvince && CHINA_REGION_DATA[addrProvince]?.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* 区县/详细 */}
                            <input 
                                className="md:col-span-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                placeholder="区/县名称"
                                value={addrDistrict}
                                onChange={e => setAddrDistrict(e.target.value)}
                            />
                            <input 
                                className="md:col-span-2 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                placeholder="详细地址 (街道、门牌号等)"
                                value={addrDetail}
                                onChange={e => setAddrDetail(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t dark:border-slate-700">
                    <button onClick={() => setShowAddModal(false)} className="px-6 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">取消</button>
                    <button onClick={handleAddClient} className="px-8 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg font-bold shadow-lg shadow-primary-500/20 transition-all active:scale-95">确认保存单位</button>
                </div>
            </div>
        </div>
      )}

      {addingContactTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <UserIcon className="w-5 h-5 text-primary-600" />
                        添加联系人
                    </h3>
                    <button onClick={() => setAddingContactTo(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">姓名 *</label>
                        <input className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all" placeholder="联系人姓名" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">职位</label>
                        <input className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all" placeholder="如：工程经理/厨师长" value={newContactRole} onChange={e => setNewContactRole(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">联系电话 *</label>
                        <input className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all font-mono" placeholder="手机号或座机" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">电子邮箱</label>
                        <input className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all font-mono" placeholder="email@example.com" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t dark:border-slate-700">
                    <button onClick={() => setAddingContactTo(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">取消</button>
                    <button onClick={handleSaveContact} className="px-6 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg font-bold shadow-lg shadow-primary-500/20 text-sm active:scale-95 transition-all">保存信息</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ClientManager;

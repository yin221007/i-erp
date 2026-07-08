
import { WorkflowNode, TaskStatus, Client, Equipment, Project, DocItem, ScheduleItem, ArchiveItem, ProjectProduction, User, AppSettings, PaymentRecord, ChatChannel, ChatMessage, UserPreferences } from './types';

// Unified File Size Limit (50GB)
export const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; 

// --- 严格北京时间助手 (Asia/Shanghai) ---
export const getBeijingDateString = () => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

export const formatBeijingTime = (isoString: string, options: Intl.DateTimeFormatOptions = {}) => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai', 
            hour12: false,
            ...options 
        });
    } catch (e) {
        return isoString;
    }
};

export const INITIAL_SETTINGS: AppSettings = {
  id: 'global_config',
  appName: 'i ERP',
  logoUrl: '', 
  logoWidth: 40,
  poweredByText: 'Powered by Yin'
};

export const INITIAL_USER_PREFS: UserPreferences = {
  enableBrowser: false, 
  sound: true,
  themeColor: 'blue',
  fontSize: 'medium',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
  numberFormat: {
    decimalPlaces: 2,
    useThousandsSeparator: true,
    currencySymbol: '¥'
  },
  weatherLocation: {
    mode: 'auto' 
  },
  types: {
      chat: true,
      approval: true,
      task: true,
      system: true
  }
};

// 全中国地级市坐标数据 (精简版本，包含所有省份及其主要城市)
export const CHINA_CITIES_DATA: Record<string, {name: string, lat: number, lon: number}[]> = {
  "北京市": [{ name: "北京", lat: 39.9042, lon: 116.4074 }],
  "上海市": [{ name: "上海", lat: 31.2304, lon: 121.4737 }],
  "天津市": [{ name: "天津", lat: 39.1255, lon: 117.1901 }],
  "重庆市": [{ name: "重庆", lat: 29.5637, lon: 106.5504 }],
  "广东省": [
    { name: "广州", lat: 23.1291, lon: 113.2644 }, { name: "深圳", lat: 22.5431, lon: 114.0579 }, 
    { name: "珠海", lat: 22.2707, lon: 113.5767 }, { name: "汕头", lat: 23.3540, lon: 116.6819 },
    { name: "佛山", lat: 23.0215, lon: 113.1214 }, { name: "韶关", lat: 24.8110, lon: 113.5975 },
    { name: "湛江", lat: 21.1913, lon: 110.3593 }, { name: "肇庆", lat: 23.0471, lon: 112.4651 },
    { name: "江门", lat: 22.5787, lon: 113.0819 }, { name: "茂名", lat: 21.6629, lon: 110.9254 },
    { name: "惠州", lat: 23.1118, lon: 114.4161 }, { name: "梅州", lat: 24.2884, lon: 116.1225 },
    { name: "汕尾", lat: 22.7872, lon: 115.3753 }, { name: "河源", lat: 23.7437, lon: 114.6978 },
    { name: "阳江", lat: 21.8592, lon: 111.9826 }, { name: "清远", lat: 23.6820, lon: 113.0560 },
    { name: "东莞", lat: 23.0205, lon: 113.7517 }, { name: "中山", lat: 22.5170, lon: 113.3927 },
    { name: "潮州", lat: 23.6569, lon: 116.6223 }, { name: "揭阳", lat: 23.5499, lon: 116.3728 }, { name: "云浮", lat: 22.9150, lon: 112.0444 }
  ],
  "浙江省": [
    { name: "杭州", lat: 30.2741, lon: 120.1551 }, { name: "宁波", lat: 29.8683, lon: 121.5439 },
    { name: "温州", lat: 27.9942, lon: 120.6993 }, { name: "嘉兴", lat: 30.7459, lon: 120.7554 },
    { name: "湖州", lat: 30.8943, lon: 120.0868 }, { name: "绍兴", lat: 29.9957, lon: 120.5861 },
    { name: "金华", lat: 29.0789, lon: 119.6471 }, { name: "衢州", lat: 28.9569, lon: 118.8594 },
    { name: "舟山", lat: 29.9855, lon: 122.2071 }, { name: "台州", lat: 28.6563, lon: 121.4207 }, { name: "丽水", lat: 28.4563, lon: 119.9227 }
  ],
  "江苏省": [
    { name: "南京", lat: 32.0603, lon: 118.7969 }, { name: "无锡", lat: 31.4911, lon: 120.3119 },
    { name: "徐州", lat: 34.2047, lon: 117.2841 }, { name: "常州", lat: 31.8111, lon: 119.9739 },
    { name: "苏州", lat: 31.2989, lon: 120.5853 }, { name: "南通", lat: 31.9801, lon: 120.8942 },
    { name: "连云港", lat: 34.5966, lon: 119.2216 }, { name: "淮安", lat: 33.6103, lon: 119.0153 },
    { name: "盐城", lat: 33.3473, lon: 120.1636 }, { name: "扬州", lat: 32.3942, lon: 119.4129 },
    { name: "镇江", lat: 32.1895, lon: 119.4258 }, { name: "泰州", lat: 32.4555, lon: 119.9231 }, { name: "宿迁", lat: 33.9630, lon: 118.2751 }
  ],
  "山东省": [
    { name: "济南", lat: 36.6512, lon: 117.1200 }, { name: "青岛", lat: 36.0671, lon: 120.3826 },
    { name: "淄博", lat: 36.8134, lon: 118.0550 }, { name: "枣庄", lat: 34.8105, lon: 117.3237 },
    { name: "东营", lat: 37.4347, lon: 118.4904 }, { name: "烟台", lat: 37.4638, lon: 121.4479 },
    { name: "潍坊", lat: 36.7066, lon: 119.1617 }, { name: "济宁", lat: 35.4150, lon: 116.5872 },
    { name: "泰安", lat: 36.1950, lon: 117.1199 }, { name: "威海", lat: 37.5133, lon: 122.1204 },
    { name: "日照", lat: 35.4162, lon: 119.5268 }, { name: "临沂", lat: 35.0606, lon: 118.3564 },
    { name: "德州", lat: 37.4340, lon: 116.3574 }, { name: "聊城", lat: 36.4566, lon: 115.9855 },
    { name: "滨州", lat: 37.3738, lon: 117.9707 }, { name: "菏泽", lat: 35.2337, lon: 115.4806 }
  ],
  "福建省": [
    { name: "福州", lat: 26.0745, lon: 119.2965 }, { name: "厦门", lat: 24.4798, lon: 118.0894 },
    { name: "莆田", lat: 25.4540, lon: 119.0076 }, { name: "三明", lat: 26.2634, lon: 117.6387 },
    { name: "泉州", lat: 24.8741, lon: 118.6756 }, { name: "漳州", lat: 24.5127, lon: 117.6472 },
    { name: "南平", lat: 26.6417, lon: 118.1777 }, { name: "龙岩", lat: 25.0741, lon: 117.0296 }, { name: "宁德", lat: 26.6657, lon: 119.5479 }
  ],
  "湖北省": [
    { name: "武汉", lat: 30.5928, lon: 114.3055 }, { name: "黄石", lat: 30.1996, lon: 115.0384 },
    { name: "十堰", lat: 32.6294, lon: 110.7981 }, { name: "宜昌", lat: 30.6985, lon: 111.2865 },
    { name: "襄阳", lat: 32.0082, lon: 112.1224 }, { name: "鄂州", lat: 30.3905, lon: 114.8905 },
    { name: "荆门", lat: 31.0354, lon: 112.1996 }, { name: "孝感", lat: 30.9178, lon: 113.9266 },
    { name: "荆州", lat: 30.3341, lon: 112.2415 }, { name: "黄冈", lat: 30.4542, lon: 114.8722 },
    { name: "咸宁", lat: 29.8415, lon: 114.3225 }, { name: "随州", lat: 31.7178, lon: 113.3793 }, { name: "恩施", lat: 30.2721, lon: 109.4868 }
  ],
  "湖南省": [
    { name: "长沙", lat: 28.2282, lon: 112.9388 }, { name: "株洲", lat: 27.8274, lon: 113.1328 },
    { name: "湘潭", lat: 27.8297, lon: 112.9440 }, { name: "衡阳", lat: 26.8938, lon: 112.5719 },
    { name: "邵阳", lat: 27.2400, lon: 111.4692 }, { name: "岳阳", lat: 29.3562, lon: 113.1292 },
    { name: "常德", lat: 29.0315, lon: 111.6985 }, { name: "张家界", lat: 29.1174, lon: 110.4792 },
    { name: "益阳", lat: 28.5539, lon: 112.3551 }, { name: "郴州", lat: 25.7705, lon: 113.0147 },
    { name: "永州", lat: 26.4354, lon: 111.6083 }, { name: "怀化", lat: 27.5494, lon: 109.9984 }, { name: "娄底", lat: 27.7020, lon: 111.9953 }
  ],
  "四川省": [
    { name: "成都", lat: 30.5728, lon: 104.0668 }, { name: "自贡", lat: 29.3392, lon: 104.7734 },
    { name: "攀枝花", lat: 26.5815, lon: 101.7175 }, { name: "泸州", lat: 28.8711, lon: 105.4419 },
    { name: "德阳", lat: 31.1270, lon: 104.3980 }, { name: "绵阳", lat: 31.4674, lon: 104.6791 },
    { name: "广元", lat: 32.4355, lon: 105.8437 }, { name: "遂宁", lat: 30.5361, lon: 105.5928 },
    { name: "内江", lat: 29.5802, lon: 105.0584 }, { name: "乐山", lat: 29.5521, lon: 103.7656 },
    { name: "南充", lat: 30.7951, lon: 106.0773 }, { name: "眉山", lat: 30.0754, lon: 103.8485 },
    { name: "宜宾", lat: 28.7516, lon: 104.6433 }, { name: "广安", lat: 30.4527, lon: 106.6334 },
    { name: "达州", lat: 31.2085, lon: 107.4677 }, { name: "雅安", lat: 29.9803, lon: 102.9976 },
    { name: "巴中", lat: 31.8590, lon: 106.7473 }, { name: "资阳", lat: 30.1221, lon: 104.6277 }, { name: "西昌", lat: 27.8814, lon: 102.2592 }
  ],
  "河北省": [
    { name: "石家庄", lat: 38.0422, lon: 114.5143 }, { name: "唐山", lat: 39.6308, lon: 118.1802 },
    { name: "秦皇岛", lat: 39.9354, lon: 119.5888 }, { name: "邯郸", lat: 36.6121, lon: 114.4935 },
    { name: "邢台", lat: 37.0676, lon: 114.5048 }, { name: "保定", lat: 38.8665, lon: 115.4645 },
    { name: "张家口", lat: 40.7714, lon: 114.8860 }, { name: "承德", lat: 40.9715, lon: 117.9391 },
    { name: "沧州", lat: 38.3045, lon: 116.8388 }, { name: "廊坊", lat: 39.5232, lon: 116.7036 }, { name: "衡水", lat: 37.7389, lon: 115.6702 }
  ],
  "河南省": [
    { name: "郑州", lat: 34.7466, lon: 113.6253 }, { name: "开封", lat: 34.7972, lon: 114.3075 },
    { name: "洛阳", lat: 34.6197, lon: 112.4540 }, { name: "平顶山", lat: 33.7352, lon: 113.3077 },
    { name: "安阳", lat: 36.1018, lon: 114.3908 }, { name: "鹤壁", lat: 35.7483, lon: 114.2954 },
    { name: "新乡", lat: 35.3030, lon: 113.8834 }, { name: "焦作", lat: 35.2159, lon: 113.2382 },
    { name: "濮阳", lat: 35.7602, lon: 115.0291 }, { name: "许昌", lat: 34.0354, lon: 113.8527 },
    { name: "漯河", lat: 33.5759, lon: 114.0163 }, { name: "三门峡", lat: 34.7745, lon: 111.2001 },
    { name: "南阳", lat: 32.9907, lon: 112.5283 }, { name: "商丘", lat: 34.4140, lon: 115.6563 },
    { name: "信阳", lat: 32.1264, lon: 114.0913 }, { name: "周口", lat: 33.6250, lon: 114.6495 }, { name: "驻马店", lat: 32.9811, lon: 114.0244 }
  ],
  "陕西省": [
    { name: "西安", lat: 34.3416, lon: 108.9398 }, { name: "铜川", lat: 34.8967, lon: 108.9452 },
    { name: "宝鸡", lat: 34.3620, lon: 107.2375 }, { name: "咸阳", lat: 34.3296, lon: 108.7089 },
    { name: "渭南", lat: 34.4998, lon: 109.5098 }, { name: "延安", lat: 36.5855, lon: 109.4897 },
    { name: "汉中", lat: 33.0716, lon: 107.0286 }, { name: "榆林", lat: 38.2852, lon: 109.7346 },
    { name: "安康", lat: 32.6853, lon: 109.0267 }, { name: "商洛", lat: 33.8683, lon: 109.9347 }
  ],
  "江西省": [
    { name: "南昌", lat: 28.6820, lon: 115.8579 }, { name: "景德镇", lat: 29.2690, lon: 117.1782 },
    { name: "萍乡", lat: 27.6224, lon: 113.8540 }, { name: "九江", lat: 29.7051, lon: 115.9922 },
    { name: "新余", lat: 27.8173, lon: 114.9168 }, { name: "鹰潭", lat: 28.2618, lon: 117.0682 },
    { name: "赣州", lat: 25.8310, lon: 114.9350 }, { name: "吉安", lat: 27.1137, lon: 114.9922 },
    { name: "宜春", lat: 27.8152, lon: 114.4168 }, { name: "抚州", lat: 27.9423, lon: 116.3582 }, { name: "上饶", lat: 28.4540, lon: 117.9431 }
  ],
  "广西": [
    { name: "南宁", lat: 22.8170, lon: 108.3665 }, { name: "柳州", lat: 24.3255, lon: 109.4159 },
    { name: "桂林", lat: 25.2736, lon: 110.2901 }, { name: "梧州", lat: 23.4770, lon: 111.2792 },
    { name: "北海", lat: 21.4812, lon: 109.1192 }, { name: "防城港", lat: 21.6874, lon: 108.3542 },
    { name: "钦州", lat: 21.9566, lon: 108.6542 }, { name: "贵港", lat: 23.0963, lon: 109.6022 },
    { name: "玉林", lat: 22.6366, lon: 110.1651 }, { name: "百色", lat: 23.8983, lon: 106.6172 },
    { name: "贺州", lat: 24.4035, lon: 111.5671 }, { name: "河池", lat: 24.6957, lon: 108.0622 },
    { name: "来宾", lat: 23.7347, lon: 109.2292 }, { name: "崇左", lat: 22.4042, lon: 107.3542 }
  ],
  "山西省": [
    { name: "太原", lat: 37.8735, lon: 112.5627 }, { name: "大同", lat: 40.0768, lon: 113.3001 },
    { name: "阳泉", lat: 37.8574, lon: 113.5833 }, { name: "长治", lat: 36.1954, lon: 113.1163 },
    { name: "晋城", lat: 35.4912, lon: 112.8512 }, { name: "朔州", lat: 39.3316, lon: 112.4333 },
    { name: "晋中", lat: 37.6906, lon: 112.7527 }, { name: "运城", lat: 35.0264, lon: 111.0069 },
    { name: "忻州", lat: 38.4166, lon: 112.7335 }, { name: "临汾", lat: 36.0841, lon: 111.5190 }, { name: "吕梁", lat: 37.5203, lon: 111.1352 }
  ],
  "内蒙古": [
    { name: "呼和浩特", lat: 40.8423, lon: 111.7510 }, { name: "包头", lat: 40.6573, lon: 110.0033 },
    { name: "乌海", lat: 39.6542, lon: 106.8255 }, { name: "赤峰", lat: 42.2573, lon: 118.8870 },
    { name: "通辽", lat: 43.6133, lon: 122.2431 }, { name: "鄂尔多斯", lat: 39.6083, lon: 109.7813 },
    { name: "呼伦贝尔", lat: 49.2111, lon: 119.7659 }, { name: "巴彦淖尔", lat: 40.7431, lon: 107.4168 }, { name: "乌兰察布", lat: 41.0341, lon: 113.1325 }
  ],
  "辽宁省": [
    { name: "沈阳", lat: 41.6772, lon: 123.4631 }, { name: "大连", lat: 38.9140, lon: 121.6147 },
    { name: "鞍山", lat: 41.1077, lon: 122.9947 }, { name: "抚顺", lat: 41.8808, lon: 123.9572 },
    { name: "本溪", lat: 41.2971, lon: 123.7663 }, { name: "丹东", lat: 40.1297, lon: 124.3853 },
    { name: "锦州", lat: 41.0950, lon: 121.1270 }, { name: "营口", lat: 40.6671, lon: 122.2351 },
    { name: "阜新", lat: 42.0190, lon: 121.6669 }, { name: "辽阳", lat: 41.2690, lon: 123.1731 },
    { name: "盘锦", lat: 41.1199, lon: 122.0703 }, { name: "铁岭", lat: 42.2238, lon: 123.8441 },
    { name: "朝阳", lat: 41.5735, lon: 120.4503 }, { name: "葫芦岛", lat: 40.7109, lon: 120.8369 }
  ],
  "吉林省": [
    { name: "长春", lat: 43.8171, lon: 125.3235 }, { name: "吉林市", lat: 43.8378, lon: 126.5495 },
    { name: "四平", lat: 43.1662, lon: 124.3604 }, { name: "辽源", lat: 42.8874, lon: 125.1433 },
    { name: "通化", lat: 41.7276, lon: 125.9372 }, { name: "白山", lat: 41.9371, lon: 126.4222 },
    { name: "松原", lat: 45.1417, lon: 124.8251 }, { name: "白城", lat: 45.6190, lon: 122.8384 },
    { name: "延吉", lat: 42.8911, lon: 129.5087 }
  ],
  "黑龙江省": [
    { name: "哈尔滨", lat: 45.8038, lon: 126.5350 }, { name: "齐齐哈尔", lat: 47.3477, lon: 123.9182 },
    { name: "鸡西", lat: 45.3000, lon: 130.9673 }, { name: "鹤岗", lat: 47.3077, lon: 130.2773 },
    { name: "双鸭山", lat: 46.6368, lon: 131.1573 }, { name: "大庆", lat: 46.5863, lon: 125.1127 },
    { name: "伊春", lat: 47.7272, lon: 128.8993 }, { name: "佳木斯", lat: 46.7997, lon: 130.3188 },
    { name: "七台河", lat: 45.7712, lon: 131.0155 }, { name: "牡丹江", lat: 44.5516, lon: 129.6331 },
    { name: "黑河", lat: 50.2450, lon: 127.5283 }, { name: "绥化", lat: 46.6373, lon: 126.9801 }, { name: "漠河", lat: 52.9712, lon: 122.5373 }
  ],
  "安徽省": [
    { name: "合肥", lat: 31.8206, lon: 117.2272 }, { name: "芜湖", lat: 31.3528, lon: 118.4329 },
    { name: "蚌埠", lat: 32.9164, lon: 117.3897 }, { name: "淮南", lat: 32.6254, lon: 116.9997 },
    { name: "马鞍山", lat: 31.6705, lon: 118.5064 }, { name: "淮北", lat: 33.9555, lon: 116.7914 },
    { name: "铜陵", lat: 30.9453, lon: 117.8115 }, { name: "安庆", lat: 30.5087, lon: 117.0588 },
    { name: "黄山", lat: 29.7147, lon: 118.3375 }, { name: "滁州", lat: 32.2455, lon: 118.3164 },
    { name: "阜阳", lat: 32.8901, lon: 115.8142 }, { name: "宿州", lat: 33.6361, lon: 116.9773 },
    { name: "六安", lat: 31.7525, lon: 116.5072 }, { name: "亳州", lat: 33.8447, lon: 115.7786 },
    { name: "池州", lat: 30.6560, lon: 117.4886 }, { name: "宣城", lat: 30.9407, lon: 118.7573 }
  ],
  "贵州省": [
    { name: "贵阳", lat: 26.5982, lon: 106.7072 }, { name: "六盘水", lat: 26.5910, lon: 104.8302 },
    { name: "遵义", lat: 27.7016, lon: 106.9272 }, { name: "安顺", lat: 26.2530, lon: 105.9462 },
    { name: "毕节", lat: 27.2845, lon: 105.2912 }, { name: "铜仁", lat: 27.7214, lon: 109.1896 },
    { name: "兴义", lat: 25.0931, lon: 104.8962 }, { name: "凯里", lat: 26.5761, lon: 107.9772 }, { name: "都匀", lat: 26.2562, lon: 107.5192 }
  ],
  "云南省": [
    { name: "昆明", lat: 24.8801, lon: 102.8329 }, { name: "曲靖", lat: 25.4839, lon: 103.7962 },
    { name: "玉溪", lat: 24.3510, lon: 102.5462 }, { name: "保山", lat: 25.1118, lon: 104.1162 },
    { name: "昭通", lat: 27.3364, lon: 103.7172 }, { name: "丽江", lat: 26.8550, lon: 100.2272 },
    { name: "普洱", lat: 22.7884, lon: 100.9662 }, { name: "临沧", lat: 23.8863, lon: 100.0862 },
    { name: "大理", lat: 25.6064, lon: 100.2672 }, { name: "景洪", lat: 21.9961, lon: 100.7972 }
  ],
  "甘肃省": [
    { name: "兰州", lat: 36.0611, lon: 103.8343 }, { name: "嘉峪关", lat: 39.7731, lon: 98.2891 },
    { name: "金昌", lat: 38.5200, lon: 102.1878 }, { name: "白银", lat: 36.5447, lon: 104.1736 },
    { name: "天水", lat: 34.5808, lon: 105.7249 }, { name: "武威", lat: 37.9290, lon: 102.6373 },
    { name: "张掖", lat: 38.9377, lon: 100.4554 }, { name: "平凉", lat: 35.5422, lon: 106.6651 },
    { name: "酒泉", lat: 39.7323, lon: 98.4944 }, { name: "庆阳", lat: 35.7088, lon: 107.6327 },
    { name: "定西", lat: 35.5806, lon: 104.6263 }, { name: "陇南", lat: 33.3958, lon: 104.9222 }
  ],
  "海南省": [
    { name: "海口", lat: 20.0173, lon: 110.3492 }, { name: "三亚", lat: 18.2524, lon: 109.5119 },
    { name: "三沙", lat: 16.8333, lon: 112.3333 }, { name: "儋州", lat: 19.5204, lon: 109.5772 }
  ],
  "宁夏": [
    { name: "银川", lat: 38.4871, lon: 106.2309 }, { name: "石嘴山", lat: 39.0133, lon: 106.3761 },
    { name: "吴忠", lat: 37.9902, lon: 106.1982 }, { name: "固原", lat: 36.0045, lon: 106.2851 }, { name: "中卫", lat: 37.5149, lon: 105.1882 }
  ],
  "青海省": [
    { name: "西宁", lat: 36.6231, lon: 101.7789 }, { name: "海东", lat: 36.5022, lon: 102.1032 },
    { name: "格尔木", lat: 36.4012, lon: 94.9032 }, { name: "玉树", lat: 33.0031, lon: 97.0032 }
  ],
  "新疆": [
    { name: "乌鲁木齐", lat: 43.8256, lon: 87.6168 }, { name: "克拉玛依", lat: 45.5732, lon: 84.8732 },
    { name: "吐鲁番", lat: 42.9463, lon: 89.1772 }, { name: "哈密", lat: 42.8270, lon: 93.5132 },
    { name: "昌吉", lat: 43.9931, lon: 87.3032 }, { name: "库尔勒", lat: 41.7231, lon: 86.1732 },
    { name: "阿克苏", lat: 41.1731, lon: 80.2632 }, { name: "喀什", lat: 39.4631, lon: 75.9932 },
    { name: "和田", lat: 37.1131, lon: 79.9232 }, { name: "石河子", lat: 44.3031, lon: 86.0332 }
  ],
  "西藏": [
    { name: "拉萨", lat: 29.6441, lon: 91.1145 }, { name: "日喀则", lat: 29.2662, lon: 88.8845 },
    { name: "昌都", lat: 31.1362, lon: 97.1745 }, { name: "林芝", lat: 29.6562, lon: 94.3645 }
  ],
};

// Flatten CHINA_CITIES_DATA to provide CHINA_CITIES for Header.tsx
export const CHINA_CITIES = Object.values(CHINA_CITIES_DATA).flat();

export const DEPARTMENTS = ['销售部', '设计部', '生产部', '仓储部', '采购部', '标书部', '财务部', '人事部', '工程部', '总经办', '售后部'];

export const RESTRICTED_MODULES = ['projects', 'production', 'payments', 'clients'];

export const ALLOWED_DEPARTMENTS_FOR_CORE = ['工程部', '销售部', '总经办', '财务部', '售后部', '设计部'];

// 厨房设备工程 23 个标准核心任务节点 (参考工程思维导图关键节点)
export const INITIAL_WORKFLOW: WorkflowNode[] = [
  // Phase 1: Pre-design & Handover
  { id: 'node-1', title: '和甲方去监管局审图', description: '配合甲方前往监管局进行图纸审核，确保符合当地卫生及消防要求。', phase: '前期对接 & 设计', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-2', title: '确定图纸清单', description: '最终确认施工图纸清单、版本号及分发表，防止错版施工。', phase: '前期对接 & 设计', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-3', title: '招标投标签订合同', description: '完成正式招投标流程，审核合同条款并完成双方签字盖章。', phase: '前期对接 & 设计', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-4', title: '和甲方对接确认时间需求', description: '落实甲方总进度计划，反推厨房工程关键节点。', phase: '前期对接 & 设计', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-5', title: '发现问题和设计沟通', description: '根据现场勘测反馈，汇总技术难点并组织设计变更。', phase: '前期对接 & 设计', status: TaskStatus.PENDING, attachments: [], memos: [] },

  // Phase 2: Production Preparation
  { id: 'node-6', title: '生产采购对接会', description: '内部交底会议，将设计清单转化为生产订单及委外采购计划。', phase: '生产准备', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-7', title: '和外协对接现场下生产单', description: '协调外协定制件（如不锈钢烟罩、异形水池）的现场实测下单。', phase: '生产准备', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-8', title: '工程例会提出注意事项', description: '参加甲方及总包工程例会，明确我方进场条件及施工红线。', phase: '生产准备', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-9', title: '和施工对接建立联系', description: '建立与水电、土建施工方的直接沟通，确认点位预留。', phase: '生产准备', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-10', title: '确定可生产设备下生产单', description: '标准设备（冰箱、炉灶等）下达正式生产指令。', phase: '生产准备', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },

  // Phase 3: Field Construction
  { id: 'node-11', title: '进入工地施工环节', description: '我方施工人员正式进场，进行初步放线。', phase: '进场施工', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-12', title: '土建水电施工配合', description: '现场核对点位偏差，配合土建封槽前确认水电高度。', phase: '进场施工', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-13', title: '排油烟管道施工先行', description: '优先抢占吊顶空间，完成大型风管及静电除油装置安装。', phase: '进场施工', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-14', title: '完工尺寸复核待定下单', description: '待装饰面完成后复核精装修尺寸，下达最后批次定制件。', phase: '进场施工', status: TaskStatus.PENDING, attachments: [], memos: [] },

  // Phase 4: Installation & Commissioning
  { id: 'node-15', title: '厨房设备进场安装', description: '组织大规模设备吊运及组装，完成定位并接驳水电。', phase: '安装调试', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-16', title: '工程量报验', description: '提交隐蔽工程及设备安装报验申请，交由监理审核。', phase: '安装调试', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-17', title: '设备进场材料报验', description: '汇总所有设备的合格证、质保书及不锈钢材质检测报告。', phase: '安装调试', status: TaskStatus.PENDING, attachments: [], memos: [] },

  // Phase 5: Acceptance & Delivery
  { id: 'node-18', title: '设备调试培训', description: '通电通水调试，组织厨师团队进行操作及日常维保培训。', phase: '验收交付', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
  { id: 'node-19', title: '设备签收验收', description: '正式签署竣工验收单，移交使用钥匙。', phase: '验收交付', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },

  // Phase 6: Closing & Settlement
  { id: 'node-20', title: '准备竣工材料', description: '整理竣工图、维保手册及最终设备清单手册。', phase: '结算收尾', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-21', title: '核算成本支出', description: '核算成本支出，完成施工队劳务费用清算。', phase: '结算收尾', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-22', title: '决算审计材料', description: '配合审计单位进行现场复核，提供决算偏差证明资料。', phase: '结算收尾', status: TaskStatus.PENDING, attachments: [], memos: [] },
  { id: 'node-23', title: '开票申请支付', description: '提交财务开票申请，跟进最终结算款项拨付进度。', phase: '结算收尾', status: TaskStatus.PENDING, attachments: [], memos: [], isKeyNode: true },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'p-1',
    name: '滨江万象城 2期 厨房工程',
    code: 'PJ-2023-088',
    clientName: '滨江万象城餐饮管理有限公司',
    manager: '李明',
    startDate: '2023-11-01',
    deadline: '2024-02-15',
    status: 'Active',
    progress: 15,
    nodes: JSON.parse(JSON.stringify(INITIAL_WORKFLOW)), 
    keyRisks: '排油烟管道：需提前确认土建预留孔',
    currentPhaseDeadline: '2024-01-15',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_USERS: User[] = [
  { 
    id: 'u-1', 
    nickname: 'admin', 
    password: 'password',
    department: '总经办', 
    role: 'Admin', 
    isDefaultAdmin: true,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
  }
];

export const INITIAL_CLIENTS: Client[] = [];
export const INITIAL_EQUIPMENT: Equipment[] = [];
export const INITIAL_DOCS: DocItem[] = [];
export const INITIAL_SCHEDULE: ScheduleItem[] = [];
export const INITIAL_ARCHIVES: ArchiveItem[] = [];
export const INITIAL_PRODUCTION: ProjectProduction[] = [];
export const INITIAL_PAYMENTS: PaymentRecord[] = [];
export const INITIAL_MESSAGES: ChatMessage[] = [];
export const INITIAL_CHANNELS: ChatChannel[] = [];

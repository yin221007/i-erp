
import React, { useState, useEffect } from 'react';
import { Bell, Menu, ChevronDown, LogOut, User as UserIcon, Sun, Moon, Clock, Settings, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, CloudSun, Wind, Droplets } from 'lucide-react';
import { User, AppSettings, Notification, UserPreferences } from '../types';
import { CHINA_CITIES } from '../constants';
import NotificationCenter from './NotificationCenter';

interface HeaderProps {
  onMenuToggle?: () => void;
  currentUser: User;
  allUsers: User[]; 
  onSwitchUser: (user: User) => void;
  settings?: AppSettings;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
  onLogout?: () => void;
  connectionStatus: 'connected' | 'offline' | 'connecting';
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onOpenUserPrefs?: () => void;
  userPrefs?: UserPreferences;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle, currentUser, allUsers, onSwitchUser, settings, notifications, onMarkAllRead, onDeleteNotification, onLogout, connectionStatus, theme, toggleTheme, onOpenUserPrefs, userPrefs }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [weather, setWeather] = useState<{ 
      temp: number, 
      city: string, 
      code: number,
      desc: string,
      humidity: number,
      wind: number 
  } | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getWeatherDesc = (code: number) => {
      if (code === 0) return '晴朗';
      if (code === 1) return '主要晴';
      if (code === 2) return '多云';
      if (code === 3) return '阴天';
      if (code >= 45 && code <= 48) return '雾';
      if (code >= 51 && code <= 55) return '毛毛雨';
      if (code >= 56 && code <= 57) return '冻雨';
      if (code >= 61 && code <= 65) return '小雨';
      if (code >= 66 && code <= 67) return '冰雨';
      if (code >= 71 && code <= 77) return '雪';
      if (code >= 80 && code <= 82) return '阵雨';
      if (code >= 85 && code <= 86) return '阵雪';
      if (code >= 95) return '雷雨';
      if (code >= 96 && code <= 99) return '雷暴';
      return '未知';
  };

  useEffect(() => {
      const controller = new AbortController();
      const fetchWeather = async () => {
          try {
              let lat: number, lon: number, cityName: string = '本地';
              if (userPrefs?.weatherLocation?.mode === 'manual') {
                  if (!userPrefs.weatherLocation.city) return;
                  const cityData = CHINA_CITIES.find(c => c.name === userPrefs.weatherLocation.city);
                  if (cityData) {
                      lat = cityData.lat;
                      lon = cityData.lon;
                      cityName = cityData.name;
                  } else {
                      throw new Error("Invalid manual city");
                  }
              } else if (userPrefs?.weatherLocation?.mode === 'custom') {
                  lat = userPrefs.weatherLocation.latitude || 30.0;
                  lon = userPrefs.weatherLocation.longitude || 120.0;
                  cityName = userPrefs.weatherLocation.city || '自定义点位';
              } else {
                  const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: controller.signal });
                  if (!geoRes.ok) throw new Error('Geo fetch failed');
                  const geoData = await geoRes.json();
                  lat = parseFloat(geoData.latitude);
                  lon = parseFloat(geoData.longitude);
                  cityName = geoData.city || '本地';
              }
              const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`, { signal: controller.signal });
              if (!weatherRes.ok) throw new Error('Weather fetch failed');
              const weatherData = await weatherRes.json();
              const current = weatherData.current;
              setWeather({
                  temp: Math.round(current.temperature_2m),
                  code: current.weather_code,
                  desc: getWeatherDesc(current.weather_code),
                  humidity: current.relative_humidity_2m,
                  wind: Math.round(current.wind_speed_10m),
                  city: cityName
              });
          } catch (e: any) {
              if (e.name !== 'AbortError') console.warn("Weather unavailable");
          }
      };
      fetchWeather();
      const interval = setInterval(fetchWeather, 30 * 60 * 1000);
      return () => {
          controller.abort();
          clearInterval(interval);
      };
  }, [userPrefs?.weatherLocation]);

  const formatTime = (date: Date) => {
    const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'narrow' };
    const timeOptions: Intl.DateTimeFormatOptions = { hour12: userPrefs?.timeFormat === '12h', hour: '2-digit', minute: '2-digit' };
    const dateStr = date.toLocaleDateString('zh-CN', dateOptions);
    const timeStr = date.toLocaleTimeString('zh-CN', timeOptions);
    return { dateStr, timeStr };
  };

  const getWeatherIcon = (code: number) => {
      if (code === 0) return <Sun className="w-5 h-5 text-orange-500" />;
      if (code >= 1 && code <= 3) return <CloudSun className="w-5 h-5 text-primary-400" />;
      if (code >= 45 && code <= 48) return <CloudFog className="w-5 h-5 text-slate-400" />;
      if (code >= 51 && code <= 55) return <CloudDrizzle className="w-5 h-5 text-primary-300" />;
      if (code >= 56 && code <= 67) return <CloudRain className="w-5 h-5 text-primary-500" />;
      if (code >= 71 && code <= 86) return <CloudSnow className="w-5 h-5 text-cyan-300" />;
      if (code >= 95) return <CloudLightning className="w-5 h-5 text-purple-500" />;
      return <Cloud className="w-5 h-5 text-slate-400" />;
  };

  const { dateStr, timeStr } = formatTime(currentTime);

  const handleLogoutClick = () => {
    setIsUserMenuOpen(false);
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-3 md:px-6 sticky top-0 z-30 transition-colors duration-300">
      <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1 md:flex-none">
        <button onClick={onMenuToggle} className="md:hidden p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"><Menu className="w-6 h-6" /></button>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {settings?.poweredByText && (<span className="hidden sm:block text-[10px] text-slate-400 dark:text-slate-500 font-medium italic tracking-wide truncate opacity-80 leading-none">{settings.poweredByText}</span>)}
        </div>
      </div>
      
      <div className="flex items-center space-x-1 md:space-x-4 flex-shrink-0">
        {weather && (
            <div className="hidden lg:flex flex-col items-end mr-2 border-r border-slate-200 dark:border-slate-700 pr-6 h-10 justify-center min-w-[100px]">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 leading-none mb-1.5">{getWeatherIcon(weather.code)}<span>{weather.temp}°C</span><span className="text-xs font-medium text-slate-500 dark:text-slate-400">{weather.desc}</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none"><span>{weather.city}</span><span title="湿度" className="flex items-center gap-0.5"><Droplets className="w-3 h-3 text-primary-400"/> {weather.humidity}%</span><span title="风速" className="flex items-center gap-0.5"><Wind className="w-3 h-3 text-slate-400"/> {weather.wind}km/h</span></div>
            </div>
        )}
        
        {weather && (
          <div className="lg:hidden flex items-center gap-1 px-2 border-r border-slate-100 dark:border-slate-800 mr-1">
             {getWeatherIcon(weather.code)}
             <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">{weather.temp}°</span>
          </div>
        )}

        <div className="hidden sm:flex flex-col items-end mr-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{dateStr}</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono leading-none mt-0.5">{timeStr}</div>
        </div>

        <div className={`flex items-center px-2 md:px-3 py-1 md:py-1.5 rounded-full border transition-all duration-300 ${
            connectionStatus === 'connected' ? 'bg-blue-50/80 border-blue-100 dark:bg-emerald-900/20 dark:border-emerald-800/50' :
            connectionStatus === 'offline' ? 'bg-red-50 border-red-100 dark:bg-red-900/20' : 
            'bg-slate-50 border-slate-200 animate-pulse'
        }`}>
            <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full mr-1.5 md:mr-2 transition-all duration-500 ${
                connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
                connectionStatus === 'offline' ? 'bg-red-500' : 
                'bg-amber-400'
            }`} />
            <span className={`text-[10px] md:text-xs font-bold ${
                connectionStatus === 'connected' ? 'text-slate-700 dark:text-emerald-400' :
                connectionStatus === 'offline' ? 'text-red-600' : 'text-slate-500'
            }`}>
                {connectionStatus === 'connected' ? (window.innerWidth < 768 ? '在线' : '已连接') : connectionStatus === 'offline' ? '离线' : '连接中'}
            </span>
        </div>
        
        <button onClick={toggleTheme} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400" title="主题">{theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}</button>
        
        <div className="relative">
          <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative"><Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />{unreadCount > 0 && (<span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center border border-white dark:border-slate-900">{unreadCount > 9 ? '9+' : unreadCount}</span>)}</button>
          <NotificationCenter isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} notifications={notifications} onMarkAllRead={onMarkAllRead} onDelete={onDeleteNotification} currentUser={currentUser}/>
        </div>

        <div className="relative border-l border-slate-200 dark:border-slate-700 pl-2 md:pl-4">
          <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center space-x-1 hover:bg-slate-50 dark:hover:bg-slate-800 p-0.5 rounded-lg transition-colors"><div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden border border-slate-200 dark:border-slate-600"><img src={currentUser.avatar} alt="avatar" className="w-full h-full object-cover" /></div><ChevronDown className="w-3.5 h-3.5 text-slate-400" /></button>
          {isUserMenuOpen && (<div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-2 z-50 animate-in slide-in-from-top-2"><div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 mb-2"><p className="text-[10px] font-bold text-slate-400 uppercase">当前用户</p><div className="flex items-center gap-2 mt-1.5"><div className="w-7 h-7 rounded-full bg-primary-100 overflow-hidden"><img src={currentUser.avatar} className="w-full h-full object-cover" /></div><div><p className="text-xs font-bold text-slate-800 dark:text-white">{currentUser.nickname}</p><p className="text-[10px] text-slate-500">{currentUser.department}</p></div></div></div><div className="px-1"><button onClick={() => { if (onOpenUserPrefs) onOpenUserPrefs(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm"><Settings className="w-4 h-4" /> 偏好设置</button></div><div className="border-t border-slate-100 dark:border-slate-700 mt-2 pt-1 px-1"><button onClick={handleLogoutClick} className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-sm"><LogOut className="w-4 h-4" /> 退出登录</button></div></div>)}
        </div>
      </div>
    </header>
  );
};

export default Header;

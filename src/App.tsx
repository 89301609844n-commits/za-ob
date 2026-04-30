import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  LayoutDashboard, 
  Send,
  MessageSquare,
  BarChart3,
  Mail,
  Loader2,
  CheckCircle,
  Sparkles,
  Settings,
  Lock,
  Eye,
  EyeOff,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Appeal, AppealStatus, AnalysisResult } from './types.ts';
import { analyzeAppeal } from './geminiService.ts';

// Mock initial data
const INITIAL_APPEALS: Appeal[] = [
  {
    id: '1',
    senderName: 'Иван Петров',
    senderEmail: 'ivan@example.com',
    subject: 'Проблемы с освещением в парке',
    content: 'Вчера вечером гулял в парке Юбилейный, освещение на центральной аллее полностью отсутствует. Очень темно и небезопасно. Прошу разобраться.',
    receivedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: AppealStatus.NEW,
    priority: 'MEDIUM'
  },
  {
    id: '2',
    senderName: 'Мария Сидорова',
    senderEmail: 'maria@example.com',
    subject: 'Запись в детский сад №45',
    content: 'Здравствуйте, не могу подать заявление в детский сад через госуслуги. Пишет ошибку сервера. Есть ли другие способы подачи документов?',
    receivedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    status: AppealStatus.NEW,
    priority: 'HIGH'
  }
];

export default function App() {
  const [appeals, setAppeals] = useState<Appeal[]>(INITIAL_APPEALS);
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'stats' | 'settings'>('inbox');

  // Settings State
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [emailConfig, setEmailConfig] = useState({
    host: localStorage.getItem('email_host') || 'imap.gmail.com',
    port: localStorage.getItem('email_port') || '993',
    user: localStorage.getItem('email_user') || '',
    pass: localStorage.getItem('email_pass') || '',
    secure: localStorage.getItem('email_secure') === 'false' ? false : true
  });
  const [showPassword, setShowPassword] = useState(false);

  const selectedAppeal = useMemo(() => 
    appeals.find(a => a.id === selectedAppealId), 
    [appeals, selectedAppealId]
  );

  const filteredAppeals = useMemo(() => 
    appeals.filter(a => 
      a.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.category && a.category.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
    [appeals, searchTerm]
  );

  const handleSyncEmails = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailConfig)
      });

      if (response.status === 404) {
        alert("ОШИБКА 404: Сервер не найден.\n\nВозможные причины:\n1. Вы открыли сайт через GitHub Pages (он не поддерживает бэкенд).\n2. Бэкенд еще не запустился.\n\nДля работы почты используйте превью AI Studio или разверните проект на платформе с поддержкой Node.js (например, Render или Railway).");
        return;
      }

      const data = await response.json();
      
      if (data.error) {
        alert("ВНИМАНИЕ:\n" + (data.message || 'Ошибка синхронизации'));
        return;
      }

      const totalFromServer = data.length || 0;
      console.log(`Sync: Received ${totalFromServer} emails from server.`);

      if (totalFromServer === 0) {
        alert("Писем не найдено. На сервере в папке 'Входящие' чисто.");
        return;
      }

      // Merge unique emails by their ID
      setAppeals(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newEmails = data.filter((email: Appeal) => !existingIds.has(email.id));
        
        if (newEmails.length === 0) {
          alert(`Проверка завершена.\nНайдено сообщений: ${totalFromServer}.\nНовых для системы: 0.`);
          return prev;
        }
        
        alert(`СИНХРОНИЗАЦИЯ УСПЕШНА!\nВсего писем: ${totalFromServer}\nДобавлено новых: ${newEmails.length}`);
        return [...newEmails, ...prev];
      });
    } catch (error) {
      console.error('Sync Error:', error);
      alert('Не удалось подключиться к серверу. Проверьте интернет или конфигурацию.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAnalyze = async (appeal: Appeal) => {
    if (appeal.status === AppealStatus.ANALYZED || appeal.status === AppealStatus.REPLIED) return;
    
    setIsAnalyzing(true);
    try {
      const result: AnalysisResult = await analyzeAppeal(appeal.content);
      setAppeals(prev => prev.map(a => 
        a.id === appeal.id 
          ? { ...a, ...result, status: AppealStatus.ANALYZED } 
          : a
      ));
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeAll = async () => {
    const unanalyzed = appeals.filter(a => a.status === AppealStatus.NEW);
    if (unanalyzed.length === 0) {
      alert("Нет новых сообщений для категоризации.");
      return;
    }

    setIsSyncing(true);
    let count = 0;
    
    for (const appeal of unanalyzed) {
      try {
        const result = await analyzeAppeal(appeal.content);
        setAppeals(prev => prev.map(a => 
          a.id === appeal.id 
            ? { ...a, ...result, status: AppealStatus.ANALYZED } 
            : a
        ));
        count++;
      } catch (err) {
        console.error("Analysis skip for id:", appeal.id);
      }
    }
    
    setIsSyncing(false);
    alert(`Автоматическая категоризация завершена. Обработано сообщений: ${count}`);
  };

  const handleSendResponse = (appealId: string) => {
    setAppeals(prev => prev.map(a => 
      a.id === appealId ? { ...a, status: AppealStatus.REPLIED } : a
    ));
    setSelectedAppealId(null);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('email_host', emailConfig.host);
    localStorage.setItem('email_port', emailConfig.port);
    localStorage.setItem('email_user', emailConfig.user);
    localStorage.setItem('email_pass', emailConfig.pass);
    localStorage.setItem('email_secure', String(emailConfig.secure));
    alert('Настройки успешно сохранены в браузере!');
  };

  const unlockSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') {
      setIsSettingsUnlocked(true);
    } else {
      alert('Неверный пароль администратора!');
    }
  };

  return (
    <div className="flex h-screen bg-[#F9FAFB] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-[#111827] font-bold text-lg tracking-tight">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            CitizenConnect
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('inbox')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'inbox' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Рабочий стол
          </button>
          <button 
            onClick={() => setActiveTab('inbox')}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Inbox className="w-4 h-4" />
            Все обращения
            <span className="ml-auto bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-[10px] font-bold">
              {appeals.filter(a => a.status === AppealStatus.NEW).length}
            </span>
          </button>
          <button 
             onClick={() => setActiveTab('stats')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'stats' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <BarChart3 className="w-4 h-4" />
            Аналитика
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 mb-4">
          <button 
            onClick={() => {
              setActiveTab('settings');
              setIsSettingsUnlocked(false);
              setAdminPassword('');
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-4 h-4" />
            Настройки
          </button>
        </div>

        <div className="p-4 mt-auto border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              AD
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-900">Администратор</span>
              <span className="text-[10px] text-gray-500">Система обработки</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'settings' ? (
          <div className="flex-1 overflow-auto p-8 bg-gray-50">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-600" />
                Настройки системы
              </h1>

              {!isSettingsUnlocked ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-8 rounded-xl shadow-sm border border-gray-200"
                >
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-blue-50 rounded-full">
                      <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">Доступ ограничен</h2>
                      <p className="text-gray-500 mt-1 uppercase text-xs tracking-widest font-bold">Введите пароль администратора</p>
                    </div>
                    <form onSubmit={unlockSettings} className="w-full max-w-sm space-y-4 pt-4">
                      <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-center text-lg tracking-widest"
                        autoFocus
                      />
                      <button 
                        type="submit"
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        Войти
                      </button>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6">Конфигурация Почты (IMAP)</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">IMAP Сервер</label>
                        <input 
                          type="text" 
                          value={emailConfig.host}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, host: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="imap.gmail.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700">Порт</label>
                        <input 
                          type="text" 
                          value={emailConfig.port}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, port: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="993"
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <label className="text-xs font-bold text-gray-700">Email Пользователь</label>
                        <input 
                          type="email" 
                          value={emailConfig.user}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, user: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="example@gmail.com"
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <label className="text-xs font-bold text-gray-700">Пароль приложения</label>
                        <div className="relative">
                          <input 
                            type={showPassword ? "text" : "password"}
                            value={emailConfig.pass}
                            onChange={(e) => setEmailConfig(prev => ({ ...prev, pass: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            placeholder="••••••••••••••••"
                          />
                          <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">
                          Для Gmail используйте 16-значный <strong>"Пароль приложения"</strong>. 
                          Обычный пароль от почты не подойдет из-за политики безопасности Google.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id="secure"
                          checked={emailConfig.secure}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, secure: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="secure" className="text-xs font-medium text-gray-700">Безопасное соединение (SSL/TLS)</label>
                      </div>
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                      <button 
                        onClick={handleSaveSettings}
                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-shadow shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Сохранить настройки
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 text-amber-800">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Важное уведомление</p>
                      <p className="text-xs mt-1 opacity-90">Настройки сохраняются только локально в этом браузере. При переходе в другой браузер их нужно будет ввести снова.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        ) : activeTab === 'stats' ? (
          <div className="flex-1 overflow-auto p-12 space-y-8 bg-gray-50">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Аналитика обращений</h1>
            
            <div className="grid grid-cols-4 gap-6">
              <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Всего</p>
                <p className="text-3xl font-bold text-gray-900">{appeals.length}</p>
              </div>
              <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Новые</p>
                <p className="text-3xl font-bold text-blue-600">{appeals.filter(a => a.status === AppealStatus.NEW).length}</p>
              </div>
              <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">В работе</p>
                <p className="text-3xl font-bold text-amber-600">{appeals.filter(a => a.status === AppealStatus.ANALYZED).length}</p>
              </div>
              <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Отвечено</p>
                <p className="text-3xl font-bold text-emerald-600">{appeals.filter(a => a.status === AppealStatus.REPLIED).length}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm min-h-[300px] flex flex-col justify-center items-center gap-4">
                <BarChart3 className="w-12 h-12 text-gray-200" />
                <p className="text-sm text-gray-400">График по тематикам (В разработке)</p>
              </div>
              <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm min-h-[300px] flex flex-col justify-center items-center gap-4">
                <Clock className="w-12 h-12 text-gray-200" />
                <p className="text-sm text-gray-400">Время обработки (В разработке)</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header / Search */}
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0">
              <div className="flex items-center gap-4 flex-1 max-w-lg">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Поиск по обращениям..." 
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleAnalyzeAll}
                  disabled={isSyncing || isAnalyzing || appeals.filter(a => a.status === AppealStatus.NEW).length === 0}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Авто-категоризация
                </button>
                <button 
                  onClick={handleSyncEmails}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  <Mail className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                  {isSyncing ? 'Синхронизация...' : 'Проверить почту'}
                </button>
                <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Filter className="w-4 h-4" />
                  Фильтры
                </button>
              </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* List */}
              <div className="flex-1 overflow-y-auto border-right border-gray-200">
                <div className="grid grid-cols-[1fr] w-full">
                  <div className="flex bg-gray-50 border-b border-gray-200 shrink-0 sticky top-0 z-10">
                    <div className="col-header flex-[2]">Обращение / Отправитель</div>
                    <div className="col-header flex-1">Тема</div>
                    <div className="col-header w-32 text-center">Приоритет</div>
                    <div className="col-header w-32 text-center">Статус</div>
                  </div>
                  
                  {filteredAppeals.map((appeal) => (
                    <motion.div 
                      key={appeal.id}
                      layoutId={`appeal-${appeal.id}`}
                      onClick={() => setSelectedAppealId(appeal.id)}
                      className={`data-row flex items-center min-h-[72px] ${selectedAppealId === appeal.id ? 'bg-blue-50/50 border-l-4 border-blue-600' : ''}`}
                    >
                      <div className="flex-[2] px-6 py-4 flex flex-col gap-0.5 overflow-hidden">
                        <span className="font-semibold text-sm text-gray-900 truncate">{appeal.senderName}</span>
                        <span className="text-xs text-gray-500 truncate">{appeal.senderEmail}</span>
                      </div>
                      <div className="flex-1 px-6 py-4 flex flex-col gap-0.5 overflow-hidden">
                        <span className="text-sm font-medium text-gray-700 truncate">{appeal.subject}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {new Date(appeal.receivedAt).toLocaleDateString('ru-RU')}
                          </span>
                          {appeal.category && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase tracking-wider">
                              {appeal.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-32 px-6 py-4 flex items-center justify-center">
                        <span className={`priority-${appeal.priority?.toLowerCase() || 'medium'}`}>
                          {appeal.priority === 'HIGH' ? 'Срочно' : appeal.priority === 'MEDIUM' ? 'Средний' : 'План'}
                        </span>
                      </div>
                      <div className="w-32 px-6 py-4 flex items-center justify-center">
                        {appeal.status === AppealStatus.NEW ? (
                           <div className="flex items-center gap-1.5 text-blue-600 text-[11px] font-bold">
                             <Clock className="w-3 h-3" />
                             Новое
                           </div>
                        ) : appeal.status === AppealStatus.ANALYZED ? (
                          <div className="flex items-center gap-1.5 text-amber-600 text-[11px] font-bold">
                            <AlertCircle className="w-3 h-3" />
                            Анализ
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            Ответ
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  
                  {filteredAppeals.length === 0 && (
                    <div className="p-20 text-center flex flex-col items-center justify-center gap-4 text-gray-400">
                      <Inbox className="w-12 h-12 opacity-20" />
                      <p className="text-sm">Обращений не найдено</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Detail View */}
              <AnimatePresence mode="wait">
                {selectedAppeal ? (
                  <motion.div 
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="w-[480px] bg-white border-l border-gray-200 overflow-y-auto flex flex-col shadow-2xl relative z-20"
                  >
                    <div className="p-6 border-b border-gray-100 shrink-0 flex items-center justify-between">
                      <h2 className="text-lg font-bold text-gray-900 tracking-tight">Детали обращения</h2>
                      <button 
                        onClick={() => setSelectedAppealId(null)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    <div className="p-8 space-y-8">
                      {/* Meta */}
                      <section className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Отправитель</p>
                            <p className="text-base font-semibold text-gray-900">{selectedAppeal.senderName}</p>
                            <p className="text-sm text-gray-500">{selectedAppeal.senderEmail}</p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Дата</p>
                            <p className="text-sm font-medium text-gray-700">
                              {new Date(selectedAppeal.receivedAt).toLocaleString('ru-RU')}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 italic text-sm text-gray-700 leading-relaxed">
                          "{selectedAppeal.content}"
                        </div>
                      </section>

                      {/* AI Analysis */}
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-blue-600" />
                            AI Анализ & Категоризация
                          </h3>
                          {selectedAppeal.status === AppealStatus.NEW && (
                            <button 
                              onClick={() => handleAnalyze(selectedAppeal)}
                              disabled={isAnalyzing}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin"/> : null}
                              Анализировать
                            </button>
                          )}
                        </div>

                        {selectedAppeal.status !== AppealStatus.NEW ? (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                            <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                                <p className="text-indigo-400 text-[9px] uppercase font-bold mb-1">Тематика</p>
                                <span className="text-indigo-900">{selectedAppeal.category || 'В обработке...'}</span>
                              </div>
                              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <p className="text-emerald-400 text-[9px] uppercase font-bold mb-1">Срочность</p>
                                <span className="text-emerald-900">{selectedAppeal.priority || 'Определяется...'}</span>
                              </div>
                            </div>
                            
                            <div className="p-4 bg-gray-50 rounded-xl text-sm leading-relaxed text-gray-700">
                              <p className="text-[10px] uppercase font-bold text-gray-400 mb-2">Краткое резюме</p>
                              {selectedAppeal.summary}
                            </div>

                            {selectedAppeal.suggestedResponse && (
                              <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                  <Send className="w-4 h-4 text-emerald-600" />
                                  Предварительный ответ
                                </h3>
                                <div className="p-4 bg-blue-50/50 rounded-xl text-sm leading-relaxed text-blue-900 whitespace-pre-wrap border border-blue-100">
                                  {selectedAppeal.suggestedResponse}
                                </div>
                                <button 
                                  onClick={() => handleSendResponse(selectedAppeal.id)}
                                  className="w-full py-3 bg-[#111827] text-white rounded-xl text-sm font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                                >
                                  {selectedAppeal.status === AppealStatus.REPLIED ? (
                                    <>
                                      <CheckCircle className="w-4 h-4" />
                                      Отправлено
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-4 h-4" />
                                      Отправить ответ гражданину
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <div className="p-12 text-center border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center gap-3">
                            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-gray-300" />
                            </div>
                            <p className="text-xs text-gray-400 font-medium max-w-[200px]">
                              Нажмите "Анализировать", чтобы AI определил тематику и подготовил ответ
                            </p>
                          </div>
                        )}
                      </section>
                    </div>
                  </motion.div>
                ) : (
                  <div className="w-[480px] bg-white border-l border-gray-100 flex flex-col items-center justify-center p-12 text-center animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                      <Inbox className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">Выберите обращение</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Выберите письмо из списка слева для просмотра деталей, анализа тематики и подготовки официального ответа.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
